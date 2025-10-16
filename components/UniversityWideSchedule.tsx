import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { Group, ScheduleEntry, Stream } from '../types';
import { getWeekDays, toYYYYMMDD, getWeekType } from '../utils/dateUtils';
import { DAYS_OF_WEEK } from '../constants';
import DatePicker from './DatePicker';
import { ChevronDownIcon, DocumentSearchIcon } from './icons';

interface UniversityWideScheduleProps {
  setViewDate: (date: string) => void;
  setActiveView: (view: string) => void;
}

const EntryCell: React.FC<{ entry: ScheduleEntry }> = ({ entry }) => {
  const { subjects, teachers, classrooms } = useStore();
  const subject = subjects.find(s => s.id === entry.subjectId);
  const teacher = teachers.find(t => t.id === entry.teacherId);
  const classroom = classrooms.find(c => c.id === entry.classroomId);

  if (!subject || !teacher || !classroom) return null;

  return (
    <div className="p-1.5 rounded-md text-xs bg-blue-100 border border-blue-200 h-full flex flex-col justify-center">
      <p className="font-bold truncate" title={subject.name}>{subject.name}</p>
      <p className="truncate text-gray-700" title={teacher.name}>{teacher.name}</p>
      <p className="font-medium text-gray-600">Ауд. {classroom.number}</p>
    </div>
  );
};

const UniversityWideSchedule: React.FC<UniversityWideScheduleProps> = ({ setViewDate, setActiveView }) => {
  const { schedule, groups, subjects, teachers, classrooms, timeSlots, settings, streams } = useStore();
  const [currentDate, setCurrentDate] = useState(toYYYYMMDD(new Date()));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  
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
        acc[course].sort((a, b) => a.number.localeCompare(b.number));
        return acc;
    }, {} as Record<number, Group[]>);
  }, [groups]);

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
              <th className="p-2 border-r border-b text-sm font-semibold text-gray-600 sticky left-0 bg-gray-100 z-20 min-w-[120px]">Группа</th>
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
                        const key = `${group.id}-${toYYYYMMDD(day)}-${slot.id}`;
                        const entry = scheduleMap.get(key);
                        return (
                          <td key={`${day}-${slot.id}`} className="border h-24 align-top">
                            {entry && <EntryCell entry={entry} />}
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
  );
};

export default UniversityWideSchedule;