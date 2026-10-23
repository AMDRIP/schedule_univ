import React, { useState } from 'react';
import { AcademicWork, ScheduleEntry } from '../types';
import { useStore } from '../hooks/useStore';
import { AcademicEventRequest, planAcademicEvent } from '../services/academicEvents';

export default function AcademicEventPlanner({ work, onClose }: { work: AcademicWork; onClose: () => void }) {
    const store = useStore();
    const [request, setRequest] = useState<AcademicEventRequest>({ workId: work.id, kind: 'consultation', start: store.settings.semesterStart, end: store.settings.semesterEnd, committeeTeacherIds: [] });
    const [proposal, setProposal] = useState<ScheduleEntry | null>(null);
    const [issues, setIssues] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const update = (patch: Partial<AcademicEventRequest>) => { setRequest({ ...request, ...patch }); setProposal(null); setIssues([]); };
    return <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-label="Индивидуальное научное событие" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5">
        <h2 className="text-xl font-semibold">Индивидуальное научное событие</h2><p className="my-2 text-sm text-gray-600">{work.studentName} · {work.topic}</p>
        <form className="space-y-4" onSubmit={async event => { event.preventDefault(); setBusy(true); setIssues([]); try { const result = await planAcademicEvent(store, request); setProposal(result.entry || null); setIssues(result.issues); } catch (error) { setIssues([error.message]); } finally { setBusy(false); } }}>
            <label className="block text-sm">Событие<select aria-label="Вид научного события" value={request.kind} onChange={event => update({ kind: event.target.value as typeof request.kind })} className="mt-1 w-full rounded border p-2"><option value="consultation">Консультация</option><option value="predefense">Предзащита</option><option value="defense">Защита</option></select></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Не раньше<input required type="date" value={request.start} onChange={event => update({ start: event.target.value })} className="mt-1 w-full rounded border p-2" /></label><label className="text-sm">Не позже<input required type="date" value={request.end} onChange={event => update({ end: event.target.value })} className="mt-1 w-full rounded border p-2" /></label></div>
            <p className="border-y py-2 text-sm">Руководитель: {store.teachers.find(item => item.id === work.supervisorId)?.name || 'Не назначен'}{request.kind !== 'consultation' && work.reviewerId ? ` · Рецензент: ${store.teachers.find(item => item.id === work.reviewerId)?.name || 'Не найден'}` : ''}</p>
            <fieldset><legend className="mb-2 text-sm font-semibold">Комиссия</legend><div className="max-h-40 space-y-2 overflow-auto">{store.teachers.filter(item => item.id !== work.supervisorId && (request.kind === 'consultation' || item.id !== work.reviewerId)).map(teacher => <label key={teacher.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={request.committeeTeacherIds.includes(teacher.id)} onChange={event => update({ committeeTeacherIds: event.target.checked ? [...request.committeeTeacherIds, teacher.id] : request.committeeTeacherIds.filter(id => id !== teacher.id) })} />{teacher.name}</label>)}</div></fieldset>
            {!!issues.length && <ul role="alert" className="space-y-1 text-sm text-red-700">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
            {proposal && <div className="border-y py-3 text-sm text-green-800"><p className="font-semibold">Свободное время найдено</p><p>{proposal.date} · {store.timeSlots.concat(store.timeSlotsShortened, store.bellScheduleProfiles.flatMap(profile => profile.slots)).find(slot => slot.id === proposal.timeSlotId)?.time || proposal.timeSlotId} · Ауд. {store.classrooms.find(room => room.id === proposal.classroomId)?.number}</p></div>}
            <div className="flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded border px-3 py-2 text-sm">Отмена</button><button disabled={busy} className="rounded border px-3 py-2 text-sm">{busy ? 'Подбор времени...' : 'Подобрать время'}</button>{proposal && <button type="button" onClick={() => { try { store.addScheduleEntry(proposal); onClose(); } catch (error) { setIssues([error.message]); } }} className="rounded bg-teal-700 px-3 py-2 text-sm text-white">Добавить в расписание</button>}</div>
        </form>
    </section></div>;
}
