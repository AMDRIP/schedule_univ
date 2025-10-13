
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { 
    Faculty, Department, Teacher, Group, Stream, Classroom, Subject, Cabinet, TimeSlot, ScheduleEntry, 
    UnscheduledEntry, DataItem, DataType, ClassroomType, ClassType, TeacherSubjectLink, SchedulingRule, 
    ProductionCalendarEvent, SchedulingSettings, AvailabilityGrid, AvailabilityType, UGS, Specialty, 
    EducationalPlan, PlanEntry, AttestationType, ScheduleTemplate, FormOfStudy, DeliveryMode, Subgroup, Elective
} from '../types';
import { getWeekType, toYYYYMMDD } from '../utils/dateUtils';
import { DAYS_OF_WEEK } from '../constants';
import { generateScheduleWithHeuristics } from '../services/heuristicScheduler';
import { generateScheduleWithGemini } from '../services/geminiService';

// MOCK DATA (Initial State)
const initialFaculties: Faculty[] = [{ id: 'f1', name: 'Факультет информационных технологий' }];
const initialUGS: UGS[] = [{ id: 'ugs1', code: '09.00.00', name: 'Информатика и вычислительная техника'}];
const initialSpecialties: Specialty[] = [{ id: 'spec1', code: '09.03.04', name: 'Программная инженерия', ugsId: 'ugs1', oksoCode: '09.03.04' }];
const initialDepartments: Department[] = [{ id: 'd1', name: 'Кафедра программной инженерии', facultyId: 'f1', specialtyIds: ['spec1'] }];
const initialTeachers: Teacher[] = [
    { id: 't1', name: 'Иванов И.И.', departmentId: 'd1', academicDegree: 'д.т.н., профессор', hireDate: '2010-09-01', regalia: 'Заслуженный деятель науки РФ' }, 
    { id: 't2', name: 'Петров П.П.', departmentId: 'd1', academicDegree: 'к.п.н., доцент', hireDate: '2018-03-15' }
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
const initialClassrooms: Classroom[] = [
    { id: 'c1', number: '101', capacity: 60, typeId: 'ct1' },
    { id: 'c2', number: '202', capacity: 30, typeId: 'ct2' },
    { id: 'c3', number: '303-PC', capacity: 20, typeId: 'ct4' },
];
const initialSubjects: Subject[] = [
    { id: 'sub1', name: 'Основы программирования', suitableClassroomTypeIds: ['ct2', 'ct4'] },
    { id: 'sub2', name: 'Базы данных', suitableClassroomTypeIds: ['ct1', 'ct3', 'ct4'] },
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
    const currentSemester = 1; // This should ideally come from settings

    const groupToStreamMap = new Map<string, string>();
    streams.forEach(stream => {
        stream.groupIds.forEach(groupId => {
            groupToStreamMap.set(groupId, stream.id);
        });
    });

    groups.forEach(group => {
        const plan = educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        const groupSubgroups = subgroups.filter(sg => sg.parentGroupId === group.id);
        const relevantEntries = plan.entries.filter(e => e.semester === currentSemester);

        relevantEntries.forEach(planEntry => {
            const processEntry = (targetGroupId: string, targetSubgroupId: string | undefined, studentCount: number, streamId: string | undefined) => {
                const classTypes: { type: ClassType; hours: number }[] = [
                    { type: ClassType.Lecture, hours: planEntry.lectureHours },
                    { type: ClassType.Practical, hours: planEntry.practiceHours },
                    { type: ClassType.Lab, hours: planEntry.labHours },
                ];

                classTypes.forEach(({ type, hours }) => {
                    if (hours <= 0) return;

                    let teacherId: string | undefined;
                    const subgroup = targetSubgroupId ? subgroups.find(sg => sg.id === targetSubgroupId) : undefined;
                    
                    // 1. Check for a specific teacher assignment in the subgroup
                    const assignment = subgroup?.teacherAssignments?.find(a => a.subjectId === planEntry.subjectId && a.classType === type);

                    if (assignment) {
                        teacherId = assignment.teacherId;
                    } else {
                        // 2. Fallback to the general list of available teachers
                        const validTeacherIds = links
                            .filter(link => link.subjectId === planEntry.subjectId && link.classTypes.includes(type))
                            .map(link => link.teacherId);
                        
                        if (validTeacherIds.length > 0) {
                            teacherId = validTeacherIds[0]; // Take the first available
                        }
                    }
                    
                    if (teacherId) {
                        const numClasses = Math.ceil(hours / 2);

                        for (let i = 0; i < numClasses; i++) {
                             const uidSuffix = targetSubgroupId ? `${targetSubgroupId}-${type}-${i}` : `${targetGroupId}-${type}-${i}`;
                             entries.push({
                                uid: `unsched-${planEntry.subjectId}-${uidSuffix}`,
                                subjectId: planEntry.subjectId,
                                groupId: targetGroupId,
                                subgroupId: targetSubgroupId,
                                classType: type,
                                teacherId: teacherId,
                                streamId: streamId,
                                studentCount: studentCount,
                            });
                        }
                    }
                });
            };

            if (planEntry.splitForSubgroups && groupSubgroups.length > 0) {
                 groupSubgroups.forEach(subgroup => {
                    processEntry(group.id, subgroup.id, subgroup.studentCount, undefined);
                });
            } else {
                 processEntry(group.id, undefined, group.studentCount, groupToStreamMap.get(group.id));
            }
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
  timeSlots: TimeSlot[]; schedule: ScheduleEntry[]; unscheduledEntries: UnscheduledEntry[];
  teacherSubjectLinks: TeacherSubjectLink[]; schedulingRules: SchedulingRule[]; 
  productionCalendar: ProductionCalendarEvent[]; settings: SchedulingSettings;
  ugs: UGS[]; specialties: Specialty[]; educationalPlans: EducationalPlan[];
  scheduleTemplates: ScheduleTemplate[]; classroomTypes: ClassroomType[];
  subgroups: Subgroup[]; electives: Elective[];
  isGeminiAvailable: boolean;
  
  addItem: (dataType: DataType, item: Omit<DataItem, 'id'>) => void;
  updateItem: (dataType: DataType, item: DataItem) => void;
  deleteItem: (dataType: DataType, id: string) => void;
  setSchedule: (newSchedule: ScheduleEntry[]) => void;
  placeUnscheduledItem: (item: UnscheduledEntry, day: string, timeSlotId: string, weekType: 'even' | 'odd' | 'every') => void;
  updateScheduleEntry: (updatedEntry: ScheduleEntry) => void;
  deleteScheduleEntry: (entry: ScheduleEntry) => void;
  removeScheduleEntries: (entryIds: string[]) => void;
  addScheduleEntry: (entry: Omit<ScheduleEntry, 'id'>) => void;
  updateSettings: (newSettings: SchedulingSettings) => void;
  propagateWeekSchedule: (weekTypeToCopy: 'even' | 'odd') => void;
  saveCurrentScheduleAsTemplate: (name: string, description: string) => void;
  loadScheduleFromTemplate: (templateId: string) => void;
  runScheduler: (method: 'heuristic' | 'gemini') => Promise<{ scheduled: number; unscheduled: number; failedEntries: UnscheduledEntry[] }>;
  clearSchedule: () => void;
  getFullState: () => Omit<StoreState, 'getFullState' | 'loadFullState' | 'clearAllData' | 'addItem' | 'updateItem' | 'deleteItem' | 'setSchedule' | 'placeUnscheduledItem' | 'updateScheduleEntry' | 'deleteScheduleEntry' | 'addScheduleEntry' | 'updateSettings' | 'propagateWeekSchedule' | 'saveCurrentScheduleAsTemplate' | 'loadScheduleFromTemplate' | 'runScheduler' | 'clearSchedule' | 'removeScheduleEntries'>;
  loadFullState: (data: any) => void;
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
  const [subgroups, setSubgroups] = useState(initialSubgroups);
  const [electives, setElectives] = useState(initialElectives);
  const [isGeminiAvailable, setIsGeminiAvailable] = useState(false);

  useEffect(() => {
    const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
    const scheduledUids = new Set(schedule.map(e => e.unscheduledUid).filter(Boolean));
    const newUnscheduled = allPossibleEntries.filter(e => !scheduledUids.has(e.uid));
    setUnscheduledEntries(newUnscheduled);
  }, [groups, educationalPlans, teacherSubjectLinks, streams, schedule, subgroups, electives]);

  useEffect(() => {
    const checkApiKey = async () => {
        // Проверяем, запущено ли приложение в Electron
        if (window.electronAPI && typeof window.electronAPI.getApiKey === 'function') {
            try {
                const apiKey = await window.electronAPI.getApiKey();
                setIsGeminiAvailable(!!apiKey); // true, если ключ есть и непустой
            } catch (error) {
                console.error("Не удалось проверить API-ключ:", error);
                setIsGeminiAvailable(false);
            }
        } else {
            // Среда не-Electron (обычный браузер)
            setIsGeminiAvailable(false);
            console.log("Приложение запущено не в среде Electron. Функции ИИ будут отключены.");
        }
    };

    checkApiKey();
  }, []); // Запускается один раз при монтировании
  
  const stateSetters: Record<DataType, React.Dispatch<React.SetStateAction<any[]>>> = {
    faculties: setFaculties, departments: setDepartments, teachers: setTeachers, groups: setGroups,
    streams: setStreams, classrooms: setClassrooms, subjects: setSubjects, cabinets: setCabinets,
    timeSlots: setTimeSlots, teacherSubjectLinks: setTeacherSubjectLinks, schedulingRules: setSchedulingRules,
    productionCalendar: setProductionCalendar, ugs: setUgs, specialties: setSpecialties, 
    educationalPlans: setEducationalPlans, scheduleTemplates: setScheduleTemplates, classroomTypes: setClassroomTypes,
    subgroups: setSubgroups, electives: setElectives,
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
    // The main recursive function for deletion
    const performCascadingDelete = (type: DataType, itemId: string) => {
      // Cascade logic: delete dependencies BEFORE deleting the item itself.
      switch (type) {
        case 'faculties':
          departments.filter(d => d.facultyId === itemId).forEach(d => performCascadingDelete('departments', d.id));
          break;
        case 'departments':
          teachers.filter(t => t.departmentId === itemId).forEach(t => performCascadingDelete('teachers', t.id));
          groups.filter(g => g.departmentId === itemId).forEach(g => performCascadingDelete('groups', g.id));
          cabinets.filter(c => c.departmentId === itemId).forEach(c => performCascadingDelete('cabinets', c.id));
          break;
        case 'ugs':
          specialties.filter(s => s.ugsId === itemId).forEach(s => performCascadingDelete('specialties', s.id));
          break;
        case 'specialties':
          groups.filter(g => g.specialtyId === itemId).forEach(g => performCascadingDelete('groups', g.id));
          educationalPlans.filter(p => p.specialtyId === itemId).forEach(p => performCascadingDelete('educationalPlans', p.id));
          // Also remove this specialty from any department that lists it.
          setDepartments(prev => prev.map(d => ({
            ...d,
            specialtyIds: d.specialtyIds?.filter(sid => sid !== itemId)
          })));
          break;
        case 'groups':
          // Remove from main schedule
          setSchedule(prev => prev.filter(e => e.groupId !== itemId));
          // Remove from any streams
          setStreams(prev => prev.map(s => ({
            ...s,
            groupIds: s.groupIds.filter(gid => gid !== itemId)
          })));
           // Remove subgroups of this group
          setSubgroups(prev => prev.filter(sg => sg.parentGroupId !== itemId));
          // Remove electives of this group
          setElectives(prev => prev.filter(el => el.groupId !== itemId));
          break;
        case 'teachers':
          // Remove from main schedule
          setSchedule(prev => prev.filter(e => e.teacherId !== itemId));
          // Remove from links
          setTeacherSubjectLinks(prev => prev.filter(l => l.teacherId !== itemId));
          // Remove electives associated with this teacher
          setElectives(prev => prev.filter(el => el.teacherId !== itemId));
          // Remove teacher assignments from subgroups
          setSubgroups(prev => prev.map(sg => ({
              ...sg,
              teacherAssignments: sg.teacherAssignments?.filter(a => a.teacherId !== itemId)
          })));
          break;
        case 'subjects':
          // Remove from main schedule
          setSchedule(prev => prev.filter(e => e.subjectId !== itemId));
          // Remove from links
          setTeacherSubjectLinks(prev => prev.filter(l => l.subjectId !== itemId));
          // Remove from educational plans
          setEducationalPlans(prev => prev.map(p => ({
            ...p,
            entries: p.entries.filter(e => e.subjectId !== itemId)
          })));
          // Remove electives associated with this subject
          setElectives(prev => prev.filter(el => el.subjectId !== itemId));
          // Remove teacher assignments from subgroups
          setSubgroups(prev => prev.map(sg => ({
              ...sg,
              teacherAssignments: sg.teacherAssignments?.filter(a => a.subjectId !== itemId)
          })));
          break;
        case 'classroomTypes':
            if (classrooms.some(c => c.typeId === itemId)) {
                alert('Этот тип аудитории используется. Сначала измените тип у всех аудиторий, использующих его.');
                return; // Prevent deletion
            }
            break;
        case 'classrooms':
          // Remove from main schedule
          setSchedule(prev => prev.filter(e => e.classroomId !== itemId));
          // Un-pin classroom from any entity that might reference it
          setTeachers(prev => prev.map(t => t.pinnedClassroomId === itemId ? { ...t, pinnedClassroomId: '' } : t));
          setGroups(prev => prev.map(g => g.pinnedClassroomId === itemId ? { ...g, pinnedClassroomId: '' } : g));
          setSubjects(prev => prev.map(s => s.pinnedClassroomId === itemId ? { ...s, pinnedClassroomId: '' } : s));
          break;
        case 'timeSlots':
          // Remove from main schedule
          setSchedule(prev => prev.filter(e => e.timeSlotId !== itemId));
          // Remove from rules
          setSchedulingRules(prev => prev.filter(r => r.timeSlotId !== itemId));
          break;
        default:
          // No cascade for: streams, cabinets, teacherSubjectLinks, schedulingRules, 
          // productionCalendar, educationalPlans, scheduleTemplates, subgroups, electives
          break;
      }

      // After handling dependencies, delete the item itself.
      if (stateSetters[type]) {
        stateSetters[type](prev => prev.filter(i => i.id !== itemId));
      }
    };
    
    performCascadingDelete(dataType, id);
  };

  const placeUnscheduledItem = (item: UnscheduledEntry, day: string, timeSlotId: string, weekType: 'even' | 'odd' | 'every') => {
      const studentCount = item.subgroupId ? subgroups.find(sg => sg.id === item.subgroupId)?.studentCount : groups.find(g => g.id === item.groupId)?.studentCount;
      const subject = subjects.find(s => s.id === item.subjectId);

      if (!studentCount || !subject) {
        alert("Группа или дисциплина для занятия не найдена");
        return;
      }
      
      if (!subject.suitableClassroomTypeIds || subject.suitableClassroomTypeIds.length === 0) {
          alert(`Для дисциплины "${subject.name}" не указаны подходящие типы аудиторий в справочнике.`);
          return;
      }

      const suitableClassroom = classrooms.find(c => {
        const isOccupied = schedule.some(e => 
            e.classroomId === c.id &&
            e.day === day &&
            e.timeSlotId === timeSlotId &&
            (e.weekType === weekType || e.weekType === 'every' || weekType === 'every')
        );
        if (isOccupied) return false;
        if (c.capacity < studentCount) return false;
        
        return subject.suitableClassroomTypeIds?.includes(c.typeId);
      });

      if (!suitableClassroom) {
          alert(`Нет подходящей свободной аудитории для занятия "${subject.name}" с вместимостью ${studentCount}.`);
          return;
      }
      
      const newEntry: ScheduleEntry = {
          id: `sched-${Date.now()}-${Math.random()}`,
          day, timeSlotId, weekType,
          groupId: item.groupId,
          subgroupId: item.subgroupId,
          subjectId: item.subjectId,
          teacherId: item.teacherId,
          classroomId: suitableClassroom.id,
          classType: item.classType,
          deliveryMode: DeliveryMode.Offline,
          unscheduledUid: item.uid,
      };
      setSchedule(prev => [...prev, newEntry]);
      // No need to manually remove from unscheduledEntries, useEffect will handle it
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
    // No need to manually add to unscheduledEntries, useEffect will handle it
  };
  
  const removeScheduleEntries = (entryIds: string[]) => {
      if (!entryIds || entryIds.length === 0) return;
      const idSet = new Set(entryIds);
      setSchedule(prev => prev.filter(e => !idSet.has(e.id)));
  };

  const updateSettings = (newSettings: SchedulingSettings) => {
      setSettings(newSettings);
  };

  const propagateWeekSchedule = (weekTypeToCopy: 'even' | 'odd') => {
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

    const templateEntries = schedule.filter(e => 
        !e.date && (e.weekType === weekTypeToCopy || e.weekType === 'every')
    );

    const newDatedEntries: ScheduleEntry[] = [];
    let currentDate = new Date(semesterStartDate);

    while (currentDate <= semesterEndDate) {
        const currentWeekType = getWeekType(currentDate, semesterStartDate);
        
        if (currentWeekType === weekTypeToCopy) {
            const dayOfWeek = DAYS_OF_WEEK[currentDate.getDay() === 0 ? 6 : currentDate.getDay() - 1];
            const entriesForThisDay = templateEntries.filter(e => e.day === dayOfWeek);

            for (const templateEntry of entriesForThisDay) {
                newDatedEntries.push({
                    ...templateEntry,
                    id: `prop-${templateEntry.id}-${toYYYYMMDD(currentDate)}-${Math.random()}`,
                    date: toYYYYMMDD(currentDate),
                });
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const scheduleWithoutOldEntries = schedule.filter(e => {
        if (!e.date) return true;
        const entryDate = new Date(e.date + 'T00:00:00');
        if (entryDate < semesterStartDate || entryDate > semesterEndDate) return true;
        return getWeekType(entryDate, semesterStartDate) !== weekTypeToCopy;
    });

    setSchedule([...scheduleWithoutOldEntries, ...newDatedEntries]);
    alert(`${newDatedEntries.length} занятий было скопировано на все ${weekTypeToCopy === 'even' ? 'чётные' : 'нечётные'} недели семестра.`);
  };

  const saveCurrentScheduleAsTemplate = (name: string, description: string) => {
    const newTemplate: Omit<ScheduleTemplate, 'id'> = {
        name,
        description,
        entries: JSON.parse(JSON.stringify(schedule)) // Deep copy
    };
    addItem('scheduleTemplates', newTemplate);
  };

  const loadScheduleFromTemplate = (templateId: string) => {
    const template = scheduleTemplates.find(t => t.id === templateId);
    if (template) {
        setSchedule(JSON.parse(JSON.stringify(template.entries))); // Deep copy
    } else {
        alert("Шаблон не найден!");
    }
  };
  
  const getFullState = () => ({
    faculties, departments, teachers, groups, streams, classrooms, subjects, cabinets, timeSlots, schedule, unscheduledEntries,
    teacherSubjectLinks, schedulingRules, productionCalendar, settings, ugs, specialties, educationalPlans, scheduleTemplates,
    classroomTypes, isGeminiAvailable, subgroups, electives,
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
    setSchedule(data.schedule || []);
    setTeacherSubjectLinks(data.teacherSubjectLinks || []);
    setSchedulingRules(data.schedulingRules || []);
    setProductionCalendar(data.productionCalendar || []);
    setSettings(data.settings || getInitialEmptySettings());
    setUgs(data.ugs || []);
    setSpecialties(data.specialties || []);
    setEducationalPlans(data.educationalPlans || []);
    setScheduleTemplates(data.scheduleTemplates || []);
    setClassroomTypes(data.classroomTypes || initialClassroomTypes);
    setSubgroups(data.subgroups || []);
    setElectives(data.electives || []);
  };
  
  const clearAllData = () => {
    setFaculties([]);
    setDepartments([]);
    setTeachers([]);
    setGroups([]);
    setStreams([]);
    setClassrooms([]);
    setSubjects([]);
    setCabinets([]);
    setTimeSlots([]);
    setSchedule([]);
    setUgs([]);
    setSpecialties([]);
    setEducationalPlans([]);
    setTeacherSubjectLinks([]);
    setSchedulingRules([]);
    setProductionCalendar([]);
    setSettings(getInitialEmptySettings());
    setScheduleTemplates([]);
    setClassroomTypes([]);
    setSubgroups([]);
    setElectives([]);
  };

  const runScheduler = async (method: 'heuristic' | 'gemini') => {
    const generationData = {
        teachers, groups, classrooms, subjects, streams, timeSlots, settings, 
        teacherSubjectLinks, schedulingRules, productionCalendar, ugs, specialties, educationalPlans, classroomTypes,
        subgroups, electives,
    };
    
    let newSchedule: ScheduleEntry[] = [];
    let unschedulable: UnscheduledEntry[] = [];

    if (method === 'heuristic') {
        const result = await generateScheduleWithHeuristics(generationData);
        newSchedule = result.schedule;
        unschedulable = result.unschedulable;
    } else {
        if (!isGeminiAvailable) {
            throw new Error("API Gemini недоступен. Убедитесь, что приложение запущено через Electron и API-ключ настроен.");
        }
        newSchedule = await generateScheduleWithGemini(generationData);
        
        // Post-process to link Gemini results with unscheduled entries to correctly update the UI
        const allPossibleEntries = generateUnscheduledEntries(groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives);
        const tempUnscheduled = [...allPossibleEntries];
        
        newSchedule.forEach(schedEntry => {
            const matchIndex = tempUnscheduled.findIndex(unsched => 
                unsched.groupId === schedEntry.groupId &&
                unsched.subgroupId === schedEntry.subgroupId &&
                unsched.subjectId === schedEntry.subjectId &&
                unsched.classType === schedEntry.classType &&
                unsched.teacherId === schedEntry.teacherId
            );
            if (matchIndex > -1) {
                schedEntry.unscheduledUid = tempUnscheduled[matchIndex].uid;
                tempUnscheduled.splice(matchIndex, 1);
            }
        });
        // What remains in tempUnscheduled is what Gemini failed to schedule.
        unschedulable = tempUnscheduled;
    }
      
    if (!Array.isArray(newSchedule)) {
        throw new Error("Алгоритм вернул некорректный формат расписания.");
    }

    const validatedSchedule: ScheduleEntry[] = newSchedule.map((entry: any, index: number) => ({
        ...entry,
        id: `gen-${Date.now()}-${index}`
    }));
      
    if (window.confirm(`Сгенерировано ${validatedSchedule.length} занятий. Заменить текущее расписание?`)) {
        setSchedule(validatedSchedule);
        return { scheduled: validatedSchedule.length, unscheduled: unschedulable.length, failedEntries: unschedulable };
    }
    return { scheduled: 0, unscheduled: 0, failedEntries: [] };
  };

  const clearSchedule = () => {
    if (window.confirm("Вы уверены, что хотите очистить все расписание? Все размещенные занятия будут возвращены в список нераспределенных.")) {
        setSchedule([]);
    }
  };

  const value = {
    faculties, departments, teachers, groups, streams, classrooms, subjects, cabinets, timeSlots, schedule, unscheduledEntries,
    teacherSubjectLinks, schedulingRules, productionCalendar, settings, ugs, specialties, educationalPlans, scheduleTemplates,
    classroomTypes, isGeminiAvailable, subgroups, electives,
    addItem, updateItem, deleteItem, setSchedule, placeUnscheduledItem, updateScheduleEntry, updateSettings,
    deleteScheduleEntry, addScheduleEntry, propagateWeekSchedule, saveCurrentScheduleAsTemplate, loadScheduleFromTemplate,
    runScheduler, clearSchedule, removeScheduleEntries,
    getFullState, loadFullState, clearAllData,
  };

  return React.createElement(StoreContext.Provider, { value: value }, children);
};
