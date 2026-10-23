import React, { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ScheduleEntry } from '../types';
import { ChevronLeftIcon } from './icons';

export default function RepairPreviewModal() {
    const store = useStore();
    const [error, setError] = useState('');
    const preview = store.repairPreview;
    const describe = (entry: ScheduleEntry) => `${entry.date} · ${[...store.timeSlots, ...store.timeSlotsShortened, ...store.bellScheduleProfiles.flatMap(profile => profile.slots)].find(slot => slot.id === entry.timeSlotId)?.time || entry.timeSlotId} · ${store.classrooms.find(room => room.id === entry.classroomId)?.number || entry.classroomId} · ${store.teachers.find(teacher => teacher.id === entry.teacherId)?.name || entry.teacherId}`;
    return <>
        {store.canUndoRepair && !preview && <button title="Отменить последний ремонт" onClick={() => { try { store.undoScheduleRepair(); } catch (error) { alert(error.message); } }} className="fixed bottom-4 right-4 z-[70] rounded border bg-white p-3 shadow"><ChevronLeftIcon className="h-5 w-5" /></button>}
        {preview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-label="Предпросмотр исправления" className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5">
            <h2 className="text-xl font-semibold">Предпросмотр исправления</h2><p className="my-3 text-sm">{preview.message} · {preview.elapsedMs} мс</p>
            {!!preview.alternatives?.length && <label className="mb-4 block text-sm">Вариант исправления<select aria-label="Вариант исправления" value={preview.selectedAlternativeId} onChange={event => store.selectRepairAlternative(event.target.value)} className="mt-1 w-full rounded border p-2">{preview.alternatives.map((alternative, index) => <option key={alternative.id} value={alternative.id}>{index + 1}. Изменений: {alternative.changes.length}, оценка: {Math.round(alternative.score)}{alternative.warnings.length ? ' · Нежелательная замена' : ''}</option>)}</select></label>}
            {preview.alternatives?.find(item => item.id === preview.selectedAlternativeId)?.warnings.map(warning => <p key={warning} className="my-2 text-sm text-amber-800">{warning}</p>)}
            <div className="divide-y">{preview.changes.map(change => <div key={change.before.id} className="py-3 text-sm"><p className="font-semibold">{store.subjects.find(subject => subject.id === change.before.subjectId)?.name} · {change.before.classType}</p><p className="mt-2 text-red-800">Было: {describe(change.before)}</p><p className="mt-1 text-green-800">Станет: {describe(change.after)}</p></div>)}</div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => { store.dismissRepairPreview(); setError(''); }} className="rounded border px-3 py-2 text-sm">Отмена</button><button disabled={!preview.changes.length} onClick={() => { try { store.applyScheduleRepair(); setError(''); } catch (error) { setError(error.message); } }} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40">Применить исправление</button></div>
        </section></div>}
    </>;
}
