import {
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, BellScheduleProfile,
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS,
    Specialty, EducationalPlan, UnscheduledEntry, AvailabilityType, WeekType, DeliveryMode, ClassroomType, Subgroup, Elective, HeuristicConfig,
    RuleSeverity, RuleAction, RuleCondition, ProductionCalendarEventType, SchedulingExplanation, SchedulingBottleneck
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { getWeekNumber, toYYYYMMDD } from '../utils/dateUtils';
import { areGroupsCompatibleWithTimeSlot } from '../utils/shiftUtils';

interface GenerationData {
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
    teachersById: Map<string, Teacher>;
    groupsById: Map<string, Group>;
    classroomsById: Map<string, Classroom>;
    subjectsById: Map<string, Subject>;
    streamsById: Map<string, Stream>;
    productionByDate: Map<string, ProductionCalendarEvent>;
    subgroupsById: Map<string, Subgroup>;
    subgroupsByParent: Map<string, Subgroup[]>;
    plansBySpecialty: Map<string, EducationalPlan>;
    groupToStreamIds: Map<string, string[]>;
    teacherLinksBySubjectType: Map<string, TeacherSubjectLink[]>;
    classroomsByType: Map<string, Classroom[]>;
    suitableClassroomCache: Map<string, Classroom[]>;
}

type RejectionStats = Record<SchedulingBottleneck, number> & {
    checkedSlots: number;
    checkedClassrooms: number;
};

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
        teachersById: mapById(data.teachers),
        groupsById: mapById(data.groups),
        classroomsById: mapById(data.classrooms),
        subjectsById: mapById(data.subjects),
        streamsById: mapById(data.streams),
        productionByDate: new Map(data.productionCalendar.map(event => [event.date, event])),
        subgroupsById: mapById(data.subgroups),
        subgroupsByParent,
        plansBySpecialty: new Map(data.educationalPlans.map(plan => [plan.specialtyId, plan])),
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

const getEntryGroupIds = (entry: Pick<ScheduleEntry, 'groupId' | 'groupIds'> | Pick<UnscheduledEntry, 'groupId' | 'groupIds'>) =>
    entry.groupIds || (entry.groupId ? [entry.groupId] : []);

const getSeriesGroupKey = (entry: Pick<ScheduleEntry, 'groupId' | 'groupIds' | 'subgroupId'> | Pick<UnscheduledEntry, 'groupId' | 'groupIds' | 'subgroupId'>) =>
    `${getEntryGroupIds(entry).slice().sort().join(',')}::${entry.subgroupId || ''}`;

const entriesBelongToSameSeries = (
    first: Pick<ScheduleEntry, 'subjectId' | 'classType' | 'groupId' | 'groupIds' | 'subgroupId'> | Pick<UnscheduledEntry, 'subjectId' | 'classType' | 'groupId' | 'groupIds' | 'subgroupId'>,
    second: Pick<ScheduleEntry, 'subjectId' | 'classType' | 'groupId' | 'groupIds' | 'subgroupId'> | Pick<UnscheduledEntry, 'subjectId' | 'classType' | 'groupId' | 'groupIds' | 'subgroupId'>
) =>
    first.subjectId === second.subjectId &&
    first.classType === second.classType &&
    getSeriesGroupKey(first) === getSeriesGroupKey(second);

const addBooking = (bookings: Map<string, Set<string>>, resourceKey: string, bookingKey: string) => {
    if (!bookings.has(resourceKey)) bookings.set(resourceKey, new Set());
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
    teachers.forEach(item => resourceBookings.set(`teacher-${item.id}`, new Set()));
    groups.forEach(item => resourceBookings.set(`group-${item.id}`, new Set()));
    classrooms.forEach(item => resourceBookings.set(`classroom-${item.id}`, new Set()));

    schedule.forEach(entry => {
        if (!entry.date) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        addBooking(resourceBookings, `teacher-${entry.teacherId}`, bookingKey);
        getEntryGroupIds(entry).forEach(gid => addBooking(resourceBookings, `group-${gid}`, bookingKey));
        addBooking(resourceBookings, `classroom-${entry.classroomId}`, bookingKey);
    });

    return resourceBookings;
};

const getRetainedExistingSchedule = (schedule: ScheduleEntry[], config: HeuristicConfig) => {
    if (!config.clearExisting) return schedule;
    const startDate = new Date(config.timeFrame.start + 'T00:00:00');
    const endDate = new Date(config.timeFrame.end + 'T00:00:00');

    return schedule.filter(entry => {
        if (!entry.date) return true;
        const entryDate = new Date(entry.date + 'T00:00:00');
        if (entryDate < startDate || entryDate > endDate) return true;
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

const isEntryInOptimizationScope = (entry: ScheduleEntry, config: HeuristicConfig) => {
    if (!entry.date) return false;
    const entryDate = new Date(entry.date + 'T00:00:00');
    const startDate = new Date(config.timeFrame.start + 'T00:00:00');
    const endDate = new Date(config.timeFrame.end + 'T00:00:00');
    if (entryDate < startDate || entryDate > endDate) return false;
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

const getActiveTimeSlotsForDate = (data: GenerationData, date: Date | string, index: SchedulerIndex) => {
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

const getTeacherCandidates = (
    subjectId: string,
    classType: ClassType,
    index: SchedulerIndex,
    preferredTeacherId?: string
) => {
    const candidates = [
        ...(preferredTeacherId ? [preferredTeacherId] : []),
        ...(index.teacherLinksBySubjectType.get(makeSubjectTypeKey(subjectId, classType)) || []).map(link => link.teacherId),
    ];
    return Array.from(new Set(candidates)).filter(teacherId => index.teachersById.has(teacherId));
};

const streamCanScheduleLecture = (stream: Stream, subjectId: string) => {
    const isLectureStream = !stream.type || stream.type === 'lecture';
    const matchesSubject = !stream.subjectId || stream.subjectId === subjectId;
    return isLectureStream && matchesSubject;
};

const groupHasLecture = (group: Group, subjectId: string, semester: number, index: SchedulerIndex) => {
    const plan = index.plansBySpecialty.get(group.specialtyId);
    return !!plan?.entries.some(entry =>
        entry.semester === semester &&
        entry.subjectId === subjectId &&
        entry.lectureHours > 0
    );
};

const selectLectureStream = (groupId: string, subjectId: string, semester: number, index: SchedulerIndex) => {
    const streamIds = index.groupToStreamIds.get(groupId) || [];
    const matchingStreams = streamIds
        .map(streamId => index.streamsById.get(streamId))
        .filter((stream): stream is Stream => !!stream && streamCanScheduleLecture(stream, subjectId));
    const semesterMatchedStreams = matchingStreams.filter(stream => !stream.semester || stream.semester === semester);
    const candidateStreams = semesterMatchedStreams.length > 0 ? semesterMatchedStreams : matchingStreams;

    return candidateStreams
        .sort((a, b) => {
            const subjectPriority = Number(!!b.subjectId) - Number(!!a.subjectId);
            if (subjectPriority !== 0) return subjectPriority;
            const aSemesterExact = a.semester === semester;
            const bSemesterExact = b.semester === semester;
            const semesterPriority = Number(bSemesterExact) - Number(aSemesterExact);
            if (semesterPriority !== 0) return semesterPriority;
            return b.groupIds.length - a.groupIds.length;
        })[0];
};

const getSuitableClassrooms = (entry: UnscheduledEntry, subject: Subject, index: SchedulerIndex) => {
    const requiredClassroomTypes = entry.classroomTypeIds?.length ? entry.classroomTypeIds : subject.classroomTypeRequirements?.[entry.classType];
    if (!requiredClassroomTypes || requiredClassroomTypes.length === 0) return null;

    const requiredTags = entry.requiredClassroomTagIds?.length ? entry.requiredClassroomTagIds : subject.requiredClassroomTagIds || [];
    const cacheKey = `${entry.subjectId}::${entry.classType}::${entry.studentCount}::${requiredClassroomTypes.join(',')}::${requiredTags.join(',')}`;
    const cached = index.suitableClassroomCache.get(cacheKey);
    if (cached) return cached;

    const classrooms = requiredClassroomTypes.flatMap(typeId => index.classroomsByType.get(typeId) || [])
        .filter((classroom, position, array) => array.findIndex(item => item.id === classroom.id) === position)
        .filter(classroom => {
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

const chooseCandidate = <T>(candidates: T[], rng: () => number, stochasticity = 0): T => {
    if (candidates.length === 1 || stochasticity <= 0) return candidates[0];
    const spread = Math.max(1, Math.ceil(candidates.length * Math.min(1, stochasticity)));
    return candidates[Math.floor(rng() * spread)];
};

// Generates the initial pool of classes to be scheduled from educational plans
const generateClassPool = (data: GenerationData, index = createSchedulerIndex(data)): UnscheduledEntry[] => {
    const { groups, electives } = data;
    const entries: UnscheduledEntry[] = [];

    const processedGroupLectures = new Set<string>();

    groups.forEach(group => {
        const plan = index.plansBySpecialty.get(group.specialtyId);
        if (!plan) return;

        const groupSubgroups = index.subgroupsByParent.get(group.id) || [];
        const relevantEntries = plan.entries.filter(e => e.lectureHours > 0 || e.practiceHours > 0 || e.labHours > 0);

        relevantEntries.forEach(planEntry => {
            const planEntrySemester = planEntry.semester || 1;
            const lectureKey = `${planEntry.subjectId}-${planEntrySemester}-${group.id}`;

            // 1. Handle Lectures
            if (planEntry.lectureHours > 0 && !processedGroupLectures.has(lectureKey)) {
                const numClasses = Math.ceil(planEntry.lectureHours / 2);
                const lectureStream = selectLectureStream(group.id, planEntry.subjectId, planEntrySemester, index);

                let lectureGroups: Group[] = [group];

                // Lecture streams are optional filters: empty subject means any shared lecture,
                // filled subject means only that discipline.
                if (lectureStream) {
                    lectureGroups = groups.filter(candidate =>
                        lectureStream.groupIds.includes(candidate.id) &&
                        groupHasLecture(candidate, planEntry.subjectId, planEntrySemester, index)
                    );
                }

                const teacherCandidates = getTeacherCandidates(planEntry.subjectId, ClassType.Lecture, index, lectureStream?.teacherId);
                if (teacherCandidates.length > 0) {
                    const studentCount = lectureGroups.reduce((sum, g) => sum + g.studentCount, 0);
                    const groupIds = lectureGroups.map(g => g.id);
                    const subjectClassroomTypes = index.subjectsById.get(planEntry.subjectId)?.classroomTypeRequirements?.[ClassType.Lecture] || [];
                    const classroomTypeIds = Array.from(new Set([
                        ...(lectureStream?.classroomTypeId ? [lectureStream.classroomTypeId] : []),
                        ...subjectClassroomTypes,
                    ]));

                    for (let i = 0; i < numClasses; i++) {
                        const entry: UnscheduledEntry = {
                            uid: `unsched-${planEntry.subjectId}-sem${planEntrySemester}-${groupIds.join('_')}-${ClassType.Lecture}-${i}`,
                            subjectId: planEntry.subjectId,
                            classType: ClassType.Lecture,
                            teacherId: teacherCandidates[0],
                            teacherCandidates,
                            studentCount,
                            classroomTypeIds: classroomTypeIds.length > 0 ? classroomTypeIds : undefined,
                        };
                        if (lectureGroups.length > 1) {
                            entry.groupIds = groupIds;
                            if (lectureStream) entry.streamId = lectureStream.id;
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
                { type: ClassType.Practical, hours: planEntry.practiceHours },
                { type: ClassType.Lab, hours: planEntry.labHours },
            ];
            practiceAndLabTypes.forEach(({ type, hours }) => {
                if (hours <= 0) return;
                const numClasses = Math.ceil(hours / 2);

                if (planEntry.splitForSubgroups && groupSubgroups.length > 0) {
                    groupSubgroups.forEach(subgroup => {
                        const assignment = subgroup.teacherAssignments?.find(a => a.subjectId === planEntry.subjectId && a.classType === type);
                        const teacherCandidates = getTeacherCandidates(planEntry.subjectId, type, index, assignment?.teacherId);
                        if (teacherCandidates.length > 0) {
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
                    const teacherCandidates = getTeacherCandidates(planEntry.subjectId, type, index);
                    if (teacherCandidates.length > 0) {
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

    electives.forEach(elective => {
        const numClasses = Math.ceil(elective.hoursPerSemester / 2);
        const group = index.groupsById.get(elective.groupId);
        if (!group) return;

        for (let i = 0; i < numClasses; i++) {
            entries.push({
                uid: `unsched-elective-${elective.id}-${i}`,
                subjectId: elective.subjectId,
                groupId: elective.groupId,
                classType: elective.classType || ClassType.Elective,
                teacherId: elective.teacherId,
                teacherCandidates: [elective.teacherId],
                studentCount: group.studentCount,
                deliveryMode: elective.deliveryMode || DeliveryMode.Offline,
                classroomTypeIds: elective.classroomTypeIds,
                requiredClassroomTagIds: elective.requiredClassroomTagIds,
                pinnedClassroomId: elective.pinnedClassroomId,
                preferredTimeSlotIds: elective.preferredTimeSlotIds,
            });
        }
    });

    return entries;
};


export const generateScheduleWithHeuristics = async (data: GenerationData, config: HeuristicConfig): Promise<SchedulerResult> => {
    const explanations: Record<string, SchedulingExplanation> = {};
    const index = createSchedulerIndex(data);
    const rng = createSeededRandom(config.seed);

    // Check for native scheduler availability
    // We import dynamically to avoid issues if the module is not built
    let nativeService;
    try {
        nativeService = require('./nativeScheduler');
    } catch (e) { }

    if (config.useNative && data.schedulingRules.length === 0 && nativeService && nativeService.isNativeSchedulerAvailable() && !config.target) { // Native only supports full generation for now
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

            const result = { schedule: nativeSchedule, unschedulable, explanations };
            return { ...result, score: calculateScheduleScore(data, result, config) };
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
    const existingSchedule = getRetainedExistingSchedule(data.schedule, config);
    const schedulingData = { ...data, schedule: existingSchedule };

    const resourceBookings = createResourceBookings(teachers, groups, classrooms, existingSchedule);

    // --- 2. PREPARE CLASS POOL AND WORKDAYS ---
    let classPool = generateClassPool(data, index);
    const existingUids = new Set(existingSchedule.map(e => e.unscheduledUid));
    classPool = classPool.filter(e => !existingUids.has(e.uid)); // Don't try to schedule what's already there

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
    const domainSizes = new Map(classPool.map(entry => [entry.uid, estimateDomainSize(entry, data, index, workDays)]));
    classPool.sort((a, b) =>
        getConstraintScore(b, data, index, workDays, domainSizes.get(b.uid) ?? 0) -
        getConstraintScore(a, data, index, workDays, domainSizes.get(a.uid) ?? 0)
    );

    // --- 3. PLACEMENT LOOP ---
    let processedEntries = 0;
    for (const entryToPlace of classPool) {
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

        const requiredClassroomTypes = entryToPlace.classroomTypeIds?.length ? entryToPlace.classroomTypeIds : subject?.classroomTypeRequirements?.[entryToPlace.classType];
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

        const stats = createEmptyRejectionStats();
        const conflicts: string[] = [];
        const teacherCandidates = entryToPlace.teacherCandidates?.length ? entryToPlace.teacherCandidates : [entryToPlace.teacherId];
        const primaryClassrooms = getPrimaryClassroomCandidates(entryToPlace, subject, suitableClassrooms, involvedGroups, teacherCandidates, data, config, index);
        const primaryWorkDays = getPrimaryWorkDaysForEntry(entryToPlace, workDays, distributeEvenly);

        const scanClassrooms = async (classroomsToScan: Classroom[], daysToScan: Date[]) => {
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
                    stats.checkedSlots++;

                    if (involvedGroups.some(g => resourceBookings.get(`group-${g.id}`)?.has(bookingKey))) {
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
                        if (resourceBookings.get(`teacher-${teacherId}`)?.has(bookingKey)) {
                            stats.teacher++;
                            conflicts.push(`Преподаватель занят: ${dateStr}, ${timeSlot.time}.`);
                            continue;
                        }
                        if (index.teachersById.get(teacherId)?.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden) {
                            stats.teacher++;
                            conflicts.push(`У преподавателя запрещен слот: ${dayName}, ${timeSlot.time}.`);
                            continue;
                        }

                        const candidateEntry = { ...entryToPlace, teacherId };

                        for (const classroom of classroomsToScan) {
                            stats.checkedClassrooms++;
                            if (resourceBookings.get(`classroom-${classroom.id}`)?.has(bookingKey)) {
                                stats.classroom++;
                                conflicts.push(`Аудитория ${classroom.number} занята: ${dateStr}, ${timeSlot.time}.`);
                                continue;
                            }

                            const cost = calculateSlotCost(candidateEntry, date, timeSlot.id, classroom, involvedGroups, resourceBookings, schedulingData, softPenaltyMultiplier, newSchedule, config, activeTimeSlots, index);
                            if (cost === Infinity) {
                                stats.rules++;
                                conflicts.push(`Строгое пользовательское правило запрещает ${dayName}, ${timeSlot.time}.`);
                                continue;
                            }

                            if (bestSlots.length < TOP_N_CANDIDATES) {
                                bestSlots.push({ date, timeSlotId: timeSlot.id, classroom, teacherId, cost });
                                bestSlots.sort((a, b) => a.cost - b.cost);
                            } else if (cost < bestSlots[TOP_N_CANDIDATES - 1].cost) {
                                bestSlots[TOP_N_CANDIDATES - 1] = { date, timeSlotId: timeSlot.id, classroom, teacherId, cost };
                                bestSlots.sort((a, b) => a.cost - b.cost);
                            }

                            if (bestSlots.length >= TOP_N_CANDIDATES && bestSlots[TOP_N_CANDIDATES - 1].cost <= GOOD_ENOUGH_SLOT_COST) {
                                return;
                            }
                        }
                    }
                }
            }
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

            addBooking(resourceBookings, `teacher-${chosenSlot.teacherId}`, bookingKey);
            addBooking(resourceBookings, `classroom-${chosenSlot.classroom.id}`, bookingKey);
            involvedGroups.forEach(g => addBooking(resourceBookings, `group-${g.id}`, bookingKey));

        } else {
            markUnscheduled(entryToPlace, unschedulable, explanations, explainEntry(
                entryToPlace,
                stats,
                conflicts.length > 0 ? conflicts : ['В выбранном диапазоне нет рабочих слотов после учета календаря, расписания звонков и ограничений.'],
                stats.teacher >= stats.classroom && stats.teacher >= stats.group ? 'Преподаватель' : stats.classroom >= stats.group ? 'Аудитории' : 'Группы/поток'
            ));
        }

        processedEntries++;
        if (processedEntries % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();
    }

    // --- 4. REFINEMENT PHASE ---
    if (newSchedule.length > 0) {
        console.log(`Initial placement finished. ${newSchedule.length} entries placed. Starting refinement.`);
        const refinedSchedule = await refineSchedule(newSchedule, schedulingData, config, resourceBookings, index);
        const result = { schedule: refinedSchedule, unschedulable, explanations };
        return { ...result, score: calculateScheduleScore(data, result, config, index) };
    }


    const result = { schedule: newSchedule, unschedulable, explanations };
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

    const applicableRuleCount = data.schedulingRules.filter(rule => rule.conditions.some(condition => doesConditionApply(condition, entry))).length;
    score += applicableRuleCount * 25;
    if (domainSize === 0) score += 2_000;
    else score += Math.max(0, 1_000 - Math.min(domainSize, 1_000));

    return score;
};

const doesConditionApply = (condition: RuleCondition, entry: UnscheduledEntry): boolean => {
    const groupIds = getEntryGroupIds(entry);
    switch (condition.entityType) {
        case 'teacher':
            return condition.entityIds.includes(entry.teacherId);
        case 'group':
            return groupIds.some(gid => condition.entityIds.includes(gid));
        case 'subject':
            if (condition.entityIds.includes(entry.subjectId)) {
                return !condition.classType || condition.classType === entry.classType;
            }
            return false;
        case 'classType':
            return condition.entityIds.includes(entry.classType);
        default:
            return false;
    }
};

type RuleContextEntry = UnscheduledEntry | ScheduleEntry;

interface RuleEvaluationContext {
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

const conditionMatchesContext = (condition: RuleCondition, context: RuleEvaluationContext, entry: RuleContextEntry = context.entry): boolean => {
    const groupIds = getEntryGroupIds(entry);
    const teacher = context.index.teachersById.get(entry.teacherId);
    const groups = groupIds.map(groupId => context.index.groupsById.get(groupId)).filter(Boolean) as Group[];

    switch (condition.entityType) {
        case 'teacher':
            return condition.entityIds.includes(entry.teacherId);
        case 'group':
            return groupIds.some(gid => condition.entityIds.includes(gid));
        case 'subject':
            return condition.entityIds.includes(entry.subjectId) && (!condition.classType || condition.classType === entry.classType);
        case 'classType':
            return condition.entityIds.includes(entry.classType);
        case 'classroom':
            return 'classroomId' in entry
                ? condition.entityIds.includes(entry.classroomId)
                : !!context.classroom && condition.entityIds.includes(context.classroom.id);
        case 'department':
            return (!!teacher && condition.entityIds.includes(teacher.departmentId)) ||
                groups.some(group => condition.entityIds.includes(group.departmentId));
        default:
            return false;
    }
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
                if (count < rule.param) cost += (rule.param - count) * penalty * 0.5;
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
    index = createSchedulerIndex(data)
): number => {
    let cost = 0;
    const { settings, schedulingRules } = data;
    const { enforceLectureOrder, distributeEvenly } = config;
    const teacher = index.teachersById.get(entry.teacherId);
    const subject = index.subjectsById.get(entry.subjectId);
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const dateStr = toYYYYMMDD(date);
    const allScheduleForScoring = [...data.schedule, ...newSchedule];
    const candidateTimeSlot = activeTimeSlots.find(slot => slot.id === timeSlotId);
    if (!areGroupsCompatibleWithTimeSlot(candidateTimeSlot, involvedGroups)) {
        return Infinity;
    }

    const allBookingsTodayForGroups = allScheduleForScoring.filter(e => {
        if (e.date !== dateStr) return false;
        const entryGroupIds = getEntryGroupIds(e);
        return entryGroupIds.some(gid => involvedGroups.some(ig => ig.id === gid));
    });

    // Availability Grids
    const teacherAvailability = teacher?.availabilityGrid?.[dayName]?.[timeSlotId];
    if (teacherAvailability === AvailabilityType.Forbidden) return Infinity;
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
            const prevTimeSlot = activeTimeSlots[timeSlotIndex - 1];
            const nextTimeSlot = activeTimeSlots[timeSlotIndex + 1];
            const isOccupiedBefore = prevTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${prevTimeSlot.id}`) : true;
            const isOccupiedAfter = nextTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${nextTimeSlot.id}`) : true;
            const hasAnyOtherClassToday = activeTimeSlots.some(ts => ts.id !== timeSlotId && bookings.get(resourceKey)?.has(`${dateStr}-${ts.id}`));

            let windowPenalty = 200 * penaltyMultiplier;
            if (isFirstYear && settings.enforceStandardRules) {
                windowPenalty = 1000 * penaltyMultiplier; // Very high penalty for first years
            }


            if (hasAnyOtherClassToday && !isOccupiedBefore && !isOccupiedAfter) cost += windowPenalty * 2; // Isolated class
            else if (hasAnyOtherClassToday && (!isOccupiedBefore || !isOccupiedAfter)) cost += windowPenalty; // Class at start/end with gap
        };
        checkWindowsForResource(`teacher-${entry.teacherId}`, false);
        involvedGroups.forEach(g => checkWindowsForResource(`group-${g.id}`, g.course === 1));
    }

    // Day Load Penalty
    const teacherBookingsToday = allScheduleForScoring.filter(e => e.teacherId === teacher?.id && e.date === dateStr);
    const teacherClassesOnDay = teacherBookingsToday.length;
    cost += getTeacherLoadPenalty(entry.teacherId, dateStr, allScheduleForScoring, penaltyMultiplier);

    if (settings.enforceStandardRules && teacherClassesOnDay >= 4) {
        cost += (teacherClassesOnDay - 3) * 150 * penaltyMultiplier;
    }

    // FIX: Define groupClassesOnDay to calculate class load per group.
    const groupClassesOnDay = involvedGroups.map(group => {
        return allScheduleForScoring.filter(e => {
            if (e.date !== dateStr) return false;
            const entryGroupIds = getEntryGroupIds(e);
            return entryGroupIds.includes(group.id);
        }).length;
    });

    groupClassesOnDay.forEach(count => {
        if (settings.enforceStandardRules && count >= 5) {
            cost += (count - 4) * 200 * penaltyMultiplier;
        } else if (count >= 4) {
            cost += (count - 3) * 100 * penaltyMultiplier;
        }
    });

    if (settings.enforceStandardRules) {
        // Penalty for same subject on same day for a group
        if (allBookingsTodayForGroups.some(b => b.subjectId === entry.subjectId)) {
            cost += 75 * penaltyMultiplier;
        }
    }


    const ruleCost = applySchedulingRules({
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

    cost += getWeekSimilarityPenalty(entry, date, timeSlotId, allScheduleForScoring, penaltyMultiplier);
    cost += getLectureSequencePenalty(entry, dateStr, timeSlotId, activeTimeSlots, allScheduleForScoring, penaltyMultiplier, enforceLectureOrder);

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

export const calculateScheduleScore = (
    data: GenerationData,
    result: Pick<SchedulerResult, 'schedule' | 'unschedulable'>,
    config: HeuristicConfig,
    index = createSchedulerIndex(data)
): ScheduleScore => {
    const generatedSchedule = result.schedule.filter(entry => entry.date);
    const retainedExistingSchedule = getRetainedExistingSchedule(data.schedule, config);
    const bookings = createResourceBookings(data.teachers, data.groups, data.classrooms, [...retainedExistingSchedule, ...generatedSchedule]);
    let softPenalty = 0;
    let hardViolations = 0;

    const seenResourceSlots = new Set<string>();
    generatedSchedule.forEach(entry => {
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        const resourceKeys = [
            `teacher-${entry.teacherId}`,
            `classroom-${entry.classroomId}`,
            ...getEntryGroupIds(entry).map(groupId => `group-${groupId}`),
        ];
        resourceKeys.forEach(resourceKey => {
            const key = `${resourceKey}-${bookingKey}`;
            if (seenResourceSlots.has(key)) hardViolations++;
            seenResourceSlots.add(key);
        });

        const involvedGroups = getInvolvedGroups(entry, index);
        const subGroup = entry.subgroupId ? index.subgroupsById.get(entry.subgroupId) : undefined;
        const studentCount = subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, group) => sum + group.studentCount, 0);
        const classroom = index.classroomsById.get(entry.classroomId);
        if (!classroom || !entry.date) {
            hardViolations++;
            return;
        }

        const activeTimeSlots = getActiveTimeSlotsForDate(data, entry.date, index);
        removeBooking(bookings, `teacher-${entry.teacherId}`, bookingKey);
        removeBooking(bookings, `classroom-${entry.classroomId}`, bookingKey);
        getEntryGroupIds(entry).forEach(groupId => removeBooking(bookings, `group-${groupId}`, bookingKey));

        const cost = calculateSlotCost(
            { ...entry, uid: entry.unscheduledUid || entry.id, studentCount } as unknown as UnscheduledEntry,
            new Date(entry.date + 'T00:00:00'),
            entry.timeSlotId,
            classroom,
            involvedGroups,
            bookings,
            { ...data, schedule: retainedExistingSchedule },
            config.strictness / 5.0,
            generatedSchedule.filter(item => item.id !== entry.id),
            config,
            activeTimeSlots,
            index
        );
        if (cost === Infinity) hardViolations++;
        else softPenalty += cost;

        addBooking(bookings, `teacher-${entry.teacherId}`, bookingKey);
        addBooking(bookings, `classroom-${entry.classroomId}`, bookingKey);
        getEntryGroupIds(entry).forEach(groupId => addBooking(bookings, `group-${groupId}`, bookingKey));
    });

    const unscheduled = result.unschedulable.length;
    return {
        total: unscheduled * 1_000_000 + hardViolations * 250_000 + softPenalty,
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
    const retainedSchedule = data.schedule.filter(entry => !isEntryInOptimizationScope(entry, config));
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

    const bookings = createResourceBookings(data.teachers, data.groups, data.classrooms, data.schedule);
    const optimizedCandidates = await refineSchedule(
        candidates,
        scopedData,
        { ...config, clearExisting: false },
        bookings,
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


async function refineSchedule(
    initialSchedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    initialBookings: Map<string, Set<string>>,
    index = createSchedulerIndex(data)
): Promise<ScheduleEntry[]> {
    console.log("Starting schedule refinement phase...");
    let refinedSchedule = [...initialSchedule];
    const resourceBookings = new Map(Array.from(initialBookings.entries()).map(([key, value]) => [key, new Set(value)]));

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
        const entriesWithCosts = refinedSchedule.map(entry => {
            const involvedGroups = getInvolvedGroups(entry, index);
            const subGroup = entry.subgroupId ? index.subgroupsById.get(entry.subgroupId) : undefined;
            const studentCount = subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const entryDate = new Date(entry.date + 'T00:00:00');
            const activeTimeSlots = getActiveTimeSlotsForDate(data, entry.date, index);

            const cost = calculateSlotCost(
                { ...entry, studentCount, uid: entry.unscheduledUid! } as unknown as UnscheduledEntry,
                entryDate,
                entry.timeSlotId,
                index.classroomsById.get(entry.classroomId)!,
                involvedGroups,
                resourceBookings,
                data,
                config.strictness / 5.0,
                refinedSchedule.filter(e => e.id !== entry.id), // Pass schedule without the current entry
                config,
                activeTimeSlots,
                index
            );
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
        for (const { entry: entryToMove, cost: currentCost } of candidatesToRefine) {
            refinedCandidateIndex++;
            if (refinedCandidateIndex % SCHEDULER_YIELD_INTERVAL === 0) await yieldToEventLoop();

            const currentEntryInSchedule = refinedSchedule.find(e => e.id === entryToMove.id);
            if (!currentEntryInSchedule) continue;

            const originalBookingKey = `${currentEntryInSchedule.date}-${currentEntryInSchedule.timeSlotId}`;
            removeBooking(resourceBookings, `teacher-${currentEntryInSchedule.teacherId}`, originalBookingKey);
            removeBooking(resourceBookings, `classroom-${currentEntryInSchedule.classroomId}`, originalBookingKey);
            getEntryGroupIds(currentEntryInSchedule).forEach(gid => removeBooking(resourceBookings, `group-${gid}`, originalBookingKey));

            let bestAlternativeSlot: { date: Date, timeSlotId: string, classroom: Classroom, teacherId: string, cost: number } | null = null;

            const involvedGroups = getInvolvedGroups(entryToMove, index);
            const subGroup = entryToMove.subgroupId ? index.subgroupsById.get(entryToMove.subgroupId) : undefined;
            const studentCount = subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const unscheduledVersion = { ...entryToMove, studentCount, uid: entryToMove.unscheduledUid! } as unknown as UnscheduledEntry;

            const subject = index.subjectsById.get(unscheduledVersion.subjectId);
            if (!subject) {
                addBooking(resourceBookings, `teacher-${currentEntryInSchedule.teacherId}`, originalBookingKey);
                addBooking(resourceBookings, `classroom-${currentEntryInSchedule.classroomId}`, originalBookingKey);
                getEntryGroupIds(currentEntryInSchedule).forEach(gid => addBooking(resourceBookings, `group-${gid}`, originalBookingKey));
                continue;
            }
            const suitableClassrooms = getSuitableClassrooms(unscheduledVersion, subject, index) || [];
            const teacherCandidates = getTeacherCandidates(unscheduledVersion.subjectId, unscheduledVersion.classType, index, unscheduledVersion.teacherId);
            const primaryClassrooms = getPrimaryClassroomCandidates(unscheduledVersion, subject, suitableClassrooms, involvedGroups, teacherCandidates, data, config, index);
            const primaryWorkDays = getPrimaryWorkDaysForEntry(unscheduledVersion, workDays, config.distributeEvenly);

            const scanAlternativeClassrooms = async (classroomsToScan: Classroom[], daysToScan: Date[]) => {
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

                            const candidateVersion = { ...unscheduledVersion, teacherId };

                            for (const classroom of classroomsToScan) {
                                if (resourceBookings.get(`classroom-${classroom.id}`)?.has(bookingKey)) continue;

                                let cost = calculateSlotCost(candidateVersion, date, timeSlot.id, classroom, involvedGroups, resourceBookings, data, config.strictness / 4.0, refinedSchedule.filter(e => e.id !== entryToMove.id), config, activeTimeSlots, index);
                                if (teacherId !== entryToMove.teacherId) {
                                    cost += 35 * (config.strictness / 5.0);
                                }

                                if (cost < (bestAlternativeSlot?.cost ?? Infinity)) {
                                    bestAlternativeSlot = { date, timeSlotId: timeSlot.id, classroom, teacherId, cost };
                                }
                            }
                        }
                    }
                }
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

                    const newBookingKey = `${toYYYYMMDD(newEntryData.date)}-${newEntryData.timeSlotId}`;
                    addBooking(resourceBookings, `teacher-${newEntryData.teacherId}`, newBookingKey);
                    addBooking(resourceBookings, `classroom-${newEntryData.classroom.id}`, newBookingKey);
                    getEntryGroupIds(entryToMove).forEach(gid => addBooking(resourceBookings, `group-${gid}`, newBookingKey));
                } else {
                    addBooking(resourceBookings, `teacher-${currentEntryInSchedule.teacherId}`, originalBookingKey);
                    addBooking(resourceBookings, `classroom-${currentEntryInSchedule.classroomId}`, originalBookingKey);
                    getEntryGroupIds(currentEntryInSchedule).forEach(gid => addBooking(resourceBookings, `group-${gid}`, originalBookingKey));
                }
            } else {
                addBooking(resourceBookings, `teacher-${currentEntryInSchedule.teacherId}`, originalBookingKey);
                addBooking(resourceBookings, `classroom-${currentEntryInSchedule.classroomId}`, originalBookingKey);
                getEntryGroupIds(currentEntryInSchedule).forEach(gid => addBooking(resourceBookings, `group-${gid}`, originalBookingKey));
            }
        }

        console.log(`Refinement Pass ${pass + 1} made ${improvementsThisPass} improvements.`);
        if (improvementsThisPass === 0) {
            console.log("No further improvements found. Stopping refinement.");
            break;
        }
    }

    console.log("Refinement phase finished.");
    return refinedSchedule;
}
