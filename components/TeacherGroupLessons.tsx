import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { ScheduleEntry, ClassType } from '../types';
import LessonPlanModal from './LessonPlanModal';
import { CalendarIcon, AcademicCapIcon, UserGroupIcon, ClockIcon, BuildingOfficeIcon, PencilSquareIcon, CheckCircleIcon, XCircleIcon } from './icons';

const TeacherGroupLessons: React.FC = () => {
    const {
        schedule,
        teachers,
        groups,
        subjects,
        classrooms,
        timeSlots,
        updateScheduleEntry
    } = useStore();

    const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');
    const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);

    // Get lessons for selected teacher and group
    const filteredLessons = useMemo(() => {
        if (!selectedTeacherId || !selectedGroupId) return [];

        return schedule
            .filter(entry => {
                const hasTeacher = entry.teacherId === selectedTeacherId;
                const hasGroup = entry.groupIds?.includes(selectedGroupId) || entry.groupId === selectedGroupId;
                return hasTeacher && hasGroup;
            })
            .sort((a, b) => {
                // Sort by date if available, otherwise by day and time
                if (a.date && b.date) {
                    return new Date(a.date).getTime() - new Date(b.date).getTime();
                }
                const dayOrder = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
                const dayCompare = dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
                if (dayCompare !== 0) return dayCompare;

                const timeA = timeSlots.find(ts => ts.id === a.timeSlotId);
                const timeB = timeSlots.find(ts => ts.id === b.timeSlotId);
                return (timeA?.time || '').localeCompare(timeB?.time || '');
            });
    }, [schedule, selectedTeacherId, selectedGroupId, timeSlots]);

    const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'Неизвестно';
    const getClassroomNumber = (id: string) => classrooms.find(c => c.id === id)?.number || 'Н/Д';
    const getTimeSlot = (id: string) => timeSlots.find(ts => ts.id === id)?.time || 'Н/Д';
    const getSelectedTeacherName = () => teachers.find(t => t.id === selectedTeacherId)?.name || '';
    const getSelectedGroupNumber = () => groups.find(g => g.id === selectedGroupId)?.number || '';

    const handleSaveLessonPlan = (updatedEntry: ScheduleEntry) => {
        updateScheduleEntry(updatedEntry);
        setEditingEntry(null);
    };

    const getClassTypeColor = (classType: ClassType) => {
        switch (classType) {
            case ClassType.Lecture: return 'bg-blue-100 text-blue-800 border-blue-300';
            case ClassType.Practical: return 'bg-green-100 text-green-800 border-green-300';
            case ClassType.Lab: return 'bg-purple-100 text-purple-800 border-purple-300';
            case ClassType.Consultation: return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            case ClassType.Exam: return 'bg-red-100 text-red-800 border-red-300';
            case ClassType.Test: return 'bg-orange-100 text-orange-800 border-orange-300';
            default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const formatDate = (entry: ScheduleEntry) => {
        if (entry.date) {
            return new Date(entry.date).toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        }
        return `${entry.day} (${entry.weekType === 'even' ? 'Чётная' : entry.weekType === 'odd' ? 'Нечётная' : 'Каждая'})`;
    };

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white p-8 shadow-2xl">
                <div className="flex items-center gap-3 mb-2">
                    <AcademicCapIcon className="w-10 h-10" />
                    <h1 className="text-4xl font-bold tracking-tight">Планы занятий</h1>
                </div>
                <p className="text-blue-100 text-lg ml-13">Просмотр и редактирование планов занятий для преподавателя и группы</p>
            </div>

            {/* Filters */}
            <div className="bg-white/80 backdrop-blur-sm shadow-lg p-6 border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                            Преподаватель
                        </label>
                        <select
                            value={selectedTeacherId}
                            onChange={(e) => setSelectedTeacherId(e.target.value)}
                            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-4 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all shadow-sm hover:border-indigo-400"
                        >
                            <option value="">Выберите преподавателя...</option>
                            {teachers.map(teacher => (
                                <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-indigo-600" />
                            Группа
                        </label>
                        <select
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            className="w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:ring-4 focus:ring-indigo-500/30 focus:border-indigo-500 outline-none transition-all shadow-sm hover:border-indigo-400"
                        >
                            <option value="">Выберите группу...</option>
                            {groups.map(group => (
                                <option key={group.id} value={group.id}>{group.number}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {!selectedTeacherId || !selectedGroupId ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center bg-white/70 backdrop-blur-sm rounded-2xl p-12 shadow-xl border border-gray-200">
                            <AcademicCapIcon className="w-20 h-20 mx-auto text-indigo-300 mb-4" />
                            <h3 className="text-2xl font-semibold text-gray-700 mb-2">Выберите преподавателя и группу</h3>
                            <p className="text-gray-500">Для просмотра планов занятий необходимо выбрать преподавателя и группу из списков выше</p>
                        </div>
                    </div>
                ) : filteredLessons.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center bg-white/70 backdrop-blur-sm rounded-2xl p-12 shadow-xl border border-gray-200">
                            <XCircleIcon className="w-20 h-20 mx-auto text-gray-300 mb-4" />
                            <h3 className="text-2xl font-semibold text-gray-700 mb-2">Занятия не найдены</h3>
                            <p className="text-gray-500">Не найдено занятий для выбранного преподавателя и группы</p>
                        </div>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-4 text-sm text-gray-600 bg-white/50 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
                            Найдено занятий: <span className="font-bold text-indigo-600">{filteredLessons.length}</span>
                        </div>

                        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-sm font-bold">
                                                <div className="flex items-center gap-2">
                                                    <CalendarIcon className="w-5 h-5" />
                                                    Дата/День
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-bold">
                                                <div className="flex items-center gap-2">
                                                    <ClockIcon className="w-5 h-5" />
                                                    Время
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-bold">
                                                <div className="flex items-center gap-2">
                                                    <AcademicCapIcon className="w-5 h-5" />
                                                    Дисциплина
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-left text-sm font-bold">Тип</th>
                                            <th className="px-6 py-4 text-left text-sm font-bold">
                                                <div className="flex items-center gap-2">
                                                    <BuildingOfficeIcon className="w-5 h-5" />
                                                    Аудитория
                                                </div>
                                            </th>
                                            <th className="px-6 py-4 text-center text-sm font-bold">План</th>
                                            <th className="px-6 py-4 text-center text-sm font-bold">Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {filteredLessons.map((entry, index) => (
                                            <tr
                                                key={entry.id}
                                                className={`transition-colors hover:bg-indigo-50/50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                                                    }`}
                                            >
                                                <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                                                    {formatDate(entry)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 font-mono">
                                                    {getTimeSlot(entry.timeSlotId)}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-900 font-semibold">
                                                    {getSubjectName(entry.subjectId)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getClassTypeColor(entry.classType)}`}>
                                                        {entry.classType}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 font-semibold">
                                                    {getClassroomNumber(entry.classroomId)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {entry.lessonPlan ? (
                                                        <CheckCircleIcon className="w-6 h-6 text-green-500 mx-auto" />
                                                    ) : (
                                                        <XCircleIcon className="w-6 h-6 text-gray-300 mx-auto" />
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button
                                                        onClick={() => setEditingEntry(entry)}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg font-medium text-sm"
                                                    >
                                                        <PencilSquareIcon className="w-4 h-4" />
                                                        {entry.lessonPlan ? 'Редактировать' : 'Создать'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Lesson Plan Modal */}
            {editingEntry && (
                <LessonPlanModal
                    isOpen={!!editingEntry}
                    onClose={() => setEditingEntry(null)}
                    entry={editingEntry}
                    onSave={handleSaveLessonPlan}
                    subjectName={getSubjectName(editingEntry.subjectId)}
                    groupName={getSelectedGroupNumber()}
                    dateStr={formatDate(editingEntry)}
                />
            )}
        </div>
    );
};

export default TeacherGroupLessons;
