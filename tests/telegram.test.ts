import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createBot } from '../integrations/telegramBot.cjs';
import { scheduleMessages, changesMessages, DEFAULT_OPTIONS } from '../integrations/botMessages.cjs';
import { createBotRuntime, createTelegramClient } from '../integrations/botRuntime.cjs';
import { createBotController, createPublicationAPI } from '../integrations/botController.cjs';

const TOKEN = '12345:' + 'test_token_not_a_real_credential_123456789';
const entry = (patch: any = {}) => ({ id: 'lesson', date: '2026-10-19', startTime: '08:30', endTime: '10:00', subjectId: 'subject', subjectName: 'История России', classType: 'Практика', deliveryMode: 'Офлайн', teacherIds: ['teacher'], teacherNames: ['Иванов Иван Иванович'], classroomId: 'room', classroomName: 'Аудитория 101', groupIds: ['group'], groupNames: ['УБСТ26о1'], subgroupName: '', ...patch });
const feed = () => ({ schemaVersion: 1, current: { schemaVersion: 1, projectId: 'project', revisionId: 'revision', version: 1, title: 'Осенний семестр', publishedAt: '2026-10-19T00:00:00Z', timeZone: 'Europe/Samara', range: { start: '2026-10-19', end: '2026-12-31' }, groups: [{ id: 'group', name: 'УБСТ26о1' }], teachers: [{ id: 'teacher', name: 'Иванов' }], classrooms: [{ id: 'room', name: '101' }], lessons: [entry()] }, history: [] });
const until = async (predicate: () => boolean) => { const deadline = Date.now() + 3000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 5)); } };
const temporary = async (t: any) => { const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'univ-telegram-')); t.after(() => fs.rm(directory, { recursive: true, force: true })); return directory; };
const security = () => {
    const key = randomBytes(32);
    return { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'gnome_libsecret',
        encryptString: (text: string) => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]); },
        decryptString: (bytes: Buffer) => { const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8'); } };
};
const user = (text: string, id = 42) => ({ message: { chat: { id, type: 'private' }, text } });
const callback = (data: string, id = 42) => ({ callback_query: { id: 'query', from: { id }, data, message: { chat: { id, type: 'private' } } } });

test('bot offers paginated name buttons without technical IDs and selects a bare group name', async () => {
    const source = feed(); source.current.groups = Array.from({ length: 19 }, (_, index) => ({ id: `secret-technical-id-${index}`.repeat(5), name: `Группа ${index + 1}` }));
    const replies: any[] = [], answers: string[] = [];
    const bot = createBot({ api: createPublicationAPI(() => source), send: async (_id: string, text: string, options: any) => { replies.push({ text, ...options }); }, answer: async id => { answers.push(id); } });
    await bot.handle(user('/groups'));
    assert.equal(replies[0].text.includes('secret-technical'), false); assert.ok(replies[0].text.includes('Страница 1 из 3'));
    assert.equal(replies[0].reply_markup.inline_keyboard.length, 9);
    const next = replies[0].reply_markup.inline_keyboard.at(-1)[0].callback_data;
    await bot.handle(callback(next)); assert.ok(replies.at(-1).text.includes('Страница 2 из 3'));
    const pick = replies.at(-1).reply_markup.inline_keyboard[0][0].callback_data;
    assert.ok(Buffer.byteLength(pick) <= 64); assert.equal(pick.includes('secret-technical'), false);
    await bot.handle(callback(pick)); assert.equal(bot.state.chats['42'].name, 'Группа 9');
    assert.deepEqual(answers, ['query', 'query']);
    await bot.handle(user('Группа 1')); assert.equal(bot.state.chats['42'].name, 'Группа 1');
    await bot.handle(user('На неделю')); assert.ok(replies.at(-1).text.includes('Занятий нет'));
});

test('callbacks cannot cross chats, survive a publication change or select stale lists', async () => {
    const source = feed(); const replies: any[] = [];
    const bot = createBot({ api: createPublicationAPI(() => source), send: async (_id: string, text: string, options: any) => { replies.push({ text, ...options }); } });
    await bot.handle(user('/groups')); const pick = replies[0].reply_markup.inline_keyboard[0][0].callback_data;
    await bot.handle(callback(pick, 99)); assert.equal(bot.state.chats['99'], undefined);
    source.current.version = 2;
    await bot.handle(callback(pick)); assert.equal(bot.state.chats['42'], undefined); assert.ok(replies.at(-1).text.includes('устарел'));
});

test('schedule responses group by day, escape HTML, hide redundant groups and support formatting options', () => {
    const response = { version: 1, lessons: [entry({ subjectName: '<script>& test' }), entry({ id: 'tuesday', date: '2026-10-20', time: '10:00' })] };
    const messages = scheduleMessages(response, { name: 'УБСТ26о1', kind: 'group' }, { from: '2026-10-19', to: '2026-10-25' });
    assert.equal(messages.length, 2); assert.ok(messages[0].includes('Понедельник, 19 октября')); assert.ok(messages[1].includes('Вторник, 20 октября'));
    assert.ok(messages[0].includes('&lt;script&gt;&amp;')); assert.equal(messages[0].includes('<script>'), false); assert.equal(messages[0].includes('Группы:'), false);
    const plain = scheduleMessages(response, { name: 'УБСТ26о1', kind: 'group' }, { from: '2026-10-19', to: '2026-10-25' }, { format: 'plain', showTeacher: false, showRoom: false });
    assert.equal(plain[0].includes('<b>'), false); assert.equal(plain[0].includes('Иванов'), false); assert.equal(plain[0].includes('Аудитория 101'), false);
});

test('long HTML data and changes remain within Telegram limits without splitting entities or tags', () => {
    const long = entry({ subjectName: '<>&'.repeat(1000), teacherNames: Array(20).fill('&'.repeat(500)), groupNames: Array(20).fill('<'.repeat(500)), classroomName: '>'.repeat(500), subgroupName: '&'.repeat(500), classType: '<'.repeat(500) });
    const messages = [...scheduleMessages({ version: 1, lessons: Array.from({ length: 20 }, (_, id) => ({ ...long, id })) }, { name: '&'.repeat(500), kind: 'room' }, { from: '2026-10-19', to: '2026-10-19' }),
        ...changesMessages({ added: [], removed: [], changed: [{ before: long, after: long }] }, { name: '&'.repeat(500), kind: 'room' }, 2)];
    assert.ok(messages.every(text => text.length < 4096));
    for (const text of messages) { assert.equal((text.match(/<b>/g) || []).length, (text.match(/<\/b>/g) || []).length); assert.equal(/&(?!amp;|lt;|gt;)/.test(text), false); }
});

test('weekday navigation uses the same selected resource and supports the next week', async () => {
    const requests: any[] = [], replies: any[] = [];
    const api = createPublicationAPI(() => feed());
    const bot = createBot({ api: async (resource, params) => { requests.push({ resource, params }); return api(resource, params); }, send: async (_id, text, options) => { replies.push({ text, ...options }); }, now: () => new Date('2026-10-19T08:00:00Z') });
    await bot.handle(user('УБСТ26о1')); await bot.handle(user('На неделю'));
    const next = replies.at(-1).reply_markup.inline_keyboard[0][1].callback_data;
    await bot.handle(callback(next)); assert.equal(requests.at(-1).params.from, '2026-10-26'); assert.equal(requests.at(-1).params.groupId, 'group');
});

test('controller encrypts token, never returns it, checks connection and persists formatting', async t => {
    const directory = await temporary(t), secureStorage = security();
    const controller = createBotController({ directory, secureStorage, getFeed: () => null, fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: { is_bot: true, id: 12345, username: 'univ_bot', first_name: 'Расписание' } })) });
    await controller.initialize(); await controller.save({ ...DEFAULT_OPTIONS, autoStart: true, token: TOKEN, layout: 'compact' });
    const file = await fs.readFile(path.join(directory, 'telegram-settings.json'), 'utf8');
    assert.equal(file.includes(TOKEN), false); assert.equal(JSON.stringify(controller.getStatus()).includes(TOKEN), false);
    const checked = await controller.check(); assert.equal(checked.username, 'univ_bot'); assert.equal(checked.hasToken, true);
    const again = createBotController({ directory, secureStorage, getFeed: () => null }); await again.initialize();
    assert.equal(again.getStatus().autoStart, true); assert.equal(again.getStatus().layout, 'compact'); assert.equal(again.getStatus().phase, 'waiting');
    await controller.forget(); assert.equal((await fs.readFile(path.join(directory, 'telegram-settings.json'), 'utf8')).includes(JSON.parse(file).encryptedToken), false);
});

test('unavailable encryption refuses plaintext storage and bad token checks are sanitized', async t => {
    const directory = await temporary(t);
    const unsafe = createBotController({ directory, secureStorage: { isEncryptionAvailable: () => false }, getFeed: () => null });
    await unsafe.initialize(); await assert.rejects(unsafe.save({ ...DEFAULT_OPTIONS, autoStart: true, token: TOKEN }), /хранилище/);
    await assert.rejects(fs.access(path.join(directory, 'telegram-settings.json')));
    const controller = createBotController({ directory, secureStorage: security(), getFeed: () => null, fetchImpl: async () => new Response(JSON.stringify({ ok: false, error_code: 401, description: TOKEN })) });
    await controller.initialize(); await controller.save({ ...DEFAULT_OPTIONS, autoStart: false, token: TOKEN });
    await assert.rejects(controller.check(), (error: Error) => !error.message.includes(TOKEN) && error.message.includes('отклонил'));
});

test('autostart waits for publication, starts one service and respects a manual stop', async t => {
    const directory = await temporary(t), secureStorage = security(); let source: any = null, starts = 0, stops = 0;
    const runtimeFactory = () => ({ start: () => { starts++; }, stop: async () => { stops++; }, finished: async () => {}, getStatus: () => ({ phase: 'connected', lastError: '', lastConnectedAt: null, username: 'univ_bot', name: 'ВУЗ', subscribers: 0 }) });
    const first = createBotController({ directory, secureStorage, getFeed: () => source, runtimeFactory }); await first.initialize(); await first.save({ ...DEFAULT_OPTIONS, autoStart: true, token: TOKEN });
    const restarted = createBotController({ directory, secureStorage, getFeed: () => source, runtimeFactory }); await restarted.initialize(); await restarted.feedChanged(); assert.equal(starts, 0);
    source = feed(); await Promise.all([restarted.feedChanged(), restarted.feedChanged()]); assert.equal(starts, 1);
    await restarted.stop(); assert.equal(stops, 1); await restarted.feedChanged(); assert.equal(starts, 1);
    await restarted.start(); assert.equal(starts, 2); source = null; await restarted.feedChanged(); assert.equal(restarted.getStatus().phase, 'waiting');
    await restarted.stop();
});

test('runtime handles callbacks, persists offsets and stops an in-flight poll without leaking requests', async t => {
    const directory = await temporary(t), calls: any[] = []; let polls = 0;
    const fetchImpl: typeof fetch = async (url, init) => {
        const method = String(url).split('/').at(-1), body = JSON.parse(String(init.body)); calls.push({ method, body });
        if (method === 'getUpdates' && ++polls > 1) return new Promise<Response>((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
        const result = method === 'getMe' ? { is_bot: true, id: 12345, username: 'univ_bot', first_name: 'ВУЗ' } : method === 'getWebhookInfo' ? { url: '' } : method === 'getUpdates' ? [{ update_id: 7, ...user('/start') }] : {};
        return new Response(JSON.stringify({ ok: true, result }));
    };
    const runtime = createBotRuntime({ token: TOKEN, api: createPublicationAPI(feed), stateDirectory: directory, fetchImpl, sendDelayMs: 0 });
    t.after(() => runtime.stop()); runtime.start(); await until(() => polls > 1);
    const state = JSON.parse(await fs.readFile(path.join(directory, 'telegram-state-12345.json'), 'utf8')); assert.equal(state.offset, 8);
    assert.ok(calls.find(item => item.method === 'sendMessage').body.reply_markup.keyboard);
    assert.deepEqual(calls.find(item => item.method === 'getUpdates').body.allowed_updates, ['message', 'callback_query']);
    const start = Date.now(); await runtime.stop(); assert.ok(Date.now() - start < 1000); assert.equal(runtime.getStatus().phase, 'stopped');
});

test('runtime diagnoses duplicate bot and webhook without overwriting external settings', async t => {
    const directory = await temporary(t);
    for (const code of ['conflict', 'webhook']) {
        const methods: string[] = [];
        const fetchImpl: typeof fetch = async url => {
            const method = String(url).split('/').at(-1); methods.push(method);
            if (method === 'getUpdates') return new Response(JSON.stringify({ ok: false, error_code: 409, description: TOKEN }));
            return new Response(JSON.stringify({ ok: true, result: method === 'getMe' ? { is_bot: true, id: 12345, username: 'univ_bot' } : { url: code === 'webhook' ? 'https://existing.example' : '' } }));
        };
        const runtime = createBotRuntime({ token: TOKEN, api: createPublicationAPI(feed), stateDirectory: directory, fetchImpl }); runtime.start(); await until(() => runtime.getStatus().phase === 'error');
        assert.equal(runtime.getStatus().lastError.includes(TOKEN), false); assert.equal(methods.includes('deleteWebhook'), false); await runtime.stop();
    }
});

test('network failure is retryable, request redirects are disabled and cancellation stops backoff', async t => {
    const directory = await temporary(t); let calls = 0;
    const runtime = createBotRuntime({ token: TOKEN, api: createPublicationAPI(feed), stateDirectory: directory, fetchImpl: async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); throw new Error(TOKEN); }, retryMs: 10000 });
    runtime.start(); await until(() => runtime.getStatus().phase === 'reconnecting');
    assert.equal(runtime.getStatus().lastError.includes(TOKEN), false); await runtime.stop(); assert.equal(calls, 1);
    const request = createTelegramClient(TOKEN, { fetchImpl: async () => new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 3 } })) });
    await assert.rejects(request('getMe'), (error: any) => error.retryAfter === 3 && error.code === 'rate');
});
