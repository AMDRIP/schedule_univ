import {
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, BellScheduleProfile,
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS,
    Specialty, EducationalPlan, UnscheduledEntry, AvailabilityType, WeekType, DeliveryMode, ClassroomType, Subgroup, Elective, HeuristicConfig,
    RuleSeverity, RuleAction, RuleCondition, ProductionCalendarEventType, SchedulingExplanation, SchedulingBottleneck, SchedulingProgressPoint, AcademicWork, Student, ResourceAbsence, BuildingPlan
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { getWeekNumber, getWeekType, toYYYYMMDD } from '../utils/dateUtils';
import { areGroupsCompatibleWithTimeSlot } from '../utils/shiftUtils';
import { isSemesterInCourse } from '../utils/semesterUtils';
import { getPlanContactActivities, getPlanContactHours, matchesSemesterParity, getRequiredClassroomTypes, getPlanForGroup as resolvePlanForGroup } from '../utils/educationUtils';
import { bookedResourceKeys, groupIdsOf, groupsShareParticipants, isIndividualEntry, studentIdsOf, resolveParticipantEntry, studentIdentity, sharesResource } from '../utils/participants';
import { electiveDemand, electiveParticipants, electiveIdOf } from '../utils/trajectories';
import { campusPlacementIssues, slotInterval } from './campusTravel';

export interface GenerationData {
    buildingPlans?: BuildingPlan[];
    students?: Student[];
    resourceAbsences?: ResourceAbsence[];
    academicWorks?: AcademicWork[];
    teachers: Teacher[];
    groups: Group[];
    classrooms: Classroom[];
    subjects: Subject[];
    streams: Stream[];
    timeSlots: TimeSlot[];
    timeSlotsShortened: TimeSlot[];
    bellScheduleProfiles?: BellScheduleProfile[];
    settings: SchedulingSettings;
    teacherSubjectLinks: TeacherSubjectLink[];
    schedulingRules: SchedulingRule[];
    productionCalendar: ProductionCalendarEvent[];
    ugs: UGS[];
    specialties: Specialty[];
    educationalPlans: EducationalPlan[];
    classroomTypes: ClassroomType[];
    subgroups: Subgroup[];
    electives: Elective[];
    schedule: ScheduleEntry[];
}

export interface SchedulerResult {
    schedule: ScheduleEntry[];
    unschedulable: UnscheduledEntry[];
    explanations: Record<string, SchedulingExplanation>;
    score?: ScheduleScore;
    interrupted?: boolean;
}

export interface SchedulerRunOptions {
    onProgress?: (progress: SchedulingProgressPoint & { phase: string; partialSchedule: ScheduleEntry[]; failedEntries: UnscheduledEntry[]; explanations: Record<string, SchedulingExplanation> }) => void;
    shouldStop?: () => boolean;
    candidateEvaluator?: CandidateEvaluator;
}

export interface PlacementCandidate { dateStr: string; timeSlotId: string; classroomId: string; teacherId: string }
export interface CandidateEvaluator {
    initialize(data: GenerationData, config: HeuristicConfig): Promise<void>;
    evaluate(entry: UnscheduledEntry, schedule: ScheduleEntry[], candidates: PlacementCandidate[], excludedId?: string): Promise<number[] | undefined>;
    dispose(): void;
}

export interface ScheduleScore {
    total: number;
    unscheduled: number;
    hardViolations: number;
    softPenalty: number;
    placed: number;
}

export interface LocalOptimizerResult {
    schedule: ScheduleEntry[];
    beforeScore: ScheduleScore;
    afterScore: ScheduleScore;
    improved: number;
    considered: number;
}

interface SchedulerIndex {
    electivesById: Map<string, Elective>;
    studentsById: Map<string, Student>;
    studentsByGroup: Map<string, Student[]>;
    scoringContext?: {
        retained: ScheduleEntry[]; generated: ScheduleEntry[]; count: number; all: ScheduleEntry[];
        teacher: Map<string, ScheduleEntry[]>; teacherDay: Map<string, ScheduleEntry[]>;
        groupDay: Map<string, ScheduleEntry[]>; subject: Map<string, ScheduleEntry[]>;
        day: Map<string, ScheduleEntry[]>;
        excludedId?: string; excludedAll?: ScheduleEntry[];
    };
    teachersById: Map<string, Teacher>;
    groupsById: Map<string, Group>;
    classroomsById: Map<string, Classroom>;
    subjectsById: Map<string, Subject>;
    streamsById: Map<string, Stream>;
    productionByDate: Map<string, ProductionCalendarEvent>;
    subgroupsById: Map<string, Subgroup>;
    subgroupsByParent: Map<string, Subgroup[]>;
    plansBySpecialty: Map<string, EducationalPlan[]>;
    groupToStreamIds: Map<string, string[]>;
    teacherLinksBySubjectType: Map<string, TeacherSubjectLink[]>;
    classroomsByType: Map<string, Classroom[]>;
    suitableClassroomCache: Map<string, Classroom[]>;
}

type RejectionStats = Record<SchedulingBottleneck, number> & {
    checkedSlots: number;
    checkedClassrooms: number;
};

interface PlacementDomainCandidate {
    dateStr: string;
    dayName: string;
    timeSlotId: string;
    slotIndex: number;
}

interface PlacementDomain {
    uid: string;
    version: string;
    signature: string;
    difficulty: number;
    teacherIds: string[];
    classroomIds: string[];
    candidates: PlacementDomainCandidate[];
    diagnostics: string[];
}

interface FastResourceIndex {
    slotIndexByKey: Map<string, number>;
    masks: Map<string, bigint>;
}

interface IncrementalScoreState {
    teacherTotal: Map<string, number>;
    teacherDay: Map<string, number>;
    groupDay: Map<string, number>;
    classroomTotal: Map<string, number>;
}

const mapById = <T extends { id: string }>(items: T[]) => new Map(items.map(item => [item.id, item]));

const makeSubjectTypeKey = (subjectId: string, classType: ClassType) => `${subjectId}::${classType}`;

const createSchedulerIndex = (data: GenerationData): SchedulerIndex => {
    const subgroupsByParent = new Map<string, Subgroup[]>();
    data.subgroups.forEach(subgroup => {
        const current = subgroupsByParent.get(subgroup.parentGroupId) || [];
        current.push(subgroup);
        subgroupsByParent.set(subgroup.parentGroupId, current);
    });

    const groupToStreamIds = new Map<string, string[]>();
    data.streams.forEach(stream => stream.groupIds.forEach(groupId => {
        const current = groupToStreamIds.get(groupId) || [];
        current.push(stream.id);
        groupToStreamIds.set(groupId, current);
    }));

    const teacherLinksBySubjectType = new Map<string, TeacherSubjectLink[]>();
    data.teacherSubjectLinks.forEach(link => {
        link.classTypes.forEach(classType => {
            const key = makeSubjectTypeKey(link.subjectId, classType);
            const current = teacherLinksBySubjectType.get(key) || [];
            current.push(link);
            teacherLinksBySubjectType.set(key, current);
        });
    });

    const classroomsByType = new Map<string, Classroom[]>();
    data.classrooms.forEach(classroom => {
        const current = classroomsByType.get(classroom.typeId) || [];
        current.push(classroom);
        classroomsByType.set(classroom.typeId, current);
    });

    return {
        electivesById: mapById(data.electives),
        studentsById: mapById(data.students || []),
        studentsByGroup: (data.students || []).reduce((map, student) => { const list = map.get(student.groupId) || []; list.push(student); map.set(student.groupId, list); return map; }, new Map<string, Student[]>()),
        teachersById: mapById(data.teachers),
        groupsById: mapById(data.groups),
        classroomsById: mapById(data.classrooms),
        subjectsById: mapById(data.subjects),
        streamsById: mapById(data.streams),
        productionByDate: new Map(data.productionCalendar.map(event => [event.date, event])),
        subgroupsById: mapById(data.subgroups),
        subgroupsByParent,
        plansBySpecialty: data.educationalPlans.reduce((map, plan) => {
            const current = map.get(plan.specialtyId) || [];
            current.push(plan);
            map.set(plan.specialtyId, current);
            return map;
        }, new Map<string, EducationalPlan[]>()),
        groupToStreamIds,
        teacherLinksBySubjectType,
        classroomsByType,
        suitableClassroomCache: new Map(),
    };
};

const createSeededRandom = (seed?: number | string) => {
    let value = 0;
    const normalized = seed === undefined ? `${Date.now()}-${Math.random()}` : String(seed);
    for (let i = 0; i < normalized.length; i++) {
        value = (value * 31 + normalized.charCodeAt(i)) >>> 0;
    }
    return () => {
        value = (value + 0x6D2B79F5) >>> 0;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const createEmptyRejectionStats = (): RejectionStats => ({
    teacher: 0,
    classroom: 0,
    group: 0,
    stream: 0,
    calendar: 0,
    rules: 0,
    data: 0,
    checkedSlots: 0,
    checkedClassrooms: 0,
});

const SCHEDULER_YIELD_INTERVAL = 20;
const MAX_PRIMARY_CLASSROOM_CANDIDATES = 24;
const MAX_PRIMARY_WORK_DAYS = 10;
const GOOD_ENOUGH_SLOT_COST = 0;
const DOMAIN_CACHE_VERSION = 'domain-cache-v10';
const DOMAIN_PRECOMPUTE_BATCH_SIZE = 24;
const TABU_TENURE = 24;

const yieldToEventLoop = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const explainEntry = (
    entry: UnscheduledEntry,
    stats: RejectionStats,
    conflicts: string[],
    resource: string,
    summary?: string
): SchedulingExplanation => {
    const bottleneck = (['teacher', 'classroom', 'group', 'stream', 'calendar', 'rules', 'data'] as SchedulingBottleneck[])
        .sort((a, b) => stats[b] - stats[a])[0];
    return {
        summary: summary || 'Не найден слот, который одновременно удовлетворяет всем жестким ограничениям.',
        bottleneck,
        conflicts: Array.from(new Set(conflicts)).slice(0, 6),
        resource,
        checkedSlots: stats.checkedSlots,
        checkedClassrooms: stats.checkedClassrooms,
        lastRunAt: new Date().toISOString(),
    };
};

const markUnscheduled = (
    entry: UnscheduledEntry,
    unschedulable: UnscheduledEntry[],
    explanations: Record<string, SchedulingExplanation>,
    explanation: SchedulingExplanation
) => {
    explanations[entry.uid] = explanation;
    unschedulable.push({ ...entry, explanation });
};

const getEntryGroupIds = groupIdsOf;

const domainCache = new Map<string, PlacementDomain>();

const getDomainCacheKey = (signature: string) => `${DOMAIN_CACHE_VERSION}::${signature}`;

const createFastResourceIndex = (schedule: ScheduleEntry[]): FastResourceIndex => {
    const slotIndexByKey = new Map<string, number>();
    const masks = new Map<string, bigint>();

    const getSlotIndex = (bookingKey: string) => {
        let slotIndex = slotIndexByKey.get(bookingKey);
        if (slotIndex === undefined) {
            slotIndex = slotIndexByKey.size;
            slotIndexByKey.set(bookingKey, slotIndex);
        }
        return slotIndex;
    };

    schedule.forEach(entry => {
        if (!entry.date || !entry.timeSlotId) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        const bit = 1n << BigInt(getSlotIndex(bookingKey));
        const resourceKeys = bookedResourceKeys(entry);
        resourceKeys.forEach(resourceKey => {
            masks.set(resourceKey, (masks.get(resourceKey) || 0n) | bit);
        });
    });

    return { slotIndexByKey, masks };
};

const getFastSlotBit = (fastIndex: FastResourceIndex, bookingKey: string) => {
    let slotIndex = fastIndex.slotIndexByKey.get(bookingKey);
    if (slotIndex === undefined) {
        slotIndex = fastIndex.slotIndexByKey.size;
        fastIndex.slotIndexByKey.set(bookingKey, slotIndex);
    }
    return 1n << BigInt(slotIndex);
};

const fastResourceHas = (fastIndex: FastResourceIndex, resourceKey: string, bookingKey: string) =>
    ((fastIndex.masks.get(resourceKey) || 0n) & getFastSlotBit(fastIndex, bookingKey)) !== 0n;

const fastResourceAdd = (fastIndex: FastResourceIndex, resourceKey: string, bookingKey: string) => {
    fastIndex.masks.set(resourceKey, (fastIndex.masks.get(resourceKey) || 0n) | getFastSlotBit(fastIndex, bookingKey));
};

const fastResourceRemove = (fastIndex: FastResourceIndex, resourceKey: string, bookingKey: string) => {
    const bit = getFastSlotBit(fastIndex, bookingKey);
    fastIndex.masks.set(resourceKey, (fastIndex.masks.get(resourceKey) || 0n) & ~bit);
};

const addToCounter = (map: Map<string, number>, key: string, delta: number) => {
    const next = Math.max(0, (map.get(key) || 0) + delta);
    if (next === 0) map.delete(key);
    else map.set(key, next);
};

const applyScoreStateEntry = (state: IncrementalScoreState, entry: ScheduleEntry, delta: number) => {
    if (entry.teacherId) {
        addToCounter(state.teacherTotal, entry.teacherId, delta);
        addToCounter(state.teacherDay, `${entry.teacherId}-${entry.date}`, delta);
    }
    if (entry.classroomId) addToCounter(state.classroomTotal, entry.classroomId, delta);
    getEntryGroupIds(entry).forEach(groupId => addToCounter(state.groupDay, `${groupId}-${entry.date}`, delta));
};

const createIncrementalScoreState = (schedule: ScheduleEntry[]): IncrementalScoreState => {
    const state: IncrementalScoreState = {
        teacherTotal: new Map(),
        teacherDay: new Map(),
        groupDay: new Map(),
        classroomTotal: new Map(),
    };
    schedule.forEach(entry => applyScoreStateEntry(state, entry, 1));
    return state;
};

const estimateIncrementalPlacementPenalty = (
    state: IncrementalScoreState,
    entry: Pick<ScheduleEntry, 'teacherId' | 'groupId' | 'groupIds'>,
    dateStr: string,
    classroomId: string,
    penaltyMultiplier: number
) => {
    let penalty = 0;
    const teacherDayLoad = state.teacherDay.get(`${entry.teacherId}-${dateStr}`) || 0;
    if (teacherDayLoad >= 4) penalty += (teacherDayLoad - 3) * 18 * penaltyMultiplier;
    getEntryGroupIds(entry).forEach(groupId => {
        const groupDayLoad = state.groupDay.get(`${groupId}-${dateStr}`) || 0;
        if (groupDayLoad === 0) penalty += 24 * penaltyMultiplier;
        if (groupDayLoad >= 5) penalty += (groupDayLoad - 4) * 20 * penaltyMultiplier;
    });
    const classroomLoad = state.classroomTotal.get(classroomId) || 0;
    if (classroomLoad > 0) penalty += Math.min(30, classroomLoad * 0.25) * penaltyMultiplier;
    return penalty;
};

const getSeriesGroupKey = (entry: Pick<ScheduleEntry, 'groupId' | 'groupIds' | 'subgroupId'> | Pick<UnscheduledEntry, 'groupId' | 'groupIds' | 'subgroupId'>) =>
    `${getEntryGroupIds(entry).slice().sort().join(',')}::${entry.subgroupId || ''}`;

type SeriesEntry = Pick<ScheduleEntry, 'subjectId' | 'classType' | 'groupId' | 'groupIds' | 'subgroupId' | 'studentIds' | 'academicWorkId' | 'unscheduledUid' | 'semester'> & { uid?: string };
const electiveSeriesOf = (entry: SeriesEntry) => electiveIdOf(entry.uid || entry.unscheduledUid);
const entriesBelongToSameSeries = (
    first: SeriesEntry,
    second: SeriesEntry
) =>
    first.subjectId === second.subjectId &&
    first.classType === second.classType &&
    electiveSeriesOf(first) === electiveSeriesOf(second) &&
    (!first.semester || !second.semester || first.semester === second.semester) &&
    first.academicWorkId === second.academicWorkId &&
    JSON.stringify([...(first.studentIds || [])].sort()) === JSON.stringify([...(second.studentIds || [])].sort()) &&
    getSeriesGroupKey(first) === getSeriesGroupKey(second);

class CountedBookingSet extends Set<string> {
    private counts = new Map<string, number>();
    add(key: string) { this.counts.set(key, (this.counts.get(key) || 0) + 1); return super.add(key); }
    delete(key: string) {
        const count = this.counts.get(key) || 0;
        if (count > 1) { this.counts.set(key, count - 1); return true; }
        this.counts.delete(key); return super.delete(key);
    }
}

const addBooking = (bookings: Map<string, Set<string>>, resourceKey: string, bookingKey: string) => {
    if (!bookings.has(resourceKey)) bookings.set(resourceKey, new CountedBookingSet());
    bookings.get(resourceKey)!.add(bookingKey);
};

const removeBooking = (bookings: Map<string, Set<string>>, resourceKey: string, bookingKey: string) => {
    bookings.get(resourceKey)?.delete(bookingKey);
};

const createResourceBookings = (
    teachers: Teacher[],
    groups: Group[],
    classrooms: Classroom[],
    schedule: ScheduleEntry[]
) => {
    const resourceBookings = new Map<string, Set<string>>();
    teachers.forEach(item => resourceBookings.set(`teacher-${item.id}`, new CountedBookingSet()));
    groups.forEach(item => resourceBookings.set(`group-${item.id}`, new CountedBookingSet()));
    classrooms.forEach(item => resourceBookings.set(`classroom-${item.id}`, new CountedBookingSet()));

    schedule.forEach(entry => {
        if (!entry.date) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        bookedResourceKeys(entry).forEach(key => addBooking(resourceBookings, key, bookingKey));
    });

    return resourceBookings;
};

const getResourceKeysForEntry = (entry: Pick<ScheduleEntry, 'teacherId' | 'classroomId' | 'groupId' | 'groupIds'>) => [
    `teacher-${entry.teacherId}`,
    `classroom-${entry.classroomId}`,
    ...getEntryGroupIds(entry).map(groupId => `group-${groupId}`),
];

const countResourceCollisions = (schedule: ScheduleEntry[]) => {
    const seen = new Map<string, number>();
    let collisions = 0;
    schedule.forEach(entry => {
        if (!entry.date || !entry.timeSlotId) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        getResourceKeysForEntry(entry).forEach(resourceKey => {
            const key = `${resourceKey}-${bookingKey}`;
            const current = seen.get(key) || 0;
            collisions += current;
            seen.set(key, current + 1);
        });
    });
    return collisions;
};

const hasResourceBookingConflict = (
    bookings: Map<string, Set<string>>,
    entry: Pick<ScheduleEntry, 'teacherId'> | Pick<UnscheduledEntry, 'teacherId'>,
    classroomId: string,
    groupIds: string[],
    dateStr: string,
    timeSlotId: string
) => {
    const bookingKey = `${dateStr}-${timeSlotId}`;
    if (bookings.get(`teacher-${entry.teacherId}`)?.has(bookingKey)) return true;
    if (bookings.get(`classroom-${classroomId}`)?.has(bookingKey)) return true;
    return groupIds.some(groupId => bookings.get(`group-${groupId}`)?.has(bookingKey) || bookings.get(`individual-group-${groupId}`)?.has(bookingKey));
};

export const getRetainedExistingSchedule = (schedule: ScheduleEntry[], config: HeuristicConfig) => {
    if (!config.clearExisting) return schedule;
    const startDate = new Date(config.timeFrame.start + 'T00:00:00');
    const endDate = new Date(config.timeFrame.end + 'T00:00:00');

    return schedule.filter(entry => {
        if (entry.locked || isIndividualEntry(entry) && !entry.unscheduledUid?.startsWith('unsched-elective-')) return true;
        if (!entry.date) return true;
        const entryDate = new Date(entry.date + 'T00:00:00');
        if (entryDate < startDate || entryDate > endDate) return true;
        if (config.targetGroupIds?.length) return !getEntryGroupIds(entry).some(id => config.targetGroupIds!.includes(id));
        if (!config.target) return false;
        if (config.target.type === 'group') {
            if (entry.groupId === config.target.id) return false;
            if (entry.groupIds?.includes(config.target.id)) return false;
        }
        if (config.target.type === 'teacher' && entry.teacherId === config.target.id) return false;
        if (config.target.type === 'classroom' && entry.classroomId === config.target.id) return false;
        return true;
    });
};

export const expandScheduleOccurrences = (data: GenerationData, schedule: ScheduleEntry[], period: { start: string; end: string }): ScheduleEntry[] => {
    const resolve = (entry: ScheduleEntry) => !entry.groupId && !entry.groupIds?.length && entry.streamId ? { ...entry, groupIds: data.streams.find(stream => stream.id === entry.streamId)?.groupIds || [] } : entry;
    return schedule.flatMap(original => {
        const entry = resolveParticipantEntry(resolve(original), data.academicWorks);
        if (entry.date) return [entry];
        const occurrences: ScheduleEntry[] = [];
        for (const date = new Date(period.start + 'T00:00:00'); toYYYYMMDD(date) <= period.end; date.setDate(date.getDate() + 1)) {
            const day = DAYS_OF_WEEK[(date.getDay() + 6) % 7];
            const parity = data.settings.useEvenOddWeekSeparation ? getWeekType(date, new Date(data.settings.semesterStart + 'T00:00:00')) : 'every';
            if (entry.day === day && (entry.weekType === 'every' || entry.weekType === parity)) occurrences.push({ ...entry, id: `${entry.id}@${toYYYYMMDD(date)}`, date: toYYYYMMDD(date) });
        }
        return occurrences;
    });
};

const isEntryInOptimizationScope = (entry: ScheduleEntry, config: HeuristicConfig) => {
    if (entry.locked || isIndividualEntry(entry) && !entry.unscheduledUid?.startsWith('unsched-elective-')) return false;
    if (!entry.date) return false;
    const entryDate = new Date(entry.date + 'T00:00:00');
    const startDate = new Date(config.timeFrame.start + 'T00:00:00');
    const endDate = new Date(config.timeFrame.end + 'T00:00:00');
    if (entryDate < startDate || entryDate > endDate) return false;
    if (config.targetGroupIds?.length && !getEntryGroupIds(entry).some(id => config.targetGroupIds!.includes(id))) return false;
    if (!config.target) return true;
    if (config.target.type === 'group') {
        return entry.groupId === config.target.id || !!entry.groupIds?.includes(config.target.id);
    }
    if (config.target.type === 'teacher') return entry.teacherId === config.target.id;
    if (config.target.type === 'classroom') return entry.classroomId === config.target.id;
    return true;
};

const createWorkDays = (data: GenerationData, config: HeuristicConfig, index: SchedulerIndex): Date[] => {
    const workDays: Date[] = [];
    let currentDate = new Date(config.timeFrame.start + 'T00:00:00');
    const lastDate = new Date(config.timeFrame.end + 'T00:00:00');
    while (currentDate <= lastDate) {
        const dateStr = toYYYYMMDD(currentDate);
        const dayInfo = index.productionByDate.get(dateStr);
        if (!data.settings.respectProductionCalendar || !dayInfo || dayInfo.isWorkDay) {
            if (currentDate.getDay() !== 0) {
                workDays.push(new Date(currentDate));
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return workDays;
};

export const getActiveTimeSlotsForDate = (data: GenerationData, date: Date | string, index = createSchedulerIndex(data)) => {
    const dateStr = typeof date === 'string' ? date : toYYYYMMDD(date);
    const actualDate = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    const weekday = actualDate.getDay() === 0 ? 6 : actualDate.getDay() - 1;
    const customProfile = (data.bellScheduleProfiles || []).find(profile => {
        if (!profile.isActive) return false;
        if (profile.appliesToDates?.includes(dateStr)) return true;
        if (profile.appliesToWeekdays?.includes(weekday)) return true;
        return false;
    });
    if (customProfile?.slots?.length) return customProfile.slots;
    const dayInfo = index.productionByDate.get(dateStr);
    const isPreHoliday = data.settings.useShortenedPreHolidaySchedule && dayInfo?.type === ProductionCalendarEventType.PreHoliday;
    return isPreHoliday ? data.timeSlotsShortened : data.timeSlots;
};

const getShiftCompatibleTimeSlots = (timeSlots: TimeSlot[], involvedGroups: Group[]) =>
    timeSlots.filter(timeSlot => areGroupsCompatibleWithTimeSlot(timeSlot, involvedGroups));

const getInvolvedGroups = (entry: UnscheduledEntry | ScheduleEntry, index: SchedulerIndex) =>
    getEntryGroupIds(entry).map(groupId => index.groupsById.get(groupId)).filter(Boolean) as Group[];

const getTeacherLinkPriority = (link: TeacherSubjectLink) => {
    const roleWeight = {
        primary: 0,
        examiner: 15,
        assistant: 25,
        reserve: 60,
        overloadOnly: 120,
        undesirable: 220,
    } as Record<NonNullable<TeacherSubjectLink['role']>, number>;
    return (roleWeight[link.role || 'primary'] || 0) - (link.priority || 0) * 8;
};

const teacherLinkMatchesContext = (
    link: TeacherSubjectLink,
    groups: Group[] = [],
    streamId?: string
) => {
    if (link.isActive === false) return false;
    if (streamId && link.allowStreams === false) return false;
    if (link.allowedFormOfStudy?.length && !groups.every(group => link.allowedFormOfStudy!.includes(group.formOfStudy))) return false;
    if (link.allowedGroupIds?.length && !groups.every(group => link.allowedGroupIds!.includes(group.id))) return false;
    if (link.excludedGroupIds?.length && groups.some(group => link.excludedGroupIds!.includes(group.id))) return false;
    return true;
};

const getTeacherCandidates = (
    subjectId: string,
    classType: ClassType,
    index: SchedulerIndex,
    preferredTeacherId?: string,
    groups: Group[] = [],
    streamId?: string
) => {
    const links = (index.teacherLinksBySubjectType.get(makeSubjectTypeKey(subjectId, classType)) || [])
        .filter(link => teacherLinkMatchesContext(link, groups, streamId))
        .sort((a, b) => getTeacherLinkPriority(a) - getTeacherLinkPriority(b));
    const candidates = [
        ...(preferredTeacherId && links.some(link => link.teacherId === preferredTeacherId) ? [preferredTeacherId] : []),
        ...links.map(link => link.teacherId),
    ];
    return Array.from(new Set(candidates)).filter(teacherId => index.teachersById.has(teacherId));
};

const streamCanScheduleLecture = (stream: Stream, subjectId: string) => {
    const isLectureStream = !stream.type || stream.type === 'lecture';
    const matchesSubject = !stream.subjectId || stream.subjectId === subjectId;
    return isLectureStream && matchesSubject;
};

const getPlanForGroup = (group: Group, index: SchedulerIndex) => {
    const plans = index.plansBySpecialty.get(group.specialtyId) || [];
    return resolvePlanForGroup(group, plans);
};

const groupHasLecture = (group: Group, subjectId: string, semester: number, index: SchedulerIndex) => {
    const plan = getPlanForGroup(group, index);
    return !!plan?.entries.some(entry =>
        entry.semester === semester &&
        entry.subjectId === subjectId &&
        entry.lectureHours > 0
    );
};

const sameGroupSet = (first: string[], second: string[]) =>
    first.length === second.length && first.every(id => second.includes(id));

const getLectureGroupsForStream = (stream: Stream, subjectId: string, semester: number, groups: Group[], index: SchedulerIndex) =>
    groups.filter(candidate =>
        stream.groupIds.includes(candidate.id) &&
        groupHasLecture(candidate, subjectId, semester, index)
    );

const selectLectureStream = (groupId: string, subjectId: string, semester: number, groups: Group[], index: SchedulerIndex) => {
    const streamIds = index.groupToStreamIds.get(groupId) || [];
    const matchingStreams = streamIds
        .map(streamId => index.streamsById.get(streamId))
        .filter((stream): stream is Stream => !!stream && streamCanScheduleLecture(stream, subjectId));
    const semesterMatchedStreams = matchingStreams.filter(stream => !stream.semester || stream.semester === semester);
    const candidateStreams = semesterMatchedStreams.length > 0 ? semesterMatchedStreams : matchingStreams;

    return candidateStreams
        .sort((a, b) => {
            const aLectureGroups = getLectureGroupsForStream(a, subjectId, semester, groups, index);
            const bLectureGroups = getLectureGroupsForStream(b, subjectId, semester, groups, index);
            const aCoversCurrentGroup = aLectureGroups.some(group => group.id === groupId);
            const bCoversCurrentGroup = bLectureGroups.some(group => group.id === groupId);
            if (aCoversCurrentGroup !== bCoversCurrentGroup) return Number(bCoversCurrentGroup) - Number(aCoversCurrentGroup);
            const subjectPriority = Number(!!b.subjectId) - Number(!!a.subjectId);
            if (subjectPriority !== 0) return subjectPriority;
            const aSemesterExact = a.semester === semester;
            const bSemesterExact = b.semester === semester;
            const semesterPriority = Number(bSemesterExact) - Number(aSemesterExact);
            if (semesterPriority !== 0) return semesterPriority;
            const aExactCoverage = sameGroupSet(a.groupIds, aLectureGroups.map(group => group.id));
            const bExactCoverage = sameGroupSet(b.groupIds, bLectureGroups.map(group => group.id));
            if (aExactCoverage !== bExactCoverage) return Number(bExactCoverage) - Number(aExactCoverage);
            const eligiblePriority = bLectureGroups.length - aLectureGroups.length;
            if (eligiblePriority !== 0) return eligiblePriority;
            const extraGroupPriority = (a.groupIds.length - aLectureGroups.length) - (b.groupIds.length - bLectureGroups.length);
            if (extraGroupPriority !== 0) return extraGroupPriority;
            return a.groupIds.length - b.groupIds.length;
        })[0];
};

const getSuitableClassrooms = (entry: UnscheduledEntry, subject: Subject, index: SchedulerIndex) => {
    const requiredClassroomTypes = entry.classroomTypeIds?.length ? entry.classroomTypeIds : getRequiredClassroomTypes(subject, entry.classType);
    if (!requiredClassroomTypes || requiredClassroomTypes.length === 0) return null;

    const requiredTags = entry.requiredClassroomTagIds?.length ? entry.requiredClassroomTagIds : subject.requiredClassroomTagIds || [];
    const cacheKey = `${entry.subjectId}::${entry.classType}::${entry.studentCount}::${requiredClassroomTypes.join(',')}::${requiredTags.join(',')}`;
    const cached = index.suitableClassroomCache.get(cacheKey);
    if (cached) return cached;

    const classrooms = requiredClassroomTypes.flatMap(typeId => index.classroomsByType.get(typeId) || [])
        .filter((classroom, position, array) => array.findIndex(item => item.id === classroom.id) === position)
        .filter(classroom => {
            if (classroom.status === 'closed' || classroom.status === 'repair') return false;
            if (classroom.allowedClassTypes?.length && !classroom.allowedClassTypes.includes(entry.classType)) return false;
            if (classroom.capacity < entry.studentCount) return false;
            if (requiredTags.length > 0) {
                const classroomTags = classroom.tagIds || [];
                if (!requiredTags.every(tagId => classroomTags.includes(tagId))) return false;
            }
            return true;
        })
        .sort((a, b) => {
            if (entry.pinnedClassroomId && a.id === entry.pinnedClassroomId) return -1;
            if (entry.pinnedClassroomId && b.id === entry.pinnedClassroomId) return 1;
            return a.capacity - b.capacity;
        });

    index.suitableClassroomCache.set(cacheKey, classrooms);
    return classrooms;
};

const getPrimaryClassroomCandidates = (
    entry: UnscheduledEntry,
    subject: Subject,
    suitableClassrooms: Classroom[],
    involvedGroups: Group[],
    teacherCandidates: string[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex
) => {
    if (suitableClassrooms.length <= MAX_PRIMARY_CLASSROOM_CANDIDATES) return suitableClassrooms;

    const suitableById = new Map(suitableClassrooms.map(classroom => [classroom.id, classroom]));
    const priorityIds = new Set<string>();
    const addPriorityId = (id?: string) => {
        if (id && suitableById.has(id)) priorityIds.add(id);
    };

    addPriorityId(entry.pinnedClassroomId);
    addPriorityId(subject.pinnedClassroomId);
    if (config.target?.type === 'classroom') addPriorityId(config.target.id);
    involvedGroups.forEach(group => addPriorityId(group.pinnedClassroomId));
    teacherCandidates.forEach(teacherId => addPriorityId(index.teachersById.get(teacherId)?.pinnedClassroomId));

    data.schedulingRules.forEach(rule => {
        rule.conditions.forEach(condition => {
            if (condition.entityType === 'classroom') {
                condition.entityIds.forEach(addPriorityId);
            }
        });
    });

    const prioritized = Array.from(priorityIds)
        .map(id => suitableById.get(id))
        .filter(Boolean) as Classroom[];
    const remainingLimit = Math.max(0, MAX_PRIMARY_CLASSROOM_CANDIDATES - prioritized.length);
    const remaining = suitableClassrooms
        .filter(classroom => !priorityIds.has(classroom.id))
        .slice(0, remainingLimit);

    return [...prioritized, ...remaining];
};

const getPrimaryWorkDaysForEntry = (
    entry: UnscheduledEntry,
    workDays: Date[],
    distributeEvenly: boolean
) => {
    if (workDays.length <= MAX_PRIMARY_WORK_DAYS) return workDays;
    if (distributeEvenly && entry.targetWeek) {
        return [...workDays]
            .sort((a, b) => {
                const distanceA = Math.abs(getWeekNumber(a) - entry.targetWeek!);
                const distanceB = Math.abs(getWeekNumber(b) - entry.targetWeek!);
                return distanceA - distanceB || a.getTime() - b.getTime();
            })
            .slice(0, MAX_PRIMARY_WORK_DAYS);
    }
    return workDays.slice(0, MAX_PRIMARY_WORK_DAYS);
};

const estimateDomainSize = (
    entry: UnscheduledEntry,
    data: GenerationData,
    index: SchedulerIndex,
    workDays: Date[]
) => {
    const subject = index.subjectsById.get(entry.subjectId);
    if (!subject) return 0;

    const suitableClassroomCount = getSuitableClassrooms(entry, subject, index)?.length || 0;
    if (suitableClassroomCount === 0) return 0;

    const involvedGroups = getInvolvedGroups(entry, index);
    if (involvedGroups.length !== getEntryGroupIds(entry).length) return 0;

    const teacherCandidates = entry.teacherCandidates?.length ? entry.teacherCandidates : [entry.teacherId];
    let domainSize = 0;

    for (const date of workDays) {
        const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
        const compatibleTimeSlots = getShiftCompatibleTimeSlots(
            getActiveTimeSlotsForDate(data, date, index),
            involvedGroups
        ).filter(timeSlot =>
            involvedGroups.every(group =>
                group.availabilityGrid?.[dayName]?.[timeSlot.id] !== AvailabilityType.Forbidden
            )
        );

        for (const timeSlot of compatibleTimeSlots) {
            const feasibleTeachers = teacherCandidates.filter(teacherId =>
                index.teachersById.get(teacherId)?.availabilityGrid?.[dayName]?.[timeSlot.id] !== AvailabilityType.Forbidden
            ).length;
            domainSize += feasibleTeachers * suitableClassroomCount;
        }
    }

    return domainSize;
};

const getEntrySignature = (
    entry: UnscheduledEntry,
    data: GenerationData,
    index: SchedulerIndex,
    workDays: Date[],
    config: HeuristicConfig
) => {
    const groups = getInvolvedGroups(entry, index);
    const subject = index.subjectsById.get(entry.subjectId);
    const teacherCandidates = entry.teacherCandidates?.length ? entry.teacherCandidates : [entry.teacherId];
    const classroomTypeIds = entry.classroomTypeIds?.length
        ? entry.classroomTypeIds
        : subject?.classroomTypeRequirements?.[entry.classType] || [];
    const requiredClassroomTagIds = entry.requiredClassroomTagIds?.length
        ? entry.requiredClassroomTagIds
        : subject?.requiredClassroomTagIds || [];
    const suitableClassroomIds = subject
        ? (getSuitableClassrooms(entry, subject, index) || []).map(classroom => [
            classroom.id,
            classroom.capacity,
            classroom.typeId,
            classroom.tagIds?.join(',') || '',
            classroom.status || '', classroom.allowedClassTypes || [], classroom.availabilityGrid || {}, classroom.stepFreeAccess, classroom.roomMetadata,
        ])
        : [];
    const teacherFacts = teacherCandidates.map(teacherId => {
        const teacher = index.teachersById.get(teacherId);
        return [
            teacherId,
            teacher?.pinnedClassroomId || '',
            JSON.stringify(teacher?.availabilityGrid || {}),
        ];
    });
    const groupFacts = groups.map(group => [
        group.id,
        group.course,
        group.formOfStudy,
        group.shift || '',
        group.pinnedClassroomId || '',
        JSON.stringify(group.availabilityGrid || {}),
    ]);
    const dateFacts = workDays.map(date => {
        const dateStr = toYYYYMMDD(date);
        return [
            dateStr,
            (getActiveTimeSlotsForDate(data, date, index) || []).map(slot => `${slot.id}:${slot.shift || ''}`).join('|'),
            index.productionByDate.get(dateStr)?.isWorkDay ?? true,
        ];
    });
    const activeRules = data.schedulingRules
        .filter(rule => rule.enabled !== false)
        .filter(rule => rule.conditions.some(condition => doesConditionApply(condition, entry, index)))
        .map(rule => [
            rule.id,
            rule.action,
            rule.severity,
            rule.scope || '',
            JSON.stringify(rule.conditions),
            JSON.stringify(rule),
        ]);

    return JSON.stringify({
        version: DOMAIN_CACHE_VERSION,
        subjectId: entry.subjectId,
        classType: entry.classType,
        groupIds: getEntryGroupIds(entry).slice().sort(),
        subgroupId: entry.subgroupId || '',
        streamId: entry.streamId || '',
        studentCount: entry.studentCount,
        studentIds: entry.studentIds,
        studentFacts: entry.studentIds?.length ? entry.studentIds.map(id => index.studentsById.get(id)) : getEntryGroupIds(entry).flatMap(id => index.studentsByGroup.get(id) || []),
        campusFacts: data.buildingPlans?.filter(plan => suitableClassroomIds.some(facts => index.classroomsById.get(String(facts[0]))?.roomMetadata?.buildingPlanId === plan.id)),
        deliveryMode: entry.deliveryMode || '',
        pinnedClassroomId: entry.pinnedClassroomId || '',
        classroomTypeIds,
        requiredClassroomTagIds,
        preferredTimeSlotIds: entry.preferredTimeSlotIds || [],
        teacherCandidates,
        links: index.teacherLinksBySubjectType.get(makeSubjectTypeKey(entry.subjectId, entry.classType)),
        teacherFacts,
        groupFacts,
        suitableClassroomIds,
        resourceAbsences: (data.resourceAbsences || []).filter(absence => absence.kind === 'teacher' ? teacherCandidates.includes(absence.resourceId) : suitableClassroomIds.some(facts => facts[0] === absence.resourceId)),
        dateFacts,
        activeRules,
        timeFrame: config.timeFrame,
        target: config.target || null,
        settings: {
            respectProductionCalendar: data.settings.respectProductionCalendar,
            useShortenedPreHolidaySchedule: data.settings.useShortenedPreHolidaySchedule,
        },
    });
};

const computePlacementDomain = (
    entry: UnscheduledEntry,
    data: GenerationData,
    index: SchedulerIndex,
    workDays: Date[],
    config: HeuristicConfig
): PlacementDomain => {
    const signature = getEntrySignature(entry, data, index, workDays, config);
    const diagnostics: string[] = [];
    const subject = index.subjectsById.get(entry.subjectId);
    if (!subject) {
        diagnostics.push('Subject is missing in the subject directory.');
        return { uid: entry.uid, version: DOMAIN_CACHE_VERSION, signature, difficulty: 0, teacherIds: [], classroomIds: [], candidates: [], diagnostics };
    }

    const involvedGroups = getInvolvedGroups(entry, index);
    if (involvedGroups.length !== getEntryGroupIds(entry).length) {
        diagnostics.push('One or more groups are missing in the group directory.');
        return { uid: entry.uid, version: DOMAIN_CACHE_VERSION, signature, difficulty: 0, teacherIds: [], classroomIds: [], candidates: [], diagnostics };
    }

    const attendingStudents = entry.studentIds?.length ? entry.studentIds.flatMap(id => index.studentsById.get(id) || []) : involvedGroups.flatMap(group => index.studentsByGroup.get(group.id) || []);
    const classrooms = (getSuitableClassrooms(entry, subject, index) || []).filter(room => {
        const issues = campusPlacementIssues(entry as unknown as ScheduleEntry, room, undefined, [], data, [], attendingStudents);
        if (issues.length) diagnostics.push(...issues);
        return !issues.length;
    });
    if (classrooms.length === 0) {
        diagnostics.push(`No classroom matches capacity ${entry.studentCount}, required classroom type, and required tags.`);
    }

    const teacherIds = (entry.teacherCandidates?.length ? entry.teacherCandidates : [entry.teacherId])
        .filter(teacherId => index.teachersById.has(teacherId));
    if (teacherIds.length === 0) {
        diagnostics.push('No teacher is linked to this subject and lesson type.');
    }

    const candidates: PlacementDomainCandidate[] = [];
    let skippedByShift = 0;
    let skippedByGroupAvailability = 0;
    let skippedByTeacherAvailability = 0;
    let skippedByRoomAvailability = 0;

    for (const date of workDays) {
        const dateStr = toYYYYMMDD(date);
        const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
        const activeTimeSlots = getActiveTimeSlotsForDate(data, date, index);
        const compatibleTimeSlots = getShiftCompatibleTimeSlots(activeTimeSlots, involvedGroups);
        skippedByShift += Math.max(0, activeTimeSlots.length - compatibleTimeSlots.length);

        for (const timeSlot of compatibleTimeSlots) {
            if (!classrooms.some(room => room.availabilityGrid?.[dayName]?.[timeSlot.id] !== AvailabilityType.Forbidden && !(data.resourceAbsences || []).some(absence => absence.kind === 'classroom' && absence.resourceId === room.id && dateStr >= absence.start && dateStr <= absence.end))) { skippedByRoomAvailability++; continue; }
            if (involvedGroups.some(group => group.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden)) {
                skippedByGroupAvailability++;
                continue;
            }
            if (attendingStudents.some(student => student.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden)) { skippedByGroupAvailability++; continue; }
            const hasFeasibleTeacher = teacherIds.some(teacherId =>
                index.teachersById.get(teacherId)?.availabilityGrid?.[dayName]?.[timeSlot.id] !== AvailabilityType.Forbidden && !(data.resourceAbsences || []).some(absence => absence.kind === 'teacher' && absence.resourceId === teacherId && dateStr >= absence.start && dateStr <= absence.end)
            );
            if (!hasFeasibleTeacher) {
                skippedByTeacherAvailability++;
                continue;
            }
            candidates.push({ dateStr, dayName, timeSlotId: timeSlot.id, slotIndex: candidates.length });
        }
    }

    if (candidates.length === 0) {
        if (skippedByRoomAvailability) diagnostics.push(`Нет доступной аудитории в подходящие слоты: ${skippedByRoomAvailability}.`);
        for (const absence of data.resourceAbsences || []) if (absence.kind === 'teacher' ? teacherIds.includes(absence.resourceId) : classrooms.some(room => room.id === absence.resourceId)) diagnostics.push(`Ресурс недоступен с ${absence.start} по ${absence.end}: ${absence.reason}.`);
        if (skippedByShift > 0) diagnostics.push(`All candidate slots were rejected by group shift compatibility (${skippedByShift}).`);
        if (skippedByGroupAvailability > 0) diagnostics.push(`Group availability forbids candidate slots (${skippedByGroupAvailability}).`);
        if (skippedByTeacherAvailability > 0) diagnostics.push(`Teacher availability forbids candidate slots (${skippedByTeacherAvailability}).`);
        if (workDays.length === 0) diagnostics.push('No work days are available in the selected time frame.');
        if (diagnostics.length === 0) diagnostics.push('No feasible day and slot were found for this lesson.');
    }

    const difficulty = candidates.length * Math.max(1, teacherIds.length) * Math.max(1, classrooms.length);
    return {
        uid: entry.uid,
        version: DOMAIN_CACHE_VERSION,
        signature,
        difficulty,
        teacherIds,
        classroomIds: classrooms.map(classroom => classroom.id),
        candidates,
        diagnostics,
    };
};

const getOrComputePlacementDomain = (
    entry: UnscheduledEntry,
    data: GenerationData,
    index: SchedulerIndex,
    workDays: Date[],
    config: HeuristicConfig
) => {
    const signature = getEntrySignature(entry, data, index, workDays, config);
    const cacheKey = getDomainCacheKey(signature);
    const cached = domainCache.get(cacheKey);
    if (cached?.version === DOMAIN_CACHE_VERSION) return cached;
    const computed = computePlacementDomain(entry, data, index, workDays, config);
    domainCache.set(cacheKey, computed);
    if (domainCache.size > 5_000) {
        Array.from(domainCache.keys()).slice(0, 1_000).forEach(key => domainCache.delete(key));
    }
    return computed;
};

const precomputePlacementDomains = async (
    entries: UnscheduledEntry[],
    data: GenerationData,
    index: SchedulerIndex,
    workDays: Date[],
    config: HeuristicConfig
) => {
    const domains = new Map<string, PlacementDomain>();
    const seriesDomains = new Map<string, PlacementDomain>();
    let nextYieldAt = Date.now() + 12;
    for (let i = 0; i < entries.length; i++) {
        const { uid, targetWeek, explanation, ...facts } = entries[i];
        const seriesKey = JSON.stringify(facts);
        let domain = seriesDomains.get(seriesKey);
        if (!domain) {
            domain = getOrComputePlacementDomain(entries[i], data, index, workDays, config);
            seriesDomains.set(seriesKey, domain);
        }
        domains.set(uid, domain);
        if ((i + 1) % DOMAIN_PRECOMPUTE_BATCH_SIZE === 0 && Date.now() >= nextYieldAt) {
            await yieldToEventLoop();
            nextYieldAt = Date.now() + 12;
        }
    }
    return domains;
};

const chooseCandidate = <T>(candidates: T[], rng: () => number, stochasticity = 0): T => {
    if (candidates.length === 1 || stochasticity <= 0) return candidates[0];
    const spread = Math.max(1, Math.ceil(candidates.length * Math.min(1, stochasticity)));
    return candidates[Math.floor(rng() * spread)];
};

// Generates the initial pool of classes to be scheduled from educational plans
export const generateClassPool = (data: GenerationData, index = createSchedulerIndex(data)): UnscheduledEntry[] => {
    const { groups, electives } = data;
    const entries: UnscheduledEntry[] = [];
    const hasSharedShiftSlot = [...data.timeSlots, ...(data.settings.useShortenedPreHolidaySchedule ? data.timeSlotsShortened : []),
        ...(data.bellScheduleProfiles || []).filter(profile => profile.isActive && (profile.appliesToWeekdays?.length || profile.appliesToDates?.some(date => date >= data.settings.semesterStart && date <= data.settings.semesterEnd))).flatMap(profile => profile.slots)].some(slot => slot.shift === 'both');

    const processedGroupLectures = new Set<string>();

    groups.forEach(group => {
        const plan = getPlanForGroup(group, index);
        if (!plan) return;

        const groupSubgroups = index.subgroupsByParent.get(group.id) || [];
        const relevantEntries = plan.entries.filter(e =>
            isSemesterInCourse(e.semester, group.course) &&
            getPlanContactHours(e) > 0
        );

        relevantEntries.forEach(planEntry => {
            const planEntrySemester = planEntry.semester || 1;
            const lectureKey = `${planEntry.subjectId}-${planEntrySemester}-${group.id}`;

            // 1. Handle Lectures
            if (planEntry.lectureHours > 0 && !processedGroupLectures.has(lectureKey)) {
                const numClasses = Math.ceil(planEntry.lectureHours / 2);
                const lectureStream = selectLectureStream(group.id, planEntry.subjectId, planEntrySemester, groups, index);

                let lectureGroups: Group[] = [group];

                // Lecture streams are optional filters: empty subject means any shared lecture,
                // filled subject means only that discipline.
                if (lectureStream) {
                    lectureGroups = getLectureGroupsForStream(lectureStream, planEntry.subjectId, planEntrySemester, groups, index).filter(candidate =>
                        !processedGroupLectures.has(`${planEntry.subjectId}-${planEntrySemester}-${candidate.id}`) &&
                        candidate.course === group.course &&
                        getPlanForGroup(candidate, index)?.entries.find(item => item.subjectId === planEntry.subjectId && item.semester === planEntrySemester)?.lectureHours === planEntry.lectureHours &&
                        (!group.shift || !candidate.shift || group.shift === 'both' || candidate.shift === 'both' || candidate.shift === group.shift || hasSharedShiftSlot)
                    );
                }

                const streamCoversExactly = lectureStream
                    ? sameGroupSet(lectureStream.groupIds, lectureGroups.map(g => g.id))
                    : false;
                const exactLectureStream = streamCoversExactly ? lectureStream : undefined;

                        const teacherCandidates = getTeacherCandidates(planEntry.subjectId, ClassType.Lecture, index, exactLectureStream?.teacherId, lectureGroups, exactLectureStream?.id);
                {
                    const studentCount = lectureGroups.reduce((sum, g) => sum + g.studentCount, 0);
                    const groupIds = lectureGroups.map(g => g.id);
                    const subjectClassroomTypes = index.subjectsById.get(planEntry.subjectId)?.classroomTypeRequirements?.[ClassType.Lecture] || [];
                    const classroomTypeIds = Array.from(new Set([
                        ...(exactLectureStream?.classroomTypeId ? [exactLectureStream.classroomTypeId] : []),
                        ...subjectClassroomTypes,
                    ]));

                    for (let i = 0; i < numClasses; i++) {
                        const entry: UnscheduledEntry = {
                            uid: `unsched-${planEntry.subjectId}-sem${planEntrySemester}-${groupIds.join('_')}-${ClassType.Lecture}-${i}`,
                            subjectId: planEntry.subjectId,
                            classType: ClassType.Lecture,
                            teacherId: teacherCandidates[0] || '',
                            teacherCandidates,
                            studentCount,
                            classroomTypeIds: classroomTypeIds.length > 0 ? classroomTypeIds : undefined,
                        };
                        if (lectureGroups.length > 1) {
                            entry.groupIds = groupIds;
                            if (exactLectureStream) entry.streamId = exactLectureStream.id;
                        } else {
                            entry.groupId = group.id;
                        }
                        entries.push(entry);
                    }
                }

                // Mark all participating groups as processed for this subject's lecture
                lectureGroups.forEach(g => processedGroupLectures.add(`${planEntry.subjectId}-${planEntrySemester}-${g.id}`));
            }

            // 2. Handle Practices and Labs
            const practiceAndLabTypes = [
                ...getPlanContactActivities(planEntry).filter(activity => activity.type !== ClassType.Lecture),
            ];
            practiceAndLabTypes.forEach(({ type, hours }) => {
                if (hours <= 0) return;
                const numClasses = Math.ceil(hours / 2);

                if (planEntry.splitForSubgroups && groupSubgroups.length > 0 && [ClassType.Practical, ClassType.Lab].includes(type)) {
                    groupSubgroups.forEach(subgroup => {
                        const assignment = subgroup.teacherAssignments?.find(a => a.subjectId === planEntry.subjectId && a.classType === type);
                        const teacherCandidates = getTeacherCandidates(planEntry.subjectId, type, index, assignment?.teacherId, [group]);
                        {
                            for (let i = 0; i < numClasses; i++) {
                                entries.push({
                                    uid: `unsched-${planEntry.subjectId}-sem${planEntrySemester}-${subgroup.id}-${type}-${i}`,
                                    subjectId: planEntry.subjectId, groupId: group.id, subgroupId: subgroup.id,
                                    classType: type, teacherId: teacherCandidates[0], teacherCandidates, studentCount: subgroup.studentCount,
                                });
                            }
                        }
                    });
                } else { // Whole group for practice/lab
                    const teacherCandidates = getTeacherCandidates(planEntry.subjectId, type, index, undefined, [group]);
                    {
                        for (let i = 0; i < numClasses; i++) {
                            entries.push({
                                uid: `unsched-${planEntry.subjectId}-sem${planEntrySemester}-${group.id}-${type}-${i}`,
                                subjectId: planEntry.subjectId, groupId: group.id,
                                classType: type, teacherId: teacherCandidates[0], teacherCandidates, studentCount: group.studentCount,
                            });
                        }
                    }
                }
            });
        });
    });

    electives.forEach(elective => entries.push(...electiveDemand(elective, data.students || [], groups)));

    return entries;
};


export const generateScheduleWithHeuristics = async (data: GenerationData, config: HeuristicConfig, options: SchedulerRunOptions = {}): Promise<SchedulerResult> => {
    try { return await generateScheduleCore(data, config, options); }
    finally { options.candidateEvaluator?.dispose(); }
};

const generateScheduleCore = async (data: GenerationData, config: HeuristicConfig, options: SchedulerRunOptions): Promise<SchedulerResult> => {
    const explanations: Record<string, SchedulingExplanation> = {};
    const index = createSchedulerIndex(data);
    const rng = createSeededRandom(config.seed);
    const runStartedAt = Date.now();
    let lastProgressAt = 0;
    const reportProgress = (
        phase: string,
        processed: number,
        total: number,
        scheduleSnapshot: ScheduleEntry[],
        failedSnapshot: UnscheduledEntry[],
        label: string
    ) => {
        if (!options.onProgress) return;
        if (phase === 'placing' && Date.now() - lastProgressAt < 2_000) return;
        lastProgressAt = Date.now();
        const remaining = Math.max(0, total - processed);
        const score = calculateScheduleScore(data, { schedule: scheduleSnapshot, unschedulable: [...failedSnapshot, ...new Array(remaining)] }, config, index);
        const { hardViolations, softPenalty, total: penalty } = score;
        const readiness = total > 0 ? (scheduleSnapshot.length / total) * 100 : 100;
        options.onProgress({
            phase,
            timeMs: Date.now() - runStartedAt,
            penalty,
            readiness,
            placed: scheduleSnapshot.length,
            processed,
            total,
            unscheduled: failedSnapshot.length + remaining,
            hardViolations,
            softPenalty,
            label,
            partialSchedule: scheduleSnapshot.slice(),
            failedEntries: failedSnapshot.slice(),
            explanations: { ...explanations },
        });
    };

    // Check for native scheduler availability
    // We import dynamically to avoid issues if the module is not built
    let nativeService;
    try {
        if (config.useNative) nativeService = require('./nativeScheduler');
    } catch (e) { }

    if (config.useNative && data.schedulingRules.length === 0 && !data.resourceAbsences?.length && !data.settings.travelPolicy?.enabled && !data.students?.length && !data.electives.some(item => item.studentIds?.length) && !data.schedule.some(isIndividualEntry) && !config.targetGroupIds?.length && nativeService && nativeService.isNativeSchedulerAvailable() && !config.target) { // Native only supports full generation for now
        console.log("Using Native C++ Scheduler...");
        try {
            const classPool = generateClassPool(data, index);
            const nativeSchedule = await nativeService.generateScheduleWithNative(
                data.teachers,
                data.groups,
                data.classrooms,
                data.subjects,
                data.timeSlots,
                classPool,
                config
            );

            // Native scheduler returns placed entries. We need to calculate unschedulable.
            const placedUids = new Set(nativeSchedule.map((e: any) => e.unscheduledUid));
            const unschedulable = classPool.filter(e => !placedUids.has(e.uid)).map(entry => {
                const explanation = explainEntry(
                    entry,
                    { ...createEmptyRejectionStats(), data: 1 },
                    ['Нативный планировщик не вернул размещение для этого занятия. Запустите эвристический режим без native-сборки для подробной диагностики.'],
                    'Нативный планировщик',
                    'Занятие осталось нераспределенным после нативного прогона.'
                );
                explanations[entry.uid] = explanation;
                return { ...entry, explanation };
            });

            const retainedExistingSchedule = expandScheduleOccurrences(data, getRetainedExistingSchedule(data.schedule, config), config.timeFrame);
            const refinedNativeSchedule = await refineSchedule(
                nativeSchedule,
                { ...data, schedule: retainedExistingSchedule },
                config,
                index
            );

            const result = { schedule: refinedNativeSchedule, unschedulable, explanations };
            const score = calculateScheduleScore(data, result, config);
            if (score.hardViolations) throw new Error('Нативный результат не прошёл общую валидацию.');
            return { ...result, score };
        } catch (e) {
            console.error("Native scheduler failed, falling back to JS implementation:", e);
        }
    }

    // --- 1. INITIALIZATION ---
    const { strictness, target, timeFrame, clearExisting, enforceLectureOrder, distributeEvenly } = config;
    const { teachers, groups, classrooms, timeSlots, settings } = data;

    const newSchedule: ScheduleEntry[] = [];
    const unschedulable: UnscheduledEntry[] = [];
    const softPenaltyMultiplier = strictness / 5.0; // Scale strictness from 1-10 to a multiplier

    // Populate with existing schedule entries that are NOT being cleared
    const existingSchedule = expandScheduleOccurrences(data, getRetainedExistingSchedule(data.schedule, config), config.timeFrame);
    const schedulingData = { ...data, schedule: existingSchedule };
    await options.candidateEvaluator?.initialize(schedulingData, config);

    const resourceBookings = createResourceBookings(teachers, groups, classrooms, existingSchedule);
    const fastResourceIndex = createFastResourceIndex(existingSchedule);
    const incrementalScoreState = createIncrementalScoreState(existingSchedule);

    // --- 2. PREPARE CLASS POOL AND WORKDAYS ---
    let classPool = generateClassPool(data, index).filter(entry => {
        const semester = entry.semester || entry.uid.match(/-sem(\d+)-/)?.[1];
        return !semester || matchesSemesterParity(Number(semester), config.semesterParity || 'all');
    });
    if (config.targetGroupIds?.length) classPool = classPool.filter(entry => getEntryGroupIds(entry).some(id => config.targetGroupIds!.includes(id)));
    const semesterOf = (uid?: string) => uid?.match(/-sem(\d+)-/)?.[1];
    const semesterPeriod = settings.semesterStart <= timeFrame.end && settings.semesterEnd >= timeFrame.start
        ? { start: settings.semesterStart, end: settings.semesterEnd } : timeFrame;
    const existingDemand = existingSchedule.filter(entry => (!isIndividualEntry(entry) || entry.unscheduledUid?.startsWith('unsched-elective-')) && entry.date && entry.date >= semesterPeriod.start && entry.date <= semesterPeriod.end);
    classPool = classPool.filter(entry => {
        let match = existingDemand.findIndex(placed => placed.unscheduledUid === entry.uid && entriesBelongToSameSeries(entry, placed));
        if (match < 0) match = existingDemand.findIndex(placed =>
            (!semesterOf(placed.unscheduledUid) || !semesterOf(entry.uid) || semesterOf(placed.unscheduledUid) === semesterOf(entry.uid)) &&
            entriesBelongToSameSeries(entry, placed));
        if (match < 0) return true;
        existingDemand.splice(match, 1); return false;
    });

    if (target) {
        classPool = classPool.filter(entry => {
            if (target.type === 'group') {
                return entry.groupId === target.id || (entry.groupIds || []).includes(target.id);
            }
            if (target.type === 'teacher') return entry.teacherId === target.id || !!entry.teacherCandidates?.includes(target.id);
            return true; // Classroom target is a preference, not a filter
        });
        if (target.type === 'teacher') {
            classPool = classPool.map(entry => ({
                ...entry,
                teacherId: target.id,
                teacherCandidates: [target.id],
            }));
        }
    }

    if (distributeEvenly) {
        const startDate = new Date(timeFrame.start + 'T00:00:00');
        const endDate = new Date(timeFrame.end + 'T00:00:00');
        const totalWeeks = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)));
        const startWeek = getWeekNumber(startDate);

        const classGroups = new Map<string, UnscheduledEntry[]>();
        classPool.forEach(entry => {
            const groupIds = entry.groupIds?.join(',') || entry.groupId;
            const key = `${entry.subjectId}-${groupIds}-${entry.classType}`;
            if (!classGroups.has(key)) {
                classGroups.set(key, []);
            }
            classGroups.get(key)!.push(entry);
        });

        classGroups.forEach(group => {
            const numClasses = group.length;
            if (numClasses === 0) return;

            const interval = totalWeeks / numClasses;
            group.forEach((entry, index) => {
                const targetWeekOffset = Math.floor(index * interval);
                entry.targetWeek = startWeek + targetWeekOffset;
            });
        });
    }

    const workDays = createWorkDays(data, config, index);
    const domainMap = await precomputePlacementDomains(classPool, data, index, workDays, config);
    // Evaluate priorities once instead of scanning the semester inside each sort comparison.
    const domainPriorities = new Map<PlacementDomain, number>();
    const priorities = new Map(classPool.map(entry => {
        const domain = domainMap.get(entry.uid)!;
        if (!domainPriorities.has(domain)) domainPriorities.set(domain, getConstraintScore(entry, data, index, workDays, domain.difficulty));
        return [entry.uid, domainPriorities.get(domain)!] as const;
    }));
    classPool.sort((a, b) => priorities.get(b.uid)! - priorities.get(a.uid)!);
    reportProgress('preparing', 0, classPool.length, newSchedule, unschedulable, 'Домен занятий рассчитан. Начинаю расстановку самых трудных пар.');

    // --- 3. PLACEMENT LOOP ---
    let processedEntries = 0;
    for (const [entryIndex, entryToPlace] of classPool.entries()) {
        processedEntries = entryIndex;
        if (entryIndex % SCHEDULER_YIELD_INTERVAL === 0) {
            reportProgress('placing', entryIndex, classPool.length, newSchedule, unschedulable, `Размещено ${newSchedule.length} из ${classPool.length}.`);
            await yieldToEventLoop();
        }
        if (options.shouldStop?.()) {
            classPool.slice(processedEntries).forEach(remainingEntry => markUnscheduled(remainingEntry, unschedulable, explanations, explainEntry(
                remainingEntry,
                { ...createEmptyRejectionStats(), data: 1 },
                ['Генерация остановлена пользователем: текущий лучший частичный результат забран без полного перезапуска.'],
                'Остановка',
                'Пара не распределялась, потому что пользователь забрал текущий результат.'
            )));
            const interruptedResult = { schedule: newSchedule, unschedulable, explanations, interrupted: true };
            reportProgress('stopping', classPool.length, classPool.length, newSchedule, unschedulable, 'Останавливаю генерацию и сохраняю текущий результат.');
            return { ...interruptedResult, score: calculateScheduleScore(data, interruptedResult, config, index) };
        }
        let bestSlots: { date: Date, timeSlotId: string, classroom: Classroom, teacherId: string, cost: number }[] = [];
        const TOP_N_CANDIDATES = 5;

        const involvedGroupIds = getEntryGroupIds(entryToPlace);
        if (involvedGroupIds.length === 0) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                { ...createEmptyRejectionStats(), data: 1 },
                ['У занятия не указана группа, подгруппа или поток.'],
                'Учебный план',
                'Недостаточно данных для определения участников занятия.'
            ));
            continue;
        }
        const involvedGroups = getInvolvedGroups(entryToPlace, index);
        if (involvedGroups.length !== involvedGroupIds.length) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                { ...createEmptyRejectionStats(), data: 1 },
                ['Одна или несколько групп из учебного плана не найдены в справочнике групп.'],
                'Группы',
                'Невозможно проверить занятость группы из-за несогласованных справочников.'
            ));
            continue;
        }

        const subject = index.subjectsById.get(entryToPlace.subjectId);
        if (!subject) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                { ...createEmptyRejectionStats(), data: 1 },
                ['Дисциплина из учебного плана отсутствует в справочнике дисциплин.'],
                'Дисциплины',
                'Невозможно подобрать аудиторию и правила без карточки дисциплины.'
            ));
            continue;
        }

        const requiredClassroomTypes = entryToPlace.classroomTypeIds?.length ? entryToPlace.classroomTypeIds : getRequiredClassroomTypes(subject, entryToPlace.classType);
        if (!requiredClassroomTypes || requiredClassroomTypes.length === 0) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                { ...createEmptyRejectionStats(), classroom: 1 },
                [`Для типа занятия "${entryToPlace.classType}" не заданы требуемые типы аудиторий.`],
                'Аудитории',
                'Не задано правило подбора аудитории для этой дисциплины и типа занятия.'
            ));
            continue;
        }

        const suitableClassrooms = getSuitableClassrooms(entryToPlace, subject, index) || [];

        if (suitableClassrooms.length === 0) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                { ...createEmptyRejectionStats(), classroom: 1 },
                [
                    'Нет аудитории с подходящим типом, вместимостью и обязательными тегами.',
                    `Требуется мест: ${entryToPlace.studentCount}.`
                ],
                'Аудитории',
                'Аудиторный фонд стал узким местом для этого занятия.'
            ));
            continue;
        }

        const domain = domainMap.get(entryToPlace.uid) || getOrComputePlacementDomain(entryToPlace, data, index, workDays, config);
        if (domain.teacherIds.length === 0 || domain.classroomIds.length === 0 || domain.candidates.length === 0) {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                {
                    ...createEmptyRejectionStats(),
                    teacher: domain.teacherIds.length === 0 ? 1 : 0,
                    classroom: domain.classroomIds.length === 0 ? 1 : 0,
                    calendar: domain.candidates.length === 0 ? 1 : 0,
                },
                domain.diagnostics.length ? domain.diagnostics : ['Precomputed domain is empty. No feasible teacher, room, day, and slot combination exists.'],
                domain.teacherIds.length === 0 ? 'Преподаватели' : domain.classroomIds.length === 0 ? 'Аудитории' : 'Календарь',
                'Домен занятия пуст: генератор заранее не нашёл допустимых вариантов размещения.'
            ));
            continue;
        }
        const domainSlotKeys = new Set(domain.candidates.map(candidate => `${candidate.dateStr}-${candidate.timeSlotId}`));
        const domainClassroomIds = new Set(domain.classroomIds);

        const stats = createEmptyRejectionStats();
        const conflicts: string[] = [];
        const teacherCandidates = domain.teacherIds;
        const primaryClassrooms = getPrimaryClassroomCandidates(entryToPlace, subject, suitableClassrooms, involvedGroups, teacherCandidates, data, config, index);
        const primaryWorkDays = getPrimaryWorkDaysForEntry(entryToPlace, workDays, distributeEvenly);

        const scanClassrooms = async (classroomsToScan: Classroom[], daysToScan: Date[]) => {
            let pending: PlacementCandidate[] = [];
            const flush = async () => {
                const candidates = pending; pending = [];
                const costs = await evaluatePlacementCandidates(entryToPlace, newSchedule, candidates, schedulingData, config, index, resourceBookings, options);
                for (let i = 0; i < candidates.length; i++) {
                    const candidate = candidates[i], cost = costs[i];
                    if (!Number.isFinite(cost)) {
                        stats.rules++;
                        if (conflicts.length < 6) conflicts.push(`Ограничения запрещают ${candidate.dateStr}, слот ${candidate.timeSlotId}.`);
                        continue;
                    }
                    const slot = { date: new Date(candidate.dateStr + 'T00:00:00'), timeSlotId: candidate.timeSlotId, classroom: index.classroomsById.get(candidate.classroomId)!, teacherId: candidate.teacherId, cost };
                    if (bestSlots.length < TOP_N_CANDIDATES) bestSlots.push(slot);
                    else if (cost < bestSlots[TOP_N_CANDIDATES - 1].cost) bestSlots[TOP_N_CANDIDATES - 1] = slot;
                    bestSlots.sort((a, b) => a.cost - b.cost);
                    if (bestSlots.length >= TOP_N_CANDIDATES && bestSlots[TOP_N_CANDIDATES - 1].cost <= GOOD_ENOUGH_SLOT_COST) return true;
                }
                return false;
            };
            for (let dateIndex = 0; dateIndex < daysToScan.length; dateIndex++) {
                if (dateIndex > 0 && dateIndex % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();

                const date = daysToScan[dateIndex];
                const dateStr = toYYYYMMDD(date);
                const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];

                const activeTimeSlots = getActiveTimeSlotsForDate(data, date, index);
                const compatibleTimeSlots = getShiftCompatibleTimeSlots(activeTimeSlots, involvedGroups);
                if (compatibleTimeSlots.length === 0 && activeTimeSlots.length > 0) {
                    stats.group += activeTimeSlots.length;
                    conflicts.push(`Для групп ${involvedGroups.map(group => group.number).join(', ')} нет слотов подходящей смены на ${dateStr}.`);
                }

                for (const timeSlot of compatibleTimeSlots) {
                    const bookingKey = `${dateStr}-${timeSlot.id}`;
                    if (!domainSlotKeys.has(bookingKey)) continue;
                    stats.checkedSlots++;

                    if (involvedGroups.some(g => fastResourceHas(fastResourceIndex, `group-${g.id}`, bookingKey) || !isIndividualEntry(entryToPlace) && fastResourceHas(fastResourceIndex, `individual-group-${g.id}`, bookingKey)) || entryToPlace.studentIds?.some(id => fastResourceHas(fastResourceIndex, `student-${id}`, bookingKey))) {
                        stats.group++;
                        conflicts.push(`Группа или поток уже заняты: ${dateStr}, ${timeSlot.time}.`);
                        continue;
                    }

                    const forbiddenGroup = involvedGroups.find(g => g.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden);
                    if (forbiddenGroup) {
                        stats.group++;
                        conflicts.push(`У группы ${forbiddenGroup.number} запрещен слот: ${dayName}, ${timeSlot.time}.`);
                        continue;
                    }

                    for (const teacherId of teacherCandidates) {
                        const teacherAbsence = data.resourceAbsences?.find(absence => absence.kind === 'teacher' && absence.resourceId === teacherId && dateStr >= absence.start && dateStr <= absence.end);
                        if (teacherAbsence) { stats.teacher++; conflicts.push(`Преподаватель недоступен: ${teacherAbsence.reason}, ${dateStr}.`); continue; }
                        if (fastResourceHas(fastResourceIndex, `teacher-${teacherId}`, bookingKey)) {
                            stats.teacher++;
                            conflicts.push(`Преподаватель занят: ${dateStr}, ${timeSlot.time}.`);
                            continue;
                        }
                        if (index.teachersById.get(teacherId)?.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden) {
                            stats.teacher++;
                            conflicts.push(`У преподавателя запрещен слот: ${dayName}, ${timeSlot.time}.`);
                            continue;
                        }

                        for (const classroom of classroomsToScan) {
                            const roomAbsence = data.resourceAbsences?.find(absence => absence.kind === 'classroom' && absence.resourceId === classroom.id && dateStr >= absence.start && dateStr <= absence.end);
                            if (roomAbsence) { stats.classroom++; conflicts.push(`Аудитория ${classroom.number} недоступна: ${roomAbsence.reason}, ${dateStr}.`); continue; }
                            if (!domainClassroomIds.has(classroom.id)) continue;
                            stats.checkedClassrooms++;
                            if (fastResourceHas(fastResourceIndex, `classroom-${classroom.id}`, bookingKey)) {
                                stats.classroom++;
                                conflicts.push(`Аудитория ${classroom.number} занята: ${dateStr}, ${timeSlot.time}.`);
                                continue;
                            }

                            pending.push({ dateStr, timeSlotId: timeSlot.id, classroomId: classroom.id, teacherId });
                            if (pending.length >= 1024 && await flush()) return;
                        }
                    }
                }
            }
            await flush();
        };

        await scanClassrooms(primaryClassrooms, primaryWorkDays);
        if (bestSlots.length === 0 && primaryClassrooms.length < suitableClassrooms.length) {
            await scanClassrooms(suitableClassrooms, primaryWorkDays);
        }
        if (bestSlots.length === 0 && primaryWorkDays.length < workDays.length) {
            await scanClassrooms(primaryClassrooms, workDays);
        }
        if (bestSlots.length === 0 && primaryWorkDays.length < workDays.length && primaryClassrooms.length < suitableClassrooms.length) {
            await scanClassrooms(suitableClassrooms, workDays);
        }

        // Only the coordinator commits a placement, after checking the current resource snapshot.
        bestSlots = bestSlots.filter(slot => Number.isFinite(calculateSlotCost({ ...entryToPlace, teacherId: slot.teacherId }, slot.date, slot.timeSlotId, slot.classroom,
            involvedGroups, resourceBookings, schedulingData, softPenaltyMultiplier, newSchedule, config, getActiveTimeSlotsForDate(data, slot.date, index), index)));
        if (bestSlots.length > 0) {
            const chosenSlot = chooseCandidate(bestSlots, rng, config.stochasticity ?? 0);
            const bookingKey = `${toYYYYMMDD(chosenSlot.date)}-${chosenSlot.timeSlotId}`;
            const dayName = DAYS_OF_WEEK[chosenSlot.date.getDay() === 0 ? 6 : chosenSlot.date.getDay() - 1];

            const newEntry: ScheduleEntry = {
                id: `sched-h-${entryToPlace.uid}-${Math.floor(rng() * 1_000_000_000)}`,
                day: dayName,
                date: toYYYYMMDD(chosenSlot.date),
                timeSlotId: chosenSlot.timeSlotId,
                classroomId: chosenSlot.classroom.id,
                groupId: entryToPlace.groupId,
                studentIds: entryToPlace.studentIds,
                semester: entryToPlace.semester,
                academicWorkId: entryToPlace.academicWorkId,
                additionalTeacherIds: entryToPlace.additionalTeacherIds,
                classroomTypeIds: entryToPlace.classroomTypeIds,
                requiredClassroomTagIds: entryToPlace.requiredClassroomTagIds,
                pinnedClassroomId: entryToPlace.pinnedClassroomId,
                preferredTimeSlotIds: entryToPlace.preferredTimeSlotIds,
                groupIds: entryToPlace.groupIds,
                subgroupId: entryToPlace.subgroupId,
                streamId: entryToPlace.streamId,
                subjectId: entryToPlace.subjectId,
                teacherId: chosenSlot.teacherId,
                classType: entryToPlace.classType,
                deliveryMode: entryToPlace.deliveryMode || DeliveryMode.Offline,
                unscheduledUid: entryToPlace.uid,
                weekType: 'every' // Dated entries don't need week separation
            };
            newSchedule.push(newEntry);

            bookedResourceKeys(newEntry).forEach(key => { addBooking(resourceBookings, key, bookingKey); fastResourceAdd(fastResourceIndex, key, bookingKey); });
            applyScoreStateEntry(incrementalScoreState, newEntry, 1);

        } else {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                stats,
                conflicts.length > 0 ? conflicts : ['В выбранном диапазоне нет рабочих слотов после учета календаря, расписания звонков и ограничений.'],
                stats.teacher >= stats.classroom && stats.teacher >= stats.group ? 'Преподаватель' : stats.classroom >= stats.group ? 'Аудитории' : 'Группы/поток'
            ));
        }

        processedEntries++;
        if (processedEntries % 10 === 0 || processedEntries === classPool.length) {
            reportProgress('placing', processedEntries, classPool.length, newSchedule, unschedulable, `Размещено ${newSchedule.length} из ${classPool.length}. Проверяю ограничения и узкие места.`);
        }
        if (processedEntries % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();
    }

    // --- 4. REFINEMENT PHASE ---
    if (newSchedule.length > 0) {
        console.log(`Initial placement finished. ${newSchedule.length} entries placed. Starting refinement.`);
        reportProgress('refining', classPool.length, classPool.length, newSchedule, unschedulable, 'Первичная сетка собрана. Снижаю штрафы локальными перестановками.');
        const refinedSchedule = await refineSchedule(newSchedule, schedulingData, config, index, options);
        const result = { schedule: refinedSchedule, unschedulable, explanations, interrupted: options.shouldStop?.() || false };
        reportProgress('completed', classPool.length, classPool.length, refinedSchedule, unschedulable, 'Генерация завершена. Готовлю триаж оставшихся проблем.');
        return { ...result, score: calculateScheduleScore(data, result, config, index) };
    }


    const result = { schedule: newSchedule, unschedulable, explanations };
    reportProgress('completed', classPool.length, classPool.length, newSchedule, unschedulable, 'Генерация завершена без размещённых занятий.');
    return { ...result, score: calculateScheduleScore(data, result, config, index) };
};


// Determines scheduling priority. Higher score = scheduled earlier.
const getConstraintScore = (entry: UnscheduledEntry, data: GenerationData, index: SchedulerIndex, workDays: Date[], domainSize = 0): number => {
    let score = 0;
    const group = index.groupsById.get(entry.groupId || entry.groupIds?.[0] || '');
    const subject = index.subjectsById.get(entry.subjectId);
    const teacher = index.teachersById.get(entry.teacherId);

    if (entry.streamId || (entry.groupIds && entry.groupIds.length > 1)) score += 200;
    if (entry.classType === ClassType.Lab) score += 100;
    if (entry.classType === ClassType.Elective) score -= 50;
    if (entry.subgroupId) score += 50;
    score += entry.studentCount * 2;

    const teacherLinkCount = entry.teacherCandidates?.length || index.teacherLinksBySubjectType.get(makeSubjectTypeKey(entry.subjectId, entry.classType))?.length || 0;
    if (teacherLinkCount <= 1) score += 150;
    else score -= teacherLinkCount * 5;

    if (teacher?.pinnedClassroomId) score += 30;
    if (subject?.pinnedClassroomId) score += 30;
    if (group?.pinnedClassroomId) score += 30;

    if (subject) {
        const suitableClassrooms = getSuitableClassrooms(entry, subject, index);
        const suitableCount = suitableClassrooms?.length ?? 0;
        if (suitableCount === 0) score += 1_000;
        else score += Math.max(0, 250 - suitableCount * 12);
    }

    const teacherAvailableSlots = workDays.reduce((count, date) => {
        const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
        const involvedGroups = getInvolvedGroups(entry, index);
        return count + getActiveTimeSlotsForDate(data, date, index)
            .filter(slot => areGroupsCompatibleWithTimeSlot(slot, involvedGroups))
            .filter(slot => involvedGroups.every(group => group.availabilityGrid?.[dayName]?.[slot.id] !== AvailabilityType.Forbidden))
            .filter(slot => teacher?.availabilityGrid?.[dayName]?.[slot.id] !== AvailabilityType.Forbidden)
            .length;
    }, 0);
    score += Math.max(0, 300 - teacherAvailableSlots);

    const applicableRuleCount = data.schedulingRules
        .filter(rule => rule.enabled !== false)
        .filter(rule => rule.conditions.some(condition => doesConditionApply(condition, entry, index))).length;
    score += applicableRuleCount * 25;
    if (domainSize === 0) score += 2_000;
    else score += Math.max(0, 1_000 - Math.min(domainSize, 1_000));

    return score;
};

const doesConditionApply = (condition: RuleCondition, entry: UnscheduledEntry, index: SchedulerIndex): boolean => {
    const groupIds = getEntryGroupIds(entry);
    const groups = groupIds.map(groupId => index.groupsById.get(groupId)).filter(Boolean) as Group[];
    const teacher = index.teachersById.get(entry.teacherId);
    switch (condition.entityType) {
        case 'teacher':
            return condition.entityIds.includes(entry.teacherId) ||
                (entry.teacherCandidates || []).some(teacherId => condition.entityIds.includes(teacherId));
        case 'group':
            return groupIds.some(gid => condition.entityIds.includes(gid));
        case 'stream':
            return !!entry.streamId && condition.entityIds.includes(entry.streamId);
        case 'subgroup':
            return !!entry.subgroupId && condition.entityIds.includes(entry.subgroupId);
        case 'subject':
            if (condition.entityIds.includes(entry.subjectId)) {
                return !condition.classType || condition.classType === entry.classType;
            }
            return false;
        case 'classType':
            return condition.entityIds.includes(entry.classType);
        case 'classroomType':
            return (entry.classroomTypeIds || []).some(typeId => condition.entityIds.includes(typeId));
        case 'classroomTag':
            return (entry.requiredClassroomTagIds || []).some(tagId => condition.entityIds.includes(tagId));
        case 'department':
            return (!!teacher && condition.entityIds.includes(teacher.departmentId)) ||
                groups.some(group => condition.entityIds.includes(group.departmentId));
        case 'specialty':
            return groups.some(group => condition.entityIds.includes(group.specialtyId));
        case 'formOfStudy':
            return groups.some(group => condition.entityIds.includes(group.formOfStudy));
        case 'shift':
            return groups.some(group => group.shift && condition.entityIds.includes(group.shift));
        default:
            return false;
    }
};

type RuleContextEntry = UnscheduledEntry | ScheduleEntry;

interface RuleEvaluationContext {
    finalValidation?: boolean;
    entry: RuleContextEntry;
    classroom?: Classroom;
    involvedGroups: Group[];
    teacher?: Teacher;
    dateStr: string;
    dayName: string;
    timeSlotId: string;
    activeTimeSlots: TimeSlot[];
    schedule: ScheduleEntry[];
    index: SchedulerIndex;
    penaltyMultiplier: number;
}

const getRulePenalty = (severity: RuleSeverity, penaltyMultiplier: number) => {
    switch (severity) {
        case RuleSeverity.Strict: return 1_000_000;
        case RuleSeverity.Strong: return 500 * penaltyMultiplier;
        case RuleSeverity.Medium: return 100 * penaltyMultiplier;
        case RuleSeverity.Weak: return 20 * penaltyMultiplier;
        default: return 0;
    }
};

const getWeekTypeForDate = (dateStr: string): WeekType => getWeekNumber(new Date(dateStr)) % 2 === 0 ? 'even' : 'odd';

const conditionMatchesContext = (condition: RuleCondition, context: RuleEvaluationContext, entry: RuleContextEntry = context.entry): boolean => {
    const groupIds = getEntryGroupIds(entry);
    const teacher = context.index.teachersById.get(entry.teacherId);
    const groups = groupIds.map(groupId => context.index.groupsById.get(groupId)).filter(Boolean) as Group[];
    const classroom = 'classroomId' in entry ? context.index.classroomsById.get(entry.classroomId) : context.classroom;

    switch (condition.entityType) {
        case 'teacher':
            return condition.entityIds.includes(entry.teacherId) ||
                ('additionalTeacherIds' in entry && (entry.additionalTeacherIds || []).some(id => condition.entityIds.includes(id))) ||
                ('teacherCandidates' in entry && (entry.teacherCandidates || []).some(teacherId => condition.entityIds.includes(teacherId)));
        case 'group':
            return groupIds.some(gid => condition.entityIds.includes(gid));
        case 'stream':
            return !!entry.streamId && condition.entityIds.includes(entry.streamId);
        case 'subgroup':
            return !!entry.subgroupId && condition.entityIds.includes(entry.subgroupId);
        case 'subject':
            return condition.entityIds.includes(entry.subjectId) && (!condition.classType || condition.classType === entry.classType);
        case 'classType':
            return condition.entityIds.includes(entry.classType);
        case 'classroom':
            return 'classroomId' in entry
                ? condition.entityIds.includes(entry.classroomId)
                : !!context.classroom && condition.entityIds.includes(context.classroom.id);
        case 'classroomType':
            return !!classroom && condition.entityIds.includes(classroom.typeId);
        case 'classroomTag':
            return !!classroom && (classroom.tagIds || []).some(tagId => condition.entityIds.includes(tagId));
        case 'department':
            return (!!teacher && condition.entityIds.includes(teacher.departmentId)) ||
                groups.some(group => condition.entityIds.includes(group.departmentId)) ||
                (!!classroom?.departmentId && condition.entityIds.includes(classroom.departmentId));
        case 'specialty':
            return groups.some(group => condition.entityIds.includes(group.specialtyId));
        case 'formOfStudy':
            return groups.some(group => condition.entityIds.includes(group.formOfStudy));
        case 'shift':
            return groups.some(group => group.shift && condition.entityIds.includes(group.shift));
        default:
            return false;
    }
};

const ruleScopeMatchesContext = (rule: SchedulingRule, context: RuleEvaluationContext): boolean => {
    const scope = rule.scope;
    if (!scope) return true;

    if (scope.startDate && context.dateStr < scope.startDate) return false;
    if (scope.endDate && context.dateStr > scope.endDate) return false;
    if (scope.weekType && scope.weekType !== 'any' && scope.weekType !== 'every' && getWeekTypeForDate(context.dateStr) !== scope.weekType) return false;

    if (scope.course && !context.involvedGroups.some(group => group.course === scope.course)) return false;
    if (scope.semester && !context.involvedGroups.some(group => isSemesterInCourse(scope.semester!, group.course))) return false;
    if (scope.formOfStudy && scope.formOfStudy !== 'any' && !context.involvedGroups.some(group => group.formOfStudy === scope.formOfStudy)) return false;
    if (scope.shift && scope.shift !== 'any' && !context.involvedGroups.some(group => group.shift === scope.shift)) return false;
    if (scope.departmentIds?.length) {
        const classroomDepartmentId = context.classroom?.departmentId;
        const teacherDepartmentId = context.teacher?.departmentId;
        const hasDepartment = context.involvedGroups.some(group => scope.departmentIds!.includes(group.departmentId)) ||
            (!!teacherDepartmentId && scope.departmentIds.includes(teacherDepartmentId)) ||
            (!!classroomDepartmentId && scope.departmentIds.includes(classroomDepartmentId));
        if (!hasDepartment) return false;
    }
    if (scope.specialtyIds?.length && !context.involvedGroups.some(group => scope.specialtyIds!.includes(group.specialtyId))) return false;
    if (scope.classroomTypeIds?.length && (!context.classroom || !scope.classroomTypeIds.includes(context.classroom.typeId))) return false;
    if (scope.classroomTagIds?.length && (!context.classroom || !scope.classroomTagIds.some(tagId => (context.classroom!.tagIds || []).includes(tagId)))) return false;
    if (scope.streamIds?.length && (!context.entry.streamId || !scope.streamIds.includes(context.entry.streamId))) return false;

    return true;
};

const evaluateRuleConditions = (rule: SchedulingRule, context: RuleEvaluationContext): boolean => {
    if (rule.conditions.length === 0) return false;
    let result = conditionMatchesContext(rule.conditions[0], context);
    for (let i = 1; i < rule.conditions.length; i++) {
        const operator = rule.logicalOperators?.[i - 1] || 'AND';
        const next = conditionMatchesContext(rule.conditions[i], context);
        result = operator === 'OR' ? result || next : result && next;
    }
    return result;
};

const ruleTimeMatches = (rule: SchedulingRule, context: RuleEvaluationContext) => {
    const dayMatches = !rule.day || rule.day === context.dayName;
    const timeMatches = !rule.timeSlotId || rule.timeSlotId === context.timeSlotId;
    return dayMatches && timeMatches;
};

const ruleTimeRangeMatches = (rule: SchedulingRule, context: RuleEvaluationContext) => {
    const dayMatches = !rule.day || rule.day === context.dayName;
    const candidateIndex = slotIndexOf(context.activeTimeSlots, context.timeSlotId);
    const startIndex = rule.startTimeSlotId ? slotIndexOf(context.activeTimeSlots, rule.startTimeSlotId) : 0;
    const endIndex = rule.endTimeSlotId ? slotIndexOf(context.activeTimeSlots, rule.endTimeSlotId) : context.activeTimeSlots.length - 1;
    if (candidateIndex < 0) return false;
    return dayMatches && candidateIndex >= Math.min(startIndex, endIndex) && candidateIndex <= Math.max(startIndex, endIndex);
};

const ruleTargetIds = (rule: SchedulingRule, entityType: RuleCondition['entityType']) => {
    const fromConditions = rule.conditions
        .filter(condition => condition.entityType === entityType)
        .flatMap(condition => condition.entityIds);
    return Array.from(new Set([...(rule.targetIds || []), ...fromConditions]));
};

const sameWeek = (left: string, right: string) => {
    const leftDate = new Date(left);
    const rightDate = new Date(right);
    return leftDate.getFullYear() === rightDate.getFullYear() && getWeekNumber(leftDate) === getWeekNumber(rightDate);
};

const slotIndexOf = (activeTimeSlots: TimeSlot[], timeSlotId?: string) =>
    activeTimeSlots.findIndex(slot => slot.id === timeSlotId);

const getMaxConsecutiveCount = (indices: number[]) => {
    const sorted = Array.from(new Set(indices.filter(index => index >= 0))).sort((a, b) => a - b);
    let max = 0;
    let current = 0;
    let previous = -2;
    sorted.forEach(index => {
        current = index === previous + 1 ? current + 1 : 1;
        previous = index;
        max = Math.max(max, current);
    });
    return max;
};

const getGapCount = (indices: number[]) => {
    const sorted = Array.from(new Set(indices.filter(index => index >= 0))).sort((a, b) => a - b);
    if (sorted.length <= 1) return 0;
    return Math.max(0, sorted[sorted.length - 1] - sorted[0] + 1 - sorted.length);
};

const entriesMatchingCondition = (condition: RuleCondition, context: RuleEvaluationContext) =>
    context.schedule.filter(entry => conditionMatchesContext(condition, context, entry));

const compareCandidateWithEntry = (context: RuleEvaluationContext, other: ScheduleEntry) => {
    const dateCompare = context.dateStr.localeCompare(other.date || '');
    if (dateCompare !== 0) return dateCompare;
    return slotIndexOf(context.activeTimeSlots, context.timeSlotId) - slotIndexOf(context.activeTimeSlots, other.timeSlotId);
};

const applySchedulingRules = (context: RuleEvaluationContext, rules: SchedulingRule[]) => {
    let cost = 0;

    for (const rule of rules) {
        if (rule.enabled === false || !ruleScopeMatchesContext(rule, context)) {
            continue;
        }

        const penalty = getRulePenalty(rule.severity, context.penaltyMultiplier);
        const isStrict = rule.severity === RuleSeverity.Strict;
        const conditionsApply = evaluateRuleConditions(rule, context);
        const currentConditionIndexes = rule.conditions
            .map((condition, index) => conditionMatchesContext(condition, context) ? index : -1)
            .filter(index => index >= 0);
        const isPairRule = [
            RuleAction.SameDay,
            RuleAction.DifferentDay,
            RuleAction.Consecutive,
            RuleAction.Order,
            RuleAction.NoOverlap,
        ].includes(rule.action);

        if (!conditionsApply && !(isPairRule && currentConditionIndexes.length > 0)) {
            continue;
        }

        const rejectOrPenalize = (amount = penalty) => {
            if (isStrict && amount > 0) return Infinity;
            cost += amount;
            return cost;
        };

        switch (rule.action) {
            case RuleAction.AvoidTime:
                if (ruleTimeMatches(rule, context) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.RequireTime:
                if (!ruleTimeMatches(rule, context) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.PreferTime:
                if (ruleTimeMatches(rule, context)) cost -= penalty;
                break;
            case RuleAction.AvoidDay:
                if ((!rule.day || rule.day === context.dayName) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.RequireDay:
                if (rule.day && rule.day !== context.dayName && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.PreferDay:
                if (!rule.day || rule.day === context.dayName) cost -= penalty;
                break;
            case RuleAction.AvoidTimeRange:
                if (ruleTimeRangeMatches(rule, context) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.RequireTimeRange:
                if (!ruleTimeRangeMatches(rule, context) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            case RuleAction.PreferTimeRange:
                if (ruleTimeRangeMatches(rule, context)) cost -= penalty;
                break;
            case RuleAction.StartAfter: {
                const candidateIndex = slotIndexOf(context.activeTimeSlots, context.timeSlotId);
                const requiredIndex = rule.timeSlotId ? slotIndexOf(context.activeTimeSlots, rule.timeSlotId) : (rule.param ?? 0);
                if (candidateIndex < requiredIndex && rejectOrPenalize() === Infinity) return Infinity;
                break;
            }
            case RuleAction.EndBefore: {
                const candidateIndex = slotIndexOf(context.activeTimeSlots, context.timeSlotId);
                const requiredIndex = rule.timeSlotId ? slotIndexOf(context.activeTimeSlots, rule.timeSlotId) : (rule.param ?? context.activeTimeSlots.length - 1);
                if (candidateIndex > requiredIndex && rejectOrPenalize() === Infinity) return Infinity;
                break;
            }
            case RuleAction.MaxPerDay: {
                if (rule.param === undefined) break;
                const count = context.schedule.filter(entry =>
                    entry.date === context.dateStr &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length + 1;
                if (count > rule.param && rejectOrPenalize((count - rule.param) * penalty) === Infinity) return Infinity;
                break;
            }
            case RuleAction.MinPerDay: {
                if (rule.param === undefined) break;
                const count = context.schedule.filter(entry =>
                    entry.date === context.dateStr &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length + 1;
                if (count < rule.param) {
                    if (isStrict && context.finalValidation) return Infinity;
                    cost += (rule.param - count) * penalty * 0.5;
                }
                break;
            }
            case RuleAction.MaxPerWeek: {
                if (rule.param === undefined) break;
                const count = context.schedule.filter(entry =>
                    entry.date &&
                    sameWeek(entry.date, context.dateStr) &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length + 1;
                if (count > rule.param && rejectOrPenalize((count - rule.param) * penalty) === Infinity) return Infinity;
                break;
            }
            case RuleAction.MinPerWeek: {
                if (rule.param === undefined) break;
                const count = context.schedule.filter(entry =>
                    entry.date &&
                    sameWeek(entry.date, context.dateStr) &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length + 1;
                if (count < rule.param) {
                    if (isStrict && context.finalValidation) return Infinity;
                    cost += (rule.param - count) * penalty * 0.25;
                }
                break;
            }
            case RuleAction.MaxConsecutive: {
                if (rule.param === undefined) break;
                const indices = context.schedule
                    .filter(entry => entry.date === context.dateStr && rule.conditions.some(condition => conditionMatchesContext(condition, context, entry)))
                    .map(entry => slotIndexOf(context.activeTimeSlots, entry.timeSlotId));
                indices.push(slotIndexOf(context.activeTimeSlots, context.timeSlotId));
                const maxConsecutive = getMaxConsecutiveCount(indices);
                if (maxConsecutive > rule.param && rejectOrPenalize((maxConsecutive - rule.param) * penalty) === Infinity) return Infinity;
                break;
            }
            case RuleAction.AtMostNGaps: {
                if (rule.param === undefined) break;
                const indices = context.schedule
                    .filter(entry => entry.date === context.dateStr && rule.conditions.some(condition => conditionMatchesContext(condition, context, entry)))
                    .map(entry => slotIndexOf(context.activeTimeSlots, entry.timeSlotId));
                indices.push(slotIndexOf(context.activeTimeSlots, context.timeSlotId));
                const gaps = getGapCount(indices);
                if (gaps > rule.param && rejectOrPenalize((gaps - rule.param) * penalty) === Infinity) return Infinity;
                break;
            }
            case RuleAction.SameDay: {
                const related = rule.conditions
                    .filter((_, index) => !currentConditionIndexes.includes(index))
                    .flatMap(condition => entriesMatchingCondition(condition, context));
                const effectiveRelated = related.length > 0 ? related : rule.conditions.flatMap(condition => entriesMatchingCondition(condition, context));
                if (effectiveRelated.length > 0 && effectiveRelated.every(entry => entry.date !== context.dateStr)) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.DifferentDay: {
                const related = rule.conditions
                    .filter((_, index) => !currentConditionIndexes.includes(index))
                    .flatMap(condition => entriesMatchingCondition(condition, context));
                if (related.some(entry => entry.date === context.dateStr) && rejectOrPenalize() === Infinity) return Infinity;
                break;
            }
            case RuleAction.Consecutive: {
                const candidateIndex = slotIndexOf(context.activeTimeSlots, context.timeSlotId);
                const related = rule.conditions
                    .filter((_, index) => !currentConditionIndexes.includes(index))
                    .flatMap(condition => entriesMatchingCondition(condition, context))
                    .filter(entry => entry.date === context.dateStr);
                if (related.length > 0 && !related.some(entry => Math.abs(slotIndexOf(context.activeTimeSlots, entry.timeSlotId) - candidateIndex) === 1)) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.Order: {
                if (rule.conditions.length < 2) break;
                const currentIsFirst = conditionMatchesContext(rule.conditions[0], context);
                const currentIsSecond = conditionMatchesContext(rule.conditions[1], context);
                if (currentIsFirst) {
                    const secondEntries = entriesMatchingCondition(rule.conditions[1], context);
                    if (secondEntries.some(entry => compareCandidateWithEntry(context, entry) >= 0) && rejectOrPenalize() === Infinity) return Infinity;
                }
                if (currentIsSecond) {
                    const firstEntries = entriesMatchingCondition(rule.conditions[0], context);
                    if (firstEntries.some(entry => compareCandidateWithEntry(context, entry) <= 0) && rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.NoOverlap: {
                const hasOverlap = rule.conditions
                    .filter((_, index) => !currentConditionIndexes.includes(index))
                    .flatMap(condition => entriesMatchingCondition(condition, context))
                    .some(entry => entry.date === context.dateStr && entry.timeSlotId === context.timeSlotId);
                if (hasOverlap && rejectOrPenalize() === Infinity) return Infinity;
                break;
            }
            case RuleAction.RequireClassroomType: {
                const requiredIds = ruleTargetIds(rule, 'classroomType');
                if (requiredIds.length && (!context.classroom || !requiredIds.includes(context.classroom.typeId))) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.PreferClassroomType: {
                const preferredIds = ruleTargetIds(rule, 'classroomType');
                if (preferredIds.length && context.classroom && preferredIds.includes(context.classroom.typeId)) cost -= penalty;
                else if (preferredIds.length) cost += penalty * 0.35;
                break;
            }
            case RuleAction.AvoidClassroomType: {
                const avoidedIds = ruleTargetIds(rule, 'classroomType');
                if (avoidedIds.length && context.classroom && avoidedIds.includes(context.classroom.typeId)) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.RequireClassroomTag: {
                const requiredIds = ruleTargetIds(rule, 'classroomTag');
                const classroomTagIds = context.classroom?.tagIds || [];
                if (requiredIds.length && !requiredIds.every(tagId => classroomTagIds.includes(tagId))) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.PreferClassroomTag: {
                const preferredIds = ruleTargetIds(rule, 'classroomTag');
                const classroomTagIds = context.classroom?.tagIds || [];
                const matched = preferredIds.filter(tagId => classroomTagIds.includes(tagId)).length;
                if (matched > 0) cost -= matched * penalty;
                else if (preferredIds.length) cost += penalty * 0.35;
                break;
            }
            case RuleAction.AvoidClassroomTag: {
                const avoidedIds = ruleTargetIds(rule, 'classroomTag');
                const classroomTagIds = context.classroom?.tagIds || [];
                if (avoidedIds.some(tagId => classroomTagIds.includes(tagId))) {
                    if (rejectOrPenalize() === Infinity) return Infinity;
                }
                break;
            }
            case RuleAction.AvoidSingleLessonDay: {
                const matchingEntriesToday = context.schedule.filter(entry =>
                    entry.date === context.dateStr &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length;
                if (matchingEntriesToday === 0) cost += penalty * 0.8;
                break;
            }
            case RuleAction.PreferCompactDay: {
                const indices = context.schedule
                    .filter(entry => entry.date === context.dateStr && rule.conditions.some(condition => conditionMatchesContext(condition, context, entry)))
                    .map(entry => slotIndexOf(context.activeTimeSlots, entry.timeSlotId));
                indices.push(slotIndexOf(context.activeTimeSlots, context.timeSlotId));
                const gaps = getGapCount(indices);
                if (gaps > 0) cost += gaps * penalty * 0.6;
                else if (indices.length > 1) cost -= penalty * 0.4;
                break;
            }
            case RuleAction.SpreadAcrossWeek: {
                const sameDayCount = context.schedule.filter(entry =>
                    entry.date === context.dateStr &&
                    rule.conditions.some(condition => conditionMatchesContext(condition, context, entry))
                ).length;
                if (sameDayCount > 0) cost += sameDayCount * penalty * 0.5;
                break;
            }
        }
    }

    return cost;
};

const getTeacherLoadPenalty = (
    teacherId: string,
    dateStr: string,
    allScheduleForScoring: ScheduleEntry[],
    penaltyMultiplier: number
) => {
    const totalLoad = allScheduleForScoring.filter(entry => entry.teacherId === teacherId).length;
    const dayLoad = allScheduleForScoring.filter(entry => entry.teacherId === teacherId && entry.date === dateStr).length;
    return (totalLoad * 3 + dayLoad * 18) * penaltyMultiplier;
};

const getTeacherLinkConstraintPenalty = (
    entry: UnscheduledEntry,
    involvedGroups: Group[],
    dateStr: string,
    classroom: Classroom,
    allScheduleForScoring: ScheduleEntry[],
    index: SchedulerIndex,
    penaltyMultiplier: number
) => {
    const links = (index.teacherLinksBySubjectType.get(makeSubjectTypeKey(entry.subjectId, entry.classType)) || [])
        .filter(link => link.teacherId === entry.teacherId && link.isActive !== false);
    if (!links.length) return 120 * penaltyMultiplier;
    const viable = links.filter(link => teacherLinkMatchesContext(link, involvedGroups, entry.streamId) &&
        (!link.allowedClassroomIds?.length || link.allowedClassroomIds.includes(classroom.id)) &&
        (!link.allowedClassroomTypeIds?.length || link.allowedClassroomTypeIds.includes(classroom.typeId)));
    if (!viable.length) return Infinity;

    return Math.min(...viable.map(link => {
        let cost = Math.max(0, 50 - (link.priority || 0) * 10) * penaltyMultiplier;
        if (link.role === 'reserve') cost += 80 * penaltyMultiplier;
        if (link.role === 'assistant') cost += 120 * penaltyMultiplier;
        if (link.role === 'examiner' && ![ClassType.Exam, ClassType.Test].includes(entry.classType)) cost += 160 * penaltyMultiplier;
        if (link.role === 'overloadOnly') cost += 220 * penaltyMultiplier;
        if (link.role === 'undesirable') cost += 450 * penaltyMultiplier;

        if (link.maxSemesterLessons !== undefined) {
            const semesterLoad = allScheduleForScoring.length + 1;
            if (semesterLoad > link.maxSemesterLessons) cost += (semesterLoad - link.maxSemesterLessons) * 180 * penaltyMultiplier;
        }
        if (link.maxWeeklyLessons !== undefined) {
            const weeklyLoad = allScheduleForScoring.filter(item => item.date && sameWeek(item.date, dateStr)).length + 1;
            if (weeklyLoad > link.maxWeeklyLessons) cost += (weeklyLoad - link.maxWeeklyLessons) * 220 * penaltyMultiplier;
        }
        return cost;
    }));
};

const getLectureSequencePenalty = (
    entry: UnscheduledEntry,
    dateStr: string,
    timeSlotId: string,
    activeTimeSlots: TimeSlot[],
    allScheduleForScoring: ScheduleEntry[],
    penaltyMultiplier: number,
    enforceLectureOrder: boolean
) => {
    const entryGroupIds = getEntryGroupIds(entry);
    if (entryGroupIds.length === 0) return 0;

    const candidateIndex = slotIndexOf(activeTimeSlots, timeSlotId);
    const sequenceMultiplier = enforceLectureOrder ? 2.5 : 1;
    const relatedEntries = allScheduleForScoring.filter(other => {
        if (!other.date || other.subjectId !== entry.subjectId) return false;
        const otherGroupIds = getEntryGroupIds(other);
        return otherGroupIds.some(groupId => entryGroupIds.includes(groupId));
    });

    const candidateOrderKey = `${dateStr}-${String(candidateIndex).padStart(3, '0')}`;
    const orderKeyOf = (other: ScheduleEntry) => {
        const slotsForDate = activeTimeSlots;
        const slotIndex = other.date === dateStr
            ? slotIndexOf(slotsForDate, other.timeSlotId)
            : 0;
        return `${other.date}-${String(slotIndex).padStart(3, '0')}`;
    };

    if (entry.classType === ClassType.Practical || entry.classType === ClassType.Lab) {
        const lectures = relatedEntries.filter(other => other.classType === ClassType.Lecture);
        if (lectures.length === 0) return 80 * penaltyMultiplier;

        const hasEarlierLecture = lectures.some(other => orderKeyOf(other) <= candidateOrderKey);
        if (!hasEarlierLecture) return 300 * sequenceMultiplier * penaltyMultiplier;

        const laterLectures = lectures.filter(other => orderKeyOf(other) > candidateOrderKey).length;
        return laterLectures * 45 * penaltyMultiplier;
    }

    if (entry.classType === ClassType.Lecture) {
        const practicesBefore = relatedEntries.filter(other =>
            (other.classType === ClassType.Practical || other.classType === ClassType.Lab) &&
            orderKeyOf(other) < candidateOrderKey
        ).length;
        return practicesBefore * 120 * sequenceMultiplier * penaltyMultiplier;
    }

    return 0;
};

const getWeekSimilarityPenalty = (
    entry: UnscheduledEntry,
    date: Date,
    timeSlotId: string,
    allScheduleForScoring: ScheduleEntry[],
    penaltyMultiplier: number
) => {
    const candidateWeekParity = getWeekNumber(date) % 2;
    const relatedEntries = allScheduleForScoring.filter(other => {
        if (!other.date || !entriesBelongToSameSeries(entry, other)) return false;
        const otherDate = new Date(other.date + 'T00:00:00');
        return getWeekNumber(otherDate) % 2 === candidateWeekParity;
    });

    if (relatedEntries.length === 0) return 0;

    const patternCounts = new Map<string, number>();
    relatedEntries.forEach(other => {
        const key = `${other.day}::${other.timeSlotId}`;
        patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    });

    const dominantPattern = Array.from(patternCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!dominantPattern) return 0;

    const [dominantDay, dominantTimeSlotId] = dominantPattern.split('::');
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    let penalty = 0;
    if (dayName !== dominantDay) penalty += 90;
    if (timeSlotId !== dominantTimeSlotId) penalty += 60;
    return penalty * penaltyMultiplier;
};

// Calculates the "cost" of placing a class in a specific slot.
const getScoringContext = (data: GenerationData, generated: ScheduleEntry[], index: SchedulerIndex) => {
    let context = index.scoringContext;
    const append = (entry: ScheduleEntry) => {
        context!.excludedAll = undefined;
        context!.all.push(entry);
        const put = (map: Map<string, ScheduleEntry[]>, key: string) => {
            const entries = map.get(key); if (entries) entries.push(entry); else map.set(key, [entry]);
        };
        put(context!.teacher, entry.teacherId);
        put(context!.teacherDay, `${entry.teacherId}-${entry.date}`);
        getEntryGroupIds(entry).forEach(id => put(context!.groupDay, `${id}-${entry.date}`));
        put(context!.subject, entry.subjectId);
        if (entry.date) put(context!.day, entry.date);
    };
    if (!context || context.retained !== data.schedule || context.generated !== generated || context.count > generated.length) {
        context = { retained: data.schedule, generated, count: 0, all: [], teacher: new Map(), teacherDay: new Map(), groupDay: new Map(), subject: new Map(), day: new Map() };
        index.scoringContext = context;
        data.schedule.forEach(append);
    }
    while (context.count < generated.length) append(generated[context.count++]);
    return context;
};

const getPlacementIssues = (
    entry: UnscheduledEntry, date: Date, timeSlotId: string, classroom: Classroom,
    involvedGroups: Group[], bookings: Map<string, Set<string>>, data: GenerationData,
    config: HeuristicConfig, activeTimeSlots: TimeSlot[], index: SchedulerIndex, nearby: ScheduleEntry[] = []
): string[] => {
    const issues: string[] = [];
    const dated = entry as unknown as ScheduleEntry;
    const dateStr = toYYYYMMDD(date);
    const day = DAYS_OF_WEEK[(date.getDay() + 6) % 7];
    const teacher = index.teachersById.get(entry.teacherId);
    const subject = index.subjectsById.get(entry.subjectId);
    const slot = activeTimeSlots.find(item => item.id === timeSlotId);
    if (!teacher || !subject) issues.push('Преподаватель или дисциплина не найдены.');
    if (!slot) issues.push('Слот не входит в действующие звонки этой даты.');
    if (dateStr < config.timeFrame.start || dateStr > config.timeFrame.end) issues.push('Дата вне выбранного периода.');
    if (data.settings.respectProductionCalendar && index.productionByDate.get(dateStr)?.isWorkDay === false) issues.push('Нерабочий день производственного календаря.');
    if (!involvedGroups.length || involvedGroups.length !== getEntryGroupIds(entry).length) issues.push('Не найдены все группы занятия.');
    const participants = [...new Set([entry.teacherId, ...(dated.additionalTeacherIds || [])])];
    for (const absence of data.resourceAbsences || []) if (dateStr >= absence.start && dateStr <= absence.end && (absence.kind === 'teacher' ? participants.includes(absence.resourceId) : classroom.id === absence.resourceId)) issues.push(`Ресурс недоступен: ${absence.reason}.`);
    for (const id of dated.studentIds || []) {
        const legacyWork = data.academicWorks?.find(work => !work.studentId && studentIdentity(work.studentName, work.groupId) === id);
        const student = index.studentsById.get(id) || (legacyWork ? { id, name: legacyWork.studentName, groupId: legacyWork.groupId, availabilityGrid: undefined } : undefined);
        if (!student || !involvedGroups.some(group => group.id === student.groupId)) issues.push('Обучающийся не найден или не относится к группе события.');
        if (student?.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden) issues.push(`Запрещённое время обучающегося: ${student.name}.`);
        if (bookings.get(`student-${id}`)?.has(`${dateStr}-${timeSlotId}`)) issues.push(`Обучающийся занят: ${student?.name || id}.`);
    }
    const attendingStudents = dated.studentIds?.length ? dated.studentIds.flatMap(id => index.studentsById.get(id) || []) : involvedGroups.flatMap(group => index.studentsByGroup.get(group.id) || []);
    if (!dated.studentIds?.length && attendingStudents.some(student => student.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden)) issues.push('Запрещённое время обучающегося группы.');
    issues.push(...campusPlacementIssues({ ...dated, date: dateStr, day, timeSlotId, classroomId: classroom.id }, classroom, slot, nearby, data, [...activeTimeSlots, ...data.timeSlots, ...data.timeSlotsShortened, ...(data.bellScheduleProfiles || []).flatMap(profile => profile.slots)], attendingStudents, index.classroomsById));
    for (const id of participants) {
        const person = index.teachersById.get(id);
        if (!person) issues.push('Участник комиссии не найден.');
        if (person?.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden) issues.push(`Запрещённое время: ${person.name}.`);
        if (bookings.get(`teacher-${id}`)?.has(`${dateStr}-${timeSlotId}`)) issues.push(`Преподаватель занят: ${person?.name || id}.`);
    }
    if (involvedGroups.some(group => group.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden)) issues.push('Запрещённое время группы.');
    if (!areGroupsCompatibleWithTimeSlot(slot, involvedGroups)) issues.push('Смена группы не совпадает со слотом.');
    if (classroom.status === 'closed' || classroom.status === 'repair') issues.push('Аудитория закрыта или ремонтируется.');
    if (classroom.capacity < entry.studentCount) issues.push('Недостаточная вместимость аудитории.');
    if (classroom.availabilityGrid?.[day]?.[timeSlotId] === AvailabilityType.Forbidden) issues.push('Запрещённое время аудитории.');
    if (classroom.allowedClassTypes?.length && !classroom.allowedClassTypes.includes(entry.classType)) issues.push('Аудитория не допускает этот тип занятия.');
    const required = entry.classroomTypeIds?.length ? entry.classroomTypeIds : getRequiredClassroomTypes(subject, entry.classType);
    if (!required?.includes(classroom.typeId)) issues.push('Не подходит тип аудитории или требования не заданы.');
    if ((entry.requiredClassroomTagIds || subject?.requiredClassroomTagIds || []).some(tag => !classroom.tagIds?.includes(tag))) issues.push('Не хватает оборудования аудитории.');
    if (bookings.get(`classroom-${classroom.id}`)?.has(`${dateStr}-${timeSlotId}`)) issues.push('Аудитория занята.');
    if (involvedGroups.some(group => bookings.get(`group-${group.id}`)?.has(`${dateStr}-${timeSlotId}`))) issues.push('Группа или участники потока заняты.');
    if (!isIndividualEntry(dated) && involvedGroups.some(group => bookings.get(`individual-group-${group.id}`)?.has(`${dateStr}-${timeSlotId}`))) issues.push('Обучающийся группы занят на индивидуальном событии.');
    const currentInterval = slotInterval(slot);
    for (const other of nearby) {
        if (other.timeSlotId === timeSlotId) continue;
        const otherTeachers = [other.teacherId, ...(other.additionalTeacherIds || [])];
        const sharesResource = other.classroomId === classroom.id || participants.some(id => otherTeachers.includes(id)) || groupsShareParticipants({ ...dated, classroomId: classroom.id }, other);
        if (!sharesResource) continue;
        const otherSlot = activeTimeSlots.find(item => item.id === other.timeSlotId) || [...data.timeSlots, ...data.timeSlotsShortened, ...(data.bellScheduleProfiles || []).flatMap(profile => profile.slots)].find(item => item.id === other.timeSlotId);
        const range = slotInterval(otherSlot);
        if (!range || !currentInterval || range.start >= currentInterval.end || currentInterval.start >= range.end) continue;
        issues.push('Пересечение ресурсов по времени разных слотов звонков.'); break;
    }
    const individualWork = dated.academicWorkId && data.academicWorks?.find(work => work.id === dated.academicWorkId && work.subjectId === entry.subjectId && work.groupId === involvedGroups[0]?.id && work.supervisorId === entry.teacherId);
    if (dated.academicWorkId && !individualWork) issues.push('Индивидуальное событие не соответствует работе, группе или руководителю.');
    if (individualWork && dated.studentIds?.length && (dated.studentIds.length !== 1 || dated.studentIds[0] !== (individualWork.studentId || studentIdentity(individualWork.studentName, individualWork.groupId)))) issues.push('Участник события не совпадает с обучающимся научной работы.');
    const elective = index.electivesById.get(electiveIdOf(entry.uid) || '');
    if (entry.uid.startsWith('unsched-elective-') && !elective) issues.push('Учебное объединение занятия не найдено.');
    if (elective) {
        if (elective.teacherId !== entry.teacherId) issues.push('Преподаватель не совпадает с назначением учебного объединения.');
        if (elective.subjectId !== entry.subjectId || (elective.classType || ClassType.Elective) !== entry.classType || (elective.deliveryMode || DeliveryMode.Offline) !== (entry.deliveryMode || DeliveryMode.Offline)) issues.push('Дисциплина, тип или формат занятия не совпадает с учебным объединением.');
        if (elective.classroomTypeIds?.length && !elective.classroomTypeIds.includes(classroom.typeId) || elective.requiredClassroomTagIds?.some(id => !classroom.tagIds?.includes(id))) issues.push('Не выполнены требования аудитории учебного объединения.');
        const selected = electiveParticipants(elective, data.students || [], data.groups);
        issues.push(...selected.issues);
        if (JSON.stringify([...(dated.studentIds || [])].sort()) !== JSON.stringify([...selected.studentIds].sort()) || !sameGroupSet(getEntryGroupIds(entry), selected.groupIds)) issues.push('Состав занятия не совпадает с записью в учебное объединение.');
    }
    const links = index.teacherLinksBySubjectType.get(makeSubjectTypeKey(entry.subjectId, entry.classType)) || [];
    if (!individualWork && !elective && !links.some(link => link.teacherId === entry.teacherId && teacherLinkMatchesContext(link, involvedGroups, entry.streamId))) issues.push('Нет допустимой привязки преподавателя к дисциплине и типу занятия.');
    return issues;
};

export interface PlacementValidation { valid: boolean; issues: string[]; softPenalty: number }

export const validateResourceNeighborhood = (data: GenerationData, before: ScheduleEntry[], after: ScheduleEntry[], config: HeuristicConfig, index = createSchedulerIndex(data)): string[] => {
    const previousById = mapById(before);
    if (after.length !== before.length || new Set(after.map(entry => entry.id)).size !== before.length || after.some(entry => !previousById.has(entry.id))) return ['Локальное изменение не должно удалять или дублировать занятия.'];
    const changes = after.filter(entry => previousById.get(entry.id) !== entry);
    if (changes.some(entry => previousById.get(entry.id)?.locked)) return ['Закреплённое занятие нельзя переносить.'];
    if (!changes.length) return [];
    const changedIds = new Set(changes.map(entry => entry.id));
    const anchors = changes.flatMap(entry => [entry, previousById.get(entry.id)].filter((item): item is ScheduleEntry => !!item));
    const dates = new Set(anchors.map(entry => entry.date));
    const retained = data.schedule.some(entry => !entry.date) ? expandScheduleOccurrences(data, data.schedule, config.timeFrame) : data.schedule;
    const oldSchedule = [...retained, ...before].filter(entry => dates.has(entry.date));
    const nextSchedule = [...retained, ...after].filter(entry => dates.has(entry.date));
    const oldById = mapById(oldSchedule);
    const oldBookings = createResourceBookings(data.teachers, data.groups, data.classrooms, oldSchedule);
    const nextBookings = createResourceBookings(data.teachers, data.groups, data.classrooms, nextSchedule);
    const issuesFor = (entry: ScheduleEntry, schedule: ScheduleEntry[], bookings: Map<string, Set<string>>) => {
        const room = index.classroomsById.get(entry.classroomId);
        if (!room || !entry.date) return ['Не найдена аудитория или дата занятия.'];
        const groups = getInvolvedGroups(entry, index);
        const subgroup = entry.subgroupId && index.subgroupsById.get(entry.subgroupId);
        const studentCount = isIndividualEntry(entry) ? Math.max(1, studentIdsOf(entry).length) + (entry.academicWorkId ? new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])]).size : 0) : subgroup ? subgroup.studentCount : groups.reduce((sum, group) => sum + group.studentCount, 0);
        const key = `${entry.date}-${entry.timeSlotId}`;
        bookedResourceKeys(entry).forEach(resource => removeBooking(bookings, resource, key));
        const issues = getPlacementIssues({ ...entry, uid: entry.unscheduledUid || entry.id, studentCount }, new Date(entry.date + 'T00:00:00'), entry.timeSlotId, room, groups, bookings, data, config, getActiveTimeSlotsForDate(data, entry.date, index), index, schedule.filter(other => other.date === entry.date && other.id !== entry.id));
        bookedResourceKeys(entry).forEach(resource => addBooking(bookings, resource, key));
        return issues;
    };
    // Removing an intermediate lesson can break a neighbour's route even if its new placement is valid.
    for (const entry of nextSchedule) {
        if (!changedIds.has(entry.id) && !anchors.some(anchor => anchor.date === entry.date && sharesResource(anchor, entry))) continue;
        const nextIssues = issuesFor(entry, nextSchedule, nextBookings);
        if (!nextIssues.length) continue;
        if (changedIds.has(entry.id)) return nextIssues;
        const previous = oldById.get(entry.id);
        const baseline = previous ? issuesFor(previous, oldSchedule, oldBookings) : [];
        if (nextIssues.length > baseline.length || nextIssues.some(issue => !baseline.includes(issue))) return nextIssues;
    }
    return [];
};

export const createScheduleValidator = (data: GenerationData, config?: HeuristicConfig, options: { finalValidation?: boolean } = {}) => {
    const index = createSchedulerIndex(data);
    const configuration: HeuristicConfig = config || { strictness: 5, iterations: 1, clearExisting: false, enforceLectureOrder: true, distributeEvenly: true, timeFrame: { start: data.settings.semesterStart, end: data.settings.semesterEnd } };
    return (entry: ScheduleEntry, schedule = data.schedule): PlacementValidation => {
        const resolveGroups = (original: ScheduleEntry) => { const item = resolveParticipantEntry(original, data.academicWorks); return !item.groupId && !item.groupIds?.length && item.streamId ? { ...item, groupIds: data.streams.find(stream => stream.id === item.streamId)?.groupIds || [] } : item; };
        entry = resolveGroups(entry);
        if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return { valid: false, issues: ['Для проверки требуется календарная дата.'], softPenalty: 0 };
        const date = new Date(entry.date + 'T00:00:00');
        if (!Number.isFinite(date.getTime()) || toYYYYMMDD(date) !== entry.date) return { valid: false, issues: ['Некорректная дата.'], softPenalty: 0 };
        const day = DAYS_OF_WEEK[(date.getDay() + 6) % 7];
        const parity = data.settings.useEvenOddWeekSeparation ? getWeekType(date, new Date(data.settings.semesterStart + 'T00:00:00')) : 'every';
        const other = schedule.filter(item => item.id !== entry.id).map(resolveGroups).flatMap(item => item.date ? [item] : item.day === day && (item.weekType === 'every' || item.weekType === parity) ? [{ ...item, date: entry.date }] : []);
        const groups = getInvolvedGroups(entry, index);
        const subgroup = entry.subgroupId && index.subgroupsById.get(entry.subgroupId);
        const demand = { ...entry, uid: entry.unscheduledUid || entry.id, studentCount: isIndividualEntry(entry) ? Math.max(1, studentIdsOf(entry).length) + (entry.academicWorkId ? new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])]).size : 0) : subgroup ? subgroup.studentCount : groups.reduce((sum, group) => sum + group.studentCount, 0) } as unknown as UnscheduledEntry;
        const classroom = index.classroomsById.get(entry.classroomId);
        if (!classroom) return { valid: false, issues: ['Аудитория не найдена.'], softPenalty: 0 };
        const slots = getActiveTimeSlotsForDate(data, date, index);
        const bookings = createResourceBookings(data.teachers, data.groups, data.classrooms, other);
        const issues = getPlacementIssues(demand, date, entry.timeSlotId, classroom, groups, bookings, data, configuration, slots, index, other.filter(item => item.date === entry.date));
        if (entry.day !== day) issues.push('День недели не совпадает с датой.');
        const context: RuleEvaluationContext = { entry: demand, classroom, involvedGroups: groups, teacher: index.teachersById.get(entry.teacherId), dateStr: entry.date, dayName: day, timeSlotId: entry.timeSlotId, activeTimeSlots: slots, schedule: other, index, penaltyMultiplier: configuration.strictness / 5, finalValidation: options.finalValidation !== false };
        for (const rule of data.schedulingRules) if (applySchedulingRules(context, [rule]) === Infinity) issues.push(`Нарушено правило: ${rule.description || rule.id}.`);
        const penalty = issues.length ? 0 : calculateSlotCost(demand, date, entry.timeSlotId, classroom, groups, bookings, { ...data, schedule: other }, configuration.strictness / 5, [], configuration, slots, index);
        if (!issues.length && !Number.isFinite(penalty)) issues.push('Нарушены ограничения привязки преподавателя к группе или аудитории.');
        return { valid: !issues.length && Number.isFinite(penalty), issues, softPenalty: Number.isFinite(penalty) ? penalty : 0 };
    };
};

const calculateSlotCost = (
    entry: UnscheduledEntry,
    date: Date,
    timeSlotId: string,
    classroom: Classroom,
    involvedGroups: Group[],
    bookings: Map<string, Set<string>>,
    data: GenerationData,
    penaltyMultiplier: number,
    newSchedule: ScheduleEntry[],
    config: HeuristicConfig,
    activeTimeSlots: TimeSlot[],
    index = createSchedulerIndex(data),
    excludedId?: string,
    finalValidation = false
): number => {
    let cost = 0;
    const { settings, schedulingRules } = data;
    const { enforceLectureOrder, distributeEvenly } = config;
    const teacher = index.teachersById.get(entry.teacherId);
    const subject = index.subjectsById.get(entry.subjectId);
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const dateStr = toYYYYMMDD(date);
    const scoring = getScoringContext(data, newSchedule, index);
    const omitCurrent = (entries: ScheduleEntry[] = []) => excludedId ? entries.filter(item => item.id !== excludedId) : entries;
    if (schedulingRules.length && excludedId && (scoring.excludedId !== excludedId || !scoring.excludedAll)) {
        scoring.excludedId = excludedId;
        scoring.excludedAll = omitCurrent(scoring.all);
    }
    const allScheduleForScoring = excludedId && schedulingRules.length ? scoring.excludedAll! : scoring.all;
    const candidateTimeSlot = activeTimeSlots.find(slot => slot.id === timeSlotId);
    if (getPlacementIssues(entry, date, timeSlotId, classroom, involvedGroups, bookings, data, config, activeTimeSlots, index, omitCurrent(scoring.day.get(dateStr))).length) return Infinity;

    const allBookingsTodayForGroups = omitCurrent(Array.from(new Set(involvedGroups.flatMap(group => scoring.groupDay.get(`${group.id}-${dateStr}`) || []))));

    // Availability Grids
    const teacherAvailability = teacher?.availabilityGrid?.[dayName]?.[timeSlotId];
    if (teacherAvailability === AvailabilityType.Undesirable) cost += 20 * penaltyMultiplier;
    if (teacherAvailability === AvailabilityType.Desirable) cost -= 10 * penaltyMultiplier;
    involvedGroups.forEach(g => {
        const groupAvailability = g.availabilityGrid?.[dayName]?.[timeSlotId];
        if (groupAvailability === AvailabilityType.Forbidden) cost = Infinity;
        if (groupAvailability === AvailabilityType.Undesirable) cost += 20 * penaltyMultiplier;
        if (groupAvailability === AvailabilityType.Desirable) cost -= 10 * penaltyMultiplier;
    });
    if (cost === Infinity) return Infinity;

    // Pinned Classrooms
    const teacherPin = teacher?.pinnedClassroomId;
    const subjectPin = subject?.pinnedClassroomId;
    const groupPins = involvedGroups.map(g => g.pinnedClassroomId).filter(Boolean);
    const entryPin = entry.pinnedClassroomId;
    const isPinnedMatch = teacherPin === classroom.id || subjectPin === classroom.id || entryPin === classroom.id || groupPins.includes(classroom.id);
    const hasAnyPin = teacherPin || subjectPin || entryPin || groupPins.length > 0;
    if (hasAnyPin) {
        cost += isPinnedMatch ? -100 * penaltyMultiplier : 50 * penaltyMultiplier;
    }

    if (entry.preferredTimeSlotIds?.length) {
        cost += entry.preferredTimeSlotIds.includes(timeSlotId) ? -60 * penaltyMultiplier : 30 * penaltyMultiplier;
    }

    // Window Penalty
    if (!settings.allowWindows || (settings.enforceStandardRules && involvedGroups.some(g => g.course === 1))) {
        const timeSlotIndex = activeTimeSlots.findIndex(ts => ts.id === timeSlotId);
        const checkWindowsForResource = (resourceKey: string, isFirstYear: boolean) => {
            let windowPenalty = 200 * penaltyMultiplier;
            if (isFirstYear && settings.enforceStandardRules) {
                windowPenalty = 1000 * penaltyMultiplier; // Very high penalty for first years
            }
            const occupied = activeTimeSlots.flatMap((slot, index) => bookings.get(resourceKey)?.has(`${dateStr}-${slot.id}`) ? [index] : []);
            cost += getGapCount([...occupied, timeSlotIndex]) * windowPenalty;
        };
        checkWindowsForResource(`teacher-${entry.teacherId}`, false);
        involvedGroups.forEach(g => checkWindowsForResource(`group-${g.id}`, g.course === 1));
    }

    // Day Load Penalty
    const teacherBookingsToday = omitCurrent(scoring.teacherDay.get(`${entry.teacherId}-${dateStr}`));
    const teacherClassesOnDay = teacherBookingsToday.length;
    const teacherBookings = omitCurrent(scoring.teacher.get(entry.teacherId));
    cost += (teacherBookings.length * 3 + teacherClassesOnDay * 18) * penaltyMultiplier;

    if (settings.enforceStandardRules && teacherClassesOnDay >= 4) {
        cost += (teacherClassesOnDay - 3) * 150 * penaltyMultiplier;
    }

    // FIX: Define groupClassesOnDay to calculate class load per group.
    const groupClassesOnDay = involvedGroups.map(group => {
        return omitCurrent(scoring.groupDay.get(`${group.id}-${dateStr}`)).length;
    });

    groupClassesOnDay.forEach(count => {
        if (settings.enforceStandardRules && count >= 5) {
            cost += (count - 4) * 200 * penaltyMultiplier;
        } else if (count >= 4) {
            cost += (count - 3) * 100 * penaltyMultiplier;
        }
    });

    const singletonGroupDays = groupClassesOnDay.filter(count => count === 0).length;
    if (singletonGroupDays > 0) {
        cost += singletonGroupDays * 360 * penaltyMultiplier;
    }
    if (teacherClassesOnDay === 0) {
        cost += 80 * penaltyMultiplier;
    }

    const teacherLinkPenalty = getTeacherLinkConstraintPenalty(entry, involvedGroups, dateStr, classroom, teacherBookings, index, penaltyMultiplier);
    if (teacherLinkPenalty === Infinity) return Infinity;
    cost += teacherLinkPenalty;

    if (settings.enforceStandardRules) {
        // Penalty for same subject on same day for a group
        if (allBookingsTodayForGroups.some(b => b.subjectId === entry.subjectId)) {
            cost += 75 * penaltyMultiplier;
        }
    }


    const ruleCost = applySchedulingRules({
        finalValidation,
        entry,
        classroom,
        involvedGroups,
        teacher,
        dateStr,
        dayName,
        timeSlotId,
        activeTimeSlots,
        schedule: allScheduleForScoring,
        index,
        penaltyMultiplier,
    }, schedulingRules);
    if (ruleCost === Infinity) return Infinity;
    cost += ruleCost;

    // --- NEW: Apply Standard Rules if enabled ---
    if (settings.enforceStandardRules) {
        // Rule: No lectures after labs/practicals (of other subjects)
        if (entry.classType === ClassType.Lecture) {
            const timeSlotIndex = activeTimeSlots.findIndex(ts => ts.id === timeSlotId);
            const previousSlots = activeTimeSlots.slice(0, timeSlotIndex);
            const hasPracticeBefore = previousSlots.some(slot =>
                allBookingsTodayForGroups.some(b =>
                    b.timeSlotId === slot.id &&
                    (b.classType === ClassType.Practical || b.classType === ClassType.Lab) &&
                    b.subjectId !== entry.subjectId
                )
            );
            if (hasPracticeBefore) {
                cost += 350 * penaltyMultiplier;
            }
        }

        // Rule: Max 3-4 consecutive classes for teacher
        const teacherBookingIndices = teacherBookingsToday
            .map(e => activeTimeSlots.findIndex(ts => ts.id === e.timeSlotId));
        teacherBookingIndices.push(activeTimeSlots.findIndex(ts => ts.id === timeSlotId));
        teacherBookingIndices.sort((a, b) => a - b);

        let maxConsecutive = 0;
        if (teacherBookingIndices.length > 0) {
            let currentConsecutive = 1;
            maxConsecutive = 1;
            for (let i = 1; i < teacherBookingIndices.length; i++) {
                if (teacherBookingIndices[i] === teacherBookingIndices[i - 1] + 1) {
                    currentConsecutive++;
                } else {
                    currentConsecutive = 1;
                }
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            }
        }
        if (maxConsecutive > 3) { // Penalize 4 or more
            cost += (maxConsecutive - 3) * 150 * penaltyMultiplier;
        }

        // Rule: First pair on Monday is for optimists
        if (dayName === 'Понедельник' && activeTimeSlots.findIndex(ts => ts.id === timeSlotId) === 0) {
            cost += 50 * penaltyMultiplier;
        }

        // Rule: Avoid Saturday
        if (dayName === 'Суббота') {
            cost += 60 * penaltyMultiplier;
        }
    }


    // Distribution Penalty
    if (distributeEvenly && entry.targetWeek) {
        const currentWeek = getWeekNumber(date);
        const weekDifference = Math.abs(currentWeek - entry.targetWeek);
        if (weekDifference > 0) {
            cost += weekDifference * 150 * penaltyMultiplier;
        }
    }

    const subjectSchedule = omitCurrent(scoring.subject.get(entry.subjectId));
    cost += getWeekSimilarityPenalty(entry, date, timeSlotId, subjectSchedule, penaltyMultiplier);
    cost += getLectureSequencePenalty(entry, dateStr, timeSlotId, activeTimeSlots, subjectSchedule, penaltyMultiplier, enforceLectureOrder);

    // Lecture-Practice Order Penalty
    if (enforceLectureOrder) {
        const timeSlotIndex = activeTimeSlots.findIndex(ts => ts.id === timeSlotId);

        if (entry.classType === ClassType.Practical || entry.classType === ClassType.Lab) {
            const lecturesToday = allBookingsTodayForGroups.filter(e => e.subjectId === entry.subjectId && e.classType === ClassType.Lecture);
            if (lecturesToday.length > 0) {
                const earliestLectureIndex = Math.min(...lecturesToday.map(e => activeTimeSlots.findIndex(ts => ts.id === e.timeSlotId)));
                if (timeSlotIndex < earliestLectureIndex) {
                    cost += 300 * penaltyMultiplier;
                }
            }
        } else if (entry.classType === ClassType.Lecture) {
            const practicesToday = allBookingsTodayForGroups.filter(e => e.subjectId === entry.subjectId && (e.classType === ClassType.Practical || e.classType === ClassType.Lab));
            if (practicesToday.length > 0) {
                const latestPracticeIndex = Math.max(...practicesToday.map(e => activeTimeSlots.findIndex(ts => ts.id === e.timeSlotId)));
                if (timeSlotIndex > latestPracticeIndex) {
                    cost += 300 * penaltyMultiplier;
                }
            }
        }
    }

    // Prefer weekdays over Saturday
    if (date.getDay() === 6) { // Saturday
        cost += 25 * penaltyMultiplier;
    }

    return cost;
};

const evaluatePlacementCandidates = async (
    entry: UnscheduledEntry, schedule: ScheduleEntry[], candidates: PlacementCandidate[],
    data: GenerationData, config: HeuristicConfig, index: SchedulerIndex,
    bookings: Map<string, Set<string>>, options: SchedulerRunOptions, excludedId?: string
): Promise<number[]> => {
    if (options.candidateEvaluator && candidates.length >= 256) {
        const costs = await options.candidateEvaluator.evaluate(entry, schedule, candidates, excludedId);
        if (costs) return costs;
    }
    const groups = getInvolvedGroups(entry, index);
    const dates = new Map<string, { date: Date; slots: TimeSlot[] }>();
    return candidates.map(candidate => {
        let context = dates.get(candidate.dateStr);
        if (!context) {
            context = { date: new Date(candidate.dateStr + 'T00:00:00'), slots: getActiveTimeSlotsForDate(data, candidate.dateStr, index) };
            dates.set(candidate.dateStr, context);
        }
        return calculateSlotCost({ ...entry, teacherId: candidate.teacherId }, context.date, candidate.timeSlotId,
            index.classroomsById.get(candidate.classroomId)!, groups, bookings, data, config.strictness / 5,
            schedule, config, context.slots, index, excludedId);
    });
};

export const createCandidateScorer = (data: GenerationData, config: HeuristicConfig) => {
    const index = createSchedulerIndex(data);
    let previous: ScheduleEntry[] | undefined;
    let previousExcluded: string | undefined;
    let bookings: Map<string, Set<string>>;
    const dates = new Map<string, { date: Date; slots: TimeSlot[] }>();
    return (entry: UnscheduledEntry, schedule: ScheduleEntry[], candidates: PlacementCandidate[], excludedId?: string) => {
        if (schedule !== previous || excludedId !== previousExcluded) {
            bookings = createResourceBookings(data.teachers, data.groups, data.classrooms, [...data.schedule, ...schedule]);
            const current = excludedId && schedule.find(item => item.id === excludedId);
            if (current) bookedResourceKeys(current).forEach(key => removeBooking(bookings, key, `${current.date}-${current.timeSlotId}`));
            previous = schedule; previousExcluded = excludedId;
        }
        const groups = getInvolvedGroups(entry, index);
        return candidates.map(candidate => {
            let context = dates.get(candidate.dateStr);
            if (!context) {
                context = { date: new Date(candidate.dateStr + 'T00:00:00'), slots: getActiveTimeSlotsForDate(data, candidate.dateStr, index) };
                dates.set(candidate.dateStr, context);
            }
            return calculateSlotCost({ ...entry, teacherId: candidate.teacherId }, context.date, candidate.timeSlotId,
                index.classroomsById.get(candidate.classroomId)!, groups, bookings, data, config.strictness / 5,
                schedule, config, context.slots, index, excludedId);
        });
    };
};

export const calculateScheduleScore = (
    data: GenerationData,
    result: Pick<SchedulerResult, 'schedule' | 'unschedulable'>,
    config: HeuristicConfig,
    index = createSchedulerIndex(data)
): ScheduleScore => {
    const generatedSchedule = result.schedule.filter(entry => entry.date);
    const retainedExistingSchedule = expandScheduleOccurrences(data, getRetainedExistingSchedule(data.schedule, config), config.timeFrame);
    const bookings = createResourceBookings(data.teachers, data.groups, data.classrooms, [...retainedExistingSchedule, ...generatedSchedule]);
    const scoringData = { ...data, schedule: retainedExistingSchedule };
    let softPenalty = 0;
    let hardViolations = result.schedule.length - generatedSchedule.length;

    generatedSchedule.forEach(entry => {
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;

        const involvedGroups = getInvolvedGroups(entry, index);
        const subGroup = entry.subgroupId ? index.subgroupsById.get(entry.subgroupId) : undefined;
        const studentCount = isIndividualEntry(entry) ? Math.max(1, studentIdsOf(entry).length) + (entry.academicWorkId ? new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])]).size : 0) : subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, group) => sum + group.studentCount, 0);
        const classroom = index.classroomsById.get(entry.classroomId);
        if (!classroom || !entry.date) {
            hardViolations++;
            return;
        }

        const activeTimeSlots = getActiveTimeSlotsForDate(data, entry.date, index);
        bookedResourceKeys(entry).forEach(key => removeBooking(bookings, key, bookingKey));

        const cost = calculateSlotCost(
            { ...entry, uid: entry.unscheduledUid || entry.id, studentCount } as unknown as UnscheduledEntry,
            new Date(entry.date + 'T00:00:00'),
            entry.timeSlotId,
            classroom,
            involvedGroups,
            bookings,
            scoringData,
            config.strictness / 5.0,
            generatedSchedule,
            config,
            activeTimeSlots,
            index,
            entry.id,
            true
        );
        if (cost === Infinity) hardViolations++;
        else softPenalty += cost;

        bookedResourceKeys(entry).forEach(key => addBooking(bookings, key, bookingKey));
    });

    const unscheduled = result.unschedulable.length;
    return {
        total: unscheduled * 1_000_000 + hardViolations * 750_000 + softPenalty,
        unscheduled,
        hardViolations,
        softPenalty,
        placed: generatedSchedule.length,
    };
};

export const optimizeScheduleLocally = async (
    data: GenerationData,
    config: HeuristicConfig
): Promise<LocalOptimizerResult> => {
    const index = createSchedulerIndex(data);
    const candidates = data.schedule.filter(entry => isEntryInOptimizationScope(entry, config));
    const retainedSchedule = expandScheduleOccurrences(data, data.schedule.filter(entry => !isEntryInOptimizationScope(entry, config)), config.timeFrame);
    const scopedData = { ...data, schedule: retainedSchedule };

    const beforeScore = calculateScheduleScore(
        scopedData,
        { schedule: candidates, unschedulable: [] },
        { ...config, clearExisting: false },
        index
    );

    if (candidates.length === 0) {
        return {
            schedule: data.schedule,
            beforeScore,
            afterScore: beforeScore,
            improved: 0,
            considered: 0,
        };
    }

    const optimizedCandidates = await refineSchedule(
        candidates,
        scopedData,
        { ...config, clearExisting: false },
        index
    );

    const afterScore = calculateScheduleScore(
        scopedData,
        { schedule: optimizedCandidates, unschedulable: [] },
        { ...config, clearExisting: false },
        index
    );

    const improved = optimizedCandidates.filter(entry => {
        const previous = candidates.find(item => item.id === entry.id);
        return previous && (
            previous.date !== entry.date ||
            previous.timeSlotId !== entry.timeSlotId ||
            previous.classroomId !== entry.classroomId ||
            previous.teacherId !== entry.teacherId
        );
    }).length;

    if (afterScore.hardViolations > beforeScore.hardViolations || afterScore.total > beforeScore.total) {
        return { schedule: data.schedule, beforeScore, afterScore: beforeScore, improved: 0, considered: candidates.length };
    }

    const optimizedById = new Map(optimizedCandidates.map(entry => [entry.id, entry]));
    const schedule = data.schedule.map(entry => optimizedById.get(entry.id) || entry);

    return {
        schedule,
        beforeScore,
        afterScore,
        improved,
        considered: candidates.length,
    };
};

const scoreScheduleTotal = (
    schedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex
) => calculateScheduleScore(data, { schedule, unschedulable: [] }, { ...config, clearExisting: false }, index).total;

const scoreScheduleApproximately = (schedule: ScheduleEntry[], config: HeuristicConfig) => {
    const resourceSlots = new Map<string, number>();
    const teacherDay = new Map<string, number>();
    const groupDay = new Map<string, number>();
    const groupSubjectOrder = new Map<string, ScheduleEntry[]>();
    let hardViolations = 0;
    let softPenalty = 0;
    const penaltyMultiplier = (config.strictness || 5) / 5;

    schedule.forEach(entry => {
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        const resources = bookedResourceKeys(entry);
        resources.forEach(resource => {
            const key = `${resource}-${bookingKey}`;
            const previous = resourceSlots.get(key) || 0;
            if (resource.startsWith('individual-group-')) {
                if ((resourceSlots.get(`group-${resource.slice('individual-group-'.length)}-${bookingKey}`) || 0) > 0) hardViolations++;
            } else {
                if (previous > 0) hardViolations++;
                if (resource.startsWith('group-') && (resourceSlots.get(`individual-group-${resource.slice('group-'.length)}-${bookingKey}`) || 0) > 0) hardViolations++;
            }
            resourceSlots.set(key, previous + 1);
        });

        addToCounter(teacherDay, `${entry.teacherId}-${entry.date}`, 1);
        getEntryGroupIds(entry).forEach(groupId => {
            addToCounter(groupDay, `${groupId}-${entry.date}`, 1);
            const seriesKey = `${groupId}-${entry.subjectId}`;
            const current = groupSubjectOrder.get(seriesKey) || [];
            current.push(entry);
            groupSubjectOrder.set(seriesKey, current);
        });
    });

    teacherDay.forEach(load => {
        if (load === 1) softPenalty += 80 * penaltyMultiplier;
        if (load > 4) softPenalty += (load - 4) * 180 * penaltyMultiplier;
    });
    groupDay.forEach(load => {
        if (load === 1) softPenalty += 360 * penaltyMultiplier;
        if (load > 5) softPenalty += (load - 5) * 220 * penaltyMultiplier;
    });
    groupSubjectOrder.forEach(entries => {
        const ordered = [...entries].sort((a, b) =>
            `${a.date}-${a.timeSlotId}`.localeCompare(`${b.date}-${b.timeSlotId}`)
        );
        let lectureSeen = false;
        ordered.forEach(entry => {
            if (entry.classType === ClassType.Lecture) lectureSeen = true;
            if ((entry.classType === ClassType.Practical || entry.classType === ClassType.Lab) && !lectureSeen) {
                softPenalty += 220 * penaltyMultiplier;
            }
        });
    });

    return hardViolations * 750_000 + softPenalty;
};

const toUnscheduledForOptimization = (entry: ScheduleEntry, index: SchedulerIndex, config: HeuristicConfig): UnscheduledEntry => {
    const involvedGroups = getInvolvedGroups(entry, index);
    const subGroup = entry.subgroupId ? index.subgroupsById.get(entry.subgroupId) : undefined;
    const studentCount = isIndividualEntry(entry) ? Math.max(1, studentIdsOf(entry).length) + (entry.academicWorkId ? 1 + (entry.additionalTeacherIds?.length || 0) : 0) : subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, group) => sum + group.studentCount, 0);
    const elective = index.electivesById.get(electiveIdOf(entry.unscheduledUid) || '');
    return {
        uid: entry.unscheduledUid || entry.id,
        studentIds: entry.studentIds,
        semester: entry.semester,
        academicWorkId: entry.academicWorkId,
        additionalTeacherIds: entry.additionalTeacherIds,
        subjectId: entry.subjectId,
        groupId: entry.groupId,
        groupIds: entry.groupIds,
        subgroupId: entry.subgroupId,
        streamId: entry.streamId,
        classType: entry.classType,
        teacherId: entry.teacherId,
        teacherCandidates: config.target?.type === 'teacher' ? [config.target.id] : elective ? [elective.teacherId] : getTeacherCandidates(entry.subjectId, entry.classType, index, entry.teacherId, involvedGroups, entry.streamId),
        studentCount,
        deliveryMode: entry.deliveryMode,
        classroomTypeIds: entry.classroomTypeIds,
        requiredClassroomTagIds: entry.requiredClassroomTagIds,
        pinnedClassroomId: entry.pinnedClassroomId,
        preferredTimeSlotIds: entry.preferredTimeSlotIds,
    };
};

const hasHardCollision = (candidate: ScheduleEntry, schedule: ScheduleEntry[], ignoreIds = new Set<string>()) => {
    const bookingKey = `${candidate.date}-${candidate.timeSlotId}`;
    return schedule.some(other => {
        if (ignoreIds.has(other.id)) return false;
        if (`${other.date}-${other.timeSlotId}` !== bookingKey) return false;
        if ([candidate.teacherId, ...(candidate.additionalTeacherIds || [])].some(id => id && [other.teacherId, ...(other.additionalTeacherIds || [])].includes(id))) return true;
        if (other.classroomId && other.classroomId === candidate.classroomId) return true;
        return groupsShareParticipants(candidate, other);
    });
};

const updateEntryPlacement = (
    entry: ScheduleEntry,
    dateStr: string,
    timeSlotId: string,
    classroomId: string,
    teacherId: string
): ScheduleEntry => {
    const date = new Date(dateStr + 'T00:00:00');
    return {
        ...entry,
        date: dateStr,
        day: DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1],
        timeSlotId,
        classroomId,
        teacherId,
    };
};

const replaceEntries = (schedule: ScheduleEntry[], replacements: ScheduleEntry[]) => {
    const replacementById = new Map(replacements.map(entry => [entry.id, entry]));
    return schedule.map(entry => replacementById.get(entry.id) || entry);
};

const buildMovedEntry = (
    entry: ScheduleEntry,
    schedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex,
    workDays: Date[],
    rng: () => number,
    mode: 'move' | 'roomOnly' = 'move',
    allowCollision = false
) => {
    const unscheduled = toUnscheduledForOptimization(entry, index, config);
    const domain = getOrComputePlacementDomain(unscheduled, data, index, workDays, config);
    if (domain.candidates.length === 0 || domain.teacherIds.length === 0 || domain.classroomIds.length === 0) return null;

    const candidateSlots = mode === 'roomOnly'
        ? domain.candidates.filter(candidate => candidate.dateStr === entry.date && candidate.timeSlotId === entry.timeSlotId)
        : domain.candidates;
    if (candidateSlots.length === 0) return null;

    const attempts = Math.min(48, Math.max(8, candidateSlots.length));
    for (let attempt = 0; attempt < attempts; attempt++) {
        const slot = candidateSlots[Math.floor(rng() * candidateSlots.length)];
        const teacherId = mode === 'roomOnly'
            ? entry.teacherId
            : domain.teacherIds[Math.floor(rng() * domain.teacherIds.length)] || entry.teacherId;
        const classroomId = domain.classroomIds[Math.floor(rng() * domain.classroomIds.length)] || entry.classroomId;
        if (mode === 'roomOnly' && classroomId === entry.classroomId) continue;

        const candidate = updateEntryPlacement(entry, slot.dateStr, slot.timeSlotId, classroomId, teacherId);
        if (allowCollision || !hasHardCollision(candidate, schedule, new Set([entry.id]))) return candidate;
    }

    return null;
};

const findConflictingEntries = (candidate: ScheduleEntry, schedule: ScheduleEntry[], ignoreIds = new Set<string>()) => {
    const bookingKey = `${candidate.date}-${candidate.timeSlotId}`;
    return schedule.filter(other => {
        if (ignoreIds.has(other.id)) return false;
        if (`${other.date}-${other.timeSlotId}` !== bookingKey) return false;
        if ([candidate.teacherId, ...(candidate.additionalTeacherIds || [])].some(id => id && [other.teacherId, ...(other.additionalTeacherIds || [])].includes(id))) return true;
        if (other.classroomId && other.classroomId === candidate.classroomId) return true;
        return groupsShareParticipants(candidate, other);
    });
};

const buildSwapCandidate = (
    schedule: ScheduleEntry[],
    rng: () => number
) => {
    if (schedule.length < 2) return null;
    const first = schedule[Math.floor(rng() * schedule.length)];
    const second = schedule[Math.floor(rng() * schedule.length)];
    if (!first || !second || first.id === second.id) return null;

    const nextFirst = updateEntryPlacement(first, second.date, second.timeSlotId, second.classroomId, first.teacherId);
    const nextSecond = updateEntryPlacement(second, first.date, first.timeSlotId, first.classroomId, second.teacherId);
    const ignoreIds = new Set([first.id, second.id]);
    if (hasHardCollision(nextFirst, schedule, ignoreIds) || hasHardCollision(nextSecond, schedule, ignoreIds)) return null;
    return replaceEntries(schedule, [nextFirst, nextSecond]);
};

const buildEvictAndReplaceCandidate = (
    schedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex,
    workDays: Date[],
    rng: () => number
) => {
    const entry = schedule[Math.floor(rng() * schedule.length)];
    if (!entry) return null;
    const moved = buildMovedEntry(entry, schedule, data, config, index, workDays, rng, 'move', true);
    if (!moved) return null;

    const conflicts = findConflictingEntries(moved, schedule, new Set([entry.id])).slice(0, 2);
    if (conflicts.length === 0) return replaceEntries(schedule, [moved]);

    let candidateSchedule = schedule.filter(item => !conflicts.some(conflict => conflict.id === item.id));
    candidateSchedule = replaceEntries(candidateSchedule, [moved]);
    const replacements: ScheduleEntry[] = [];
    for (const conflict of conflicts) {
        const replacement = buildMovedEntry(conflict, candidateSchedule, data, config, index, workDays, rng);
        if (!replacement) return null;
        replacements.push(replacement);
        candidateSchedule.push(replacement);
    }
    return replaceEntries(candidateSchedule, replacements);
};

const buildLocalRebuildCandidate = (
    schedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex,
    workDays: Date[],
    rng: () => number
) => {
    const anchor = schedule[Math.floor(rng() * schedule.length)];
    if (!anchor) return null;
    const groupIds = getEntryGroupIds(anchor);
    const bucket = schedule
        .filter(entry =>
            entry.date === anchor.date &&
            (
                entry.teacherId === anchor.teacherId ||
                getEntryGroupIds(entry).some(groupId => groupIds.includes(groupId))
            )
        )
        .slice(0, 8);
    if (bucket.length === 0) return null;

    let candidateSchedule = [...schedule];
    const replacements: ScheduleEntry[] = [];
    for (const entry of bucket) {
        const moved = buildMovedEntry(entry, candidateSchedule, data, config, index, workDays, rng);
        if (moved) {
            replacements.push(moved);
            candidateSchedule = replaceEntries(candidateSchedule, [moved]);
        }
    }
    return replacements.length > 0 ? candidateSchedule : null;
};

const buildAnnealingNeighbor = (
    schedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex,
    workDays: Date[],
    rng: () => number
) => {
    const roll = rng();
    if (roll < 0.32) {
        const entry = schedule[Math.floor(rng() * schedule.length)];
        const moved = entry ? buildMovedEntry(entry, schedule, data, config, index, workDays, rng) : null;
        return moved ? replaceEntries(schedule, [moved]) : null;
    }
    if (roll < 0.5) {
        const entry = schedule[Math.floor(rng() * schedule.length)];
        const moved = entry ? buildMovedEntry(entry, schedule, data, config, index, workDays, rng, 'roomOnly') : null;
        return moved ? replaceEntries(schedule, [moved]) : null;
    }
    if (roll < 0.68) return buildSwapCandidate(schedule, rng);
    if (roll < 0.84) return buildEvictAndReplaceCandidate(schedule, data, config, index, workDays, rng);
    return buildLocalRebuildCandidate(schedule, data, config, index, workDays, rng);
};

const makeScheduleTabuKey = (schedule: ScheduleEntry[]) => {
    let hash = 2166136261;
    schedule.forEach(entry => {
        const text = `${entry.id}:${entry.date}:${entry.timeSlotId}:${entry.classroomId}:${entry.teacherId}|`;
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
    });
    return String(hash >>> 0);
};

const annealAndTabuRefinement = async (
    initialSchedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index: SchedulerIndex,
    workDays: Date[],
    options: SchedulerRunOptions = {}
) => {
    if (initialSchedule.length < 2) return initialSchedule;

    const rng = createSeededRandom(`${config.seed || 'anneal'}-${initialSchedule.length}`);
    const isLarge = initialSchedule.length > 2_000;
    const maxIterations = isLarge
        ? Math.min(140, Math.max(40, (config.iterations || 2) * 28))
        : Math.min(650, Math.max(120, (config.iterations || 2) * 90));
    let temperature = Math.max(40, 180 * ((config.strictness || 5) / 5));
    const cooling = 0.965;
    const tabu = new Map<string, number>();

    let current = initialSchedule;
    let currentScore = scoreScheduleApproximately(current, config);
    let best = current;
    let bestScore = currentScore;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (options.shouldStop?.()) break;
        if (iteration > 0 && iteration % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();

        for (const [key, until] of Array.from(tabu.entries())) {
            if (until <= iteration) tabu.delete(key);
        }

        const neighbor = buildAnnealingNeighbor(current, data, config, index, workDays, rng);
        if (!neighbor) {
            temperature *= cooling;
            continue;
        }
        if (validateResourceNeighborhood(data, current, neighbor, config, index).length) {
            temperature *= cooling;
            continue;
        }

        const tabuKey = makeScheduleTabuKey(neighbor);
        if (tabu.has(tabuKey)) {
            temperature *= cooling;
            continue;
        }

        const neighborScore = scoreScheduleApproximately(neighbor, config);
        const delta = neighborScore - currentScore;
        const accept = delta <= 0 || Math.exp(-delta / Math.max(1, temperature)) > rng();
        if (accept) {
            tabu.set(makeScheduleTabuKey(current), iteration + TABU_TENURE);
            current = neighbor;
            currentScore = neighborScore;
            if (neighborScore < bestScore) {
                best = neighbor;
                bestScore = neighborScore;
            }
        }

        temperature *= cooling;
    }

    const initialFullScore = scoreScheduleTotal(initialSchedule, data, config, index);
    const bestFullScore = scoreScheduleTotal(best, data, config, index);
    console.log(`Annealing/tabu refinement finished. Approx ${currentScore} -> ${bestScore}. Full ${initialFullScore} -> ${bestFullScore}.`);
    return bestFullScore < initialFullScore ? best : initialSchedule;
};


async function refineSchedule(
    initialSchedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    index = createSchedulerIndex(data),
    options: SchedulerRunOptions = {}
): Promise<ScheduleEntry[]> {
    console.log("Starting schedule refinement phase...");
    let refinedSchedule = [...initialSchedule];
    const resourceBookings = createResourceBookings(data.teachers, data.groups, data.classrooms, [...data.schedule, ...initialSchedule]);

    const isLargeSchedule = initialSchedule.length > 1_000;
    const REFINEMENT_PASSES = isLargeSchedule
        ? 1
        : Math.max(2, Math.min(5, config.iterations || 2));
    const REFINEMENT_CANDIDATE_PERCENTAGE = isLargeSchedule
        ? 0.15
        : config.target ? 0.35 : 0.5;
    const MAX_REFINEMENT_CANDIDATES = isLargeSchedule ? 180 : 700;

    const workDays: Date[] = [];
    let currentDateIterator = new Date(config.timeFrame.start + 'T00:00:00');
    const lastDate = new Date(config.timeFrame.end + 'T00:00:00');
    while (currentDateIterator <= lastDate) {
        const dateStr = toYYYYMMDD(currentDateIterator);
        const dayInfo = index.productionByDate.get(dateStr);
        if (!data.settings.respectProductionCalendar || !dayInfo || dayInfo.isWorkDay) {
            if (currentDateIterator.getDay() !== 0) { // Exclude Sundays
                workDays.push(new Date(currentDateIterator));
            }
        }
        currentDateIterator.setDate(currentDateIterator.getDate() + 1);
    }

    for (let pass = 0; pass < REFINEMENT_PASSES; pass++) {
        if (options.shouldStop?.()) break;
        const entriesWithCosts = refinedSchedule.map(entry => {
            const involvedGroups = getInvolvedGroups(entry, index);
            const subGroup = entry.subgroupId ? index.subgroupsById.get(entry.subgroupId) : undefined;
            const studentCount = isIndividualEntry(entry) ? Math.max(1, studentIdsOf(entry).length) : subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const entryDate = new Date(entry.date + 'T00:00:00');
            const activeTimeSlots = getActiveTimeSlotsForDate(data, entry.date, index);
            const bookingKey = `${entry.date}-${entry.timeSlotId}`;
            bookedResourceKeys(entry).forEach(key => removeBooking(resourceBookings, key, bookingKey));

            const cost = calculateSlotCost(
                { ...entry, studentCount, uid: entry.unscheduledUid || entry.id } as unknown as UnscheduledEntry,
                entryDate,
                entry.timeSlotId,
                index.classroomsById.get(entry.classroomId)!,
                involvedGroups,
                resourceBookings,
                data,
                config.strictness / 5.0,
                refinedSchedule,
                config,
                activeTimeSlots,
                index,
                entry.id
            );
            bookedResourceKeys(entry).forEach(key => addBooking(resourceBookings, key, bookingKey));
            return { entry, cost };
        }).filter(item => item.cost > 0);

        if (entriesWithCosts.length === 0) {
            console.log("No entries with positive cost. Refinement finished early.");
            break;
        }

        entriesWithCosts.sort((a, b) => b.cost - a.cost);
        const candidatesToRefine = entriesWithCosts.slice(
            0,
            Math.min(Math.ceil(entriesWithCosts.length * REFINEMENT_CANDIDATE_PERCENTAGE), MAX_REFINEMENT_CANDIDATES)
        );

        let improvementsThisPass = 0;

        let refinedCandidateIndex = 0;
        for (const { entry: entryToMove } of candidatesToRefine) {
            if (options.shouldStop?.()) break;
            refinedCandidateIndex++;
            if (refinedCandidateIndex % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();

            const currentEntryInSchedule = refinedSchedule.find(e => e.id === entryToMove.id);
            if (!currentEntryInSchedule) continue;

            const originalBookingKey = `${currentEntryInSchedule.date}-${currentEntryInSchedule.timeSlotId}`;
            bookedResourceKeys(currentEntryInSchedule).forEach(key => removeBooking(resourceBookings, key, originalBookingKey));

            let bestAlternativeSlot: { date: Date, timeSlotId: string, classroom: Classroom, teacherId: string, cost: number } | null = null;

            const involvedGroups = getInvolvedGroups(entryToMove, index);
            const subGroup = entryToMove.subgroupId ? index.subgroupsById.get(entryToMove.subgroupId) : undefined;
            const studentCount = isIndividualEntry(entryToMove) ? Math.max(1, studentIdsOf(entryToMove).length) : subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const unscheduledVersion = { ...entryToMove, studentCount, uid: entryToMove.unscheduledUid || entryToMove.id } as unknown as UnscheduledEntry;
            const currentCost = calculateSlotCost(unscheduledVersion, new Date(currentEntryInSchedule.date + 'T00:00:00'), currentEntryInSchedule.timeSlotId,
                index.classroomsById.get(currentEntryInSchedule.classroomId)!, involvedGroups, resourceBookings, data, config.strictness / 5,
                refinedSchedule, config, getActiveTimeSlotsForDate(data, currentEntryInSchedule.date, index), index, entryToMove.id);

            const subject = index.subjectsById.get(unscheduledVersion.subjectId);
            if (!subject) {
                bookedResourceKeys(currentEntryInSchedule).forEach(key => addBooking(resourceBookings, key, originalBookingKey));
                continue;
            }
            const suitableClassrooms = getSuitableClassrooms(unscheduledVersion, subject, index) || [];
            const teacherCandidates = toUnscheduledForOptimization(entryToMove, index, config).teacherCandidates!;
            const primaryClassrooms = getPrimaryClassroomCandidates(unscheduledVersion, subject, suitableClassrooms, involvedGroups, teacherCandidates, data, config, index);
            const primaryWorkDays = getPrimaryWorkDaysForEntry(unscheduledVersion, workDays, config.distributeEvenly);

            const scanAlternativeClassrooms = async (classroomsToScan: Classroom[], daysToScan: Date[]) => {
                let pending: PlacementCandidate[] = [];
                const flush = async () => {
                    const candidates = pending; pending = [];
                    const costs = await evaluatePlacementCandidates(unscheduledVersion, refinedSchedule, candidates, data, config, index, resourceBookings, options, entryToMove.id);
                    for (let i = 0; i < candidates.length; i++) {
                        const candidate = candidates[i];
                        const cost = costs[i] + (candidate.teacherId !== entryToMove.teacherId ? 35 * config.strictness / 5 : 0);
                        if (cost < (bestAlternativeSlot?.cost ?? Infinity)) {
                            bestAlternativeSlot = { date: new Date(candidate.dateStr + 'T00:00:00'), timeSlotId: candidate.timeSlotId,
                                classroom: index.classroomsById.get(candidate.classroomId)!, teacherId: candidate.teacherId, cost };
                        }
                    }
                };
                for (let dateIndex = 0; dateIndex < daysToScan.length; dateIndex++) {
                    if (dateIndex > 0 && dateIndex % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();

                    const date = daysToScan[dateIndex];
                    const activeTimeSlots = getActiveTimeSlotsForDate(data, date, index);
                    const compatibleTimeSlots = getShiftCompatibleTimeSlots(activeTimeSlots, involvedGroups);

                    for (const timeSlot of compatibleTimeSlots) {
                        const bookingKey = `${toYYYYMMDD(date)}-${timeSlot.id}`;
                        if (involvedGroups.some(g => resourceBookings.get(`group-${g.id}`)?.has(bookingKey))) continue;

                        for (const teacherId of teacherCandidates) {
                            if (resourceBookings.get(`teacher-${teacherId}`)?.has(bookingKey)) continue;
                            if (index.teachersById.get(teacherId)?.availabilityGrid?.[DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1]]?.[timeSlot.id] === AvailabilityType.Forbidden) continue;

                            for (const classroom of classroomsToScan) {
                                if (resourceBookings.get(`classroom-${classroom.id}`)?.has(bookingKey)) continue;

                                pending.push({ dateStr: toYYYYMMDD(date), timeSlotId: timeSlot.id, classroomId: classroom.id, teacherId });
                                if (pending.length >= 1024) await flush();
                            }
                        }
                    }
                }
                await flush();
            };

            await scanAlternativeClassrooms(primaryClassrooms, primaryWorkDays);
            if (!bestAlternativeSlot && primaryClassrooms.length < suitableClassrooms.length) {
                await scanAlternativeClassrooms(suitableClassrooms, primaryWorkDays);
            }
            if (!bestAlternativeSlot && primaryWorkDays.length < workDays.length) {
                await scanAlternativeClassrooms(primaryClassrooms, workDays);
            }
            if (!bestAlternativeSlot && primaryWorkDays.length < workDays.length && primaryClassrooms.length < suitableClassrooms.length) {
                await scanAlternativeClassrooms(suitableClassrooms, workDays);
            }

            if (bestAlternativeSlot) {
                bestAlternativeSlot.cost = calculateSlotCost({ ...unscheduledVersion, teacherId: bestAlternativeSlot.teacherId }, bestAlternativeSlot.date,
                    bestAlternativeSlot.timeSlotId, bestAlternativeSlot.classroom, involvedGroups, resourceBookings, data, config.strictness / 5,
                    refinedSchedule, config, getActiveTimeSlotsForDate(data, bestAlternativeSlot.date, index), index, entryToMove.id)
                    + (bestAlternativeSlot.teacherId !== entryToMove.teacherId ? 35 * config.strictness / 5 : 0);
            }
            if (bestAlternativeSlot && bestAlternativeSlot.cost < currentCost) {
                const replacement = updateEntryPlacement(currentEntryInSchedule, toYYYYMMDD(bestAlternativeSlot.date), bestAlternativeSlot.timeSlotId, bestAlternativeSlot.classroom.id, bestAlternativeSlot.teacherId);
                if (validateResourceNeighborhood(data, refinedSchedule, replaceEntries(refinedSchedule, [replacement]), config, index).length) bestAlternativeSlot = null;
            }
            if (bestAlternativeSlot && bestAlternativeSlot.cost < currentCost) {
                improvementsThisPass++;
                const entryIndex = refinedSchedule.findIndex(e => e.id === entryToMove.id);
                if (entryIndex > -1) {
                    const newEntryData = bestAlternativeSlot;
                    refinedSchedule[entryIndex] = {
                        ...refinedSchedule[entryIndex],
                        date: toYYYYMMDD(newEntryData.date),
                        day: DAYS_OF_WEEK[newEntryData.date.getDay() === 0 ? 6 : newEntryData.date.getDay() - 1],
                        timeSlotId: newEntryData.timeSlotId,
                        classroomId: newEntryData.classroom.id,
                        teacherId: newEntryData.teacherId,
                    };
                    index.scoringContext = undefined;

                    const newBookingKey = `${toYYYYMMDD(newEntryData.date)}-${newEntryData.timeSlotId}`;
                    bookedResourceKeys(refinedSchedule[entryIndex]).forEach(key => addBooking(resourceBookings, key, newBookingKey));
                } else {
                    bookedResourceKeys(currentEntryInSchedule).forEach(key => addBooking(resourceBookings, key, originalBookingKey));
                }
            } else {
                bookedResourceKeys(currentEntryInSchedule).forEach(key => addBooking(resourceBookings, key, originalBookingKey));
            }
        }

        console.log(`Refinement Pass ${pass + 1} made ${improvementsThisPass} improvements.`);
        if (improvementsThisPass === 0) {
            console.log("No further improvements found. Stopping refinement.");
            break;
        }
    }

    console.log("Refinement phase finished.");
    return annealAndTabuRefinement(refinedSchedule, data, config, index, workDays, options);
}
