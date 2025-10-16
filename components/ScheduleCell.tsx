import React, { useState, useMemo } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { useStore } from '../hooks/useStore';
import { ScheduleEntry, UnscheduledEntry, WeekType, DeliveryMode, ClassroomTag, AvailabilityType } from '../types';
import { CLASS_TYPE_COLORS, ItemTypes, DAYS_OF_WEEK, COLOR_MAP } from '../constants';
import { EditIcon, TrashIcon, CalendarIcon, WifiIcon, BuildingOfficeIcon } from './icons';
import { renderIcon } from './IconMap';

interface ScheduleEntryCardProps {
  entry: ScheduleEntry;
  isEditable: boolean;
  colorBy: 'type' | 'teacher' | 'subject';
}

const ScheduleEntryCard: React.FC<ScheduleEntryCardProps> = ({ entry, isEditable, colorBy }) => {
  const { subjects, teachers, classrooms, groups, subgroups, schedule, updateScheduleEntry, deleteScheduleEntry, settings, classroomTags } = useStore();
  const [isEditingClassroom, setIsEditingClassroom] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SCHEDULE_ENTRY,
    item: entry,
    canDrag: () => isEditable,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [entry, isEditable]);

  const handleDelete = () => {
    if (window.confirm('Удалить это занятие из расписания?')) {
      deleteScheduleEntry(entry);
    }
  };

  const group = useMemo(() => groups.find(g => g.id === entry.groupId), [entry, groups]);
  const subject = useMemo(() => subjects.find(s => s.id === entry.subjectId), [entry, subjects]);
  const subgroup = useMemo(() => entry.subgroupId ? subgroups.find(sg => sg.id === entry.subgroupId) : undefined, [entry, subgroups]);

  const studentCount = useMemo(() => {
    if (subgroup) return subgroup.studentCount;
    if (group) return group.studentCount;
    return 0;
  }, [group, subgroup]);

  const availableClassrooms = useMemo(() => {
    if (!subject?.suitableClassroomTypeIds || studentCount === 0) return [];
    
    const suitableByTypeAndCapacity = classrooms.filter(c => 
        subject.suitableClassroomTypeIds?.includes(c.typeId) && c.capacity >= studentCount
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
    const groupAvailability = group?.availabilityGrid?.[entry.day]?.[entry.timeSlotId];

    return teacherAvailability === AvailabilityType.Undesirable || groupAvailability === AvailabilityType.Undesirable;
  }, [entry, teacher, group]);


  if (!subject || !teacher || !classroom) {
    return (
      <div className="p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 relative">
        Ошибка данных
        {isEditable && <button onClick={handleDelete} className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-0.5 rounded-full bg-red-100 hover:bg-red-200"><TrashIcon className="w-3 h-3"/></button>}
      </div>
    );
  }
  
  let colorClass = 'bg-gray-100 border-gray-300';
  let borderClass = '';
  const warningClass = isUndesirable ? 'ring-2 ring-red-400 ring-offset-1' : '';

  if (settings.showScheduleColors) {
      switch (colorBy) {
          case 'type':
              colorClass = CLASS_TYPE_COLORS[entry.classType] || colorClass;
              break;
          case 'teacher': {
              const teacherColorName = teacher?.color;
              if (teacherColorName && COLOR_MAP[teacherColorName]) {
                  const colorData = COLOR_MAP[teacherColorName];
                  colorClass = `${colorData.bg} ${colorData.border}`;
                  borderClass = `border-l-4 ${colorData.borderL}`;
              }
              break;
          }
          case 'subject': {
              const subjectColorName = subject?.color;
              if (subjectColorName && COLOR_MAP[subjectColorName]) {
                  const colorData = COLOR_MAP[subjectColorName];
                  colorClass = `${colorData.bg} ${colorData.border}`;
                  borderClass = `border-l-4 ${colorData.borderL}`;
              }
              break;
          }
      }
  }

  const teacherName = (settings.showDegreeInSchedule && teacher.academicDegree)
      ? `${teacher.name}, ${teacher.academicDegree}`
      : teacher.name;
  const groupName = subgroup ? `${group?.number} (${subgroup.name})` : group?.number;

  return (
    <div ref={isEditable ? drag as any : null} className={`p-1.5 rounded-md text-xs cursor-grab relative group transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${colorClass} ${borderClass} ${warningClass} ${isDragging ? 'opacity-50' : 'opacity-100'}`}>
      <div>
        <p className="font-bold truncate">{subject.name}</p>
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
                      {isEditable && <button onClick={() => setIsEditingDate(true)} className="ml-1 opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3"/></button>}
                   </>
               )}
          </div>
        )}
      </div>
      <div className="mt-1">
        <p className="truncate" title={teacherName}>{teacherName}</p>
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
                {/* FIX: Wrapped icon in a span with a title attribute to show a tooltip, resolving a TypeScript error where 'title' was not a recognized prop for the icon component. */}
                 {tags.map(tag => tag && <span key={tag.id} title={tag.name}>{renderIcon(tag.icon, { className: `w-3.5 h-3.5 text-gray-600` })}</span>)}
                {isEditable && <button onClick={() => setIsEditingClassroom(true)} className="ml-1 opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3"/></button>}
                </>
            )}
          </div>
          <div className="flex items-center" title={`Тип проведения: ${entry.deliveryMode}`}>
              {isEditable && isEditingDelivery ? (
                  <select value={entry.deliveryMode} onChange={handleDeliveryChange} onBlur={() => setIsEditingDelivery(false)} className="text-xs border-gray-400 rounded" autoFocus>
                      {Object.values(DeliveryMode).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
              ) : (
                  <div className="flex items-center gap-1">
                      {entry.deliveryMode === DeliveryMode.Online ? <WifiIcon className="w-3.5 h-3.5 text-blue-600"/> : <BuildingOfficeIcon className="w-3.5 h-3.5 text-gray-700"/>}
                      {isEditable && <button onClick={() => setIsEditingDelivery(true)} className="opacity-0 group-hover:opacity-100 text-blue-600 hover:text-blue-800"><EditIcon className="w-3 h-3"/></button>}
                  </div>
              )}
          </div>
        </div>
      </div>
       {isEditable && <button onClick={handleDelete} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-0.5 rounded-full bg-white/50 hover:bg-white"><TrashIcon className="w-3.5 h-3.5"/></button>}
    </div>
  );
};

interface ScheduleCellProps {
  entries: ScheduleEntry[];
  day: string;
  date: string; // YYYY-MM-DD
  timeSlotId: string;
  weekType: 'even' | 'odd' | 'every';
  isEditable: boolean;
  colorBy: 'type' | 'teacher' | 'subject';
}

const ScheduleCell: React.FC<ScheduleCellProps> = ({ entries, day, date, timeSlotId, weekType, isEditable, colorBy }) => {
  const { placeUnscheduledItem, updateScheduleEntry, settings, productionCalendar, teachers, groups } = useStore();

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

      // Check for Forbidden slots
      if (!settings.allowManualOverrideOfForbidden) {
          const teacher = teachers.find(t => t.id === item.teacherId);
          const group = groups.find(g => g.id === item.groupId);

          const teacherAvailability = teacher?.availabilityGrid?.[day]?.[timeSlotId];
          const groupAvailability = group?.availabilityGrid?.[day]?.[timeSlotId];

          if (teacherAvailability === AvailabilityType.Forbidden || groupAvailability === AvailabilityType.Forbidden) {
              return false;
          }
      }

      const itemType = monitor.getItemType();
      if (itemType === ItemTypes.SCHEDULE_ENTRY) {
          if (entries.some(e => e.id === item.id)) return false;
      }
      
      const maxEntries = settings.allowOverbooking ? 2 : 1;
      return entries.length < maxEntries;
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
  }), [entries, day, timeSlotId, weekType, date, placeUnscheduledItem, updateScheduleEntry, settings, productionCalendar, teachers, groups]);
  
  let cellBgClass = 'bg-white';
  if (canDrop && isOver) cellBgClass = 'bg-green-200';
  else if (canDrop) cellBgClass = 'bg-green-50';

  if (entries.length > 1) {
    cellBgClass = 'bg-red-200 border-red-400';
  }

  return (
    <td ref={isEditable ? drop as any : null} className={`p-1 border align-top transition-colors ${cellBgClass}`}>
      <div className="h-full flex flex-col gap-1">
        {entries.map(entry => (
          <ScheduleEntryCard key={entry.id} entry={entry} isEditable={isEditable} colorBy={colorBy} />
        ))}
      </div>
    </td>
  );
};

export default ScheduleCell;