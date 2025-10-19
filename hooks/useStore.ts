import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { 
    Faculty, Department, Teacher, Group, Stream, Classroom, Subject, Cabinet, TimeSlot, ScheduleEntry, 
    UnscheduledEntry, DataItem, DataType, ClassroomType, ClassType, TeacherSubjectLink, SchedulingRule, 
    ProductionCalendarEvent, SchedulingSettings, AvailabilityGrid, AvailabilityType, UGS, Specialty, 
    EducationalPlan, PlanEntry, AttestationType, ScheduleTemplate, FormOfStudy, DeliveryMode, Subgroup, Elective,
    AcademicDegree, AcademicTitle, FieldOfScience, BaseItem, ClassroomTag, HeuristicConfig, SessionSchedulerConfig
} from '../types';
import { getWeekType, toYYYYMMDD, getWeekDays } from '../utils/dateUtils';
import { DAYS_OF_WEEK } from '../constants';
import { generateScheduleWithHeuristics, SchedulerResult } from '../services/heuristicScheduler';
import { generateScheduleWithGemini } from '../services/geminiService';
import { generateScheduleWithOpenRouter } from '../services/openRouterService';
import { runIterativeScheduler } from '../services/iterativeScheduler';
import { generateSessionSchedule } from '../services/sessionScheduler';

// MOCK DATA (Initial State)
const initialFaculties: Faculty[] = [{
    id: 'f1',
    name: 'Факультет информационных технологий',
    deanId: 't1',
    address: 'г. Самара, Главный корпус, каб. 101',
    phone: '8 (800) 555-35-35',
    email: 'fit@university.edu',
    notes: 'Ведущий факультет в области подготовки IT-специалистов. Основан в 1995 году.'
}];
const initialUGS: UGS[] = [{ id: 'ugs1', code: '09.00.00', name: 'Информатика и вычислительная техника'}];
const initialSpecialties: Specialty[] = [{ id: 'spec1', code: '09.03.04', name: 'Программная инженерия', ugsId: 'ugs1', oksoCode: '09.03.04' }];
const initialDepartments: Department[] = [{ 
    id: 'd1', 
    name: 'Кафедра программной инженерии', 
    facultyId: 'f1', 
    specialtyIds: ['spec1'],
    headTeacherId: 't1',
    address: 'г. Самара, улица Советской Армии, д.141, кабинет 320Е',
    phone: '8 (846) 933-88-26',
    email: 'bacanach@sseu.ru, statistika@sseu.ru',
    vkLink: 'https://vk.com/statistika_sseu',
    telegramLink: 'https://t.me/statistika_sseu',
    notes: 'Кафедра является одной из старейших в университете. Она была образована в 1965 году. За время своего существования кафедра подготовила несколько тысяч специалистов в области статистики, которые успешно работают в различных отраслях экономики.'
}];
const initialTeachers: Teacher[] = [
    { id: 't1', name: 'Иванов И.И.', departmentId: 'd1', academicDegree: AcademicDegree.Doctor, fieldOfScience: FieldOfScience.Engineering, academicTitle: AcademicTitle.Professor, hireDate: '2010-09-01', regalia: 'Заслуженный деятель науки РФ', color: 'blue' }, 
    { id: 't2', name: 'Петров П.П.', departmentId: 'd1', academicDegree: AcademicDegree.Candidate, fieldOfScience: FieldOfScience.PhysicalMathematical, academicTitle: AcademicTitle.Docent, hireDate: '2018-03-15', color: 'green' }
];
const initialGroups: Group[] = [{ id: 'g1', number: 'ПИ-101', departmentId: 'd1', studentCount: 25, course: 1, specialtyId: 'spec1', formOfStudy: FormOfStudy.FullTime }];
const initialSubgroups: Subgroup[] = [];
const initialElectives: Elective[] = [];
const initialStreams: Stream[] = [];
const initialClassroomTypes: ClassroomType[] = [
    { id: 'ct1', name: 'Лекционная' },
    { id: 'ct2', name: 'Практическая' },
    { id: 'ct3', name: 'Лаборатория' },
    { id: 'ct4', name: 'Компьютерный класс' },
];
const initialClassroomTags: ClassroomTag[] = [
    { id: 'tag-proj', name: 'Проектор', icon: 'VideoCameraIcon', color: 'blue' },
    { id: 'tag-comp', name: 'Компьютеры', icon: 'DesktopComputerIcon', color: 'green' },
    { id: 'tag-board', name: 'Интерактивная доска', icon: 'PresentationChartBarIcon', color: 'indigo' },
];
const initialClassrooms: Classroom[] = [
    { id: 'c1', number: '101', capacity: 60, typeId: 'ct1', tagIds: ['tag-proj'] },
    { id: 'c2', number: '202', capacity: 30, typeId: 'ct2' },
    { id: 'c3', number: '303-PC', capacity: 20, typeId: 'ct4', tagIds: ['tag-comp', 'tag-board'] },
];
const initialSubjects: Subject[] = [
    { id: 'sub1', name: 'Основы программирования', classroomTypeRequirements: { [ClassType.Practical]: ['ct2', 'ct4'] }, requiredClassroomTagIds: ['tag-comp'], color: 'indigo' },
    { id: 'sub2', name: 'Базы данных', classroomTypeRequirements: { [ClassType.Lecture]: ['ct1'], [ClassType.Lab]: ['ct3', 'ct4'] }, color: 'red' },
];
const initialEducationalPlans: EducationalPlan[] = [
    { id: 'plan1', specialtyId: 'spec1', entries: [
        { subjectId: 'sub1', semester: 1, lectureHours: 32, practiceHours: 32, labHours: 0, attestation: AttestationType.Exam, splitForSubgroups: true },
        { subjectId: 'sub2', semester: 1, lectureHours: 16, practiceHours: 0, labHours: 32, attestation: AttestationType.Test },
    ]}
];
const initialCabinets: Cabinet[] = [];
const initialTimeSlots: TimeSlot[] = [
    { id: 'ts1', time: '08:30-10:00' }, { id: 'ts2', time: '10:15-11:45' },
    { id: 'ts3', time: '12:00-13:30' }, { id: 'ts4', time: '14:15-15:45' },
];
const initialTimeSlotsShortened: TimeSlot[] = [
    { id: 'tss1', time: '08:30-09:50' }, { id: 'tss2', time: '10:00-11:20' },
    { id: 'tss3', time: '11:30-12:50' }, { id: 'tss4', time: '13:00-14:20' },
];
const initialSchedule: ScheduleEntry[] = [];
const initialTeacherSubjectLinks: TeacherSubjectLink[] = [
    { id: 'l1', teacherId: 't1', subjectId: 'sub1', classTypes: [ClassType.Lecture, ClassType.Practical] },
    { id: 'l2', teacherId: 't2', subjectId: 'sub2', classTypes: [ClassType.Lecture, ClassType.Lab] },
];
const initialSchedulingRules: SchedulingRule[] = [];
const initialProductionCalendar: ProductionCalendarEvent[] = [];
const initialSettings: SchedulingSettings = {
    semesterStart: '2024-09-02',
    semesterEnd: '2024-12-31',
    sessionStart: '2025-01-09',
    sessionEnd: '2025-01-25',
    practiceStart: '2025-02-01',
    practiceEnd: '2025-02-28',
    retakeStart: '2025-02-01',
    retakeEnd: '2025-02-14',
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
};
const initialScheduleTemplates: ScheduleTemplate[] = [];


const generateUnscheduledEntries = (
    groups: Group[],
    educationalPlans: EducationalPlan[],
    links: TeacherSubjectLink[],
    streams: Stream[],
    subgroups: Subgroup[],
    electives: Elective[]
): UnscheduledEntry[] => {
    const entries: UnscheduledEntry[] = [];
    const currentSemester = 1;

    const groupToStreamMap = new Map<string, string>();
    streams.forEach(stream => stream.groupIds.forEach(groupId => groupToStreamMap.set(groupId, stream.id)));

    const processedGroupLectures = new Set<string>(); // key: `${subjectId}-${groupId}` to track handled groups

    groups.forEach(group => {
        const plan = educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        const groupSubgroups = subgroups.filter(sg => sg.parentGroupId === group.id);
        const relevantEntries = plan.entries.filter(e => e.semester === currentSemester);

        relevantEntries.forEach(planEntry => {
            let teacherId: string | undefined;

            // 1. Handle Lectures
            if (planEntry.lectureHours > 0 && !processedGroupLectures.has(`${planEntry.subjectId}-${group.id}`)) {
                const numClasses = Math.ceil(planEntry.lectureHours / 2);
                const streamId = groupToStreamMap.get(group.id);

                let lectureGroups: Group[] = [group];
                
                // If in a stream, find all other groups in that stream with the same lecture
                if (streamId) {
                    const stream = streams.find(s => s.id === streamId)!;
                    const otherStreamGroups = groups.filter(g => stream.groupIds.includes(g.id) && g.id !== group.id);

                    otherStreamGroups.forEach(otherGroup => {
                        const otherPlan = educationalPlans.find(p => p.specialtyId === otherGroup.specialtyId);
                        if (otherPlan && otherPlan.entries.some(e => e.semester === currentSemester && e.subjectId === planEntry.subjectId && e.lectureHours > 0)) {
                            lectureGroups.push(otherGroup);
                        }
                    });
                }
                
                teacherId = links.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
                if (teacherId) {
                    const studentCount = lectureGroups.reduce((sum, g) => sum + g.studentCount, 0);
                    const groupIds = lectureGroups.map(g => g.id);
                    
                    for (let i = 0; i < numClasses; i++) {
                        const entry: UnscheduledEntry = {
                            uid: `unsched-${planEntry.subjectId}-${groupIds.join('_')}-${ClassType.Lecture}-${i}`,
                            subjectId: planEntry.subjectId,
                            classType: ClassType.Lecture,
                            teacherId,
                            studentCount,
                        };
                        if (lectureGroups.length > 1) {
                            entry.groupIds = groupIds;
                            // Check if this is a full stream lecture
                            const stream = streams.find(s => s.id === streamId);
                            if(stream && stream.groupIds.length === groupIds.length){
                                entry.streamId = streamId;
                            }
                        } else {
                            entry.groupId = group.id;
                        }
                        entries.push(entry);
                    }
                }
                
                // Mark all participating groups as processed for this subject's lecture
                lectureGroups.forEach(g => processedGroupLectures.add(`${planEntry.subjectId}-${g.id}`));
            }
            
            // 2. Handle Practices and Labs
            const practiceAndLabTypes = [
                { type: ClassType.Practical, hours: planEntry.practiceHours },
                { type: ClassType.Lab, hours: planEntry.labHours },
            ];
            practiceAndLabTypes.forEach(({ type, hours }) => {
                if (hours <= 0) return;
                const numClasses = Math.ceil(hours / 2);

                if (planEntry.splitForSubgroups && groupSubgroups.length > 0) {
                    groupSubgroups.forEach(subgroup => {
                        const assignment = subgroup.teacherAssignments?.find(a => a.subjectId === planEntry.subjectId && a.classType === type);
                        teacherId = assignment?.teacherId ?? links.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
                        if (teacherId) {
                            for (let i = 0; i < numClasses; i++) {
                                entries.push({
                                    uid: `unsched-${planEntry.subjectId}-${subgroup.id}-${type}-${i}`,
                                    subjectId: planEntry.subjectId, groupId: group.id, subgroupId: subgroup.id,
                                    classType: type, teacherId, studentCount: subgroup.studentCount,
                                });
                            }
                        }
                    });
                } else { // Whole group for practice/lab
                    teacherId = links.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
                    if (teacherId) {
                        for (let i = 0; i < numClasses; i++) {
                            entries.push({
                                uid: `unsched-${planEntry.subjectId}-${group.id}-${type}-${i}`,
                                subjectId: planEntry.subjectId, groupId: group.id,
                                classType: type, teacherId, studentCount: group.studentCount,
                            });
                        }
                    }
                }
            });
        });
    });
    
    electives.forEach(elective => {
        const numClasses = Math.ceil(elective.hoursPerSemester / 2);
        const group = groups.find(g => g.id === elective.groupId);
        if (!group) return;

        for (let i = 0; i < numClasses; i++) {
            entries.push({
                uid: `unsched-elective-${elective.id}-${i}`,
                subjectId: elective.subjectId,
                groupId: elective.groupId,
                classType: ClassType.Elective,
                teacherId: elective.teacherId,
                studentCount: group.studentCount,
            });
        }
    });

    return entries;
};


interface StoreState {
  faculties: Faculty[]; departments: Department[]; teachers: Teacher[]; groups: Group[];
  streams: Stream[]; classrooms: Classroom[]; subjects: Subject[]; cabinets: Cabinet[];
  timeSlots: TimeSlot[]; timeSlotsShortened: TimeSlot[]; schedule: ScheduleEntry[]; unscheduledEntries: UnscheduledEntry[];
  teacherSubjectLinks: TeacherSubjectLink[]; schedulingRules: SchedulingRule[]; 
  productionCalendar: ProductionCalendarEvent[]; settings: SchedulingSettings;
  ugs: UGS[]; specialties: Specialty[]; educationalPlans: EducationalPlan[];
  scheduleTemplates: ScheduleTemplate[]; classroomTypes: ClassroomType[]; classroomTags: ClassroomTag[];
  subgroups: Subgroup[]; electives: Elective[];
  isGeminiAvailable: boolean;
  currentFilePath: string | null;
  lastAutosave: Date | null;
  apiKey: string;
  openRouterApiKey: string;
  unscheduledTimeHorizon: 'semester' | 'week' | 'twoWeeks';
  schedulingProgress: { current: number; total: number } | null;
  viewDate: string;
  
  addItem: (dataType: DataType, item: Omit<DataItem, 'id'>) => void;
  updateItem: (dataType: DataType, item: DataItem) => void;
  deleteItem: (dataType: DataType, id: string) => void;
  setSchedule: (newSchedule: ScheduleEntry[]) => void;
  placeUnscheduledItem: (item: UnscheduledEntry, day: string, timeSlotId: string, weekType: 'even' | 'odd' | 'every', date: string) => void;
  updateScheduleEntry: (updatedEntry: ScheduleEntry) => void;
  deleteScheduleEntry: (entry: ScheduleEntry) => void;
  removeScheduleEntries: (entryIds: string[]) => void;
  addScheduleEntry: (entry: Omit<ScheduleEntry, 'id'>) => void;
  updateSettings: (newSettings: SchedulingSettings) => void;
  updateApiKey: (newKey: string) => Promise<void>;
  updateOpenRouterApiKey: (newKey: string) => Promise<void>;
  propagateWeekSchedule: (weekTypeToCopy: 'even' | 'odd', currentViewDate: string) => void;
  saveCurrentScheduleAsTemplate: (name: string, description: string, currentViewDate: string) => void;
  loadScheduleFromTemplate: (templateId: string, targetViewDate: string, method: 'replace' | 'merge') => void;
  setUnscheduledTimeHorizon: (horizon: 'semester' | 'week' | 'twoWeeks') => void;
  setViewDate: (date: string) => void;
  runScheduler: (method: 'heuristic' | 'gemini' | 'openrouter', config?: HeuristicConfig) => Promise<{ scheduled: number; unscheduled: number; failedEntries: UnscheduledEntry[] }>;
  runSessionScheduler: (config: SessionSchedulerConfig) => Promise<{ scheduled: number; unscheduled: number; failedEntries: any[] }>;
  clearSchedule: () => void;
  resetSchedule: () => void;
  startNewProject: () => void;
  handleOpen: () => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAs: () => Promise<void>;
  getFullState: () => any;
  loadFullState: (data: any) => void;
  mergeFullState: (data: any) => void;
  clearAllData: () => void;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within a StoreProvider');
  return context;
};

const getInitialEmptySettings = (): SchedulingSettings => ({
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


export const StoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [faculties, setFaculties] = useState(initialFaculties);
  const [departments, setDepartments] = useState(initialDepartments);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [groups, setGroups] = useState(initialGroups);
  const [streams, setStreams] = useState(initialStreams);
  const [classrooms, setClassrooms] = useState(initialClassrooms);
  const [subjects, setSubjects] = useState(initialSubjects);
  const [cabinets, setCabinets] = useState(initialCabinets);
  const [timeSlots, setTimeSlots] = useState(initialTimeSlots);
  const [timeSlotsShortened, setTimeSlotsShortened] = useState(initialTimeSlotsShortened);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>(initialSchedule);
  const [unscheduledEntries, setUnscheduledEntries] = useState<UnscheduledEntry[]>([]);
  const [ugs, setUgs] = useState(initialUGS);
  const [specialties, setSpecialties] = useState(initialSpecialties);
  const [educationalPlans, setEducationalPlans] = useState(initialEducationalPlans);
  const [teacherSubjectLinks, setTeacherSubjectLinks] = useState(initialTeacherSubjectLinks);
  const [schedulingRules, setSchedulingRules] = useState(initialSchedulingRules);
  const [productionCalendar, setProductionCalendar] = useState(initialProductionCalendar);
  const [settings, setSettings] = useState(initialSettings);
  const [scheduleTemplates, setScheduleTemplates] = useState(initialScheduleTemplates);
  const [classroomTypes, setClassroomTypes] = useState(initialClassroomTypes);
  const [classroomTags, setClassroomTags] = useState(initialClassroomTags);
  const [subgroups, setSubgroups] = useState(initialSubgroups);
  const [electives, setElectives] = useState(initialElectives);
  const [isGeminiAvailable, setIsGeminiAvailable] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [lastAutosave, setLastAutosave] = useState<Date | null>(null);
  const [unscheduledTimeHorizon, setUnscheduledTimeHorizon] = useState<'semester' | 'week' | 'twoWeeks'>('semester');
  const [schedulingProgress, setSchedulingProgress] = useState<{ current: number; total: number } | null>(null);
  const [viewDate, setViewDate] = useState(toYYYYMMDD(new Date()));

  useEffect(() => {
    // 1. Generate all possible classes for the semester from plans. This is the "master list".
    const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
    
    // 2. Create a set of UIDs for classes that are already on the schedule.
    const allScheduledUids = new Set(schedule.map(e => e.unscheduledUid).filter(Boolean));
    
    // 3. The pool of all unscheduled classes for the entire semester.
    const allUnscheduledForSemester = allPossibleEntries.filter(e => !allScheduledUids.has(e.uid));

    // If view is 'semester', show everything unscheduled.
    if (unscheduledTimeHorizon === 'semester') {
      setUnscheduledEntries(allUnscheduledForSemester);
      return;
    }

    // --- Logic for 'week' and 'twoWeeks' horizons ---
    const semesterStartDate = new Date(settings.semesterStart + 'T00:00:00');
    const semesterEndDate = new Date(settings.semesterEnd + 'T00:00:00');
    
    // Fallback to showing all if dates are invalid.
    if (isNaN(semesterStartDate.getTime()) || isNaN(semesterEndDate.getTime()) || semesterEndDate <= semesterStartDate) {
        setUnscheduledEntries(allUnscheduledForSemester);
        return;
    }

    const weeksInSemester = Math.ceil((semesterEndDate.getTime() - semesterStartDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    if (weeksInSemester <= 0) {
        setUnscheduledEntries(allUnscheduledForSemester);
        return;
    }

    const viewDateObj = new Date(viewDate + 'T00:00:00');
    
    // 4. Calculate the current week number (1-based) relative to the semester start.
    let currentSemesterWeek = 1;
    if (viewDateObj >= semesterStartDate) {
        const diffTime = viewDateObj.getTime() - semesterStartDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        currentSemesterWeek = Math.floor(diffDays / 7) + 1;
    }
    
    const getEntryKey = (e: UnscheduledEntry) => `${e.subjectId}-${e.groupId || ''}-${(e.groupIds || []).join('_')}-${e.subgroupId || ''}-${e.classType}`;

    // 5. Group all possible entries by type (subject, group, etc.) to process them independently.
    const possibleEntryGroups = new Map<string, UnscheduledEntry[]>();
    allPossibleEntries.forEach(entry => {
        const key = getEntryKey(entry);
        if (!possibleEntryGroups.has(key)) possibleEntryGroups.set(key, []);
        possibleEntryGroups.get(key)!.push(entry);
    });

    const horizonWeeks = unscheduledTimeHorizon === 'week' ? 1 : 2;
    const newUnscheduled: UnscheduledEntry[] = [];

    possibleEntryGroups.forEach((possibleList, key) => {
        const demand = possibleList.length;
        if (demand === 0) return;

        const classesPerWeek = demand / weeksInSemester;
        
        // 6. Calculate the target week number for the end of our viewing period.
        const endOfHorizonWeekNumber = (currentSemesterWeek - 1) + horizonWeeks;

        // 7. Calculate the cumulative number of classes of this type that *should* be completed by the end of the horizon.
        // This creates a target based on the average rate. We use ceil to ensure we plan for fractions of classes.
        const cumulativeTargetCount = Math.ceil(classesPerWeek * endOfHorizonWeekNumber);

        // 8. Get the candidate entries from the master list that fall within this cumulative target.
        const candidateEntries = possibleList.slice(0, cumulativeTargetCount);
        
        // 9. From these candidates, filter out any that are already scheduled. The result is the backlog + current items to be shown.
        const entriesToShow = candidateEntries.filter(entry => !allScheduledUids.has(entry.uid));
        
        newUnscheduled.push(...entriesToShow);
    });

    setUnscheduledEntries(newUnscheduled);
  }, [groups, educationalPlans, teacherSubjectLinks, streams, schedule, subgroups, electives, unscheduledTimeHorizon, settings.semesterStart, settings.semesterEnd, viewDate]);

  useEffect(() => {
    const initializeApiKeys = async () => {
        if (window.electronAPI?.isAiForced) {
            const aiForced = await window.electronAPI.isAiForced();
            if (aiForced) {
                console.log("AI features forced by '-ai' flag.");
                setIsGeminiAvailable(true);
                setApiKey('******** (Активировано флагом)');
                // Also check for OpenRouter key in env if AI is forced
                if (process.env.OPENROUTER_API_KEY) {
                    setOpenRouterApiKey('******** (Активировано флагом)');
                }
                return;
            }
        }

        if (window.electronAPI) {
            try {
                const geminiKey = await window.electronAPI.getApiKey();
                setApiKey(geminiKey || '');
                setIsGeminiAvailable(!!geminiKey);

                const orKey = await window.electronAPI.getOpenRouterApiKey();
                setOpenRouterApiKey(orKey || '');

            } catch (error) {
                console.error("Не удалось получить API-ключи:", error);
                setIsGeminiAvailable(false);
                setApiKey('');
                setOpenRouterApiKey('');
            }
        } else {
            setIsGeminiAvailable(false);
            console.log("Приложение запущено не в среде Electron или флаг -ai не указан. Функции ИИ будут отключены.");
        }
    };
    initializeApiKeys();
  }, []);
  
  const getFullState = () => ({
    faculties, departments, teachers, groups, streams, classrooms, subjects, cabinets, timeSlots, timeSlotsShortened, schedule, unscheduledEntries,
    teacherSubjectLinks, schedulingRules, productionCalendar, settings, ugs, specialties, educationalPlans, scheduleTemplates,
    classroomTypes, classroomTags, isGeminiAvailable, subgroups, electives, currentFilePath, lastAutosave
  });
  
  const stateRef = useRef(getFullState());
  useEffect(() => {
      stateRef.current = getFullState();
  });
  
  const loadFullState = (data: any) => {
    setFaculties(data.faculties || []);
    setDepartments(data.departments || []);
    setTeachers(data.teachers || []);
    setGroups(data.groups || []);
    setStreams(data.streams || []);
    setClassrooms(data.classrooms || []);
    setSubjects(data.subjects || []);
    setCabinets(data.cabinets || []);
    setTimeSlots(data.timeSlots || []);
    setTimeSlotsShortened(data.timeSlotsShortened || []);
    setSchedule(data.schedule || []);
    setTeacherSubjectLinks(data.teacherSubjectLinks || []);
    setSchedulingRules(data.schedulingRules || []);
    setProductionCalendar(data.productionCalendar || []);
    setSettings({ ...getInitialEmptySettings(), ...(data.settings || {}) });
    setUgs(data.ugs || []);
    setSpecialties(data.specialties || []);
    setEducationalPlans(data.educationalPlans || []);
    setScheduleTemplates(data.scheduleTemplates || []);
    setClassroomTypes(data.classroomTypes || initialClassroomTypes);
    setClassroomTags(data.classroomTags || initialClassroomTags);
    setSubgroups(data.subgroups || []);
    setElectives(data.electives || []);
    setCurrentFilePath(data.currentFilePath || null);
  };

  const mergeFullState = (data: any) => {
    const merge = <T extends BaseItem>(
      setState: React.Dispatch<React.SetStateAction<T[]>>,
      newData: T[] | undefined
    ) => {
      if (!Array.isArray(newData)) return;
      setState(prev => {
        const existingMap = new Map(prev.map(item => [item.id, item]));
        newData.forEach(newItem => {
          if (newItem && typeof newItem.id !== 'undefined') {
             existingMap.set(newItem.id, newItem); // Add or overwrite
          }
        });
        return Array.from(existingMap.values());
      });
    };

    merge(setFaculties, data.faculties);
    merge(setDepartments, data.departments);
    merge(setTeachers, data.teachers);
    merge(setGroups, data.groups);
    merge(setStreams, data.streams);
    merge(setClassrooms, data.classrooms);
    merge(setSubjects, data.subjects);
    merge(setCabinets, data.cabinets);
    merge(setTimeSlots, data.timeSlots);
    merge(setTimeSlotsShortened, data.timeSlotsShortened);
    merge(setSchedule, data.schedule);
    merge(setTeacherSubjectLinks, data.teacherSubjectLinks);
    merge(setSchedulingRules, data.schedulingRules);
    merge(setProductionCalendar, data.productionCalendar);
    merge(setUgs, data.ugs);
    merge(setSpecialties, data.specialties);
    merge(setEducationalPlans, data.educationalPlans);
    merge(setScheduleTemplates, data.scheduleTemplates);
    merge(setClassroomTypes, data.classroomTypes);
    merge(setClassroomTags, data.classroomTags);
    merge(setSubgroups, data.subgroups);
    merge(setElectives, data.electives);

    if (data.settings) {
      setSettings(prev => ({ ...prev, ...data.settings }));
    }
  };
  
  // Autosave and Window Title Effects
  useEffect(() => {
    if (!window.electronAPI) return;
    const interval = setInterval(async () => {
      const state = stateRef.current; // Read from ref to get the latest state
      await window.electronAPI.autosave(JSON.stringify(state));
      setLastAutosave(new Date());
    }, 30000); // Autosave every 30 seconds
    return () => clearInterval(interval);
  }, []); // Empty dependency array ensures the effect runs only once

  useEffect(() => {
    if (!window.electronAPI) return;
    const fileName = currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'Новый проект';
    window.electronAPI.setWindowTitle(`${fileName} - Система расписаний ВУЗа`);
  }, [currentFilePath]);
  
  // Autosave recovery listener
  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.onRestoreAutosaveRequest(async () => {
        if (window.confirm("Обнаружен файл автосохранения. Хотите восстановить его? \n\nВнимание: все текущие несохраненные данные будут утеряны.")) {
            const result = await window.electronAPI.restoreAutosave();
            if (result && result.data) {
                try {
                    const parsedData = JSON.parse(result.data);
                    loadFullState(parsedData);
                     alert("Автосохранение восстановлено. Рекомендуется сохранить проект в новом файле ('Файл -> Сохранить как...').");
                } catch (e) {
                    console.error("Failed to parse autosave data:", e);
                    alert("Не удалось восстановить данные: файл поврежден.");
                }
            }
        }
    });
  }, []); // Should only run once
  
  // Listener for loading the last project on startup
    useEffect(() => {
        if (window.electronAPI?.onLoadInitialProject) {
            window.electronAPI.onLoadInitialProject((project) => {
                if (project && project.data) {
                    try {
                        const parsedData = JSON.parse(project.data);
                        loadFullState(parsedData);
                        setCurrentFilePath(project.filePath);
                        console.log("Loaded last saved project:", project.filePath);
                    } catch (e) {
                        console.error("Failed to parse last saved project data:", e);
                    }
                }
            });
        }
    }, []);


  const stateSetters: Record<DataType, React.Dispatch<React.SetStateAction<any[]>>> = {
    faculties: setFaculties, departments: setDepartments, teachers: setTeachers, groups: setGroups,
    streams: setStreams, classrooms: setClassrooms, subjects: setSubjects, cabinets: setCabinets,
    timeSlots: setTimeSlots, timeSlotsShortened: setTimeSlotsShortened, teacherSubjectLinks: setTeacherSubjectLinks, schedulingRules: setSchedulingRules,
    productionCalendar: setProductionCalendar, ugs: setUgs, specialties: setSpecialties, 
    educationalPlans: setEducationalPlans, scheduleTemplates: setScheduleTemplates, classroomTypes: setClassroomTypes,
    classroomTags: setClassroomTags, subgroups: setSubgroups, electives: setElectives,
  };

  const addItem = (dataType: DataType, item: Omit<DataItem, 'id'>) => {
    const setter = stateSetters[dataType];
    const newItem = { ...item, id: `${dataType.slice(0, 3)}-${Date.now()}` } as DataItem;
    setter(prev => [...prev, newItem]);
  };
  
  const updateItem = (dataType: DataType, item: DataItem) => {
    const setter = stateSetters[dataType];
    setter(prev => prev.map(i => (i.id === item.id ? item : i)));
  };

  const deleteItem = (dataType: DataType, id: string) => {
    const fullState = getFullState();

    // Pre-deletion checks
    if (dataType === 'classroomTypes' && fullState.classrooms.some((c: Classroom) => c.typeId === id)) {
      alert('Этот тип аудитории используется. Сначала измените тип у всех аудиторий, использующих его.');
      return;
    }

    const toDelete: { [K in DataType]?: Set<string> } = {};
    const getSet = (type: DataType) => {
        if (!toDelete[type]) {
            toDelete[type] = new Set<string>();
        }
        return toDelete[type]!;
    };
    
    const queue: { type: DataType; id: string }[] = [{ type: dataType, id }];
    const processed = new Set<string>();

    while (queue.length > 0) {
        const { type, id: currentId } = queue.shift()!;
        const processKey = `${type}-${currentId}`;
        if (processed.has(processKey)) continue;

        getSet(type).add(currentId);
        processed.add(processKey);

        switch (type) {
            case 'faculties':
                fullState.departments.filter((d: Department) => d.facultyId === currentId).forEach((d: Department) => queue.push({ type: 'departments', id: d.id }));
                break;
            case 'departments':
                fullState.teachers.filter((t: Teacher) => t.departmentId === currentId).forEach((t: Teacher) => queue.push({ type: 'teachers', id: t.id }));
                fullState.groups.filter((g: Group) => g.departmentId === currentId).forEach((g: Group) => queue.push({ type: 'groups', id: g.id }));
                fullState.cabinets.filter((c: Cabinet) => c.departmentId === currentId).forEach((c: Cabinet) => queue.push({ type: 'cabinets', id: c.id }));
                break;
            case 'ugs':
                fullState.specialties.filter((s: Specialty) => s.ugsId === currentId).forEach((s: Specialty) => queue.push({ type: 'specialties', id: s.id }));
                break;
            case 'specialties':
                fullState.groups.filter((g: Group) => g.specialtyId === currentId).forEach((g: Group) => queue.push({ type: 'groups', id: g.id }));
                fullState.educationalPlans.filter((p: EducationalPlan) => p.specialtyId === currentId).forEach((p: EducationalPlan) => queue.push({ type: 'educationalPlans', id: p.id }));
                break;
            case 'groups':
                fullState.subgroups.filter((sg: Subgroup) => sg.parentGroupId === currentId).forEach((sg: Subgroup) => queue.push({ type: 'subgroups', id: sg.id }));
                break;
        }
    }

    // Apply deletions
    Object.keys(toDelete).forEach(key => {
        const type = key as DataType;
        const ids = toDelete[type]!;
        if (ids.size > 0 && stateSetters[type]) {
            stateSetters[type](prev => prev.filter(item => !ids.has(item.id)));
        }
    });
    
    // Apply cascading cleanups on related data
    const groupIds = getSet('groups');
    const teacherIds = getSet('teachers');
    const subjectIds = getSet('subjects');
    const classroomIds = getSet('classrooms');
    const specialtyIds = getSet('specialties');
    const timeSlotIds = new Set([...getSet('timeSlots'), ...getSet('timeSlotsShortened')]);
    const classroomTagIds = getSet('classroomTags');
    
    setSchedule(prev => prev.filter(e => 
        !groupIds.has(e.groupId || '') &&
        !(e.groupIds || []).some(gid => groupIds.has(gid)) &&
        !teacherIds.has(e.teacherId) &&
        !subjectIds.has(e.subjectId) &&
        !classroomIds.has(e.classroomId) &&
        !timeSlotIds.has(e.timeSlotId)
    ));
    setStreams(prev => prev.map(s => ({ ...s, groupIds: s.groupIds.filter(gid => !groupIds.has(gid)) })));
    setElectives(prev => prev.filter(el => !groupIds.has(el.groupId) && !teacherIds.has(el.teacherId) && !subjectIds.has(el.subjectId)));
    setTeacherSubjectLinks(prev => prev.filter(l => !teacherIds.has(l.teacherId) && !subjectIds.has(l.subjectId)));
    // Cleanup head of department
    if (teacherIds.size > 0) {
        setDepartments(prev => prev.map(d => teacherIds.has(d.headTeacherId || '') ? { ...d, headTeacherId: undefined } : d));
    }
     // Cleanup dean
    if (teacherIds.size > 0) {
        setFaculties(prev => prev.map(f => teacherIds.has(f.deanId || '') ? { ...f, deanId: undefined } : f));
    }
    setDepartments(prev => prev.map(d => ({ ...d, specialtyIds: d.specialtyIds?.filter(sid => !specialtyIds.has(sid)) })));
    setEducationalPlans(prev => prev.map(p => ({ ...p, entries: p.entries.filter(e => !subjectIds.has(e.subjectId)) })));
    setSubgroups(prev => prev.map(sg => ({ ...sg, teacherAssignments: sg.teacherAssignments?.filter(a => !teacherIds.has(a.teacherId) && !subjectIds.has(a.subjectId)) })));
    
    // Cleanup pinned classrooms
    setTeachers(prev => prev.map(t => classroomIds.has(t.pinnedClassroomId || '') ? { ...t, pinnedClassroomId: '' } : t));
    setGroups(prev => prev.map(g => classroomIds.has(g.pinnedClassroomId || '') ? { ...g, pinnedClassroomId: '' } : g));
    setSubjects(prev => prev.map(s => classroomIds.has(s.pinnedClassroomId || '') ? { ...s, pinnedClassroomId: '' } : s));

    // Cleanup classroom tags
    if(classroomTagIds.size > 0) {
      setClassrooms(prev => prev.map(c => ({ ...c, tagIds: c.tagIds?.filter(tagId => !classroomTagIds.has(tagId)) })));
      setSubjects(prev => prev.map(s => ({ ...s, requiredClassroomTagIds: s.requiredClassroomTagIds?.filter(tagId => !classroomTagIds.has(tagId)) })));
    }
  };


  const placeUnscheduledItem = (item: UnscheduledEntry, day: string, timeSlotId: string, weekType: 'even' | 'odd' | 'every', date: string) => {
      if (settings.respectProductionCalendar) {
        const dayInfo = productionCalendar.find(e => e.date === date);
        if (dayInfo && !dayInfo.isWorkDay) {
          alert(`Нельзя разместить занятие на ${date}, так как это нерабочий день: "${dayInfo.name}".`);
          return;
        }
      }

      const subject = subjects.find(s => s.id === item.subjectId);
      if (!item.studentCount || !subject) {
        alert("Группа или дисциплина для занятия не найдена");
        return;
      }

      const requiredClassroomTypes = subject.classroomTypeRequirements?.[item.classType];
      if (!requiredClassroomTypes || requiredClassroomTypes.length === 0) {
          alert(`Для дисциплины "${subject.name}" (тип: ${item.classType}) не указаны подходящие типы аудиторий в справочнике.`);
          return;
      }

      const suitableClassroom = classrooms.find(c => {
        const targetWeekType = getWeekType(new Date(date + 'T00:00:00'), new Date(settings.semesterStart));
        const effectiveTargetWeekType = settings.useEvenOddWeekSeparation ? targetWeekType : 'every';
        
        const occupants = schedule.filter(e => {
            if (e.classroomId !== c.id || e.timeSlotId !== timeSlotId) return false;

            // Conflict with another dated entry
            if (e.date && e.date === date) return true;

            // Conflict with a template entry
            if (!e.date && e.day === day) {
                if (e.weekType === 'every' || e.weekType === effectiveTargetWeekType) {
                    return true;
                }
            }
            return false;
        });

        if (occupants.length >= (settings.allowOverbooking ? 2 : 1)) {
            return false;
        }
        if (c.capacity < item.studentCount) return false;
        
        // Check for required tags
        const requiredTags = subject.requiredClassroomTagIds || [];
        if (requiredTags.length > 0) {
            const classroomTags = c.tagIds || [];
            if (!requiredTags.every(tagId => classroomTags.includes(tagId))) {
                return false;
            }
        }
        
        return requiredClassroomTypes.includes(c.typeId);
      });

      if (!suitableClassroom) {
          alert(`Нет подходящей свободной аудитории для занятия "${subject.name}" с вместимостью ${item.studentCount}. Проверьте требования к типу и тегам аудитории.`);
          return;
      }
      const newEntry: ScheduleEntry = {
          id: `sched-${Date.now()}-${Math.random()}`,
          day, 
          timeSlotId, 
          weekType: 'every', // A dated entry is absolute
          date: date, // Set the specific date for the entry
          groupId: item.groupId,
          groupIds: item.groupIds,
          subgroupId: item.subgroupId,
          streamId: item.streamId,
          subjectId: item.subjectId,
          teacherId: item.teacherId,
          classroomId: suitableClassroom.id,
          classType: item.classType,
          deliveryMode: DeliveryMode.Offline,
          unscheduledUid: item.uid,
      };
      setSchedule(prev => [...prev, newEntry]);
  };

  const addScheduleEntry = (entry: Omit<ScheduleEntry, 'id'>) => {
    const newEntry = { ...entry, id: `manual-${Date.now()}` };
    setSchedule(prev => [...prev, newEntry]);
  };

  const updateScheduleEntry = (updatedEntry: ScheduleEntry) => {
      setSchedule(prev => prev.map(e => e.id === updatedEntry.id ? updatedEntry : e));
  };
  
  const deleteScheduleEntry = (entryToDelete: ScheduleEntry) => {
    if (!entryToDelete || typeof entryToDelete.id === 'undefined') return;
    setSchedule(prevSchedule => prevSchedule.filter(e => e.id !== entryToDelete.id));
  };
  
  const removeScheduleEntries = (entryIds: string[]) => {
      if (!entryIds || entryIds.length === 0) return;
      const idSet = new Set(entryIds);
      setSchedule(prev => prev.filter(e => !idSet.has(e.id)));
  };

  const updateSettings = (newSettings: SchedulingSettings) => {
      setSettings(newSettings);
  };

  const updateApiKey = async (newKey: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setApiKey(newKey);
      setApiKey(newKey);
      setIsGeminiAvailable(!!newKey);
    } catch (error) {
      console.error("Не удалось установить API-ключ Gemini:", error);
      alert("Ошибка при сохранении ключа Gemini.");
    }
  };

  const updateOpenRouterApiKey = async (newKey: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.setOpenRouterApiKey(newKey);
      setOpenRouterApiKey(newKey);
    } catch (error) {
      console.error("Не удалось установить API-ключ OpenRouter:", error);
      alert("Ошибка при сохранении ключа OpenRouter.");
    }
  };


  const propagateWeekSchedule = (weekTypeToCopy: 'even' | 'odd', currentViewDate: string) => {
    if (!settings.semesterStart || !settings.semesterEnd) {
      alert("Даты начала и конца семестра не установлены в настройках.");
      return;
    }
    const semesterStartDate = new Date(settings.semesterStart + 'T00:00:00');
    const semesterEndDate = new Date(settings.semesterEnd + 'T00:00:00');
    if (isNaN(semesterStartDate.getTime()) || isNaN(semesterEndDate.getTime())) {
      alert("Некорректный формат дат семестра в настройках.");
      return;
    }
    
    // 1. Identify source week entries based on currentViewDate.
    const sourceWeekDays = getWeekDays(new Date(currentViewDate));
    const sourceWeekStart = toYYYYMMDD(sourceWeekDays[0]);
    const sourceWeekEnd = toYYYYMMDD(sourceWeekDays[5]);

    const sourceEntries = schedule.filter(e => e.date && e.date >= sourceWeekStart && e.date <= sourceWeekEnd);
    
    if (sourceEntries.length === 0) {
        alert("На текущей неделе нет занятий для копирования.");
        return;
    }

    const sourceTemplate = sourceEntries.map(entry => {
        const entryDate = new Date(entry.date + 'T00:00:00');
        const dayIndex = entryDate.getDay() === 0 ? 6 : entryDate.getDay() - 1;
        return { ...entry, dayIndex };
    });

    // 2. Get a pool of available unscheduled entries.
    const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
    const scheduledUids = new Set(schedule.map(e => e.unscheduledUid).filter(Boolean));
    const availablePool = allPossibleEntries.filter(e => !scheduledUids.has(e.uid));

    // 3. Remove all existing DATED entries for the target weekType, EXCEPT for the source week itself.
    const scheduleWithoutOldEntries = schedule.filter(e => {
        if (!e.date) return true; // Keep non-dated template entries
        const entryDate = new Date(e.date + 'T00:00:00');
        if (entryDate >= new Date(sourceWeekStart + 'T00:00:00') && entryDate <= new Date(sourceWeekEnd + 'T23:59:59')) return true; // Keep source week
        if (entryDate < semesterStartDate || entryDate > semesterEndDate) return true; // Keep entries outside semester
        
        return getWeekType(entryDate, semesterStartDate) !== weekTypeToCopy;
    });
    
    // 4. Iterate and create new entries.
    const newDatedEntries: ScheduleEntry[] = [];
    let currentDate = new Date(semesterStartDate);

    while (currentDate <= semesterEndDate) {
        const currentWeekType = getWeekType(currentDate, semesterStartDate);
        const currentDateStr = toYYYYMMDD(currentDate);

        if (currentWeekType === weekTypeToCopy && (currentDateStr < sourceWeekStart || currentDateStr > sourceWeekEnd)) {
            const dayIndex = currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1;
            const templatesForThisDay = sourceTemplate.filter(t => t.dayIndex === dayIndex);

            for (const templateEntry of templatesForThisDay) {
                const matchingUnscheduledIndex = availablePool.findIndex(unsched =>
                    unsched.subjectId === templateEntry.subjectId &&
                    (unsched.groupId === templateEntry.groupId || (unsched.groupIds || []).join(',') === (templateEntry.groupIds || []).join(',')) &&
                    (unsched.subgroupId || null) === (templateEntry.subgroupId || null) &&
                    unsched.classType === templateEntry.classType &&
                    unsched.teacherId === templateEntry.teacherId
                );

                if (matchingUnscheduledIndex > -1) {
                    const consumedEntry = availablePool.splice(matchingUnscheduledIndex, 1)[0];
                    newDatedEntries.push({
                        ...templateEntry,
                        id: `prop-${consumedEntry.uid}-${toYYYYMMDD(currentDate)}`,
                        date: toYYYYMMDD(currentDate),
                        day: DAYS_OF_WEEK[dayIndex],
                        unscheduledUid: consumedEntry.uid,
                        weekType: 'every'
                    });
                } else {
                     console.warn(`Could not find an available unscheduled entry to propagate for template:`, templateEntry);
                }
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    setSchedule([...scheduleWithoutOldEntries, ...newDatedEntries]);
    alert(`${newDatedEntries.length} занятий было скопировано на все ${weekTypeToCopy === 'even' ? 'чётные' : 'нечётные'} недели семестра.`);
  };

  const saveCurrentScheduleAsTemplate = (name: string, description: string, currentViewDate: string) => {
    const sourceWeekDays = getWeekDays(new Date(currentViewDate));
    const sourceWeekStart = toYYYYMMDD(sourceWeekDays[0]);
    const sourceWeekEnd = toYYYYMMDD(sourceWeekDays[5]);

    const sourceEntries = schedule.filter(e => e.date && e.date >= sourceWeekStart && e.date <= sourceWeekEnd);
    
    if (sourceEntries.length === 0) {
        alert("На текущей неделе нет занятий для сохранения в шаблон.");
        return;
    }
    
    const templateEntries = sourceEntries.map(({ id, date, unscheduledUid, ...rest }) => rest);

    const newTemplate: Omit<ScheduleTemplate, 'id'> = {
        name,
        description,
        entries: JSON.parse(JSON.stringify(templateEntries))
    };
    addItem('scheduleTemplates', newTemplate);
    alert(`Шаблон "${name}" успешно сохранен!`);
  };

  const loadScheduleFromTemplate = (templateId: string, targetViewDate: string, method: 'replace' | 'merge') => {
    const template = scheduleTemplates.find(t => t.id === templateId);
    if (!template) {
        alert("Шаблон не найден!");
        return;
    }
    
    const targetWeekDays = getWeekDays(new Date(targetViewDate));
    const targetWeekStart = toYYYYMMDD(targetWeekDays[0]);
    const targetWeekEnd = toYYYYMMDD(targetWeekDays[5]);

    const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
    const currentlyScheduledUids = new Set(schedule.map(e => e.unscheduledUid).filter(Boolean));
    const availablePool = allPossibleEntries.filter(e => !currentlyScheduledUids.has(e.uid));

    let baseSchedule = [...schedule];
    if (method === 'replace') {
        baseSchedule = schedule.filter(e => !e.date || e.date < targetWeekStart || e.date > targetWeekEnd);
    }
    
    const newDatedEntries: ScheduleEntry[] = [];
    let placedCount = 0;

    for (const templateEntry of template.entries) {
        const dayIndex = DAYS_OF_WEEK.indexOf(templateEntry.day);
        if (dayIndex === -1) continue;

        const targetDate = targetWeekDays[dayIndex];
        const targetDateStr = toYYYYMMDD(targetDate);
        
        if (method === 'merge') {
            const isOccupied = baseSchedule.some(e => e.date === targetDateStr && e.timeSlotId === templateEntry.timeSlotId);
            if (isOccupied) continue;
        }

        const matchingUnscheduledIndex = availablePool.findIndex(unsched =>
            unsched.subjectId === templateEntry.subjectId &&
            (unsched.groupId === templateEntry.groupId || (unsched.groupIds || []).join(',') === (templateEntry.groupIds || []).join(',')) &&
            (unsched.subgroupId || null) === (templateEntry.subgroupId || null) &&
            unsched.classType === templateEntry.classType &&
            unsched.teacherId === templateEntry.teacherId
        );

        if (matchingUnscheduledIndex > -1) {
            const consumedEntry = availablePool.splice(matchingUnscheduledIndex, 1)[0];
            
            newDatedEntries.push({
                ...templateEntry,
                id: `tpl-${consumedEntry.uid}-${targetDateStr}`,
                date: targetDateStr,
                unscheduledUid: consumedEntry.uid,
                weekType: 'every'
            });
            placedCount++;
        } else {
            console.warn(`Could not find an available unscheduled entry for template item:`, templateEntry);
        }
    }

    setSchedule([...baseSchedule, ...newDatedEntries]);
    alert(`Шаблон "${template.name}" применен. Размещено ${placedCount} занятий.`);
  };
  
  const clearAllData = () => {
    setFaculties([]); setDepartments([]); setTeachers([]); setGroups([]); setStreams([]);
    setClassrooms([]); setSubjects([]); setCabinets([]); setTimeSlots([]); setTimeSlotsShortened([]); setSchedule([]);
    setUgs([]); setSpecialties([]); setEducationalPlans([]); setTeacherSubjectLinks([]);
    setSchedulingRules([]); setProductionCalendar([]); setSettings(getInitialEmptySettings());
    setScheduleTemplates([]); setClassroomTypes([]); setClassroomTags([]); setSubgroups([]); setElectives([]);
    setCurrentFilePath(null);
  };

  const startNewProject = () => {
    clearAllData();
  };

  // FIX: Corrected the return type annotation of `runScheduler` to match the `StoreState` interface. This fixes multiple errors.
  const runScheduler = async (method: 'heuristic' | 'gemini' | 'openrouter', config?: HeuristicConfig): Promise<{ scheduled: number; unscheduled: number; failedEntries: UnscheduledEntry[] }> => {
    setSchedulingProgress(null);
    const generationData = {
        teachers, groups, classrooms, subjects, streams, timeSlots, timeSlotsShortened, settings, 
        teacherSubjectLinks, schedulingRules, productionCalendar, ugs, specialties, educationalPlans, classroomTypes,
        subgroups, electives, schedule, classroomTags, faculties, departments
    };

    let result: SchedulerResult | null = null;
    let newSchedule: ScheduleEntry[] | null = null;

    if (method === 'heuristic') {
        if (!config) throw new Error("Конфигурация для эвристического планировщика не предоставлена.");
        
        if (config.iterations > 1) {
            const handleProgress = (progress: { current: number, total: number }) => {
                setSchedulingProgress(progress);
            };
            result = await runIterativeScheduler(generationData, config, handleProgress);
        } else {
            result = await generateScheduleWithHeuristics(generationData, config);
        }

        setSchedulingProgress(null);
        
        let finalSchedule = [...schedule];
        if(config.clearExisting && config.target) {
            finalSchedule = schedule.filter(entry => {
                if (!entry.date) return true;
                const entryDate = new Date(entry.date + 'T00:00:00');
                const startDate = new Date(config.timeFrame.start + 'T00:00:00');
                const endDate = new Date(config.timeFrame.end + 'T00:00:00');
                 if (entryDate >= startDate && entryDate <= endDate) {
                     if (config.target?.type === 'group') {
                        if(entry.groupId === config.target.id) return false;
                        if(entry.groupIds?.includes(config.target.id)) return false;
                     }
                     if (config.target?.type === 'teacher' && entry.teacherId === config.target.id) return false;
                     if (config.target?.type === 'classroom' && entry.classroomId === config.target.id) return false;
                 }
                 return true;
            });
        } else if (config.clearExisting && !config.target) {
             if (window.confirm(`Вы уверены, что хотите очистить ВСЕ расписание в диапазоне с ${config.timeFrame.start} по ${config.timeFrame.end} перед генерацией?`)) {
                finalSchedule = schedule.filter(entry => {
                    if (!entry.date) return true;
                    const entryDate = new Date(entry.date + 'T00:00:00');
                    const startDate = new Date(config.timeFrame.start + 'T00:00:00');
                    const endDate = new Date(config.timeFrame.end + 'T00:00:00');
                    return entryDate < startDate || entryDate > endDate;
                });
             } else {
                 return { scheduled: 0, unscheduled: 0, failedEntries: [] };
             }
        }
        
        setSchedule([...finalSchedule, ...result.schedule]);
        return { scheduled: result.schedule.length, unscheduled: result.unschedulable.length, failedEntries: result.unschedulable };
    
    } else if (method === 'gemini') {
        if (!isGeminiAvailable) {
            throw new Error("API Gemini недоступен. Убедитесь, что API-ключ настроен в настройках.");
        }
        newSchedule = await generateScheduleWithGemini(generationData);
    } else if (method === 'openrouter') {
         if (!openRouterApiKey) {
            throw new Error("API OpenRouter недоступен. Убедитесь, что API-ключ настроен в настройках.");
        }
        newSchedule = await generateScheduleWithOpenRouter(generationData, settings.openRouterModel);
    }

    // Common logic for AI schedulers
    if (newSchedule) {
        const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
        const tempUnscheduled = [...allPossibleEntries];
        newSchedule.forEach(schedEntry => {
            const matchIndex = tempUnscheduled.findIndex(unsched => 
                (unsched.groupId === schedEntry.groupId || (unsched.groupIds || []).join(',') === (schedEntry.groupIds || []).join(',')) &&
                (unsched.subgroupId || '') === (schedEntry.subgroupId || '') &&
                unsched.subjectId === schedEntry.subjectId &&
                unsched.classType === schedEntry.classType
            );
            if (matchIndex > -1) {
                schedEntry.unscheduledUid = tempUnscheduled[matchIndex].uid;
                tempUnscheduled.splice(matchIndex, 1);
            } else {
                 console.warn('AI-generated entry could not be matched to an educational plan entry:', schedEntry);
            }
        });
        const unschedulable = tempUnscheduled;

        if (!Array.isArray(newSchedule)) {
            throw new Error("Алгоритм вернул некорректный формат расписания.");
        }
        const validatedSchedule: ScheduleEntry[] = newSchedule.map((entry: any, index: number) => ({ ...entry, id: `gen-${Date.now()}-${index}` }));
        if (window.confirm(`Сгенерировано ${validatedSchedule.length} занятий. Заменить текущее расписание?`)) {
            setSchedule(validatedSchedule);
            return { scheduled: validatedSchedule.length, unscheduled: unschedulable.length, failedEntries: unschedulable };
        }
    }
    
    return { scheduled: 0, unscheduled: 0, failedEntries: [] };
  };

  const runSessionScheduler = async (config: SessionSchedulerConfig): Promise<{ scheduled: number; unscheduled: number; failedEntries: any[] }> => {
    const generationData = {
        teachers, groups, classrooms, subjects, streams, timeSlots, timeSlotsShortened, settings,
        teacherSubjectLinks, schedulingRules, productionCalendar, ugs, specialties, educationalPlans, classroomTypes,
        subgroups, schedule
    };

    const result = await generateSessionSchedule(generationData, config);

    let finalSchedule = [...schedule];
    if (config.clearExisting) {
        const sessionStart = new Date(config.timeFrame.start + 'T00:00:00').getTime();
        const sessionEnd = new Date(config.timeFrame.end + 'T23:59:59').getTime();
        finalSchedule = schedule.filter(entry => {
            if (!entry.date) return true;
            if (![ClassType.Exam, ClassType.Consultation].includes(entry.classType)) return true;
            
            const entryTime = new Date(entry.date).getTime();
            return entryTime < sessionStart || entryTime > sessionEnd;
        });
    }

    setSchedule([...finalSchedule, ...result.schedule]);
    return { 
        scheduled: result.schedule.length, 
        unscheduled: result.unschedulable.length, 
        failedEntries: result.unschedulable 
    };
  };

  const resetSchedule = () => {
    if (window.confirm("Вы уверены, что хотите сбросить состояние расписания? \n\nЭто действие вернет все размещенные занятия в список нераспределенных. Рекомендуется использовать, если вы столкнулись с некорректной логикой отображения после обновления приложения.")) {
        setSchedule([]);
    }
  };

  const clearSchedule = () => {
    if (window.confirm("Вы уверены, что хотите очистить все расписание? Все размещенные занятия будут возвращены в список нераспределенных.")) {
        setSchedule([]);
    }
  };

  // --- File Handlers ---
  const handleSave = async () => {
    if (!window.electronAPI) return;
    if (currentFilePath) {
      const stateString = JSON.stringify(getFullState());
      await window.electronAPI.saveFile(currentFilePath, stateString);
    } else {
      await handleSaveAs();
    }
  };

  const handleSaveAs = async () => {
    if (!window.electronAPI) return;
    const stateString = JSON.stringify(getFullState());
    const filePath = await window.electronAPI.saveAsFile(stateString);
    if (filePath) {
      setCurrentFilePath(filePath);
    }
  };
  
  const handleOpen = async () => {
    if (!window.electronAPI) return;
    if(window.confirm("Открыть новый проект? Все несохраненные изменения будут утеряны.")){
        const result = await window.electronAPI.openFile();
        if (result) {
            try {
                const parsedData = JSON.parse(result.data);
                loadFullState(parsedData);
                setCurrentFilePath(result.filePath);
            } catch(e) {
                alert("Ошибка: Не удалось прочитать файл. Возможно, он поврежден или имеет неверный формат.");
                console.error("File open parse error:", e);
            }
        }
    }
  };


  const value: StoreState = {
    faculties, departments, teachers, groups, streams, classrooms, subjects, cabinets, timeSlots, timeSlotsShortened, schedule, unscheduledEntries,
    teacherSubjectLinks, schedulingRules, productionCalendar, settings, ugs, specialties, educationalPlans, scheduleTemplates,
    classroomTypes, classroomTags, isGeminiAvailable, subgroups, electives, currentFilePath, lastAutosave, apiKey, openRouterApiKey, unscheduledTimeHorizon,
    schedulingProgress, viewDate,
    addItem, updateItem, deleteItem, setSchedule, placeUnscheduledItem, updateScheduleEntry, updateSettings, updateApiKey, updateOpenRouterApiKey,
    deleteScheduleEntry, addScheduleEntry, propagateWeekSchedule, saveCurrentScheduleAsTemplate, loadScheduleFromTemplate,
    runScheduler, runSessionScheduler, clearSchedule, resetSchedule, removeScheduleEntries, setUnscheduledTimeHorizon, setViewDate,
    startNewProject, handleOpen, handleSave, handleSaveAs,
    getFullState, loadFullState, clearAllData, mergeFullState
  };

  return React.createElement(StoreContext.Provider, { value: value }, children);
};