import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { Group, ScheduleEntry, Stream, UnscheduledEntry, AvailabilityType } from '../types';
import { getWeekDays, toYYYYMMDD, getWeekType } from '../utils/dateUtils';
import { DAYS_OF_WEEK } from '../constants';
import DatePicker from './DatePicker';
import { ChevronDownIcon, DocumentSearchIcon } from './icons';
import { useDrag, useDrop } from 'react-dnd';
import { ItemTypes } from '../constants';
import UnscheduledDeck from './UnscheduledDeck';

interface UniversityWideScheduleProps {
  setViewDate: (date: string) => void;
  setActiveView: (view: string) => void;
}

const DraggableEntryCell: React.FC<{ entry: ScheduleEntry }> = ({ entry }) => {
    const { subjects, teachers, classrooms } = useStore();
    const subject = subjects.find(s => s.id === entry.subjectId);
    const teacher = teachers.find(t => t.id === entry.teacherId);
    const classroom = classrooms.find(c => c.id === entry.classroomId);

    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.SCHEDULE_ENTRY,
        item: entry,
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
    }), [entry]);

    if (!subject || !teacher || !classroom) return null;

    return (
        <div ref={drag as any} className={`p-1.5 rounded-md text-xs bg-blue-100 border border-blue-200 h-full flex flex-col justify-center cursor-grab ${isDragging ? 'opacity-30' : ''}`}>
            <p className="font-bold truncate" title={subject.name}>{subject.name}</p>
            <p className="truncate text-gray-700" title={teacher.name}>{teacher.name}</p>
            <p className="font-medium text-gray-600">Ауд. {classroom.number}</p>
        </div>
    );
};


const UniversityWideSchedule: React.FC<UniversityWideScheduleProps> = ({ setViewDate, setActiveView }) => {
  const { schedule, groups, subjects, teachers, classrooms, timeSlots, settings, streams, placeItemInGrid, productionCalendar } = useStore();
  const [currentDate, setCurrentDate] = useState(toYYYYMMDD(new Date()));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [groupSortOrder, setGroupSortOrder] = useState<'asc' | 'desc'>('asc');
  
  const weekDays = useMemo(() => getWeekDays(new Date(currentDate)), [currentDate]);
  const weekStart = useMemo(() => toYYYYMMDD(weekDays[0]), [weekDays]);
  const weekEnd = useMemo(() => toYYYYMMDD(weekDays[5]), [weekDays]);
  
  const weekType = useMemo(() => getWeekType(new Date(currentDate), new Date(settings.semesterStart)), [currentDate, settings.semesterStart]);
  const effectiveWeekType = settings.useEvenOddWeekSeparation ? weekType : 'every';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const groupsByCourse = useMemo(() => {
    return groups.reduce((acc, group) => {
        const course = group.course;
        if (!acc[course]) acc[course] = [];
        acc[course].push(group);
        acc[course].sort((a, b) => {
            if (groupSortOrder === 'asc') {
                return a.number.localeCompare(b.number, undefined, { numeric: true });
            } else {
                return b.number.localeCompare(a.number, undefined, { numeric: true });
            }
        });
        return acc;
    }, {} as Record<number, Group[]>);
  }, [groups, groupSortOrder]);

  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduleEntry>();
    const relevantSchedule = schedule.filter(entry => {
        if (entry.date) {
            return entry.date >= weekStart && entry.date <= weekEnd;
        }
        return entry.weekType === 'every' || entry.weekType === effectiveWeekType;
    });

    relevantSchedule.forEach(entry => {
        const dayIndex = DAYS_OF_WEEK.indexOf(entry.day);
        if (dayIndex === -1 && !entry.date) return;
        const date = entry.date || toYYYYMMDD(weekDays[dayIndex]);
        
        const involvedGroupIds = entry.groupIds || (entry.groupId ? [entry.groupId] : []);
        
        involvedGroupIds.forEach(gid => {
            const key = `${gid}-${date}-${entry.timeSlotId}`;
            map.set(key, entry);
        });
    });
    return map;
  }, [schedule, weekStart, weekEnd, effectiveWeekType, weekDays]);

    // Compute set of busy teachers for the current view to perform conflict checking
    const busyTeachers = useMemo(() => {
        const busy = new Set<string>();
        // We check the entire schedule because a teacher might be busy on this day
        // even if the entry itself is not "in view" (e.g., different group or different week type that overlaps).
        schedule.forEach(entry => {
            // Determine effective date(s) for this entry
            let datesToCheck: string[] = [];
            if (entry.date) {
                datesToCheck.push(entry.date);
            } else {
                // For template entries, we check if they apply to any date in the current week view
                // to provide instant feedback for the currently visible days.
                const dayIndex = DAYS_OF_WEEK.indexOf(entry.day);
                if (dayIndex !== -1) {
                    const dateInCurrentWeek = weekDays[dayIndex];
                    const dateStr = toYYYYMMDD(dateInCurrentWeek);
                    
                    // Check if the template applies to this week type
                    const entryApplies = entry.weekType === 'every' || entry.weekType === effectiveWeekType;
                    if (entryApplies) {
                        datesToCheck.push(dateStr);
                    }
                }
            }

            datesToCheck.forEach(d => {
                busy.add(`${entry.teacherId}-${d}-${entry.timeSlotId}`);
            });
        });
        return busy;
    }, [schedule, weekDays, effectiveWeekType]);


  const handleDateSelect = (date: Date) => {
    setCurrentDate(toYYYYMMDD(date));
    setIsDatePickerOpen(false);
  };
  
  const getFormattedDate = () => {
      const date = new Date(currentDate);
      return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const sortedTimeSlots = [...timeSlots].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
            <div className="flex items-center">
                <DocumentSearchIcon className="h-8 w-8 text-blue-600 mr-3" />
                <h2 className="text-2xl font-bold text-gray-800">Сводное расписание</h2>
            </div>
            <div className="flex items-center flex-wrap gap-2 sm:gap-4">
                <div ref={datePickerRef} className="relative">
                    <button 
                      onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} 
                      className="w-64 bg-blue-600 text-white font-semibold py-2 px-4 rounded-md flex justify-between items-center hover:bg-blue-700 transition"
                    >
                      <span>{getFormattedDate()}</span>
                      <ChevronDownIcon className={`w-5 h-5 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isDatePickerOpen && <DatePicker selectedDate={new Date(currentDate)} onSelect={handleDateSelect} onClose={() => setIsDatePickerOpen(false)} />}
                </div>
                {settings.useEvenOddWeekSeparation && (
                  <span className={`px-3 py-1 text-sm rounded-md font-semibold ${weekType === 'odd' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                      {weekType === 'odd' ? 'Нечётная' : 'Чётная'}
                  </span>
                )}
            </div>
          </div>
          
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="p-2 border-r border-b text-sm font-semibold text-gray-600 sticky left-0 bg-gray-100 z-20 min-w-[120px]">
                     <button onClick={() => setGroupSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="flex items-center gap-1 w-full text-left font-semibold">
                        Группа {groupSortOrder === 'asc' ? '▲' : '▼'}
                    </button>
                  </th>
                  {weekDays.map(date => (
                    <th key={toYYYYMMDD(date)} colSpan={sortedTimeSlots.length} className="p-2 border-r border-b font-semibold text-gray-600">
                      {DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1]}, {date.getDate()}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="p-2 border-r font-semibold text-gray-600 sticky left-0 bg-gray-100 z-20 min-w-[120px]"></th>
                  {weekDays.flatMap(_ => 
                    sortedTimeSlots.map(slot => (
                      <th key={slot.id} className="p-2 border-r text-xs font-medium text-gray-500 min-w-[150px]">{slot.time}</th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {Object.keys(groupsByCourse).sort((a,b) => Number(a)-Number(b)).map(course => (
                  <React.Fragment key={course}>
                    <tr>
                      <td colSpan={1 + weekDays.length * sortedTimeSlots.length} className="p-2 bg-blue-600 text-white font-bold sticky left-0 z-20">
                        {course} Курс
                      </td>
                    </tr>
                    {groupsByCourse[Number(course)].map(group => (
                      <tr key={group.id} className="hover:bg-gray-50">
                        <td className="p-2 border-r font-semibold text-gray-800 sticky left-0 bg-white hover:bg-gray-50 z-10 min-w-[120px]">
                          {group.number}
                        </td>
                        {weekDays.flatMap(day => 
                          sortedTimeSlots.map(slot => {
                            const dateStr = toYYYYMMDD(day);
                            const key = `${group.id}-${dateStr}-${slot.id}`;
                            const entry = scheduleMap.get(key);
                            
                            const [{ isOver, canDrop }, drop] = useDrop(() => ({
                                accept: [ItemTypes.SCHEDULE_ENTRY, ItemTypes.UNSCHEDULED_ENTRY],
                                canDrop: (item: any, monitor) => {
                                    // --- STRICT VALIDATION LOGIC ---

                                    // 1. Check if cell is already occupied
                                    if (scheduleMap.has(key)) return false;

                                    // Allow dropping on same date/time/group (no-op move), but restrict others.
                                    if (monitor.getItemType() === ItemTypes.SCHEDULE_ENTRY) {
                                        const originalEntry = item as ScheduleEntry;
                                        if (originalEntry.date === dateStr && originalEntry.timeSlotId === slot.id && (originalEntry.groupIds || [originalEntry.groupId]).includes(group.id)) {
                                            return false; // No need to drop on self
                                        }
                                    }

                                    // 2. Check Production Calendar
                                    if (settings.respectProductionCalendar) {
                                        const dayInfo = productionCalendar.find(e => e.date === dateStr);
                                        if (dayInfo && !dayInfo.isWorkDay) return false;
                                    }
                                    
                                    // 3. Check Availability Grid (Forbidden)
                                    const dayName = DAYS_OF_WEEK[day.getDay() === 0 ? 6 : day.getDay() - 1];
                                    if (!settings.allowManualOverrideOfForbidden) {
                                        const teacher = teachers.find(t => t.id === item.teacherId);
                                        if (teacher?.availabilityGrid?.[dayName]?.[slot.id] === AvailabilityType.Forbidden) return false;
                                        if (group.availabilityGrid?.[dayName]?.[slot.id] === AvailabilityType.Forbidden) return false;
                                    }
                                    
                                    // 4. Check Teacher Conflict
                                    // Check if teacher is busy in ANY other group at this time.
                                    // If the 'item' is an existing entry being moved, 'busyTeachers' will contain its current position.
                                    // We must ensure we don't block the move because of the entry's *current* position, 
                                    // but we DO block if the teacher is busy in *another* group/slot at the target time.
                                    
                                    const teacherTargetKey = `${item.teacherId}-${dateStr}-${slot.id}`;
                                    
                                    // Special case for moving an existing entry:
                                    // The busy set includes where the teacher IS currently. 
                                    // If we move Entry A from (T1, Slot 1) to (T1, Slot 2).
                                    // busyTeachers has { (T1, Slot 1) }.
                                    // We check if busyTeachers has (T1, Slot 2).
                                    // If it does, it means there is ANOTHER entry B at Slot 2. Conflict!
                                    // If it doesn't, Slot 2 is free for T1.
                                    
                                    if (busyTeachers.has(teacherTargetKey)) {
                                        return false;
                                    }

                                    return true;
                                },
                                drop: (item: UnscheduledEntry | ScheduleEntry) => {
                                    try {
                                        placeItemInGrid(item, group.id, dateStr, slot.id);
                                    } catch (error: any) {
                                        alert(error.message);
                                    }
                                },
                                collect: (monitor) => ({
                                    isOver: !!monitor.isOver(),
                                    canDrop: !!monitor.canDrop(),
                                }),
                            }), [group, day, slot, scheduleMap, busyTeachers, teachers, settings, productionCalendar]);

                            let cellBg = 'bg-white';
                            if (isOver) {
                                if (canDrop) {
                                    cellBg = 'bg-green-200'; // Valid drop target
                                } else {
                                    cellBg = 'bg-red-100 cursor-not-allowed'; // Invalid target (conflict)
                                }
                            } else if (canDrop) {
                                // Optional: Hint at valid targets when dragging starts? 
                                // keeping it clean for now, only react on hover.
                                // cellBg = 'bg-green-50'; 
                            }


                            return (
                              <td key={`${day}-${slot.id}`} ref={drop as any} className={`border h-24 align-top transition-colors ${cellBg}`}>
                                {entry && <DraggableEntryCell entry={entry} />}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
                 {groups.length === 0 && (
                    <tr>
                        <td colSpan={1 + weekDays.length * sortedTimeSlots.length} className="text-center py-16 text-gray-500">
                            <p className="font-semibold">Нет групп для отображения</p>
                            <p className="text-sm">Добавьте группы в справочнике "Группы".</p>
                        </td>
                    </tr>
                 )}
              </tbody>
            </table>
          </div>
        </div>
        <UnscheduledDeck />
    </div>
  );
};

export default UniversityWideSchedule;