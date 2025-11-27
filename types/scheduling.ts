import { ClassType } from './enums';

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
}

export interface SessionSchedulerConfig {
    consultationOffset: number; // 0 for no consultation, 1 for 1 day before, etc.
    restDays: number; // Min days between exams for the same group
    clearExisting: boolean;
    timeFrame: { start: string; end: string };
    scheduleTests: 'like_exams' | 'no_rest_days' | 'none';
}

export interface UnscheduledEntry {
    uid: string;
    subjectId: string;
    groupId?: string; // Is now optional
    groupIds?: string[]; // For multi-group/partial stream lectures
    subgroupId?: string;
    classType: ClassType;
    teacherId: string;
    streamId?: string;
    studentCount: number;
    targetWeek?: number;
}
