import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { publishedRevision } from '../services/publication';
import { scheduleMessages } from '../integrations/botMessages.cjs';
import { CheckCircleIcon, TelegramIcon, TrashIcon, WifiIcon, XMarkIcon } from './icons';

type BotStatus = Awaited<ReturnType<NonNullable<Window['electronAPI']['getTelegramBotStatus']>>>;
type BotSettings = Parameters<NonNullable<Window['electronAPI']['saveTelegramBotSettings']>>[0];
const defaults: BotSettings = { autoStart: false, format: 'html', layout: 'detailed', showTeacher: true, showRoom: true };
const phaseLabels = { stopped: 'Остановлен', waiting: 'Ожидание публикации', starting: 'Подключение', connected: 'Подключён', reconnecting: 'Переподключение', error: 'Ошибка подключения' };
const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40';

const TelegramBotPanel: React.FC = () => {
    const { publications } = useStore(); const active = publishedRevision(publications);
    const [status, setStatus] = useState<BotStatus | null>(null); const [form, setForm] = useState<BotSettings>(defaults);
    const [token, setToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
    const initialized = useRef(false);
    const available = !!window.electronAPI?.getTelegramBotStatus;
    const fields = (value: BotStatus): BotSettings => ({ autoStart: value.autoStart, format: value.format, layout: value.layout, showTeacher: value.showTeacher, showRoom: value.showRoom });
    const dirty = !!token || !!status && JSON.stringify(form) !== JSON.stringify(fields(status));
    useEffect(() => {
        let alive = true;
        const refresh = () => window.electronAPI?.getTelegramBotStatus?.().then(value => {
            if (!alive) return;
            setStatus(value);
            if (!initialized.current) { initialized.current = true; setForm(fields(value)); }
        }).catch(() => { if (alive) setError('Не удалось получить состояние бота.'); });
        refresh(); const timer = setInterval(refresh, 1500); return () => { alive = false; clearInterval(timer); };
    }, []);
    const action = async (operation: () => Promise<BotStatus>, success = '') => {
        setBusy(true); setError(''); setMessage('');
        try { const value = await operation(); setStatus(value); setMessage(success); return value; }
        catch (problem) { setError(String(problem instanceof Error ? problem.message : problem).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
        finally { setBusy(false); }
    };
    const save = async () => {
        const value = await action(() => window.electronAPI.saveTelegramBotSettings({ ...form, ...(token.trim() ? { token: token.trim() } : {}) }), 'Настройки сохранены.');
        if (value) { setForm(fields(value)); setToken(''); }
    };
    const example = active?.snapshot.lessons[0] || { date: '2026-10-19', startTime: '08:30', endTime: '10:00', subjectName: 'История России', classType: 'Практика', classroomName: 'Аудитория 101', teacherNames: ['Иванов Иван Иванович'], groupNames: ['ПМИ25о1'], deliveryMode: 'Офлайн' };
    const preview = scheduleMessages({ lessons: [example], version: active?.number || 1 }, { name: example.groupNames[0] || 'Группа', kind: 'group' }, { from: example.date, to: example.date }, form)[0];
    return <section className="min-w-0 space-y-5" aria-label="Управление Telegram-ботом">
        <header className="flex flex-wrap items-center gap-3"><TelegramIcon aria-hidden="true" className="h-7 w-7 text-sky-600" /><h1 className="text-2xl font-semibold text-gray-900">Telegram-бот</h1>{status?.username && <a className="text-sm text-sky-700 underline" href={`https://t.me/${status.username}`} target="_blank" rel="noreferrer">@{status.username}</a>}</header>
        <div className="grid gap-4 border-y border-gray-200 py-4 sm:grid-cols-3">
            <div><p className="text-xs text-gray-500">Подключение</p><p role="status" className={`mt-1 font-medium ${status?.phase === 'connected' ? 'text-emerald-700' : status?.phase === 'error' ? 'text-red-700' : 'text-gray-700'}`}>{status ? phaseLabels[status.phase] : available ? 'Загрузка' : 'Только в настольном приложении'}</p></div>
            <div className="min-w-0"><p className="text-xs text-gray-500">Источник</p><p className="mt-1 break-words text-sm">{status?.publicationVersion ? `${status.publicationTitle} · v${status.publicationVersion}` : 'Нет опубликованного расписания'}</p></div>
            <div><p className="text-xs text-gray-500">Подписчиков</p><p className="mt-1 font-medium">{status?.subscribers || 0}</p></div>
        </div>
        {(error || status?.lastError) && <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800 break-words">{error || status.lastError}</p>}
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <div className="grid min-w-0 gap-7 xl:grid-cols-2">
            <form aria-label="Настройки Telegram-бота" className="min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); save(); }}>
                <label className="block text-sm font-medium">Токен BotFather<input aria-label="Токен BotFather" type="password" autoComplete="off" spellCheck={false} maxLength={512} value={token} onChange={event => setToken(event.target.value)} placeholder={status?.hasToken ? 'Токен сохранён; новое значение заменит его' : 'Введите токен бота'} className={inputClass} /></label>
                <p className={`text-xs ${status?.secureStorageAvailable ? 'text-gray-500' : 'text-amber-800'}`}>{status?.secureStorageAvailable ? 'Хранение: шифрование средствами ОС. В проект токен не включается.' : 'Защищённое хранилище ОС недоступно. Сохранение нового токена отключено.'}</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoStart} onChange={event => setForm(value => ({ ...value, autoStart: event.target.checked }))} />Автозапуск вместе с приложением</label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Оформление<select aria-label="Оформление ответов" value={form.format} onChange={event => setForm(value => ({ ...value, format: event.target.value as BotSettings['format'] }))} className={inputClass}><option value="html">С выделением текста</option><option value="plain">Обычный текст</option></select></label>
                    <label className="text-sm">Вид ответа<select aria-label="Вид ответа" value={form.layout} onChange={event => setForm(value => ({ ...value, layout: event.target.value as BotSettings['layout'] }))} className={inputClass}><option value="detailed">Подробный</option><option value="compact">Компактный</option></select></label></div>
                <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showTeacher} onChange={event => setForm(value => ({ ...value, showTeacher: event.target.checked }))} />Преподаватели</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showRoom} onChange={event => setForm(value => ({ ...value, showRoom: event.target.checked }))} />Аудитории</label></div>
                <div className="flex flex-wrap items-center gap-2"><button disabled={busy || !available || !!token && !status?.secureStorageAvailable} className={buttonClass}><CheckCircleIcon className="h-4 w-4" />Сохранить настройки</button><span className="text-xs text-amber-800">{dirty ? 'Есть несохранённые настройки' : ''}</span></div>
                <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                    <button type="button" disabled={busy || !status?.hasToken || dirty} onClick={() => action(() => window.electronAPI.checkTelegramBotConnection(), 'Токен принят Telegram.')} className={buttonClass}><WifiIcon className="h-4 w-4" />Проверить подключение</button>
                    <button type="button" disabled={busy || !status?.hasToken || dirty || ['starting', 'connected', 'reconnecting'].includes(status?.phase)} onClick={() => action(() => window.electronAPI.startTelegramBot())} className={buttonClass + ' !border-sky-700 !bg-sky-700 text-white'}><TelegramIcon aria-hidden="true" className="h-4 w-4" />Запустить бота</button>
                    <button type="button" disabled={busy || !status?.wanted} onClick={() => action(() => window.electronAPI.stopTelegramBot(), 'Бот остановлен.')} className={buttonClass}><XMarkIcon className="h-4 w-4" />Остановить бота</button>
                    <button type="button" title="Удалить сохранённый токен" disabled={busy || !status?.hasToken} onClick={() => { if (window.confirm('Удалить токен и остановить бота? Подписки останутся в данных приложения.')) action(() => window.electronAPI.forgetTelegramBotToken(), 'Сохранённый токен удалён.').then(value => { if (value) { setToken(''); setForm(fields(value)); } }); }} className={buttonClass + ' text-red-700'}><TrashIcon className="h-4 w-4" />Удалить токен</button>
                </div>
                {status?.lastConnectedAt && <p className="text-xs text-gray-500">Последний успешный запрос: {new Date(status.lastConnectedAt).toLocaleString('ru-RU')}</p>}
            </form>
            <div className="min-w-0"><h2 className="mb-3 text-sm font-semibold text-gray-700">Пример ответа</h2><div className="rounded-md border border-gray-200 bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap break-words" aria-label="Предпросмотр ответа бота">{form.format === 'html' ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : preview}</div><div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-gray-500"><span className="border-b border-gray-200 py-2">Сегодня</span><span className="border-b border-gray-200 py-2">На неделю</span></div></div>
        </div>
    </section>;
};
export default TelegramBotPanel;
