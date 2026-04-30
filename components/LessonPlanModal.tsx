import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { ScheduleEntry, LessonPlan } from '../types';
import { BookOpenIcon, CheckCircleIcon, ClockIcon, DocumentTextIcon, PlusIcon, TrashIcon, XMarkIcon } from './icons';

interface LessonPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    entry: ScheduleEntry;
    onSave: (updatedEntry: ScheduleEntry) => void;
    subjectName: string;
    groupName: string;
    dateStr: string;
}

type LessonPlanStatus = NonNullable<LessonPlan['status']>;
type ListField = 'controlQuestions' | 'materials' | 'literature' | 'equipment';

const emptyStage = { title: '', minutes: 15, activity: '' };

const getDefaultPlan = (subjectName: string): LessonPlan => ({
    topic: subjectName,
    content: '',
    homework: '',
    status: 'draft',
    goal: '',
    learningOutcomes: '',
    stages: [
        { title: 'Организационный этап', minutes: 5, activity: 'Проверка готовности группы, постановка темы и целей занятия.' },
        { title: 'Основная часть', minutes: 70, activity: '' },
        { title: 'Итоги и задание', minutes: 15, activity: 'Подведение итогов, ответы на вопросы, выдача задания.' },
    ],
    controlQuestions: [],
    materials: [],
    literature: [],
    equipment: [],
    assessment: '',
    teacherNotes: '',
});

const normalizePlan = (plan: LessonPlan | undefined, subjectName: string): LessonPlan => ({
    ...getDefaultPlan(subjectName),
    ...(plan || {}),
    status: plan?.status || 'draft',
    stages: plan?.stages?.length ? plan.stages : getDefaultPlan(subjectName).stages,
    controlQuestions: plan?.controlQuestions || [],
    materials: plan?.materials || [],
    literature: plan?.literature || [],
    equipment: plan?.equipment || [],
});

const statusLabels: Record<LessonPlanStatus, string> = {
    draft: 'Черновик',
    ready: 'Готово',
    approved: 'Утверждено',
};

const LessonPlanModal: React.FC<LessonPlanModalProps> = ({ isOpen, onClose, entry, onSave, subjectName, groupName, dateStr }) => {
    const [plan, setPlan] = useState<LessonPlan>(() => normalizePlan(entry.lessonPlan, subjectName));
    const [quickListValues, setQuickListValues] = useState<Record<ListField, string>>({
        controlQuestions: '',
        materials: '',
        literature: '',
        equipment: '',
    });

    useEffect(() => {
        setPlan(normalizePlan(entry.lessonPlan, subjectName));
    }, [entry, subjectName]);

    const totalMinutes = useMemo(
        () => (plan.stages || []).reduce((sum, stage) => sum + (Number(stage.minutes) || 0), 0),
        [plan.stages]
    );

    if (!isOpen) return null;

    const updateField = <K extends keyof LessonPlan>(field: K, value: LessonPlan[K]) => {
        setPlan(current => ({ ...current, [field]: value }));
    };

    const addListItem = (field: ListField) => {
        const value = quickListValues[field].trim();
        if (!value) return;
        setPlan(current => ({ ...current, [field]: [...(current[field] || []), value] }));
        setQuickListValues(current => ({ ...current, [field]: '' }));
    };

    const removeListItem = (field: ListField, index: number) => {
        setPlan(current => ({
            ...current,
            [field]: (current[field] || []).filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const applyTemplate = (template: 'lecture' | 'practice' | 'lab') => {
        const templates: Record<typeof template, Partial<LessonPlan>> = {
            lecture: {
                goal: 'Сформировать представление о ключевых понятиях темы и показать их связь с последующими занятиями.',
                stages: [
                    { title: 'Вводная часть', minutes: 10, activity: 'Актуализация предыдущего материала, формулировка темы.' },
                    { title: 'Изложение нового материала', minutes: 65, activity: 'Последовательное раскрытие основных вопросов темы.' },
                    { title: 'Закрепление', minutes: 10, activity: 'Контрольные вопросы и мини-обсуждение.' },
                    { title: 'Домашнее задание', minutes: 5, activity: 'Пояснение самостоятельной работы.' },
                ],
            },
            practice: {
                goal: 'Отработать применение теоретического материала на типовых и прикладных заданиях.',
                stages: [
                    { title: 'Разбор исходных данных', minutes: 10, activity: 'Проверка готовности, постановка задачи.' },
                    { title: 'Решение примеров', minutes: 30, activity: 'Совместный разбор базовых заданий.' },
                    { title: 'Самостоятельная работа', minutes: 40, activity: 'Выполнение заданий с консультацией преподавателя.' },
                    { title: 'Итоги', minutes: 10, activity: 'Разбор ошибок, фиксация результатов.' },
                ],
            },
            lab: {
                goal: 'Сформировать практические навыки работы с оборудованием, программной средой или методикой эксперимента.',
                stages: [
                    { title: 'Инструктаж', minutes: 10, activity: 'Техника безопасности, цель и порядок выполнения.' },
                    { title: 'Выполнение работы', minutes: 60, activity: 'Практическая работа по методическим указаниям.' },
                    { title: 'Оформление результатов', minutes: 15, activity: 'Фиксация наблюдений, расчётов и выводов.' },
                    { title: 'Защита/контроль', minutes: 5, activity: 'Краткий контроль понимания результатов.' },
                ],
                equipment: ['Рабочее место', 'Методические указания'],
            },
        };
        setPlan(current => ({ ...current, ...templates[template] }));
    };

    const handleSave = () => {
        onSave({
            ...entry,
            lessonPlan: {
                ...plan,
                topic: plan.topic.trim() || subjectName,
                updatedAt: new Date().toISOString(),
            },
        });
        onClose();
    };

    const renderListEditor = (field: ListField, label: string, placeholder: string) => (
        <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">{label}</label>
            <div className="flex gap-2">
                <input
                    value={quickListValues[field]}
                    onChange={(event) => setQuickListValues(current => ({ ...current, [field]: event.target.value }))}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            addListItem(field);
                        }
                    }}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    onClick={() => addListItem(field)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
                    title="Добавить"
                >
                    <PlusIcon className="h-4 w-4" />
                </button>
            </div>
            {(plan[field] || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {(plan[field] || []).map((item, index) => (
                        <span key={`${field}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                            <span className="truncate">{item}</span>
                            <button type="button" onClick={() => removeListItem(field, index)} className="text-gray-400 hover:text-red-600" title="Удалить">
                                <XMarkIcon className="h-3.5 w-3.5" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    const modalContent = (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between border-b border-gray-200 bg-white px-6 py-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <BookOpenIcon className="h-5 w-5 text-blue-600" />
                            <span>{subjectName}</span>
                            <span>•</span>
                            <span>{groupName}</span>
                            <span>•</span>
                            <span>{dateStr}</span>
                        </div>
                        <h2 className="mt-1 truncate text-2xl font-semibold text-gray-900">План занятия</h2>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800" title="Закрыть">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_300px]">
                    <div className="space-y-6 p-6">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_190px]">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Тема занятия</label>
                                <input
                                    type="text"
                                    value={plan.topic}
                                    onChange={(event) => updateField('topic', event.target.value)}
                                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Введите тему занятия"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Статус</label>
                                <select
                                    value={plan.status || 'draft'}
                                    onChange={(event) => updateField('status', event.target.value as LessonPlanStatus)}
                                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                >
                                    {Object.entries(statusLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Цель занятия</label>
                                <textarea
                                    value={plan.goal || ''}
                                    onChange={(event) => updateField('goal', event.target.value)}
                                    rows={3}
                                    className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Что должно быть достигнуто на занятии"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Планируемые результаты</label>
                                <textarea
                                    value={plan.learningOutcomes || ''}
                                    onChange={(event) => updateField('learningOutcomes', event.target.value)}
                                    rows={3}
                                    className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Что студент должен знать или уметь после занятия"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label className="block text-sm font-semibold text-gray-700">Этапы занятия</label>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <ClockIcon className="h-4 w-4" />
                                    <span>{totalMinutes} мин.</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {(plan.stages || []).map((stage, index) => (
                                    <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 lg:grid-cols-[1fr_90px_2fr_34px]">
                                        <input
                                            value={stage.title}
                                            onChange={(event) => {
                                                const stages = [...(plan.stages || [])];
                                                stages[index] = { ...stage, title: event.target.value };
                                                updateField('stages', stages);
                                            }}
                                            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                            placeholder="Этап"
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            value={stage.minutes ?? ''}
                                            onChange={(event) => {
                                                const stages = [...(plan.stages || [])];
                                                stages[index] = { ...stage, minutes: Number(event.target.value) || 0 };
                                                updateField('stages', stages);
                                            }}
                                            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                            placeholder="Мин."
                                        />
                                        <input
                                            value={stage.activity}
                                            onChange={(event) => {
                                                const stages = [...(plan.stages || [])];
                                                stages[index] = { ...stage, activity: event.target.value };
                                                updateField('stages', stages);
                                            }}
                                            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                            placeholder="Действия преподавателя и студентов"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateField('stages', (plan.stages || []).filter((_, itemIndex) => itemIndex !== index))}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                                            title="Удалить этап"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => updateField('stages', [...(plan.stages || []), { ...emptyStage }])}
                                className="mt-3 inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Добавить этап
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700">Содержание занятия</label>
                            <textarea
                                value={plan.content}
                                onChange={(event) => updateField('content', event.target.value)}
                                rows={5}
                                className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                placeholder="Ключевые вопросы, задания, ход работы"
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {renderListEditor('controlQuestions', 'Контрольные вопросы', 'Вопрос для проверки понимания')}
                            {renderListEditor('materials', 'Материалы', 'Презентация, файл, ссылка')}
                            {renderListEditor('literature', 'Литература', 'Источник или раздел')}
                            {renderListEditor('equipment', 'Оборудование', 'Оборудование или ПО')}
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Контроль и оценивание</label>
                                <textarea
                                    value={plan.assessment || ''}
                                    onChange={(event) => updateField('assessment', event.target.value)}
                                    rows={3}
                                    className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Форма контроля, критерии, ожидаемые результаты"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700">Домашнее задание</label>
                                <textarea
                                    value={plan.homework}
                                    onChange={(event) => updateField('homework', event.target.value)}
                                    rows={3}
                                    className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Самостоятельная работа после занятия"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700">Заметки преподавателя</label>
                            <textarea
                                value={plan.teacherNotes || ''}
                                onChange={(event) => updateField('teacherNotes', event.target.value)}
                                rows={3}
                                className="mt-1 w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                placeholder="Внутренние пометки, риски, что подготовить заранее"
                            />
                        </div>
                    </div>

                    <aside className="border-t border-gray-200 bg-gray-50 p-6 lg:border-l lg:border-t-0">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Быстрые шаблоны</h3>
                                <div className="mt-3 grid grid-cols-1 gap-2">
                                    <button type="button" onClick={() => applyTemplate('lecture')} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50">Лекция</button>
                                    <button type="button" onClick={() => applyTemplate('practice')} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50">Практическое занятие</button>
                                    <button type="button" onClick={() => applyTemplate('lab')} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50">Лабораторная работа</button>
                                </div>
                            </div>

                            <div className="rounded-md border border-gray-200 bg-white p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                                    <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                                    Заполненность
                                </div>
                                <div className="mt-3 space-y-2 text-sm text-gray-600">
                                    <div className="flex justify-between"><span>Этапы</span><span>{plan.stages?.length || 0}</span></div>
                                    <div className="flex justify-between"><span>Вопросы</span><span>{plan.controlQuestions?.length || 0}</span></div>
                                    <div className="flex justify-between"><span>Материалы</span><span>{plan.materials?.length || 0}</span></div>
                                    <div className="flex justify-between"><span>Литература</span><span>{plan.literature?.length || 0}</span></div>
                                </div>
                            </div>

                            {plan.updatedAt && (
                                <div className="text-xs text-gray-500">
                                    Обновлено: {new Date(plan.updatedAt).toLocaleString('ru-RU')}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>

                <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        <span>{statusLabels[plan.status || 'draft']}</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
                            Отмена
                        </button>
                        <button onClick={handleSave} className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                            Сохранить план
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
};

export default LessonPlanModal;
