import React, { useState, useMemo } from 'react';
import { useDrop, useDrag } from 'react-dnd';
import { useStore } from '../hooks/useStore';
import { ScheduleEntry, UnscheduledEntry, WeekType, ClassType, DeliveryMode } from '../types';
import { CLASS_TYPE_COLORS, ItemTypes, DAYS_OF_WEEK } from '../constants';
import { EditIcon, TrashIcon, CalendarIcon, WifiIcon, BuildingOfficeIcon } from './icons';

interface ScheduleCellProps {
  entry?: ScheduleEntry;
  day: string;
  date: string; // YYYY-MM-DD
  timeSlotId: string;
  weekType: 'even' | 'odd' | 'every';
  isEditable: boolean;
}

const ScheduleCell: React.FC<ScheduleCellProps> = ({ entry, day, date, timeSlotId, weekType, isEditable }) => {
  const { subjects, teachers, classrooms, groups, subgroups, schedule, placeUnscheduledItem, updateScheduleEntry, deleteScheduleEntry, settings, productionCalendar } = useStore();
  const [isEditingClassroom, setIsEditingClassroom] = useState(false);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [isEditingDelivery, setIsEditingDelivery] = useState(false);

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.SCHEDULE_ENTRY, ItemTypes.UNSCHEDULED_ENTRY],
    canDrop: () => {
       if (isEditable && !entry) {
            if (settings.respectProductionCalendar) {
                const dayInfo = productionCalendar.find(e => e.date === date);
                if (dayInfo && !dayInfo.isWorkDay) {
                    return false; // Cannot drop on non-working day
                }
            }
            return true;
        }
        return false;
    },
    drop: (item: any, monitor) => {
      const itemType = monitor.getItemType();
      if (itemType === ItemTypes.UNSCHEDULED_ENTRY) {
          placeUnscheduledItem(item as UnscheduledEntry, day, timeSlotId, weekType, date);
      } else if (itemType === ItemTypes.SCHEDULE_ENTRY) {
        // При перетаскивании события с датой в обычную ячейку - дата сбрасывается
        const updatedEntry: ScheduleEntry = { ...item, day, timeSlotId, weekType, date: undefined };
        updateScheduleEntry(updatedEntry);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }), [entry, day, timeSlotId, weekType, date, placeUnscheduledItem, updateScheduleEntry, settings, productionCalendar]);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.SCHEDULE_ENTRY,
    item: entry,
    canDrag: () => isEditable && !!entry,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }), [entry, isEditable]);

  const handleDelete = () => {
    if (entry && window.confirm('Удалить это занятие из расписания?')) {
      deleteScheduleEntry(entry);
    }
  };

  const group = useMemo(() => entry ? groups.find(g => g.id === entry.groupId) : undefined, [entry, groups]);
  const subject = useMemo(() => entry ? subjects.find(s => s.id === entry.subjectId) : undefined, [entry, subjects]);
  const subgroup = useMemo(() => entry?.subgroupId ? subgroups.find(sg => sg.id === entry.subgroupId) : undefined, [entry, subgroups]);

  const studentCount = useMemo(() => {
    if (subgroup) return subgroup.studentCount;
    if (group) return group.studentCount;
    return 0;
  }, [group, subgroup]);

  const availableClassrooms = useMemo(() => {
    if (!entry || !subject || !subject.suitableClassroomTypeIds || studentCount === 0) return [];
    
    return classrooms.filter(c => {
      const isOccupied = schedule.some(e => 
        e.id !== entry.id &&
        e.classroomId === c.id &&
        e.day === day &&
        e.timeSlotId === timeSlotId &&
        (e.weekType === weekType || e.weekType === 'every' || weekType === 'every')
      );
      
      return subject.suitableClassroomTypeIds?.includes(c.typeId) && c.capacity >= studentCount && !isOccupied;
    });
  }, [classrooms, schedule, entry, subject, studentCount, day, timeSlotId, weekType]);

  const handleClassroomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (entry) {
        updateScheduleEntry({ ...entry, classroomId: e.target.value });
        setIsEditingClassroom(false);
    }
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (entry) {
        const newDate = new Date(e.target.value + 'T00:00:00');
        const dayOfWeek = newDate.getDay();
        const dayName = DAYS_OF_WEEK[dayOfWeek === 0 ? 6 : dayOfWeek - 1];

        updateScheduleEntry({ ...entry, date: e.target.value, day: dayName });
        setIsEditingDate(false);
    }
  };

  const handleDeliveryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (entry) {
        updateScheduleEntry({ ...entry, deliveryMode: e.target.value as DeliveryMode });
        setIsEditingDelivery(false);
    }
  };

  const getCellContent = () => {
    if (!entry) return null;

    const teacher = teachers.find(t => t.id === entry.teacherId);
    const classroom = classrooms.find(c => c.id === entry.classroomId);

    if (!subject || !teacher || !classroom) {
      return (
        <div className="p-2 bg-red-100 border border-red-300 rounded-lg text-xs text-red-700 h-full relative">
          Ошибка данных
           {isEditable && <button onClick={handleDelete} className="absolute top-1 right-1 text-red-500 hover:text-red-700 p-0.5 rounded-full bg-red-100 hover:bg-red-200"><TrashIcon className="w-3 h-3"/></button>}
        </div>
      );
    }
    
    const colorClass = CLASS_TYPE_COLORS[entry.classType] || 'bg-gray-100 border-gray-300';
    const teacherName = (settings.showDegreeInSchedule && teacher.academicDegree)
        ? `${teacher.name}, ${teacher.academicDegree}`
        : teacher.name;
    const groupName = subgroup ? `${group?.number} (${subgroup.name})` : group?.number;

    return (
      <div ref={isEditable ? drag as any : null} className={`p-2 rounded-lg text-xs h-full flex flex-col justify-between cursor-grab relative group ${colorClass} ${isDragging ? 'opacity-50' : 'opacity-100'}`}>
        <div>
          <p className="font-bold">{subject.name}</p>
          <p>{entry.classType}</p>
          <p className="font-medium text-gray-700">{groupName}</p>
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
        <div>
          <p className="truncate" title={teacherName}>{teacherName}</p>
          <div className="font-semibold flex items-center justify-between">
            <div className="flex items-center">
              {isEditingClassroom ? (
                   <select value={entry.classroomId} onChange={handleClassroomChange} onBlur={() => setIsEditingClassroom(false)} className="w-full text-xs border-gray-400 rounded" autoFocus>
                      <option value={classroom.id}>Ауд. {classroom.number}</option>
                      {availableClassrooms.map(c => <option key={c.id} value={c.id}>Ауд. {c.number}</option>)}
                   </select>
              ) : (
                  <>
                  <span className="truncate">Ауд. {classroom.number}</span>
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
  
  let cellBgClass = 'bg-white';
  if (canDrop && isOver) cellBgClass = 'bg-green-200';
  else if (canDrop) cellBgClass = 'bg-green-50';

  return (
    <td ref={isEditable ? drop as any : null} className={`p-1 border align-top transition-colors ${cellBgClass}`}>
      {getCellContent()}
    </td>
  );
};

export default ScheduleCell;
