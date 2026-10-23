import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useStore } from '../hooks/useStore';
import { AcademicWork, ClassType, Group } from '../types';
import { EDUCATION_LEVEL_LABELS, getEducationLevel, getPlanForGroup } from '../utils/educationUtils';
import { isSemesterInCourse } from '../utils/semesterUtils';
import { toYYYYMMDD } from '../utils/dateUtils';
import { PlusIcon, EditIcon, TrashIcon, DocumentDownloadIcon, BookOpenIcon } from './icons';

const KINDS: Record<AcademicWork['kind'], string> = {
    coursework: 'Курсовая работа', courseProject: 'Курсовой проект', masterThesis: 'Магистерская диссертация',
    dissertation: 'Кандидатская диссертация', research: 'Научно-исследовательская работа',
};
const STATUSES: Record<AcademicWork['status'], string> = {
    planned: 'Тема согласуется', active: 'В работе', review: 'Рецензирование', ready: 'Допущена к защите', defended: 'Защищена',
};
const fieldClass = 'w-full rounded border border-gray-300 bg-white p-2 text-sm text-gray-900';
const makeId = () => `work-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const AcademicWorkManager: React.FC = () => {
    const { academicWorks, setAcademicWorks, groups, specialties, subjects, teachers, educationalPlans, schedule } = useStore();
    const [level, setLevel] = useState('all');
    const [query, setQuery] = useState('');
    const [kindFilter, setKindFilter] = useState('all');
    const [draft, setDraft] = useState<AcademicWork | null>(null);
    const [error, setError] = useState('');
    const today = toYYYYMMDD(new Date());
    const groupById = new Map<string, Group>(groups.map(group => [group.id, group]));
    const programOf = (groupId: string) => specialties.find(program => program.id === groupById.get(groupId)?.specialtyId);
    const visible = useMemo(() => academicWorks.filter(work => {
        const group = groups.find(item => item.id === work.groupId);
        const program = specialties.find(item => item.id === group?.specialtyId);
        return (level === 'all' || getEducationLevel(program) === level) && (kindFilter === 'all' || work.kind === kindFilter) &&
            [work.topic, work.studentName, group?.number, teachers.find(item => item.id === work.supervisorId)?.name, subjects.find(item => item.id === work.subjectId)?.name].join(' ').toLowerCase().includes(query.toLowerCase());
    }), [academicWorks, groups, specialties, teachers, subjects, level, kindFilter, query]);
    const deadlineCount = visible.filter(work => work.status !== 'defended' && work.dueDate && work.dueDate < today).length;
    const supervisorLoads = teachers.map(teacher => ({ teacher, count: visible.filter(work => work.supervisorId === teacher.id && work.status !== 'defended').length })).filter(item => item.count).sort((a, b) => b.count - a.count);

    const startWork = () => {
        const group = groups.find(item => level === 'all' || getEducationLevel(programOf(item.id)) === level) || groups[0];
        const education = getEducationLevel(programOf(group?.id));
        const kind: AcademicWork['kind'] = education === 'postgraduate' ? 'dissertation' : education === 'master' ? 'masterThesis' : 'coursework';
        setError('');
        setDraft({ id: makeId(), kind, topic: '', studentName: '', groupId: group?.id || '', subjectId: '', semester: (group?.course || 1) * 2 - 1, supervisorId: '', status: 'planned', milestones: [] });
    };
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (!draft) return;
        if (!draft.topic.trim() || !draft.studentName.trim() || !groups.some(group => group.id === draft.groupId) || !subjects.some(subject => subject.id === draft.subjectId) || !teachers.some(teacher => teacher.id === draft.supervisorId)) {
            setError('Укажите тему, обучающегося, действующие группу, дисциплину и научного руководителя.'); return;
        }
        if (!isSemesterInCourse(draft.semester, groupById.get(draft.groupId)?.course)) {
            setError('Семестр должен соответствовать курсу выбранной группы.'); return;
        }
        if (draft.grade !== undefined && (!Number.isInteger(draft.grade) || draft.grade < 2 || draft.grade > 5)) {
            setError('Оценка должна быть целым числом от 2 до 5.'); return;
        }
        const payload = { ...draft, topic: draft.topic.trim(), studentName: draft.studentName.trim() };
        setAcademicWorks(prev => prev.some(item => item.id === payload.id) ? prev.map(item => item.id === payload.id ? payload : item) : [...prev, payload]);
        setDraft(null);
    };
    const exportRegister = () => {
        const rows = visible.map(work => ({
            'Вид работы': KINDS[work.kind], 'Обучающийся': work.studentName, 'Группа': groupById.get(work.groupId)?.number || work.groupId,
            'Уровень': EDUCATION_LEVEL_LABELS[getEducationLevel(programOf(work.groupId))], 'Семестр': work.semester,
            'Дисциплина': subjects.find(item => item.id === work.subjectId)?.name || work.subjectId,
            'Тема': work.topic, 'Руководитель': teachers.find(item => item.id === work.supervisorId)?.name || work.supervisorId,
            'Рецензент': teachers.find(item => item.id === work.reviewerId)?.name || '', 'Статус': STATUSES[work.status],
            'Срок': work.dueDate || '', 'Оценка': work.grade ?? '', 'Результат': work.result || '',
            'Этапы': (work.milestones || []).map(item => `${item.completed ? '+' : '-'} ${item.title} ${item.dueDate || ''}`).join('; '),
        }));
        const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Реестр работ');
        XLSX.writeFile(book, `academic_works_${today}.xlsx`);
    };
    const draftGroup = draft && groupById.get(draft.groupId);
    const plan = draftGroup && getPlanForGroup(draftGroup, educationalPlans);
    const relevantPlanEntries = plan?.entries.filter(entry => entry.semester === draft?.semester) || [];

    return <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><BookOpenIcon className="h-6 w-6 text-teal-700" />Работы и исследования</h1><p className="mt-1 text-sm text-gray-600">Курсовые, магистерские и кандидатские диссертации, индивидуальные планы НИР</p></div>
            <div className="flex gap-2"><button onClick={exportRegister} disabled={!visible.length} title="Экспорт реестра в Excel" className="rounded border bg-white p-2 text-gray-700 disabled:opacity-40"><DocumentDownloadIcon className="h-5 w-5" /></button><button onClick={startWork} className="flex items-center gap-2 rounded bg-teal-700 px-3 py-2 text-sm font-semibold text-white"><PlusIcon className="h-4 w-4" />Новая работа</button></div>
        </header>
        <div className="grid grid-cols-2 gap-4 border-b pb-4 md:grid-cols-4">{[['Работ', visible.length], ['Допущены', visible.filter(item => item.status === 'ready').length], ['Защищены', visible.filter(item => item.status === 'defended').length], ['Просрочены', deadlineCount]].map(([name, value]) => <div key={name}><p className="text-xs text-gray-500">{name}</p><p className="text-2xl font-semibold text-gray-900">{value}</p></div>)}</div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3"><input aria-label="Поиск работ" value={query} onChange={event => setQuery(event.target.value)} placeholder="Тема, обучающийся, группа, руководитель" className={fieldClass} /><select aria-label="Уровень образования" value={level} onChange={event => setLevel(event.target.value)} className={fieldClass}><option value="all">Все уровни</option>{Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Вид работы" value={kindFilter} onChange={event => setKindFilter(event.target.value)} className={fieldClass}><option value="all">Все виды работ</option>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b bg-gray-100 text-xs text-gray-600"><tr>{['Обучающийся / группа', 'Работа / тема', 'Руководитель', 'Этапы', 'Статус / защита', ''].map((name, index) => <th key={index} className="p-3">{name}</th>)}</tr></thead><tbody>{visible.map(work => {
            const stages = work.milestones || [];
            const defense = schedule.find(entry => (entry.groupId === work.groupId || entry.groupIds?.includes(work.groupId)) && entry.subjectId === work.subjectId && [ClassType.CourseworkDefense, ClassType.ThesisDefense].includes(entry.classType));
            return <tr key={work.id} className="border-b"><td className="p-3 font-medium">{work.studentName}<p className="text-xs font-normal text-gray-500">{groupById.get(work.groupId)?.number} · {work.semester} семестр</p></td><td className="p-3"><span className="text-xs text-teal-700">{KINDS[work.kind]}</span><p className="max-w-sm break-words font-medium">{work.topic}</p></td><td className="p-3">{teachers.find(item => item.id === work.supervisorId)?.name || 'Не назначен'}</td><td className="p-3">{stages.filter(item => item.completed).length}/{stages.length}<p className={`text-xs ${work.dueDate && work.dueDate < today && work.status !== 'defended' ? 'text-red-700' : 'text-gray-500'}`}>{work.dueDate}</p></td><td className="p-3">{STATUSES[work.status]}{work.grade !== undefined && ` · ${work.grade}`}<p className="text-xs text-gray-500">{defense ? `Групповая защита: ${defense.date}` : 'Защита не назначена'}</p></td><td className="p-3"><div className="flex gap-2"><button title="Редактировать работу" onClick={() => { setError(''); setDraft({ ...work, milestones: (work.milestones || []).map(item => ({ ...item })) }); }}><EditIcon className="h-4 w-4 text-blue-700" /></button><button title="Удалить работу" onClick={() => { if (window.confirm(`Удалить работу «${work.topic}»?`)) setAcademicWorks(prev => prev.filter(item => item.id !== work.id)); }}><TrashIcon className="h-4 w-4 text-red-700" /></button></div></td></tr>;
        })}</tbody></table>{!visible.length && <p className="py-12 text-center text-sm text-gray-500">Работы по выбранным фильтрам отсутствуют.</p>}</div>
        {!!supervisorLoads.length && <section className="border-t pt-4"><h2 className="mb-2 font-semibold text-gray-900">Научное руководство: активные работы</h2><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">{supervisorLoads.map(item => <span key={item.teacher.id}>{item.teacher.name}: <strong>{item.count}</strong></span>)}</div></section>}
        {draft && <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 space-y-4"><h2 className="text-xl font-semibold">Работа и индивидуальный план</h2>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">Вид работы<select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as AcademicWork['kind'] })} className={fieldClass}>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">Обучающийся<input required value={draft.studentName} onChange={event => setDraft({ ...draft, studentName: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Группа / аспирантура<select required value={draft.groupId} onChange={event => setDraft({ ...draft, groupId: event.target.value, subjectId: '', semester: (groupById.get(event.target.value)?.course || 1) * 2 - 1 })} className={fieldClass}><option value="">Выберите группу</option>{groups.map(group => <option key={group.id} value={group.id}>{group.number} · {EDUCATION_LEVEL_LABELS[getEducationLevel(programOf(group.id))]}</option>)}</select></label>
                <label className="text-sm">Семестр<input type="number" min="1" required value={draft.semester} onChange={event => setDraft({ ...draft, semester: Number(event.target.value) })} className={fieldClass} /></label>
                <label className="text-sm sm:col-span-2">Дисциплина / НИР<select required value={draft.subjectId} onChange={event => setDraft({ ...draft, subjectId: event.target.value })} className={fieldClass}><option value="">Выберите дисциплину</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}{relevantPlanEntries.some(entry => entry.subjectId === subject.id) ? ' · в плане' : ''}</option>)}</select></label>
                <label className="text-sm sm:col-span-2">Тема<textarea required value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} className={fieldClass} /></label>
                {(['supervisorId', 'reviewerId'] as const).map(name => <label key={name} className="text-sm">{name === 'supervisorId' ? 'Научный руководитель' : 'Рецензент'}<select required={name === 'supervisorId'} value={draft[name] || ''} onChange={event => setDraft({ ...draft, [name]: event.target.value })} className={fieldClass}><option value="">Не назначен</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>)}
                <label className="text-sm">Статус<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as AcademicWork['status'] })} className={fieldClass}>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">Срок сдачи<input type="date" value={draft.dueDate || ''} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} className={fieldClass} /></label>
                <label className="text-sm">Оценка<input type="number" min="2" max="5" step="1" value={draft.grade ?? ''} onChange={event => setDraft({ ...draft, grade: event.target.value ? Number(event.target.value) : undefined })} className={fieldClass} /></label>
                <label className="text-sm">Результат / публикации<input value={draft.result || ''} onChange={event => setDraft({ ...draft, result: event.target.value })} className={fieldClass} /></label>
            </div>
            <fieldset className="border-t pt-3"><legend className="font-semibold">Индивидуальный план и контрольные точки</legend>{(draft.milestones || []).map((stage, index) => <div key={stage.id} className="mt-2 flex flex-wrap items-center gap-2"><input aria-label="Этап выполнен" type="checkbox" checked={stage.completed} onChange={event => setDraft({ ...draft, milestones: draft.milestones.map((item, position) => position === index ? { ...item, completed: event.target.checked } : item) })} /><input required aria-label="Название этапа" value={stage.title} onChange={event => setDraft({ ...draft, milestones: draft.milestones.map((item, position) => position === index ? { ...item, title: event.target.value } : item) })} className={`${fieldClass} flex-1 min-w-32`} /><input aria-label="Срок этапа" type="date" value={stage.dueDate || ''} onChange={event => setDraft({ ...draft, milestones: draft.milestones.map((item, position) => position === index ? { ...item, dueDate: event.target.value } : item) })} className="rounded border p-2 text-sm" /><button type="button" title="Удалить этап" onClick={() => setDraft({ ...draft, milestones: draft.milestones.filter(item => item.id !== stage.id) })}><TrashIcon className="h-4 w-4 text-red-600" /></button></div>)}<div className="mt-3 flex gap-3"><button type="button" onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, { id: makeId(), title: '', completed: false }] })} className="flex items-center gap-1 text-sm text-blue-700"><PlusIcon className="h-4 w-4" />Этап</button><button type="button" onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, ...['Утверждение темы', 'Обзор литературы', 'Исследование и результаты', 'Предзащита', 'Защита'].map(title => ({ id: makeId(), title, completed: false }))] })} className="text-sm text-teal-700">Добавить этапы исследования</button></div></fieldset>
            <label className="block text-sm">Примечания<textarea value={draft.notes || ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} className={fieldClass} /></label>
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setDraft(null)} className="rounded border px-3 py-2 text-sm">Отмена</button><button className="rounded bg-teal-700 px-4 py-2 text-sm text-white">Сохранить</button></div>
        </form></div>}
    </div>;
};
export default AcademicWorkManager;
