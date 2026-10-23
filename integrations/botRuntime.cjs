const fs = require('node:fs/promises');
const path = require('node:path');
const { createBot } = require('./telegramBot.cjs');

const validToken = token => typeof token === 'string' && token.length < 512 && /^\d+:[A-Za-z0-9_-]{20,}$/.test(token);
const failure = (code, status, retryAfter) => Object.assign(new Error(code), { code, status, retryAfter });
const errorMessage = error => ({
    token: 'Неверный формат токена BotFather.', unauthorized: 'Telegram отклонил токен. Проверьте его в BotFather.',
    conflict: 'Бот уже запущен в другом месте. Остановите прежний экземпляр.', webhook: 'У бота настроен webhook другого сервиса. Отключите его там или используйте нового бота.',
    state: 'Не удалось прочитать или сохранить подписки бота. Проверьте доступ к данным приложения.',
    network: 'Нет связи с Telegram. Подключение будет повторено автоматически.', rate: 'Telegram ограничил частоту запросов. Ожидается повтор.',
}[error?.code] || 'Не удалось выполнить запрос к Telegram. Попробуйте подключиться снова.');

function createTelegramClient(token, { fetchImpl = fetch, signal, timeoutMs = 35000, onSuccess = () => {} } = {}) {
    if (!validToken(token)) throw failure('token');
    return async (method, body = {}) => {
        const controller = new AbortController(); const abort = () => controller.abort();
        if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
        const timeout = setTimeout(abort, timeoutMs);
        try {
            const response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
            const result = await response.json();
            if (!result.ok) {
                const status = Number(result.error_code || response.status);
                throw failure(status === 401 ? 'unauthorized' : status === 409 ? 'conflict' : status === 429 ? 'rate' : 'request', status, Number(result.parameters?.retry_after || 0));
            }
            onSuccess(); return result.result;
        } catch (error) {
            if (error.code && ['unauthorized', 'conflict', 'rate', 'request'].includes(error.code)) throw error;
            throw failure('network');
        } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
    };
}
const pause = (ms, signal) => new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, ms); signal.addEventListener('abort', done, { once: true });
});
function validateState(state, botId) {
    if (!state || !Number.isSafeInteger(state.offset) || state.offset < 0 || !state.chats || typeof state.chats !== 'object' || Array.isArray(state.chats) || state.botId && String(state.botId) !== botId) throw failure('state');
    if (Object.entries(state.chats).some(([id, choice]) => !/^\d+$/.test(id) || !choice || !['group', 'teacher', 'room'].includes(choice.kind) || typeof choice.id !== 'string' || typeof choice.projectId !== 'string' || typeof choice.name !== 'string' || !Number.isSafeInteger(choice.version) || choice.version < 1 || typeof choice.subscribed !== 'boolean')) throw failure('state');
    return { ...state, botId };
}
function createBotRuntime({ token, api, stateDirectory, stateFile = undefined, fetchImpl = fetch, getOptions = () => ({}), onStatus = () => {}, retryMs = 3000, sendDelayMs = 1050, pollTimeout = 20 }) {
    if (!validToken(token)) throw failure('token');
    const botId = token.split(':')[0];
    const filename = stateFile ? path.resolve(stateFile) : path.join(stateDirectory, `telegram-state-${botId}.json`);
    let task, bot, cancelled, status = { phase: 'stopped', lastError: '', lastConnectedAt: null, username: '', name: '', subscribers: 0 };
    const update = patch => { status = { ...status, ...patch }; onStatus({ ...status }); };
    const persist = async state => {
        try { await fs.writeFile(filename + '.tmp', JSON.stringify(state), { mode: 0o600 }); await fs.rename(filename + '.tmp', filename); }
        catch { throw failure('state'); }
        update({ subscribers: Object.values(state.chats).filter(choice => choice.subscribed).length });
    };
    const loop = async () => {
        let state;
        try {
            await fs.mkdir(path.dirname(filename), { recursive: true });
            try { state = validateState(JSON.parse(await fs.readFile(filename, 'utf8')), botId); }
            catch (error) { if (error.code !== 'ENOENT') throw failure('state'); state = { botId, offset: 0, chats: {} }; }
        } catch { update({ phase: 'error', lastError: errorMessage(failure('state')) }); return; }
        const signal = cancelled.signal;
        const telegram = createTelegramClient(token, { fetchImpl, signal, onSuccess: () => update({ lastConnectedAt: new Date().toISOString() }) });
        let connected = false; const sent = new Map();
        bot = createBot({ api, state, persist, getOptions,
            answer: id => telegram('answerCallbackQuery', { callback_query_id: id }).catch(error => { if (error.status !== 400) throw error; }),
            send: async (chatId, text, options) => {
                await pause(Math.max(0, sendDelayMs - (Date.now() - (sent.get(chatId) || 0))), signal);
                if (signal.aborted) throw failure('network');
                await telegram('sendMessage', { chat_id: chatId, text, ...options }); sent.set(chatId, Date.now());
                if (sent.size > 2000) sent.delete(sent.keys().next().value);
            } });
        update({ subscribers: Object.values(state.chats).filter(choice => choice.subscribed).length });
        while (!signal.aborted) {
            try {
                if (!connected) {
                    const me = await telegram('getMe');
                    if (!me?.is_bot || !/^\w+$/.test(me.username || '') || String(me.id) !== botId) throw failure('unauthorized', 401);
                    const webhook = await telegram('getWebhookInfo'); if (webhook.url) throw failure('webhook');
                    update({ username: me.username, name: String(me.first_name || '').slice(0, 100) }); connected = true;
                }
                update({ phase: 'connected', lastError: '' });
                const updates = await telegram('getUpdates', { offset: state.offset, timeout: pollTimeout, allowed_updates: ['message', 'callback_query'] });
                if (!Array.isArray(updates)) throw failure('network');
                for (const event of updates) {
                    if (signal.aborted) break;
                    if (!Number.isSafeInteger(event.update_id)) continue;
                    try { await bot.handle(event); }
                    catch (error) { if (error.status === 403) delete state.chats[String(event.message?.chat?.id || event.callback_query?.message?.chat?.id)]; else throw error; }
                    state.offset = event.update_id + 1; await persist(state);
                }
                if (!signal.aborted) {
                    try { await bot.notify(); } catch (error) { if (error.source !== 'schedule') throw error; }
                    if (!updates.length) await pause(100, signal);
                }
            } catch (error) {
                if (signal.aborted) break;
                if (['token', 'unauthorized', 'conflict', 'webhook', 'state'].includes(error.code)) { update({ phase: 'error', lastError: errorMessage(error) }); return; }
                update({ phase: 'reconnecting', lastError: errorMessage(error) }); connected = false;
                await pause(Math.min(60000, Math.max(retryMs, (error.retryAfter || 0) * 1000)), signal);
            }
        }
    };
    return {
        start() {
            if (task) return;
            cancelled = new AbortController(); update({ phase: 'starting', lastError: '' });
            task = loop().catch(() => update({ phase: 'error', lastError: 'Сервис бота остановлен из-за внутренней ошибки.' }));
        },
        async stop() { cancelled?.abort(); await task; task = null; update({ phase: 'stopped', lastError: '' }); },
        finished: () => task || Promise.resolve(),
        getStatus: () => ({ ...status }),
    };
}
module.exports = { createBotRuntime, createTelegramClient, validToken, errorMessage, validateState };
