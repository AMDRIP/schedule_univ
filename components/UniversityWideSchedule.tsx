import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useDrag, useDrop } from 'react-dnd';
import { DAYS_OF_WEEK, ItemTypes } from '../constants';
import { useStore } from '../hooks/useStore';
import { AvailabilityType, ClassType, FormOfStudy, Group, ScheduleEntry, TimeSlot, UnscheduledEntry } from '../types';
import { getWeekDays, getWeekType, toYYYYMMDD } from '../utils/dateUtils';
import { areGroupsCompatibleWithTimeSlot, getTimeSlotShiftLabel } from '../utils/shiftUtils';
import DatePicker from './DatePicker';
import UnscheduledDeck from './UnscheduledDeck';
import {
  AlertIcon,
  ChevronDownIcon,
  DocumentDownloadIcon,
  DocumentSearchIcon,
  EditIcon,
  SparklesIcon,
  TrashIcon,
} from './icons';

interface UniversityWideScheduleProps {
  setViewDate: (date: string) => void;
  setActiveView: (view: string) => void;
}

type PrimaryView = 'group' | 'teacher' | 'classroom' | 'stream';
type CellKey = string;

interface AxisItem {
  id: string;
  label: string;
  sublabel?: string;
  course?: number;
}

interface TimeColumn {
  id: string;
  date: string;
  dayName: string;
  dayLabel: string;
  slot: TimeSlot;
}

interface CellIssue {
  type: 'teacher' | 'group' | 'classroom' | 'availability' | 'capacity' | 'roomType' | 'shift' | 'stack';
  label: string;
  severity: 'error' | 'warning';
}

const controlClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700';

const getEntryGroupIds = (entry: Pick<ScheduleEntry | UnscheduledEntry, 'groupId' | 'groupIds'>) =>
  entry.groupIds?.length ? entry.groupIds : entry.groupId ? [entry.groupId] : [];

const getEntryConcreteDate = (entry: ScheduleEntry, weekDays: Date[]) => {
  if (entry.date) return entry.date;
  const dayIndex = DAYS_OF_WEEK.indexOf(entry.day);
  if (dayIndex < 0) return '';
  return toYYYYMMDD(weekDays[dayIndex]);
};

const getSlotIndex = (timeSlots: TimeSlot[], slotId: string) => timeSlots.findIndex(slot => slot.id === slotId);

const makeCellKey = (axisId: string, date: string, timeSlotId: string) => `${axisId}::${date}::${timeSlotId}`;

const downloadBlob = (content: string, fileName: string, type: string) => {
  const blob = new Blob([content], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const DraggableEntryCard: React.FC<{
  entry: ScheduleEntry;
  compact?: boolean;
  issues?: CellIssue[];
  onOpen: () => void;
}> = ({ entry, compact, issues = [], onOpen }) => {
  const { subjects, teachers, classrooms, streams, groups } = useStore();
  const subject = subjects.find(subjectItem => subjectItem.id === entry.subjectId);
  const teacher = teachers.find(teacherItem => teacherItem.id === entry.teacherId);
  const classroom = classrooms.find(classroomItem => classroomItem.id === entry.classroomId);
  const stream = entry.streamId ? streams.find(streamItem => streamItem.id === entry.streamId) : undefined;
  const groupNames = getEntryGroupIds(entry).map(groupId => groups.find(group => group.id === groupId)?.number || groupId).join(', ');

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SCHEDULE_ENTRY,
    item: entry,
    collect: monitor => ({ isDragging: !!monitor.isDragging() }),
  }), [entry]);

  const hasError = issues.some(issue => issue.severity === 'error');
  const hasWarning = issues.some(issue => issue.severity === 'warning');
  const tone = hasError ? 'border-red-300 bg-red-50' : hasWarning ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50';

  return (
    <button
      ref={drag as any}
      onClick={event => {
        event.stopPropagation();
        onOpen();
      }}
      className={`w-full cursor-grab rounded-md border p-1.5 text-left text-xs shadow-sm transition ${tone} ${isDragging ? 'opacity-40' : ''}`}
      title={`${subject?.name || entry.subjectId}\n${teacher?.name || entry.teacherId}\n${classroom?.number || entry.classroomId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-gray-900">{subject?.name || entry.subjectId}</p>
        {issues.length > 0 && <AlertIcon className={`h-4 w-4 shrink-0 ${hasError ? 'text-red-600' : 'text-amber-600'}`} />}
      </div>
      {!compact && (
        <>
          <p className="truncate text-gray-700">{entry.classType}{stream ? ` · ${stream.name}` : ''}</p>
          <p className="truncate text-gray-600">{teacher?.name || entry.teacherId}</p>
          <p className="truncate font-medium text-gray-600">Ауд. {classroom?.number || entry.classroomId}{groupNames ? ` · ${groupNames}` : ''}</p>
        </>
      )}
    </button>
  );
};

const SummaryCell: React.FC<{
  axisItem: AxisItem;
  column: TimeColumn;
  entries: ScheduleEntry[];
  issues: CellIssue[];
  compactMode: boolean;
  canDropItem: (item: UnscheduledEntry | ScheduleEntry) => boolean;
  onDropEntry: (item: UnscheduledEntry | ScheduleEntry) => void;
  onOpen: () => void;
}> = ({ axisItem, column, entries, issues, compactMode, canDropItem, onDropEntry, onOpen }) => {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.SCHEDULE_ENTRY, ItemTypes.UNSCHEDULED_ENTRY],
    canDrop: (item: UnscheduledEntry | ScheduleEntry) => canDropItem(item),
    drop: (item: UnscheduledEntry | ScheduleEntry) => onDropEntry(item),
    collect: monitor => ({ isOver: !!monitor.isOver(), canDrop: !!monitor.canDrop() }),
  }), [canDropItem, onDropEntry]);

  const hasError = issues.some(issue => issue.severity === 'error');
  const hasWarning = issues.some(issue => issue.severity === 'warning');
  let cellBg = hasError ? 'bg-red-50' : hasWarning ? 'bg-amber-50' : entries.length > 0 ? 'bg-sky-50' : 'bg-white';
  if (isOver) cellBg = canDrop ? 'bg-emerald-100' : 'bg-red-100';

  return (
    <td
      ref={drop as any}
      onClick={onOpen}
      className={`h-28 min-w-[160px] cursor-pointer border align-top transition-colors ${cellBg}`}
    >
      <div className="flex h-full flex-col gap-1 p-1.5">
        {entries.slice(0, 2).map(entry => (
          <DraggableEntryCard key={entry.id} entry={entry} compact={compactMode || entries.length > 2} issues={issues} onOpen={onOpen} />
        ))}
        {entries.length > 2 && (
          <div className="rounded-md border border-slate-200 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">
            +{entries.length - 2} ещё
          </div>
        )}
        {entries.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-gray-300">
            {axisItem.label ? 'Свободно' : ''}
          </div>
        )}
      </div>
    </td>
  );
};

const UniversityWideSchedule: React.FC<UniversityWideScheduleProps> = ({ setViewDate, setActiveView }) => {
  const store = useStore();
  const {
    schedule,
    groups,
    subjects,
    teachers,
    classrooms,
    classroomTypes,
    timeSlots,
    settings,
    streams,
    departments,
    specialties,
    placeItemInGrid,
    removeScheduleEntries,
    productionCalendar,
  } = store;

  const [currentDate, setCurrentDate] = useState(toYYYYMMDD(new Date()));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [primaryView, setPrimaryView] = useState<PrimaryView>('group');
  const [isTransposed, setIsTransposed] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [problemOnly, setProblemOnly] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ axisId: string; columnId: string } | null>(null);
  const [groupSortOrder, setGroupSortOrder] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState({
    query: '',
    departmentId: 'all',
    specialtyId: 'all',
    course: 'all',
    formOfStudy: 'all',
    shift: 'all',
    streamId: 'all',
    teacherId: 'all',
    classroomId: 'all',
    subjectId: 'all',
    classType: 'all',
  });
  const datePickerRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(() => getWeekDays(new Date(currentDate)), [currentDate]);
  const weekStart = useMemo(() => toYYYYMMDD(weekDays[0]), [weekDays]);
  const weekEnd = useMemo(() => toYYYYMMDD(weekDays[5]), [weekDays]);
  const weekType = useMemo(() => getWeekType(new Date(currentDate), new Date(settings.semesterStart)), [currentDate, settings.semesterStart]);
  const effectiveWeekType = settings.useEvenOddWeekSeparation ? weekType : 'every';
  const sortedTimeSlots = useMemo(() => [...timeSlots].sort((a, b) => a.time.localeCompare(b.time)), [timeSlots]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const relevantSchedule = useMemo(() => schedule.filter(entry => {
    if (entry.date) return entry.date >= weekStart && entry.date <= weekEnd;
    return entry.weekType === 'every' || entry.weekType === effectiveWeekType;
  }), [schedule, weekStart, weekEnd, effectiveWeekType]);

  const entriesPassFilters = (entry: ScheduleEntry) => {
    const entryGroupIds = getEntryGroupIds(entry);
    const entryGroups = groups.filter(group => entryGroupIds.includes(group.id));
    const classroom = classrooms.find(item => item.id === entry.classroomId);
    const teacher = teachers.find(item => item.id === entry.teacherId);
    const query = filters.query.trim().toLowerCase();

    if (filters.teacherId !== 'all' && entry.teacherId !== filters.teacherId) return false;
    if (filters.classroomId !== 'all' && entry.classroomId !== filters.classroomId) return false;
    if (filters.subjectId !== 'all' && entry.subjectId !== filters.subjectId) return false;
    if (filters.classType !== 'all' && entry.classType !== filters.classType) return false;
    if (filters.streamId !== 'all' && entry.streamId !== filters.streamId && !entryGroupIds.some(groupId => streams.find(stream => stream.id === filters.streamId)?.groupIds.includes(groupId))) return false;
    if (filters.departmentId !== 'all' && !entryGroups.some(group => group.departmentId === filters.departmentId) && teacher?.departmentId !== filters.departmentId && classroom?.departmentId !== filters.departmentId) return false;
    if (filters.specialtyId !== 'all' && !entryGroups.some(group => group.specialtyId === filters.specialtyId)) return false;
    if (filters.course !== 'all' && !entryGroups.some(group => String(group.course) === filters.course)) return false;
    if (filters.formOfStudy !== 'all' && !entryGroups.some(group => group.formOfStudy === filters.formOfStudy)) return false;
    if (filters.shift !== 'all' && !entryGroups.some(group => group.shift === filters.shift)) return false;
    if (query) {
      const subject = subjects.find(item => item.id === entry.subjectId)?.name || '';
      const teacherName = teacher?.name || '';
      const classroomNumber = classroom?.number || '';
      const groupNames = entryGroups.map(group => group.number).join(' ');
      if (![subject, teacherName, classroomNumber, groupNames, entry.classType].join(' ').toLowerCase().includes(query)) return false;
    }
    return true;
  };

  const filteredSchedule = useMemo(() => relevantSchedule.filter(entriesPassFilters), [relevantSchedule, filters, groups, teachers, classrooms, streams, subjects]);

  const getConcreteDateForEntry = (entry: ScheduleEntry) => getEntryConcreteDate(entry, weekDays);

  const matchesSameConcreteTime = (target: ScheduleEntry, other: ScheduleEntry) => {
    if (target.id === other.id || target.timeSlotId !== other.timeSlotId) return false;
    const targetDate = getConcreteDateForEntry(target);
    const otherDate = getConcreteDateForEntry(other);
    return !!targetDate && targetDate === otherDate;
  };

  const getResourceGroupIds = (entry: ScheduleEntry) => {
    const explicit = getEntryGroupIds(entry);
    if (explicit.length > 0) return explicit;
    return entry.streamId ? streams.find(stream => stream.id === entry.streamId)?.groupIds || [] : [];
  };

  const getEntryIssues = (entry: ScheduleEntry): CellIssue[] => {
    const issues: CellIssue[] = [];
    const entryDate = getConcreteDateForEntry(entry);
    const entryGroups = groups.filter(group => getResourceGroupIds(entry).includes(group.id));
    const classroom = classrooms.find(item => item.id === entry.classroomId);
    const subject = subjects.find(item => item.id === entry.subjectId);
    const teacher = teachers.find(item => item.id === entry.teacherId);
    const sameTime = relevantSchedule.filter(other => matchesSameConcreteTime(entry, other));

    if (sameTime.some(other => other.teacherId === entry.teacherId)) {
      issues.push({ type: 'teacher', label: `Коллизия преподавателя: ${teacher?.name || entry.teacherId}`, severity: 'error' });
    }
    if (sameTime.some(other => other.classroomId === entry.classroomId)) {
      issues.push({ type: 'classroom', label: `Коллизия аудитории: ${classroom?.number || entry.classroomId}`, severity: 'error' });
    }
    const entryGroupSet = new Set(getResourceGroupIds(entry));
    const overlappingGroups = new Set<string>();
    sameTime.forEach(other => getResourceGroupIds(other).forEach(groupId => {
      if (entryGroupSet.has(groupId)) overlappingGroups.add(groupId);
    }));
    if (overlappingGroups.size > 0) {
      issues.push({
        type: 'group',
        label: `Коллизия группы/потока: ${Array.from(overlappingGroups).map(groupId => groups.find(group => group.id === groupId)?.number || groupId).join(', ')}`,
        severity: 'error',
      });
    }

    if (entryDate) {
      const dayName = entry.day;
      const dayInfo = productionCalendar.find(item => item.date === entryDate);
      if (settings.respectProductionCalendar && dayInfo && !dayInfo.isWorkDay) {
        issues.push({ type: 'availability', label: `Нерабочий день: ${dayInfo.name}`, severity: 'error' });
      }
      if (!settings.allowManualOverrideOfForbidden) {
        if (teacher?.availabilityGrid?.[dayName]?.[entry.timeSlotId] === AvailabilityType.Forbidden) {
          issues.push({ type: 'availability', label: 'Преподаватель запрещён в этот слот', severity: 'error' });
        }
        const forbiddenGroup = entryGroups.find(group => group.availabilityGrid?.[dayName]?.[entry.timeSlotId] === AvailabilityType.Forbidden);
        if (forbiddenGroup) {
          issues.push({ type: 'availability', label: `Группа запрещена в этот слот: ${forbiddenGroup.number}`, severity: 'error' });
        }
      }
      if (teacher?.availabilityGrid?.[dayName]?.[entry.timeSlotId] === AvailabilityType.Undesirable ||
        entryGroups.some(group => group.availabilityGrid?.[dayName]?.[entry.timeSlotId] === AvailabilityType.Undesirable)) {
        issues.push({ type: 'availability', label: 'Нежелательный слот по сетке доступности', severity: 'warning' });
      }
    }

    const slot = timeSlots.find(item => item.id === entry.timeSlotId);
    if (slot && !areGroupsCompatibleWithTimeSlot(slot, entryGroups)) {
      issues.push({ type: 'shift', label: `Слот ${getTimeSlotShiftLabel(slot)} не совпадает со сменой группы`, severity: 'warning' });
    }
    const studentCount = entryGroups.reduce((sum, group) => sum + group.studentCount, 0);
    if (classroom && studentCount > classroom.capacity) {
      issues.push({ type: 'capacity', label: `Аудитория мала: ${classroom.capacity} мест на ${studentCount} студентов`, severity: 'error' });
    }
    const requiredTypes = subject?.classroomTypeRequirements?.[entry.classType] || [];
    if (requiredTypes.length > 0 && classroom && !requiredTypes.includes(classroom.typeId)) {
      issues.push({ type: 'roomType', label: 'Тип аудитории не соответствует дисциплине', severity: 'warning' });
    }
    return issues;
  };

  const entryIssues = useMemo(() => {
    const map = new Map<string, CellIssue[]>();
    relevantSchedule.forEach(entry => map.set(entry.id, getEntryIssues(entry)));
    return map;
  }, [relevantSchedule, groups, teachers, classrooms, subjects, streams, productionCalendar, settings, timeSlots, weekDays]);

  const getAxisIdsForEntry = (entry: ScheduleEntry, view: PrimaryView) => {
    if (view === 'group') return getResourceGroupIds(entry);
    if (view === 'teacher') return [entry.teacherId];
    if (view === 'classroom') return [entry.classroomId];
    if (view === 'stream') {
      if (entry.streamId) return [entry.streamId];
      return streams.filter(stream => getResourceGroupIds(entry).some(groupId => stream.groupIds.includes(groupId))).map(stream => stream.id);
    }
    return [];
  };

  const axisItems = useMemo<AxisItem[]>(() => {
    let items: AxisItem[] = [];
    if (primaryView === 'group') {
      items = groups.map(group => ({
        id: group.id,
        label: group.number,
        sublabel: [
          `${group.course} курс`,
          specialties.find(item => item.id === group.specialtyId)?.code,
          group.shift === 'second' ? '2 смена' : group.shift === 'first' ? '1 смена' : undefined,
        ].filter(Boolean).join(' · '),
        course: group.course,
      }));
    } else if (primaryView === 'teacher') {
      items = teachers.map(teacher => ({
        id: teacher.id,
        label: teacher.name,
        sublabel: departments.find(item => item.id === teacher.departmentId)?.name,
      }));
    } else if (primaryView === 'classroom') {
      items = classrooms.map(classroom => ({
        id: classroom.id,
        label: classroom.number,
        sublabel: [
          classroomTypes.find(item => item.id === classroom.typeId)?.name,
          `${classroom.capacity} мест`,
        ].filter(Boolean).join(' · '),
      }));
    } else {
      items = streams.map(stream => ({
        id: stream.id,
        label: stream.name,
        sublabel: stream.groupIds.map(groupId => groups.find(group => group.id === groupId)?.number || groupId).join(', '),
      }));
    }

    const query = filters.query.trim().toLowerCase();
    items = items.filter(item => {
      if (query && !`${item.label} ${item.sublabel || ''}`.toLowerCase().includes(query)) {
        const hasMatchingEntry = filteredSchedule.some(entry => getAxisIdsForEntry(entry, primaryView).includes(item.id));
        if (!hasMatchingEntry) return false;
      }
      if (primaryView === 'group') {
        const group = groups.find(groupItem => groupItem.id === item.id);
        if (!group) return false;
        if (filters.departmentId !== 'all' && group.departmentId !== filters.departmentId) return false;
        if (filters.specialtyId !== 'all' && group.specialtyId !== filters.specialtyId) return false;
        if (filters.course !== 'all' && String(group.course) !== filters.course) return false;
        if (filters.formOfStudy !== 'all' && group.formOfStudy !== filters.formOfStudy) return false;
        if (filters.shift !== 'all' && group.shift !== filters.shift) return false;
        if (filters.streamId !== 'all' && !streams.find(stream => stream.id === filters.streamId)?.groupIds.includes(group.id)) return false;
      }
      if (primaryView === 'teacher' && filters.departmentId !== 'all') {
        const teacher = teachers.find(itemTeacher => itemTeacher.id === item.id);
        if (teacher?.departmentId !== filters.departmentId) return false;
      }
      if (primaryView === 'classroom' && filters.classroomId !== 'all' && item.id !== filters.classroomId) return false;
      if (primaryView === 'stream' && filters.streamId !== 'all' && item.id !== filters.streamId) return false;
      return true;
    });

    return items.sort((a, b) => {
      if (primaryView === 'group') {
        return groupSortOrder === 'asc'
          ? a.label.localeCompare(b.label, undefined, { numeric: true })
          : b.label.localeCompare(a.label, undefined, { numeric: true });
      }
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    });
  }, [primaryView, groups, teachers, classrooms, streams, departments, specialties, classroomTypes, filters, filteredSchedule, groupSortOrder]);

  const columns = useMemo<TimeColumn[]>(() => weekDays.flatMap(day => {
    const date = toYYYYMMDD(day);
    const dayName = DAYS_OF_WEEK[day.getDay() === 0 ? 6 : day.getDay() - 1];
    return sortedTimeSlots.map(slot => ({
      id: `${date}-${slot.id}`,
      date,
      dayName,
      dayLabel: `${dayName}, ${day.getDate()}`,
      slot,
    }));
  }), [weekDays, sortedTimeSlots]);

  const scheduleMap = useMemo<Map<CellKey, ScheduleEntry[]>>(() => {
    const map = new Map<CellKey, ScheduleEntry[]>();
    filteredSchedule.forEach(entry => {
      const date = getConcreteDateForEntry(entry);
      if (!date) return;
      getAxisIdsForEntry(entry, primaryView).forEach(axisId => {
        const key = makeCellKey(axisId, date, entry.timeSlotId);
        map.set(key, [...(map.get(key) || []), entry]);
      });
    });
    return map;
  }, [filteredSchedule, primaryView, weekDays, streams]);

  const getCellEntries = (axisId: string, column: TimeColumn) => scheduleMap.get(makeCellKey(axisId, column.date, column.slot.id)) || [];
  const getCellIssues = (entries: ScheduleEntry[]) => {
    const issues = entries.flatMap(entry => entryIssues.get(entry.id) || []);
    if (entries.length > 1) {
      issues.push({ type: 'stack', label: `В ячейке ${entries.length} занятий`, severity: entries.some(entry => (entryIssues.get(entry.id) || []).some(issue => issue.severity === 'error')) ? 'error' : 'warning' });
    }
    return issues;
  };

  const visibleAxisItems = useMemo(() => {
    if (!problemOnly) return axisItems;
    return axisItems.filter(axisItem => columns.some(column => getCellIssues(getCellEntries(axisItem.id, column)).length > 0));
  }, [problemOnly, axisItems, columns, scheduleMap, entryIssues]);

  const selectedAxis = selectedCell ? axisItems.find(item => item.id === selectedCell.axisId) : undefined;
  const selectedColumn = selectedCell ? columns.find(column => column.id === selectedCell.columnId) : undefined;
  const selectedEntries = selectedAxis && selectedColumn ? getCellEntries(selectedAxis.id, selectedColumn) : [];
  const selectedIssues = getCellIssues(selectedEntries);

  const aggregates = useMemo(() => {
    const cellEntryGroups = Array.from(scheduleMap.values()) as ScheduleEntry[][];
    const occupiedCells = cellEntryGroups.filter(entries => entries.length > 0).length;
    const stackedCells = cellEntryGroups.filter(entries => entries.length > 1).length;
    const allIssues = filteredSchedule.flatMap(entry => entryIssues.get(entry.id) || []);
    const errorCount = allIssues.filter(issue => issue.severity === 'error').length;
    const warningCount = allIssues.filter(issue => issue.severity === 'warning').length;
    const teacherLoad = new Map<string, number>();
    const classroomLoad = new Map<string, number>();
    filteredSchedule.forEach(entry => {
      teacherLoad.set(entry.teacherId, (teacherLoad.get(entry.teacherId) || 0) + 1);
      classroomLoad.set(entry.classroomId, (classroomLoad.get(entry.classroomId) || 0) + 1);
    });
    const busiestTeacher = Array.from(teacherLoad.entries()).sort((a, b) => b[1] - a[1])[0];
    const busiestClassroom = Array.from(classroomLoad.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      lessons: filteredSchedule.length,
      occupiedCells,
      stackedCells,
      errorCount,
      warningCount,
      busiestTeacher: busiestTeacher ? `${teachers.find(t => t.id === busiestTeacher[0])?.name || busiestTeacher[0]} (${busiestTeacher[1]})` : '—',
      busiestClassroom: busiestClassroom ? `${classrooms.find(c => c.id === busiestClassroom[0])?.number || busiestClassroom[0]} (${busiestClassroom[1]})` : '—',
    };
  }, [filteredSchedule, scheduleMap, entryIssues, teachers, classrooms]);

  const getPlacementGroupIds = (item: UnscheduledEntry | ScheduleEntry, targetGroupId: string) => {
    const explicitGroupIds = item.groupIds?.length ? item.groupIds : (item.groupId ? [item.groupId] : []);
    if (explicitGroupIds.length > 0) return explicitGroupIds;
    if (item.streamId) {
      const streamGroupIds = streams.find(stream => stream.id === item.streamId)?.groupIds || [];
      return streamGroupIds.length > 0 ? streamGroupIds : [targetGroupId];
    }
    return [targetGroupId];
  };

  const canDropToCell = (axisItem: AxisItem, column: TimeColumn, item?: UnscheduledEntry | ScheduleEntry) => {
    if (primaryView !== 'group' || !item) return primaryView === 'group';
    const placementGroupIds = getPlacementGroupIds(item, axisItem.id);
    const movingEntryId = 'id' in item ? item.id : null;
    const occupied = placementGroupIds.some(groupId => {
      const entries = scheduleMap.get(makeCellKey(groupId, column.date, column.slot.id)) || [];
      return entries.some(entry => entry.id !== movingEntryId);
    });
    if (occupied) return false;

    if (settings.respectProductionCalendar) {
      const dayInfo = productionCalendar.find(event => event.date === column.date);
      if (dayInfo && !dayInfo.isWorkDay) return false;
    }
    if (!settings.allowManualOverrideOfForbidden) {
      const teacher = teachers.find(itemTeacher => itemTeacher.id === item.teacherId);
      if (teacher?.availabilityGrid?.[column.dayName]?.[column.slot.id] === AvailabilityType.Forbidden) return false;
      const forbiddenGroup = groups.find(group => placementGroupIds.includes(group.id) && group.availabilityGrid?.[column.dayName]?.[column.slot.id] === AvailabilityType.Forbidden);
      if (forbiddenGroup) return false;
    }
    const placementGroups = groups.filter(group => placementGroupIds.includes(group.id));
    if (!areGroupsCompatibleWithTimeSlot(column.slot, placementGroups)) return false;
    return !schedule.some(entry => {
      if (entry.id === movingEntryId || entry.teacherId !== item.teacherId || entry.timeSlotId !== column.slot.id) return false;
      const entryDate = getConcreteDateForEntry(entry);
      return entryDate === column.date;
    });
  };

  const handleDateSelect = (date: Date) => {
    setCurrentDate(toYYYYMMDD(date));
    setViewDate(toYYYYMMDD(date));
    setIsDatePickerOpen(false);
  };

  const resetFilters = () => setFilters({
    query: '',
    departmentId: 'all',
    specialtyId: 'all',
    course: 'all',
    formOfStudy: 'all',
    shift: 'all',
    streamId: 'all',
    teacherId: 'all',
    classroomId: 'all',
    subjectId: 'all',
    classType: 'all',
  });

  const cellText = (entries: ScheduleEntry[]) => entries.map(entry => {
    const subject = subjects.find(item => item.id === entry.subjectId)?.name || entry.subjectId;
    const teacher = teachers.find(item => item.id === entry.teacherId)?.name || entry.teacherId;
    const classroom = classrooms.find(item => item.id === entry.classroomId)?.number || entry.classroomId;
    const groupNames = getResourceGroupIds(entry).map(groupId => groups.find(group => group.id === groupId)?.number || groupId).join(', ');
    return `${subject} (${entry.classType}); ${teacher}; ауд. ${classroom}; ${groupNames}`;
  }).join('\n');

  const buildExportRows = () => {
    const rowItems = isTransposed ? columns : visibleAxisItems;
    const colItems = isTransposed ? visibleAxisItems : columns;
    return rowItems.map(row => {
      const label = 'label' in row ? row.label : `${row.dayLabel} ${row.slot.time}`;
      const result: Record<string, string> = { Строка: label };
      colItems.forEach(col => {
        const axisId = 'label' in row ? row.id : (col as AxisItem).id;
        const column = 'slot' in row ? row as TimeColumn : col as TimeColumn;
        const colLabel = 'label' in col ? col.label : `${col.dayLabel} ${col.slot.time}`;
        result[colLabel] = cellText(getCellEntries(axisId, column));
      });
      return result;
    });
  };

  const exportExcel = () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      alert('Нет данных для экспорта.');
      return;
    }
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = Object.keys(rows[0]).map((_, index) => ({ wch: index === 0 ? 24 : 32 }));
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Сводное расписание');
    XLSX.writeFile(workbook, `university_summary_${weekStart}_${weekEnd}.xlsx`);
  };

  const exportCsv = () => {
    const rows = buildExportRows();
    if (rows.length === 0) {
      alert('Нет данных для экспорта.');
      return;
    }
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(';'),
      ...rows.map(row => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(';')),
    ].join('\n');
    downloadBlob(csv, `university_summary_${weekStart}_${weekEnd}.csv`, 'text/csv;charset=utf-8');
  };

  const printView = () => {
    const rows = buildExportRows();
    const headers = rows[0] ? Object.keys(rows[0]) : ['Строка'];
    const html = `
      <html>
        <head>
          <title>Сводное расписание</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #bbb; padding: 4px; vertical-align: top; white-space: pre-line; }
            th { background: #eef2ff; }
            h1 { font-size: 18px; }
          </style>
        </head>
        <body>
          <h1>Сводное расписание ${weekStart} - ${weekEnd}</h1>
          <table>
            <thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(row => `<tr>${headers.map(header => `<td>${String(row[header] || '')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const renderCell = (axisItem: AxisItem, column: TimeColumn) => {
    const entries = getCellEntries(axisItem.id, column);
    const issues = getCellIssues(entries);
    const columnId = column.id;
    return (
      <SummaryCell
        key={`${axisItem.id}-${column.id}`}
        axisItem={axisItem}
        column={column}
        entries={entries}
        issues={issues}
        compactMode={compactMode}
        canDropItem={item => canDropToCell(axisItem, column, item)}
        onOpen={() => setSelectedCell({ axisId: axisItem.id, columnId })}
        onDropEntry={item => {
          if (primaryView !== 'group') return;
          try {
            placeItemInGrid(item, axisItem.id, column.date, column.slot.id);
          } catch (error: any) {
            alert(error.message);
          }
        }}
      />
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center">
            <DocumentSearchIcon className="mr-3 h-8 w-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Сводное расписание</h2>
              <p className="text-sm text-gray-500">Диспетчерская сетка университета: фильтры, коллизии, стопки и печатные формы.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div ref={datePickerRef} className="relative">
              <button onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} className={primaryButtonClass}>
                {new Date(`${currentDate}T00:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                <ChevronDownIcon className={`h-5 w-5 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
              </button>
              {isDatePickerOpen && <DatePicker selectedDate={new Date(`${currentDate}T00:00:00`)} onSelect={handleDateSelect} onClose={() => setIsDatePickerOpen(false)} />}
            </div>
            {settings.useEvenOddWeekSeparation && (
              <span className={`rounded-md px-3 py-2 text-sm font-semibold ${weekType === 'odd' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {weekType === 'odd' ? 'Нечётная' : 'Чётная'}
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <Metric label="Занятий" value={aggregates.lessons} tone="blue" />
          <Metric label="Занятых ячеек" value={aggregates.occupiedCells} tone="gray" />
          <Metric label="Стопок" value={aggregates.stackedCells} tone={aggregates.stackedCells ? 'yellow' : 'green'} />
          <Metric label="Ошибок" value={aggregates.errorCount} tone={aggregates.errorCount ? 'red' : 'green'} />
          <Metric label="Предупреждений" value={aggregates.warningCount} tone={aggregates.warningCount ? 'yellow' : 'green'} />
          <Metric label="Самый загруженный ППС" value={aggregates.busiestTeacher} tone="gray" />
          <Metric label="Самая загруженная ауд." value={aggregates.busiestClassroom} tone="gray" />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <input className={controlClass} value={filters.query} onChange={event => setFilters(prev => ({ ...prev, query: event.target.value }))} placeholder="Поиск" />
          <Select value={primaryView} onChange={value => setPrimaryView(value as PrimaryView)} options={[
            ['group', 'Строки: группы'],
            ['teacher', 'Строки: преподаватели'],
            ['classroom', 'Строки: аудитории'],
            ['stream', 'Строки: потоки'],
          ]} />
          <Select value={filters.departmentId} onChange={value => setFilters(prev => ({ ...prev, departmentId: value }))} options={[['all', 'Все кафедры'], ...departments.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.specialtyId} onChange={value => setFilters(prev => ({ ...prev, specialtyId: value }))} options={[['all', 'Все специальности'], ...specialties.map(item => [item.id, `${item.code} ${item.name}`] as [string, string])]} />
          <Select value={filters.course} onChange={value => setFilters(prev => ({ ...prev, course: value }))} options={[['all', 'Все курсы'], ...Array.from(new Set<number>(groups.map(group => group.course))).sort((a: number, b: number) => a - b).map(course => [String(course), `${course} курс`] as [string, string])]} />
          <Select value={filters.formOfStudy} onChange={value => setFilters(prev => ({ ...prev, formOfStudy: value }))} options={[['all', 'Все формы'], ...Object.values(FormOfStudy).map(value => [value, value] as [string, string])]} />
          <Select value={filters.shift} onChange={value => setFilters(prev => ({ ...prev, shift: value }))} options={[['all', 'Все смены'], ['first', 'Первая смена'], ['second', 'Вторая смена'], ['both', 'Обе смены']]} />
          <Select value={filters.streamId} onChange={value => setFilters(prev => ({ ...prev, streamId: value }))} options={[['all', 'Все потоки'], ...streams.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.teacherId} onChange={value => setFilters(prev => ({ ...prev, teacherId: value }))} options={[['all', 'Все преподаватели'], ...teachers.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.classroomId} onChange={value => setFilters(prev => ({ ...prev, classroomId: value }))} options={[['all', 'Все аудитории'], ...classrooms.map(item => [item.id, item.number] as [string, string])]} />
          <Select value={filters.subjectId} onChange={value => setFilters(prev => ({ ...prev, subjectId: value }))} options={[['all', 'Все дисциплины'], ...subjects.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.classType} onChange={value => setFilters(prev => ({ ...prev, classType: value }))} options={[['all', 'Все типы'], ...Object.values(ClassType).map(value => [value, value] as [string, string])]} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={buttonClass} onClick={() => setIsTransposed(value => !value)}>
            <SparklesIcon className="h-4 w-4" />
            {isTransposed ? 'Вернуть строки/столбцы' : 'Поменять строки и столбцы'}
          </button>
          <button className={buttonClass} onClick={() => setCompactMode(value => !value)}>{compactMode ? 'Подробные карточки' : 'Компактные карточки'}</button>
          <button className={problemOnly ? primaryButtonClass : buttonClass} onClick={() => setProblemOnly(value => !value)}>Только проблемы</button>
          <button className={buttonClass} onClick={() => setGroupSortOrder(order => order === 'asc' ? 'desc' : 'asc')}>Сортировка групп {groupSortOrder === 'asc' ? '▲' : '▼'}</button>
          <button className={buttonClass} onClick={resetFilters}>Сбросить фильтры</button>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={buttonClass} onClick={exportExcel}><DocumentDownloadIcon className="h-4 w-4" />Excel</button>
            <button className={buttonClass} onClick={exportCsv}>CSV</button>
            <button className={buttonClass} onClick={printView}>Печать</button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[72vh] overflow-auto">
            {!isTransposed ? (
              <table className={`w-full border-collapse text-sm ${compactMode ? 'text-xs' : ''}`}>
                <thead className="sticky top-0 z-20 bg-gray-100">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[180px] border-b border-r bg-gray-100 p-2 text-left font-semibold text-gray-700">Объект</th>
                    {weekDays.map(day => (
                      <th key={toYYYYMMDD(day)} colSpan={sortedTimeSlots.length} className="border-b border-r p-2 text-center font-semibold text-gray-700">
                        {DAYS_OF_WEEK[day.getDay() === 0 ? 6 : day.getDay() - 1]}, {day.getDate()}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 z-30 border-b border-r bg-gray-100 p-2" />
                    {columns.map(column => (
                      <th key={column.id} className="min-w-[160px] border-b border-r p-2 text-xs font-medium text-gray-500">
                        {column.slot.time}
                        {column.slot.shift && <span className="ml-1 text-[10px] text-gray-400">{getTimeSlotShiftLabel(column.slot)}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAxisItems.map(axisItem => (
                    <tr key={axisItem.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 min-w-[180px] border-r bg-white p-2 font-semibold text-gray-900">
                        <div>{axisItem.label}</div>
                        {axisItem.sublabel && <div className="text-xs font-normal text-gray-500">{axisItem.sublabel}</div>}
                      </td>
                      {columns.map(column => renderCell(axisItem, column))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={`w-full border-collapse text-sm ${compactMode ? 'text-xs' : ''}`}>
                <thead className="sticky top-0 z-20 bg-gray-100">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-[180px] border-b border-r bg-gray-100 p-2 text-left font-semibold text-gray-700">День и слот</th>
                    {visibleAxisItems.map(axisItem => (
                      <th key={axisItem.id} className="min-w-[170px] border-b border-r p-2 text-left font-semibold text-gray-700">
                        {axisItem.label}
                        {axisItem.sublabel && <div className="text-xs font-normal text-gray-500">{axisItem.sublabel}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map(column => (
                    <tr key={column.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 min-w-[180px] border-r bg-white p-2 font-semibold text-gray-900">
                        {column.dayLabel}
                        <div className="text-xs font-normal text-gray-500">{column.slot.time}</div>
                      </td>
                      {visibleAxisItems.map(axisItem => renderCell(axisItem, column))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {visibleAxisItems.length === 0 && (
              <div className="p-12 text-center text-gray-500">
                <p className="font-semibold">Нет данных для отображения</p>
                <p className="text-sm">Измените фильтры или добавьте занятия в расписание.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Панель ячейки</h3>
            {selectedEntries.length > 0 && (
              <button className="rounded-md p-2 text-red-600 hover:bg-red-50" title="Убрать занятия ячейки в нераспределённые" onClick={() => removeScheduleEntries(selectedEntries.map(entry => entry.id))}>
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          {selectedAxis && selectedColumn ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-semibold text-gray-900">{selectedAxis.label}</p>
                <p className="text-gray-600">{selectedColumn.dayLabel}, {selectedColumn.slot.time}</p>
                {selectedAxis.sublabel && <p className="mt-1 text-xs text-gray-500">{selectedAxis.sublabel}</p>}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">Проблемы</p>
                {selectedIssues.length ? (
                  <div className="space-y-2">
                    {selectedIssues.map((issue, index) => (
                      <div key={`${issue.label}-${index}`} className={`rounded-md border p-2 text-sm ${issue.severity === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                        {issue.label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">Проблем в ячейке не найдено.</div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">Занятия</p>
                <div className="space-y-2">
                  {selectedEntries.map(entry => {
                    const subject = subjects.find(item => item.id === entry.subjectId)?.name || entry.subjectId;
                    const teacher = teachers.find(item => item.id === entry.teacherId)?.name || entry.teacherId;
                    const classroom = classrooms.find(item => item.id === entry.classroomId)?.number || entry.classroomId;
                    const groupNames = getResourceGroupIds(entry).map(groupId => groups.find(group => group.id === groupId)?.number || groupId).join(', ');
                    return (
                      <div key={entry.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">{subject}</p>
                            <p className="text-gray-600">{entry.classType}</p>
                          </div>
                          <button className="rounded-md p-1 text-blue-600 hover:bg-blue-50" title="Открыть неделю в основной сетке" onClick={() => {
                            setViewDate(selectedColumn.date);
                            setActiveView('Просмотр расписания');
                          }}>
                            <EditIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-2 text-gray-600">{teacher}</p>
                        <p className="text-gray-600">Ауд. {classroom}</p>
                        <p className="text-gray-600">{groupNames}</p>
                      </div>
                    );
                  })}
                  {selectedEntries.length === 0 && <div className="rounded-md border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">Свободная ячейка.</div>}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Выберите ячейку, чтобы увидеть состав занятий, конфликты и действия.</div>
          )}
        </aside>
      </div>

      <UnscheduledDeck />
    </div>
  );
};

const Metric: React.FC<{ label: string; value: React.ReactNode; tone: 'blue' | 'green' | 'yellow' | 'red' | 'gray' }> = ({ label, value, tone }) => {
  const colors = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    yellow: 'border-amber-100 bg-amber-50 text-amber-800',
    red: 'border-red-100 bg-red-50 text-red-800',
    gray: 'border-gray-100 bg-gray-50 text-gray-800',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 truncate text-lg font-bold" title={String(value)}>{value}</p>
    </div>
  );
};

const Select: React.FC<{ value: string; onChange: (value: string) => void; options: [string, string][] }> = ({ value, onChange, options }) => (
  <select className={controlClass} value={value} onChange={event => onChange(event.target.value)}>
    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>
);

export default UniversityWideSchedule;
