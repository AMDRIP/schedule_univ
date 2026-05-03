import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { ClassType, ScheduleEntry } from '../types';

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

type WhatIfScenario = {
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
    schedule,
    timeSlots,
    timeSlotsShortened,
    teacherSubjectLinks,
    educationalPlans,
    settings,
  } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'departments' | 'teachers' | 'groups' | 'classrooms' | 'whatif' | 'advice'>('overview');
  const [whatIf, setWhatIf] = useState<WhatIfScenario>({
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

  const analytics = useMemo(() => {
    const scheduled = schedule.filter(entry => entry.date);
    const dates = Array.from(new Set(scheduled.map(entry => entry.date!))).sort();
    const slotIds = Array.from(new Set([...timeSlots, ...timeSlotsShortened].map(slot => slot.id)));
    const capacityBase = Math.max(1, dates.length * Math.max(1, slotIds.length));
    const weekCount = Math.max(1, Math.ceil(dates.length / 6));
    const teacherCapacityBase = Math.max(1, weekCount * settings.analyticsThresholds.targetWeeklyTeacherLoad);

    const teacherById = new Map(teachers.map(item => [item.id, item]));
    const groupById = new Map(groups.map(item => [item.id, item]));
    const classroomById = new Map(classrooms.map(item => [item.id, item]));
    const subjectById = new Map(subjects.map(item => [item.id, item]));
    const departmentById = new Map(departments.map(item => [item.id, item]));

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

    const teacherStats = resourceEntries(
      teachers,
      teacher => scheduled.filter(entry => entry.teacherId === teacher.id),
      teacher => departmentById.get(teacher.departmentId)?.name,
      teacherCapacityBase
    ).sort((a, b) => b.total - a.total);

    const groupStats = resourceEntries(
      groups.map(group => ({ ...group, name: group.number })),
      group => scheduled.filter(entry => getEntryGroupIds(entry).includes(group.id)),
      group => departmentById.get(group.departmentId)?.name
    ).sort((a, b) => b.total - a.total);

    const classroomStats = resourceEntries(
      classrooms.map(room => ({ ...room, name: `Ауд. ${room.number}` })),
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

    const uncoveredPlanItems = educationalPlans.flatMap(plan =>
      plan.entries.filter(entry => {
        const requiredTypes = [
          entry.lectureHours > 0 ? ClassType.Lecture : null,
          entry.practiceHours > 0 ? ClassType.Practical : null,
          entry.labHours > 0 ? ClassType.Lab : null,
        ].filter(Boolean) as ClassType[];
        return requiredTypes.some(classType =>
          !teacherSubjectLinks.some(link => link.subjectId === entry.subjectId && link.classTypes.includes(classType))
        );
      })
    );

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
    if (uncoveredPlanItems.length > 0) {
      insights.push({
        title: 'Не хватает привязок преподавателей',
        text: `${uncoveredPlanItems.length} позиций учебных планов имеют часы без преподавательских привязок по нужному типу занятия.`,
        severity: 'warning',
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
      uncoveredPlanItems,
      insights,
      totalSlots: capacityBase,
      subjectById,
      teacherById,
      groupById,
      classroomById,
    };
  }, [classrooms, departments, educationalPlans, groups, schedule, settings.analyticsThresholds, subjects, teacherSubjectLinks, teachers, timeSlots, timeSlotsShortened]);

  const whatIfAnalysis = useMemo(() => {
    const weekCount = Math.max(1, Math.ceil(analytics.dates.length / 6));
    const baselineWeeklyLessons = analytics.scheduled.length / weekCount;
    const addedWeeklyLessons = whatIf.extraGroups * whatIf.lessonsPerGroupPerWeek;
    const removedTeacher = teachers.find(teacher => teacher.id === whatIf.removedTeacherId);
    const removedTeacherWeeklyLoad = removedTeacher
      ? analytics.teacherStats.find(item => item.id === removedTeacher.id)?.total || 0
      : 0;
    const removedTeacherWeeklyPressure = removedTeacherWeeklyLoad / weekCount;

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
    const expectedLargestGroup = Math.max(largestCurrentGroup, whatIf.studentsPerGroup);
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
  }, [analytics.dates.length, analytics.scheduled.length, analytics.teacherStats, classrooms, groups, settings.analyticsThresholds, teachers, whatIf]);

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
                {numberInput('Добавить групп', whatIf.extraGroups, value => updateWhatIf('extraGroups', value))}
                {numberInput('Пар в неделю на группу', whatIf.lessonsPerGroupPerWeek, value => updateWhatIf('lessonsPerGroupPerWeek', value))}
                {numberInput('Студентов в новой группе', whatIf.studentsPerGroup, value => updateWhatIf('studentsPerGroup', value), 1)}
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
