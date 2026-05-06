import React, { useEffect, useMemo, useState } from 'react';
import { DAYS_OF_WEEK } from '../constants';
import { useStore } from '../hooks/useStore';
import { isSemesterInCourse } from '../utils/semesterUtils';
import {
  ClassType,
  FormOfStudy,
  Group,
  RuleAction,
  RuleCategory,
  RuleCondition,
  RuleEntityType,
  RuleLogicalOperator,
  RuleScope,
  RuleSeverity,
  ScheduleEntry,
  SchedulingRule,
  StudyShift,
  TimeSlot,
  UnscheduledEntry,
} from '../types';
import {
  AlertIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from './icons';

type RuleTab = 'overview' | 'rules' | 'templates' | 'audit';
type DiagnosticLevel = 'error' | 'warning' | 'info';

interface RuleDiagnostic {
  level: DiagnosticLevel;
  title: string;
  detail: string;
  ruleId?: string;
  entryId?: string;
}

interface RuleTemplate {
  id: string;
  title: string;
  group: string;
  description: string;
  rule: Partial<SchedulingRule>;
}

const defaultInputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const compactButtonClass = 'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700';

const CATEGORY_LABELS: Record<RuleCategory, string> = {
  resource: 'Ресурсы',
  time: 'Время',
  pedagogy: 'Методика',
  load: 'Нагрузка',
  sequence: 'Порядок',
  quality: 'Качество',
  custom: 'Свои правила',
};

const ENTITY_LABELS: Record<RuleEntityType, string> = {
  teacher: 'Преподаватель',
  group: 'Группа',
  stream: 'Поток',
  subgroup: 'Подгруппа',
  subject: 'Дисциплина',
  classroom: 'Аудитория',
  classroomType: 'Тип аудитории',
  classroomTag: 'Тег аудитории',
  classType: 'Тип занятия',
  department: 'Кафедра',
  specialty: 'Специальность',
  formOfStudy: 'Форма обучения',
  shift: 'Смена',
};

const SEVERITY_BADGES: Record<RuleSeverity, string> = {
  [RuleSeverity.Strict]: 'bg-red-50 text-red-700 border-red-200',
  [RuleSeverity.Strong]: 'bg-orange-50 text-orange-700 border-orange-200',
  [RuleSeverity.Medium]: 'bg-blue-50 text-blue-700 border-blue-200',
  [RuleSeverity.Weak]: 'bg-gray-50 text-gray-700 border-gray-200',
};

const PARAM_ACTIONS = new Set<RuleAction>([
  RuleAction.MaxPerDay,
  RuleAction.MinPerDay,
  RuleAction.MaxPerWeek,
  RuleAction.MinPerWeek,
  RuleAction.MaxConsecutive,
  RuleAction.AtMostNGaps,
]);

const DAY_ACTIONS = new Set<RuleAction>([
  RuleAction.AvoidTime,
  RuleAction.RequireTime,
  RuleAction.PreferTime,
  RuleAction.AvoidDay,
  RuleAction.RequireDay,
  RuleAction.PreferDay,
  RuleAction.AvoidTimeRange,
  RuleAction.RequireTimeRange,
  RuleAction.PreferTimeRange,
]);

const EXACT_TIME_ACTIONS = new Set<RuleAction>([
  RuleAction.AvoidTime,
  RuleAction.RequireTime,
  RuleAction.PreferTime,
  RuleAction.StartAfter,
  RuleAction.EndBefore,
]);

const RANGE_TIME_ACTIONS = new Set<RuleAction>([
  RuleAction.AvoidTimeRange,
  RuleAction.RequireTimeRange,
  RuleAction.PreferTimeRange,
]);

const TARGET_ACTIONS = new Set<RuleAction>([
  RuleAction.RequireClassroomType,
  RuleAction.PreferClassroomType,
  RuleAction.AvoidClassroomType,
  RuleAction.RequireClassroomTag,
  RuleAction.PreferClassroomTag,
  RuleAction.AvoidClassroomTag,
]);

const STUDY_SHIFT_OPTIONS: { id: StudyShift; name: string }[] = [
  { id: 'first', name: 'Первая смена' },
  { id: 'second', name: 'Вторая смена' },
  { id: 'both', name: 'Обе смены' },
];

const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'teacher-no-early',
    title: 'Преподаватель не раньше пары',
    group: 'Время',
    description: 'Запрещает или штрафует ранние пары для выбранных преподавателей.',
    rule: {
      description: 'Преподаватель начинает не ранее выбранной пары',
      category: 'time',
      severity: RuleSeverity.Strong,
      action: RuleAction.StartAfter,
      conditions: [{ entityType: 'teacher', entityIds: [] }],
    },
  },
  {
    id: 'group-max-day',
    title: 'Лимит пар у группы в день',
    group: 'Нагрузка',
    description: 'Не даёт перегружать группы слишком длинными учебными днями.',
    rule: {
      description: 'У группы не больше 4 пар в день',
      category: 'load',
      severity: RuleSeverity.Strong,
      action: RuleAction.MaxPerDay,
      param: 4,
      conditions: [{ entityType: 'group', entityIds: [] }],
    },
  },
  {
    id: 'lectures-before-practice',
    title: 'Лекции раньше практик',
    group: 'Методика',
    description: 'Ставит лекционные занятия перед практиками и лабораторными.',
    rule: {
      description: 'Лекции должны идти раньше практик и лабораторных',
      category: 'sequence',
      severity: RuleSeverity.Strong,
      action: RuleAction.Order,
      conditions: [
        { entityType: 'classType', entityIds: [ClassType.Lecture] },
        { entityType: 'classType', entityIds: [ClassType.Practical, ClassType.Lab] },
      ],
      logicalOperators: ['AND'],
    },
  },
  {
    id: 'no-single-lessons',
    title: 'Избегать одиночных пар',
    group: 'Качество',
    description: 'Штрафует день, где для группы или преподавателя остаётся одна пара.',
    rule: {
      description: 'Избегать одиночной пары в день',
      category: 'quality',
      severity: RuleSeverity.Medium,
      action: RuleAction.AvoidSingleLessonDay,
      conditions: [{ entityType: 'group', entityIds: [] }],
    },
  },
  {
    id: 'compact-teacher-day',
    title: 'Компактный день преподавателя',
    group: 'Качество',
    description: 'Уменьшает окна в расписании выбранных преподавателей.',
    rule: {
      description: 'Компактный день преподавателя без лишних окон',
      category: 'quality',
      severity: RuleSeverity.Medium,
      action: RuleAction.PreferCompactDay,
      conditions: [{ entityType: 'teacher', entityIds: [] }],
    },
  },
  {
    id: 'required-lab-room',
    title: 'Лабораторные только в нужных аудиториях',
    group: 'Ресурсы',
    description: 'Требует выбранный тип аудитории для лабораторных занятий.',
    rule: {
      description: 'Лабораторные только в аудиториях нужного типа',
      category: 'resource',
      severity: RuleSeverity.Strict,
      action: RuleAction.RequireClassroomType,
      conditions: [{ entityType: 'classType', entityIds: [ClassType.Lab] }],
      targetIds: [],
    },
  },
  {
    id: 'zao-evening',
    title: 'Заочники вечером или в выходные',
    group: 'Время',
    description: 'Ограничивает правило формой обучения и временем.',
    rule: {
      description: 'Заочная форма учится во второй смене',
      category: 'time',
      severity: RuleSeverity.Strong,
      action: RuleAction.RequireTimeRange,
      scope: { formOfStudy: FormOfStudy.PartTime },
      conditions: [{ entityType: 'formOfStudy', entityIds: [FormOfStudy.PartTime] }],
    },
  },
  {
    id: 'stream-no-overlap',
    title: 'Поток не пересекается сам с собой',
    group: 'Ресурсы',
    description: 'Защищает потоковые занятия от накладок с группами потока.',
    rule: {
      description: 'Потоковые занятия не должны пересекаться',
      category: 'resource',
      severity: RuleSeverity.Strict,
      action: RuleAction.NoOverlap,
      conditions: [{ entityType: 'stream', entityIds: [] }],
    },
  },
];

const getEntryGroupIds = (entry: Pick<ScheduleEntry | UnscheduledEntry, 'groupId' | 'groupIds'>) =>
  entry.groupIds?.length ? entry.groupIds : entry.groupId ? [entry.groupId] : [];

const getWeekKey = (date?: string) => {
  if (!date) return '';
  const current = new Date(date);
  const firstDay = new Date(current.getFullYear(), 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;
  const week = Math.ceil((((current.getTime() - firstDay.getTime()) / dayMs) + firstDay.getDay() + 1) / 7);
  return `${current.getFullYear()}-${week}`;
};

const slotIndexOf = (timeSlots: TimeSlot[], slotId?: string) => timeSlots.findIndex(slot => slot.id === slotId);

const getGapCount = (indices: number[]) => {
  const sorted = Array.from(new Set(indices.filter(index => index >= 0))).sort((a, b) => a - b);
  if (sorted.length <= 1) return 0;
  return Math.max(0, sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length);
};

const getMaxConsecutiveCount = (indices: number[]) => {
  const sorted = Array.from(new Set(indices.filter(index => index >= 0))).sort((a, b) => a - b);
  let best = 0;
  let current = 0;
  let previous = -2;
  sorted.forEach(index => {
    current = index === previous + 1 ? current + 1 : 1;
    previous = index;
    best = Math.max(best, current);
  });
  return best;
};

const ruleEnabled = (rule: SchedulingRule) => rule.enabled !== false;

const RuleManager: React.FC = () => {
  const store = useStore();
  const {
    schedulingRules,
    addItem,
    updateItem,
    deleteItem,
    schedule,
    unscheduledEntries,
    teachers,
    groups,
    streams,
    subgroups,
    subjects,
    classrooms,
    classroomTypes,
    classroomTags,
    departments,
    specialties,
    timeSlots,
  } = store;

  const [activeTab, setActiveTab] = useState<RuleTab>('overview');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RuleCategory | 'all'>('all');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(schedulingRules[0]?.id || null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<SchedulingRule | null>(null);
  const [draftRule, setDraftRule] = useState<Partial<SchedulingRule> | null>(null);

  useEffect(() => {
    if (selectedRuleId && schedulingRules.some(rule => rule.id === selectedRuleId)) return;
    setSelectedRuleId(schedulingRules[0]?.id || null);
  }, [schedulingRules, selectedRuleId]);

  const entityOptions = useMemo(() => ({
    teacher: teachers.map(item => ({ id: item.id, name: item.name })),
    group: groups.map(item => ({ id: item.id, name: item.number })),
    stream: streams.map(item => ({ id: item.id, name: item.name })),
    subgroup: subgroups.map(item => ({ id: item.id, name: item.name })),
    subject: subjects.map(item => ({ id: item.id, name: item.name })),
    classroom: classrooms.map(item => ({ id: item.id, name: item.number })),
    classroomType: classroomTypes.map(item => ({ id: item.id, name: item.name })),
    classroomTag: classroomTags.map(item => ({ id: item.id, name: item.name })),
    classType: Object.values(ClassType).map(item => ({ id: item, name: item })),
    department: departments.map(item => ({ id: item.id, name: item.name })),
    specialty: specialties.map(item => ({ id: item.id, name: `${item.code} ${item.name}` })),
    formOfStudy: Object.values(FormOfStudy).map(item => ({ id: item, name: item })),
    shift: STUDY_SHIFT_OPTIONS,
  }), [teachers, groups, streams, subgroups, subjects, classrooms, classroomTypes, classroomTags, departments, specialties]);

  const getEntityName = (type: RuleEntityType, id: string) =>
    entityOptions[type]?.find(option => option.id === id)?.name || id;

  const getGroupsForEntry = (entry: ScheduleEntry | UnscheduledEntry) =>
    getEntryGroupIds(entry).map(groupId => groups.find(group => group.id === groupId)).filter(Boolean) as Group[];

  const conditionMatchesEntry = (condition: RuleCondition, entry: ScheduleEntry | UnscheduledEntry): boolean => {
    const entryGroups = getGroupsForEntry(entry);
    const classroom = 'classroomId' in entry ? classrooms.find(item => item.id === entry.classroomId) : undefined;
    const teacher = teachers.find(item => item.id === entry.teacherId);

    switch (condition.entityType) {
      case 'teacher':
        return condition.entityIds.includes(entry.teacherId) ||
          ('teacherCandidates' in entry && (entry.teacherCandidates || []).some(teacherId => condition.entityIds.includes(teacherId)));
      case 'group':
        return getEntryGroupIds(entry).some(groupId => condition.entityIds.includes(groupId));
      case 'stream':
        return !!entry.streamId && condition.entityIds.includes(entry.streamId);
      case 'subgroup':
        return !!entry.subgroupId && condition.entityIds.includes(entry.subgroupId);
      case 'subject':
        return condition.entityIds.includes(entry.subjectId) && (!condition.classType || condition.classType === entry.classType);
      case 'classType':
        return condition.entityIds.includes(entry.classType);
      case 'classroom':
        return 'classroomId' in entry && condition.entityIds.includes(entry.classroomId);
      case 'classroomType':
        return !!classroom
          ? condition.entityIds.includes(classroom.typeId)
          : ('classroomTypeIds' in entry && (entry.classroomTypeIds || []).some(id => condition.entityIds.includes(id)));
      case 'classroomTag':
        return !!classroom
          ? (classroom.tagIds || []).some(id => condition.entityIds.includes(id))
          : ('requiredClassroomTagIds' in entry && (entry.requiredClassroomTagIds || []).some(id => condition.entityIds.includes(id)));
      case 'department':
        return (!!teacher && condition.entityIds.includes(teacher.departmentId)) ||
          entryGroups.some(group => condition.entityIds.includes(group.departmentId)) ||
          (!!classroom?.departmentId && condition.entityIds.includes(classroom.departmentId));
      case 'specialty':
        return entryGroups.some(group => condition.entityIds.includes(group.specialtyId));
      case 'formOfStudy':
        return entryGroups.some(group => condition.entityIds.includes(group.formOfStudy));
      case 'shift':
        return entryGroups.some(group => !!group.shift && condition.entityIds.includes(group.shift));
      default:
        return false;
    }
  };

  const scopeMatchesEntry = (scope: RuleScope | undefined, entry: ScheduleEntry | UnscheduledEntry) => {
    if (!scope) return true;
    const entryGroups = getGroupsForEntry(entry);
    const classroom = 'classroomId' in entry ? classrooms.find(item => item.id === entry.classroomId) : undefined;
    const teacher = teachers.find(item => item.id === entry.teacherId);

    if ('date' in entry && entry.date) {
      if (scope.startDate && entry.date < scope.startDate) return false;
      if (scope.endDate && entry.date > scope.endDate) return false;
      if (scope.weekType && scope.weekType !== 'any' && entry.weekType !== scope.weekType && entry.weekType !== 'every') return false;
    }
    if (scope.course && !entryGroups.some(group => group.course === scope.course)) return false;
    if (scope.semester && !entryGroups.some(group => isSemesterInCourse(scope.semester!, group.course))) return false;
    if (scope.formOfStudy && scope.formOfStudy !== 'any' && !entryGroups.some(group => group.formOfStudy === scope.formOfStudy)) return false;
    if (scope.shift && scope.shift !== 'any' && !entryGroups.some(group => group.shift === scope.shift)) return false;
    if (scope.departmentIds?.length) {
      const hasDepartment = entryGroups.some(group => scope.departmentIds!.includes(group.departmentId)) ||
        (!!teacher && scope.departmentIds.includes(teacher.departmentId)) ||
        (!!classroom?.departmentId && scope.departmentIds.includes(classroom.departmentId));
      if (!hasDepartment) return false;
    }
    if (scope.specialtyIds?.length && !entryGroups.some(group => scope.specialtyIds!.includes(group.specialtyId))) return false;
    if (scope.classroomTypeIds?.length && (!classroom || !scope.classroomTypeIds.includes(classroom.typeId))) return false;
    if (scope.classroomTagIds?.length && (!classroom || !scope.classroomTagIds.some(tagId => (classroom.tagIds || []).includes(tagId)))) return false;
    if (scope.streamIds?.length && (!entry.streamId || !scope.streamIds.includes(entry.streamId))) return false;
    return true;
  };

  const ruleAppliesToEntry = (rule: SchedulingRule, entry: ScheduleEntry | UnscheduledEntry) => {
    if (!ruleEnabled(rule) || !scopeMatchesEntry(rule.scope, entry) || rule.conditions.length === 0) return false;
    return rule.conditions.reduce((result, condition, index) => {
      const current = conditionMatchesEntry(condition, entry);
      if (index === 0) return current;
      return (rule.logicalOperators?.[index - 1] || 'AND') === 'OR' ? result || current : result && current;
    }, false);
  };

  const ruleTargetIds = (rule: SchedulingRule, entityType: RuleEntityType) => {
    const fromConditions = rule.conditions
      .filter(condition => condition.entityType === entityType)
      .flatMap(condition => condition.entityIds);
    return Array.from(new Set([...(rule.targetIds || []), ...fromConditions]));
  };

  const ruleTimeMatchesEntry = (rule: SchedulingRule, entry: ScheduleEntry) => {
    const dayMatches = !rule.day || rule.day === entry.day;
    const timeMatches = !rule.timeSlotId || rule.timeSlotId === entry.timeSlotId;
    return dayMatches && timeMatches;
  };

  const ruleTimeRangeMatchesEntry = (rule: SchedulingRule, entry: ScheduleEntry) => {
    const dayMatches = !rule.day || rule.day === entry.day;
    const candidateIndex = slotIndexOf(timeSlots, entry.timeSlotId);
    const startIndex = rule.startTimeSlotId ? slotIndexOf(timeSlots, rule.startTimeSlotId) : 0;
    const endIndex = rule.endTimeSlotId ? slotIndexOf(timeSlots, rule.endTimeSlotId) : timeSlots.length - 1;
    return dayMatches && candidateIndex >= Math.min(startIndex, endIndex) && candidateIndex <= Math.max(startIndex, endIndex);
  };

  const formatCondition = (condition: RuleCondition) => {
    const values = condition.entityIds.length
      ? condition.entityIds.map(id => getEntityName(condition.entityType, id)).join(', ')
      : 'не выбрано';
    return `${ENTITY_LABELS[condition.entityType]}: ${values}${condition.classType ? ` (${condition.classType})` : ''}`;
  };

  const formatRule = (rule: SchedulingRule) => {
    const conditions = rule.conditions
      .map((condition, index) => `${index > 0 ? ` ${rule.logicalOperators?.[index - 1] === 'OR' ? 'ИЛИ' : 'И'} ` : ''}${formatCondition(condition)}`)
      .join('');
    const parts = [conditions || 'без условий'];
    if (rule.day) parts.push(rule.day);
    if (rule.timeSlotId) parts.push(timeSlots.find(slot => slot.id === rule.timeSlotId)?.time || rule.timeSlotId);
    if (rule.startTimeSlotId || rule.endTimeSlotId) {
      parts.push(`${timeSlots.find(slot => slot.id === rule.startTimeSlotId)?.time || 'начало'} - ${timeSlots.find(slot => slot.id === rule.endTimeSlotId)?.time || 'конец'}`);
    }
    if (rule.param !== undefined) parts.push(`N=${rule.param}`);
    if (rule.targetIds?.length) parts.push(`цель: ${rule.targetIds.join(', ')}`);
    return parts.join(' · ');
  };

  const validateRule = (rule: SchedulingRule): RuleDiagnostic[] => {
    const diagnostics: RuleDiagnostic[] = [];
    if (!rule.description?.trim()) {
      diagnostics.push({ level: 'warning', title: 'Нет описания', detail: 'Правило будет сложно отличить от других.', ruleId: rule.id });
    }
    if (!rule.conditions.length) {
      diagnostics.push({ level: 'error', title: 'Нет условий', detail: 'Правило ни к чему не применяется.', ruleId: rule.id });
    }
    rule.conditions.forEach((condition, index) => {
      if (!condition.entityIds.length) {
        diagnostics.push({ level: 'error', title: `Условие ${index + 1} пустое`, detail: `Выберите хотя бы одно значение для "${ENTITY_LABELS[condition.entityType]}".`, ruleId: rule.id });
      }
      condition.entityIds.forEach(id => {
        if (!entityOptions[condition.entityType]?.some(option => option.id === id)) {
          diagnostics.push({ level: 'warning', title: 'Ссылка не найдена', detail: `${ENTITY_LABELS[condition.entityType]}: ${id}`, ruleId: rule.id });
        }
      });
    });
    if (PARAM_ACTIONS.has(rule.action) && (rule.param === undefined || Number.isNaN(rule.param))) {
      diagnostics.push({ level: 'error', title: 'Не задан числовой параметр', detail: 'Для этого действия нужен параметр N.', ruleId: rule.id });
    }
    if (DAY_ACTIONS.has(rule.action) && !rule.day && ![RuleAction.AvoidTimeRange, RuleAction.RequireTimeRange, RuleAction.PreferTimeRange].includes(rule.action)) {
      diagnostics.push({ level: 'warning', title: 'День не выбран', detail: 'Правило будет применяться ко всем дням.', ruleId: rule.id });
    }
    if (EXACT_TIME_ACTIONS.has(rule.action) && !rule.timeSlotId) {
      diagnostics.push({ level: 'warning', title: 'Слот не выбран', detail: 'Правило будет учитывать только день или индекс по умолчанию.', ruleId: rule.id });
    }
    if (RANGE_TIME_ACTIONS.has(rule.action) && (!rule.startTimeSlotId || !rule.endTimeSlotId)) {
      diagnostics.push({ level: 'warning', title: 'Диапазон неполный', detail: 'Лучше указать начальный и конечный слот.', ruleId: rule.id });
    }
    if (TARGET_ACTIONS.has(rule.action)) {
      const targetType: RuleEntityType = [RuleAction.RequireClassroomTag, RuleAction.PreferClassroomTag, RuleAction.AvoidClassroomTag].includes(rule.action) ? 'classroomTag' : 'classroomType';
      if (!ruleTargetIds(rule, targetType).length) {
        diagnostics.push({ level: 'error', title: 'Не выбрана целевая аудитория', detail: 'Для правила по типу или тегу аудитории нужно выбрать цель.', ruleId: rule.id });
      }
    }
    if (rule.scope?.startDate && rule.scope?.endDate && rule.scope.startDate > rule.scope.endDate) {
      diagnostics.push({ level: 'error', title: 'Некорректный период', detail: 'Дата начала области действия позже даты окончания.', ruleId: rule.id });
    }
    if (new Set(rule.logicalOperators || []).size > 1) {
      diagnostics.push({ level: 'info', title: 'Смешаны И/ИЛИ', detail: 'Сейчас условия считаются слева направо без скобок.', ruleId: rule.id });
    }
    if (rule.severity === RuleSeverity.Strict && [RuleAction.PreferTime, RuleAction.PreferDay, RuleAction.PreferTimeRange, RuleAction.PreferClassroomType, RuleAction.PreferClassroomTag, RuleAction.PreferCompactDay].includes(rule.action)) {
      diagnostics.push({ level: 'warning', title: 'Строгое предпочтение', detail: 'Предпочтение со строгой важностью не запрещает альтернативы, но может запутать пользователя.', ruleId: rule.id });
    }
    return diagnostics;
  };

  const findRuleConflicts = (rules: SchedulingRule[]): RuleDiagnostic[] => {
    const diagnostics: RuleDiagnostic[] = [];
    const activeStrict = rules.filter(rule => ruleEnabled(rule) && rule.severity === RuleSeverity.Strict);
    activeStrict.forEach((left, leftIndex) => {
      activeStrict.slice(leftIndex + 1).forEach(right => {
        const sameConditions = JSON.stringify(left.conditions) === JSON.stringify(right.conditions);
        if (!sameConditions) return;
        if (
          left.day && right.day && left.day === right.day &&
          ((left.action === RuleAction.RequireDay && right.action === RuleAction.AvoidDay) ||
            (left.action === RuleAction.AvoidDay && right.action === RuleAction.RequireDay))
        ) {
          diagnostics.push({
            level: 'error',
            title: 'Противоречивые строгие правила',
            detail: `"${left.description}" конфликтует с "${right.description}".`,
            ruleId: left.id,
          });
        }
        if (
          left.timeSlotId && right.timeSlotId && left.timeSlotId === right.timeSlotId &&
          ((left.action === RuleAction.RequireTime && right.action === RuleAction.AvoidTime) ||
            (left.action === RuleAction.AvoidTime && right.action === RuleAction.RequireTime))
        ) {
          diagnostics.push({
            level: 'error',
            title: 'Противоречие по слоту',
            detail: `"${left.description}" и "${right.description}" требуют несовместимые действия.`,
            ruleId: left.id,
          });
        }
      });
    });
    return diagnostics;
  };

  const auditRuleOnSchedule = (rule: SchedulingRule): RuleDiagnostic[] => {
    if (!ruleEnabled(rule)) return [];
    const diagnostics: RuleDiagnostic[] = [];
    const matchingEntries = schedule.filter(entry => ruleAppliesToEntry(rule, entry));

    matchingEntries.forEach(entry => {
      const subject = subjects.find(item => item.id === entry.subjectId)?.name || entry.subjectId;
      const groupNames = getEntryGroupIds(entry).map(id => getEntityName('group', id)).join(', ');
      const context = `${subject}${groupNames ? ` · ${groupNames}` : ''} · ${entry.date || entry.day}`;
      const addViolation = (title: string, detail: string, level: DiagnosticLevel = rule.severity === RuleSeverity.Strict ? 'error' : 'warning') => {
        diagnostics.push({ level, title, detail: `${context}. ${detail}`, ruleId: rule.id, entryId: entry.id });
      };

      switch (rule.action) {
        case RuleAction.AvoidTime:
          if (ruleTimeMatchesEntry(rule, entry)) addViolation('Нарушено запрещённое время', 'Занятие стоит в запрещённом слоте.');
          break;
        case RuleAction.RequireTime:
          if (!ruleTimeMatchesEntry(rule, entry)) addViolation('Не выполнено требуемое время', 'Занятие стоит не в требуемом слоте.');
          break;
        case RuleAction.PreferTime:
          if (!ruleTimeMatchesEntry(rule, entry)) addViolation('Предпочтение времени не выполнено', 'Занятие стоит в менее желательном слоте.', 'info');
          break;
        case RuleAction.AvoidDay:
          if (!rule.day || rule.day === entry.day) addViolation('Нарушен запрещённый день', 'Занятие стоит в нежелательном дне.');
          break;
        case RuleAction.RequireDay:
          if (rule.day && rule.day !== entry.day) addViolation('Не выполнен требуемый день', 'Занятие стоит в другом дне.');
          break;
        case RuleAction.AvoidTimeRange:
          if (ruleTimeRangeMatchesEntry(rule, entry)) addViolation('Нарушен запрещённый диапазон', 'Занятие попало в запрещённый диапазон времени.');
          break;
        case RuleAction.RequireTimeRange:
          if (!ruleTimeRangeMatchesEntry(rule, entry)) addViolation('Не выполнен требуемый диапазон', 'Занятие стоит вне требуемого диапазона.');
          break;
        case RuleAction.RequireClassroomType: {
          const classroom = classrooms.find(item => item.id === entry.classroomId);
          const targetIds = ruleTargetIds(rule, 'classroomType');
          if (targetIds.length && (!classroom || !targetIds.includes(classroom.typeId))) addViolation('Неверный тип аудитории', 'Аудитория не соответствует требуемому типу.');
          break;
        }
        case RuleAction.AvoidClassroomType: {
          const classroom = classrooms.find(item => item.id === entry.classroomId);
          const targetIds = ruleTargetIds(rule, 'classroomType');
          if (classroom && targetIds.includes(classroom.typeId)) addViolation('Нежелательный тип аудитории', 'Использован тип аудитории, которого нужно избегать.');
          break;
        }
        case RuleAction.RequireClassroomTag: {
          const classroom = classrooms.find(item => item.id === entry.classroomId);
          const targetIds = ruleTargetIds(rule, 'classroomTag');
          const actual = classroom?.tagIds || [];
          if (targetIds.length && !targetIds.every(id => actual.includes(id))) addViolation('Нет обязательного тега аудитории', 'Аудитория не содержит все требуемые теги.');
          break;
        }
        case RuleAction.AvoidClassroomTag: {
          const classroom = classrooms.find(item => item.id === entry.classroomId);
          const targetIds = ruleTargetIds(rule, 'classroomTag');
          if ((classroom?.tagIds || []).some(id => targetIds.includes(id))) addViolation('Нежелательный тег аудитории', 'Использована аудитория с запрещённым тегом.');
          break;
        }
      }
    });

    if ([RuleAction.MaxPerDay, RuleAction.MinPerDay, RuleAction.MaxConsecutive, RuleAction.AtMostNGaps, RuleAction.AvoidSingleLessonDay, RuleAction.PreferCompactDay, RuleAction.SpreadAcrossWeek].includes(rule.action)) {
      const buckets = new Map<string, ScheduleEntry[]>();
      matchingEntries.forEach(entry => {
        const key = `${entry.date || entry.day}::${rule.conditions.map(condition => condition.entityIds.join(',')).join('|')}`;
        buckets.set(key, [...(buckets.get(key) || []), entry]);
      });
      buckets.forEach(entries => {
        const first = entries[0];
        const subject = subjects.find(item => item.id === first.subjectId)?.name || first.subjectId;
        const count = entries.length;
        const indices = entries.map(entry => slotIndexOf(timeSlots, entry.timeSlotId));
        if (rule.action === RuleAction.MaxPerDay && rule.param !== undefined && count > rule.param) {
          diagnostics.push({ level: rule.severity === RuleSeverity.Strict ? 'error' : 'warning', title: 'Превышен дневной лимит', detail: `${first.date || first.day}: ${count} пар при лимите ${rule.param}.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.MinPerDay && rule.param !== undefined && count < rule.param) {
          diagnostics.push({ level: 'info', title: 'Не набран дневной минимум', detail: `${first.date || first.day}: ${count} пар при цели ${rule.param}.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.MaxConsecutive && rule.param !== undefined && getMaxConsecutiveCount(indices) > rule.param) {
          diagnostics.push({ level: rule.severity === RuleSeverity.Strict ? 'error' : 'warning', title: 'Слишком много пар подряд', detail: `${first.date || first.day}: подряд больше ${rule.param}.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.AtMostNGaps && rule.param !== undefined && getGapCount(indices) > rule.param) {
          diagnostics.push({ level: rule.severity === RuleSeverity.Strict ? 'error' : 'warning', title: 'Слишком много окон', detail: `${first.date || first.day}: окон больше ${rule.param}.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.AvoidSingleLessonDay && count === 1) {
          diagnostics.push({ level: 'warning', title: 'Одиночная пара', detail: `${first.date || first.day}: осталась одна пара (${subject}).`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.PreferCompactDay && getGapCount(indices) > 0) {
          diagnostics.push({ level: 'info', title: 'День не компактный', detail: `${first.date || first.day}: есть окна, можно уплотнить.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.SpreadAcrossWeek && count > 1) {
          diagnostics.push({ level: 'info', title: 'Концентрация в одном дне', detail: `${first.date || first.day}: ${count} занятий попали в один день.`, ruleId: rule.id });
        }
      });
    }

    if ([RuleAction.MaxPerWeek, RuleAction.MinPerWeek].includes(rule.action)) {
      const weekBuckets = new Map<string, ScheduleEntry[]>();
      matchingEntries.forEach(entry => {
        const key = `${getWeekKey(entry.date)}::${rule.conditions.map(condition => condition.entityIds.join(',')).join('|')}`;
        weekBuckets.set(key, [...(weekBuckets.get(key) || []), entry]);
      });
      weekBuckets.forEach(entries => {
        if (rule.action === RuleAction.MaxPerWeek && rule.param !== undefined && entries.length > rule.param) {
          diagnostics.push({ level: rule.severity === RuleSeverity.Strict ? 'error' : 'warning', title: 'Превышен недельный лимит', detail: `${entries[0].date}: ${entries.length} пар при лимите ${rule.param}.`, ruleId: rule.id });
        }
        if (rule.action === RuleAction.MinPerWeek && rule.param !== undefined && entries.length < rule.param) {
          diagnostics.push({ level: 'info', title: 'Не набран недельный минимум', detail: `${entries[0].date}: ${entries.length} пар при цели ${rule.param}.`, ruleId: rule.id });
        }
      });
    }

    return diagnostics;
  };

  const diagnostics = useMemo(() => [
    ...schedulingRules.flatMap(validateRule),
    ...findRuleConflicts(schedulingRules),
  ], [schedulingRules, entityOptions]);

  const auditDiagnostics = useMemo(() => schedulingRules.flatMap(auditRuleOnSchedule).slice(0, 250), [schedulingRules, schedule, timeSlots, classrooms, groups, teachers]);

  const selectedRule = schedulingRules.find(rule => rule.id === selectedRuleId) || null;
  const selectedPreview = useMemo(() => {
    if (!selectedRule) return null;
    const planned = schedule.filter(entry => ruleAppliesToEntry(selectedRule, entry));
    const candidates = unscheduledEntries.filter(entry => ruleAppliesToEntry(selectedRule, entry));
    const selectedDiagnostics = diagnostics.filter(item => item.ruleId === selectedRule.id);
    const selectedAudit = auditDiagnostics.filter(item => item.ruleId === selectedRule.id);
    return { planned, candidates, diagnostics: selectedDiagnostics, audit: selectedAudit };
  }, [selectedRule, schedule, unscheduledEntries, diagnostics, auditDiagnostics]);

  const filteredRules = useMemo(() => schedulingRules.filter(rule => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query ||
      rule.description.toLowerCase().includes(query) ||
      rule.action.toLowerCase().includes(query) ||
      formatRule(rule).toLowerCase().includes(query);
    const matchesCategory = categoryFilter === 'all' || (rule.category || 'custom') === categoryFilter;
    return matchesSearch && matchesCategory;
  }), [schedulingRules, search, categoryFilter, timeSlots, entityOptions]);

  const stats = useMemo(() => {
    const active = schedulingRules.filter(ruleEnabled);
    const errors = diagnostics.filter(item => item.level === 'error').length;
    const warnings = diagnostics.filter(item => item.level === 'warning').length;
    const auditErrors = auditDiagnostics.filter(item => item.level === 'error').length;
    const auditWarnings = auditDiagnostics.filter(item => item.level === 'warning').length;
    const health = Math.max(0, Math.round(100 - errors * 14 - warnings * 5 - auditErrors * 8 - auditWarnings * 3));
    return {
      active: active.length,
      disabled: schedulingRules.length - active.length,
      strict: active.filter(rule => rule.severity === RuleSeverity.Strict).length,
      templates: RULE_TEMPLATES.length,
      errors,
      warnings,
      auditErrors,
      auditWarnings,
      health,
    };
  }, [schedulingRules, diagnostics, auditDiagnostics]);

  const openAddModal = () => {
    setCurrentItem(null);
    setDraftRule(null);
    setIsModalOpen(true);
  };

  const openTemplate = (template: RuleTemplate) => {
    setCurrentItem(null);
    setDraftRule(template.rule);
    setIsModalOpen(true);
  };

  const handleDuplicate = (rule: SchedulingRule) => {
    const { id: _id, ...copy } = rule;
    setCurrentItem(null);
    setDraftRule({ ...copy, description: `${rule.description} (копия)` });
    setIsModalOpen(true);
  };

  const handleSave = (item: Omit<SchedulingRule, 'id'> | SchedulingRule) => {
    const normalized = {
      ...item,
      enabled: item.enabled !== false,
      category: item.category || 'custom',
      conditions: item.conditions || [],
      logicalOperators: item.logicalOperators || [],
    };
    if ('id' in normalized && normalized.id) {
      updateItem('schedulingRules', normalized as SchedulingRule);
      setSelectedRuleId(normalized.id);
    } else {
      const created = addItem('schedulingRules', normalized);
      setSelectedRuleId(created.id);
    }
    setIsModalOpen(false);
  };

  const toggleRule = (rule: SchedulingRule) => {
    updateItem('schedulingRules', { ...rule, enabled: rule.enabled === false });
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить это правило?')) {
      deleteItem('schedulingRules', id);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Валидация расписания</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Правила, предпросмотр и отчёт нарушений</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Раздел показывает, какие правила действуют, где они конфликтуют, какие занятия затрагивают и что уже нарушено в текущей сетке.
            </p>
          </div>
          <button onClick={openAddModal} className={primaryButtonClass}>
            <PlusIcon className="h-5 w-5" />
            Добавить правило
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <Metric label="Здоровье" value={`${stats.health}%`} tone={stats.health > 80 ? 'green' : stats.health > 55 ? 'yellow' : 'red'} />
          <Metric label="Активных" value={stats.active} tone="blue" />
          <Metric label="Строгих" value={stats.strict} tone="red" />
          <Metric label="Отключено" value={stats.disabled} tone="gray" />
          <Metric label="Ошибок правил" value={stats.errors} tone={stats.errors ? 'red' : 'green'} />
          <Metric label="Предупрежд." value={stats.warnings} tone={stats.warnings ? 'yellow' : 'green'} />
          <Metric label="Нарушений" value={stats.auditErrors + stats.auditWarnings} tone={stats.auditErrors ? 'red' : stats.auditWarnings ? 'yellow' : 'green'} />
          <Metric label="Шаблонов" value={stats.templates} tone="blue" />
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {([
          ['overview', 'Обзор'],
          ['rules', 'Правила'],
          ['templates', 'Шаблоны'],
          ['audit', 'Отчёт'],
        ] as [RuleTab, string][]).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Panel title="Мастер обзора правил" icon={<SparklesIcon className="h-5 w-5" />}>
            <div className="space-y-4">
              <ReviewStep done={stats.errors === 0} title="Структура правил" detail={stats.errors ? `Нужно исправить ошибок: ${stats.errors}` : 'Все правила имеют условия и обязательные параметры.'} />
              <ReviewStep done={stats.warnings === 0} title="Качество настройки" detail={stats.warnings ? `Есть предупреждения: ${stats.warnings}` : 'Нет явных слабых мест в настройке.'} />
              <ReviewStep done={stats.auditErrors === 0} title="Текущая сетка" detail={stats.auditErrors ? `Строгих нарушений в расписании: ${stats.auditErrors}` : 'Строгие правила текущей сеткой не нарушены.'} />
              <ReviewStep done={stats.active > 0} title="Покрытие правил" detail={stats.active ? `Активных правил: ${stats.active}` : 'Правил пока нет: начните с шаблонов.'} />
            </div>
          </Panel>

          <Panel title="Ближайшие проблемы" icon={<AlertIcon className="h-5 w-5" />}>
            <DiagnosticList diagnostics={[...diagnostics, ...auditDiagnostics].slice(0, 8)} emptyText="Критичных замечаний не найдено." />
          </Panel>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title="База правил" icon={<CheckCircleIcon className="h-5 w-5" />}>
            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px]">
              <input value={search} onChange={event => setSearch(event.target.value)} className={defaultInputClass} placeholder="Поиск по описанию, действию или условиям" />
              <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value as RuleCategory | 'all')} className={defaultInputClass}>
                <option value="all">Все категории</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-3">
              {filteredRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  active={rule.id === selectedRuleId}
                  summary={formatRule(rule)}
                  diagnostics={diagnostics.filter(item => item.ruleId === rule.id)}
                  onSelect={() => setSelectedRuleId(rule.id)}
                  onToggle={() => toggleRule(rule)}
                  onEdit={() => { setCurrentItem(rule); setDraftRule(null); setIsModalOpen(true); }}
                  onDuplicate={() => handleDuplicate(rule)}
                  onDelete={() => handleDeleteItem(rule.id)}
                />
              ))}
              {filteredRules.length === 0 && <EmptyState text="Правила не найдены. Измените фильтр или добавьте новое правило." />}
            </div>
          </Panel>

          <Panel title="Предпросмотр правила" icon={<ClockIcon className="h-5 w-5" />}>
            {selectedRule && selectedPreview ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selectedRule.description || 'Без описания'}</p>
                  <p className="mt-1 text-sm text-gray-600">{selectedRule.action}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="В расписании" value={selectedPreview.planned.length} tone="blue" />
                  <Metric label="В нераспр." value={selectedPreview.candidates.length} tone="gray" />
                  <Metric label="Замечаний" value={selectedPreview.diagnostics.length} tone={selectedPreview.diagnostics.length ? 'yellow' : 'green'} />
                  <Metric label="Нарушений" value={selectedPreview.audit.length} tone={selectedPreview.audit.some(item => item.level === 'error') ? 'red' : selectedPreview.audit.length ? 'yellow' : 'green'} />
                </div>
                <DiagnosticList diagnostics={[...selectedPreview.diagnostics, ...selectedPreview.audit].slice(0, 8)} emptyText="Для выбранного правила замечаний нет." />
                <AffectedEntries entries={selectedPreview.planned.slice(0, 8)} subjects={subjects} groups={groups} />
              </div>
            ) : (
              <EmptyState text="Выберите правило, чтобы увидеть предпросмотр." />
            )}
          </Panel>
        </div>
      )}

      {activeTab === 'templates' && (
        <Panel title="Шаблоны правил" icon={<SparklesIcon className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {RULE_TEMPLATES.map(template => (
              <button key={template.id} onClick={() => openTemplate(template)} className="rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-blue-300 hover:bg-blue-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{template.group}</p>
                    <h3 className="mt-1 font-semibold text-gray-900">{template.title}</h3>
                  </div>
                  <PlusIcon className="h-5 w-5 text-blue-600" />
                </div>
                <p className="mt-3 text-sm text-gray-600">{template.description}</p>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {activeTab === 'audit' && (
        <Panel title="Отчёт по текущему расписанию" icon={<AlertIcon className="h-5 w-5" />}>
          <DiagnosticList diagnostics={auditDiagnostics} emptyText="Текущее расписание не нарушает активные правила." />
        </Panel>
      )}

      {isModalOpen && (
        <RuleModal
          item={currentItem}
          draft={draftRule}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          entityOptions={entityOptions}
          timeSlots={timeSlots}
        />
      )}
    </div>
  );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; tone: 'blue' | 'green' | 'yellow' | 'red' | 'gray' }> = ({ label, value, tone }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    yellow: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    gray: 'bg-gray-50 text-gray-700 border-gray-100',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
};

const Panel: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center gap-2 text-gray-900">
      {icon}
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
    {children}
  </section>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">{text}</div>
);

const ReviewStep: React.FC<{ done: boolean; title: string; detail: string }> = ({ done, title, detail }) => (
  <div className="flex gap-3 rounded-lg border border-gray-200 p-4">
    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
      {done ? <CheckCircleIcon className="h-5 w-5" /> : <AlertIcon className="h-5 w-5" />}
    </div>
    <div>
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{detail}</p>
    </div>
  </div>
);

const DiagnosticList: React.FC<{ diagnostics: RuleDiagnostic[]; emptyText: string }> = ({ diagnostics, emptyText }) => {
  if (diagnostics.length === 0) return <EmptyState text={emptyText} />;
  const tone = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  };
  return (
    <div className="space-y-2">
      {diagnostics.map((diagnostic, index) => (
        <div key={`${diagnostic.title}-${index}`} className={`rounded-md border p-3 text-sm ${tone[diagnostic.level]}`}>
          <p className="font-semibold">{diagnostic.title}</p>
          <p className="mt-1 opacity-90">{diagnostic.detail}</p>
        </div>
      ))}
    </div>
  );
};

const RuleCard: React.FC<{
  rule: SchedulingRule;
  active: boolean;
  summary: string;
  diagnostics: RuleDiagnostic[];
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}> = ({ rule, active, summary, diagnostics, onSelect, onToggle, onEdit, onDuplicate, onDelete }) => {
  const hasErrors = diagnostics.some(item => item.level === 'error');
  const hasWarnings = diagnostics.some(item => item.level === 'warning');
  return (
    <div className={`rounded-lg border p-4 ${active ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${SEVERITY_BADGES[rule.severity]}`}>{rule.severity.split(' ')[0]}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{CATEGORY_LABELS[rule.category || 'custom']}</span>
            {rule.enabled === false && <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600">Отключено</span>}
            {hasErrors && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Ошибка</span>}
            {!hasErrors && hasWarnings && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Проверить</span>}
          </div>
          <h4 className="mt-3 font-semibold text-gray-900">{rule.description || 'Правило без описания'}</h4>
          <p className="mt-1 text-sm text-gray-600">{rule.action}</p>
          <p className="mt-2 text-sm text-gray-500">{summary}</p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onToggle} className={compactButtonClass}>{rule.enabled === false ? 'Вкл.' : 'Выкл.'}</button>
          <IconButton label="Редактировать" onClick={onEdit}><EditIcon className="h-5 w-5" /></IconButton>
          <IconButton label="Копировать" onClick={onDuplicate}><CopyIcon className="h-5 w-5" /></IconButton>
          <IconButton label="Удалить" onClick={onDelete} danger><TrashIcon className="h-5 w-5" /></IconButton>
        </div>
      </div>
    </div>
  );
};

const IconButton: React.FC<{ label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ label, onClick, danger, children }) => (
  <button title={label} aria-label={label} onClick={onClick} className={`rounded-md p-2 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}>
    {children}
  </button>
);

const AffectedEntries: React.FC<{ entries: ScheduleEntry[]; subjects: { id: string; name: string }[]; groups: Group[] }> = ({ entries, subjects, groups }) => {
  if (!entries.length) return <EmptyState text="В текущей сетке пока нет занятий, подходящих под это правило." />;
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-800">Первые затронутые занятия</p>
      <div className="space-y-2">
        {entries.map(entry => {
          const subject = subjects.find(item => item.id === entry.subjectId)?.name || entry.subjectId;
          const groupNames = getEntryGroupIds(entry).map(id => groups.find(group => group.id === id)?.number || id).join(', ');
          return (
            <div key={entry.id} className="rounded-md border border-gray-200 p-3 text-sm">
              <p className="font-medium text-gray-900">{subject}</p>
              <p className="text-gray-500">{groupNames || 'без группы'} · {entry.date || entry.day} · {entry.classType}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RuleModal: React.FC<{
  item: SchedulingRule | null;
  draft: Partial<SchedulingRule> | null;
  onClose: () => void;
  onSave: (item: Omit<SchedulingRule, 'id'> | SchedulingRule) => void;
  entityOptions: Record<RuleEntityType, { id: string; name: string }[]>;
  timeSlots: TimeSlot[];
}> = ({ item, draft, onClose, onSave, entityOptions, timeSlots }) => {
  const [formData, setFormData] = useState<Partial<SchedulingRule>>({});

  useEffect(() => {
    if (item) {
      setFormData({ ...item, enabled: item.enabled !== false });
    } else {
      setFormData({
        description: '',
        enabled: true,
        category: 'custom',
        severity: RuleSeverity.Medium,
        action: RuleAction.MaxPerDay,
        conditions: [{ entityType: 'teacher', entityIds: [] }],
        logicalOperators: [],
        param: 3,
        ...draft,
      });
    }
  }, [item, draft]);

  const update = (patch: Partial<SchedulingRule>) => setFormData(prev => ({ ...prev, ...patch }));

  const updateScope = (patch: Partial<RuleScope>) => setFormData(prev => ({ ...prev, scope: { ...(prev.scope || {}), ...patch } }));

  const handleConditionChange = (index: number, condition: RuleCondition) => {
    const conditions = [...(formData.conditions || [])];
    conditions[index] = condition;
    update({ conditions });
  };

  const addCondition = () => {
    update({
      conditions: [...(formData.conditions || []), { entityType: 'teacher', entityIds: [] }],
      logicalOperators: [...(formData.logicalOperators || []), 'AND'],
    });
  };

  const removeCondition = (index: number) => {
    const conditions = [...(formData.conditions || [])];
    const logicalOperators = [...(formData.logicalOperators || [])];
    if (conditions.length <= 1) return;
    conditions.splice(index, 1);
    logicalOperators.splice(Math.max(0, index - 1), 1);
    update({ conditions, logicalOperators });
  };

  const updateOperator = (index: number, operator: RuleLogicalOperator) => {
    const logicalOperators = [...(formData.logicalOperators || [])];
    logicalOperators[index] = operator;
    update({ logicalOperators });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({
      ...formData,
      description: formData.description || 'Новое правило',
      enabled: formData.enabled !== false,
      conditions: formData.conditions || [],
      logicalOperators: formData.logicalOperators || [],
    } as SchedulingRule);
  };

  const action = formData.action as RuleAction;
  const targetType: RuleEntityType | null =
    [RuleAction.RequireClassroomType, RuleAction.PreferClassroomType, RuleAction.AvoidClassroomType].includes(action) ? 'classroomType' :
      [RuleAction.RequireClassroomTag, RuleAction.PreferClassroomTag, RuleAction.AvoidClassroomTag].includes(action) ? 'classroomTag' : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{item ? 'Редактировать правило' : 'Новое правило'}</h2>
              <p className="text-sm text-gray-500">Настройте область действия, условия и проверку расписания.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={compactButtonClass}>Отмена</button>
              <button type="submit" className={primaryButtonClass}>Сохранить</button>
            </div>
          </div>

          <div className="grid gap-6 p-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">Основное</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Описание</span>
                    <input value={formData.description || ''} onChange={event => update({ description: event.target.value })} className={defaultInputClass} placeholder="Например: у первого курса не больше 4 пар в день" />
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-gray-700">Категория</span>
                    <select value={formData.category || 'custom'} onChange={event => update({ category: event.target.value as RuleCategory })} className={defaultInputClass}>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-sm font-medium text-gray-700">Важность</span>
                    <select value={formData.severity} onChange={event => update({ severity: event.target.value as RuleSeverity })} className={defaultInputClass}>
                      {Object.values(RuleSeverity).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Действие</span>
                    <select value={formData.action} onChange={event => update({ action: event.target.value as RuleAction })} className={defaultInputClass}>
                      {Object.values(RuleAction).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input type="checkbox" checked={formData.enabled !== false} onChange={event => update({ enabled: event.target.checked })} />
                    Правило включено
                  </label>
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Условия</h3>
                  <button type="button" onClick={addCondition} className={compactButtonClass}><PlusIcon className="h-4 w-4" />Добавить</button>
                </div>
                <div className="mt-4 space-y-3">
                  {(formData.conditions || []).map((condition, index) => (
                    <React.Fragment key={index}>
                      {index > 0 && (
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-gray-200" />
                          <select value={formData.logicalOperators?.[index - 1] || 'AND'} onChange={event => updateOperator(index - 1, event.target.value as RuleLogicalOperator)} className="rounded-md border border-gray-300 px-3 py-1 text-sm">
                            <option value="AND">И</option>
                            <option value="OR">ИЛИ</option>
                          </select>
                          <div className="h-px flex-1 bg-gray-200" />
                        </div>
                      )}
                      <RuleConditionEditor
                        condition={condition}
                        entityOptions={entityOptions}
                        onChange={updated => handleConditionChange(index, updated)}
                        onRemove={() => removeCondition(index)}
                        canRemove={(formData.conditions || []).length > 1}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">Параметры действия</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {DAY_ACTIONS.has(action) && (
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700">День</span>
                      <select value={formData.day || ''} onChange={event => update({ day: event.target.value || undefined })} className={defaultInputClass}>
                        <option value="">Любой день</option>
                        {DAYS_OF_WEEK.map(day => <option key={day} value={day}>{day}</option>)}
                      </select>
                    </label>
                  )}
                  {EXACT_TIME_ACTIONS.has(action) && (
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700">Слот</span>
                      <select value={formData.timeSlotId || ''} onChange={event => update({ timeSlotId: event.target.value || undefined })} className={defaultInputClass}>
                        <option value="">Не выбран</option>
                        {timeSlots.map(slot => <option key={slot.id} value={slot.id}>{slot.time}</option>)}
                      </select>
                    </label>
                  )}
                  {RANGE_TIME_ACTIONS.has(action) && (
                    <>
                      <label>
                        <span className="mb-1 block text-sm font-medium text-gray-700">Начало диапазона</span>
                        <select value={formData.startTimeSlotId || ''} onChange={event => update({ startTimeSlotId: event.target.value || undefined })} className={defaultInputClass}>
                          <option value="">С начала дня</option>
                          {timeSlots.map(slot => <option key={slot.id} value={slot.id}>{slot.time}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="mb-1 block text-sm font-medium text-gray-700">Конец диапазона</span>
                        <select value={formData.endTimeSlotId || ''} onChange={event => update({ endTimeSlotId: event.target.value || undefined })} className={defaultInputClass}>
                          <option value="">До конца дня</option>
                          {timeSlots.map(slot => <option key={slot.id} value={slot.id}>{slot.time}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  {PARAM_ACTIONS.has(action) && (
                    <label>
                      <span className="mb-1 block text-sm font-medium text-gray-700">Параметр N</span>
                      <input type="number" min="0" value={formData.param ?? ''} onChange={event => update({ param: Number(event.target.value) })} className={defaultInputClass} />
                    </label>
                  )}
                  {targetType && (
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-medium text-gray-700">{targetType === 'classroomType' ? 'Целевые типы аудиторий' : 'Целевые теги аудиторий'}</span>
                      <select multiple value={formData.targetIds || []} onChange={event => update({ targetIds: Array.from(event.target.selectedOptions, (option: HTMLOptionElement) => option.value) })} className={`${defaultInputClass} h-28`}>
                        {entityOptions[targetType].map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                      </select>
                    </label>
                  )}
                  {!DAY_ACTIONS.has(action) && !EXACT_TIME_ACTIONS.has(action) && !RANGE_TIME_ACTIONS.has(action) && !PARAM_ACTIONS.has(action) && !targetType && (
                    <p className="md:col-span-2 text-sm text-gray-500">Для этого действия дополнительные параметры не обязательны.</p>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">Область действия</h3>
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-gray-600">С даты</span>
                      <input type="date" value={formData.scope?.startDate || ''} onChange={event => updateScope({ startDate: event.target.value || undefined })} className={defaultInputClass} />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-gray-600">По дату</span>
                      <input type="date" value={formData.scope?.endDate || ''} onChange={event => updateScope({ endDate: event.target.value || undefined })} className={defaultInputClass} />
                    </label>
                  </div>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">Неделя</span>
                    <select value={formData.scope?.weekType || 'any'} onChange={event => updateScope({ weekType: event.target.value as RuleScope['weekType'] })} className={defaultInputClass}>
                      <option value="any">Любая</option>
                      <option value="even">Чётная</option>
                      <option value="odd">Нечётная</option>
                      <option value="every">Каждая</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-gray-600">Курс</span>
                      <input type="number" min="1" max="6" value={formData.scope?.course || ''} onChange={event => updateScope({ course: event.target.value ? Number(event.target.value) : undefined })} className={defaultInputClass} />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs font-medium text-gray-600">Семестр</span>
                      <input type="number" min="1" max="12" value={formData.scope?.semester || ''} onChange={event => updateScope({ semester: event.target.value ? Number(event.target.value) : undefined })} className={defaultInputClass} />
                    </label>
                  </div>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">Форма обучения</span>
                    <select value={formData.scope?.formOfStudy || 'any'} onChange={event => updateScope({ formOfStudy: event.target.value as RuleScope['formOfStudy'] })} className={defaultInputClass}>
                      <option value="any">Любая</option>
                      {Object.values(FormOfStudy).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-gray-600">Смена</span>
                    <select value={formData.scope?.shift || 'any'} onChange={event => updateScope({ shift: event.target.value as RuleScope['shift'] })} className={defaultInputClass}>
                      <option value="any">Любая</option>
                      {STUDY_SHIFT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                  </label>
                  <ScopeMulti label="Кафедры" values={formData.scope?.departmentIds || []} options={entityOptions.department} onChange={departmentIds => updateScope({ departmentIds })} />
                  <ScopeMulti label="Специальности" values={formData.scope?.specialtyIds || []} options={entityOptions.specialty} onChange={specialtyIds => updateScope({ specialtyIds })} />
                  <ScopeMulti label="Типы аудиторий" values={formData.scope?.classroomTypeIds || []} options={entityOptions.classroomType} onChange={classroomTypeIds => updateScope({ classroomTypeIds })} />
                  <ScopeMulti label="Потоки" values={formData.scope?.streamIds || []} options={entityOptions.stream} onChange={streamIds => updateScope({ streamIds })} />
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">Комментарий</h3>
                <textarea value={formData.notes || ''} onChange={event => update({ notes: event.target.value })} className={`${defaultInputClass} mt-3 h-28`} placeholder="Что методисту важно помнить об этом правиле" />
              </section>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
};

const RuleConditionEditor: React.FC<{
  condition: RuleCondition;
  entityOptions: Record<RuleEntityType, { id: string; name: string }[]>;
  canRemove: boolean;
  onChange: (condition: RuleCondition) => void;
  onRemove: () => void;
}> = ({ condition, entityOptions, canRemove, onChange, onRemove }) => {
  const options = entityOptions[condition.entityType] || [];
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600">Сущность</span>
          <select value={condition.entityType} onChange={event => onChange({ entityType: event.target.value as RuleEntityType, entityIds: [] })} className={defaultInputClass}>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-gray-600">Значения</span>
          <select multiple value={condition.entityIds} onChange={event => onChange({ ...condition, entityIds: Array.from(event.target.selectedOptions, (option: HTMLOptionElement) => option.value) })} className={`${defaultInputClass} h-24`}>
            {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        {canRemove && (
          <button type="button" onClick={onRemove} className="self-end rounded-md p-2 text-red-600 hover:bg-red-50" title="Удалить условие">
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      {condition.entityType === 'subject' && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-gray-600">Уточнить тип занятия</span>
          <select value={condition.classType || ''} onChange={event => onChange({ ...condition, classType: event.target.value ? event.target.value as ClassType : undefined })} className={defaultInputClass}>
            <option value="">Любой тип</option>
            {Object.values(ClassType).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      )}
    </div>
  );
};

const ScopeMulti: React.FC<{
  label: string;
  values: string[];
  options: { id: string; name: string }[];
  onChange: (values: string[]) => void;
}> = ({ label, values, options, onChange }) => (
  <label>
    <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
    <select multiple value={values} onChange={event => onChange(Array.from(event.target.selectedOptions, (option: HTMLOptionElement) => option.value))} className={`${defaultInputClass} h-24`}>
      {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>
  </label>
);

export default RuleManager;
