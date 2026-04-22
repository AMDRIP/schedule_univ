import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
    AcademicDegree,
    AcademicTitle,
    AttestationType,
    ClassType,
    Classroom,
    ClassroomType,
    Department,
    EducationalPlan,
    Faculty,
    FormOfStudy,
    Group,
    PlanEntry,
    SchedulingSettings,
    Specialty,
    Subject,
    Teacher,
    TeacherSubjectLink,
    TimeSlot,
    UGS,
} from '../types';
import { toYYYYMMDD } from '../utils/dateUtils';
import { TrashIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CheckCircleIcon } from './icons';
import DatePicker from './DatePicker';
import { OKSO_CODES, UGSN_FROM_OKSO } from '../data/codes';
import { COLOR_PALETTE } from '../constants';

interface NewProjectWizardProps {
    isOpen: boolean;
    onClose: () => void;
}

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const defaultInputClass = 'w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition';
const iconButtonClass = 'p-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-600 transition-colors flex-shrink-0';
const stepNames = ['Календарь', 'Структура', 'Состав', 'Ресурсы', 'Учебный план'];
const editableClassTypes = [
    ClassType.Lecture,
    ClassType.Practical,
    ClassType.Lab,
    ClassType.Test,
    ClassType.Exam,
    ClassType.Consultation,
    ClassType.Elective,
];

const createDefaultSettings = (): SchedulingSettings => ({
    semesterStart: toYYYYMMDD(new Date()),
    semesterEnd: toYYYYMMDD(new Date(new Date().setMonth(new Date().getMonth() + 4))),
    sessionStart: '',
    sessionEnd: '',
    practiceStart: '',
    practiceEnd: '',
    retakeStart: '',
    retakeEnd: '',
    defaultBreakMinutes: 15,
    allowWindows: true,
    useEvenOddWeekSeparation: true,
    showDegreeInSchedule: false,
    respectProductionCalendar: true,
    useShortenedPreHolidaySchedule: true,
    allowOverbooking: false,
    showTeacherDetailsInLists: false,
    showScheduleColors: true,
    allowManualOverrideOfForbidden: false,
    enforceStandardRules: true,
    openRouterModel: 'deepseek/deepseek-chat-v3.1:free',
});

const createDefaultTimeSlots = (): TimeSlot[] => [
    { id: generateId('ts'), time: '08:30-10:00' },
    { id: generateId('ts'), time: '10:15-11:45' },
    { id: generateId('ts'), time: '12:00-13:30' },
    { id: generateId('ts'), time: '14:15-15:45' },
];

const createDefaultShortenedTimeSlots = (): TimeSlot[] => [
    { id: generateId('tss'), time: '08:30-09:50' },
    { id: generateId('tss'), time: '10:00-11:20' },
    { id: generateId('tss'), time: '11:30-12:50' },
    { id: generateId('tss'), time: '13:00-14:20' },
];

const createFaculty = (): Faculty => ({ id: generateId('fac'), name: '' });
const createDepartment = (facultyId = ''): Department => ({ id: generateId('dep'), name: '', facultyId });
const createUgs = (): UGS => ({ id: generateId('ugs'), code: '', name: '' });
const createSpecialty = (ugsId = ''): Specialty => ({ id: generateId('spec'), code: '', name: '', ugsId });
const createTeacher = (departmentId = ''): Teacher => ({
    id: generateId('tch'),
    name: '',
    departmentId,
    availabilityGrid: {},
    pinnedClassroomId: '',
    academicDegree: undefined,
    academicTitle: undefined,
    color: '',
});
const createGroup = (departmentId = '', specialtyId = ''): Group => ({
    id: generateId('grp'),
    number: '',
    departmentId,
    studentCount: 25,
    course: 1,
    specialtyId,
    formOfStudy: FormOfStudy.FullTime,
    availabilityGrid: {},
    pinnedClassroomId: '',
});
const createClassroomType = (name = ''): ClassroomType => ({ id: generateId('ct'), name });
const createClassroom = (typeId = ''): Classroom => ({
    id: generateId('cls'),
    number: '',
    capacity: 30,
    typeId,
    availabilityGrid: {},
    tagIds: [],
});
const createSubject = (): Subject => ({
    id: generateId('sub'),
    name: '',
    availabilityGrid: {},
    pinnedClassroomId: '',
    classroomTypeRequirements: {},
    requiredClassroomTagIds: [],
    color: '',
});
const createLink = (teacherId = '', subjectId = ''): TeacherSubjectLink => ({
    id: generateId('lnk'),
    teacherId,
    subjectId,
    classTypes: [ClassType.Lecture],
});
const createPlanEntry = (subjectId = ''): PlanEntry => ({
    subjectId,
    semester: 1,
    lectureHours: 0,
    practiceHours: 0,
    labHours: 0,
    attestation: AttestationType.Test,
    splitForSubgroups: false,
});

const updateItemInCollection = <T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
    patch: Partial<T>,
) => {
    setter(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
};

const removeItemFromCollection = <T extends { id: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    id: string,
) => {
    setter(prev => prev.filter(item => item.id !== id));
};

const isSlotFormatValid = (value: string) => /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(value.trim());

const Section: React.FC<{ title: string; description?: string; children: React.ReactNode }> = ({ title, description, children }) => (
    <section className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
        <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        <div className="space-y-4">{children}</div>
    </section>
);

const ToggleField: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 cursor-pointer">
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
);

const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
    const { clearAllData, loadFullState } = useStore();

    const [step, setStep] = useState(1);
    const [settings, setSettings] = useState<SchedulingSettings>(createDefaultSettings);
    const [timeSlots, setTimeSlots] = useState<TimeSlot[]>(createDefaultTimeSlots);
    const [timeSlotsShortened, setTimeSlotsShortened] = useState<TimeSlot[]>(createDefaultShortenedTimeSlots);
    const [faculties, setFaculties] = useState<Faculty[]>([createFaculty()]);
    const [departments, setDepartments] = useState<Department[]>([createDepartment()]);
    const [ugs, setUgs] = useState<UGS[]>([createUgs()]);
    const [specialties, setSpecialties] = useState<Specialty[]>([createSpecialty()]);
    const [teachers, setTeachers] = useState<Teacher[]>([createTeacher()]);
    const [groups, setGroups] = useState<Group[]>([createGroup()]);
    const [classroomTypes, setClassroomTypes] = useState<ClassroomType[]>([
        createClassroomType('Лекционная'),
        createClassroomType('Практическая'),
        createClassroomType('Компьютерный класс'),
    ]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([createClassroom()]);
    const [subjects, setSubjects] = useState<Subject[]>([createSubject()]);
    const [teacherSubjectLinks, setTeacherSubjectLinks] = useState<TeacherSubjectLink[]>([createLink()]);
    const [educationalPlans, setEducationalPlans] = useState<EducationalPlan[]>([]);
    const [isStartDatePickerOpen, setStartDatePickerOpen] = useState(false);
    const [isEndDatePickerOpen, setEndDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setStartDatePickerOpen(false);
                setEndDatePickerOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!classrooms[0] && classroomTypes[0]) {
            setClassrooms([createClassroom(classroomTypes[0].id)]);
        }
    }, [classroomTypes, classrooms]);

    const cleanFaculties = useMemo(() => faculties.filter(f => f.name.trim() !== ''), [faculties]);
    const cleanDepartments = useMemo(() => departments.filter(d => d.name.trim() !== ''), [departments]);
    const cleanUgs = useMemo(() => ugs.filter(u => u.name.trim() !== '' || u.code.trim() !== ''), [ugs]);
    const cleanSpecialties = useMemo(() => specialties.filter(s => s.name.trim() !== '' || s.code.trim() !== ''), [specialties]);
    const cleanTeachers = useMemo(() => teachers.filter(t => t.name.trim() !== ''), [teachers]);
    const cleanGroups = useMemo(() => groups.filter(g => g.number.trim() !== ''), [groups]);
    const cleanClassroomTypes = useMemo(() => classroomTypes.filter(ct => ct.name.trim() !== ''), [classroomTypes]);
    const cleanClassrooms = useMemo(() => classrooms.filter(c => c.number.trim() !== ''), [classrooms]);
    const cleanSubjects = useMemo(() => subjects.filter(s => s.name.trim() !== ''), [subjects]);

    const summary = useMemo(() => ({
        faculties: cleanFaculties.length,
        departments: cleanDepartments.length,
        specialties: cleanSpecialties.length,
        teachers: cleanTeachers.length,
        groups: cleanGroups.length,
        classrooms: cleanClassrooms.length,
        subjects: cleanSubjects.length,
        links: teacherSubjectLinks.filter(l => l.teacherId && l.subjectId && l.classTypes.length > 0).length,
        planEntries: educationalPlans.reduce((acc, plan) => acc + plan.entries.length, 0),
    }), [
        cleanFaculties.length,
        cleanDepartments.length,
        cleanSpecialties.length,
        cleanTeachers.length,
        cleanGroups.length,
        cleanClassrooms.length,
        cleanSubjects.length,
        teacherSubjectLinks,
        educationalPlans,
    ]);

    const getPlanForSpecialty = (specialtyId: string) => {
        return educationalPlans.find(plan => plan.specialtyId === specialtyId);
    };

    const updateSpecialty = (id: string, field: keyof Specialty, value: string) => {
        if (field !== 'code') {
            updateItemInCollection(setSpecialties, id, { [field]: value } as Partial<Specialty>);
            return;
        }

        const matchedOkso = OKSO_CODES.find(item => item.code === value);
        const patch: Partial<Specialty> = { code: value };

        if (matchedOkso) {
            patch.name = matchedOkso.name;
            const ugsPrefix = value.substring(0, 2);
            const inferredUgs = UGSN_FROM_OKSO.find(item => item.code.startsWith(ugsPrefix));

            if (inferredUgs) {
                const existingUgs = ugs.find(item => item.code === inferredUgs.code);
                if (existingUgs) {
                    patch.ugsId = existingUgs.id;
                } else {
                    const newUgs = { id: generateId('ugs'), code: inferredUgs.code, name: inferredUgs.name };
                    setUgs(prev => [...prev.filter(item => item.name.trim() || item.code.trim()), newUgs]);
                    patch.ugsId = newUgs.id;
                }
            }
        }

        updateItemInCollection(setSpecialties, id, patch);
    };

    const updateSubjectRequirement = (subjectId: string, classType: ClassType, classroomTypeId: string) => {
        setSubjects(prev =>
            prev.map(subject => {
                if (subject.id !== subjectId) return subject;

                const requirements = { ...(subject.classroomTypeRequirements || {}) };
                if (classroomTypeId) {
                    requirements[classType] = [classroomTypeId];
                } else {
                    delete requirements[classType];
                }

                return {
                    ...subject,
                    classroomTypeRequirements: requirements,
                };
            }),
        );
    };

    const toggleLinkClassType = (linkId: string, classType: ClassType) => {
        setTeacherSubjectLinks(prev =>
            prev.map(link => {
                if (link.id !== linkId) return link;
                const current = link.classTypes.includes(classType)
                    ? link.classTypes.filter(item => item !== classType)
                    : [...link.classTypes, classType];
                return { ...link, classTypes: current };
            }),
        );
    };

    const addPlanEntry = (specialtyId: string) => {
        setEducationalPlans(prev => {
            const existingPlan = prev.find(plan => plan.specialtyId === specialtyId);
            if (existingPlan) {
                return prev.map(plan =>
                    plan.specialtyId === specialtyId
                        ? { ...plan, entries: [...plan.entries, createPlanEntry(subjects[0]?.id || '')] }
                        : plan,
                );
            }

            return [
                ...prev,
                {
                    id: generateId('plan'),
                    specialtyId,
                    entries: [createPlanEntry(subjects[0]?.id || '')],
                },
            ];
        });
    };

    const updatePlanEntry = (specialtyId: string, index: number, patch: Partial<PlanEntry>) => {
        setEducationalPlans(prev =>
            prev.map(plan =>
                plan.specialtyId === specialtyId
                    ? {
                        ...plan,
                        entries: plan.entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
                    }
                    : plan,
            ),
        );
    };

    const removePlanEntry = (specialtyId: string, index: number) => {
        setEducationalPlans(prev =>
            prev
                .map(plan =>
                    plan.specialtyId === specialtyId
                        ? { ...plan, entries: plan.entries.filter((_, entryIndex) => entryIndex !== index) }
                        : plan,
                )
                .filter(plan => plan.entries.length > 0),
        );
    };

    const isStepValid = useMemo(() => {
        const facultyIds = new Set(cleanFaculties.map(item => item.id));
        const ugsIds = new Set(cleanUgs.map(item => item.id));
        const departmentIds = new Set(cleanDepartments.map(item => item.id));
        const specialtyIds = new Set(cleanSpecialties.map(item => item.id));
        const teacherIds = new Set(cleanTeachers.map(item => item.id));
        const classroomTypeIds = new Set(cleanClassroomTypes.map(item => item.id));
        const classroomIds = new Set(cleanClassrooms.map(item => item.id));
        const subjectIds = new Set(cleanSubjects.map(item => item.id));

        const planEntries = educationalPlans.flatMap(plan => plan.entries);
        const hasPlanEntries = planEntries.length > 0;

        switch (step) {
            case 1:
                return Boolean(settings.semesterStart)
                    && Boolean(settings.semesterEnd)
                    && new Date(settings.semesterStart) < new Date(settings.semesterEnd)
                    && timeSlots.length > 0
                    && timeSlots.every(slot => isSlotFormatValid(slot.time))
                    && (!settings.useShortenedPreHolidaySchedule || (
                        timeSlotsShortened.length > 0
                        && timeSlotsShortened.every(slot => isSlotFormatValid(slot.time))
                    ));
            case 2:
                return cleanFaculties.length > 0
                    && cleanDepartments.length > 0
                    && cleanUgs.length > 0
                    && cleanSpecialties.length > 0
                    && cleanFaculties.every(item => item.name.trim() !== '')
                    && cleanDepartments.every(item => item.name.trim() !== '' && facultyIds.has(item.facultyId))
                    && cleanUgs.every(item => item.name.trim() !== '' && item.code.trim() !== '')
                    && cleanSpecialties.every(item => item.name.trim() !== '' && item.code.trim() !== '' && ugsIds.has(item.ugsId));
            case 3:
                return cleanTeachers.length > 0
                    && cleanGroups.length > 0
                    && cleanTeachers.every(item => item.name.trim() !== '' && departmentIds.has(item.departmentId))
                    && cleanGroups.every(item =>
                        item.number.trim() !== ''
                        && departmentIds.has(item.departmentId)
                        && specialtyIds.has(item.specialtyId)
                        && item.studentCount > 0
                        && item.course > 0,
                    );
            case 4:
                return cleanClassroomTypes.length > 0
                    && cleanClassrooms.length > 0
                    && cleanClassroomTypes.every(item => item.name.trim() !== '')
                    && cleanClassrooms.every(item =>
                        item.number.trim() !== ''
                        && item.capacity > 0
                        && classroomTypeIds.has(item.typeId),
                    );
            case 5:
                return cleanSubjects.length > 0
                    && cleanSubjects.every(item => item.name.trim() !== '')
                    && teacherSubjectLinks.length > 0
                    && teacherSubjectLinks.every(item =>
                        teacherIds.has(item.teacherId)
                        && subjectIds.has(item.subjectId)
                        && item.classTypes.length > 0,
                    )
                    && hasPlanEntries
                    && educationalPlans.every(plan =>
                        specialtyIds.has(plan.specialtyId)
                        && plan.entries.length > 0
                        && plan.entries.every(entry =>
                            subjectIds.has(entry.subjectId)
                            && entry.semester > 0
                            && (entry.lectureHours > 0 || entry.practiceHours > 0 || entry.labHours > 0),
                        ),
                    )
                    && cleanSubjects.every(subject => {
                        const requirements = subject.classroomTypeRequirements || {};
                        return Object.values(requirements).every(ids => (ids || []).every(id => classroomTypeIds.has(id)));
                    })
                    && cleanTeachers.every(teacher => !teacher.pinnedClassroomId || classroomIds.has(teacher.pinnedClassroomId))
                    && cleanGroups.every(group => !group.pinnedClassroomId || classroomIds.has(group.pinnedClassroomId));
            default:
                return false;
        }
    }, [
        step,
        settings,
        timeSlots,
        timeSlotsShortened,
        cleanFaculties,
        cleanDepartments,
        cleanUgs,
        cleanSpecialties,
        cleanTeachers,
        cleanGroups,
        cleanClassroomTypes,
        cleanClassrooms,
        cleanSubjects,
        teacherSubjectLinks,
        educationalPlans,
    ]);

    const handleCreateProject = () => {
        if (!window.confirm('Создать новый проект и применить стартовые настройки?')) {
            return;
        }

        const validFacultyIds = new Set(cleanFaculties.map(item => item.id));
        const validUgsIds = new Set(cleanUgs.map(item => item.id));
        const validClassroomTypeIds = new Set(cleanClassroomTypes.map(item => item.id));

        const sanitizedDepartments = cleanDepartments
            .filter(item => validFacultyIds.has(item.facultyId))
            .map(item => ({ ...item }));
        const validDepartmentIds = new Set(sanitizedDepartments.map(item => item.id));

        const sanitizedSpecialties = cleanSpecialties
            .filter(item => validUgsIds.has(item.ugsId))
            .map(item => ({ ...item }));
        const validSpecialtyIds = new Set(sanitizedSpecialties.map(item => item.id));

        const sanitizedTeachers = cleanTeachers
            .filter(item => validDepartmentIds.has(item.departmentId))
            .map(item => ({ ...item }));
        const validTeacherIds = new Set(sanitizedTeachers.map(item => item.id));

        const sanitizedGroups = cleanGroups
            .filter(item => validDepartmentIds.has(item.departmentId) && validSpecialtyIds.has(item.specialtyId))
            .map(item => ({ ...item }));

        const specialtyIdsByDepartment = sanitizedGroups.reduce((acc, group) => {
            const current = acc.get(group.departmentId) || new Set<string>();
            current.add(group.specialtyId);
            acc.set(group.departmentId, current);
            return acc;
        }, new Map<string, Set<string>>());

        const enhancedDepartments = sanitizedDepartments.map(department => ({
            ...department,
            specialtyIds: Array.from(specialtyIdsByDepartment.get(department.id) || []),
        }));

        const sanitizedClassroomTypes = cleanClassroomTypes.map(item => ({ ...item }));
        const sanitizedClassrooms = cleanClassrooms
            .filter(item => validClassroomTypeIds.has(item.typeId))
            .map(item => ({ ...item }));
        const validClassroomIds = new Set(sanitizedClassrooms.map(item => item.id));

        const sanitizedSubjects = cleanSubjects.map(subject => {
            const requirements = Object.fromEntries(
                Object.entries(subject.classroomTypeRequirements || {}).map(([key, ids]) => [
                    key,
                    (ids || []).filter(id => validClassroomTypeIds.has(id)),
                ]).filter(([, ids]) => (ids as string[]).length > 0),
            ) as Subject['classroomTypeRequirements'];

            return {
                ...subject,
                pinnedClassroomId: subject.pinnedClassroomId && validClassroomIds.has(subject.pinnedClassroomId) ? subject.pinnedClassroomId : '',
                classroomTypeRequirements: requirements,
                requiredClassroomTagIds: [],
            };
        });
        const validSubjectIds = new Set(sanitizedSubjects.map(item => item.id));

        const normalizedTeachers = sanitizedTeachers.map(teacher => ({
            ...teacher,
            pinnedClassroomId: teacher.pinnedClassroomId && validClassroomIds.has(teacher.pinnedClassroomId) ? teacher.pinnedClassroomId : '',
        }));

        const normalizedGroups = sanitizedGroups.map(group => ({
            ...group,
            pinnedClassroomId: group.pinnedClassroomId && validClassroomIds.has(group.pinnedClassroomId) ? group.pinnedClassroomId : '',
        }));

        const sanitizedLinks = teacherSubjectLinks
            .filter(item => validTeacherIds.has(item.teacherId) && validSubjectIds.has(item.subjectId) && item.classTypes.length > 0)
            .map(item => ({ ...item }));

        const sanitizedPlans = educationalPlans
            .filter(plan => validSpecialtyIds.has(plan.specialtyId))
            .map(plan => ({
                ...plan,
                entries: plan.entries.filter(entry =>
                    validSubjectIds.has(entry.subjectId)
                    && entry.semester > 0
                    && (entry.lectureHours > 0 || entry.practiceHours > 0 || entry.labHours > 0),
                ),
            }))
            .filter(plan => plan.entries.length > 0);

        const finalState = {
            settings,
            timeSlots: timeSlots.filter(slot => isSlotFormatValid(slot.time)),
            timeSlotsShortened: settings.useShortenedPreHolidaySchedule
                ? timeSlotsShortened.filter(slot => isSlotFormatValid(slot.time))
                : [],
            faculties: cleanFaculties.map(item => ({ ...item })),
            departments: enhancedDepartments,
            ugs: cleanUgs.map(item => ({ ...item })),
            specialties: sanitizedSpecialties,
            teachers: normalizedTeachers,
            groups: normalizedGroups,
            streams: [],
            classrooms: sanitizedClassrooms,
            classroomTypes: sanitizedClassroomTypes,
            classroomTags: [],
            subjects: sanitizedSubjects,
            cabinets: [],
            schedule: [],
            unscheduledEntries: [],
            teacherSubjectLinks: sanitizedLinks,
            schedulingRules: [],
            productionCalendar: [],
            educationalPlans: sanitizedPlans,
            scheduleTemplates: [],
            subgroups: [],
            electives: [],
        };

        clearAllData();
        loadFullState(finalState);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-40">
            <div className="bg-gray-50 p-6 rounded-lg shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col animation-fade-in-scale">
                <div className="flex items-start justify-between gap-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Мастер настройки нового проекта</h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Заполни ключевые справочники и учебную часть одним проходом, чтобы сразу начать работать с расписанием.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <span>Факультеты: {summary.faculties}</span>
                        <span>Кафедры: {summary.departments}</span>
                        <span>Специальности: {summary.specialties}</span>
                        <span>Преподаватели: {summary.teachers}</span>
                        <span>Группы: {summary.groups}</span>
                        <span>Аудитории: {summary.classrooms}</span>
                        <span>Предметы: {summary.subjects}</span>
                        <span>Планов/связей: {summary.planEntries}/{summary.links}</span>
                    </div>
                </div>

                <div className="my-6">
                    <div className="flex items-center">
                        {stepNames.map((name, index) => (
                            <React.Fragment key={name}>
                                <div className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white transition-colors ${step > index + 1 ? 'bg-green-500' : step === index + 1 ? 'bg-blue-600' : 'bg-gray-400'}`}>
                                        {step > index + 1 ? <CheckCircleIcon className="w-5 h-5" /> : index + 1}
                                    </div>
                                    <p className={`ml-2 font-medium transition-colors ${step >= index + 1 ? 'text-gray-800' : 'text-gray-500'}`}>{name}</p>
                                </div>
                                {index < stepNames.length - 1 && (
                                    <div className={`flex-auto border-t-2 transition-colors mx-4 ${step > index + 1 ? 'border-green-500' : 'border-gray-300'}`}></div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="overflow-y-auto pr-2 flex-grow space-y-5">
                    {step === 1 && (
                        <>
                            <Section title="Семестр и периоды" description="Определи рамки учебного процесса и базовые правила показа расписания.">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative" ref={datePickerRef}>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Начало семестра</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setStartDatePickerOpen(prev => !prev);
                                                setEndDatePickerOpen(false);
                                            }}
                                            className={`${defaultInputClass} text-left flex justify-between items-center`}
                                        >
                                            {new Date(settings.semesterStart + 'T00:00:00').toLocaleDateString('ru-RU')}
                                            <CalendarIcon className="w-5 h-5 text-gray-500" />
                                        </button>
                                        {isStartDatePickerOpen && (
                                            <DatePicker
                                                selectedDate={new Date(settings.semesterStart)}
                                                onSelect={date => {
                                                    setSettings(prev => ({ ...prev, semesterStart: toYYYYMMDD(date) }));
                                                    setStartDatePickerOpen(false);
                                                }}
                                                onClose={() => setStartDatePickerOpen(false)}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Конец семестра</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEndDatePickerOpen(prev => !prev);
                                                setStartDatePickerOpen(false);
                                            }}
                                            className={`${defaultInputClass} text-left flex justify-between items-center`}
                                        >
                                            {new Date(settings.semesterEnd + 'T00:00:00').toLocaleDateString('ru-RU')}
                                            <CalendarIcon className="w-5 h-5 text-gray-500" />
                                        </button>
                                        {isEndDatePickerOpen && (
                                            <DatePicker
                                                selectedDate={new Date(settings.semesterEnd)}
                                                onSelect={date => {
                                                    setSettings(prev => ({ ...prev, semesterEnd: toYYYYMMDD(date) }));
                                                    setEndDatePickerOpen(false);
                                                }}
                                                onClose={() => setEndDatePickerOpen(false)}
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Начало сессии</label>
                                        <input
                                            type="date"
                                            value={settings.sessionStart}
                                            onChange={e => setSettings(prev => ({ ...prev, sessionStart: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Конец сессии</label>
                                        <input
                                            type="date"
                                            value={settings.sessionEnd}
                                            onChange={e => setSettings(prev => ({ ...prev, sessionEnd: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Начало практики</label>
                                        <input
                                            type="date"
                                            value={settings.practiceStart}
                                            onChange={e => setSettings(prev => ({ ...prev, practiceStart: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Конец практики</label>
                                        <input
                                            type="date"
                                            value={settings.practiceEnd}
                                            onChange={e => setSettings(prev => ({ ...prev, practiceEnd: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Начало пересдач</label>
                                        <input
                                            type="date"
                                            value={settings.retakeStart}
                                            onChange={e => setSettings(prev => ({ ...prev, retakeStart: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-gray-700">Конец пересдач</label>
                                        <input
                                            type="date"
                                            value={settings.retakeEnd}
                                            onChange={e => setSettings(prev => ({ ...prev, retakeEnd: e.target.value }))}
                                            className={defaultInputClass}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <ToggleField label="Разрешать окна" checked={settings.allowWindows} onChange={checked => setSettings(prev => ({ ...prev, allowWindows: checked }))} />
                                    <ToggleField label="Разделять четные и нечетные недели" checked={settings.useEvenOddWeekSeparation} onChange={checked => setSettings(prev => ({ ...prev, useEvenOddWeekSeparation: checked }))} />
                                    <ToggleField label="Учитывать производственный календарь" checked={settings.respectProductionCalendar} onChange={checked => setSettings(prev => ({ ...prev, respectProductionCalendar: checked }))} />
                                    <ToggleField label="Использовать сокращенные предпраздничные слоты" checked={settings.useShortenedPreHolidaySchedule} onChange={checked => setSettings(prev => ({ ...prev, useShortenedPreHolidaySchedule: checked }))} />
                                    <ToggleField label="Показывать цветовые метки" checked={settings.showScheduleColors} onChange={checked => setSettings(prev => ({ ...prev, showScheduleColors: checked }))} />
                                    <ToggleField label="Показывать детали преподавателя в списках" checked={settings.showTeacherDetailsInLists} onChange={checked => setSettings(prev => ({ ...prev, showTeacherDetailsInLists: checked }))} />
                                </div>
                            </Section>

                            <Section title="Расписание звонков" description="Заполни обычные и сокращенные пары прямо в мастере, чтобы дальше не возвращаться к настройкам.">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">Обычные слоты</h4>
                                            <button
                                                type="button"
                                                onClick={() => setTimeSlots(prev => [...prev, { id: generateId('ts'), time: '' }])}
                                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                                Добавить слот
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {timeSlots.map(slot => (
                                                <div key={slot.id} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={slot.time}
                                                        onChange={e => updateItemInCollection(setTimeSlots, slot.id, { time: e.target.value })}
                                                        placeholder="08:30-10:00"
                                                        className={defaultInputClass}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItemFromCollection(setTimeSlots, slot.id)}
                                                        className={iconButtonClass}
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">Сокращенные слоты</h4>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setTimeSlotsShortened(timeSlots.map(slot => ({ ...slot, id: generateId('tss') })))}
                                                    className="text-sm text-gray-600 hover:underline"
                                                >
                                                    Скопировать обычные
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTimeSlotsShortened(prev => [...prev, { id: generateId('tss'), time: '' }])}
                                                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                                >
                                                    <PlusIcon className="w-4 h-4" />
                                                    Добавить слот
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            {timeSlotsShortened.map(slot => (
                                                <div key={slot.id} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={slot.time}
                                                        onChange={e => updateItemInCollection(setTimeSlotsShortened, slot.id, { time: e.target.value })}
                                                        placeholder="08:30-09:50"
                                                        className={defaultInputClass}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItemFromCollection(setTimeSlotsShortened, slot.id)}
                                                        className={iconButtonClass}
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </Section>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Section title="Факультеты и кафедры" description="Задай каркас университета, к которому будут привязаны преподаватели и группы.">
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">Факультеты</h4>
                                            <button type="button" onClick={() => setFaculties(prev => [...prev, createFaculty()])} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                                <PlusIcon className="w-4 h-4" />
                                                Добавить факультет
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {faculties.map(faculty => (
                                                <div key={faculty.id} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={faculty.name}
                                                        onChange={e => updateItemInCollection(setFaculties, faculty.id, { name: e.target.value })}
                                                        placeholder="Название факультета"
                                                        className={defaultInputClass}
                                                    />
                                                    <button type="button" onClick={() => removeItemFromCollection(setFaculties, faculty.id)} className={iconButtonClass}>
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">Кафедры</h4>
                                            <button
                                                type="button"
                                                onClick={() => setDepartments(prev => [...prev, createDepartment(cleanFaculties[0]?.id || '')])}
                                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                                Добавить кафедру
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {departments.map(department => (
                                                <div key={department.id} className="grid grid-cols-[1.4fr,1fr,auto] gap-2 items-center">
                                                    <input
                                                        type="text"
                                                        value={department.name}
                                                        onChange={e => updateItemInCollection(setDepartments, department.id, { name: e.target.value })}
                                                        placeholder="Название кафедры"
                                                        className={defaultInputClass}
                                                    />
                                                    <select
                                                        value={department.facultyId}
                                                        onChange={e => updateItemInCollection(setDepartments, department.id, { facultyId: e.target.value })}
                                                        className={defaultInputClass}
                                                    >
                                                        <option value="">-- Факультет --</option>
                                                        {cleanFaculties.map(faculty => (
                                                            <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={() => removeItemFromCollection(setDepartments, department.id)} className={iconButtonClass}>
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section title="УГСН и специальности" description="Можно подставлять коды из справочника ОКСО, названия и УГСН подтянутся автоматически.">
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">УГСН</h4>
                                            <button type="button" onClick={() => setUgs(prev => [...prev, createUgs()])} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                                <PlusIcon className="w-4 h-4" />
                                                Добавить УГСН
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {ugs.map(item => (
                                                <div key={item.id} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                                                    <input
                                                        type="text"
                                                        value={item.code}
                                                        onChange={e => updateItemInCollection(setUgs, item.id, { code: e.target.value })}
                                                        placeholder="09.00.00"
                                                        className={defaultInputClass}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={e => updateItemInCollection(setUgs, item.id, { name: e.target.value })}
                                                        placeholder="Название УГСН"
                                                        className={defaultInputClass}
                                                    />
                                                    <button type="button" onClick={() => removeItemFromCollection(setUgs, item.id)} className={iconButtonClass}>
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="font-medium text-gray-800">Специальности</h4>
                                            <button
                                                type="button"
                                                onClick={() => setSpecialties(prev => [...prev, createSpecialty(cleanUgs[0]?.id || '')])}
                                                className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                            >
                                                <PlusIcon className="w-4 h-4" />
                                                Добавить специальность
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {specialties.map(item => (
                                                <div key={item.id} className="grid grid-cols-[1fr,2fr,1.3fr,auto] gap-2 items-center">
                                                    <input
                                                        type="text"
                                                        list="wizard-okso-codes"
                                                        value={item.code}
                                                        onChange={e => updateSpecialty(item.id, 'code', e.target.value)}
                                                        placeholder="09.03.04"
                                                        className={defaultInputClass}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={item.name}
                                                        onChange={e => updateItemInCollection(setSpecialties, item.id, { name: e.target.value })}
                                                        placeholder="Название специальности"
                                                        className={defaultInputClass}
                                                    />
                                                    <select
                                                        value={item.ugsId}
                                                        onChange={e => updateItemInCollection(setSpecialties, item.id, { ugsId: e.target.value })}
                                                        className={defaultInputClass}
                                                    >
                                                        <option value="">-- УГСН --</option>
                                                        {cleanUgs.map(ugsItem => (
                                                            <option key={ugsItem.id} value={ugsItem.id}>{ugsItem.code} {ugsItem.name}</option>
                                                        ))}
                                                    </select>
                                                    <button type="button" onClick={() => removeItemFromCollection(setSpecialties, item.id)} className={iconButtonClass}>
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <datalist id="wizard-okso-codes">
                                                {OKSO_CODES.map(item => (
                                                    <option key={item.code} value={item.code}>{item.name}</option>
                                                ))}
                                            </datalist>
                                        </div>
                                    </div>
                                </div>
                            </Section>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Section title="Преподаватели" description="Добавь учебный состав и сразу привяжи его к кафедрам.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Список преподавателей</h4>
                                    <button
                                        type="button"
                                        onClick={() => setTeachers(prev => [...prev, createTeacher(cleanDepartments[0]?.id || '')])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить преподавателя
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {teachers.map(teacher => (
                                        <div key={teacher.id} className="grid grid-cols-[1.6fr,1fr,1fr,1fr,auto] gap-2 items-center">
                                            <input
                                                type="text"
                                                value={teacher.name}
                                                onChange={e => updateItemInCollection(setTeachers, teacher.id, { name: e.target.value })}
                                                placeholder="ФИО преподавателя"
                                                className={defaultInputClass}
                                            />
                                            <select
                                                value={teacher.departmentId}
                                                onChange={e => updateItemInCollection(setTeachers, teacher.id, { departmentId: e.target.value })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Кафедра --</option>
                                                {cleanDepartments.map(department => (
                                                    <option key={department.id} value={department.id}>{department.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={teacher.academicDegree || ''}
                                                onChange={e => updateItemInCollection(setTeachers, teacher.id, { academicDegree: (e.target.value || undefined) as AcademicDegree | undefined })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Степень --</option>
                                                {Object.values(AcademicDegree).map(value => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={teacher.academicTitle || ''}
                                                onChange={e => updateItemInCollection(setTeachers, teacher.id, { academicTitle: (e.target.value || undefined) as AcademicTitle | undefined })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Звание --</option>
                                                {Object.values(AcademicTitle).map(value => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => removeItemFromCollection(setTeachers, teacher.id)} className={iconButtonClass}>
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Группы" description="Сразу создай учебные группы и привяжи их к кафедрам и специальностям.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Список групп</h4>
                                    <button
                                        type="button"
                                        onClick={() => setGroups(prev => [...prev, createGroup(cleanDepartments[0]?.id || '', cleanSpecialties[0]?.id || '')])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить группу
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {groups.map(group => (
                                        <div key={group.id} className="grid grid-cols-[1.2fr,1fr,1.2fr,0.7fr,0.7fr,1fr,auto] gap-2 items-center">
                                            <input
                                                type="text"
                                                value={group.number}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { number: e.target.value })}
                                                placeholder="ПИ-101"
                                                className={defaultInputClass}
                                            />
                                            <select
                                                value={group.departmentId}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { departmentId: e.target.value })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Кафедра --</option>
                                                {cleanDepartments.map(department => (
                                                    <option key={department.id} value={department.id}>{department.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={group.specialtyId}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { specialtyId: e.target.value })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Специальность --</option>
                                                {cleanSpecialties.map(specialty => (
                                                    <option key={specialty.id} value={specialty.id}>{specialty.code} {specialty.name}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number"
                                                min="1"
                                                value={group.course}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { course: Number(e.target.value) })}
                                                placeholder="Курс"
                                                className={defaultInputClass}
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={group.studentCount}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { studentCount: Number(e.target.value) })}
                                                placeholder="Студентов"
                                                className={defaultInputClass}
                                            />
                                            <select
                                                value={group.formOfStudy}
                                                onChange={e => updateItemInCollection(setGroups, group.id, { formOfStudy: e.target.value as FormOfStudy })}
                                                className={defaultInputClass}
                                            >
                                                {Object.values(FormOfStudy).map(value => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => removeItemFromCollection(setGroups, group.id)} className={iconButtonClass}>
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </>
                    )}

                    {step === 4 && (
                        <>
                            <Section title="Типы аудиторий" description="Это справочник, который используется в требованиях предметов и подборе помещений.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Доступные типы</h4>
                                    <button
                                        type="button"
                                        onClick={() => setClassroomTypes(prev => [...prev, createClassroomType()])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить тип
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {classroomTypes.map(classroomType => (
                                        <div key={classroomType.id} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={classroomType.name}
                                                onChange={e => updateItemInCollection(setClassroomTypes, classroomType.id, { name: e.target.value })}
                                                placeholder="Например, лаборатория"
                                                className={defaultInputClass}
                                            />
                                            <button type="button" onClick={() => removeItemFromCollection(setClassroomTypes, classroomType.id)} className={iconButtonClass}>
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Аудитории" description="Заполни реальный аудиторный фонд, чтобы подбор помещений работал из коробки.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Список аудиторий</h4>
                                    <button
                                        type="button"
                                        onClick={() => setClassrooms(prev => [...prev, createClassroom(cleanClassroomTypes[0]?.id || '')])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить аудиторию
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {classrooms.map(classroom => (
                                        <div key={classroom.id} className="grid grid-cols-[1.2fr,0.8fr,1.2fr,auto] gap-2 items-center">
                                            <input
                                                type="text"
                                                value={classroom.number}
                                                onChange={e => updateItemInCollection(setClassrooms, classroom.id, { number: e.target.value })}
                                                placeholder="303-ПК"
                                                className={defaultInputClass}
                                            />
                                            <input
                                                type="number"
                                                min="1"
                                                value={classroom.capacity}
                                                onChange={e => updateItemInCollection(setClassrooms, classroom.id, { capacity: Number(e.target.value) })}
                                                placeholder="Мест"
                                                className={defaultInputClass}
                                            />
                                            <select
                                                value={classroom.typeId}
                                                onChange={e => updateItemInCollection(setClassrooms, classroom.id, { typeId: e.target.value })}
                                                className={defaultInputClass}
                                            >
                                                <option value="">-- Тип аудитории --</option>
                                                {cleanClassroomTypes.map(classroomType => (
                                                    <option key={classroomType.id} value={classroomType.id}>{classroomType.name}</option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => removeItemFromCollection(setClassrooms, classroom.id)} className={iconButtonClass}>
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </>
                    )}

                    {step === 5 && (
                        <>
                            <Section title="Предметы" description="Сюда вынесены предметы и базовые требования к типам аудиторий для лекций, практик и лабораторных.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Список предметов</h4>
                                    <button
                                        type="button"
                                        onClick={() => setSubjects(prev => [...prev, createSubject()])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить предмет
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {subjects.map(subject => (
                                        <div key={subject.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="grid grid-cols-[1.4fr,1fr,auto] gap-2 items-center">
                                                <input
                                                    type="text"
                                                    value={subject.name}
                                                    onChange={e => updateItemInCollection(setSubjects, subject.id, { name: e.target.value })}
                                                    placeholder="Название предмета"
                                                    className={defaultInputClass}
                                                />
                                                <select
                                                    value={subject.color || ''}
                                                    onChange={e => updateItemInCollection(setSubjects, subject.id, { color: e.target.value })}
                                                    className={defaultInputClass}
                                                >
                                                    <option value="">-- Цвет --</option>
                                                    {COLOR_PALETTE.map(color => (
                                                        <option key={color.value} value={color.value}>{color.name}</option>
                                                    ))}
                                                </select>
                                                <button type="button" onClick={() => removeItemFromCollection(setSubjects, subject.id)} className={iconButtonClass}>
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Лекционные аудитории</label>
                                                    <select
                                                        value={subject.classroomTypeRequirements?.[ClassType.Lecture]?.[0] || ''}
                                                        onChange={e => updateSubjectRequirement(subject.id, ClassType.Lecture, e.target.value)}
                                                        className={defaultInputClass}
                                                    >
                                                        <option value="">Без ограничения</option>
                                                        {cleanClassroomTypes.map(classroomType => (
                                                            <option key={classroomType.id} value={classroomType.id}>{classroomType.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Практические аудитории</label>
                                                    <select
                                                        value={subject.classroomTypeRequirements?.[ClassType.Practical]?.[0] || ''}
                                                        onChange={e => updateSubjectRequirement(subject.id, ClassType.Practical, e.target.value)}
                                                        className={defaultInputClass}
                                                    >
                                                        <option value="">Без ограничения</option>
                                                        {cleanClassroomTypes.map(classroomType => (
                                                            <option key={classroomType.id} value={classroomType.id}>{classroomType.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 mb-1">Лабораторные аудитории</label>
                                                    <select
                                                        value={subject.classroomTypeRequirements?.[ClassType.Lab]?.[0] || ''}
                                                        onChange={e => updateSubjectRequirement(subject.id, ClassType.Lab, e.target.value)}
                                                        className={defaultInputClass}
                                                    >
                                                        <option value="">Без ограничения</option>
                                                        {cleanClassroomTypes.map(classroomType => (
                                                            <option key={classroomType.id} value={classroomType.id}>{classroomType.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Привязки преподавателей к предметам" description="Эти связи нужны и для ручного редактирования, и для работы планировщика.">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-medium text-gray-800">Кто что ведет</h4>
                                    <button
                                        type="button"
                                        onClick={() => setTeacherSubjectLinks(prev => [...prev, createLink(cleanTeachers[0]?.id || '', cleanSubjects[0]?.id || '')])}
                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Добавить связь
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {teacherSubjectLinks.map(link => (
                                        <div key={link.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                                                <select
                                                    value={link.teacherId}
                                                    onChange={e => updateItemInCollection(setTeacherSubjectLinks, link.id, { teacherId: e.target.value })}
                                                    className={defaultInputClass}
                                                >
                                                    <option value="">-- Преподаватель --</option>
                                                    {cleanTeachers.map(teacher => (
                                                        <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                                                    ))}
                                                </select>
                                                <select
                                                    value={link.subjectId}
                                                    onChange={e => updateItemInCollection(setTeacherSubjectLinks, link.id, { subjectId: e.target.value })}
                                                    className={defaultInputClass}
                                                >
                                                    <option value="">-- Предмет --</option>
                                                    {cleanSubjects.map(subject => (
                                                        <option key={subject.id} value={subject.id}>{subject.name}</option>
                                                    ))}
                                                </select>
                                                <button type="button" onClick={() => removeItemFromCollection(setTeacherSubjectLinks, link.id)} className={iconButtonClass}>
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {editableClassTypes.map(classType => (
                                                    <label key={classType} className="flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm text-gray-700 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={link.classTypes.includes(classType)}
                                                            onChange={() => toggleLinkClassType(link.id, classType)}
                                                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span>{classType}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>

                            <Section title="Учебные планы" description="Для каждой специальности можно сразу занести дисциплины, часы и форму аттестации.">
                                <div className="space-y-4">
                                    {cleanSpecialties.map(specialty => {
                                        const plan = getPlanForSpecialty(specialty.id);
                                        return (
                                            <div key={specialty.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div>
                                                        <h4 className="font-semibold text-gray-800">{specialty.code || 'Без кода'} {specialty.name || 'Новая специальность'}</h4>
                                                        <p className="text-sm text-gray-500">Строки плана для этой специальности.</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => addPlanEntry(specialty.id)}
                                                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                        <PlusIcon className="w-4 h-4" />
                                                        Добавить дисциплину
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {(plan?.entries || []).length > 0 ? (
                                                        (plan?.entries || []).map((entry, index) => (
                                                            <div key={`${specialty.id}-${index}`} className="grid grid-cols-[1.4fr,0.6fr,0.7fr,0.7fr,0.7fr,1fr,0.8fr,auto] gap-2 items-center">
                                                                <select
                                                                    value={entry.subjectId}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { subjectId: e.target.value })}
                                                                    className={defaultInputClass}
                                                                >
                                                                    <option value="">-- Предмет --</option>
                                                                    {cleanSubjects.map(subject => (
                                                                        <option key={subject.id} value={subject.id}>{subject.name}</option>
                                                                    ))}
                                                                </select>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    value={entry.semester}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { semester: Number(e.target.value) })}
                                                                    className={defaultInputClass}
                                                                    placeholder="Сем."
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={entry.lectureHours}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { lectureHours: Number(e.target.value) })}
                                                                    className={defaultInputClass}
                                                                    placeholder="Лек."
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={entry.practiceHours}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { practiceHours: Number(e.target.value) })}
                                                                    className={defaultInputClass}
                                                                    placeholder="Прак."
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    value={entry.labHours}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { labHours: Number(e.target.value) })}
                                                                    className={defaultInputClass}
                                                                    placeholder="Лаб."
                                                                />
                                                                <select
                                                                    value={entry.attestation}
                                                                    onChange={e => updatePlanEntry(specialty.id, index, { attestation: e.target.value as AttestationType })}
                                                                    className={defaultInputClass}
                                                                >
                                                                    {Object.values(AttestationType).map(value => (
                                                                        <option key={value} value={value}>{value}</option>
                                                                    ))}
                                                                </select>
                                                                <label className="flex items-center justify-center gap-2 text-sm text-gray-700">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={Boolean(entry.splitForSubgroups)}
                                                                        onChange={e => updatePlanEntry(specialty.id, index, { splitForSubgroups: e.target.checked })}
                                                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    Делить
                                                                </label>
                                                                <button type="button" onClick={() => removePlanEntry(specialty.id, index)} className={iconButtonClass}>
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500">
                                                            Для этой специальности пока нет строк плана. Добавь хотя бы одну дисциплину.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Section>

                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                                Мастер закрывает основной старт проекта: календарь, структуру, состав, аудитории, предметы, связи и учебные планы. Продвинутые сущности вроде подгрупп, потоков, факультативов и правил при желании можно дополнить уже после создания проекта.
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-between items-center mt-6 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">
                        Отмена
                    </button>
                    <div className="flex items-center gap-4">
                        {step > 1 && (
                            <button
                                type="button"
                                onClick={() => setStep(prev => prev - 1)}
                                className="px-6 py-2 bg-white text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors flex items-center gap-2"
                            >
                                <ChevronLeftIcon className="w-5 h-5" />
                                Назад
                            </button>
                        )}
                        {step < stepNames.length ? (
                            <button
                                type="button"
                                onClick={() => setStep(prev => prev + 1)}
                                disabled={!isStepValid}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-blue-300 disabled:cursor-not-allowed"
                            >
                                Далее
                                <ChevronRightIcon className="w-5 h-5" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleCreateProject}
                                disabled={!isStepValid}
                                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed"
                            >
                                Создать проект
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewProjectWizard;
