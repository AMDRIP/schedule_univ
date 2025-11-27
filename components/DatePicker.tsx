import React, { useState, useMemo } from 'react';
import { toYYYYMMDD } from '../utils/dateUtils';
import { ChevronUpIcon, ChevronDownIcon } from './icons';

interface DatePickerProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

const DatePicker: React.FC<DatePickerProps> = ({ selectedDate, onSelect }) => {
  const [displayDate, setDisplayDate] = useState(new Date(selectedDate));

  const calendarData = useMemo(() => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const dayOfWeekOfFirst = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1; // Monday is 0

    const calendarStartDate = new Date(firstDayOfMonth);
    calendarStartDate.setDate(calendarStartDate.getDate() - dayOfWeekOfFirst);

    const days = [];
    const currentDate = new Date(calendarStartDate);

    for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
        days.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return days;
  }, [displayDate]);
  
  const changeMonth = (delta: number) => {
      setDisplayDate(prev => {
          const newDate = new Date(prev);
          newDate.setDate(1); // Avoid issues with different month lengths
          newDate.setMonth(newDate.getMonth() + delta);
          return newDate;
      });
  };

  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const selectedDateStr = toYYYYMMDD(selectedDate);
  const todayStr = toYYYYMMDD(new Date());

  return (
    <div className="absolute top-full mt-2 w-72 bg-gray-700 text-white rounded-lg shadow-2xl p-4 z-50 animate-fade-in-up">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-lg">
          {displayDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex items-center">
            <button onClick={() => changeMonth(-1)} className="p-1 rounded-full hover:bg-gray-600">
                <ChevronUpIcon className="w-5 h-5" />
            </button>
            <button onClick={() => changeMonth(1)} className="p-1 rounded-full hover:bg-gray-600">
                <ChevronDownIcon className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-sm text-gray-400 mb-2">
        {weekdays.map(day => <div key={day}>{day}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarData.map((date, index) => {
            const dateStr = toYYYYMMDD(date);
            const isSelected = dateStr === selectedDateStr;
            const isToday = dateStr === todayStr;
            const isCurrentMonth = date.getMonth() === displayDate.getMonth();

            const buttonClasses = `
              w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-150
              ${isCurrentMonth ? 'text-white' : 'text-gray-400'}
              ${!isSelected && 'hover:bg-gray-600'}
              ${isSelected ? 'bg-blue-500 font-bold' : ''}
              ${isToday && !isSelected ? 'ring-1 ring-gray-400' : ''}
            `;

            return (
              <button key={index} onClick={() => onSelect(date)} className={buttonClasses}>
                {date.getDate()}
              </button>
            );
        })}
      </div>
       <div className="mt-4 flex justify-center">
          <button onClick={() => onSelect(new Date())} className="text-sm text-blue-400 hover:text-blue-300">
              Перейти к сегодняшнему дню
          </button>
       </div>
    </div>
  );
};

export default DatePicker;
