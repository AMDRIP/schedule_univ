
import { Type } from '@google/genai';


export enum Role {
  Student = 'Студент',
  Teacher = 'Преподаватель',
  Methodist = 'Методист',
  Admin = 'Администратор',
}

export interface ClassroomType extends BaseItem {
  name: string;
}

export enum ClassType {
  Lecture = 'Лекция',
  Practical = 'Практика',
  Lab = 'Лабораторная',
  Consultation = 'Консультация',
  Test = 'Зачёт',
  Exam = 'Экзамен',
  Elective = 'Факультатив',
}

export enum AvailabilityType {
  Allowed = 'Разрешено',
  Desirable = 'Желательно',
  Undesirable = 'Нежелательно',
  Forbidden = 'Запрещено',
}

export enum AttestationType {
  Exam = 'Экзамен',
  Test = 'Зачёт',
  DifferentiatedTest = 'Диф. зачёт',
}

export enum FormOfStudy {
  FullTime = 'Очная',
  PartTime = 'Заочная',
  Mixed = 'Очно-заочная',
}

export enum DeliveryMode {
  Offline = 'Офлайн',
  Online = 'Онлайн',
}

export interface AvailabilityGrid {
  [day: string]: { [timeSlotId: string]: AvailabilityType };
}

export type WeekType = 'even' | 'odd' | 'every';

export interface BaseItem {
  id: string;
}

export interface Faculty extends BaseItem { name: string; }
export interface Department extends BaseItem { name: string; facultyId: string; specialtyIds?: string[]; }
export interface Teacher extends BaseItem { 
  name: string; 
  departmentId: string; 
  availabilityGrid?: AvailabilityGrid; 
  pinnedClassroomId?: string; 
  regalia?: string;
  academicDegree?: string;
  photoUrl?: string;
  hireDate?: string;
}
export interface Group extends BaseItem { 
  number: string; 
  departmentId: string; 
  studentCount: number; 
  course: number;
  specialtyId: string;
  formOfStudy: FormOfStudy;
  availabilityGrid?: AvailabilityGrid; 
  pinnedClassroomId?: string;
}
export interface Stream extends BaseItem { name: string; groupIds: string[]; }
export interface Classroom extends BaseItem { number: string; capacity: number; typeId: string; availabilityGrid?: AvailabilityGrid; }
export interface Cabinet extends BaseItem { number: string; departmentId: string; }
export interface TimeSlot extends BaseItem { time: string; }
export interface Subject extends BaseItem {
  name: string;
  availabilityGrid?: AvailabilityGrid;
  pinnedClassroomId?: string;
  suitableClassroomTypeIds?: string[];
}

export interface UGS extends BaseItem {
  code: string;
  name: string;
}

export interface Specialty extends BaseItem {
  code: string;
  name: string;
  ugsId: string;
  oksoCode?: string;
}

export interface PlanEntry {
  subjectId: string;
  semester: number;
  lectureHours: number;
  practiceHours: number;
  labHours: number;
  attestation: AttestationType;
  splitForSubgroups?: boolean;
}

export interface EducationalPlan extends BaseItem {
  specialtyId: string;
  entries: PlanEntry[];
}


export interface TeacherSubjectLink extends BaseItem {
  teacherId: string;
  subjectId: string;
  classTypes: ClassType[];
}

export enum RuleType {
  Prohibition = 'Запрет',
  Requirement = 'Требование',
  Preference = 'Предпочтение',
}
export type RuleTarget = 'teachers' | 'groups' | 'classrooms' | 'subjects';

export interface SchedulingRule extends BaseItem {
  description: string;
  type: RuleType;
  target: RuleTarget;
  day: string;
  timeSlotId: string;
  targetId: string;
}

export enum ProductionCalendarEventType {
  Holiday = 'Государственный праздник',
  PreHoliday = 'Предпраздничный день',
  MovedHoliday = 'Перенесенный выходной',
  RegionalHoliday = 'Региональный праздник',
  SpecialWorkday = 'Особый рабочий день',
}

export interface ProductionCalendarEvent extends BaseItem {
  date: string; 
  name: string;
  isWorkDay: boolean;
  type: ProductionCalendarEventType;
}

export interface SchedulingSettings {
  semesterStart: string;
  semesterEnd: string;
  sessionStart: string;
  sessionEnd: string;
  practiceStart: string;
  practiceEnd: string;
  retakeStart: string;
  retakeEnd: string;
  defaultBreakMinutes: number;
  allowWindows: boolean;
  useEvenOddWeekSeparation: boolean;
  showDegreeInSchedule: boolean;
}

export interface ScheduleEntry extends BaseItem {
  day: string;
  timeSlotId: string;
  groupId: string;
  subgroupId?: string;
  subjectId: string;
  teacherId: string;
  classroomId: string;
  classType: ClassType;
  weekType: WeekType;
  deliveryMode: DeliveryMode;
  unscheduledUid?: string;
  date?: string; // For one-off events like exams
}

export interface UnscheduledEntry {
  uid: string;
  subjectId: string;
  groupId: string;
  subgroupId?: string;
  classType: ClassType;
  teacherId: string;
  // Heuristic-specific properties
  streamId?: string;
  studentCount: number;
}

export interface ScheduleTemplate extends BaseItem {
  name: string;
  description: string;
  entries: ScheduleEntry[];
}

export interface Subgroup extends BaseItem {
  name: string;
  parentGroupId: string;
  studentCount: number;
  teacherAssignments?: {
    subjectId: string;
    teacherId: string;
    classType: ClassType;
  }[];
}

export interface Elective extends BaseItem {
  name: string;
  subjectId: string;
  teacherId: string;
  groupId: string;
  hoursPerSemester: number;
}

export type DataItem = Faculty | Department | Teacher | Group | Stream | Classroom | Subject | Cabinet | TimeSlot | TeacherSubjectLink | SchedulingRule | ProductionCalendarEvent | UGS | Specialty | EducationalPlan | ScheduleTemplate | ClassroomType | Subgroup | Elective;
export type DataType = 'faculties' | 'departments' | 'teachers' | 'groups' | 'streams' | 'classrooms' | 'subjects' | 'cabinets' | 'timeSlots' | 'teacherSubjectLinks' | 'schedulingRules' | 'productionCalendar' | 'ugs' | 'specialties' | 'educationalPlans' | 'scheduleTemplates' | 'classroomTypes' | 'subgroups' | 'electives';

// Интерфейс для API, предоставляемого через preload.js в Electron
export interface IElectronAPI {
  getApiKey: () => Promise<string | undefined>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
