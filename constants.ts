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

export const COLOR_PALETTE = [
    { name: 'Серый', value: 'gray' },
    { name: 'Красный', value: 'red' },
    { name: 'Оранжевый', value: 'orange' },
    { name: 'Желтый', value: 'yellow' },
    { name: 'Зеленый', value: 'green' },
    { name: 'Бирюзовый', value: 'teal' },
    { name: 'Синий', value: 'blue' },
    { name: 'Индиго', value: 'indigo' },
    { name: 'Фиолетовый', value: 'purple' },
    { name: 'Розовый', value: 'pink' },
];

export const COLOR_MAP: { [key: string]: { bg: string; border: string; text: string; borderL: string; } } = {
  gray:   { bg: 'bg-gray-100',   border: 'border-gray-300',   text: 'text-gray-800',   borderL: 'border-l-gray-500' },
  red:    { bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-800',    borderL: 'border-l-red-500' },
  orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', borderL: 'border-l-orange-500' },
  yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800', borderL: 'border-l-yellow-500' },
  green:  { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-800',  borderL: 'border-l-green-500' },
  teal:   { bg: 'bg-teal-100',   border: 'border-teal-300',   text: 'text-teal-800',   borderL: 'border-l-teal-500' },
  blue:   { bg: 'bg-blue-100',   border: 'border-blue-300',   text: 'text-blue-800',   borderL: 'border-l-blue-500' },
  indigo: { bg: 'bg-indigo-100', border: 'border-indigo-300', text: 'text-indigo-800', borderL: 'border-l-indigo-500' },
  purple: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-800', borderL: 'border-l-purple-500' },
  pink:   { bg: 'bg-pink-100',   border: 'border-pink-300',   text: 'text-pink-800',   borderL: 'border-l-pink-500' },
};

export const ItemTypes = {
  SCHEDULE_ENTRY: 'scheduleEntry',
  UNSCHEDULED_ENTRY: 'unscheduledEntry',
};


export const UNIVERSITY_POSITIONS = {
  academic: [
    'Ректор',
    'Проректор по учебной работе',
    'Проректор по научной работе',
    'Проректор по административно-хозяйственной части',
    'Декан факультета',
    'Заместитель декана',
    'Заведующий кафедрой',
    'Профессор',
    'Доцент',
    'Старший преподаватель',
    'Преподаватель',
    'Ассистент',
    'Научный сотрудник',
    'Старший научный сотрудник',
    'Ведущий научный сотрудник',
    'Главный научный сотрудник',
  ],
  administrative: [
    'Начальник учебного отдела',
    'Специалист по учебно-методической работе',
    'Методист',
    'Диспетчер',
    'Начальник отдела кадров',
    'Специалист по кадрам',
    'Бухгалтер',
    'Главный бухгалтер',
    'Экономист',
    'Юрисконсульт',
    'Начальник отдела аспирантуры и докторантуры',
    'Секретарь ученого совета',
  ],
  support: [
    'Лаборант',
    'Старший лаборант',
    'Инженер',
    'Системный администратор',
    'Библиотекарь',
    'Заведующий библиотекой',
    'Комендант учебного корпуса',
    'Секретарь-референт',
    'Делопроизводитель',
  ],
};