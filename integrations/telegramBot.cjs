const fs = require('node:fs/promises');
const path = require('node:path');

const HELP = 'Расписание из опубликованной версии ВУЗа.\n/groups [поиск]\n/group название или ID\n/teachers [поиск]\n/teacher имя или ID\n/rooms [поиск]\n/room номер или ID\n/today /tomorrow /week\n/changes\n/subscribe /unsubscribe\n/forget - удалить настройки и подписку';
const selectionKey = kind => ({ group: 'groupId', teacher: 'teacherId', room: 'classroomId' })[kind];
const chunks = value => {
    const result = []; let part = '';
    for (const line of value.split('\n')) {
        if (part.length + line.length + 1 > 3500) { if (part) result.push(part); part = ''; }
        for (let offset = 0; offset < line.length; offset += 3400) {
            const piece = line.slice(offset, offset + 3400);
            if (part.length + piece.length > 3500) { result.push(part); part = ''; }
            part += piece + '\n';
        }
    }
    if (part) result.push(part); return result.length ? result : ['Нет занятий.'];
};
const dayInZone = (now, timeZone) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(item => [item.type, item.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};
const addDays = (date, days) => { const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const describe = item => `${item.date} ${item.startTime}-${item.endTime}: ${item.subjectName} (${item.classType})\n${item.groupNames.join(', ')}${item.subgroupName ? ' / ' + item.subgroupName : ''}; ${item.teacherNames.join(', ')}; ${item.classroomName}`;
function formatChanges(changes) {
    return [`Добавлено: ${changes.added.length}; отменено: ${changes.removed.length}; изменено: ${changes.changed.length}.`,
        ...changes.added.slice(0, 15).map(item => '+ ' + describe(item)), ...changes.removed.slice(0, 15).map(item => '- ' + describe(item)),
        ...changes.changed.slice(0, 15).map(item => 'Было: ' + describe(item.before) + '\nСтало: ' + describe(item.after))].join('\n');
}

function createBot({ api, send, state = { offset: 0, chats: {} }, persist = async () => {}, now = () => new Date() }) {
    state.chats ||= {};
    const read = async (resource, params = {}) => {
        try { return await api(resource, params); }
        catch (problem) { const error = new Error('Published schedule unavailable.'); error.source = 'schedule'; error.status = problem.status; throw error; }
    };
    const reply = async (id, message) => { for (const text of chunks(message)) await send(id, text); };
    const filter = choice => ({ [selectionKey(choice.kind)]: choice.id });
    async function handle(update) {
        const message = update.message;
        if (!message?.text || message.chat?.type !== 'private') return;
        const chatId = String(message.chat.id);
        const [raw, ...args] = message.text.trim().split(/\s+/); const command = raw.split('@')[0].toLowerCase(); const query = args.join(' ');
        if (command === '/forget') { delete state.chats[chatId]; await persist(state); await reply(chatId, 'Настройки и подписка удалены.'); return; }
        if (command === '/start' || command === '/help') { await reply(chatId, HELP); return; }
        if (command === '/unsubscribe') { if (state.chats[chatId]) state.chats[chatId].subscribed = false; await persist(state); await reply(chatId, 'Уведомления отключены.'); return; }
        const status = await read('status');
        let choice = state.chats[chatId];
        if (choice && choice.projectId !== status.projectId) { delete state.chats[chatId]; choice = undefined; await persist(state); }
        const resource = { '/groups': 'groups', '/teachers': 'teachers', '/rooms': 'classrooms', '/group': 'groups', '/teacher': 'teachers', '/room': 'classrooms' }[command];
        if (resource) {
            const response = await read(resource, { projectId: status.projectId }); const exact = response.items.find(item => item.id === query);
            const items = exact ? [exact] : response.items.filter(item => item.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
            if (['/group', '/teacher', '/room'].includes(command) && query && items.length === 1) {
                state.chats[chatId] = { projectId: status.projectId, kind: command.slice(1), id: items[0].id, name: items[0].name, version: status.version, subscribed: false };
                await persist(state); await reply(chatId, `Выбрано: ${items[0].name}. /today /tomorrow /week; уведомления: /subscribe`); return;
            }
            await reply(chatId, items.length ? items.slice(0, 60).map(item => `${item.name} [${item.id}]`).join('\n') + (items.length > 60 ? '\nУточните поиск.' : '') : 'Не найдено в опубликованном расписании.'); return;
        }
        if (!choice) { await reply(chatId, 'Выберите группу, преподавателя или аудиторию: /group, /teacher, /room.'); return; }
        if (command === '/subscribe') {
            choice.subscribed = true; choice.version = status.version; await persist(state);
            await reply(chatId, `Подписка включена: ${choice.name}. Уведомления только об изменениях опубликованного расписания.`); return;
        }
        if (command === '/changes') {
            try {
                const response = await read('changes', { ...filter(choice), since: choice.version, projectId: choice.projectId });
                await reply(chatId, `Версия ${response.version}. ${choice.name}\n${formatChanges(response.changes)}`);
            } catch (error) { if (error.status !== 409) throw error; await reply(chatId, 'Прошлая версия недоступна. Обновите расписание: /week.'); }
            choice.version = status.version; await persist(state); return;
        }
        if (!['/today', '/tomorrow', '/week'].includes(command)) { await reply(chatId, HELP); return; }
        const today = dayInZone(now(), status.timeZone);
        const from = command === '/tomorrow' ? addDays(today, 1) : command === '/week' ? addDays(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7)) : today;
        const to = command === '/week' ? addDays(from, 6) : from;
        const response = await read('schedule', { ...filter(choice), projectId: choice.projectId, from, to });
        await reply(chatId, `${choice.name}. Версия ${response.version}\n${from}${from !== to ? ' - ' + to : ''}\n${response.lessons.length ? response.lessons.map(describe).join('\n\n') : 'Занятий нет.'}`);
    }
    async function notify() {
        if (!Object.values(state.chats).some(choice => choice.subscribed)) return;
        const status = await read('status');
        for (const [chatId, choice] of Object.entries(state.chats)) {
            if (!choice.subscribed) continue;
            try {
                if (choice.projectId !== status.projectId) {
                    await reply(chatId, 'Источник расписания сменился. Выберите группу или преподавателя заново. Подписка отключена.'); delete state.chats[chatId];
                } else if (choice.version !== status.version) {
                    try {
                        const response = await read('changes', { ...filter(choice), since: choice.version, projectId: choice.projectId });
                        const changes = response.changes;
                        if (changes.added.length || changes.removed.length || changes.changed.length) await reply(chatId, `Изменилось расписание: ${choice.name}. Версия ${status.version}\n${formatChanges(changes)}`);
                    } catch (error) { if (error.status !== 409) throw error; await reply(chatId, 'Вышла новая версия расписания. Сравнение недоступно; проверьте /week.'); }
                    choice.version = status.version;
                }
                await persist(state);
            } catch (error) {
                if (error.status === 403) { delete state.chats[chatId]; await persist(state); }
                else throw error;
            }
        }
    }
    return { state, notify, handle: async update => {
        try { await handle(update); }
        catch (error) {
            if (error.source !== 'schedule') throw error;
            await reply(String(update.message.chat.id), 'Опубликованное расписание временно недоступно. Повторите запрос позднее. /unsubscribe и /forget работают без подключения к расписанию.');
        }
    } };
}

function createAPI(base, token, fetchImpl = fetch) {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('API requires HTTPS, or HTTP on loopback only.');
    if (!token || token.length < 32) throw new Error('Set SCHEDULE_API_TOKEN.');
    return async (resource, params = {}) => {
        const target = new URL(`api/v1/${resource}`, url.href.endsWith('/') ? url : url.href + '/');
        for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
        const response = await fetchImpl(target, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) { const error = new Error('Schedule API unavailable.'); error.status = response.status; throw error; }
        return response.json();
    };
}

async function run() {
    const token = process.env.TG_BOT_TOKEN;
    if (!token || !/^\d+:[\w-]+$/.test(token)) throw new Error('Set TG_BOT_TOKEN.');
    const api = createAPI(process.env.SCHEDULE_API_URL || 'http://127.0.0.1:8597', process.env.SCHEDULE_API_TOKEN);
    const filename = path.resolve(process.env.SCHEDULE_BOT_STATE || '.telegram-bot.local.json');
    let state = { offset: 0, chats: {} };
    try { state = JSON.parse(await fs.readFile(filename, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Bot state is invalid; preserve it and inspect before restarting.'); }
    if (!Number.isSafeInteger(state.offset) || state.offset < 0 || !state.chats || typeof state.chats !== 'object' || Array.isArray(state.chats)) throw new Error('Invalid bot state.');
    if (Object.entries(state.chats).some(([id, choice]) => !/^\d+$/.test(id) || !choice || !selectionKey(choice.kind) || typeof choice.id !== 'string' || typeof choice.projectId !== 'string' || typeof choice.name !== 'string' || !Number.isSafeInteger(choice.version) || choice.version < 1 || typeof choice.subscribed !== 'boolean')) throw new Error('Invalid bot subscription state.');
    const persist = async value => { const temporary = filename + '.tmp'; await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 }); await fs.rename(temporary, filename); };
    let stopping = false; let controller;
    const stop = () => { stopping = true; controller?.abort(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    const telegram = async (method, body) => {
        controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 40000);
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
            const result = await response.json();
            if (!result.ok) { const error = new Error('Telegram request failed.'); error.status = result.error_code; error.retryAfter = result.parameters?.retry_after; throw error; }
            return result.result;
        } finally { clearTimeout(timeout); }
    };
    const bot = createBot({ api, state, persist, send: async (chatId, text) => { await telegram('sendMessage', { chat_id: chatId, text }); await new Promise(resolve => setTimeout(resolve, 1050)); } });
    console.log('Telegram bot started. Private chats; published schedules only.');
    while (!stopping) {
        try {
            const updates = await telegram('getUpdates', { offset: state.offset, timeout: 25, allowed_updates: ['message'] });
            for (const update of updates) {
                if (stopping) break;
                try { await bot.handle(update); }
                catch (error) {
                    if (error.status === 403) { delete state.chats[String(update.message?.chat?.id)]; }
                    else throw error;
                }
                state.offset = update.update_id + 1; await persist(state);
            }
            await bot.notify();
        } catch (error) {
            if (stopping) break;
            console.error('Bot service temporarily unavailable; retrying without logging tokens or message contents.');
            await new Promise(resolve => setTimeout(resolve, Math.min(60000, Math.max(3000, Number(error.retryAfter || 0) * 1000))));
        }
    }
    await persist(state);
}
if (require.main === module) run().catch(() => { console.error('Cannot start bot. Check environment, Node.js version and state file. Tokens are never logged.'); process.exitCode = 1; });
module.exports = { createBot, createAPI, chunks, formatChanges, dayInZone, run };
