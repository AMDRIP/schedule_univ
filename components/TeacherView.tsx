import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { Teacher, ClassType } from '../types';
import { LocationMarkerIcon, PhoneIcon, MailIcon, AcademicCapIcon, CalendarIcon, PlusIcon, TrashIcon } from './icons';
import { calculateExperience } from '../utils/dateUtils';

interface TeacherViewProps {
  teacherId: string;
  onNavigate: (view: string, id: string) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`mt-8 ${className}`}>
    <h2 className="text-2xl font-bold text-blue-800 border-b-2 border-blue-200 pb-2 mb-4">{title}</h2>
    {children}
  </div>
);

const SubjectCard: React.FC<{ subjectId: string; classTypes: ClassType[]; onRemove?: () => void }> = ({ subjectId, classTypes, onRemove }) => {
    const { subjects } = useStore();
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return null;

    return (
        <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-blue-900">{subject.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{classTypes.join(', ')}</p>
                </div>
                {onRemove && (
                    <button type="button" onClick={onRemove} className="p-1 text-red-500 hover:text-red-700" title="Убрать привязку">
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
};

const TeacherView: React.FC<TeacherViewProps> = ({ teacherId, onNavigate }) => {
    const store = useStore();
    const { teachers, departments, subjects, teacherSubjectLinks, schedule, settings, addItem, updateItem, deleteItem } = store;
    const [quickSubjectId, setQuickSubjectId] = useState('');
    const [quickClassTypes, setQuickClassTypes] = useState<ClassType[]>([ClassType.Lecture]);

    const teacher = useMemo(() => teachers.find(t => t.id === teacherId), [teacherId, teachers]);
    const department = useMemo(() => teacher ? departments.find(d => d.id === teacher.departmentId) : null, [teacher, departments]);
    const subjectsTaught = useMemo(() => {
        const links = teacherSubjectLinks.filter(l => l.teacherId === teacherId);
        // Group by subjectId to consolidate class types
        const subjectMap = new Map<string, ClassType[]>();
        links.forEach(link => {
            if (!subjectMap.has(link.subjectId)) {
                subjectMap.set(link.subjectId, []);
            }
            subjectMap.get(link.subjectId)!.push(...link.classTypes);
        });
        return Array.from(subjectMap.entries()).map(([subjectId, classTypes]) => ({
            subjectId,
            classTypes: [...new Set(classTypes)] // Remove duplicates
        }));
    }, [teacherId, teacherSubjectLinks]);

    const workload = useMemo(() => {
        let weeksInSemester = 16; // Default
        if (settings.semesterStart && settings.semesterEnd) {
            const start = new Date(settings.semesterStart);
            const end = new Date(settings.semesterEnd);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                weeksInSemester = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7));
            }
        }
        if (weeksInSemester <= 0) weeksInSemester = 1;

        const allTeacherEntries = schedule.filter(e => e.teacherId === teacherId);
        const hoursPerClass = 2;
        const totalHours = allTeacherEntries.length * hoursPerClass;
        const weeklyHours = totalHours / weeksInSemester;
        const monthlyHours = weeklyHours * 4.33;

        return {
            weekly: weeklyHours.toFixed(1),
            monthly: monthlyHours.toFixed(1)
        };
    }, [teacherId, schedule, settings.semesterStart, settings.semesterEnd]);

    const quickBindingClassTypes = [
        ClassType.Lecture,
        ClassType.Practical,
        ClassType.Lab,
        ClassType.Consultation,
        ClassType.PracticeConsultation,
        ClassType.PracticeDefense,
        ClassType.Test,
        ClassType.Exam,
    ];

    const toggleQuickClassType = (classType: ClassType) => {
        setQuickClassTypes(prev => prev.includes(classType)
            ? prev.filter(item => item !== classType)
            : [...prev, classType]
        );
    };

    const handleAddQuickBinding = () => {
        const subjectId = quickSubjectId || subjects[0]?.id;
        if (!subjectId || quickClassTypes.length === 0) return;

        const existing = teacherSubjectLinks.find(link => link.teacherId === teacherId && link.subjectId === subjectId);
        if (existing) {
            updateItem('teacherSubjectLinks', {
                ...existing,
                classTypes: Array.from(new Set([...existing.classTypes, ...quickClassTypes])),
            });
        } else {
            addItem('teacherSubjectLinks', {
                teacherId,
                subjectId,
                classTypes: quickClassTypes,
            });
        }
    };

    const handleRemoveSubjectBinding = (subjectId: string) => {
        teacherSubjectLinks
            .filter(link => link.teacherId === teacherId && link.subjectId === subjectId)
            .forEach(link => deleteItem('teacherSubjectLinks', link.id));
    };

    if (!teacher) {
        return <div className="text-center text-red-500">Преподаватель не найден.</div>;
    }

    const teacherTitle = useMemo(() => {
        const degree = teacher.academicDegree
            ? (teacher.fieldOfScience
                ? teacher.academicDegree.replace(' наук', ` ${teacher.fieldOfScience} наук`)
                : teacher.academicDegree)
            : '';
        return [degree, teacher.academicTitle].filter(Boolean).join(', ');
    }, [teacher]);
    
    const experience = calculateExperience(teacher.hireDate);

    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight">{teacher.name}</h1>
            <p className="text-xl text-gray-600 mt-1">{teacherTitle}</p>
            
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Photo + Contacts */}
                <div className="lg:col-span-1 space-y-8">
                    <div className="p-6 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 shadow-md text-center">
                        <img 
                            src={teacher.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name)}&background=4f46e5&color=fff&size=256`} 
                            alt={teacher.name} 
                            className="w-48 h-48 rounded-full object-cover shadow-lg mx-auto"
                        />
                    </div>
                     {department && (
                        <div className="p-6 rounded-lg bg-gray-100 border border-gray-200">
                             <h3 className="font-bold text-gray-800 mb-4">КОНТАКТНАЯ ИНФОРМАЦИЯ</h3>
                             <div className="space-y-3 text-sm text-gray-700">
                                <p className="flex items-start">
                                    <AcademicCapIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>
                                    <span>
                                        <strong>Кафедра:</strong> <a href="#" onClick={(e) => { e.preventDefault(); onNavigate('Просмотр кафедры', department.id)}} className="text-blue-600 hover:underline">{department.name}</a>
                                    </span>
                                </p>
                                {teacher.hireDate && 
                                    <p className="flex items-start">
                                        <CalendarIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>
                                        <span><strong>В штате с:</strong> {new Date(teacher.hireDate).toLocaleDateString('ru-RU')} ({experience})</span>
                                    </p>
                                }
                                {department.address && <p className="flex items-start"><LocationMarkerIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.address}</p>}
                                {department.phone && <p className="flex items-start"><PhoneIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.phone}</p>}
                                {department.email && <p className="flex items-start"><MailIcon className="w-4 h-4 mr-3 mt-0.5 text-gray-500 shrink-0"/>{department.email}</p>}
                             </div>
                        </div>
                     )}
                </div>

                {/* Right Column: Workload + Regalia */}
                <div className="lg:col-span-2 space-y-8">
                     <div className="p-6 rounded-lg bg-blue-50 border border-blue-200">
                        <h3 className="font-bold text-blue-900 mb-4">УЧЕБНАЯ НАГРУЗКА (академ. часы)</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
                            <div className="bg-white p-4 rounded-md border border-gray-200">
                                <p className="text-4xl font-bold text-blue-700">{workload.weekly}</p>
                                <p className="text-sm text-gray-600 mt-1">в неделю (в среднем)</p>
                            </div>
                             <div className="bg-white p-4 rounded-md border border-gray-200">
                                <p className="text-4xl font-bold text-blue-700">{workload.monthly}</p>
                                <p className="text-sm text-gray-600 mt-1">в месяц (в среднем)</p>
                            </div>
                        </div>
                     </div>
                     {teacher.regalia && (
                         <div className="p-6 rounded-lg bg-white border border-gray-200">
                             <h3 className="font-bold text-gray-800 mb-2">РЕГАЛИИ И ЗВАНИЯ</h3>
                             <p className="text-gray-600 leading-relaxed text-sm">{teacher.regalia}</p>
                         </div>
                    )}
                </div>
            </div>

            <Section title="ПРЕПОДАВАЕМЫЕ ДИСЦИПЛИНЫ">
                <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr),minmax(0,1.4fr),auto] gap-3 items-start">
                        <div>
                            <label className="block text-xs font-medium text-blue-900 mb-1">Дисциплина</label>
                            <select
                                value={quickSubjectId || subjects[0]?.id || ''}
                                onChange={e => setQuickSubjectId(e.target.value)}
                                className="w-full p-2 border border-blue-200 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={subjects.length === 0}
                            >
                                {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-blue-900 mb-1">Типы занятий</label>
                            <div className="flex flex-wrap gap-2">
                                {quickBindingClassTypes.map(classType => (
                                    <label key={classType} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-blue-100 text-xs text-gray-700 cursor-pointer hover:border-blue-300">
                                        <input
                                            type="checkbox"
                                            checked={quickClassTypes.includes(classType)}
                                            onChange={() => toggleQuickClassType(classType)}
                                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        {classType}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleAddQuickBinding}
                            disabled={subjects.length === 0 || quickClassTypes.length === 0}
                            className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed lg:mt-5"
                        >
                            <PlusIcon className="w-4 h-4" />
                            Привязать
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {subjectsTaught.map(s => <SubjectCard key={s.subjectId} subjectId={s.subjectId} classTypes={s.classTypes} onRemove={() => handleRemoveSubjectBinding(s.subjectId)}/>)}
                    {subjectsTaught.length === 0 && <p className="text-gray-500">За преподавателем не закреплено ни одной дисциплины.</p>}
                </div>
            </Section>
        </div>
    );
};

export default TeacherView;
