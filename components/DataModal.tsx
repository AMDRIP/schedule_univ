

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { DataItem, DataType, ClassroomType, Group, ProductionCalendarEventType, FormOfStudy, Elective, Subgroup, ClassType } from '../types';
import AvailabilityGridEditor from './AvailabilityGridEditor';
import { PlusIcon, TrashIcon } from './icons';

const OKSO_CODES = [
    { code: "01.03.01", name: "Математика" },
    { code: "01.03.02", name: "Прикладная математика и информатика" },
    { code: "01.03.03", name: "Механика и математическое моделирование" },
    { code: "01.03.04", name: "Прикладная математика" },
    { code: "01.03.05", name: "Статистика" },
    { code: "02.03.01", name: "Математика и компьютерные науки" },
    { code: "02.03.02", name: "Фундаментальная информатика и информационные технологии" },
    { code: "02.03.03", name: "Математическое обеспечение и администрирование информационных систем" },
    { code: "03.03.01", name: "Прикладные математика и физика" },
    { code: "03.03.02", name: "Физика" },
    { code: "03.03.03", name: "Радиофизика" },
    { code: "04.03.01", name: "Химия" },
    { code: "04.03.02", name: "Химия, физика и механика материалов" },
    { code: "05.03.01", name: "Геология" },
    { code: "05.03.02", name: "География" },
    { code: "05.03.03", name: "Картография и геоинформатика" },
    { code: "05.03.04", name: "Гидрометеорология" },
    { code: "05.03.05", name: "Прикладная гидрометеорология" },
    { code: "05.03.06", name: "Экология и природопользование" },
    { code: "06.03.01", name: "Биология" },
    { code: "06.03.02", name: "Почвоведение" },
    { code: "07.03.01", name: "Архитектура" },
    { code: "07.03.02", name: "Реконструкция и реставрация архитектурного наследия" },
    { code: "07.03.03", name: "Дизайн архитектурной среды" },
    { code: "07.03.04", name: "Градостроительство" },
    { code: "08.03.01", name: "Строительство" },
    { code: "09.03.01", name: "Информатика и вычислительная техника" },
    { code: "09.03.02", name: "Информационные системы и технологии" },
    { code: "09.03.03", name: "Прикладная информатика" },
    { code: "09.03.04", name: "Программная инженерия" },
    { code: "10.03.01", name: "Информационная безопасность" },
    { code: "11.03.01", name: "Радиотехника" },
    { code: "11.03.02", name: "Инфокоммуникационные технологии и системы связи" },
    { code: "11.03.03", name: "Конструирование и технология электронных средств" },
    { code: "11.03.04", name: "Электроника и наноэлектроника" },
    { code: "12.03.01", name: "Приборостроение" },
    { code: "12.03.02", name: "Оптотехника" },
    { code: "12.03.03", name: "Фотоника и оптоинформатика" },
    { code: "12.03.04", name: "Биотехнические системы и технологии" },
    { code: "12.03.05", name: "Лазерная техника и лазерные технологии" },
    { code: "13.03.01", name: "Теплоэнергетика и теплотехника" },
    { code: "13.03.02", name: "Электроэнергетика и электротехника" },
    { code: "13.03.03", name: "Энергетическое машиностроение" },
    { code: "14.03.01", name: "Ядерная энергетика и теплофизика" },
    { code: "14.03.02", name: "Ядерные физика и технологии" },
    { code: "15.03.01", name: "Машиностроение" },
    { code: "15.03.02", name: "Технологические машины и оборудование" },
    { code: "15.03.03", name: "Прикладная механика" },
    { code: "15.03.04", name: "Автоматизация технологических процессов и производств" },
    { code: "15.03.05", name: "Конструкторско-технологическое обеспечение машиностроительных производств" },
    { code: "15.03.06", name: "Мехатроника и робототехника" },
    { code: "16.03.01", name: "Техническая физика" },
    { code: "16.03.02", name: "Высокотехнологические плазменные и энергетические установки" },
    { code: "16.03.03", name: "Холодильная, криогенная техника и системы жизнеобеспечения" },
    { code: "17.03.01", name: "Корабельное вооружение" },
    { code: "18.03.01", name: "Химическая технология" },
    { code: "18.03.02", name: "Энерго- и ресурсосберегающие процессы в химической технологии, нефтехимии и биотехнологии" },
    { code: "19.03.01", name: "Биотехнология" },
    { code: "19.03.02", name: "Продукты питания из растительного сырья" },
    { code: "19.03.03", name: "Продукты питания животного происхождения" },
    { code: "19.03.04", name: "Технология продукции и организация общественного питания" },
    { code: "20.03.01", name: "Техносферная безопасность" },
    { code: "20.03.02", name: "Природообустройство и водопользование" },
    { code: "21.03.01", name: "Нефтегазовое дело" },
    { code: "21.03.02", name: "Землеустройство и кадастры" },
    { code: "22.03.01", name: "Материаловедение и технологии материалов" },
    { code: "22.03.02", name: "Металлургия" },
    { code: "23.03.01", name: "Технология транспортных процессов" },
    { code: "23.03.02", name: "Наземные транспортно-технологические комплексы" },
    { code: "23.03.03", name: "Эксплуатация транспортно-технологических машин и комплексов" },
    { code: "24.03.01", name: "Ракетные комплексы и космонавтика" },
    { code: "24.03.02", name: "Системы управления движением и навигация" },
    { code: "24.03.03", name: "Баллистика и гидроаэродинамика" },
    { code: "24.03.04", name: "Авиастроение" },
    { code: "24.03.05", name: "Двигатели летательных аппаратов" },
    { code: "25.03.01", name: "Техническая эксплуатация летательных аппаратов и двигателей" },
    { code: "25.03.02", name: "Техническая эксплуатация авиационных электросистем и пилотажно-навигационных комплексов" },
    { code: "25.03.03", name: "Аэронавигация" },
    { code: "25.03.04", name: "Эксплуатация аэропортов и обеспечение полетов воздушных судов" },
    { code: "26.03.01", name: "Управление водным транспортом и гидрографическое обеспечение судоходства" },
    { code: "26.03.02", name: "Кораблестроение, океанотехника и системотехника объектов морской инфраструктуры" },
    { code: "27.03.01", name: "Стандартизация и метрология" },
    { code: "27.03.02", name: "Управление качеством" },
    { code: "27.03.03", name: "Системный анализ и управление" },
    { code: "27.03.04", name: "Управление в технических системах" },
    { code: "27.03.05", name: "Инноватика" },
    { code: "28.03.01", name: "Нанотехнологии и микросистемная техника" },
    { code: "28.03.02", name: "Наноинженерия" },
    { code: "28.03.03", name: "Наноматериалы" },
    { code: "29.03.01", name: "Технология изделий легкой промышленности" },
    { code: "29.03.02", name: "Технологии и проектирование текстильных изделий" },
    { code: "29.03.03", name: "Технология полиграфического и упаковочного производства" },
    { code: "29.03.04", name: "Технология художественной обработки материалов" },
    { code: "29.03.05", name: "Конструирование изделий легкой промышленности" },
    { code: "30.05.01", name: "Медицинская биохимия" },
    { code: "30.05.02", name: "Медицинская биофизика" },
    { code: "30.05.03", name: "Медицинская кибернетика" },
    { code: "31.05.01", name: "Лечебное дело" },
    { code: "31.05.02", name: "Педиатрия" },
    { code: "31.05.03", name: "Стоматология" },
    { code: "32.05.01", name: "Медико-профилактическое дело" },
    { code: "33.05.01", name: "Фармация" },
    { code: "35.03.01", name: "Лесное дело" },
    { code: "35.03.02", name: "Технология лесозаготовительных и деревоперерабатывающих производств" },
    { code: "35.03.03", name: "Агрохимия и агропочвоведение" },
    { code: "35.03.04", name: "Агрономия" },
    { code: "35.03.05", name: "Садоводство" },
    { code: "35.03.06", name: "Агроинженерия" },
    { code: "35.03.07", name: "Технология производства и переработки сельскохозяйственной продукции" },
    { code: "35.03.08", name: "Водные биоресурсы и аквакультура" },
    { code: "35.03.09", name: "Промышленное рыболовство" },
    { code: "35.03.10", name: "Ландшафтная архитектура" },
    { code: "36.03.01", name: "Ветеринарно-санитарная экспертиза" },
    { code: "36.03.02", name: "Зоотехния" },
    { code: "37.03.01", name: "Психология" },
    { code: "37.03.02", name: "Конфликтология" },
    { code: "38.03.01", name: "Экономика" },
    { code: "38.03.02", name: "Менеджмент" },
    { code: "38.03.03", name: "Управление персоналом" },
    { code: "38.03.04", name: "Государственное и муниципальное управление" },
    { code: "38.03.05", name: "Бизнес-информатика" },
    { code: "38.03.06", name: "Торговое дело" },
    { code: "38.03.07", name: "Товароведение" },
    { code: "38.03.10", name: "Жилищное хозяйство и коммунальная инфраструктура" },
    { code: "39.03.01", name: "Социология" },
    { code: "39.03.02", name: "Социальная работа" },
    { code: "39.03.03", name: "Организация работы с молодежью" },
    { code: "40.03.01", name: "Юриспруденция" },
    { code: "41.03.01", name: "Зарубежное регионоведение" },
    { code: "41.03.02", name: "Регионоведение России" },
    { code: "41.03.03", name: "Востоковедение и африканистика" },
    { code: "41.03.04", name: "Политология" },
    { code: "41.03.05", name: "Международные отношения" },
    { code: "41.03.06", name: "Публичная политика и социальные науки" },
    { code: "42.03.01", name: "Реклама и связи с общественностью" },
    { code: "42.03.02", name: "Журналистика" },
    { code: "42.03.03", name: "Издательское дело" },
    { code: "42.03.04", name: "Телевидение" },
    { code: "42.03.05", name: "Медиакоммуникации" },
    { code: "43.03.01", name: "Сервис" },
    { code: "43.03.02", name: "Туризм" },
    { code: "43.03.03", name: "Гостиничное дело" },
    { code: "44.03.01", name: "Педагогическое образование" },
    { code: "44.03.02", name: "Психолого-педагогическое образование" },
    { code: "44.03.03", name: "Специальное (дефектологическое) образование" },
    { code: "44.03.04", name: "Профессиональное обучение (по отраслям)" },
    { code: "44.03.05", name: "Педагогическое образование (с двумя профилями подготовки)" },
    { code: "45.03.01", name: "Филология" },
    { code: "45.03.02", name: "Лингвистика" },
    { code: "45.03.03", name: "Фундаментальная и прикладная лингвистика" },
    { code: "45.03.04", name: "Интеллектуальные системы в гуманитарной сфере" },
    { code: "46.03.01", name: "История" },
    { code: "46.03.02", name: "Документоведение и архивоведение" },
    { code: "47.03.01", name: "Философия" },
    { code: "47.03.02", name: "Прикладная этика" },
    { code: "47.03.03", name: "Религиоведение" },
    { code: "48.03.01", name: "Теология" },
    { code: "49.03.01", name: "Физическая культура" },
    { code: "49.03.02", name: "Физическая культура для лиц с отклонениями в состоянии здоровья (адаптивная физическая культура)" },
    { code: "49.03.03", name: "Рекреация и спортивно-оздоровительный туризм" },
    { code: "50.03.01", name: "Искусства и гуманитарные науки" },
    { code: "50.03.02", name: "Изящные искусства" },
    { code: "50.03.03", name: "История искусств" },
    { code: "50.03.04", name: "Теория и история искусств" },
    { code: "51.03.01", name: "Культурология" },
    { code: "51.03.02", name: "Народная художественная культура" },
    { code: "51.03.03", name: "Социально-культурная деятельность" },
    { code: "51.03.04", name: "Музеология и охрана объектов культурного и природного наследия" },
    { code: "51.03.05", name: "Режиссура театрализованных представлений и праздников" },
    { code: "51.03.06", name: "Библиотечно-информационная деятельность" },
    { code: "52.03.01", name: "Хореографическое искусство" },
    { code: "52.03.02", name: "Хореографическое исполнительство" },
    { code: "52.03.06", name: "Драматургия" },
    { code: "53.03.01", name: "Музыкальное искусство эстрады" },
    { code: "53.03.02", name: "Музыкально-инструментальное искусство" },
    { code: "53.03.03", name: "Вокальное искусство" },
    { code: "53.03.04", name: "Искусство народного пения" },
    { code: "53.03.05", name: "Дирижирование" },
    { code: "53.03.06", name: "Музыкознание и музыкально-прикладное искусство" },
    { code: "54.03.01", name: "Дизайн" },
    { code: "54.03.02", name: "Декоративно-прикладное искусство и народные промыслы" },
    { code: "54.03.03", name: "Искусство костюма и текстиля" },
    { code: "54.03.04", name: "Реставрация" },
    { code: "55.05.01", name: "Режиссура кино и телевидения" },
    { code: "55.05.02", name: "Кинооператорство" },
    { code: "55.05.03", name: "Киноведение" },
    { code: "55.05.04", name: "Продюсерство" },
    { code: "55.05.05", name: "Звукорежиссура аудиовизуальных искусств" },
    { code: "56.05.01", name: "Тыловое обеспечение" },
    { code: "57.05.01", name: "Применение и эксплуатация специальных систем жизнеобеспечения" },
    { code: "58.03.01", name: "Востоковедение и африканистика" }
];

const UGSN_FROM_OKSO = [
    { code: "01.00.00", name: "Математика и механика" },
    { code: "02.00.00", name: "Компьютерные и информационные науки" },
    { code: "03.00.00", name: "Физика и астрономия" },
    { code: "04.00.00", name: "Химия" },
    { code: "05.00.00", name: "Науки о Земле" },
    { code: "06.00.00", name: "Биологические науки" },
    { code: "07.00.00", name: "Архитектура" },
    { code: "08.00.00", name: "Техника и технологии строительства" },
    { code: "09.00.00", name: "Информатика и вычислительная техника" },
    { code: "10.00.00", name: "Информационная безопасность" },
    { code: "11.00.00", name: "Электроника, радиотехника и системы связи" },
    { code: "12.00.00", name: "Фотоника, приборостроение, оптические и биотехнические системы и технологии" },
    { code: "13.00.00", name: "Электро- и теплоэнергетика" },
    { code: "14.00.00", name: "Ядерная энергетика и технологии" },
    { code: "15.00.00", name: "Машиностроение" },
    { code: "16.00.00", name: "Физико-технические науки и технологии" },
    { code: "17.00.00", name: "Оружие и системы вооружения" },
    { code: "18.00.00", name: "Химические технологии" },
    { code: "19.00.00", name: "Промышленная экология и биотехнологии" },
    { code: "20.00.00", name: "Техносферная безопасность и природообустройство" },
    { code: "21.00.00", name: "Прикладная геология, горное дело, нефтегазовое дело и геодезия" },
    { code: "22.00.00", name: "Технологии материалов" },
    { code: "23.00.00", name: "Техника и технологии наземного транспорта" },
    { code: "24.00.00", name: "Авиационная и ракетно-космическая техника" },
    { code: "25.00.00", name: "Аэронавигация и эксплуатация авиационной и ракетно-космической техники" },
    { code: "26.00.00", name: "Техника и технологии кораблестроения и водного транспорта" },
    { code: "27.00.00", name: "Управление в технических системах" },
    { code: "28.00.00", name: "Нанотехнологии и наноматериалы" },
    { code: "29.00.00", name: "Технологии легкой промышленности" },
    { code: "30.00.00", name: "Фундаментальная медицина" },
    { code: "31.00.00", name: "Клиническая медицина" },
    { code: "32.00.00", name: "Науки о здоровье и профилактическая медицина" },
    { code: "33.00.00", name: "Фармация" },
    { code: "35.00.00", name: "Сельское, лесное и рыбное хозяйство" },
    { code: "36.00.00", name: "Ветеринария и зоотехния" },
    { code: "37.00.00", name: "Психологические науки" },
    { code: "38.00.00", name: "Экономика и управление" },
    { code: "39.00.00", name: "Социология и социальная работа" },
    { code: "40.00.00", name: "Юриспруденция" },
    { code: "41.00.00", name: "Политические науки и регионоведение" },
    { code: "42.00.00", name: "Средства массовой информации и информационно-библиотечное дело" },
    { code: "43.00.00", name: "Сервис и туризм" },
    { code: "44.00.00", name: "Образование и педагогические науки" },
    { code: "45.00.00", name: "Языкознание и литературоведение" },
    { code: "46.00.00", name: "История и археология" },
    { code: "47.00.00", name: "Философия, этика и религиоведение" },
    { code: "48.00.00", name: "Теология" },
    { code: "49.00.00", name: "Физическая культура и спорт" },
    { code: "50.00.00", name: "Искусствознание" },
    { code: "51.00.00", name: "Культуроведение и социокультурные проекты" },
    { code: "52.00.00", name: "Сценические искусства и литературное творчество" },
    { code: "53.00.00", name: "Музыкальное искусство" },
    { code: "54.00.00", name: "Изобразительное и прикладные виды искусств" },
    { code: "55.00.00", name: "Экранные искусства" },
    { code: "56.00.00", name: "Военное управление" },
    { code: "57.00.00", name: "Обеспечение государственной безопасности" },
    { code: "58.00.00", name: "Востоковедение и африканистика" }
];

const TITLE_MAP: Record<DataType, { single: string }> = {
    faculties: { single: 'факультет' },
    departments: { single: 'кафедру' },
    teachers: { single: 'преподавателя' },
    groups: { single: 'группу' },
    streams: { single: 'поток' },
    classrooms: { single: 'аудиторию' },
    subjects: { single: 'дисциплину' },
    cabinets: { single: 'кабинет' },
    timeSlots: { single: 'временной слот' },
    // FIX: Added 'timeSlotsShortened' to TITLE_MAP to satisfy the DataType record type.
    timeSlotsShortened: { single: 'сокращенный слот' },
    teacherSubjectLinks: { single: 'привязку' },
    schedulingRules: { single: 'правило' },
    productionCalendar: { single: 'событие' },
    ugs: { single: 'УГСН' },
    specialties: { single: 'специальность' },
    educationalPlans: { single: 'учебный план' },
    scheduleTemplates: { single: 'шаблон расписания'},
    classroomTypes: { single: 'тип аудитории' },
    subgroups: { single: 'подгруппу' },
    electives: { single: 'факультатив' },
};


interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<DataItem, 'id'> | DataItem) => void;
  item: DataItem | null;
  dataType: DataType;
}

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, onSave, item, dataType }) => {
  const [formData, setFormData] = useState<any>({});
  const { faculties, departments, groups, ugs, specialties, classrooms, classroomTypes, subjects, teachers } = useStore();
  const [selectedCourseForStream, setSelectedCourseForStream] = useState<number | null>(null);

  const getInitialFormData = (type: DataType) => {
    switch (type) {
      case 'faculties': return { name: '' };
      case 'departments': return { name: '', facultyId: faculties[0]?.id || '', specialtyIds: [] };
      case 'teachers': return { name: '', departmentId: departments[0]?.id || '', availabilityGrid: {}, pinnedClassroomId: '', regalia: '', academicDegree: '', photoUrl: '', hireDate: '' };
      case 'groups': return { number: '', departmentId: departments[0]?.id || '', studentCount: 25, course: 1, specialtyId: specialties[0]?.id || '', formOfStudy: FormOfStudy.FullTime, availabilityGrid: {}, pinnedClassroomId: '' };
      case 'streams': return { name: '', groupIds: [] };
      case 'classrooms': return { number: '', capacity: 30, typeId: classroomTypes[0]?.id || '', availabilityGrid: {} };
      case 'subjects': return { name: '', pinnedClassroomId: '', suitableClassroomTypeIds: [] };
      case 'cabinets': return { number: '', departmentId: departments[0]?.id || '' };
      case 'timeSlots': return { time: '00:00-00:00' };
      case 'productionCalendar': return { date: '', name: '', isWorkDay: false, type: ProductionCalendarEventType.Holiday };
      case 'ugs': return { code: '', name: '' };
      case 'specialties': return { code: '', name: '', ugsId: ugs[0]?.id || '', oksoCode: '' };
      case 'scheduleTemplates': return { name: '', description: '', entries: [] };
      case 'classroomTypes': return { name: '' };
      case 'subgroups': return { name: '', parentGroupId: groups[0]?.id || '', studentCount: 12, teacherAssignments: [] };
      case 'electives': return { name: '', subjectId: subjects[0]?.id || '', teacherId: teachers[0]?.id || '', groupId: groups[0]?.id || '', hoursPerSemester: 32 };
      default: return {};
    }
  };
  
  useEffect(() => {
    const initialData = item || getInitialFormData(dataType);
    if (['teachers', 'groups', 'classrooms'].includes(dataType) && !(initialData as any).availabilityGrid) {
        (initialData as any).availabilityGrid = {};
    }
    if (dataType === 'subjects' && !(initialData as any).suitableClassroomTypeIds) {
        (initialData as any).suitableClassroomTypeIds = [];
    }
    if (dataType === 'subgroups' && !(initialData as any).teacherAssignments) {
        (initialData as any).teacherAssignments = [];
    }
    setFormData(initialData);
    if (dataType === 'streams' && item && (item as any).groupIds?.length > 0) {
        const firstGroup = groups.find(g => g.id === (item as any).groupIds[0]);
        setSelectedCourseForStream(firstGroup?.course || null);
    } else {
        setSelectedCourseForStream(null);
    }
  }, [item, dataType]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData((prev: any) => ({ ...prev, [name]: checked }));
        return;
    }

    const numericFields = ['capacity', 'studentCount', 'course', 'hoursPerSemester'];
    setFormData((prev: any) => ({ 
      ...prev, 
      [name]: numericFields.includes(name) ? Number(value) : value 
    }));
  };
  
  const handleAssignmentChange = (index: number, field: string, value: string) => {
    const updatedAssignments = [...(formData.teacherAssignments || [])];
    updatedAssignments[index] = { ...updatedAssignments[index], [field]: value };
    setFormData((prev: any) => ({ ...prev, teacherAssignments: updatedAssignments }));
  };
  
  const addAssignment = () => {
    const newAssignment = {
        subjectId: subjects[0]?.id || '',
        teacherId: teachers[0]?.id || '',
        classType: ClassType.Practical,
    };
    setFormData((prev: any) => ({
        ...prev,
        teacherAssignments: [...(prev.teacherAssignments || []), newAssignment],
    }));
  };

  const removeAssignment = (index: number) => {
    setFormData((prev: any) => ({
        ...prev,
        teacherAssignments: prev.teacherAssignments.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleUgsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    const selectedUgs = UGSN_FROM_OKSO.find(u => u.code === selectedCode);
    if (selectedUgs) {
      setFormData((prev: any) => ({ ...prev, code: selectedUgs.code, name: selectedUgs.name }));
    }
  };
  
  const handleGridChange = (newGrid) => {
      setFormData((prev) => ({ ...prev, availabilityGrid: newGrid }));
  };

  const handleMultiSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, options } = e.target;
      const values = Array.from(options)
        .filter((option: HTMLOptionElement) => option.selected)
        .map((option: HTMLOptionElement) => option.value);

      if (name === 'groupIds') {
          if (values.length === 0) {
              setSelectedCourseForStream(null);
          } else {
              const firstGroup = groups.find(g => g.id === values[0]);
              setSelectedCourseForStream(firstGroup?.course || null);
          }
      }

      setFormData((prev: any) => ({...prev, [name]: values}));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;
  
  const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";
  const showAvailabilityGrid = ['teachers', 'groups', 'classrooms'].includes(dataType);

  const renderDefaultField = (key: string) => {
    if (key === 'id' || key === 'availabilityGrid' || key === 'entries' || key === 'teacherAssignments') return null;
    
    const labelMap: Record<string, string> = {
        name: "ФИО / Название", number: "Номер/Название", time: "Время", capacity: "Вместимость", studentCount: "Кол-во студентов", 
        code: "Код", course: "Курс", oksoCode: "Код ОКСО", description: "Описание", date: "Дата",
        photoUrl: "URL Фотографии", academicDegree: "Ученая степень", regalia: "Регалии, звания", hireDate: "Дата приема на работу",
        hoursPerSemester: 'Часы за семестр',
    };
    
    if (dataType === 'teachers' && key === 'photoUrl') {
        return (
            <div>
                <label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label>
                <div className="flex items-center gap-2">
                    <input type='url' name={key} value={formData[key] || ''} onChange={handleChange} placeholder="https://example.com/photo.jpg" className={defaultInputClass} />
                    {formData.photoUrl && <img src={formData.photoUrl} alt="preview" className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>}
                </div>
            </div>
        );
    }

    if (key === 'description') {
        return <div><label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label><textarea name={key} value={formData[key] || ''} onChange={handleChange} className={`${defaultInputClass} h-24`}/></div>
    }

    switch(key) {
        case 'facultyId': return (
          <div><label className="block text-sm font-medium text-gray-700">Факультет</label><select name="facultyId" value={formData.facultyId} onChange={handleChange} className={defaultInputClass}>{faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        );
        case 'departmentId': return (
          <div><label className="block text-sm font-medium text-gray-700">Кафедра</label><select name="departmentId" value={formData.departmentId} onChange={handleChange} className={defaultInputClass}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        );
        case 'ugsId': return (
          <div><label className="block text-sm font-medium text-gray-700">УГСН</label><select name="ugsId" value={formData.ugsId} onChange={handleChange} className={defaultInputClass}>{ugs.map(u => <option key={u.id} value={u.id}>{u.code} {u.name}</option>)}</select></div>
        );
        case 'specialtyId': return (
          <div><label className="block text-sm font-medium text-gray-700">Специальность</label><select name="specialtyId" value={formData.specialtyId} onChange={handleChange} className={defaultInputClass}>{specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
        );
        case 'parentGroupId': return (
          <div><label className="block text-sm font-medium text-gray-700">Основная группа</label><select name="parentGroupId" value={formData.parentGroupId} onChange={handleChange} className={defaultInputClass}>{groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}</select></div>
        );
        case 'subjectId': return (
          <div><label className="block text-sm font-medium text-gray-700">Дисциплина</label><select name="subjectId" value={formData.subjectId} onChange={handleChange} className={defaultInputClass}>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        );
        case 'teacherId': return (
          <div><label className="block text-sm font-medium text-gray-700">Преподаватель</label><select name="teacherId" value={formData.teacherId} onChange={handleChange} className={defaultInputClass}>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        );
        case 'groupId': return (
          <div><label className="block text-sm font-medium text-gray-700">Группа</label><select name="groupId" value={formData.groupId} onChange={handleChange} className={defaultInputClass}>{groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}</select></div>
        );
        case 'pinnedClassroomId': return (
           <div><label className="block text-sm font-medium text-gray-700">Закрепленная аудитория</label><select name="pinnedClassroomId" value={formData.pinnedClassroomId} onChange={handleChange} className={defaultInputClass}><option value="">Нет</option>{classrooms.map(c => <option key={c.id} value={c.id}>{c.number} ({classroomTypes.find(ct => ct.id === c.typeId)?.name})</option>)}</select></div>
        );
        case 'specialtyIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Специальности (Ctrl/Cmd)</label><select multiple name="specialtyIds" value={formData.specialtyIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
        );
        case 'groupIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Группы в потоке (Ctrl/Cmd)</label><p className="text-xs text-gray-500 mb-1">Можно выбрать только группы одного курса.</p><select multiple name="groupIds" value={formData.groupIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{groups.map(g => <option key={g.id} value={g.id} disabled={selectedCourseForStream !== null && g.course !== selectedCourseForStream}>{g.number} ({g.course} курс)</option>)}</select></div>
        );
         case 'suitableClassroomTypeIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Подходящие типы аудиторий (Ctrl/Cmd)</label><select multiple name="suitableClassroomTypeIds" value={formData.suitableClassroomTypeIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-24`}>{classroomTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}</select></div>
        );
        case 'isWorkDay': return (
            <div className="flex items-center pt-5">
                <input type="checkbox" name="isWorkDay" id="isWorkDay" checked={!!formData.isWorkDay} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="isWorkDay" className="ml-2 block text-sm font-medium text-gray-700">Рабочий день</label>
            </div>
        );
        case 'formOfStudy': return (
            <div>
                <label className="block text-sm font-medium text-gray-700">Форма обучения</label>
                <select name="formOfStudy" value={formData.formOfStudy} onChange={handleChange} className={defaultInputClass}>
                    {Object.values(FormOfStudy).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>
        );
        case 'typeId': 
            if (dataType === 'classrooms') {
                return (
                    <div><label className="block text-sm font-medium text-gray-700">Тип</label><select name="typeId" value={formData.typeId} onChange={handleChange} className={defaultInputClass}>{classroomTypes.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}</select></div>
                );
            }
            return null;
        case 'type':
             if (dataType === 'productionCalendar') {
                return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Тип</label>
                        <select name="type" value={formData.type} onChange={handleChange} className={defaultInputClass}>
                            {Object.values(ProductionCalendarEventType).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                );
            }
            return null;
        case 'oksoCode': return (
           <div>
             <label className="block text-sm font-medium text-gray-700" htmlFor="oksoCode">Код ОКСО</label>
             <input list="okso-codes" id="oksoCode" name="oksoCode" value={formData.oksoCode || ''} onChange={handleChange} className={defaultInputClass} />
             <datalist id="okso-codes">
                {OKSO_CODES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
             </datalist>
           </div>
        );
        default:
            const initialData = getInitialFormData(dataType);
            const isDateField = key === 'date' || key === 'hireDate';
            const inputType = typeof initialData[key] === 'number' ? 'number' : isDateField ? 'date' : 'text';
            return (
                <div><label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label><input type={inputType} name={key} value={formData[key] || ''} onChange={handleChange} className={defaultInputClass} min={key === 'course' ? 1 : undefined}/></div>
            );
    }
  }
  
  const modalTitle = `${item ? 'Редактировать' : 'Добавить'} ${TITLE_MAP[dataType]?.single || 'элемент'}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 ease-out scale-95 opacity-0 animate-fade-in-scale">
        <style>{`
          @keyframes fade-in-scale {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-fade-in-scale {
            animation: fade-in-scale 0.2s forwards;
          }
        `}</style>
        <h2 className="text-xl font-bold mb-4 text-gray-900">{modalTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {Object.keys(getInitialFormData(dataType)).map(key => <div key={key}>{renderDefaultField(key)}</div>)}
          
          {dataType === 'subgroups' && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Назначения преподавателей</h3>
              <div className="space-y-2">
                {(formData.teacherAssignments || []).map((assignment: any, index: number) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2 items-center p-2 bg-gray-50 rounded">
                    <select value={assignment.subjectId} onChange={e => handleAssignmentChange(index, 'subjectId', e.target.value)} className={defaultInputClass}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={assignment.teacherId} onChange={e => handleAssignmentChange(index, 'teacherId', e.target.value)} className={defaultInputClass}>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select value={assignment.classType} onChange={e => handleAssignmentChange(index, 'classType', e.target.value)} className={defaultInputClass}>
                      {[ClassType.Practical, ClassType.Lab, ClassType.Consultation].map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </select>
                    <button type="button" onClick={() => removeAssignment(index)} className="p-2 text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAssignment} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить назначение</button>
            </div>
          )}

          {showAvailabilityGrid && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Сетка доступности</h3>
              <AvailabilityGridEditor grid={formData.availabilityGrid} onGridChange={handleGridChange} />
            </div>
          )}

          <div className="flex justify-end space-x-4 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">Отмена</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DataModal;