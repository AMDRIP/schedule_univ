import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fork } from 'node:child_process';
import { createProjectStorage, projectPath } from '../integrations/projectStorage.cjs';
import { parseProject } from '../integrations/projectValidation.cjs';
import { trustedSender, externalURL, protectWindow } from '../integrations/desktopSecurity.cjs';
import { escapeHtml } from '../utils/html';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';
import { readTabularImport } from '../services/tabularImport';
const content = (id: string) => JSON.stringify({ schemaVersion: 4, schedule: [{ id }], groups: [], settings: {} });
const temporary = async (t: any) => { const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'univ-storage-')); t.after(() => fs.rm(folder, { recursive: true, force: true })); return folder; };

test('project writes are atomic, serialized, rotated and restorable without losing the current version', async t => {
    const folder = await temporary(t), filename = path.join(folder, 'Проект.schd'), store = createProjectStorage({ keep: 3 });
    await store.save(filename, content('original')); await store.open(filename);
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map(id => store.save(filename, content(id))));
    assert.equal((await store.open(filename)).data, content('e'));
    const copies = await store.list(filename); assert.equal(copies.length, 3); assert.ok(copies.every(item => item.valid));
    const restored = await store.restore(filename, copies.at(-1).id); assert.notEqual(restored.data, content('e'));
    const after = await store.list(filename); const values = await Promise.all(after.map(item => fs.readFile(path.join(filename + '.backups', item.id), 'utf8')));
    assert.ok(values.includes(content('e'))); assert.equal(after.length, 3); assert.equal((await fs.readdir(folder)).filter(item => item.endsWith('.tmp')).length, 0);
});

test('identical saves create no redundant backup and external modifications are not overwritten', async t => {
    const filename = path.join(await temporary(t), 'project.schd'), store = createProjectStorage();
    await store.save(filename, content('original')); await store.save(filename, content('original')); assert.equal((await store.list(filename)).length, 0);
    await fs.writeFile(filename, content('external'));
    await assert.rejects(store.save(filename, content('changed')), /другой программой/); assert.equal(await fs.readFile(filename, 'utf8'), content('external'));
});

test('failed atomic replacement preserves original and cleans temporary file', async t => {
    const folder = await temporary(t), filename = path.join(folder, 'project.schd'); await fs.writeFile(filename, content('original'));
    const store = createProjectStorage({ io: { ...fs, rename: async (from, to) => { if (to === filename) throw Object.assign(new Error('disk failure'), { code: 'EIO' }); return fs.rename(from, to); } } });
    await assert.rejects(store.save(filename, content('changed')), /disk failure/);
    assert.equal(await fs.readFile(filename, 'utf8'), content('original')); assert.equal((await store.list(filename)).length, 1);
    assert.equal((await fs.readdir(folder)).filter(item => item.endsWith('.tmp')).length, 0);
});

test('failed fsync and required backup abort without touching original', async t => {
    const folder = await temporary(t), filename = path.join(folder, 'project.schd'); await fs.writeFile(filename, content('original'));
    const full = createProjectStorage({ io: { ...fs, mkdir: async () => { throw new Error('backup denied'); } } });
    await assert.rejects(full.save(filename, content('changed')), /backup denied/);
    const broken = createProjectStorage({ io: { ...fs, open: async (...args) => { const handle = await fs.open(...args); handle.sync = async () => { throw new Error('sync failure'); }; return handle; } } });
    await assert.rejects(broken.save(filename, content('changed')), /sync failure/);
    assert.equal(await fs.readFile(filename, 'utf8'), content('original'));
});

test('a killed process before rename leaves the complete previous project readable', async t => {
    const filename = path.join(await temporary(t), 'project.schd'); await fs.writeFile(filename, content('original'));
    const child = fork(path.resolve('tests/atomicCrash.cjs'), [filename], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    t.after(() => child.kill());
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => { child.kill(); reject(new Error('Crash fixture timed out')); }, 10000); child.once('message', () => { clearTimeout(timer); resolve(); }); child.once('error', reject); });
    await new Promise<void>(resolve => { child.once('exit', () => resolve()); child.kill('SIGKILL'); });
    assert.equal((await createProjectStorage().open(filename)).data, content('original'));
});

test('corrupt backups are visible but cannot replace a valid project; paths cannot escape the backup directory', async t => {
    const filename = path.join(await temporary(t), 'project.schd'), store = createProjectStorage();
    await fs.writeFile(filename, 'corrupt'); await store.save(filename, content('good'), { force: true });
    const copies = await store.list(filename); assert.equal(copies[0].valid, false);
    await assert.rejects(store.restore(filename, copies[0].id), /JSON/);
    assert.throws(() => store.restore(filename, '../other.schd'), /копия/);
    assert.equal((await store.open(filename)).data, content('good'));
    assert.throws(() => projectPath(path.join(path.dirname(filename), 'file.txt')), /schd/);
});

test('project validation preserves legacy files and rejects unsafe keys, malformed collections and newer schemas', () => {
    assert.deepEqual(parseProject('{"schedule":[]}'), { schedule: [] });
    for (const text of ['{}', '[]', '{"schedule":"bad"}', '{"schedule":[null]}', '{"schedule":[],"schemaVersion":99}', '{"schedule":[],"__proto__":{"polluted":true}}', '{"schedule":[],"settings":{"constructor":{}}}']) assert.throws(() => parseProject(text));
    assert.equal(({} as any).polluted, undefined);
});

test('IPC trust requires the main frame AND its exact local document URL', () => {
    const entry = path.resolve('index.html'), content = { mainFrame: { url: pathToFileURL(entry).href } }, window = { webContents: content };
    assert.equal(trustedSender(window, { sender: content, senderFrame: content.mainFrame }, entry), true);
    for (const url of ['https://evil.example', 'about:blank', pathToFileURL(path.resolve('other.html')).href]) { content.mainFrame.url = url; assert.equal(trustedSender(window, { sender: content, senderFrame: content.mainFrame }, entry), false); }
    assert.equal(trustedSender(window, { sender: {}, senderFrame: content.mainFrame }, entry), false);
});

test('updated SheetJS preserves XLSX and CSV imports, mappings and nested values while rejecting dangerous columns', async () => {
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ id: 'teacher', ФИО: 'Иванов Иван', specialtyIds: '["specialty"]' }]), 'teachers');
    const bytes = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
    const imported = await readTabularImport(new File([bytes], 'data.xlsx'), { columnMappings: 'ФИО=name' });
    assert.deepEqual(imported.teachers, [{ id: 'teacher', name: 'Иванов Иван', specialtyIds: ['specialty'] }]);
    const csv = await readTabularImport(new File(['id;number\ng;ПМИ25о1'], 'groups.csv'), { csvDelimiter: ';' });
    assert.equal((csv.groups[0] as any).number, 'ПМИ25о1');
    await assert.rejects(readTabularImport(new File(['id,name\na,Иванов'], 'teachers.csv'), { columnMappings: 'name=__proto__' }), /Небезопасное/);
});

test('external links reject dangerous protocols and print windows never inherit privileged preferences', () => {
    for (const url of ['javascript:alert(1)', 'file:///C:/Windows', 'http://evil.example', 'https://name:secret@evil.example', 'data:text/html,bad']) assert.equal(externalURL(url), null);
    assert.equal(externalURL('https://example.org/help'), 'https://example.org/help');
    let open; const handlers = new Map(); const content = { on: (name, handler) => handlers.set(name, handler), setWindowOpenHandler: handler => { open = handler; } };
    protectWindow({ webContents: content }, { openExternal: async () => {} });
    assert.equal(open({ url: 'javascript:alert(1)', frameName: '' }).action, 'deny');
    assert.equal(open({ url: 'about:blank', frameName: 'schedule-print' }).action, 'deny');
    assert.equal(escapeHtml('<img src=x onerror="attack()">'), '&lt;img src=x onerror=&quot;attack()&quot;&gt;');
});
