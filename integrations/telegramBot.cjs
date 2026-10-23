const { randomBytes } = require('node:crypto');
const { DEFAULT_OPTIONS, writer, scheduleMessages, changesMessages } = require('./botMessages.cjs');
const { validDate } = require('./publicSchedule.cjs');

const selectionKey = kind => ({ group: 'groupId', teacher: 'teacherId', room: 'classroomId' })[kind];
const resourceOf = kind => ({ group: 'groups', teacher: 'teachers', room: 'classrooms' })[kind];
const PAGE_SIZE = 8;
const chunks = value => {
    const result = []; let part = '';
    for (const character of String(value)) {
        if (part.length + character.length > 3400) { result.push(part); part = ''; }
        part += character;
    }
    if (part) result.push(part); return result.length ? result : ['Нет занятий.'];
};
const dayInZone = (now, timeZone) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(item => [item.type, item.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};
const addDays = (date, days) => { const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const menuKeyboard = choice => ({ keyboard: [['Сегодня', 'Завтра'], ['На неделю', 'Следующая неделя'], ['Выбрать группу', 'Преподаватель', 'Аудитория'], ['Изменения', choice?.subscribed ? 'Отписаться' : 'Подписаться']], resize_keyboard: true });
const formatChanges = changes => changesMessages(changes, { name: 'Изменения расписания' }, '', { format: 'plain' }).join('\n\n');

function createBot({ api, send, answer = async (_id) => {}, state = { offset: 0, chats: {} }, persist = async () => {}, now = () => new Date(), getOptions = () => DEFAULT_OPTIONS }) {
    state.chats ||= {};
    const views = new Map(), pending = new Map();
    const options = () => ({ ...DEFAULT_OPTIONS, ...getOptions() });
    const read = async (resource, params = {}) => {
        try { return await api(resource, params); }
        catch (problem) { const error = new Error('Published schedule unavailable.'); error.source = 'schedule'; error.status = problem.status; throw error; }
    };
    const reply = async (id, message, markup) => send(id, message, { ...(options().format === 'html' ? { parse_mode: 'HTML' } : {}), ...(markup ? { reply_markup: markup } : {}) });
    const replyMany = async (id, messages, markup) => { for (let index = 0; index < messages.length; index++) await reply(id, messages[index], index === messages.length - 1 ? markup : undefined); };
    const filter = choice => ({ [selectionKey(choice.kind)]: choice.id, projectId: choice.projectId });
    const choosePrompt = async chatId => reply(chatId, 'Выберите группу кнопкой ниже или напишите её название. Можно также выбрать преподавателя или аудиторию.', menuKeyboard());
    const choose = async (chatId, kind, item, status) => {
        pending.delete(chatId); views.delete(chatId);
        const previous = state.chats[chatId];
        const choice = state.chats[chatId] = { projectId: status.projectId, kind, id: item.id, name: item.name, version: status.version,
            subscribed: previous?.projectId === status.projectId && previous.kind === kind && previous.id === item.id ? !!previous.subscribed : false };
        await persist(state);
        await reply(chatId, `${writer(options()).bold(item.name)}\nВыбрано расписание. Нажмите «Сегодня» или «На неделю».`, menuKeyboard(choice));
    };
    const showList = async (chatId, kind, query, status, page = 0, cached) => {
        const response = cached || await read(resourceOf(kind), { projectId: status.projectId });
        const exact = response.items.filter(item => item.id === query || item.name.toLocaleLowerCase('ru') === query.toLocaleLowerCase('ru'));
        const items = query ? exact.length ? exact : response.items.filter(item => item.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))) : response.items;
        if (query && items.length === 1) { await choose(chatId, kind, items[0], status); return; }
        pending.set(chatId, kind);
        if (!items.length) { await reply(chatId, 'Ничего не найдено в опубликованном расписании. Уточните название.', menuKeyboard(state.chats[chatId])); return; }
        const pages = Math.ceil(items.length / PAGE_SIZE); page = Math.max(0, Math.min(page, pages - 1));
        const nonce = randomBytes(6).toString('hex');
        views.set(chatId, { nonce, kind, query, items, projectId: status.projectId, version: status.version });
        if (views.size > 2000) views.delete(views.keys().next().value);
        const keyboard = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((item, index) => [{ text: item.name.slice(0, 60), callback_data: `pick:${nonce}:${page * PAGE_SIZE + index}` }]);
        const navigation = [];
        if (page > 0) navigation.push({ text: 'Назад', callback_data: `list:${nonce}:${page - 1}` });
        if (page + 1 < pages) navigation.push({ text: 'Далее', callback_data: `list:${nonce}:${page + 1}` });
        if (navigation.length) keyboard.push(navigation);
        const label = { group: 'Группы', teacher: 'Преподаватели', room: 'Аудитории' }[kind];
        await reply(chatId, `${writer(options()).bold(label)}\nНайдено: ${items.length}. Страница ${page + 1} из ${pages}.\nНажмите на название или введите текст для поиска.`, { inline_keyboard: keyboard });
    };
    async function handle(update) {
        const callback = update.callback_query;
        if (callback) await answer(callback.id);
        const message = callback?.message || update.message;
        if (message?.chat?.type !== 'private' || callback && String(callback.from?.id) !== String(message.chat.id)) return;
        const chatId = String(message.chat.id); const rawText = String(message.text || '').trim();
        const aliases = { 'Сегодня': '/today', 'Завтра': '/tomorrow', 'На неделю': '/week', 'Следующая неделя': '/nextweek', 'Выбрать группу': '/groups', 'Преподаватель': '/teachers', 'Аудитория': '/rooms', 'Изменения': '/changes', 'Подписаться': '/subscribe', 'Отписаться': '/unsubscribe' };
        const [raw, ...args] = (aliases[rawText] || rawText).split(/\s+/); let command = raw.split('@')[0].toLowerCase(); const query = args.join(' ');
        if (!callback && command === '/forget') { delete state.chats[chatId]; views.delete(chatId); pending.delete(chatId); await persist(state); await reply(chatId, 'Настройки и подписка удалены.', menuKeyboard()); return; }
        if (!callback && command === '/unsubscribe') { if (state.chats[chatId]) state.chats[chatId].subscribed = false; await persist(state); await reply(chatId, 'Уведомления отключены.', menuKeyboard(state.chats[chatId])); return; }
        if (!callback && ['/start', '/help'].includes(command)) {
            const choice = state.chats[chatId];
            await reply(chatId, `${writer(options()).bold('Расписание ВУЗа')}\n${choice ? 'Выбрано: ' + writer(options()).text(choice.name) : 'Нажмите «Выбрать группу» или напишите название группы.'}\nРасписание открывается кнопками ниже.`, menuKeyboard(choice)); return;
        }
        const status = await read('status');
        let choice = state.chats[chatId];
        if (choice && choice.projectId !== status.projectId) { delete state.chats[chatId]; views.delete(chatId); pending.delete(chatId); choice = undefined; await persist(state); }
        let explicitDate;
        if (callback) {
            const parts = String(callback.data || '').split(':');
            if (parts[0] === 'pick' || parts[0] === 'list') {
                const view = views.get(chatId); const index = Number(parts[2]);
                if (!view || parts.length !== 3 || view.nonce !== parts[1] || view.projectId !== status.projectId || view.version !== status.version || !Number.isSafeInteger(index) || index < 0) { await reply(chatId, 'Список устарел. Выберите объект заново.', menuKeyboard(choice)); return; }
                if (parts[0] === 'list') { await showList(chatId, view.kind, view.query, status, index, { items: view.items }); return; }
                if (!view.items[index]) return;
                await choose(chatId, view.kind, view.items[index], status); return;
            }
            if (parts[0] === 'd' || parts[0] === 'w') {
                if (parts.length !== 2 || !validDate(parts[1])) return;
                explicitDate = parts[1]; command = parts[0] === 'd' ? '/today' : '/week';
            } else return;
        } else {
            const kind = { '/groups': 'group', '/group': 'group', '/teachers': 'teacher', '/teacher': 'teacher', '/rooms': 'room', '/room': 'room' }[command];
            if (kind) { await showList(chatId, kind, query, status); return; }
            if (rawText && !rawText.startsWith('/') && !aliases[rawText]) { await showList(chatId, pending.get(chatId) || 'group', rawText, status); return; }
        }
        if (!choice) { await choosePrompt(chatId); return; }
        pending.delete(chatId);
        if (command === '/subscribe') {
            choice.subscribed = true; choice.version = status.version; await persist(state);
            await reply(chatId, `Уведомления включены: ${writer(options()).bold(choice.name)}.`, menuKeyboard(choice)); return;
        }
        if (command === '/changes') {
            try {
                const response = await read('changes', { ...filter(choice), since: choice.version });
                await replyMany(chatId, changesMessages(response.changes, choice, response.version, options()), menuKeyboard(choice));
            } catch (error) { if (error.status !== 409) throw error; await reply(chatId, 'Предыдущая версия недоступна. Откройте актуальное расписание.', menuKeyboard(choice)); }
            choice.version = status.version; await persist(state); return;
        }
        if (!['/today', '/tomorrow', '/week', '/nextweek'].includes(command)) { await choosePrompt(chatId); return; }
        const today = explicitDate || dayInZone(now(), status.timeZone);
        let from = command === '/tomorrow' ? addDays(today, 1) : ['/week', '/nextweek'].includes(command) ? addDays(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7)) : today;
        if (command === '/nextweek') from = addDays(from, 7);
        const weekly = ['/week', '/nextweek'].includes(command); const to = weekly ? addDays(from, 6) : from;
        const response = await read('schedule', { ...filter(choice), from, to });
        const keyboard = [[{ text: weekly ? 'Предыдущая неделя' : 'Предыдущий день', callback_data: `${weekly ? 'w' : 'd'}:${addDays(from, weekly ? -7 : -1)}` }, { text: weekly ? 'Следующая неделя' : 'Следующий день', callback_data: `${weekly ? 'w' : 'd'}:${addDays(from, weekly ? 7 : 1)}` }]];
        if (!response.lessons.length && status.range?.start && (to < status.range.start || from > status.range.end)) keyboard.push([{ text: 'К началу расписания', callback_data: `w:${status.range.start}` }]);
        await replyMany(chatId, scheduleMessages(response, choice, { from, to }, options()), { inline_keyboard: keyboard });
    }
    async function notify() {
        if (!Object.values(state.chats).some(choice => choice.subscribed)) return;
        const status = await read('status');
        for (const [chatId, choice] of Object.entries(state.chats)) {
            if (!choice.subscribed) continue;
            try {
                if (choice.projectId !== status.projectId) {
                    await reply(chatId, 'Источник расписания сменился. Выберите группу заново. Подписка отключена.', menuKeyboard()); delete state.chats[chatId];
                } else if (choice.version !== status.version) {
                    try {
                        const response = await read('changes', { ...filter(choice), since: choice.version });
                        const changes = response.changes;
                        if (changes.added.length || changes.removed.length || changes.changed.length) await replyMany(chatId, changesMessages(changes, choice, response.version, options()), menuKeyboard(choice));
                    } catch (error) { if (error.status !== 409) throw error; await reply(chatId, 'Вышла новая версия расписания. Откройте «На неделю».', menuKeyboard(choice)); }
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
            const chat = update.callback_query?.message?.chat || update.message?.chat;
            if (chat?.type === 'private') await reply(String(chat.id), 'Опубликованное расписание временно недоступно. Повторите запрос позднее.', menuKeyboard(state.chats[String(chat.id)]));
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
    const { createBotRuntime } = require('./botRuntime.cjs');
    const api = createAPI(process.env.SCHEDULE_API_URL || 'http://127.0.0.1:8597', process.env.SCHEDULE_API_TOKEN);
    const runtime = createBotRuntime({ token: process.env.TG_BOT_TOKEN, api, stateDirectory: process.cwd(), stateFile: process.env.SCHEDULE_BOT_STATE });
    runtime.start();
    const stop = () => runtime.stop();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    console.log('Telegram bot started. Private chats; published schedules only.');
    await runtime.finished();
}
if (require.main === module) run().catch(() => { console.error('Cannot start bot. Check environment, Node.js version and state file. Tokens are never logged.'); process.exitCode = 1; });
module.exports = { createBot, createAPI, chunks, formatChanges, dayInZone, run };
