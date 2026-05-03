import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClassType, Classroom, Department, EducationalPlan, FormOfStudy, Group, ScheduleEntry, Specialty, Subject, Teacher } from '../types';
import { isSemesterInCourse } from '../utils/semesterUtils';

type ResourceStat = {
  id: string;
  name: string;
  owner?: string;
  total: number;
  days: number;
  gaps: number;
  conflicts: number;
  peakDay: string;
  peakLoad: number;
  utilization: number;
};

type Insight = {
  title: string;
  text: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
};

type WhatIfNeed = {
  groupId: string;
  subjectId: string;
  subjectName: string;
  classType: ClassType;
  weeklyPairs: number;
  source: string;
};

type ScenarioTeacherRow = {
  teacher: Teacher;
  currentWeeklyLoad: number;
  addedWeeklyLoad: number;
  capacity: number;
};

type WhatIfTeacherProjection = {
  id: string;
  name: string;
  currentWeeklyLoad: number;
  addedWeeklyLoad: number;
  projectedWeeklyLoad: number;
  usage: number;
  capacity: number;
};

type MissingTeacherLinkItem = {
  specialtyName: string;
  subjectName: string;
  classType: ClassType;
  semester: number;
  hours: number;
};

type PlanCoverageIssue = {
  groupName: string;
  subjectName: string;
  classType: ClassType;
  expected: number;
  actual: number;
};

type LoadLimitIssue = {
  resourceType: 'teacher' | 'group';
  name: string;
  weeklyHours: number;
  semesterHours: number;
};

type WhatIfScenario = {
  specialtyId: string;
  formOfStudy: FormOfStudy | '';
  course: number;
  groupIds: string[];
  plannedGroups: Array<{
    id: string;
    number: string;
    specialtyId: string;
    formOfStudy: FormOfStudy;
    course: number;
    studentCount: number;
  }>;
  extraGroups: number;
  lessonsPerGroupPerWeek: number;
  studentsPerGroup: number;
  extraTeachers: number;
  teacherCapacityPerWeek: number;
  removedTeacherId: string;
  closedClassroomId: string;
  extraClassrooms: number;
  classroomSlotsPerWeek: number;
  newClassroomCapacity: number;
};

const getEntryGroupIds = (entry: Pick<ScheduleEntry, 'groupId' | 'groupIds'>) =>
  entry.groupIds || (entry.groupId ? [entry.groupId] : []);

const percent = (value: number) => `${Math.round(value)}%`;

const top = <T,>(items: T[], limit = 8) => items.slice(0, limit);

const getSlotIndex = (slotIds: string[], timeSlotId: string) => {
  const index = slotIds.indexOf(timeSlotId);
  return index >= 0 ? index : slotIds.length;
};

const countGaps = (indices: number[], minGapSlots = 1) => {
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  if (sorted.length <= 1) return 0;
  let gaps = 0;
  for (let index = 1; index < sorted.length; index++) {
    const gapSize = sorted[index] - sorted[index - 1] - 1;
    if (gapSize >= minGapSlots) gaps += gapSize;
  }
  return gaps;
};

const getWeekKey = (dateStr: string) => {
  const date = new Date(`${dateStr}T00:00:00`);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date.getTime() - yearStart.getTime()) / 86400000);
  return `${date.getFullYear()}-${Math.ceil((dayOffset + yearStart.getDay() + 1) / 7)}`;
};

const severityClass = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const AnalyticsView: React.FC = () => {
  const {
    departments,
    teachers,
    groups,
    streams,
    classrooms,
    subjects,
    specialties,
    schedule,
    timeSlots,
    timeSlotsShortened,
    teacherSubjectLinks,
    educationalPlans,
    settings,
  } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'teachers' | 'groups' | 'classrooms' | 'whatif' | 'advice'>('overview');
  const [whatIf, setWhatIf] = useState<WhatIfScenario>({
    specialtyId: '',
    formOfStudy: '',
    course: 1,
    groupIds: [],
    plannedGroups: [],
    extraGroups: settings.whatIfDefaults.extraGroups,
    lessonsPerGroupPerWeek: settings.whatIfDefaults.lessonsPerGroupPerWeek,
    studentsPerGroup: settings.whatIfDefaults.studentsPerGroup,
    extraTeachers: settings.whatIfDefaults.extraTeachers,
    teacherCapacityPerWeek: settings.whatIfDefaults.teacherCapacityPerWeek,
    removedTeacherId: '',
    closedClassroomId: '',
    extraClassrooms: settings.whatIfDefaults.extraClassrooms,
    classroomSlotsPerWeek: settings.whatIfDefaults.classroomSlotsPerWeek,
    newClassroomCapacity: settings.whatIfDefaults.newClassroomCapacity,
  });
  const [whatIfGroupDraft, setWhatIfGroupDraft] = useState({
    number: '',
    specialtyId: '',
    formOfStudy: FormOfStudy.FullTime,
    course: 1,
    studentCount: settings.whatIfDefaults.studentsPerGroup,
  });

  const analytics = useMemo(() => {
    const scheduled = schedule.filter(entry => entry.date);
    const dates = Array.from(new Set(scheduled.map(entry => entry.date!))).sort();
    const slotIds = Array.from(new Set([...timeSlots, ...timeSlotsShortened].map(slot => slot.id)));
    const capacityBase = Math.max(1, dates.length * Math.max(1, slotIds.length));
    const weekCount = Math.max(1, Math.ceil(dates.length / 6));
    const teacherCapacityBase = Math.max(1, weekCount * settings.analyticsThresholds.targetWeeklyTeacherLoad);

    const teacherById = new Map<string, Teacher>(teachers.map(item => [item.id, item]));
    const groupById = new Map<string, Group>(groups.map(item => [item.id, item]));
    const classroomById = new Map<string, Classroom>(classrooms.map(item => [item.id, item]));
    const subjectById = new Map<string, Subject>(subjects.map(item => [item.id, item]));
    const departmentById = new Map<string, Department>(departments.map(item => [item.id, item]));

    const resourceEntries = <T extends { id: string; name: string }>(
      resources: T[],
      getEntries: (resource: T) => ScheduleEntry[],
      getOwner?: (resource: T) => string | undefined,
      denominator = capacityBase
    ): ResourceStat[] => resources.map(resource => {
      const entries = getEntries(resource);
      const byDay = new Map<string, ScheduleEntry[]>();
      entries.forEach(entry => {
        const dayEntries = byDay.get(entry.date!) || [];
        dayEntries.push(entry);
        byDay.set(entry.date!, dayEntries);
      });

      let gaps = 0;
      let peakDay = 'нет занятий';
      let peakLoad = 0;
      byDay.forEach((dayEntries, date) => {
        const load = dayEntries.length;
        if (load > peakLoad) {
          peakLoad = load;
          peakDay = date;
        }
        gaps += countGaps(dayEntries.map(entry => getSlotIndex(slotIds, entry.timeSlotId)), settings.analyticsThresholds.windowMinGapSlots);
      });

      const collisionSlots = new Map<string, number>();
      entries.forEach(entry => {
        const key = `${entry.date}-${entry.timeSlotId}`;
        collisionSlots.set(key, (collisionSlots.get(key) || 0) + 1);
      });

      return {
        id: resource.id,
        name: resource.name,
        owner: getOwner?.(resource),
        total: entries.length,
        days: byDay.size,
        gaps,
        conflicts: Array.from(collisionSlots.values()).filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0),
        peakDay,
        peakLoad,
        utilization: entries.length / denominator * 100,
      };
    });

    const teacherStats = resourceEntries<Teacher>(
      teachers,
      teacher => scheduled.filter(entry => entry.teacherId === teacher.id),
      teacher => departmentById.get(teacher.departmentId)?.name,
      teacherCapacityBase
    ).sort((a, b) => b.total - a.total);

    const groupResources: Array<Group & { name: string }> = groups.map(group => ({ ...group, name: group.number }));
    const groupStats = resourceEntries<Group & { name: string }>(
      groupResources,
      group => scheduled.filter(entry => getEntryGroupIds(entry).includes(group.id)),
      group => departmentById.get(group.departmentId)?.name
    ).sort((a, b) => b.total - a.total);

    const classroomResources: Array<Classroom & { name: string }> = classrooms.map(room => ({ ...room, name: `Ауд. ${room.number}` }));
    const classroomStats = resourceEntries<Classroom & { name: string }>(
      classroomResources,
      room => scheduled.filter(entry => entry.classroomId === room.id),
      room => room.status === 'repair' ? 'ремонт' : room.status === 'closed' ? 'закрыта' : undefined
    ).sort((a, b) => b.total - a.total);

    const departmentStats = departments.map(department => {
      const departmentTeachers = teachers.filter(teacher => teacher.departmentId === department.id);
      const departmentGroups = groups.filter(group => group.departmentId === department.id);
      const entries = scheduled.filter(entry =>
        departmentTeachers.some(teacher => teacher.id === entry.teacherId) ||
        getEntryGroupIds(entry).some(groupId => departmentGroups.some(group => group.id === groupId))
      );
      const teacherLoad = departmentTeachers.map(teacher => scheduled.filter(entry => entry.teacherId === teacher.id).length);
      const maxLoad = Math.max(0, ...teacherLoad);
      const minLoad = Math.min(...teacherLoad, maxLoad);
      return {
        id: department.id,
        name: department.name,
        total: entries.length,
        teachers: departmentTeachers.length,
        groups: departmentGroups.length,
        averageTeacherLoad: departmentTeachers.length ? entries.length / departmentTeachers.length : 0,
        imbalance: maxLoad - minLoad,
      };
    }).sort((a, b) => b.total - a.total);

    const collisionMap = new Map<string, ScheduleEntry[]>();
    scheduled.forEach(entry => {
      const resources = [
        `teacher:${entry.teacherId}`,
        `classroom:${entry.classroomId}`,
        ...getEntryGroupIds(entry).map(groupId => `group:${groupId}`),
      ];
      resources.forEach(resource => {
        const key = `${resource}:${entry.date}:${entry.timeSlotId}`;
        const entries = collisionMap.get(key) || [];
        entries.push(entry);
        collisionMap.set(key, entries);
      });
    });
    const collisions = Array.from(collisionMap.entries()).filter(([, entries]) => entries.length > 1);

    const capacityIssues = scheduled.filter(entry => {
      const classroom = classroomById.get(entry.classroomId);
      if (!classroom) return true;
      const students = getEntryGroupIds(entry).reduce((sum, groupId) => sum + (groupById.get(groupId)?.studentCount || 0), 0);
      return students > classroom.capacity;
    });

    const lectureOrderIssues = scheduled.filter(entry => {
      if (entry.classType !== ClassType.Practical && entry.classType !== ClassType.Lab) return false;
      const entryGroups = getEntryGroupIds(entry);
      const practiceKey = `${entry.date}-${String(getSlotIndex(slotIds, entry.timeSlotId)).padStart(3, '0')}`;
      return !scheduled.some(candidate =>
        candidate.subjectId === entry.subjectId &&
        candidate.classType === ClassType.Lecture &&
        getEntryGroupIds(candidate).some(groupId => entryGroups.includes(groupId)) &&
        `${candidate.date}-${String(getSlotIndex(slotIds, candidate.timeSlotId)).padStart(3, '0')}` <= practiceKey
      );
    });

    const weekPatterns = new Map<string, Map<string, number>>();
    scheduled.forEach(entry => {
      const date = new Date(`${entry.date}T00:00:00`);
      const parity = Math.ceil((date.getTime() - new Date(`${dates[0] || entry.date}T00:00:00`).getTime()) / 604800000) % 2 === 0 ? 'even' : 'odd';
      const key = `${entry.subjectId}:${entry.classType}:${getEntryGroupIds(entry).slice().sort().join(',')}:${parity}`;
      const pattern = `${entry.day}:${entry.timeSlotId}`;
      const counts = weekPatterns.get(key) || new Map<string, number>();
      counts.set(pattern, (counts.get(pattern) || 0) + 1);
      weekPatterns.set(key, counts);
    });
    const driftingSeries = Array.from(weekPatterns.values()).filter(patterns => patterns.size > 1).length;

    const specialtyById = new Map<string, Specialty>(specialties.map(item => [item.id, item]));
    const missingTeacherLinks: MissingTeacherLinkItem[] = [];
    const expectedPlanPairs = new Map<string, { groupId: string; subjectId: string; classType: ClassType; expected: number }>();
    const actualSchedulePairs = new Map<string, number>();
    const makeCoverageKey = (groupId: string, subjectId: string, classType: ClassType) => `${groupId}::${subjectId}::${classType}`;
    const addExpectedPairs = (groupId: string, subjectId: string, classType: ClassType, expected: number) => {
      const key = makeCoverageKey(groupId, subjectId, classType);
      const current = expectedPlanPairs.get(key);
      expectedPlanPairs.set(key, { groupId, subjectId, classType, expected: (current?.expected || 0) + expected });
    };

    educationalPlans.forEach(plan => {
      const specialtyName = specialtyById.get(plan.specialtyId)?.name || plan.specialtyId;
      const planGroups = groups.filter(group => group.specialtyId === plan.specialtyId && (!plan.formOfStudy || group.formOfStudy === plan.formOfStudy));
      plan.entries.forEach(entry => {
        const classHours: Array<[ClassType, number]> = [
          [ClassType.Lecture, entry.lectureHours],
          [ClassType.Practical, entry.practiceHours],
          [ClassType.Lab, entry.labHours],
        ];
        classHours.forEach(([classType, hours]) => {
          if (hours <= 0) return;
          if (!teacherSubjectLinks.some(link => link.subjectId === entry.subjectId && link.classTypes.includes(classType))) {
            missingTeacherLinks.push({
              specialtyName,
              subjectName: subjectById.get(entry.subjectId)?.name || entry.subjectId,
              classType,
              semester: entry.semester,
              hours,
            });
          }
          planGroups.forEach(group => addExpectedPairs(group.id, entry.subjectId, classType, Math.ceil(hours / 2)));
        });
      });
    });

    scheduled.forEach(entry => {
      getEntryGroupIds(entry).forEach(groupId => {
        const key = makeCoverageKey(groupId, entry.subjectId, entry.classType);
        actualSchedulePairs.set(key, (actualSchedulePairs.get(key) || 0) + 1);
      });
    });

    const planCoverageIssues: PlanCoverageIssue[] = [];
    expectedPlanPairs.forEach(expectedItem => {
      const actual = actualSchedulePairs.get(makeCoverageKey(expectedItem.groupId, expectedItem.subjectId, expectedItem.classType)) || 0;
      if (actual !== expectedItem.expected) {
        planCoverageIssues.push({
          groupName: groupById.get(expectedItem.groupId)?.number || expectedItem.groupId,
          subjectName: subjectById.get(expectedItem.subjectId)?.name || expectedItem.subjectId,
          classType: expectedItem.classType,
          expected: expectedItem.expected,
          actual,
        });
      }
    });
    actualSchedulePairs.forEach((actual, key) => {
      if (expectedPlanPairs.has(key)) return;
      const [groupId, subjectId, classType] = key.split('::') as [string, string, ClassType];
      planCoverageIssues.push({
        groupName: groupById.get(groupId)?.number || groupId,
        subjectName: subjectById.get(subjectId)?.name || subjectId,
        classType,
        expected: 0,
        actual,
      });
    });

    const teacherWeeklyPairs = new Map<string, Map<string, number>>();
    const groupWeeklyPairs = new Map<string, Map<string, number>>();
    const addWeeklyPair = (target: Map<string, Map<string, number>>, resourceId: string, weekKey: string) => {
      const resourceWeeks = target.get(resourceId) || new Map<string, number>();
      resourceWeeks.set(weekKey, (resourceWeeks.get(weekKey) || 0) + 1);
      target.set(resourceId, resourceWeeks);
    };
    scheduled.forEach(entry => {
      const weekKey = getWeekKey(entry.date!);
      addWeeklyPair(teacherWeeklyPairs, entry.teacherId, weekKey);
      getEntryGroupIds(entry).forEach(groupId => addWeeklyPair(groupWeeklyPairs, groupId, weekKey));
    });
    const buildLoadLimitIssues = (
      items: Array<{ id: string; name: string }>,
      weeklyPairs: Map<string, Map<string, number>>,
      resourceType: LoadLimitIssue['resourceType']
    ): LoadLimitIssue[] => items
      .map(item => {
        const weeks = weeklyPairs.get(item.id) || new Map<string, number>();
        const totalPairs = Array.from(weeks.values()).reduce((sum, count) => sum + count, 0);
        const maxWeeklyPairs = Math.max(0, ...Array.from(weeks.values()));
        return { resourceType, name: item.name, weeklyHours: maxWeeklyPairs * 2, semesterHours: totalPairs * 2 };
      })
      .filter(item => item.weeklyHours > 40 || item.semesterHours > 1080)
      .sort((a, b) => Math.max(b.weeklyHours - 40, b.semesterHours - 1080) - Math.max(a.weeklyHours - 40, a.semesterHours - 1080));

    const loadLimitIssues = [
      ...buildLoadLimitIssues(teachers.map(teacher => ({ id: teacher.id, name: teacher.name })), teacherWeeklyPairs, 'teacher'),
      ...buildLoadLimitIssues(groups.map(group => ({ id: group.id, name: group.number })), groupWeeklyPairs, 'group'),
    ];

    const insights: Insight[] = [];
    if (collisions.length > 0) {
      insights.push({
        title: 'Есть ресурсные коллизии',
        text: `Найдено ${collisions.length} конфликтных слотов. Сначала разведите преподавателей, группы и аудитории в этих точках: это жёсткие проблемы расписания.`,
        severity: 'critical',
      });
    }
    if (teacherStats[0]?.utilization > settings.analyticsThresholds.teacherOverloadWarningPercent || teacherStats[0]?.gaps > 8) {
      insights.push({
        title: 'Перегруженные преподаватели',
        text: `${teacherStats[0].name}: ${teacherStats[0].total} пар, окон: ${teacherStats[0].gaps}. Проверьте быстрые привязки и отдайте часть практик коллегам с меньшей загрузкой.`,
        severity: 'warning',
      });
    }
    if (groupStats[0]?.gaps > 6) {
      insights.push({
        title: 'Окна у групп',
        text: `${groupStats[0].name}: ${groupStats[0].gaps} окон. Ручная правка здесь даст самый заметный эффект для студентов.`,
        severity: 'warning',
      });
    }
    if (capacityIssues.length > 0) {
      insights.push({
        title: 'Аудитории меньше потока',
        text: `${capacityIssues.length} занятий стоят в аудиториях с недостаточной вместимостью. Начните с потоковых лекций и лабораторных.`,
        severity: 'critical',
      });
    }
    if (lectureOrderIssues.length > 0) {
      insights.push({
        title: 'Практики раньше лекций',
        text: `${lectureOrderIssues.length} практик или лабораторных идут до первой лекции по той же дисциплине. Лучше перенести лекцию раньше или практику позже.`,
        severity: 'info',
      });
    }
    if (driftingSeries > 0) {
      insights.push({
        title: 'Чётность недель расходится',
        text: `${driftingSeries} серий занятий имеют разные шаблоны внутри чётных или нечётных недель. Для читаемости расписания выровняйте день и слот повторяющихся занятий.`,
        severity: 'info',
      });
    }
    if (missingTeacherLinks.length > 0) {
      insights.push({
        title: 'Не хватает привязок преподавателей',
        text: `${missingTeacherLinks.length} позиций учебных планов имеют часы без преподавательских привязок по нужному типу занятия. Ниже показаны конкретные дисциплины.`,
        severity: 'warning',
      });
    }
    if (planCoverageIssues.length > 0) {
      insights.push({
        title: 'Расписание не сходится с учебными планами',
        text: `${planCoverageIssues.length} позиций имеют другое количество занятий, чем требуется по сумме часов учебных планов.`,
        severity: 'warning',
      });
    }
    if (loadLimitIssues.length > 0) {
      insights.push({
        title: 'Превышены пределы нагрузки',
        text: `${loadLimitIssues.length} преподавателей или групп превысили 40 часов в неделю или 1080 часов за семестр.`,
        severity: 'critical',
      });
    }
    if (insights.length === 0) {
      insights.push({
        title: 'Критичных проблем не видно',
        text: 'Расписание выглядит сбалансированным по базовым метрикам. Дальше можно улучшать комфорт: окна, одинаковость недель и распределение нагрузки.',
        severity: 'success',
      });
    }

    return {
      scheduled,
      dates,
      teacherStats,
      groupStats,
      classroomStats,
      departmentStats,
      collisions,
      capacityIssues,
      lectureOrderIssues,
      driftingSeries,
      missingTeacherLinks,
      planCoverageIssues,
      loadLimitIssues,
      insights,
      totalSlots: capacityBase,
      subjectById,
      teacherById,
      groupById,
      classroomById,
    };
  }, [classrooms, departments, educationalPlans, groups, schedule, settings.analyticsThresholds, specialties, subjects, teacherSubjectLinks, teachers, timeSlots, timeSlotsShortened]);

  const whatIfAnalysis = useMemo(() => {
    const weekCount = Math.max(1, Math.ceil(analytics.dates.length / 6));
    const baselineWeeklyLessons = analytics.scheduled.length / weekCount;
    const selectedSpecialty = specialties.find(specialty => specialty.id === whatIf.specialtyId);
    const selectedExistingGroups = groups
      .filter(group =>
        whatIf.groupIds.includes(group.id) &&
        (!whatIf.specialtyId || group.specialtyId === whatIf.specialtyId) &&
        (!whatIf.formOfStudy || group.formOfStudy === whatIf.formOfStudy) &&
        (!whatIf.course || group.course === whatIf.course)
      )
      .map(group => ({
        id: group.id,
        number: group.number,
        specialtyId: group.specialtyId,
        formOfStudy: group.formOfStudy,
        course: group.course,
        studentCount: group.studentCount,
      }));
    const plannedScenarioGroups = whatIf.plannedGroups.filter(group =>
      (!whatIf.specialtyId || group.specialtyId === whatIf.specialtyId) &&
      (!whatIf.formOfStudy || group.formOfStudy === whatIf.formOfStudy) &&
      (!whatIf.course || group.course === whatIf.course)
    );
    const scenarioGroups = [...selectedExistingGroups, ...plannedScenarioGroups];
    const findPlanForScenarioGroup = (group: typeof scenarioGroups[number]) =>
      educationalPlans.find(plan => plan.specialtyId === group.specialtyId && plan.formOfStudy === group.formOfStudy) ||
      educationalPlans.find(plan => plan.specialtyId === group.specialtyId && !plan.formOfStudy) ||
      educationalPlans.find(plan => plan.specialtyId === group.specialtyId);
    const subjectById = new Map<string, Subject>(subjects.map(subject => [subject.id, subject]));
    const addedPlanNeeds: WhatIfNeed[] = [];

    scenarioGroups.forEach(group => {
      const plan = findPlanForScenarioGroup(group);
      plan?.entries.filter(entry => isSemesterInCourse(entry.semester, group.course)).forEach(entry => {
        const subjectName = subjectById.get(entry.subjectId)?.name || 'Дисциплина';
        [
          [ClassType.Lecture, entry.lectureHours],
          [ClassType.Practical, entry.practiceHours],
          [ClassType.Lab, entry.labHours],
        ].forEach(([classType, hours]) => {
          const weeklyPairs = Number(hours) > 0 ? Number(hours) / 2 / weekCount : 0;
          if (weeklyPairs > 0) {
            addedPlanNeeds.push({
              groupId: group.id,
              subjectId: entry.subjectId,
              subjectName,
              classType: classType as ClassType,
              weeklyPairs,
              source: group.number,
            });
          }
        });
      });
    });

    const addedWeeklyLessons = addedPlanNeeds.reduce((sum, item) => sum + item.weeklyPairs, 0);
    const removedTeacher = teachers.find(teacher => teacher.id === whatIf.removedTeacherId);
    const removedTeacherWeeklyLoad = removedTeacher
      ? analytics.teacherStats.find(item => item.id === removedTeacher.id)?.total || 0
      : 0;
    const removedTeacherWeeklyPressure = removedTeacherWeeklyLoad / weekCount;
    const teacherCurrentWeeklyLoad = new Map(analytics.teacherStats.map(item => [item.id, item.total / weekCount]));
    const scenarioTeacherRows: ScenarioTeacherRow[] = teachers
      .filter(teacher => teacher.id !== whatIf.removedTeacherId)
      .map(teacher => ({
        teacher,
        currentWeeklyLoad: teacherCurrentWeeklyLoad.get(teacher.id) || 0,
        addedWeeklyLoad: 0,
        capacity: whatIf.teacherCapacityPerWeek,
      }));
    const scenarioTeacherById = new Map<string, ScenarioTeacherRow>(scenarioTeacherRows.map(row => [row.teacher.id, row]));
    const uncoveredNeeds: WhatIfNeed[] = [];

    const removedTeacherNeeds = removedTeacher
      ? analytics.scheduled
        .filter(entry => entry.teacherId === removedTeacher.id)
        .map(entry => ({
          groupId: getEntryGroupIds(entry)[0] || '',
          subjectId: entry.subjectId,
          subjectName: subjectById.get(entry.subjectId)?.name || 'Дисциплина',
          classType: entry.classType,
          weeklyPairs: 1 / weekCount,
          source: `замена ${removedTeacher.name}`,
        }))
      : [];

    const allocateNeed = (need: typeof addedPlanNeeds[number]) => {
      const candidateIds = teacherSubjectLinks
        .filter(link =>
          link.subjectId === need.subjectId &&
          link.classTypes.includes(need.classType) &&
          link.teacherId !== whatIf.removedTeacherId &&
          scenarioTeacherById.has(link.teacherId)
        )
        .map(link => link.teacherId);
      const uniqueCandidateIds: string[] = Array.from(new Set(candidateIds));

      if (uniqueCandidateIds.length === 0) {
        uncoveredNeeds.push({
          groupId: need.groupId,
          subjectId: need.subjectId,
          subjectName: need.subjectName,
          classType: need.classType,
          weeklyPairs: need.weeklyPairs,
          source: need.source,
        });
        return;
      }

      let remaining = need.weeklyPairs;
      while (remaining > 0.0001) {
        const chunk = Math.min(1, remaining);
        const bestTeacher = uniqueCandidateIds
          .map(id => scenarioTeacherById.get(id)!)
          .sort((a, b) =>
            ((a.currentWeeklyLoad + a.addedWeeklyLoad) / Math.max(1, a.capacity)) -
            ((b.currentWeeklyLoad + b.addedWeeklyLoad) / Math.max(1, b.capacity))
          )[0];
        bestTeacher.addedWeeklyLoad += chunk;
        remaining -= chunk;
      }
    };

    [...addedPlanNeeds, ...removedTeacherNeeds].forEach(allocateNeed);

    const effectiveTeachers = Math.max(0, teachers.length - (removedTeacher ? 1 : 0) + whatIf.extraTeachers);
    const teacherCapacity = effectiveTeachers * whatIf.teacherCapacityPerWeek;
    const teacherDemand = baselineWeeklyLessons + addedWeeklyLessons;
    const teacherReserve = teacherCapacity - teacherDemand;

    const closedClassroom = classrooms.find(room => room.id === whatIf.closedClassroomId);
    const activeClassrooms = classrooms.filter(room =>
      room.status !== 'closed' &&
      room.status !== 'repair' &&
      room.id !== whatIf.closedClassroomId
    ).length + whatIf.extraClassrooms;
    const classroomCapacity = activeClassrooms * whatIf.classroomSlotsPerWeek;
    const classroomDemand = baselineWeeklyLessons + addedWeeklyLessons;
    const classroomReserve = classroomCapacity - classroomDemand;

    const largestCurrentGroup = Math.max(0, ...groups.map(group => group.studentCount));
    const largestScenarioGroup = Math.max(0, ...scenarioGroups.map(group => group.studentCount));
    const expectedLargestGroup = Math.max(largestCurrentGroup, largestScenarioGroup);
    const suitableRooms = classrooms.filter(room =>
      room.status !== 'closed' &&
      room.status !== 'repair' &&
      room.id !== whatIf.closedClassroomId &&
      room.capacity >= expectedLargestGroup
    ).length + (whatIf.extraClassrooms > 0 && whatIf.newClassroomCapacity >= expectedLargestGroup ? whatIf.extraClassrooms : 0);

    const redistributedLoad = removedTeacher
      ? removedTeacherWeeklyPressure / Math.max(1, effectiveTeachers)
      : 0;

    const teacherUsage = teacherCapacity > 0 ? teacherDemand / teacherCapacity * 100 : 100;
    const classroomUsage = classroomCapacity > 0 ? classroomDemand / classroomCapacity * 100 : 100;
    const bottlenecks: Insight[] = [];

    if (teacherReserve < 0 || teacherUsage >= settings.analyticsThresholds.teacherOverloadCriticalPercent) {
      bottlenecks.push({
        title: 'Не хватает преподавательского ресурса',
        text: `Недельная потребность выше доступной мощности примерно на ${Math.abs(teacherReserve).toFixed(1)} пар. Добавьте преподавателей, снизьте нагрузку или распределите часть занятий по потокам.`,
        severity: 'critical',
      });
    } else if (teacherUsage > settings.analyticsThresholds.teacherOverloadWarningPercent) {
      bottlenecks.push({
        title: 'Преподаватели близко к пределу',
        text: `Запас всего ${teacherReserve.toFixed(1)} пар в неделю. Любая болезнь, командировка или запрет слотов быстро создаст нераспределённые занятия.`,
        severity: 'warning',
      });
    }

    if (classroomReserve < 0 || classroomUsage >= settings.analyticsThresholds.classroomOverloadCriticalPercent) {
      bottlenecks.push({
        title: 'Не хватает аудиторных слотов',
        text: `Аудиторный фонд не покрывает сценарий примерно на ${Math.abs(classroomReserve).toFixed(1)} пар в неделю. Проверьте вторую смену, субботы и укрупнение потоковых лекций.`,
        severity: 'critical',
      });
    } else if (classroomUsage > settings.analyticsThresholds.classroomOverloadWarningPercent) {
      bottlenecks.push({
        title: 'Аудитории почти исчерпаны',
        text: `Запас аудиторного фонда ${classroomReserve.toFixed(1)} пар в неделю. Лучше заранее закрепить крупные аудитории за потоками.`,
        severity: 'warning',
      });
    }

    if (suitableRooms === 0 && expectedLargestGroup > 0) {
      bottlenecks.push({
        title: 'Нет подходящей вместимости',
        text: `Для группы или потока на ${expectedLargestGroup} студентов не видно доступной аудитории нужного размера.`,
        severity: 'critical',
      });
    }

    if (removedTeacher) {
      bottlenecks.push({
        title: 'Перераспределение нагрузки',
        text: `${removedTeacher.name} несёт около ${removedTeacherWeeklyPressure.toFixed(1)} пар в неделю. После исключения это добавит коллегам примерно по ${redistributedLoad.toFixed(1)} пары в неделю.`,
        severity: redistributedLoad > 2 ? 'warning' : 'info',
      });
    }

    if (scenarioGroups.length > 0 && addedWeeklyLessons === 0) {
      bottlenecks.push({
        title: 'Нет учебного плана для сценария',
        text: 'Для выбранных групп не найдены часы лекций, практик и лабораторных в учебном плане. Проверьте привязку группы к специальности и наличие плана.',
        severity: 'warning',
      });
    }

    if (uncoveredNeeds.length > 0) {
      const totalUncovered = uncoveredNeeds.reduce((sum, item) => sum + item.weeklyPairs, 0);
      bottlenecks.push({
        title: 'Есть дисциплины без привязанных преподавателей',
        text: `Не на кого разложить около ${totalUncovered.toFixed(1)} пар в неделю: нет привязок к дисциплинам и типам занятий.`,
        severity: 'critical',
      });
    }

    const teacherProjections: WhatIfTeacherProjection[] = scenarioTeacherRows
      .filter(row => row.currentWeeklyLoad > 0 || row.addedWeeklyLoad > 0)
      .map(row => {
        const projectedWeeklyLoad = row.currentWeeklyLoad + row.addedWeeklyLoad;
        return {
          id: row.teacher.id,
          name: row.teacher.name,
          currentWeeklyLoad: row.currentWeeklyLoad,
          addedWeeklyLoad: row.addedWeeklyLoad,
          projectedWeeklyLoad,
          usage: row.capacity > 0 ? projectedWeeklyLoad / row.capacity * 100 : 100,
          capacity: row.capacity,
        };
      })
      .sort((a, b) => b.usage - a.usage);

    if (bottlenecks.length === 0) {
      bottlenecks.push({
        title: 'Сценарий выглядит подъёмным',
        text: 'По грубой мощности преподавателей и аудиторий запас сохраняется. Перед запуском генератора стоит проверить привязки преподавателей и крупные аудитории для потоков.',
        severity: 'success',
      });
    }

    return {
      weekCount,
      baselineWeeklyLessons,
      addedWeeklyLessons,
      selectedSpecialty,
      scenarioGroups,
      teacherProjections,
      uncoveredNeeds,
      removedTeacher,
      closedClassroom,
      effectiveTeachers,
      activeClassrooms,
      teacherDemand,
      teacherCapacity,
      teacherReserve,
      teacherUsage,
      classroomDemand,
      classroomCapacity,
      classroomReserve,
      classroomUsage,
      expectedLargestGroup,
      suitableRooms,
      bottlenecks,
    };
  }, [analytics.dates.length, analytics.scheduled, analytics.teacherStats, classrooms, educationalPlans, groups, settings.analyticsThresholds, specialties, subjects, teacherSubjectLinks, teachers, whatIf]);

  const tabs = [
    ['overview', 'Обзор'],
    ['departments', 'Кафедры'],
    ['teachers', 'Преподаватели'],
    ['groups', 'Группы'],
    ['classrooms', 'Аудитории'],
    ['whatif', 'Что, если?'],
    ['advice', 'Советы'],
  ] as const;

  const updateWhatIf = <K extends keyof WhatIfScenario>(key: K, value: WhatIfScenario[K]) => {
    setWhatIf(prev => ({ ...prev, [key]: value }));
  };

  const updateWhatIfSpecialty = (specialtyId: string) => {
    setWhatIf(prev => ({
      ...prev,
      specialtyId,
      groupIds: prev.groupIds.filter(groupId => {
        const group = groups.find(item => item.id === groupId);
        return (!specialtyId || group?.specialtyId === specialtyId) &&
          (!prev.formOfStudy || group?.formOfStudy === prev.formOfStudy) &&
          (!prev.course || group?.course === prev.course);
      }),
    }));
    setWhatIfGroupDraft(prev => ({
      ...prev,
      specialtyId: specialtyId || prev.specialtyId,
    }));
  };

  const updateWhatIfFormOfStudy = (formOfStudy: FormOfStudy | '') => {
    setWhatIf(prev => ({
      ...prev,
      formOfStudy,
      groupIds: prev.groupIds.filter(groupId => {
        const group = groups.find(item => item.id === groupId);
        return (!formOfStudy || group?.formOfStudy === formOfStudy) &&
          (!prev.specialtyId || group?.specialtyId === prev.specialtyId) &&
          (!prev.course || group?.course === prev.course);
      }),
    }));
    if (formOfStudy) setWhatIfGroupDraft(prev => ({ ...prev, formOfStudy }));
  };

  const updateWhatIfCourse = (course: number) => {
    setWhatIf(prev => ({
      ...prev,
      course,
      groupIds: prev.groupIds.filter(groupId => {
        const group = groups.find(item => item.id === groupId);
        return (!course || group?.course === course) &&
          (!prev.specialtyId || group?.specialtyId === prev.specialtyId) &&
          (!prev.formOfStudy || group?.formOfStudy === prev.formOfStudy);
      }),
    }));
    setWhatIfGroupDraft(prev => ({ ...prev, course: course || prev.course }));
  };

  const toggleWhatIfGroup = (groupId: string) => {
    setWhatIf(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter(id => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  const addPlannedWhatIfGroup = () => {
    const specialtyId = whatIfGroupDraft.specialtyId || whatIf.specialtyId;
    const specialty = specialties.find(item => item.id === specialtyId);
    if (!specialty) {
      alert('Выберите специальность для планируемой группы.');
      return;
    }
    const number = whatIfGroupDraft.number.trim() || `Новая группа ${whatIf.plannedGroups.length + 1}`;
    setWhatIf(prev => ({
      ...prev,
      plannedGroups: [
        ...prev.plannedGroups,
        {
          id: `whatif-group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          number,
          specialtyId,
          formOfStudy: whatIfGroupDraft.formOfStudy || whatIf.formOfStudy || FormOfStudy.FullTime,
          course: Math.max(1, whatIfGroupDraft.course || whatIf.course || 1),
          studentCount: Math.max(1, whatIfGroupDraft.studentCount),
        },
      ],
    }));
    setWhatIfGroupDraft(prev => ({ ...prev, number: '' }));
  };

  const removePlannedWhatIfGroup = (groupId: string) => {
    setWhatIf(prev => ({
      ...prev,
      plannedGroups: prev.plannedGroups.filter(group => group.id !== groupId),
    }));
  };

  const whatIfGroupOptions = groups
    .filter(group =>
      (!whatIf.specialtyId || group.specialtyId === whatIf.specialtyId) &&
      (!whatIf.formOfStudy || group.formOfStudy === whatIf.formOfStudy) &&
      (!whatIf.course || group.course === whatIf.course)
    )
    .sort((a, b) => a.number.localeCompare(b.number, 'ru'));

  const numberInput = (label: string, value: number, onChange: (value: number) => void, min = 0) => (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </label>
  );

  const renderStatTable = (items: ResourceStat[], label: string) => (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Ресурс</th>
              <th className="px-4 py-3 text-right">Пар</th>
              <th className="px-4 py-3 text-right">Дней</th>
              <th className="px-4 py-3 text-right">Окон</th>
              <th className="px-4 py-3 text-right">Коллизий</th>
              <th className="px-4 py-3 text-right">Пик</th>
              <th className="px-4 py-3 text-right">Загрузка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(item => (
              <tr key={item.id} className={item.conflicts > 0 ? 'bg-red-50/60' : ''}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  {item.owner && <div className="text-xs text-gray-500">{item.owner}</div>}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{item.total}</td>
                <td className="px-4 py-3 text-right">{item.days}</td>
                <td className="px-4 py-3 text-right">{item.gaps}</td>
                <td className="px-4 py-3 text-right">{item.conflicts}</td>
                <td className="px-4 py-3 text-right">{item.peakLoad} / {item.peakDay}</td>
                <td className="px-4 py-3 text-right">{percent(item.utilization)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={7}>Нет данных для анализа</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Статистика и аналитика расписания</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Загрузка кафедр, преподавателей, групп и аудиторий, поиск узких мест и подсказки для ручной оптимизации.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === id ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ['Занятий', analytics.scheduled.length],
          ['Учебных дней', analytics.dates.length],
          ['Коллизий', analytics.collisions.length],
          ['Проблем аудиторий', analytics.capacityIssues.length],
          ['Нарушений порядка', analytics.lectureOrderIssues.length],
          ['Дрейф серий', analytics.driftingSeries],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
          </div>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-5">
            {renderStatTable(top(analytics.teacherStats), 'Самые загруженные преподаватели')}
            {renderStatTable(top(analytics.groupStats), 'Самые загруженные группы')}
          </div>
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase text-gray-500">Главные выводы</h2>
            {analytics.insights.map(insight => (
              <div key={insight.title} className={`rounded-lg border p-4 ${severityClass[insight.severity]}`}>
                <div className="font-semibold">{insight.title}</div>
                <p className="mt-1 text-sm leading-5">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Кафедра</th>
                <th className="px-4 py-3 text-right">Пар</th>
                <th className="px-4 py-3 text-right">Преподавателей</th>
                <th className="px-4 py-3 text-right">Групп</th>
                <th className="px-4 py-3 text-right">Средняя нагрузка</th>
                <th className="px-4 py-3 text-right">Разброс</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {analytics.departmentStats.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-right font-semibold">{item.total}</td>
                  <td className="px-4 py-3 text-right">{item.teachers}</td>
                  <td className="px-4 py-3 text-right">{item.groups}</td>
                  <td className="px-4 py-3 text-right">{item.averageTeacherLoad.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">{item.imbalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'teachers' && renderStatTable(analytics.teacherStats, 'Загрузка преподавателей')}
      {activeTab === 'groups' && renderStatTable(analytics.groupStats, 'Загрузка групп и потоков')}
      {activeTab === 'classrooms' && renderStatTable(analytics.classroomStats, 'Использование аудиторного фонда')}

      {activeTab === 'whatif' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-1">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">Сценарий</h2>
              <p className="mt-1 text-sm text-gray-600">Эти параметры используются только для расчёта и не меняют расписание.</p>
              <div className="mt-4 grid gap-4">
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">Специальность для сценария</span>
                  <select
                    value={whatIf.specialtyId}
                    onChange={(event) => updateWhatIfSpecialty(event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Все специальности</option>
                    {specialties.map(specialty => (
                      <option key={specialty.id} value={specialty.id}>{specialty.code} {specialty.name}</option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-gray-500">Форма обучения</span>
                    <select
                      value={whatIf.formOfStudy}
                      onChange={(event) => updateWhatIfFormOfStudy(event.target.value as FormOfStudy | '')}
                      className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Все формы</option>
                      {Object.values(FormOfStudy).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  {numberInput('Курс сценария', whatIf.course, value => updateWhatIfCourse(Math.max(1, value)), 1)}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-gray-500">Конкретные группы</div>
                  <div className="mt-1 max-h-56 space-y-1 overflow-auto rounded-md border border-gray-200 bg-white p-2">
                    {whatIfGroupOptions.map(group => (
                      <label key={group.id} className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                        <span>
                          <span className="font-medium text-gray-900">{group.number}</span>
                          <span className="ml-2 text-xs text-gray-500">{group.course} курс · {group.formOfStudy} · {group.studentCount} студ.</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={whatIf.groupIds.includes(group.id)}
                          onChange={() => toggleWhatIfGroup(group.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </label>
                    ))}
                    {whatIfGroupOptions.length === 0 && (
                      <div className="px-2 py-4 text-center text-sm text-gray-500">Для выбранной специальности нет групп</div>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="text-xs font-semibold uppercase text-gray-500">Планируемая группа</div>
                  <div className="mt-3 grid gap-2">
                    <input
                      type="text"
                      value={whatIfGroupDraft.number}
                      onChange={(event) => setWhatIfGroupDraft(prev => ({ ...prev, number: event.target.value }))}
                      placeholder="Номер группы"
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={whatIfGroupDraft.specialtyId || whatIf.specialtyId}
                      onChange={(event) => setWhatIfGroupDraft(prev => ({ ...prev, specialtyId: event.target.value }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Выберите специальность</option>
                      {specialties.map(specialty => (
                        <option key={specialty.id} value={specialty.id}>{specialty.code} {specialty.name}</option>
                      ))}
                    </select>
                    <select
                      value={whatIfGroupDraft.formOfStudy || whatIf.formOfStudy || FormOfStudy.FullTime}
                      onChange={(event) => setWhatIfGroupDraft(prev => ({ ...prev, formOfStudy: event.target.value as FormOfStudy }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {Object.values(FormOfStudy).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={whatIfGroupDraft.course || whatIf.course || 1}
                      onChange={(event) => setWhatIfGroupDraft(prev => ({ ...prev, course: Math.max(1, Number(event.target.value) || 1) }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min={1}
                      value={whatIfGroupDraft.studentCount}
                      onChange={(event) => setWhatIfGroupDraft(prev => ({ ...prev, studentCount: Math.max(1, Number(event.target.value) || 1) }))}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addPlannedWhatIfGroup}
                      className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                    >
                      Добавить в сценарий
                    </button>
                  </div>
                  {whatIf.plannedGroups.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {whatIf.plannedGroups.map(group => {
                        const specialty = specialties.find(item => item.id === group.specialtyId);
                        return (
                          <div key={group.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1.5 text-xs text-gray-700">
                            <span><span className="font-semibold text-gray-900">{group.number}</span> · {group.course} курс · {group.formOfStudy} · {group.studentCount} студ. · {specialty?.code || 'без кода'}</span>
                            <button type="button" onClick={() => removePlannedWhatIfGroup(group.id)} className="text-red-600 hover:text-red-800">Убрать</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">Временно убрать преподавателя</span>
                  <select
                    value={whatIf.removedTeacherId}
                    onChange={(event) => updateWhatIf('removedTeacherId', event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Не убирать</option>
                    {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                  </select>
                </label>
                {numberInput('Добавить преподавателей', whatIf.extraTeachers, value => updateWhatIf('extraTeachers', value))}
                {numberInput('Норма пар в неделю на преподавателя', whatIf.teacherCapacityPerWeek, value => updateWhatIf('teacherCapacityPerWeek', value), 1)}
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-gray-500">Закрыть аудиторию</span>
                  <select
                    value={whatIf.closedClassroomId}
                    onChange={(event) => updateWhatIf('closedClassroomId', event.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Не закрывать</option>
                    {classrooms.map(room => <option key={room.id} value={room.id}>Ауд. {room.number}, {room.capacity} мест</option>)}
                  </select>
                </label>
                {numberInput('Добавить аудиторий', whatIf.extraClassrooms, value => updateWhatIf('extraClassrooms', value))}
                {numberInput('Слотов в неделю на аудиторию', whatIf.classroomSlotsPerWeek, value => updateWhatIf('classroomSlotsPerWeek', value), 1)}
                {numberInput('Мест в новой аудитории', whatIf.newClassroomCapacity, value => updateWhatIf('newClassroomCapacity', value), 1)}
              </div>
            </div>
          </div>

          <div className="space-y-5 xl:col-span-2">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['Текущая нед. нагрузка', whatIfAnalysis.baselineWeeklyLessons.toFixed(1)],
                ['Новая потребность', `+${whatIfAnalysis.addedWeeklyLessons.toFixed(1)}`],
                ['Преподаватели', `${percent(whatIfAnalysis.teacherUsage)}`],
                ['Аудитории', `${percent(whatIfAnalysis.classroomUsage)}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-base font-semibold text-gray-900">Прогноз ресурса</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Преподаватели</div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Эффективно преподавателей</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.effectiveTeachers}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Потребность в неделю</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.teacherDemand.toFixed(1)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Мощность в неделю</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.teacherCapacity.toFixed(1)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Запас</dt><dd className={`font-semibold ${whatIfAnalysis.teacherReserve < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{whatIfAnalysis.teacherReserve.toFixed(1)}</dd></div>
                  </dl>
                </div>
                <div className="rounded-md bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Аудиторный фонд</div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Активных аудиторий</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.activeClassrooms}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Потребность в неделю</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.classroomDemand.toFixed(1)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Мощность в неделю</dt><dd className="font-medium text-gray-900">{whatIfAnalysis.classroomCapacity.toFixed(1)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-gray-600">Запас</dt><dd className={`font-semibold ${whatIfAnalysis.classroomReserve < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{whatIfAnalysis.classroomReserve.toFixed(1)}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
                Для самой крупной ожидаемой группы на {whatIfAnalysis.expectedLargestGroup} студентов доступно аудиторий: <span className="font-semibold text-gray-900">{whatIfAnalysis.suitableRooms}</span>.
                {whatIfAnalysis.removedTeacher && <span> Исключён из сценария: <span className="font-semibold text-gray-900">{whatIfAnalysis.removedTeacher.name}</span>.</span>}
                {whatIfAnalysis.closedClassroom && <span> Закрыта в сценарии: <span className="font-semibold text-gray-900">ауд. {whatIfAnalysis.closedClassroom.number}</span>.</span>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="text-base font-semibold text-gray-900">Нагрузка преподавателей по привязкам</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Добавочная нагрузка распределяется только между преподавателями, привязанными к нужной дисциплине и типу занятия.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Преподаватель</th>
                      <th className="px-4 py-3 text-right">Сейчас</th>
                      <th className="px-4 py-3 text-right">Добавится</th>
                      <th className="px-4 py-3 text-right">Итого</th>
                      <th className="px-4 py-3 text-right">Загрузка</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {top<WhatIfTeacherProjection>(whatIfAnalysis.teacherProjections, 12).map(row => (
                      <tr key={row.id} className={row.usage >= settings.analyticsThresholds.teacherOverloadCriticalPercent ? 'bg-red-50/70' : row.usage >= settings.analyticsThresholds.teacherOverloadWarningPercent ? 'bg-amber-50/70' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                        <td className="px-4 py-3 text-right">{row.currentWeeklyLoad.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-700">+{row.addedWeeklyLoad.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right">{row.projectedWeeklyLoad.toFixed(1)} / {row.capacity.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{percent(row.usage)}</td>
                      </tr>
                    ))}
                    {whatIfAnalysis.teacherProjections.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-gray-500" colSpan={5}>Выберите группы, чтобы увидеть расчёт по преподавателям</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {whatIfAnalysis.uncoveredNeeds.length > 0 && (
                <div className="border-t border-red-100 bg-red-50 px-5 py-4 text-sm text-red-800">
                  Без преподавателя по привязкам: {top<WhatIfNeed>(whatIfAnalysis.uncoveredNeeds, 4).map(item => `${item.subjectName} (${item.classType}, ${item.source})`).join('; ')}
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {whatIfAnalysis.bottlenecks.map(item => (
                <div key={item.title} className={`rounded-lg border p-5 ${severityClass[item.severity]}`}>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6">{item.text}</p>
                </div>
              ))}
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h3 className="font-semibold text-gray-900">Как читать прогноз</h3>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  Инструмент сравнивает недельную потребность с грубой мощностью преподавателей и аудиторий. Он не размещает пары по конкретным дням, поэтому положительный запас означает “скорее возможно”, а отрицательный запас показывает ресурс, который станет узким местом.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'advice' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {analytics.insights.map(insight => (
            <div key={insight.title} className={`rounded-lg border p-5 ${severityClass[insight.severity]}`}>
              <h3 className="font-semibold">{insight.title}</h3>
              <p className="mt-2 text-sm leading-6">{insight.text}</p>
            </div>
          ))}
          {analytics.missingTeacherLinks.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-white p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900">Каких привязок преподавателей не хватает</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-amber-50 text-xs uppercase text-amber-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Специальность</th>
                      <th className="px-3 py-2 text-left">Дисциплина</th>
                      <th className="px-3 py-2 text-left">Тип</th>
                      <th className="px-3 py-2 text-right">Семестр</th>
                      <th className="px-3 py-2 text-right">Часы</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {top<MissingTeacherLinkItem>(analytics.missingTeacherLinks, 12).map((item, index) => (
                      <tr key={`${item.specialtyName}-${item.subjectName}-${item.classType}-${item.semester}-${index}`}>
                        <td className="px-3 py-2 text-gray-700">{item.specialtyName}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{item.subjectName}</td>
                        <td className="px-3 py-2 text-gray-700">{item.classType}</td>
                        <td className="px-3 py-2 text-right">{item.semester}</td>
                        <td className="px-3 py-2 text-right">{item.hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {analytics.planCoverageIssues.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-white p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900">Где количество занятий не совпадает с учебным планом</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-blue-50 text-xs uppercase text-blue-700">
                    <tr>
                      <th className="px-3 py-2 text-left">Группа</th>
                      <th className="px-3 py-2 text-left">Дисциплина</th>
                      <th className="px-3 py-2 text-left">Тип</th>
                      <th className="px-3 py-2 text-right">По плану</th>
                      <th className="px-3 py-2 text-right">В расписании</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {top<PlanCoverageIssue>(analytics.planCoverageIssues, 12).map((item, index) => (
                      <tr key={`${item.groupName}-${item.subjectName}-${item.classType}-${index}`}>
                        <td className="px-3 py-2 font-medium text-gray-900">{item.groupName}</td>
                        <td className="px-3 py-2 text-gray-700">{item.subjectName}</td>
                        <td className="px-3 py-2 text-gray-700">{item.classType}</td>
                        <td className="px-3 py-2 text-right">{item.expected}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${item.actual !== item.expected ? 'text-red-700' : 'text-gray-900'}`}>{item.actual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {analytics.loadLimitIssues.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-white p-5 lg:col-span-2">
              <h3 className="font-semibold text-gray-900">Кто превысил пределы нагрузки</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {top<LoadLimitIssue>(analytics.loadLimitIssues, 12).map(item => (
                  <div key={`${item.resourceType}-${item.name}`} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                    <div className="font-semibold">{item.resourceType === 'teacher' ? 'Преподаватель' : 'Группа'}: {item.name}</div>
                    <div className="mt-1 text-xs">Пик недели: {item.weeklyHours} ч.; семестр: {item.semesterHours} ч.</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h3 className="font-semibold text-gray-900">Что сделать вручную в первую очередь</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
              <li>Развести коллизии преподавателей, групп и аудиторий в одних и тех же слотах.</li>
              <li>Проверить занятия в аудиториях с недостаточной вместимостью.</li>
              <li>Сократить окна у самых проблемных групп и преподавателей.</li>
              <li>Перенести лекции перед практиками и лабораторными по той же дисциплине.</li>
              <li>Выровнять повторяющиеся занятия внутри чётных и нечётных недель.</li>
              <li>Добавить недостающие быстрые привязки преподавателей к дисциплинам и типам занятий.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsView;
