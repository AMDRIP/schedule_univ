import { ClassType, AvailabilityType, ProductionCalendarEventType } from './types';

export const DAYS_OF_WEEK = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export const CLASS_TYPE_COLORS: { [key in ClassType]: string } = {
    [ClassType.Lecture]: 'bg-blue-100 border-blue-300 text-blue-800',
    [ClassType.Practical]: 'bg-green-100 border-green-300 text-green-800',
    [ClassType.Lab]: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    [ClassType.Consultation]: 'bg-indigo-100 border-indigo-300 text-indigo-800',
    [ClassType.Test]: 'bg-pink-100 border-pink-300 text-pink-800',
    [ClassType.Exam]: 'bg-red-100 border-red-300 text-red-800',
    [ClassType.Elective]: 'bg-purple-100 border-purple-300 text-purple-800',
};

export const AVAILABILITY_COLORS: { [key in AvailabilityType]: { bg: string; text: string; border: string; btn: string; } } = {
  [AvailabilityType.Forbidden]: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-400', btn: 'bg-red-500 hover:bg-red-600 text-white'},
  [AvailabilityType.Undesirable]: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-400', btn: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  [AvailabilityType.Allowed]: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300', btn: 'bg-gray-400 hover:bg-gray-500 text-white' },
  [AvailabilityType.Desirable]: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-400', btn: 'bg-green-500 hover:bg-green-600 text-white' },
};

export const PRODUCTION_CALENDAR_COLORS: { [key in ProductionCalendarEventType]: { bg: string; border: string; text: string; label: string } } = {
    [ProductionCalendarEventType.Holiday]: { bg: 'bg-red-100', border: 'border-red-200', text: 'text-red-900', label: 'Гос. праздник' },
    [ProductionCalendarEventType.PreHoliday]: { bg: 'bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-900', label: 'Предпраздничный' },
    [ProductionCalendarEventType.MovedHoliday]: { bg: 'bg-indigo-100', border: 'border-indigo-200', text: 'text-indigo-900', label: 'Перенесенный выходной' },
    [ProductionCalendarEventType.RegionalHoliday]: { bg: 'bg-purple-100', border: 'border-purple-200', text: 'text-purple-900', label: 'Регион. праздник' },
    [ProductionCalendarEventType.SpecialWorkday]: { bg: 'bg-green-100', border: 'border-green-200', text: 'text-green-900', label: 'Рабочий день' },
};

export const ItemTypes = {
  SCHEDULE_ENTRY: 'scheduleEntry',
  UNSCHEDULED_ENTRY: 'unscheduledEntry',
};