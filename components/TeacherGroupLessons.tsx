import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClassType, LessonPlan, ScheduleEntry } from '../types';
import LessonPlanModal from './LessonPlanModal';
import {
    AcademicCapIcon,
    BookOpenIcon,
    BuildingOfficeIcon,
    CalendarIcon,
    CheckCircleIcon,
    ClockIcon,
    CopyIcon,
    DocumentDownloadIcon,
    DocumentSearchIcon,
    DocumentTextIcon,
    PencilSquareIcon,
    PlusIcon,
    UserGroupIcon,
    XCircleIcon,
} from './icons';

type PlanStatusFilter = 'all' | 'missing' | 'draft' | 'ready' | 'approved';
type LessonPlanStatus = NonNullable<LessonPlan['status']>;

interface LessonRow {
    entry: ScheduleEntry;
    subjectName: string;
    teacherName: string;
    groupName: string;
    classroomNumber: string;
    timeLabel: string;
    dateLabel: string;
    status: PlanStatusFilter;
    completeness: number;
}

const statusLabels: Record<LessonPlanStatus, string> = {
    draft: 'Черновик',
    ready: 'Готово',
    approved: 'Утверждено',
};

const statusStyles: Record<PlanStatusFilter, string> = {
    all: 'bg-gray-100 text-gray-700 border-gray-200',
    missing: 'bg-red-50 text-red-700 border-red-200',
    draft: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    ready: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
};

const classTypeStyles: Record<string, string> = {
    [ClassType.Lecture]: 'bg-blue-50 text-blue-800 border-blue-200',
    [ClassType.Practical]: 'bg-green-50 text-green-800 border-green-200',
    [ClassType.Lab]: 'bg-purple-50 text-purple-800 border-purple-200',
    [ClassType.Consultation]: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    [ClassType.PracticeConsultation]: 'bg-teal-50 text-teal-800 border-teal-200',
    [ClassType.PracticeDefense]: 'bg-orange-50 text-orange-800 border-orange-200',
    [ClassType.Exam]: 'bg-red-50 text-red-800 border-red-200',
    [ClassType.Test]: 'bg-pink-50 text-pink-800 border-pink-200',
    [ClassType.Elective]: 'bg-indigo-50 text-indigo-800 border-indigo-200',
};

const dayOrder = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const normalizeStatus = (entry: ScheduleEntry): PlanStatusFilter => {
    if (!entry.lessonPlan) return 'missing';
    return entry.lessonPlan.status || 'draft';
};

const getPlanCompleteness = (plan?: LessonPlan) => {
    if (!plan) return 0;
    const checks = [
        !!plan.topic?.trim(),
        !!plan.goal?.trim(),
        !!plan.content?.trim(),
        !!plan.homework?.trim(),
        !!plan.learningOutcomes?.trim(),
        !!plan.assessment?.trim(),
        (plan.stages?.length || 0) > 0,
        (plan.controlQuestions?.length || 0) > 0,
        (plan.materials?.length || 0) > 0,
        (plan.literature?.length || 0) > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const createDraftPlan = (row: LessonRow): LessonPlan => ({
    topic: row.subjectName,
    content: '',
    homework: '',
    status: 'draft',
    goal: `Подготовить и провести занятие по теме "${row.subjectName}".`,
    learningOutcomes: '',
    stages: [
        { title: 'Вводная часть', minutes: 10, activity: 'Проверка готовности, актуализация предыдущего материала.' },
        { title: 'Основная часть', minutes: 70, activity: '' },
        { title: 'Итоги', minutes: 10, activity: 'Подведение итогов, ответы на вопросы, домашнее задание.' },
    ],
    controlQuestions: [],
    materials: [],
    literature: [],
    equipment: [],
    assessment: '',
    teacherNotes: '',
    updatedAt: new Date().toISOString(),
});

const clonePlan = (plan: LessonPlan): LessonPlan => ({
    ...plan,
    stages: plan.stages?.map(stage => ({ ...stage })) || [],
    controlQuestions: [...(plan.controlQuestions || [])],
    materials: [...(plan.materials || [])],
    literature: [...(plan.literature || [])],
    equipment: [...(plan.equipment || [])],
    updatedAt: new Date().toISOString(),
});

const TeacherGroupLessons: React.FC = () => {
    const {
        schedule,
        teachers,
        groups,
        subjects,
        classrooms,
        timeSlots,
        updateScheduleEntry,
        setSchedule,
    } = useStore();

    const [selectedTeacherId, setSelectedTeacherId] = useState('all');
    const [selectedGroupId, setSelectedGroupId] = useState('all');
    const [selectedSubjectId, setSelectedSubjectId] = useState('all');
    const [selectedClassType, setSelectedClassType] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState<PlanStatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
    const [copiedPlan, setCopiedPlan] = useState<LessonPlan | null>(null);

    const rows = useMemo<LessonRow[]>(() => {
        return schedule
            .map(entry => {
                const subjectName = subjects.find(subject => subject.id === entry.subjectId)?.name || 'Неизвестная дисциплина';
                const teacherName = teachers.find(teacher => teacher.id === entry.teacherId)?.name || 'Неизвестный преподаватель';
                const groupNames = [
                    ...(entry.groupId ? [entry.groupId] : []),
                    ...(entry.groupIds || []),
                ]
                    .map(groupId => groups.find(group => group.id === groupId)?.number)
                    .filter(Boolean);
                const groupName = Array.from(new Set(groupNames)).join(', ') || 'Группа не указана';
                const classroomNumber = classrooms.find(classroom => classroom.id === entry.classroomId)?.number || 'Н/Д';
                const timeLabel = timeSlots.find(timeSlot => timeSlot.id === entry.timeSlotId)?.time || 'Н/Д';
                const dateLabel = formatDate(entry);
                const status = normalizeStatus(entry);
                return {
                    entry,
                    subjectName,
                    teacherName,
                    groupName,
                    classroomNumber,
                    timeLabel,
                    dateLabel,
                    status,
                    completeness: getPlanCompleteness(entry.lessonPlan),
                };
            })
            .sort((a, b) => {
                if (a.entry.date && b.entry.date) {
                    return a.entry.date.localeCompare(b.entry.date) || a.timeLabel.localeCompare(b.timeLabel);
                }
                const dayCompare = dayOrder.indexOf(a.entry.day) - dayOrder.indexOf(b.entry.day);
                return dayCompare || a.timeLabel.localeCompare(b.timeLabel);
            });
    }, [schedule, subjects, teachers, groups, classrooms, timeSlots]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return rows.filter(row => {
            if (selectedTeacherId !== 'all' && row.entry.teacherId !== selectedTeacherId) return false;
            if (selectedGroupId !== 'all' && row.entry.groupId !== selectedGroupId && !row.entry.groupIds?.includes(selectedGroupId)) return false;
            if (selectedSubjectId !== 'all' && row.entry.subjectId !== selectedSubjectId) return false;
            if (selectedClassType !== 'all' && row.entry.classType !== selectedClassType) return false;
            if (selectedStatus !== 'all' && row.status !== selectedStatus) return false;
            if (query) {
                const haystack = [
                    row.subjectName,
                    row.teacherName,
                    row.groupName,
                    row.classroomNumber,
                    row.entry.classType,
                    row.entry.lessonPlan?.topic,
                    row.entry.lessonPlan?.content,
                    row.entry.lessonPlan?.homework,
                ].join(' ').toLowerCase();
                if (!haystack.includes(query)) return false;
            }
            return true;
        });
    }, [rows, selectedTeacherId, selectedGroupId, selectedSubjectId, selectedClassType, selectedStatus, searchQuery]);

    const stats = useMemo(() => {
        const total = rows.length;
        const withPlans = rows.filter(row => row.status !== 'missing').length;
        const approved = rows.filter(row => row.status === 'approved').length;
        const ready = rows.filter(row => row.status === 'ready').length;
        const missing = rows.filter(row => row.status === 'missing').length;
        const averageCompleteness = withPlans
            ? Math.round(rows.reduce((sum, row) => sum + row.completeness, 0) / withPlans)
            : 0;
        return {
            total,
            withPlans,
            approved,
            ready,
            missing,
            averageCompleteness,
            coverage: total ? Math.round((withPlans / total) * 100) : 0,
        };
    }, [rows]);

    const handleSaveLessonPlan = (updatedEntry: ScheduleEntry) => {
        updateScheduleEntry(updatedEntry);
        setEditingEntry(null);
    };

    const handleCreateDrafts = () => {
        const rowsWithoutPlans = filteredRows.filter(row => !row.entry.lessonPlan);
        if (rowsWithoutPlans.length === 0) {
            alert('В текущей выборке нет занятий без плана.');
            return;
        }
        if (!window.confirm(`Создать черновики планов для ${rowsWithoutPlans.length} занятий в текущей выборке?`)) {
            return;
        }
        const draftById = new Map(rowsWithoutPlans.map(row => [row.entry.id, createDraftPlan(row)]));
        setSchedule(schedule.map(entry => draftById.has(entry.id) ? { ...entry, lessonPlan: draftById.get(entry.id) } : entry));
        alert(`Создано черновиков: ${rowsWithoutPlans.length}.`);
    };

    const handlePastePlan = (entry: ScheduleEntry) => {
        if (!copiedPlan) return;
        updateScheduleEntry({ ...entry, lessonPlan: clonePlan(copiedPlan) });
    };

    const handleExport = () => {
        if (filteredRows.length === 0) {
            alert('Нет строк для экспорта.');
            return;
        }
        const header = ['Дата', 'Время', 'Группа', 'Преподаватель', 'Дисциплина', 'Тип', 'Аудитория', 'Статус', 'Заполненность', 'Тема'];
        const escape = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const body = filteredRows.map(row => [
            row.dateLabel,
            row.timeLabel,
            row.groupName,
            row.teacherName,
            row.subjectName,
            row.entry.classType,
            row.classroomNumber,
            row.status === 'missing' ? 'Нет плана' : statusLabels[row.status as LessonPlanStatus],
            `${row.completeness}%`,
            row.entry.lessonPlan?.topic || '',
        ].map(escape).join(';'));
        const blob = new Blob([`\uFEFF${[header.map(escape).join(';'), ...body].join('\n')}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `lesson-plans-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const currentEditingRow = editingEntry ? rows.find(row => row.entry.id === editingEntry.id) : null;

    return (
        <div className="flex h-full flex-col bg-gray-100">
            <div className="border-b border-gray-200 bg-white px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <DocumentTextIcon className="h-8 w-8 text-blue-600" />
                            <h1 className="text-2xl font-semibold text-gray-900">Планы занятий</h1>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">Методическая готовность занятий, статусы, материалы и контроль заполнения.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleCreateDrafts}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Создать черновики
                        </button>
                        <button
                            type="button"
                            onClick={handleExport}
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                            <DocumentDownloadIcon className="h-4 w-4" />
                            Экспорт CSV
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 md:grid-cols-6">
                <Metric label="Всего занятий" value={stats.total} icon={<CalendarIcon className="h-5 w-5" />} />
                <Metric label="С планами" value={`${stats.coverage}%`} icon={<BookOpenIcon className="h-5 w-5" />} />
                <Metric label="Нет плана" value={stats.missing} icon={<XCircleIcon className="h-5 w-5" />} />
                <Metric label="Готово" value={stats.ready} icon={<CheckCircleIcon className="h-5 w-5" />} />
                <Metric label="Утверждено" value={stats.approved} icon={<CheckCircleIcon className="h-5 w-5" />} />
                <Metric label="Заполненность" value={`${stats.averageCompleteness}%`} icon={<DocumentSearchIcon className="h-5 w-5" />} />
            </div>

            <div className="border-b border-gray-200 bg-white px-6 py-4">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1fr]">
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Поиск по дисциплине, теме, преподавателю, группе"
                    />
                    <FilterSelect value={selectedTeacherId} onChange={setSelectedTeacherId} icon={<AcademicCapIcon className="h-4 w-4" />}>
                        <option value="all">Все преподаватели</option>
                        {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                    </FilterSelect>
                    <FilterSelect value={selectedGroupId} onChange={setSelectedGroupId} icon={<UserGroupIcon className="h-4 w-4" />}>
                        <option value="all">Все группы</option>
                        {groups.map(group => <option key={group.id} value={group.id}>{group.number}</option>)}
                    </FilterSelect>
                    <FilterSelect value={selectedSubjectId} onChange={setSelectedSubjectId} icon={<BookOpenIcon className="h-4 w-4" />}>
                        <option value="all">Все дисциплины</option>
                        {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                    </FilterSelect>
                    <FilterSelect value={selectedClassType} onChange={setSelectedClassType} icon={<ClockIcon className="h-4 w-4" />}>
                        <option value="all">Все типы</option>
                        {Object.values(ClassType).map(classType => <option key={classType} value={classType}>{classType}</option>)}
                    </FilterSelect>
                    <FilterSelect value={selectedStatus} onChange={(value) => setSelectedStatus(value as PlanStatusFilter)} icon={<CheckCircleIcon className="h-4 w-4" />}>
                        <option value="all">Все статусы</option>
                        <option value="missing">Нет плана</option>
                        <option value="draft">Черновик</option>
                        <option value="ready">Готово</option>
                        <option value="approved">Утверждено</option>
                    </FilterSelect>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-6">
                <div className="mb-3 flex items-center justify-between text-sm text-gray-600">
                    <span>Показано: <strong className="text-gray-900">{filteredRows.length}</strong></span>
                    {copiedPlan && <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">План скопирован: {copiedPlan.topic || 'без темы'}</span>}
                </div>

                {filteredRows.length === 0 ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
                        <div className="text-center">
                            <DocumentSearchIcon className="mx-auto h-12 w-12 text-gray-300" />
                            <h3 className="mt-3 text-lg font-semibold text-gray-800">Занятия не найдены</h3>
                            <p className="mt-1 text-sm text-gray-500">Измените фильтры или сформируйте расписание.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <Th>Дата и время</Th>
                                    <Th>Занятие</Th>
                                    <Th>Преподаватель и группа</Th>
                                    <Th>Статус</Th>
                                    <Th>Заполненность</Th>
                                    <Th>Действия</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRows.map(row => (
                                    <tr key={row.entry.id} className="hover:bg-blue-50/40">
                                        <td className="whitespace-nowrap px-4 py-3 align-top text-sm text-gray-700">
                                            <div className="font-medium text-gray-900">{row.dateLabel}</div>
                                            <div className="mt-1 flex items-center gap-1 text-gray-500">
                                                <ClockIcon className="h-4 w-4" />
                                                {row.timeLabel}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="max-w-xl text-sm font-semibold text-gray-900">{row.subjectName}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${classTypeStyles[row.entry.classType] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                                    {row.entry.classType}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                                    <BuildingOfficeIcon className="h-3.5 w-3.5" />
                                                    {row.classroomNumber}
                                                </span>
                                            </div>
                                            {row.entry.lessonPlan?.topic && (
                                                <div className="mt-2 text-sm text-gray-600">Тема: {row.entry.lessonPlan.topic}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 align-top text-sm text-gray-700">
                                            <div className="font-medium text-gray-900">{row.teacherName}</div>
                                            <div className="mt-1 text-gray-500">{row.groupName}</div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusStyles[row.status]}`}>
                                                {row.status === 'missing' ? 'Нет плана' : statusLabels[row.status as LessonPlanStatus]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="h-2 w-28 rounded-full bg-gray-100">
                                                <div className="h-2 rounded-full bg-blue-600" style={{ width: `${row.completeness}%` }} />
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">{row.completeness}%</div>
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingEntry(row.entry)}
                                                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                                >
                                                    <PencilSquareIcon className="h-3.5 w-3.5" />
                                                    {row.entry.lessonPlan ? 'Открыть' : 'Создать'}
                                                </button>
                                                {row.entry.lessonPlan && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setCopiedPlan(clonePlan(row.entry.lessonPlan!))}
                                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <CopyIcon className="h-3.5 w-3.5" />
                                                        Копировать
                                                    </button>
                                                )}
                                                {copiedPlan && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handlePastePlan(row.entry)}
                                                        className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                                    >
                                                        <DocumentTextIcon className="h-3.5 w-3.5" />
                                                        Вставить
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editingEntry && currentEditingRow && (
                <LessonPlanModal
                    isOpen={!!editingEntry}
                    onClose={() => setEditingEntry(null)}
                    entry={editingEntry}
                    onSave={handleSaveLessonPlan}
                    subjectName={currentEditingRow.subjectName}
                    groupName={currentEditingRow.groupName}
                    dateStr={`${currentEditingRow.dateLabel}, ${currentEditingRow.timeLabel}`}
                />
            )}
        </div>
    );
};

const formatDate = (entry: ScheduleEntry) => {
    if (entry.date) {
        return new Date(entry.date + 'T00:00:00').toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }
    const weekLabel = entry.weekType === 'even' ? 'чётная' : entry.weekType === 'odd' ? 'нечётная' : 'каждая';
    return `${entry.day} (${weekLabel})`;
};

const Metric: React.FC<{ label: string; value: string | number; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-gray-500">
            {icon}
            <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
);

const FilterSelect: React.FC<{
    value: string;
    onChange: (value: string) => void;
    icon: React.ReactNode;
    children: React.ReactNode;
}> = ({ value, onChange, icon, children }) => (
    <label className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        >
            {children}
        </select>
    </label>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{children}</th>
);

export default TeacherGroupLessons;
