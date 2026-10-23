const fs = require('node:fs/promises');
const path = require('node:path');
const { createBotRuntime, createTelegramClient, validToken, errorMessage } = require('./botRuntime.cjs');
const { DEFAULT_OPTIONS } = require('./botMessages.cjs');
const { sanitizeFeed, diffSnapshots, filterLessons } = require('./publicSchedule.cjs');

function createPublicationAPI(getFeed) {
    return async (resource, params = {}) => {
        const source = getFeed();
        const reject = status => { throw Object.assign(new Error('Published schedule unavailable.'), { status }); };
        if (!source) reject(503);
        const feed = sanitizeFeed(source), current = feed.current;
        if (params.projectId && params.projectId !== current.projectId) reject(409);
        const meta = { schemaVersion: 1, projectId: current.projectId, version: current.version, title: current.title, timeZone: current.timeZone, range: current.range };
        if (resource === 'status') return meta;
        if (['groups', 'teachers', 'classrooms'].includes(resource)) return { ...meta, items: current[resource] };
        if (resource === 'schedule') return { ...meta, lessons: filterLessons(current, params) };
        if (resource === 'changes') {
            const previous = params.since === current.version ? current : feed.history.find(item => item.version === params.since);
            if (params.since !== 0 && !previous) reject(409);
            const changes = diffSnapshots(previous, current); const contains = item => filterLessons({ lessons: [item] }, params).length > 0;
            changes.added = changes.added.filter(contains); changes.removed = changes.removed.filter(contains); changes.changed = changes.changed.filter(item => contains(item.before) || contains(item.after));
            return { ...meta, changes };
        }
        reject(404);
    };
}
function createBotController({ directory, secureStorage, getFeed, fetchImpl = fetch, runtimeFactory = createBotRuntime }) {
    const filename = path.join(directory, 'telegram-settings.json');
    let settings = { autoStart: false, ...DEFAULT_OPTIONS, encryptedToken: '' };
    let runtime = null, wanted = false, configError = '', checkedBot = null, queue = Promise.resolve();
    const serialize = operation => { const result = queue.then(operation); queue = result.catch(() => {}); return result; };
    const secure = () => {
        try { return !!secureStorage?.isEncryptionAvailable() && (process.platform !== 'linux' || secureStorage.getSelectedStorageBackend?.() !== 'basic_text'); }
        catch { return false; }
    };
    const token = () => {
        if (!settings.encryptedToken) throw new Error('Введите и сохраните токен BotFather.');
        if (!secure()) throw new Error('Защищённое хранилище ОС недоступно. Токен не сохраняется открытым текстом.');
        try { return secureStorage.decryptString(Buffer.from(settings.encryptedToken, 'base64')); }
        catch { throw new Error('Не удалось расшифровать токен. Сохраните его заново для этой учётной записи ОС.'); }
    };
    const stopRuntime = async () => { if (runtime) await runtime.stop(); runtime = null; };
    const reconcile = async () => {
        if (!wanted || !getFeed()) { await stopRuntime(); return; }
        if (runtime) return;
        const secret = token();
        runtime = runtimeFactory({ token: secret, api: createPublicationAPI(getFeed), stateDirectory: directory, fetchImpl, getOptions: () => settings });
        runtime.start();
    };
    const status = () => {
        const feed = getFeed(); const live = runtime?.getStatus();
        return { autoStart: settings.autoStart, format: settings.format, layout: settings.layout, showTeacher: settings.showTeacher, showRoom: settings.showRoom,
            hasToken: !!settings.encryptedToken, secureStorageAvailable: secure(), wanted,
            phase: live?.phase || (configError ? 'error' : wanted ? 'waiting' : 'stopped'), lastError: configError || live?.lastError || '',
            lastConnectedAt: live?.lastConnectedAt || null, username: live?.username || checkedBot?.username || '', name: live?.name || checkedBot?.name || '', subscribers: live?.subscribers || 0,
            publicationTitle: feed?.current.title || '', publicationVersion: feed?.current.version || null };
    };
    return {
        async initialize() {
            try {
                const saved = JSON.parse(await fs.readFile(filename, 'utf8'));
                if (typeof saved.encryptedToken !== 'string' || !['html', 'plain'].includes(saved.format) || !['detailed', 'compact'].includes(saved.layout) || typeof saved.autoStart !== 'boolean' || typeof saved.showTeacher !== 'boolean' || typeof saved.showRoom !== 'boolean') throw new Error('invalid');
                settings = { autoStart: saved.autoStart, format: saved.format, layout: saved.layout, showTeacher: saved.showTeacher, showRoom: saved.showRoom, encryptedToken: saved.encryptedToken };
                wanted = settings.autoStart && !!settings.encryptedToken;
            } catch (error) { if (error.code !== 'ENOENT') configError = 'Не удалось загрузить настройки бота. Сохраните их заново.'; }
            return status();
        },
        getStatus: status,
        save(input) { return serialize(async () => {
            if (!input || !['html', 'plain'].includes(input.format) || !['detailed', 'compact'].includes(input.layout) || typeof input.autoStart !== 'boolean' || typeof input.showTeacher !== 'boolean' || typeof input.showRoom !== 'boolean' || input.token !== undefined && typeof input.token !== 'string') throw new Error('Некорректные настройки бота.');
            const next = { autoStart: input.autoStart, format: input.format, layout: input.layout, showTeacher: input.showTeacher, showRoom: input.showRoom, encryptedToken: settings.encryptedToken };
            const changed = !!input.token;
            if (changed) {
                if (!validToken(input.token.trim())) throw new Error('Неверный формат токена BotFather.');
                if (!secure()) throw new Error('Защищённое хранилище ОС недоступно. Сохранение токена отменено.');
                try { next.encryptedToken = secureStorage.encryptString(input.token.trim()).toString('base64'); }
                catch { throw new Error('Не удалось зашифровать токен средствами ОС.'); }
            }
            await fs.mkdir(directory, { recursive: true });
            try { await fs.writeFile(filename + '.tmp', JSON.stringify(next), { mode: 0o600 }); await fs.rename(filename + '.tmp', filename); }
            catch { throw new Error('Не удалось сохранить настройки бота.'); }
            if (changed) { await stopRuntime(); checkedBot = null; }
            settings = next; configError = '';
            try { await reconcile(); } catch (error) { configError = error.message; }
            return status();
        }); },
        start() { return serialize(async () => { configError = ''; token(); wanted = true; await stopRuntime(); await reconcile(); return status(); }); },
        stop() { return serialize(async () => { wanted = false; configError = ''; await stopRuntime(); return status(); }); },
        feedChanged() { return serialize(async () => { try { await reconcile(); } catch (error) { configError = error.message; } return status(); }); },
        async check() {
            try {
                const original = settings.encryptedToken, secret = token(); const request = createTelegramClient(secret, { fetchImpl, timeoutMs: 12000 });
                const me = await request('getMe');
                if (!me?.is_bot || !/^\w+$/.test(me.username || '') || String(me.id) !== secret.split(':')[0]) throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' });
                if (original === settings.encryptedToken) checkedBot = { username: me.username, name: String(me.first_name || '').slice(0, 100) };
                return { ...status(), checked: true };
            } catch (error) { throw new Error(error.code === 'network' ? 'Нет связи с Telegram. Проверьте подключение к сети.' : error.code ? errorMessage(error) : error.message); }
        },
        forget() { return serialize(async () => {
            wanted = false; await stopRuntime();
            const next = { ...settings, encryptedToken: '', autoStart: false };
            try { await fs.writeFile(filename + '.tmp', JSON.stringify(next), { mode: 0o600 }); await fs.rename(filename + '.tmp', filename); }
            catch { throw new Error('Не удалось удалить сохранённый токен.'); }
            settings = next; checkedBot = null; configError = ''; return status();
        }); },
    };
}
module.exports = { createBotController, createPublicationAPI };
