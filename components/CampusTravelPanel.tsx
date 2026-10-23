import React, { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { campusPlacementIssues, DEFAULT_TRAVEL_POLICY } from '../services/campusTravel';
import { expandScheduleOccurrences, getActiveTimeSlotsForDate } from '../services/heuristicScheduler';
import { ScheduleEntry } from '../types';

export default function CampusTravelPanel() {
    const store = useStore();
    const [policy, setPolicy] = useState({ ...DEFAULT_TRAVEL_POLICY, ...store.settings.travelPolicy });
    const [saved, setSaved] = useState(false);
    const [audit, setAudit] = useState<{ entry: ScheduleEntry; issues: string[] }[] | null>(null);
    useEffect(() => { setPolicy({ ...DEFAULT_TRAVEL_POLICY, ...store.settings.travelPolicy }); }, [store.settings.travelPolicy]);
    useEffect(() => setAudit(null), [store.settings, store.buildingPlans, store.schedule, store.classrooms, store.students, store.timeSlots, store.timeSlotsShortened, store.bellScheduleProfiles]);
    const checkSchedule = () => {
        const occurrences = expandScheduleOccurrences(store, store.schedule, { start: store.settings.semesterStart, end: store.settings.semesterEnd });
        const days = new Map<string, ScheduleEntry[]>();
        occurrences.forEach(entry => { const list = days.get(entry.date!) || []; list.push(entry); days.set(entry.date!, list); });
        const result: NonNullable<typeof audit> = [];
        days.forEach(entries => {
            const slots = [...getActiveTimeSlotsForDate(store, entries[0].date!), ...store.timeSlots, ...store.timeSlotsShortened, ...store.bellScheduleProfiles.flatMap(profile => profile.slots)];
            entries.forEach(entry => { const room = store.classrooms.find(item => item.id === entry.classroomId); if (!room) return; const issues = campusPlacementIssues(entry, room, slots.find(slot => slot.id === entry.timeSlotId), entries.filter(other => other.id !== entry.id), store, slots); if (issues.length) result.push({ entry, issues }); });
        });
        setAudit(result);
    };
    const updateRoute = (a: string, b: string, value: string) => {
        if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 720)) return;
        store.setBuildingPlans(plans => plans.map(plan => {
            if (plan.id !== a && plan.id !== b) return plan;
            const routes = { ...plan.travelMinutesTo };
            const target = plan.id === a ? b : a;
            if (value === '') delete routes[target]; else routes[target] = Number(value);
            return { ...plan, travelMinutesTo: routes, updatedAt: new Date().toISOString() };
        }));
    };
    return <section className="space-y-6">
        {!!store.classrooms.filter(room => !room.roomMetadata?.buildingPlanId || room.roomMetadata?.floorNumber === undefined).length && <p role="status" className="border-l-4 border-amber-500 pl-3 text-sm text-amber-900">Не задано расположение: {store.classrooms.filter(room => !room.roomMetadata?.buildingPlanId || room.roomMetadata?.floorNumber === undefined).length} ауд. Проверка переходов для них неполная.</p>}
        <form aria-label="Время переходов" className="space-y-4 border-b pb-5" onSubmit={event => { event.preventDefault(); store.updateSettings({ ...store.settings, travelPolicy: policy }); setSaved(true); }}>
            <h2 className="text-lg font-semibold">Переходы между занятиями</h2><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={event => { setPolicy({ ...policy, enabled: event.target.checked }); setSaved(false); }} />Учитывать время переходов</label>
            <div className="grid gap-4 sm:grid-cols-3">{([['sameBuildingMinutes', 'Между аудиториями, мин.'], ['perFloorMinutes', 'Дополнительно на этаж, мин.'], ['betweenBuildingsMinutes', 'Между корпусами по умолчанию, мин.']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input required aria-label={label} type="number" min="0" max="720" value={policy[key]} onChange={event => { setPolicy({ ...policy, [key]: Number(event.target.value) }); setSaved(false); }} className="mt-1 w-full rounded border p-2" /></label>)}</div><div className="flex items-center gap-3"><button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Сохранить переходы</button>{saved && <span role="status" className="text-sm text-green-700">Сохранено</span>}</div>
        </form>
        <section className="space-y-3 border-b pb-4"><div className="flex flex-wrap items-center gap-3"><button onClick={checkSchedule} className="rounded border px-3 py-2 text-sm">Проверить переходы и доступность</button>{audit && <span role="status" className={`text-sm ${audit.length ? 'text-red-700' : 'text-green-700'}`}>Занятий с замечаниями: {audit.length}</span>}</div>{audit && audit.length > 0 && <ul className="max-h-64 space-y-2 overflow-auto text-sm">{audit.slice(0, 50).map(({ entry, issues }) => <li key={`${entry.id}-${entry.date}`} className="border-l-2 border-red-400 pl-3"><strong>{entry.date} · {store.subjects.find(item => item.id === entry.subjectId)?.name}</strong><div>{issues.join(' ')}</div></li>)}</ul>}</section>
        <section><h2 className="mb-3 text-lg font-semibold">Маршруты между корпусами, мин.</h2><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Корпус</th>{store.buildingPlans.map(plan => <th className="p-2" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>{store.buildingPlans.map((from, index) => <tr key={from.id} className="border-t"><th className="p-2">{from.name}</th>{store.buildingPlans.map((to, other) => <td key={to.id} className="p-2">{index === other ? '0' : index < other ? <input aria-label={`Переход ${from.name} — ${to.name}`} type="number" min="0" max="720" placeholder={`${policy.betweenBuildingsMinutes}`} value={from.travelMinutesTo?.[to.id] ?? ''} onChange={event => updateRoute(from.id, to.id, event.target.value)} className="w-24 rounded border p-2" /> : from.travelMinutesTo?.[to.id] ?? policy.betweenBuildingsMinutes}</td>)}</tr>)}</tbody></table></div>{!store.buildingPlans.length && <p className="py-4 text-sm text-gray-500">Корпуса не добавлены</p>}</section>
        <section><h2 className="mb-3 text-lg font-semibold">Безбарьерный доступ по этажам</h2><div className="space-y-3">{store.buildingPlans.map(plan => <div key={plan.id} className="flex flex-wrap items-center gap-4 border-b pb-3"><strong className="text-sm">{plan.name}</strong>{plan.floors.map(floor => <label key={floor.id} className="text-sm"><input type="checkbox" checked={floor.stepFreeAccess === true} onChange={event => { const checked = event.target.checked; store.setBuildingPlans(plans => plans.map(item => item.id === plan.id ? { ...item, floors: item.floors.map(value => value.id === floor.id ? { ...value, stepFreeAccess: checked } : value), updatedAt: new Date().toISOString() } : item)); }} className="mr-2" />{floor.name}</label>)}</div>)}</div></section>
        <section><h2 className="mb-3 text-lg font-semibold">Расположение аудиторий</h2>
            <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Аудитория</th><th className="p-2">Корпус</th><th className="p-2">Этаж</th><th className="p-2">Безбарьерный доступ</th></tr></thead>
                <tbody>{store.classrooms.map(room => <tr key={room.id} className="border-t"><td className="p-2">{room.number}</td>
                    <td className="p-2"><select aria-label={`Корпус аудитории ${room.number}`} disabled={!!room.roomMetadata?.roomId} title={room.roomMetadata?.roomId ? 'Расположение задаётся планом здания' : undefined} value={room.roomMetadata?.buildingPlanId || ''} onChange={event => {
                        const plan = store.buildingPlans.find(item => item.id === event.target.value);
                        store.updateItem('classrooms', { ...room, roomMetadata: { ...room.roomMetadata, buildingPlanId: plan?.id, buildingName: plan?.name, floorId: undefined, floorNumber: undefined } });
                    }} className="max-w-56 rounded border p-2"><option value="">Не задан</option>{store.buildingPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></td>
                    <td className="p-2"><select aria-label={`Этаж аудитории ${room.number}`} disabled={!!room.roomMetadata?.roomId} title={room.roomMetadata?.roomId ? 'Расположение задаётся планом здания' : undefined} value={room.roomMetadata?.floorId || ''} onChange={event => {
                        const floor = store.buildingPlans.find(plan => plan.id === room.roomMetadata?.buildingPlanId)?.floors.find(item => item.id === event.target.value);
                        store.updateItem('classrooms', { ...room, roomMetadata: { ...room.roomMetadata, floorId: floor?.id, floorNumber: floor?.number } });
                    }} className="rounded border p-2"><option value="">Не задан</option>{store.buildingPlans.find(plan => plan.id === room.roomMetadata?.buildingPlanId)?.floors.map(floor => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></td>
                    <td className="p-2"><select aria-label={`Доступность аудитории ${room.number}`} value={room.stepFreeAccess === undefined ? '' : String(room.stepFreeAccess)} onChange={event => store.updateItem('classrooms', { ...room, stepFreeAccess: event.target.value === '' ? undefined : event.target.value === 'true' })} className="rounded border p-2"><option value="">По этажу / неизвестно</option><option value="true">Подтверждён</option><option value="false">Недоступно</option></select></td>
                </tr>)}</tbody>
            </table></div>
        </section>
    </section>;
}
