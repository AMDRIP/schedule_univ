import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { diffSnapshots, exportPublishedFeed, publicationIssues, publishedRevision, PublicSnapshot, toICS } from '../services/publication';
import { planningSignature } from '../services/scheduleRepair';
import { filterLessons } from '../integrations/publicSchedule.cjs';
import { CheckCircleIcon, CopyIcon, DocumentDownloadIcon, PlusIcon, UploadIcon, XMarkIcon } from './icons';
import { getTimeSlotShiftLabel } from '../utils/shiftUtils';

const field = 'w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-40';
const primary = button + ' !border-emerald-700 !bg-emerald-700 text-white';
export const downloadPublication = (filename: string, content: string, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const describe = (item: PublicSnapshot['lessons'][number]) => `${item.date} ${item.startTime}-${item.endTime} · ${item.subjectName} · ${item.groupNames.join(', ')} · ${item.teacherNames.join(', ')} · ${item.classroomName}`;

export const PublishedScheduleView: React.FC<{ snapshot?: PublicSnapshot }> = ({ snapshot: supplied }) => {
    const store = useStore(); const snapshot = supplied || publishedRevision(store.publications)?.snapshot;
    const [kind, setKind] = useState('groups'); const [id, setId] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [limit, setLimit] = useState(100);
    useEffect(() => { setId(''); setFrom(snapshot?.range.start || ''); setTo(snapshot?.range.end || ''); setLimit(100); }, [snapshot?.revisionId]);
    if (!snapshot) return <section className="py-8"><h1 className="text-2xl font-semibold">Опубликованное расписание</h1><p className="mt-4 text-gray-600">Расписание ещё не опубликовано.</p></section>;
    const filter = { ...(id ? { [kind === 'groups' ? 'groupId' : kind === 'teachers' ? 'teacherId' : 'classroomId']: id } : {}), from, to };
    const lessons = filterLessons(snapshot, filter);
    return <section className="min-w-0 space-y-4" aria-label="Опубликованное расписание">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold break-words">{snapshot.title}</h2><p className="text-sm text-gray-500">Опубликована v{snapshot.version} · {new Date(snapshot.publishedAt).toLocaleString('ru-RU')} · {snapshot.timeZone}</p></div>
            <button className={button} onClick={() => downloadPublication(`schedule-v${snapshot.version}.ics`, toICS(snapshot, filter), 'text/calendar')}><DocumentDownloadIcon className="h-4 w-4" />ICS</button></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm">Вид<select className={field} value={kind} onChange={event => { setKind(event.target.value); setId(''); }}><option value="groups">По группе</option><option value="teachers">По преподавателю</option><option value="classrooms">По аудитории</option></select></label>
            <label className="text-sm">Объект<select className={field} value={id} onChange={event => { setId(event.target.value); setLimit(100); }}><option value="">Все</option>{snapshot[kind].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm">С даты<input type="date" className={field} value={from} onChange={event => setFrom(event.target.value)} /></label>
            <label className="text-sm">По дату<input type="date" className={field} value={to} onChange={event => setTo(event.target.value)} /></label>
        </div>
        <div className="overflow-x-auto border-y border-gray-200"><table className="w-full text-left text-sm"><thead className="bg-gray-100 text-gray-600"><tr>{['Дата и время', 'Занятие', 'Группы', 'Преподаватели', 'Аудитория'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-200">{lessons.slice(0, limit).map(item => <tr key={item.id} className="align-top bg-white">
            <td className="p-3 whitespace-nowrap">{item.date}<br />{item.startTime}-{item.endTime}<div className="text-xs text-gray-500">{getTimeSlotShiftLabel(item.shift)}</div></td>
            <td className="p-3 min-w-[180px]"><span className="font-medium">{item.subjectName}</span><div className="text-gray-500">{item.classType} · {item.deliveryMode}</div></td><td className="p-3">{item.groupNames.join(', ')}{item.subgroupName && <div>{item.subgroupName}</div>}</td><td className="p-3">{item.teacherNames.join(', ')}</td><td className="p-3">{item.classroomName}</td>
        </tr>)}</tbody></table></div>
        {!lessons.length && <p className="text-sm text-gray-500">Занятий за выбранный период нет.</p>}
        <div className="flex items-center justify-between text-sm text-gray-500"><span>Занятий: {lessons.length}</span>{lessons.length > limit && <button className={button} onClick={() => setLimit(value => value + 100)}>Показать ещё</button>}</div>
    </section>;
};

const PublicationAPI: React.FC = () => {
    const { publications, publicationSyncError } = useStore(); const active = publishedRevision(publications);
    const [status, setStatus] = useState<Awaited<ReturnType<NonNullable<Window['electronAPI']['getPublicationServerStatus']>>>>({ running: false });
    const [port, setPort] = useState(8597); const [kind, setKind] = useState('groups'); const [id, setId] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
    useEffect(() => {
        let alive = true;
        const refresh = () => window.electronAPI?.getPublicationServerStatus?.().then(value => { if (alive) setStatus(value); }).catch(() => { if (alive) setError('Не удалось получить состояние API.'); });
        refresh(); const timer = setInterval(refresh, 5000); return () => { alive = false; clearInterval(timer); };
    }, []);
    const invoke = async (start: boolean) => {
        setBusy(true); setError('');
        try {
            if (start) { await window.electronAPI.syncPublishedFeed(exportPublishedFeed(publications)); await window.electronAPI.startPublicationServer(port); }
            else await window.electronAPI.stopPublicationServer();
            setStatus(await window.electronAPI.getPublicationServerStatus());
        } catch { setError('Не удалось запустить или остановить API. Проверьте публикацию и выберите свободный порт.'); }
        finally { setBusy(false); }
    };
    const query = new URLSearchParams({ token: status.calendarToken || '', ...(id ? { [kind === 'groups' ? 'groupId' : kind === 'teachers' ? 'teacherId' : 'classroomId']: id } : {}) });
    const copy = (value: string) => navigator.clipboard.writeText(value).catch(() => setError('Не удалось скопировать значение.'));
    return <section className="space-y-5 py-4" aria-label="API и календари">
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Порт<input type="number" min={1024} max={65535} value={port} disabled={status.running} onChange={event => setPort(Number(event.target.value))} className={field} /></label>
            <button className={status.running ? button : primary} disabled={busy || !active || !window.electronAPI?.startPublicationServer} onClick={() => invoke(!status.running)}>{status.running ? <XMarkIcon className="h-4 w-4" /> : <UploadIcon className="h-4 w-4" />}{status.running ? 'Остановить API' : 'Запустить API'}</button>
            <span role="status" className={`text-sm ${status.running ? 'text-emerald-700' : 'text-gray-500'}`}>{status.running ? `Работает · ${status.url} · только этот компьютер` : 'API выключен'}</span></div>
        {(error || publicationSyncError) && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error || publicationSyncError}</p>}
        {status.running && <div className="space-y-4 border-y border-gray-200 py-4">
            <label className="block text-sm">Ключ API<div className="flex gap-2"><input aria-label="Ключ API" className={field} readOnly type="password" value={status.apiToken || ''} /><button title="Скопировать ключ API" aria-label="Скопировать ключ API" className={button} onClick={() => copy(status.apiToken)}><CopyIcon className="h-4 w-4" /></button></div></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Календарь<select className={field} value={kind} onChange={event => { setKind(event.target.value); setId(''); }}><option value="groups">Группа</option><option value="teachers">Преподаватель</option><option value="classrooms">Аудитория</option></select></label><label className="text-sm">Объект<select className={field} value={id} onChange={event => setId(event.target.value)}><option value="">Все</option>{active?.snapshot[kind].map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
            <label className="block text-sm">Адрес ICS-подписки<div className="flex gap-2"><input aria-label="Адрес ICS-подписки" type="password" className={field} readOnly value={`${status.url}/calendar.ics?${query}`} /><button title="Скопировать адрес календаря" aria-label="Скопировать адрес календаря" className={button} onClick={() => copy(`${status.url}/calendar.ics?${query}`)}><CopyIcon className="h-4 w-4" /></button></div></label>
            <p className="text-xs text-amber-800">Адрес календаря содержит ключ доступа. Остановка и повторный запуск API меняют оба ключа.</p>
        </div>}
        {status.publicationFile && <div className="text-sm text-gray-600 break-all">Файл публикации: {status.publicationFile}</div>}
        <button className={button} disabled={!active} onClick={() => downloadPublication('published-schedule.json', JSON.stringify(exportPublishedFeed(publications), null, 2))}><DocumentDownloadIcon className="h-4 w-4" />Экспорт публикации JSON</button>
    </section>;
};

const PublicationView: React.FC = () => {
    const store = useStore(); const { publications } = store; const active = publishedRevision(publications);
    const [tab, setTab] = useState('versions'); const [title, setTitle] = useState('Расписание семестра'); const [note, setNote] = useState(''); const [timeZone, setTimeZone] = useState('Europe/Samara');
    const [selectedId, setSelectedId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
    const selected = publications.revisions.find(item => item.id === selectedId) || publications.revisions.at(-1);
    const baseline = selected?.status === 'published' ? publications.revisions.filter(item => item.publishedAt && item.number < selected.number).at(-1) : active;
    const diff = useMemo(() => selected ? diffSnapshots(baseline?.snapshot, selected.snapshot) : null, [selected, baseline]);
    const stale = selected?.status === 'review' && selected.sourceSignature !== planningSignature(store.getFullState());
    const action = async (operation: () => unknown | Promise<unknown>, success = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await operation(); setMessage(success); } catch (problem) { setError(problem instanceof Error ? problem.message : 'Операция не выполнена.'); }
        finally { setBusy(false); }
    };
    return <div className="min-w-0 space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-gray-900">Публикация расписания</h1><p className="mt-1 text-sm text-gray-500">{active ? `Действующая версия v${active.number} · ${active.title}` : 'Опубликованных версий нет'}</p></div><button disabled={!window.electronAPI?.saveFile} className={button} onClick={() => action(store.handleSave)}><DocumentDownloadIcon className="h-4 w-4" />Сохранить проект</button></header>
        <div className="flex flex-wrap border-b border-gray-200" role="tablist">{[['versions', 'Версии и согласование'], ['published', 'Опубликованная сетка'], ['api', 'API и календари']].map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === value ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-gray-500'}`} onClick={() => setTab(value)}>{label}</button>)}</div>
        {error && <p role="alert" className="whitespace-pre-wrap max-h-64 overflow-y-auto border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        {tab === 'published' ? <PublishedScheduleView /> : tab === 'api' ? <PublicationAPI /> : <>
            <form aria-label="Новая версия расписания" className="grid gap-3 border-b border-gray-200 pb-5 sm:grid-cols-2 xl:grid-cols-4" onSubmit={event => { event.preventDefault(); action(() => { setSelectedId(store.submitScheduleForReview(title, note, timeZone)); }, 'Версия передана на согласование.'); }}>
                <label className="text-sm">Название версии<input required maxLength={200} className={field} value={title} onChange={event => setTitle(event.target.value)} /></label>
                <label className="text-sm">Комментарий<input maxLength={1000} className={field} value={note} onChange={event => setNote(event.target.value)} /></label>
                <label className="text-sm">Часовой пояс<input required className={field} value={timeZone} onChange={event => setTimeZone(event.target.value)} /></label>
                <div className="flex items-end"><button disabled={busy} className={primary}><PlusIcon className="h-4 w-4" />На согласование</button></div>
            </form>
            <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]"><aside className="border-r border-gray-200 pr-3"><h2 className="mb-3 text-sm font-semibold text-gray-600">История версий</h2><div className="space-y-1">{[...publications.revisions].reverse().map(item => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`block w-full rounded-md px-3 py-3 text-left text-sm ${selected?.id === item.id ? 'bg-emerald-50 text-emerald-950' : 'hover:bg-gray-100'}`}><span className="font-semibold">v{item.number} · {item.title}</span><span className="mt-1 block text-xs text-gray-500">{item.status === 'review' ? 'На согласовании' : item.status === 'published' ? 'Опубликована' : 'Архив'} · {new Date(item.createdAt).toLocaleDateString('ru-RU')}</span></button>)}</div></aside>
                {selected ? <section className="min-w-0 space-y-4"><div><h2 className="text-lg font-semibold break-words">v{selected.number} · {selected.title}</h2><p className="text-sm text-gray-500 break-words">{selected.note || 'Без комментария'} · Общегрупповых занятий: {selected.snapshot.lessons.length} · Исключено индивидуальных записей: {selected.excludedIndividual}</p></div>
                    <p className="text-sm text-gray-500">Период: {selected.snapshot.range.start} - {selected.snapshot.range.end}</p>
                    {stale && <p className="text-sm text-amber-800">Черновик или исходные данные изменились. Требуется новая версия для согласования.</p>}
                    <div className="flex flex-wrap gap-2">
                        <button disabled={busy} className={button} onClick={() => action(async () => { const issues = await publicationIssues(store.getFullState()); if (issues.length) throw new Error(issues.join('\n')); }, 'Текущий черновик прошёл проверку ограничений.')}><CheckCircleIcon className="h-4 w-4" />Проверить черновик</button>
                        {selected.status === 'review' && <button disabled={busy || stale} className={primary} onClick={() => action(() => store.publishScheduleRevision(selected.id), 'Версия опубликована. Черновик можно продолжать редактировать.')}><UploadIcon className="h-4 w-4" />Опубликовать</button>}
                        <button disabled={busy} className={button} onClick={() => { if (window.confirm('Заменить текущий черновик выбранной версией? Действующая публикация не изменится. Справочники не восстанавливаются; перед повторной публикацией нужна проверка.')) action(() => store.restoreScheduleRevision(selected.id), 'Черновик восстановлен. Для возврата действующего расписания создайте и опубликуйте новую версию.'); }}>Восстановить в черновик</button>
                        {selected.status === 'review' && <button disabled={busy} className={button} onClick={() => action(() => store.archiveScheduleRevision(selected.id))}>В архив</button>}
                    </div>
                    <div className="border-t border-gray-200 pt-4"><h3 className="font-medium">Изменения относительно {baseline ? `v${baseline.number}` : 'первой публикации'}</h3><p className="mt-1 text-sm text-gray-500">Добавлено: {diff.added.length} · Удалено: {diff.removed.length} · Изменено: {diff.changed.length} · Затронуто групп: {diff.groupIds.length}</p>
                        <div className="mt-3 max-h-[480px] overflow-y-auto divide-y divide-gray-200 text-sm">{diff.changed.map(item => <div key={item.after.id} className="py-3"><p className="text-gray-500 break-words">Было: {describe(item.before)}</p><p className="mt-1 text-emerald-800 break-words">Стало: {describe(item.after)}</p></div>)}{diff.added.map(item => <p key={'add-' + item.id} className="py-3 text-emerald-800 break-words">Добавлено: {describe(item)}</p>)}{diff.removed.map(item => <p key={'remove-' + item.id} className="py-3 text-red-800 break-words">Удалено: {describe(item)}</p>)}</div>
                    </div>
                </section> : <p className="py-5 text-sm text-gray-500">Версий пока нет.</p>}
            </div>
        </>}
    </div>;
};
export default PublicationView;
