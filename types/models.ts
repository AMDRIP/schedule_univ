import {
    AcademicDegree,
    AcademicTitle,
    AttestationType,
    AvailabilityType,
    ClassType,
    DeliveryMode,
    FieldOfScience,
    FormOfStudy,
    ProductionCalendarEventType,
    RuleAction,
    RuleEntityType,
    RuleLogicalOperator,
    RuleSeverity
} from './enums';

export interface BaseItem {
    id: string;
}

export interface AvailabilityGrid {
    [day: string]: { [timeSlotId: string]: AvailabilityType };
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
    availabilityGrid?: AvailabilityGrid;
    pinnedClassroomId?: string;
}

export interface Stream extends BaseItem { name: string; groupIds: string[]; }

export interface ClassroomType extends BaseItem {
    name: string;
}

export interface ClassroomTag extends BaseItem {
    name: string;
    icon: string;
    color: string;
}

export interface Classroom extends BaseItem { number: string; capacity: number; typeId: string; availabilityGrid?: AvailabilityGrid; tagIds?: string[]; }

export interface Cabinet extends BaseItem { number: string; departmentId: string; }

export interface TimeSlot extends BaseItem { time: string; }

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

export interface RuleCondition {
    entityType: RuleEntityType;
    entityIds: string[]; // Can be one or more IDs
    classType?: ClassType; // Optional filter
}

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

export interface ProductionCalendarEvent extends BaseItem {
    date: string;
    name: string;
    isWorkDay: boolean;
    type: ProductionCalendarEventType;
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

// Need to import ScheduleEntry for ScheduleTemplate, but ScheduleEntry is in scheduling.ts
// Circular dependency risk if ScheduleEntry is in scheduling.ts and scheduling.ts imports models.ts
// But ScheduleTemplate is a model (data item).
// ScheduleEntry is the core data structure for the schedule.
// I'll put ScheduleEntry in models.ts as well, or put ScheduleTemplate in scheduling.ts.
// ScheduleTemplate is listed in DataItem, so it's treated as a model.
// I'll put ScheduleEntry in models.ts.

export type WeekType = 'even' | 'odd' | 'every';

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
}

export interface ScheduleTemplate extends BaseItem {
    name: string;
    description: string;
    entries: ScheduleEntry[];
}

export type DataType = 'faculties' | 'departments' | 'teachers' | 'groups' | 'streams' | 'classrooms' | 'subjects' | 'cabinets' | 'timeSlots' | 'teacherSubjectLinks' | 'schedulingRules' | 'productionCalendar' | 'ugs' | 'specialties' | 'educationalPlans' | 'scheduleTemplates' | 'classroomTypes' | 'subgroups' | 'electives' | 'timeSlotsShortened' | 'classroomTags';

export type DataItem = Faculty | Department | Teacher | Group | Stream | Classroom | Subject | Cabinet | TimeSlot | TeacherSubjectLink | SchedulingRule | ProductionCalendarEvent | UGS | Specialty | EducationalPlan | ScheduleTemplate | ClassroomType | Subgroup | Elective | ClassroomTag;
