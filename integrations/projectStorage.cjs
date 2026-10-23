const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { MAX_PROJECT_BYTES, parseProject } = require('./projectValidation.cjs');
const digest = data => createHash('sha256').update(data).digest('hex');
const backupPattern = /^\d{13}-[a-f0-9-]{36}\.schd$/;
function projectPath(value) {
    if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || path.extname(value).toLowerCase() !== '.schd' || process.platform === 'win32' && value.slice(2).includes(':')) throw new Error('Ожидается абсолютный путь к файлу .schd.');
    return path.resolve(value);
}
function createProjectStorage({ io = fs, keep = 10 } = {}) {
    const queues = new Map(), fingerprints = new Map();
    const keyOf = filename => process.platform === 'win32' ? filename.toLowerCase() : filename;
    const serialize = (filename, action) => {
        const key = keyOf(filename), previous = queues.get(key) || Promise.resolve();
        const job = previous.catch(() => {}).then(action); queues.set(key, job);
        job.finally(() => { if (queues.get(key) === job) queues.delete(key); }).catch(() => {}); return job;
    };
    async function readBytes(filename) {
        const stat = await io.lstat(filename);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PROJECT_BYTES) throw new Error('Проект должен быть обычным файлом размером до 128 МБ.');
        const bytes = await io.readFile(filename);
        if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Файл проекта слишком большой.');
        return bytes;
    }
    async function atomic(filename, bytes) {
        const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
        let handle;
        try {
            handle = await io.open(temporary, 'wx', 0o600);
            await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null;
            // Never remove the destination as a fallback: a failed replacement must leave it intact.
            for (let attempt = 0; ; attempt++) {
                try { await io.rename(temporary, filename); break; }
                catch (error) { if (attempt >= 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error; await new Promise(resolve => setTimeout(resolve, 40 * 2 ** attempt)); }
            }
            if (process.platform !== 'win32') { let directory; try { directory = await io.open(path.dirname(filename), 'r'); await directory.sync(); } catch {} finally { await directory?.close(); } }
        } finally { await handle?.close().catch(() => {}); await io.unlink(temporary).catch(() => {}); }
    }
    const backupDirectory = filename => filename + '.backups';
    async function names(filename) {
        try { return (await io.readdir(backupDirectory(filename))).filter(name => backupPattern.test(name)).sort().reverse(); }
        catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    async function snapshot(filename, bytes) {
        const directory = backupDirectory(filename); await io.mkdir(directory, { recursive: true, mode: 0o700 });
        const info = await io.lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Небезопасный каталог резервных копий.');
        const id = `${Date.now()}-${randomUUID()}.schd`; await atomic(path.join(directory, id), bytes); return id;
    }
    async function prune(filename) {
        const files = await names(filename);
        for (const name of files.slice(keep)) await io.unlink(path.join(backupDirectory(filename), name));
    }
    async function saveInternal(filename, text, force = false) {
        parseProject(text); const bytes = Buffer.from(text, 'utf8');
        if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Файл проекта слишком большой.');
        let before;
        try { before = await readBytes(filename); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const expected = fingerprints.get(keyOf(filename));
        if (!force && expected && (!before || digest(before) !== expected)) throw new Error('Проект изменён другой программой. Откройте его заново или используйте «Сохранить как».');
        if (before && before.equals(bytes)) return { success: true };
        if (before) await snapshot(filename, before);
        await atomic(filename, bytes); fingerprints.set(keyOf(filename), digest(bytes));
        let backupWarning;
        try { await prune(filename); } catch { backupWarning = 'Проект сохранён, но старые резервные копии не удалось удалить.'; }
        return { success: true, backupWarning };
    }
    return {
        async open(value) { const filename = projectPath(value), bytes = await readBytes(filename); parseProject(bytes.toString('utf8')); fingerprints.set(keyOf(filename), digest(bytes)); const stat = await io.stat(filename); return { filePath: filename, data: bytes.toString('utf8'), stats: { size: bytes.length, lastModified: stat.mtime.toISOString() } }; },
        save(value, text, { force = false } = {}) { const filename = projectPath(value); return serialize(filename, () => saveInternal(filename, text, force)); },
        async list(value) { const filename = projectPath(value), files = await names(filename); const result = [];
            for (const id of files) { try { const bytes = await readBytes(path.join(backupDirectory(filename), id)); let valid = true; try { parseProject(bytes.toString('utf8')); } catch { valid = false; } result.push({ id, createdAt: new Date(Number(id.slice(0, 13))).toISOString(), size: bytes.length, valid }); } catch {} } return result;
        },
        backup(value) { const filename = projectPath(value); return serialize(filename, async () => { const bytes = await readBytes(filename); parseProject(bytes.toString('utf8')); const id = await snapshot(filename, bytes); await prune(filename); return { id }; }); },
        restore(value, id) { const filename = projectPath(value); if (typeof id !== 'string' || !backupPattern.test(id)) throw new Error('Некорректная резервная копия.');
            return serialize(filename, async () => { const bytes = await readBytes(path.join(backupDirectory(filename), id)); parseProject(bytes.toString('utf8')); await saveInternal(filename, bytes.toString('utf8'), true); return this.open(filename); });
        },
        flush: () => Promise.allSettled([...queues.values()]),
        atomic,
    };
}
module.exports = { createProjectStorage, projectPath };
