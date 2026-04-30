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

export interface ClassroomTag extends BaseItem {
  name: string;
  icon: string;
  color: string;
}

export enum ClassType {
  Lecture = 'Лекция',
  Practical = 'Практика',
  Lab = 'Лабораторная',
  Consultation = 'Консультация',
  PracticeConsultation = 'Консультация по практике',
  PracticeDefense = 'Защита практики',
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

export enum AcademicDegree {
  Candidate = 'Кандидат наук',
  Doctor = 'Доктор наук',
}

export enum FieldOfScience {
  Agricultural = 'сельскохозяйственных',
  Architectural = 'архитектуры',
  Biological = 'биологических',
  Chemical = 'химических',
  Culturology = 'культурологии',
  Economic = 'экономических',
  Engineering = 'технических',
  Geographical = 'географических',
  GeologicalMineralogical = 'геолого-минералогических',
  Historical = 'исторических',
  ArtHistory = 'искусствоведения',
  Juridical = 'юридических',
  Medical = 'медицинских',
  Pedagogical = 'педагогических',
  Pharmaceutical = 'фармацевтических',
  Philological = 'филологических',
  Philosophical = 'философских',
  PhysicalMathematical = 'физико-математических',
  Political = 'политических',
  Psychological = 'психологических',
  Sociological = 'социологических',
  Theology = 'теологии',
  Veterinary = 'ветеринарных',
}


export enum AcademicTitle {
  Assistant = 'Ассистент',
  Teacher = 'Преподаватель',
  SeniorTeacher = 'Старший преподаватель',
  Docent = 'Доцент',
  Professor = 'Профессор',
  SeniorResearcher = 'Старший научный сотрудник',
}


export interface AvailabilityGrid {
  [day: string]: { [timeSlotId: string]: AvailabilityType };
}

export type WeekType = 'even' | 'odd' | 'every';

export interface BaseItem {
  id: string;
}

export interface Faculty extends BaseItem {
  name: string;
  deanId?: string;
  address?: string;
  phone?: string;
  email?: string;
  notes?: string;
}
export interface Department extends BaseItem {
  name: string;
  facultyId: string;
  specialtyIds?: string[];
  headTeacherId?: string;
  address?: string;
  phone?: string;
  email?: string;
  vkLink?: string;
  telegramLink?: string;
  notes?: string;
}
export interface Teacher extends BaseItem {
  name: string;
  departmentId: string;
  availabilityGrid?: AvailabilityGrid;
  pinnedClassroomId?: string;
  regalia?: string;
  academicDegree?: AcademicDegree;
  fieldOfScience?: FieldOfScience;
  academicTitle?: AcademicTitle;
  photoUrl?: string;
  hireDate?: string;
  color?: string;
}
export interface Group extends BaseItem {
  number: string;
  departmentId: string;
  studentCount: number;
  course: number;
  specialtyId: string;
  formOfStudy: FormOfStudy;
  shift?: StudyShift;
  availabilityGrid?: AvailabilityGrid;
  pinnedClassroomId?: string;
}
export interface Stream extends BaseItem { name: string; groupIds: string[]; }
export type RoomAssignmentCategory = 'educational' | 'administrative' | 'support' | 'utility' | 'public';

export interface RoomResourceMetadata {
  buildingPlanId?: string;
  floorId?: string;
  roomId?: string;
  buildingName?: string;
  floorNumber?: number;
  assignmentCategory?: RoomAssignmentCategory;
  assignmentName?: string;
  color?: string;
}

export interface Classroom extends BaseItem {
  number: string;
  capacity: number;
  typeId: string;
  availabilityGrid?: AvailabilityGrid;
  tagIds?: string[];
  roomMetadata?: RoomResourceMetadata;
}

export interface Cabinet extends BaseItem {
  number: string;
  departmentId: string;
  roomMetadata?: RoomResourceMetadata;
}
export type StudyShift = 'first' | 'second' | 'both';
export type TimeSlotShift = 'first' | 'second';

export interface TimeSlot extends BaseItem {
  time: string;
  shift?: TimeSlotShift;
}
export interface Subject extends BaseItem {
  name: string;
  availabilityGrid?: AvailabilityGrid;
  pinnedClassroomId?: string;
  classroomTypeRequirements?: {
    [key in ClassType]?: string[];
  };
  requiredClassroomTagIds?: string[];
  color?: string;
}

export interface UGS extends BaseItem {
  code: string;
  name: string;
  oksoPrefix?: string;
  professionCodes?: string[];
  description?: string;
}

export interface Specialty extends BaseItem {
  code: string;
  name: string;
  ugsId: string;
  oksoCode?: string;
  professionCodes?: string[];
  profiles?: string[];
  competencies?: string[];
  qualification?: string;
  educationLevel?: 'bachelor' | 'specialist' | 'master' | 'postgraduate' | 'secondary' | 'additional';
  standardCode?: string;
  description?: string;
}

export interface PlanEntry {
  subjectId: string;
  blockId?: string;
  semester: number;
  lectureHours: number;
  practiceHours: number;
  labHours: number;
  attestation: AttestationType;
  splitForSubgroups?: boolean;
}

export interface PlanBlock extends BaseItem {
  name: string;
  color: string;
  description?: string;
}

export interface EducationalPlan extends BaseItem {
  specialtyId: string;
  blocks?: PlanBlock[];
  entries: PlanEntry[];
}

export interface EducationalPlanTemplate extends BaseItem {
  name: string;
  description?: string;
  blocks: PlanBlock[];
  entries: PlanEntry[];
  createdAt: string;
}


export interface TeacherSubjectLink extends BaseItem {
  teacherId: string;
  subjectId: string;
  classTypes: ClassType[];
}

export enum RuleSeverity {
  Strict = 'Строгое требование (нельзя нарушать)',
  Strong = 'Сильное предпочтение',
  Medium = 'Среднее предпочтение',
  Weak = 'Слабое предпочтение',
}

export enum RuleAction {
  AvoidTime = 'Избегать времени/дня',
  RequireTime = 'Требовать время/день',
  PreferTime = 'Предпочитать время/день',
  SameDay = 'Размещать в один день',
  DifferentDay = 'Размещать в разные дни',
  Consecutive = 'Размещать пары подряд',
  MaxPerDay = 'Максимум пар в день',
  MinPerDay = 'Минимум пар в день',
  MaxConsecutive = 'Максимум пар подряд',
  AtMostNGaps = 'Не более N "окон" в день',
  Order = 'Определенный порядок (A перед B)',
  NoOverlap = 'Не пересекать с (по времени)',
  StartAfter = 'Начинать не ранее',
  EndBefore = 'Заканчивать не позднее',
}

export type RuleEntityType = 'teacher' | 'group' | 'subject' | 'classroom' | 'classType' | 'department';

export interface RuleCondition {
  entityType: RuleEntityType;
  entityIds: string[]; // Can be one or more IDs
  classType?: ClassType; // Optional filter
}

export type RuleLogicalOperator = 'AND' | 'OR';

export interface SchedulingRule extends BaseItem {
  description: string;
  severity: RuleSeverity;
  action: RuleAction;
  conditions: RuleCondition[];
  logicalOperators?: RuleLogicalOperator[];
  day?: string;
  timeSlotId?: string;
  param?: number;
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
  respectProductionCalendar: boolean;
  useShortenedPreHolidaySchedule: boolean;
  allowOverbooking: boolean;
  showTeacherDetailsInLists: boolean;
  showScheduleColors: boolean;
  allowManualOverrideOfForbidden: boolean;
  enforceStandardRules: boolean;
  openRouterModel: string;
}

export interface HeuristicConfig {
  strictness: number; // 1-10
  target?: { type: 'group' | 'teacher' | 'classroom'; id: string };
  timeFrame: { start: string; end: string };
  clearExisting: boolean;
  iterations: number;
  enforceLectureOrder: boolean;
  distributeEvenly: boolean;
  seed?: number | string;
  stochasticity?: number; // 0 = always best candidate, 1 = broad randomized choice among top candidates
  useNative?: boolean;
}

export interface SessionSchedulerConfig {
  consultationOffset: number; // 0 for no consultation, 1 for 1 day before, etc.
  restDays: number; // Min days between exams for the same group
  clearExisting: boolean;
  timeFrame: { start: string; end: string };
  scheduleTests: 'like_exams' | 'no_rest_days' | 'none';
  generationMode?: 'full' | 'consultations_only' | 'practice_only' | 'full_with_practice';
  includePracticeConsultations?: boolean;
  includePracticeDefenses?: boolean;
}

export interface LessonPlan {
  topic: string;
  content: string;
  homework: string;
  status?: 'draft' | 'ready' | 'approved';
  goal?: string;
  learningOutcomes?: string;
  stages?: { title: string; minutes?: number; activity: string }[];
  controlQuestions?: string[];
  materials?: string[];
  literature?: string[];
  equipment?: string[];
  assessment?: string;
  teacherNotes?: string;
  updatedAt?: string;
}

export interface ScheduleEntry extends BaseItem {
  day: string;
  timeSlotId: string;
  groupId?: string; // Is now optional
  groupIds?: string[]; // For multi-group/partial stream lectures
  subgroupId?: string;
  subjectId: string;
  teacherId: string;
  classroomId: string;
  classType: ClassType;
  weekType: WeekType;
  streamId?: string;
  deliveryMode: DeliveryMode;
  unscheduledUid?: string;
  date?: string; // For one-off events like exams
  lessonPlan?: LessonPlan;
}

export type SchedulingBottleneck = 'teacher' | 'classroom' | 'group' | 'stream' | 'calendar' | 'rules' | 'data';

export interface SchedulingExplanation {
  summary: string;
  bottleneck: SchedulingBottleneck;
  conflicts: string[];
  resource: string;
  checkedSlots: number;
  checkedClassrooms: number;
  lastRunAt: string;
}

export interface UnscheduledEntry {
  uid: string;
  subjectId: string;
  groupId?: string; // Is now optional
  groupIds?: string[]; // For multi-group/partial stream lectures
  subgroupId?: string;
  classType: ClassType;
  teacherId: string;
  teacherCandidates?: string[];
  streamId?: string;
  studentCount: number;
  deliveryMode?: DeliveryMode;
  classroomTypeIds?: string[];
  requiredClassroomTagIds?: string[];
  pinnedClassroomId?: string;
  preferredTimeSlotIds?: string[];
  targetWeek?: number;
  explanation?: SchedulingExplanation;
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
  classType?: ClassType;
  deliveryMode?: DeliveryMode;
  classroomTypeIds?: string[];
  requiredClassroomTagIds?: string[];
  pinnedClassroomId?: string;
  preferredTimeSlotIds?: string[];
}

export type BuildingTool = 'select' | 'room' | 'door' | 'window' | 'furniture';
export type BuildingRoomResourceKind = 'classroom' | 'cabinet' | 'none';
export type BuildingOpeningKind = 'door' | 'window';
export type BuildingWallSide = 'top' | 'right' | 'bottom' | 'left';
export type FurnitureKind = 'desk' | 'chair' | 'teacherDesk' | 'board' | 'computer' | 'projector' | 'cabinet' | 'shelf' | 'sink' | 'table';

export interface BuildingFurniture extends BaseItem {
  kind: FurnitureKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  label?: string;
}

export interface BuildingOpening extends BaseItem {
  kind: BuildingOpeningKind;
  roomId?: string;
  wallSide?: BuildingWallSide;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface BuildingRoom extends BaseItem {
  number: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
  resourceKind: BuildingRoomResourceKind;
  assignmentCategory: RoomAssignmentCategory;
  assignmentName?: string;
  classroomTypeId?: string;
  departmentId?: string;
  tagIds?: string[];
  color: string;
  notes?: string;
  furniture: BuildingFurniture[];
}

export interface BuildingFloor extends BaseItem {
  name: string;
  number: number;
  width: number;
  height: number;
  rooms: BuildingRoom[];
  openings: BuildingOpening[];
}

export interface BuildingPlan extends BaseItem {
  name: string;
  address?: string;
  floors: BuildingFloor[];
  updatedAt: string;
}

export type DataItem = Faculty | Department | Teacher | Group | Stream | Classroom | Subject | Cabinet | TimeSlot | TeacherSubjectLink | SchedulingRule | ProductionCalendarEvent | UGS | Specialty | EducationalPlan | EducationalPlanTemplate | ScheduleTemplate | ClassroomType | Subgroup | Elective | ClassroomTag | BuildingPlan;
export type DataType = 'faculties' | 'departments' | 'teachers' | 'groups' | 'streams' | 'classrooms' | 'subjects' | 'cabinets' | 'timeSlots' | 'teacherSubjectLinks' | 'schedulingRules' | 'productionCalendar' | 'ugs' | 'specialties' | 'educationalPlans' | 'educationalPlanTemplates' | 'scheduleTemplates' | 'classroomTypes' | 'subgroups' | 'electives' | 'timeSlotsShortened' | 'classroomTags' | 'buildingPlans';
