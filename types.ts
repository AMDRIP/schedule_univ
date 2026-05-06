import { Type } from '@google/genai';


export enum Role {
  Student = 'Студент',
  Teacher = 'Преподаватель',
  Methodist = 'Методист',
  Admin = 'Администратор',
}

export interface ClassroomType extends BaseItem {
  name: string;
  category?: RoomAssignmentCategory;
  allowedClassTypes?: ClassType[];
  requiredTagIds?: string[];
  color?: string;
  priority?: number;
  description?: string;
}

export interface ClassroomTag extends BaseItem {
  name: string;
  icon: string;
  color: string;
  category?: 'equipment' | 'software' | 'infrastructure' | 'accessibility' | 'restriction' | 'service';
  requiredLevel?: 'optional' | 'preferred' | 'required';
  description?: string;
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
  curatorTeacherId?: string;
  admissionYear?: number;
  notes?: string;
}
export type StreamType = 'lecture' | 'practice' | 'elective' | 'exam' | 'project' | 'custom';
export type SubgroupType = 'general' | 'language' | 'lab' | 'practice' | 'project' | 'individual';

export interface Stream extends BaseItem {
  name: string;
  groupIds: string[];
  subgroupIds?: string[];
  type?: StreamType;
  subjectId?: string;
  teacherId?: string;
  classroomTypeId?: string;
  maxStudentCount?: number;
  semester?: number;
  notes?: string;
}
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
  examCapacity?: number;
  area?: number;
  departmentId?: string;
  status?: 'available' | 'repair' | 'closed' | 'reserve';
  allowedClassTypes?: ClassType[];
  prioritySubjectIds?: string[];
  notes?: string;
}

export interface Cabinet extends BaseItem {
  number: string;
  departmentId: string;
  roomMetadata?: RoomResourceMetadata;
  capacity?: number;
  category?: RoomAssignmentCategory;
  responsibleTeacherId?: string;
  tagIds?: string[];
  status?: 'available' | 'repair' | 'closed' | 'reserve';
  notes?: string;
}
export type StudyShift = 'first' | 'second' | 'both';
export type TimeSlotShift = 'first' | 'second';
export type BellScheduleProfileType = 'normal' | 'shortened' | 'session' | 'saturday' | 'practice' | 'exam' | 'custom';

export interface TimeSlot extends BaseItem {
  time: string;
  shift?: TimeSlotShift;
  order?: number;
  name?: string;
  breakMinutesAfter?: number;
  kind?: 'lesson' | 'consultation' | 'exam' | 'practice' | 'event';
  color?: string;
  notes?: string;
}

export interface BellScheduleProfile extends BaseItem {
  name: string;
  type: BellScheduleProfileType;
  description?: string;
  slots: TimeSlot[];
  appliesToDates?: string[];
  appliesToWeekdays?: number[];
  formOfStudyIds?: string[];
  buildingPlanIds?: string[];
  isActive?: boolean;
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
  formOfStudy?: FormOfStudy;
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
  role?: 'primary' | 'reserve' | 'overloadOnly' | 'examiner' | 'assistant' | 'undesirable';
  priority?: number;
  isActive?: boolean;
  maxWeeklyLessons?: number;
  maxSemesterLessons?: number;
  allowStreams?: boolean;
  allowedFormOfStudy?: FormOfStudy[];
  allowedGroupIds?: string[];
  excludedGroupIds?: string[];
  allowedClassroomIds?: string[];
  allowedClassroomTypeIds?: string[];
  notes?: string;
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
  AvoidDay = 'Избегать дня недели',
  RequireDay = 'Требовать день недели',
  PreferDay = 'Предпочитать день недели',
  AvoidTimeRange = 'Избегать диапазона времени',
  RequireTimeRange = 'Требовать диапазон времени',
  PreferTimeRange = 'Предпочитать диапазон времени',
  SameDay = 'Размещать в один день',
  DifferentDay = 'Размещать в разные дни',
  Consecutive = 'Размещать пары подряд',
  MaxPerDay = 'Максимум пар в день',
  MinPerDay = 'Минимум пар в день',
  MaxPerWeek = 'Максимум пар в неделю',
  MinPerWeek = 'Минимум пар в неделю',
  MaxConsecutive = 'Максимум пар подряд',
  AtMostNGaps = 'Не более N "окон" в день',
  Order = 'Определенный порядок (A перед B)',
  NoOverlap = 'Не пересекать с (по времени)',
  StartAfter = 'Начинать не ранее',
  EndBefore = 'Заканчивать не позднее',
  RequireClassroomType = 'Требовать тип аудитории',
  PreferClassroomType = 'Предпочитать тип аудитории',
  AvoidClassroomType = 'Избегать тип аудитории',
  RequireClassroomTag = 'Требовать тег аудитории',
  PreferClassroomTag = 'Предпочитать тег аудитории',
  AvoidClassroomTag = 'Избегать тег аудитории',
  AvoidSingleLessonDay = 'Избегать одиночной пары в день',
  PreferCompactDay = 'Предпочитать компактный день',
  SpreadAcrossWeek = 'Распределять по неделе',
}

export type RuleEntityType =
  | 'teacher'
  | 'group'
  | 'stream'
  | 'subgroup'
  | 'subject'
  | 'classroom'
  | 'classroomType'
  | 'classroomTag'
  | 'classType'
  | 'department'
  | 'specialty'
  | 'formOfStudy'
  | 'shift';

export interface RuleCondition {
  entityType: RuleEntityType;
  entityIds: string[]; // Can be one or more IDs
  classType?: ClassType; // Optional filter
}

export type RuleLogicalOperator = 'AND' | 'OR';

export type RuleCategory = 'resource' | 'time' | 'pedagogy' | 'load' | 'sequence' | 'quality' | 'custom';

export interface RuleScope {
  startDate?: string;
  endDate?: string;
  weekType?: WeekType | 'any';
  course?: number;
  semester?: number;
  formOfStudy?: FormOfStudy | 'any';
  shift?: StudyShift | 'any';
  departmentIds?: string[];
  specialtyIds?: string[];
  classroomTypeIds?: string[];
  classroomTagIds?: string[];
  streamIds?: string[];
}

export interface SchedulingRule extends BaseItem {
  description: string;
  severity: RuleSeverity;
  action: RuleAction;
  conditions: RuleCondition[];
  logicalOperators?: RuleLogicalOperator[];
  enabled?: boolean;
  category?: RuleCategory;
  scope?: RuleScope;
  day?: string;
  timeSlotId?: string;
  startTimeSlotId?: string;
  endTimeSlotId?: string;
  param?: number;
  targetIds?: string[];
  notes?: string;
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
  colorPolicy: {
    defaultScheduleColorMode: 'type' | 'teacher' | 'subject';
    firstShiftColor: string;
    secondShiftColor: string;
    teacherFallbackColor: string;
    subjectFallbackColor: string;
    conflictColor: string;
    undesirableColor: string;
    classTypeColors: Partial<Record<ClassType, string>>;
  };
  importPolicy: {
    csvEncoding: string;
    csvDelimiter: string;
    columnMappings: string;
  };
  analyticsThresholds: {
    teacherOverloadWarningPercent: number;
    teacherOverloadCriticalPercent: number;
    classroomOverloadWarningPercent: number;
    classroomOverloadCriticalPercent: number;
    windowMinGapSlots: number;
    targetWeeklyTeacherLoad: number;
  };
  whatIfDefaults: {
    extraGroups: number;
    lessonsPerGroupPerWeek: number;
    studentsPerGroup: number;
    extraTeachers: number;
    teacherCapacityPerWeek: number;
    extraClassrooms: number;
    classroomSlotsPerWeek: number;
    newClassroomCapacity: number;
  };
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

export type SchedulingRunPhase = 'idle' | 'preparing' | 'placing' | 'refining' | 'annealing' | 'completed' | 'stopping' | 'cancelled' | 'failed';

export interface SchedulingProgressPoint {
  timeMs: number;
  penalty: number;
  readiness: number;
  placed: number;
  processed: number;
  total: number;
  unscheduled: number;
  hardViolations: number;
  softPenalty: number;
  label: string;
}

export interface SchedulingTriageItem {
  id: string;
  title: string;
  detail: string;
  resource: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  entryUid?: string;
  actionHint?: string;
}

export interface SchedulingShowcaseState {
  isOpen: boolean;
  phase: SchedulingRunPhase;
  startedAt: string;
  finishedAt?: string;
  canTakeCurrentResult: boolean;
  stopRequested: boolean;
  current?: SchedulingProgressPoint;
  history: SchedulingProgressPoint[];
  best?: SchedulingProgressPoint;
  partialSchedule: ScheduleEntry[];
  failedEntries: UnscheduledEntry[];
  explanations: Record<string, SchedulingExplanation>;
  triage: SchedulingTriageItem[];
  humanSummary: string;
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
  type?: SubgroupType;
  subjectIds?: string[];
  notes?: string;
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

export type DataItem = Faculty | Department | Teacher | Group | Stream | Classroom | Subject | Cabinet | TimeSlot | TeacherSubjectLink | SchedulingRule | ProductionCalendarEvent | UGS | Specialty | EducationalPlan | EducationalPlanTemplate | ScheduleTemplate | ClassroomType | Subgroup | Elective | ClassroomTag | BuildingPlan | BellScheduleProfile;
export type DataType = 'faculties' | 'departments' | 'teachers' | 'groups' | 'streams' | 'classrooms' | 'subjects' | 'cabinets' | 'timeSlots' | 'teacherSubjectLinks' | 'schedulingRules' | 'productionCalendar' | 'ugs' | 'specialties' | 'educationalPlans' | 'educationalPlanTemplates' | 'scheduleTemplates' | 'classroomTypes' | 'subgroups' | 'electives' | 'timeSlotsShortened' | 'classroomTags' | 'buildingPlans' | 'bellScheduleProfiles';
