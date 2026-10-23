import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClassType, DeliveryMode, Elective } from '../types';
import { electiveParticipants, studentAttends } from '../utils/trajectories';
import { resolveParticipantEntry } from '../utils/participants';
import { expandScheduleOccurrences } from '../services/heuristicScheduler';
import { campusPlacementIssues, slotInterval } from '../services/campusTravel';
import { EditIcon, PlusIcon } from './icons';

const field = 'rounded border border-gray-300 bg-white p-2 text-sm';
const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];

export default function TrajectoryWorkspace({ calendar = false }: { calendar?: boolean }) {
    const store = useStore();
    const [studentId, setStudentId] = useState('');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<Elective | null>(null);
    const [participantMode, setParticipantMode] = useState<'students' | 'groups'>('students');
    const [error, setError] = useState('');
    const [period, setPeriod] = useState({ start: store.settings.semesterStart, end: store.settings.semesterEnd });
    const student = store.students.find(item => item.id === studentId);
    const slots = [...store.timeSlots, ...store.timeSlotsShortened, ...store.bellScheduleProfiles.flatMap(profile => profile.slots)];
    const personal = useMemo(() => {
        if (!student || !period.start || !period.end || period.end < period.start) return [];
        const selected = store.schedule.map(entry => {
            const resolved = resolveParticipantEntry(entry, store.academicWorks);
            return !resolved.groupId && !resolved.groupIds?.length && resolved.streamId ? { ...resolved, groupIds: store.streams.find(stream => stream.id === resolved.streamId)?.groupIds || [] } : resolved;
        }).filter(entry => studentAttends(entry, student));
        return expandScheduleOccurrences(store, selected, period).sort((a, b) => a.date!.localeCompare(b.date!) || (slotInterval(slots.find(slot => slot.id === a.timeSlotId))?.start || 0) - (slotInterval(slots.find(slot => slot.id === b.timeSlotId))?.start || 0));
    }, [student, store.schedule, store.academicWorks, store.streams, period, store.settings]);
    const edit = (item?: Elective) => {
        setError(''); setQuery('');
        setParticipantMode(item && !item.studentIds?.length ? 'groups' : 'students');
        setDraft(item ? { ...item } : { id: `elective-${Date.now()}-${Math.random()}`, name: '', subjectId: store.subjects[0]?.id || '', teacherId: store.teachers[0]?.id || '', groupId: '', groupIds: [], studentIds: student ? [student.id] : [], hoursPerSemester: 18, classType: ClassType.Elective, deliveryMode: DeliveryMode.Offline });
    };
    return <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Обучающийся<select aria-label="Обучающийся траектории" value={studentId} onChange={event => setStudentId(event.target.value)} className={`ml-2 max-w-full ${field}`}><option value="">{calendar ? 'Выберите обучающегося' : 'Все обучающиеся'}</option>{store.students.map(item => <option key={item.id} value={item.id}>{item.name} · {store.groups.find(group => group.id === item.groupId)?.number}</option>)}</select></label>
            {!calendar && <button onClick={() => edit()} className="ml-auto flex items-center gap-2 rounded bg-teal-700 px-3 py-2 text-sm text-white"><PlusIcon className="h-4 w-4" />Учебное объединение</button>}
            {calendar && <><label className="text-sm">С<input aria-label="Начало личного календаря" type="date" value={period.start} onChange={event => setPeriod({ ...period, start: event.target.value })} className={`ml-2 ${field}`} /></label><label className="text-sm">По<input type="date" value={period.end} onChange={event => setPeriod({ ...period, end: event.target.value })} className={`ml-2 ${field}`} /></label><span className="text-sm text-gray-600">Занятий: {personal.length}</span></>}
        </div>
        {!calendar && <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="border-y bg-gray-50"><tr>{['Объединение / дисциплина', 'Преподаватель', 'Состав', 'Часы / семестр', ''].map((label, index) => <th className="p-3" key={index}>{label}</th>)}</tr></thead><tbody>{store.electives.filter(item => !student || (item.studentIds?.length ? item.studentIds.includes(student.id) : (item.groupIds?.length ? item.groupIds : [item.groupId]).includes(student.groupId))).map(item => {
            const members = electiveParticipants(item, store.students, store.groups);
            return <tr key={item.id} className="border-b"><td className="p-3"><strong>{item.name}</strong><div className="text-gray-600">{store.subjects.find(subject => subject.id === item.subjectId)?.name} · {item.classType || ClassType.Elective}</div></td><td className="p-3">{store.teachers.find(teacher => teacher.id === item.teacherId)?.name}</td><td className="p-3">{members.studentIds.length ? `${members.studentIds.length} обучающихся` : `${members.groupIds.length} групп`}<div className="text-xs text-gray-500">{members.groupIds.map(id => store.groups.find(group => group.id === id)?.number || id).join(', ')}</div>{members.issues.map(issue => <div key={issue} className="text-red-700">{issue}</div>)}</td><td className="p-3">{item.hoursPerSemester} ч. · {item.semester || 'любой'}</td><td className="p-3"><button title={`Редактировать объединение ${item.name}`} onClick={() => edit(item)} className="p-2 text-blue-700"><EditIcon className="h-4 w-4" /></button></td></tr>;
        })}</tbody></table>{!store.electives.length && <p className="py-8 text-center text-gray-500">Учебных объединений нет</p>}</div>}
        {calendar && <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="border-y bg-gray-50"><tr>{['Дата', 'Время', 'Дисциплина', 'Преподаватель', 'Аудитория', 'Участие'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{personal.map((entry, index) => {
            const interval = slotInterval(slots.find(slot => slot.id === entry.timeSlotId));
            const collision = personal.some((other, otherIndex) => { const range = slotInterval(slots.find(slot => slot.id === other.timeSlotId)); return index !== otherIndex && entry.date === other.date && interval && range && interval.start < range.end && range.start < interval.end; });
            const room = store.classrooms.find(item => item.id === entry.classroomId);
            const mobility = room ? campusPlacementIssues(entry, room, slots.find(slot => slot.id === entry.timeSlotId), personal.filter(other => other.id !== entry.id && other.date === entry.date), store, slots, student ? [student] : []) : [];
            return <tr key={`${entry.id}-${entry.date}`} className={`border-b ${collision ? 'bg-red-50' : mobility.length ? 'bg-amber-50' : ''}`}><td className="p-3">{entry.date}</td><td className="p-3">{slots.find(slot => slot.id === entry.timeSlotId)?.time}</td><td className="p-3">{store.subjects.find(subject => subject.id === entry.subjectId)?.name}<div className="text-xs text-gray-500">{entry.classType}{collision ? ' · Пересечение занятий' : ''}</div>{mobility.map(issue => <div key={issue} className="text-xs text-amber-900">{issue}</div>)}</td><td className="p-3">{[entry.teacherId, ...(entry.additionalTeacherIds || [])].map(id => store.teachers.find(teacher => teacher.id === id)?.name || id).join(', ')}</td><td className="p-3">{store.classrooms.find(room => room.id === entry.classroomId)?.number}</td><td className="p-3">{entry.academicWorkId ? 'Работа / исследование' : entry.studentIds?.length ? 'Индивидуальная запись' : 'Учебная группа'}</td></tr>;
        })}</tbody></table>{!personal.length && <p className="py-8 text-center text-gray-500">{student ? 'В выбранном периоде занятий нет' : 'Обучающийся не выбран'}</p>}</div>}
        {draft && <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/50 p-4"><form aria-label="Учебное объединение" className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-auto rounded-lg bg-white p-5" onSubmit={event => { event.preventDefault(); try { if (participantMode === 'students' && !draft.studentIds?.length) throw new Error('Выберите хотя бы одного обучающегося.'); store.saveLearningGroup({ ...draft, studentIds: participantMode === 'students' ? draft.studentIds : undefined }); setDraft(null); } catch (reason) { setError(reason.message); } }}>
            <h2 className="text-lg font-semibold">Учебное объединение</h2>
            <label className="block text-sm">Название<input aria-label="Название объединения" required value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} className={`mt-1 w-full ${field}`} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Дисциплина<select aria-label="Дисциплина объединения" value={draft.subjectId} onChange={event => setDraft({ ...draft, subjectId: event.target.value })} className={`mt-1 w-full ${field}`}>{store.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm">Преподаватель<select value={draft.teacherId} onChange={event => setDraft({ ...draft, teacherId: event.target.value })} className={`mt-1 w-full ${field}`}>{store.teachers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="text-sm">Часы<input aria-label="Часы объединения" required type="number" min="1" max="2000" value={draft.hoursPerSemester} onChange={event => setDraft({ ...draft, hoursPerSemester: Number(event.target.value) })} className={`mt-1 w-full ${field}`} /></label><label className="text-sm">Семестр<input type="number" min="1" max="20" value={draft.semester || ''} onChange={event => setDraft({ ...draft, semester: event.target.value ? Number(event.target.value) : undefined })} className={`mt-1 w-full ${field}`} /></label>
                <label className="text-sm">Тип занятия<select value={draft.classType || ClassType.Elective} onChange={event => setDraft({ ...draft, classType: event.target.value as ClassType })} className={`mt-1 w-full ${field}`}>{Object.values(ClassType).map(type => <option key={type}>{type}</option>)}</select></label><label className="text-sm">Формат<select value={draft.deliveryMode || DeliveryMode.Offline} onChange={event => setDraft({ ...draft, deliveryMode: event.target.value as DeliveryMode })} className={`mt-1 w-full ${field}`}>{Object.values(DeliveryMode).map(mode => <option key={mode}>{mode}</option>)}</select></label>
            </div>
            <fieldset className="flex flex-wrap gap-4 border-y py-3"><legend className="text-sm font-semibold">Участники</legend>{(['students', 'groups'] as const).map(mode => <label key={mode} className="text-sm"><input type="radio" name="participantMode" checked={participantMode === mode} onChange={() => setParticipantMode(mode)} className="mr-2" />{mode === 'students' ? 'Выбранные обучающиеся' : 'Группы целиком'}</label>)}</fieldset>
            <input aria-label="Поиск участников" value={query} onChange={event => setQuery(event.target.value)} placeholder="ФИО или группа" className={`w-full ${field}`} />
            <div className="max-h-52 space-y-2 overflow-auto">{participantMode === 'students' ? store.students.filter(item => `${item.name} ${store.groups.find(group => group.id === item.groupId)?.number}`.toLowerCase().includes(query.toLowerCase())).map(item => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.studentIds?.includes(item.id) || false} onChange={() => setDraft({ ...draft, studentIds: toggle(draft.studentIds || [], item.id) })} />{item.name} · {store.groups.find(group => group.id === item.groupId)?.number}</label>) : store.groups.filter(group => group.number.toLowerCase().includes(query.toLowerCase())).map(group => <label key={group.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(draft.groupIds?.length ? draft.groupIds : [draft.groupId]).includes(group.id)} onChange={() => setDraft({ ...draft, groupIds: toggle(draft.groupIds?.length ? draft.groupIds : [draft.groupId].filter(Boolean), group.id), groupId: '' })} />{group.number}</label>)}</div>
            <fieldset><legend className="mb-2 text-sm font-semibold">Допустимые типы аудиторий</legend><div className="flex flex-wrap gap-3">{store.classroomTypes.map(type => <label key={type.id} className="text-sm"><input type="checkbox" checked={draft.classroomTypeIds?.includes(type.id) || false} onChange={() => setDraft({ ...draft, classroomTypeIds: toggle(draft.classroomTypeIds || [], type.id) })} className="mr-2" />{type.name}</label>)}</div></fieldset>
            {error && <p role="alert" className="whitespace-pre-line text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setDraft(null)} className={`px-3 ${field}`}>Отмена</button><button className="rounded bg-teal-700 px-3 py-2 text-sm text-white">Сохранить объединение</button></div>
        </form></div>}
    </section>;
}
