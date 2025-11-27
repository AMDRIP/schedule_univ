
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import { toYYYYMMDD } from '../utils/dateUtils';

// NOTE: This is a simplified version of ChevronRight, as it wasn't in the original icons file
// const ChevronRightIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
//   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" {...props}>
//     <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
//   </svg>
// );


type DayType = 'study' | 'session' | 'practice' | 'retake' | 'holiday' | 'weekend' | 'other';

const DAY_TYPE_STYLES: Record<DayType, { bg: string; border: string; text: string; label: string }> = {
    study:    { bg: 'bg-blue-100',    border: 'border-blue-200', text: 'text-blue-900',   label: 'Учебный период' },
    session:  { bg: 'bg-red-100',     border: 'border-red-200', text: 'text-red-900',      label: 'Сессия' },
    practice: { bg: 'bg-yellow-100',  border: 'border-yellow-200', text: 'text-yellow-900', label: 'Практика' },
    retake:   { bg: 'bg-orange-100',  border: 'border-orange-200', text: 'text-orange-900', label: 'Пересдачи' },
    holiday:  { bg: 'bg-gray-200',    border: 'border-gray-300', text: 'text-gray-800',   label: 'Праздник/Выходной' },
    weekend:  { bg: 'bg-white',       border: 'border-gray-200', text: 'text-gray-500',   label: 'Выходной' },
    other:    { bg: 'bg-white',       border: 'border-gray-200', text: 'text-gray-800',   label: 'Другое' },
};

interface AcademicCalendarViewProps {
  setViewDate: (date: string) => void;
  setActiveView: (view: string) => void;
}

const AcademicCalendarView: React.FC<AcademicCalendarViewProps> = ({ setViewDate, setActiveView }) => {
  const { settings, productionCalendar } = useStore();
  const [displayDate, setDisplayDate] = useState(new Date(settings.semesterStart || new Date()));

  const getDayInfo = (date: Date): { type: DayType, name: string } => {
      const dateStr = toYYYYMMDD(date);
      const dayOfWeek = date.getDay();

      const holiday = productionCalendar.find(d => d.date === dateStr && !d.isWorkDay);
      if (holiday) return { type: 'holiday', name: holiday.name };

      const time = date.getTime();
      const inRange = (start: string, end: string) => {
        if (!start || !end) return false;
        const startTime = new Date(start + 'T00:00:00').getTime();
        const endTime = new Date(end + 'T23:59:59').getTime();
        return !isNaN(startTime) && !isNaN(endTime) && time >= startTime && time <= endTime;
      };
      
      if (inRange(settings.sessionStart, settings.sessionEnd)) return { type: 'session', name: 'Сессия' };
      if (inRange(settings.retakeStart, settings.retakeEnd)) return { type: 'retake', name: 'Пересдачи' };
      if (inRange(settings.practiceStart, settings.practiceEnd)) return { type: 'practice', name: 'Практика' };
      
      if (dayOfWeek === 0 || dayOfWeek === 6) return { type: 'weekend', name: 'Выходной' };

      if (inRange(settings.semesterStart, settings.semesterEnd)) return { type: 'study', name: 'Учебный день' };
      
      return { type: 'other', name: '' };
  };
  
  const calendarData = useMemo(() => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const dayOfWeekOfFirst = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1; // Monday is 0

    const calendarStartDate = new Date(firstDayOfMonth);
    calendarStartDate.setDate(calendarStartDate.getDate() - dayOfWeekOfFirst);

    const days = [];
    const currentDate = new Date(calendarStartDate);

    for (let i = 0; i < 42; i++) { // 6 weeks * 7 days = 42 cells
        days.push({
            date: new Date(currentDate),
            dayOfMonth: currentDate.getDate(),
            isCurrentMonth: currentDate.getMonth() === month,
            ...getDayInfo(currentDate),
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
  }, [displayDate, settings, productionCalendar]);

  const changeMonth = (delta: number) => {
      setDisplayDate(prev => {
          const newDate = new Date(prev);
          newDate.setDate(1); // Avoid month-end issues
          newDate.setMonth(newDate.getMonth() + delta);
          return newDate;
      });
  };
  
  const handleDayClick = (date: Date) => {
    setViewDate(toYYYYMMDD(date));
    setActiveView('Просмотр расписания');
  };

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Академический календарь</h2>
        </div>
        <div className="flex items-center select-none">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"><ChevronLeftIcon /></button>
          <span className="w-48 text-center font-semibold text-lg text-gray-700 capitalize">{displayDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</span>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"><ChevronRightIcon /></button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {weekdays.map(day => (
          <div key={day} className="text-center font-medium text-gray-500 p-2 text-sm">{day}</div>
        ))}
        {calendarData.map((day, index) => {
            const style = DAY_TYPE_STYLES[day.type];
            const isNotInCurrentMonth = !day.isCurrentMonth;

            return (
              <div 
                key={index} 
                title={day.name}
                onClick={() => handleDayClick(day.date)}
                className={`h-20 border rounded-lg p-2 text-sm transition-shadow cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-400 ${style.bg} ${style.border}`}
              >
                  <span className={`font-semibold ${isNotInCurrentMonth ? 'text-gray-400' : style.text}`}>
                    {day.dayOfMonth}
                  </span>
              </div>
            );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
        {Object.values(DAY_TYPE_STYLES).filter(s => s.label !== 'Выходной' && s.label !== 'Другое').map(style => (
            <div key={style.label} className="flex items-center">
                <div className={`w-4 h-4 rounded-sm mr-2 ${style.bg} ${style.border}`}></div>
                <span className="text-sm text-gray-700">{style.label}</span>
            </div>
        ))}
      </div>
    </div>
  );
};

export default AcademicCalendarView;
