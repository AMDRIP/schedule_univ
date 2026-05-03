import React, { useState, useMemo } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { useStore } from '../hooks/useStore';
import { ScheduleEntry, UnscheduledEntry, WeekType, DeliveryMode, ClassroomTag, AvailabilityType, TimeSlot, ClassType } from '../types';
import { CLASS_TYPE_COLORS, ItemTypes, DAYS_OF_WEEK, COLOR_MAP } from '../constants';
import LessonPlanModal from './LessonPlanModal';
import { EditIcon, TrashIcon, CalendarIcon, WifiIcon, BuildingOfficeIcon, BookOpenIcon, SparklesIcon } from './icons';
import { renderIcon } from './IconMap';
import { getWeekType } from '../utils/dateUtils';
import { areGroupsCompatibleWithTimeSlot } from '../utils/shiftUtils';

interface ScheduleEntryCardProps {
  entry: ScheduleEntry;
  isEditable: boolean;
  colorBy: 'type' | 'teacher' | 'subject';
  cellDate: string;
}

const getEntryGroupIds = (entry: Pick<ScheduleEntry, 'groupId' | 'groupIds'>) => {
  const ids = new Set<string>();
  entry.groupIds?.forEach(id => ids.add(id));
  if (entry.groupId) ids.add(entry.groupId);
  return Array.from(ids);
};

const withAlpha = (hex: string, alpha: string) =>
  /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;

const getWeekKey = (dateStr: string) => {
  const date = new Date(`${dateStr}T00:00:00`);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date.getTime() - yearStart.getTime()) / 86400000);
  return `${date.getFullYear()}-${Math.ceil((dayOffset + yearStart.getDay() + 1) / 7)}`;
};

const ScheduleEntryCard: React.FC<ScheduleEntryCardProps> = ({ entry, isEditable, colorBy, cellDate }) => {
  const { subjects, teachers, classrooms, groups, subgroups, streams, electives, schedule, teacherSubjectLinks, updateScheduleEntry, deleteScheduleEntry, removeScheduleEntries, settings, classroomTags } = useStore();
  const [isEditingClassroom, setIsEditingClassroom] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);
  const [isLessonPlanOpen, setIsLessonPlanOpen] = useState(false);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SCHEDULE_ENTRY,
    item: entry,
    canDrag: () => isEditable,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [entry, isEditable]);

  // ... (handleDelete, getInvolvedGroups, subject, subgroup, studentCount, availableClassrooms, handleClassroomChange, handleDateChange, handleDeliveryChange, teacher, classroom, tags, isUndesirable, isConflicting logic remains the same)

  const handleDelete = () => {
    if (window.confirm('Удалить это занятие из расписания?')) {
      deleteScheduleEntry(entry);
    }
  };

  const getInvolvedGroups = useMemo(() => {
    if (entry.groupIds) {
      return groups.filter(g => entry.groupIds!.includes(g.id));
    }
    if (entry.groupId) {
      const group = groups.find(g => g.id === entry.groupId);
      return group ? [group] : [];
    }
    return [];
  }, [entry, groups]);

  const subject = useMemo(() => subjects.find(s => s.id === entry.subjectId), [entry, subjects]);
  const elective = useMemo(() => {
    const electiveIdFromUid = entry.unscheduledUid?.match(/^unsched-elective-(.+)-\d+$/)?.[1];
    if (electiveIdFromUid) {
      const byUid = electives.find(item => item.id === electiveIdFromUid);
      if (byUid) return byUid;
    }
    return electives.find(item =>
      item.subjectId === entry.subjectId &&
      item.teacherId === entry.teacherId &&
      item.groupId === entry.groupId &&
      (item.classType || ClassType.Elective) === entry.classType
    );
  }, [entry, electives]);
  const subgroup = useMemo(() => entry.subgroupId ? subgroups.find(sg => sg.id === entry.subgroupId) : undefined, [entry, subgroups]);

  const studentCount = useMemo(() => {
    if (subgroup) return subgroup.studentCount;
    return getInvolvedGroups.reduce((sum, g) => sum + g.studentCount, 0);
  }, [getInvolvedGroups, subgroup]);

  const availableClassrooms = useMemo(() => {
    const requiredTypes = subject?.classroomTypeRequirements?.[entry.classType];
    if (!requiredTypes || requiredTypes.length === 0 || studentCount === 0) return [];

    const suitableByTypeAndCapacity = classrooms.filter(c =>
      requiredTypes.includes(c.typeId) && c.capacity >= studentCount
    );

    const occupiedClassroomIds = new Set(
      schedule
        .filter(e =>
          e.id !== entry.id &&
          e.day === entry.day &&
          e.timeSlotId === entry.timeSlotId &&
          ((e.weekType === entry.weekType || e.weekType === 'every' || entry.weekType === 'every'))
        )
        .map(e => e.classroomId)
    );

    return suitableByTypeAndCapacity.filter(c => !occupiedClassroomIds.has(c.id));
  }, [classrooms, schedule, entry, subject, studentCount]);

  const handleClassroomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateScheduleEntry({ ...entry, classroomId: e.target.value });
    setIsEditingClassroom(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value + 'T00:00:00');
    const dayOfWeek = newDate.getDay();
    const dayName = DAYS_OF_WEEK[dayOfWeek === 0 ? 6 : dayOfWeek - 1];
    updateScheduleEntry({ ...entry, date: e.target.value, day: dayName });
    setIsEditingDate(false);
  };

  const handleDeliveryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateScheduleEntry({ ...entry, deliveryMode: e.target.value as DeliveryMode });
    setIsEditingDelivery(false);
  };

  const teacher = teachers.find(t => t.id === entry.teacherId);
  const classroom = classrooms.find(c => c.id === entry.classroomId);
  const tags: (ClassroomTag | undefined)[] = useMemo(() => classroom?.tagIds?.map(tagId => classroomTags.find(t => t.id === tagId)).filter(Boolean) || [], [classroom, classroomTags]);

  const isUndesirable = useMemo(() => {
    const teacherAvailability = teacher?.availabilityGrid?.[entry.day]?.[entry.timeSlotId];
    const groupAvailabilities = getInvolvedGroups.map(g => g.availabilityGrid?.[entry.day]?.[entry.timeSlotId]);

    return teacherAvailability === AvailabilityType.Undesirable || groupAvailabilities.some(a => a === AvailabilityType.Undesirable);
  }, [entry, teacher, getInvolvedGroups]);

  const getResourceGroupIds = (scheduleEntry: ScheduleEntry) => {
    const explicitIds = getEntryGroupIds(scheduleEntry);
    if (explicitIds.length > 0) return explicitIds;
    return scheduleEntry.streamId
      ? streams.find(s => s.id === scheduleEntry.streamId)?.groupIds || []
      : [];
  };

  const conflictReasons = useMemo(() => {
    if (!entry.timeSlotId) return [];

    const entryDate = entry.date || cellDate;
    if (!entryDate) return [];

    const reasons = new Set<string>();

    const entryGroupIds = getResourceGroupIds(entry);
    const entryGroupIdSet = new Set(entryGroupIds);

    const matchesSameConcreteTime = (otherEntry: ScheduleEntry) => {
      if (otherEntry.id === entry.id) return false;
      if (otherEntry.timeSlotId !== entry.timeSlotId) return false;

      if (otherEntry.date) {
        return otherEntry.date === entryDate;
      }

      const d = new Date(entryDate + 'T00:00:00');
      const dayName = DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
      if (otherEntry.day !== dayName) return false;

      const semesterStart = new Date(settings.semesterStart);
      const week = getWeekType(d, semesterStart);
      const effectiveWeek = settings.useEvenOddWeekSeparation ? week : 'every';

      return otherEntry.weekType === 'every' || otherEntry.weekType === effectiveWeek;
    };

    schedule.forEach(otherEntry => {
      if (!matchesSameConcreteTime(otherEntry)) return;

      if (entry.teacherId && otherEntry.teacherId === entry.teacherId) {
        reasons.add(`Коллизия преподавателя: ${teacher?.name || entry.teacherId}`);
      }

      const overlappingGroupIds = getResourceGroupIds(otherEntry).filter(groupId => entryGroupIdSet.has(groupId));
      if (entry.streamId && otherEntry.streamId === entry.streamId && overlappingGroupIds.length > 0) {
        const streamName = streams.find(s => s.id === entry.streamId)?.name || 'поток';
        reasons.add(`Коллизия потока: ${streamName}`);
      }
      if (overlappingGroupIds.length > 0) {
        const groupNames = overlappingGroupIds
          .map(groupId => groups.find(g => g.id === groupId)?.number || groupId)
          .join(', ');
        reasons.add(`Коллизия группы/потока: ${groupNames}`);
      }
    });

    return Array.from(reasons);
  }, [entry, cellDate, schedule, settings, teacher, streams, groups]);

  const isConflicting = conflictReasons.length > 0;

  const matchesSameConcreteTime = (target: ScheduleEntry, otherEntry: ScheduleEntry) => {
    if (otherEntry.id === target.id || otherEntry.timeSlotId !== target.timeSlotId) return false;

    const targetDate = target.date || cellDate;
    if (!targetDate) return false;

    if (otherEntry.date) {
      return otherEntry.date === targetDate;
    }

    const d = new Date(`${targetDate}T00:00:00`);
    const dayName = DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
    if (otherEntry.day !== dayName) return false;

    const semesterStart = new Date(settings.semesterStart);
    const week = getWeekType(d, semesterStart);
    const effectiveWeek = settings.useEvenOddWeekSeparation ? week : 'every';
    return otherEntry.weekType === 'every' || otherEntry.weekType === effectiveWeek;
  };

  const getBlockingEntries = (target: ScheduleEntry) => {
    const targetGroupIds = new Set(getResourceGroupIds(target));
    return schedule.filter(otherEntry => {
      if (!matchesSameConcreteTime(target, otherEntry)) return false;
      if (otherEntry.teacherId === target.teacherId) return true;
      if (otherEntry.classroomId === target.classroomId) return true;
      return getResourceGroupIds(otherEntry).some(groupId => targetGroupIds.has(groupId));
    });
  };

  const getTeacherLoadAfterReplacement = (teacherId: string) => {
    const targetDate = entry.date || cellDate;
    const targetWeekKey = getWeekKey(targetDate);
    const semesterStart = settings.semesterStart || targetDate;
    const semesterEnd = settings.semesterEnd || targetDate;
    const teacherEntries = schedule.filter(item =>
      item.id !== entry.id &&
      item.teacherId === teacherId &&
      item.date &&
      item.date >= semesterStart &&
      item.date <= semesterEnd
    );
    const weeklyPairs = teacherEntries.filter(item => getWeekKey(item.date!) === targetWeekKey).length + 1;
    const semesterPairs = teacherEntries.length + 1;
    return { weeklyPairs, semesterPairs };
  };

  const getEntryDateDayName = () => {
    const targetDate = entry.date || cellDate;
    if (!targetDate) return entry.day;
    const d = new Date(`${targetDate}T00:00:00`);
    return DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
  };

  const findReplacementTeacher = () => {
    const targetDay = getEntryDateDayName();
    const candidateIds = Array.from(new Set(
      teacherSubjectLinks
        .filter(link => link.subjectId === entry.subjectId && link.classTypes.includes(entry.classType))
        .map(link => link.teacherId)
        .filter(teacherId => teacherId !== entry.teacherId)
    ));

    return candidateIds
      .map(teacherId => teachers.find(candidate => candidate.id === teacherId))
      .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
      .filter(candidate => {
        if (candidate.availabilityGrid?.[targetDay]?.[entry.timeSlotId] === AvailabilityType.Forbidden) return false;
        return !schedule.some(otherEntry =>
          otherEntry.id !== entry.id &&
          otherEntry.teacherId === candidate.id &&
          matchesSameConcreteTime({ ...entry, teacherId: candidate.id }, otherEntry)
        );
      })
      .sort((a, b) => {
        const aLoad = getTeacherLoadAfterReplacement(a.id);
        const bLoad = getTeacherLoadAfterReplacement(b.id);
        return aLoad.weeklyPairs - bLoad.weeklyPairs || aLoad.semesterPairs - bLoad.semesterPairs || a.name.localeCompare(b.name, 'ru');
      })[0];
  };

  const handleResolveCollision = (event: React.MouseEvent) => {
    event.stopPropagation();

    let targetEntry = entry;
    let blockers = getBlockingEntries(targetEntry);
    if (blockers.length === 0) {
      alert('Для этого занятия уже не найдено активных коллизий.');
      return;
    }

    const hasTeacherConflict = blockers.some(otherEntry => otherEntry.teacherId === targetEntry.teacherId);
    if (hasTeacherConflict) {
      const replacementTeacher = findReplacementTeacher();
      if (replacementTeacher) {
        const replacementLoad = getTeacherLoadAfterReplacement(replacementTeacher.id);
        const weeklyNormPairs = settings.analyticsThresholds?.targetWeeklyTeacherLoad || 20;
        const semesterNormPairs = 540;
        const overloaded = replacementLoad.weeklyPairs > weeklyNormPairs || replacementLoad.semesterPairs > semesterNormPairs;

        if (overloaded) {
          const confirmed = window.confirm(
            `Нежелательная замена: ${replacementTeacher.name} получит ${replacementLoad.weeklyPairs} пар в этой неделе и ${replacementLoad.semesterPairs} пар за семестр. Выполнить замену?`
          );
          if (!confirmed) return;
        }

        targetEntry = { ...entry, teacherId: replacementTeacher.id };
        updateScheduleEntry(targetEntry);
        blockers = getBlockingEntries(targetEntry);
      }
    }

    const blockerIds = blockers.map(item => item.id);
    if (blockerIds.length > 0) {
      const confirmed = window.confirm(`Убрать в нераспределённые мешающие занятия: ${blockerIds.length}?`);
      if (!confirmed) return;
      removeScheduleEntries(blockerIds);
    }
  };


  if (!subject || !teacher || !classroom) {
    return (
      <div className="p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 relative">
        Ошибка данных
        {isEditable && <button onClick={handleDelete} className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-0.5 rounded-full bg-red-100 hover:bg-red-200"><TrashIcon className="w-3 h-3" /></button>}
      </div>
    );
  }

  let colorClass = 'bg-gray-100 border-gray-300';
  let borderClass = '';
  const cardStyle: React.CSSProperties = {};
  const warningClass = isUndesirable ? 'ring-2 ring-yellow-400 ring-offset-1' : '';
  const conflictClass = isConflicting ? 'ring-2 ring-offset-1 ring-red-600' : '';

  if (settings.showScheduleColors) {
    switch (colorBy) {
      case 'type':
        if (settings.colorPolicy?.classTypeColors?.[entry.classType]) {
          const color = settings.colorPolicy.classTypeColors[entry.classType]!;
          colorClass = 'text-gray-900';
          cardStyle.backgroundColor = withAlpha(color, '33');
          cardStyle.borderColor = color;
        } else {
          colorClass = CLASS_TYPE_COLORS[entry.classType] || colorClass;
        }
        break;
      case 'teacher': {
        const teacherColorName = teacher?.color;
        if (teacherColorName && COLOR_MAP[teacherColorName]) {
          const colorData = COLOR_MAP[teacherColorName];
          colorClass = `${colorData.bg} ${colorData.border}`;
          borderClass = `border-l-4 ${colorData.borderL}`;
        } else if (settings.colorPolicy?.teacherFallbackColor) {
          const color = settings.colorPolicy.teacherFallbackColor;
          colorClass = 'text-gray-900';
          cardStyle.backgroundColor = withAlpha(color, '33');
          cardStyle.borderColor = color;
          cardStyle.borderLeftColor = color;
          cardStyle.borderLeftWidth = 4;
        }
        break;
      }
      case 'subject': {
        const subjectColorName = subject?.color;
        if (subjectColorName && COLOR_MAP[subjectColorName]) {
          const colorData = COLOR_MAP[subjectColorName];
          colorClass = `${colorData.bg} ${colorData.border}`;
          borderClass = `border-l-4 ${colorData.borderL}`;
        } else if (settings.colorPolicy?.subjectFallbackColor) {
          const color = settings.colorPolicy.subjectFallbackColor;
          colorClass = 'text-gray-900';
          cardStyle.backgroundColor = withAlpha(color, '33');
          cardStyle.borderColor = color;
          cardStyle.borderLeftColor = color;
          cardStyle.borderLeftWidth = 4;
        }
        break;
      }
    }
  }

  if (isConflicting && settings.colorPolicy?.conflictColor) {
    cardStyle.boxShadow = `0 0 0 2px ${settings.colorPolicy.conflictColor}`;
  } else if (isUndesirable && settings.colorPolicy?.undesirableColor) {
    cardStyle.boxShadow = `0 0 0 2px ${settings.colorPolicy.undesirableColor}`;
  }

  const teacherName = (settings.showDegreeInSchedule && teacher.academicDegree)
    ? `${teacher.name}, ${teacher.academicDegree}`
    : teacher.name;

  const getGroupName = () => {
    if (subgroup) {
      const parentGroup = groups.find(g => g.id === entry.groupId);
      return `${parentGroup?.number} (${subgroup.name})`;
    }
    if (entry.groupIds) {
      const stream = entry.streamId ? streams.find(s => s.id === entry.streamId) : undefined;
      const entryGroupSet = new Set(entry.groupIds);
      const isFullStream = !!stream &&
        stream.groupIds.length === entry.groupIds.length &&
        stream.groupIds.every(groupId => entryGroupSet.has(groupId));
      if (isFullStream) return stream.name;
      const groupNumbers = entry.groupIds.map(gid => groups.find(g => g.id === gid)?.number).filter(Boolean);
      if (groupNumbers.length > 2) return `${groupNumbers.slice(0, 2).join(', ')} и еще ${groupNumbers.length - 2}`;
      return groupNumbers.join(', ');
    }
    if (entry.streamId) {
      return streams.find(s => s.id === entry.streamId)?.name || 'Поток';
    }
    if (entry.groupId) {
      return groups.find(g => g.id === entry.groupId)?.number;
    }
    return 'N/A';
  };

  const groupName = getGroupName();

  return (
    <>
      <div
        ref={isEditable ? drag as any : null}
        className={`shadow-sm p-1.5 rounded-lg text-xs cursor-grab relative group transition-all duration-200 hover:shadow-lg hover:-translate-y-1 ${colorClass} ${borderClass} ${warningClass} ${conflictClass} ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        style={cardStyle}
        title={isConflicting ? conflictReasons.join('\n') : undefined}
      >
        <div>
          <p className="truncate" title={elective ? `${subject.name} (${elective.name})` : subject.name}>
            <span className="font-bold">{subject.name}</span>
            {elective && <span className="font-normal text-gray-600"> ({elective.name})</span>}
          </p>
          <p>{entry.classType}</p>
          <p className="font-medium text-gray-700 truncate">{groupName}</p>
          {entry.date && (
            <div className="mt-1 text-gray-600 flex items-center">
              {isEditingDate ? (
                <input
                  type="date"
                  value={entry.date}
                  onChange={handleDateChange}
                  onBlur={() => setIsEditingDate(false)}
                  className="w-full text-xs border-gray-400 rounded p-0"
                  autoFocus
                />
              ) : (
                <>
                  <CalendarIcon className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{new Date(entry.date + 'T00:00:00').toLocaleDateString('ru-RU')}</span>
                  {isEditable && <button onClick={() => setIsEditingDate(true)} className="ml-1 opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3" /></button>}
                </>
              )}
            </div>
          )}
        </div>
        <div className="mt-1">
          <p className="truncate" title={teacherName}>{teacherName}</p>
          {isConflicting && (
            <p className="mt-0.5 truncate rounded border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] font-semibold text-red-700" title={conflictReasons.join('\n')}>
              Коллизия ресурсов
            </p>
          )}
          <div className="font-semibold flex items-center justify-between">
            <div className="flex items-center gap-1">
              {isEditingClassroom ? (
                <select value={entry.classroomId} onChange={handleClassroomChange} onBlur={() => setIsEditingClassroom(false)} className="w-full text-xs border-gray-400 rounded" autoFocus>
                  <option value={classroom.id}>Ауд. {classroom.number}</option>
                  {availableClassrooms.map(c => <option key={c.id} value={c.id}>Ауд. {c.number}</option>)}
                </select>
              ) : (
                <>
                  <span className="truncate">Ауд. {classroom.number}</span>
                  {tags.map(tag => tag && <span key={tag.id} title={tag.name}>{renderIcon(tag.icon, { className: `w-3.5 h-3.5 text-gray-600` })}</span>)}
                  {isEditable && <button onClick={() => setIsEditingClassroom(true)} className="ml-1 opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3" /></button>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isEditable && (
                <button onClick={() => setIsLessonPlanOpen(true)} className="opacity-0 group-hover:opacity-100 transition-opacity" title="План занятия">
                  <BookOpenIcon className={`w-3.5 h-3.5 ${entry.lessonPlan ? 'text-green-600' : 'text-gray-400 hover:text-blue-600'}`} />
                </button>
              )}
              <div className="flex items-center" title={`Тип проведения: ${entry.deliveryMode}`}>
                {isEditable && isEditingDelivery ? (
                  <select value={entry.deliveryMode} onChange={handleDeliveryChange} onBlur={() => setIsEditingDelivery(false)} className="text-xs border-gray-400 rounded" autoFocus>
                    {Object.values(DeliveryMode).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-1">
                    {entry.deliveryMode === DeliveryMode.Online ? <WifiIcon className="w-3.5 h-3.5 text-blue-600" /> : <BuildingOfficeIcon className="w-3.5 h-3.5 text-gray-700" />}
                    {isEditable && <button onClick={() => setIsEditingDelivery(true)} className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3" /></button>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {isEditable && isConflicting && (
          <button
            onClick={handleResolveCollision}
            className="absolute top-1 right-6 text-emerald-700 hover:text-emerald-900 p-0.5 rounded-full bg-white/80 hover:bg-white shadow-sm"
            title="Устранить коллизию"
          >
            <SparklesIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {isEditable && <button onClick={handleDelete} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-0.5 rounded-full bg-white/50 hover:bg-white"><TrashIcon className="w-3.5 h-3.5" /></button>}
      </div>
      {isLessonPlanOpen && (
        <LessonPlanModal
          isOpen={isLessonPlanOpen}
          onClose={() => setIsLessonPlanOpen(false)}
          entry={entry}
          onSave={updateScheduleEntry}
          subjectName={subject.name}
          groupName={groupName || 'Группа'}
          dateStr={entry.date ? new Date(entry.date).toLocaleDateString() : `${entry.day}, ${entry.timeSlotId}`}
        />
      )}
    </>
  );
};

interface ScheduleCellProps {
  entries: ScheduleEntry[];
  day: string;
  date: string; // YYYY-MM-DD
  timeSlotId: string;
  timeSlotShift?: TimeSlot['shift'];
  weekType: 'even' | 'odd' | 'every';
  isEditable: boolean;
  colorBy: 'type' | 'teacher' | 'subject';
}

const getShiftCellClass = (shift?: TimeSlot['shift']) => {
  if (shift === 'second') return 'bg-amber-50 border-l-2 border-l-amber-200';
  if (shift === 'first') return 'bg-sky-50 border-l-2 border-l-sky-200';
  return 'bg-white';
};

const ScheduleCell: React.FC<ScheduleCellProps> = ({ entries, day, date, timeSlotId, timeSlotShift, weekType, isEditable, colorBy }) => {
  const { placeUnscheduledItem, updateScheduleEntry, settings, productionCalendar, teachers, groups, streams, subjects, classrooms, schedule, timeSlots, timeSlotsShortened } = useStore();

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.SCHEDULE_ENTRY, ItemTypes.UNSCHEDULED_ENTRY],
    canDrop: (item: any, monitor) => {
      if (!isEditable) return false;
      if (settings.respectProductionCalendar) {
        const dayInfo = productionCalendar.find(e => e.date === date);
        if (dayInfo && !dayInfo.isWorkDay) {
          return false;
        }
      }

      const targetTimeSlot = [...timeSlots, ...timeSlotsShortened].find(slot => slot.id === timeSlotId);
      const explicitGroupIds = item.groupIds?.length ? item.groupIds : (item.groupId ? [item.groupId] : []);
      const streamGroupIds = item.streamId && explicitGroupIds.length === 0 ? streams.find(s => s.id === item.streamId)?.groupIds || [] : [];
      const involvedGroupIds = explicitGroupIds.length > 0 ? explicitGroupIds : streamGroupIds;
      const involvedGroups = groups.filter(g => involvedGroupIds.includes(g.id));
      if (!areGroupsCompatibleWithTimeSlot(targetTimeSlot, involvedGroups)) return false;

      // Check for Forbidden slots
      if (!settings.allowManualOverrideOfForbidden) {
        const teacher = teachers.find(t => t.id === item.teacherId);

        const teacherAvailability = teacher?.availabilityGrid?.[day]?.[timeSlotId];
        if (teacherAvailability === AvailabilityType.Forbidden) return false;

        const groupForbidden = involvedGroups.some(g => g.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden);
        if (groupForbidden) return false;
      }

      const itemType = monitor.getItemType();
      const movingEntryId = itemType === ItemTypes.SCHEDULE_ENTRY ? item.id : undefined;
      if (itemType === ItemTypes.SCHEDULE_ENTRY) {
        if (entries.some(e => e.id === item.id)) return false;
      }

      const maxEntries = settings.allowOverbooking ? 2 : 1;
      if (entries.filter(entry => entry.id !== movingEntryId).length >= maxEntries) return false;

      const conflictsWithTargetTime = (entry: ScheduleEntry) => {
        if (entry.id === movingEntryId || entry.timeSlotId !== timeSlotId) return false;
        if (entry.date) return entry.date === date;
        return entry.day === day && (entry.weekType === 'every' || weekType === 'every' || entry.weekType === weekType);
      };

      const hasResourceConflict = schedule.some(entry => {
        if (!conflictsWithTargetTime(entry)) return false;
        if (entry.teacherId === item.teacherId) return true;
        if (item.classroomId && entry.classroomId === item.classroomId) return true;
        const entryGroupIds = entry.groupIds?.length ? entry.groupIds : (entry.groupId ? [entry.groupId] : []);
        return entryGroupIds.some(groupId => involvedGroupIds.includes(groupId));
      });
      if (hasResourceConflict) return false;

      if (itemType === ItemTypes.UNSCHEDULED_ENTRY) {
        const subject = subjects.find(s => s.id === item.subjectId);
        const requiredTypes = item.classroomTypeIds?.length ? item.classroomTypeIds : subject?.classroomTypeRequirements?.[item.classType];
        if (!requiredTypes || requiredTypes.length === 0) return false;
        const studentCount = involvedGroups.length > 0
          ? involvedGroups.reduce((sum, group) => sum + group.studentCount, 0)
          : item.studentCount || 0;
        const requiredTags = item.requiredClassroomTagIds?.length ? item.requiredClassroomTagIds : subject?.requiredClassroomTagIds || [];
        const hasFreeClassroom = classrooms.some(classroom => {
          if (!requiredTypes.includes(classroom.typeId) || classroom.capacity < studentCount) return false;
          if (requiredTags.length > 0 && !requiredTags.every(tagId => (classroom.tagIds || []).includes(tagId))) return false;
          return !schedule.some(entry => conflictsWithTargetTime(entry) && entry.classroomId === classroom.id);
        });
        if (!hasFreeClassroom) return false;
      }

      return true;
    },
    drop: (item: any, monitor) => {
      const itemType = monitor.getItemType();
      if (itemType === ItemTypes.UNSCHEDULED_ENTRY) {
        placeUnscheduledItem(item as UnscheduledEntry, day, timeSlotId, weekType, date);
      } else if (itemType === ItemTypes.SCHEDULE_ENTRY) {
        const updatedEntry: ScheduleEntry = { ...item, day, timeSlotId, weekType, date: item.date ? date : undefined };
        updateScheduleEntry(updatedEntry);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }), [entries, day, timeSlotId, weekType, date, placeUnscheduledItem, updateScheduleEntry, settings, productionCalendar, teachers, groups, streams, subjects, classrooms, schedule, timeSlots, timeSlotsShortened]);

  let cellBgClass = getShiftCellClass(timeSlotShift);
  const cellStyle: React.CSSProperties = {};
  const shiftColor = timeSlotShift === 'first'
    ? settings.colorPolicy?.firstShiftColor
    : timeSlotShift === 'second'
      ? settings.colorPolicy?.secondShiftColor
      : undefined;
  if (shiftColor) {
    cellStyle.backgroundColor = withAlpha(shiftColor, '66');
    cellStyle.borderLeftColor = shiftColor;
  }
  if (canDrop && isOver) cellBgClass = 'bg-green-200 ring-2 ring-green-400';
  else if (canDrop) cellBgClass = 'bg-emerald-50 ring-1 ring-emerald-200';

  if (entries.length > 1) {
    cellBgClass = 'bg-red-200 border-red-400';
    cellStyle.backgroundColor = undefined;
  }

  return (
    <td ref={isEditable ? drop as any : null} className={`p-1 border align-top transition-colors ${cellBgClass}`} style={cellStyle}>
      <div className="h-full flex flex-col gap-1">
        {entries.map(entry => (
          <ScheduleEntryCard key={entry.id} entry={entry} isEditable={isEditable} colorBy={colorBy} cellDate={date} />
        ))}
      </div>
    </td>
  );
};

export default ScheduleCell;
