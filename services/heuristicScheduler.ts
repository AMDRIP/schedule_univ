import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS, 
    Specialty, EducationalPlan, UnscheduledEntry, AvailabilityType, WeekType, DeliveryMode, ClassroomType, Subgroup, Elective, HeuristicConfig,
    RuleSeverity, RuleAction, RuleCondition
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD } from '../utils/dateUtils';

interface GenerationData {
  teachers: Teacher[];
  groups: Group[];
  classrooms: Classroom[];
  subjects: Subject[];
  streams: Stream[];
  timeSlots: TimeSlot[];
  timeSlotsShortened: TimeSlot[];
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

interface SchedulerResult {
    schedule: ScheduleEntry[];
    unschedulable: UnscheduledEntry[];
}

// Generates the initial pool of classes to be scheduled from educational plans
const generateClassPool = (data: GenerationData): UnscheduledEntry[] => {
    const { groups, educationalPlans, teacherSubjectLinks, streams, subgroups, electives } = data;
    const entries: UnscheduledEntry[] = [];
    const currentSemester = 1;

    const groupToStreamMap = new Map<string, string>();
    streams.forEach(stream => stream.groupIds.forEach(groupId => groupToStreamMap.set(groupId, stream.id)));

    const processedStreamLectures = new Set<string>(); // key: `${subjectId}-${streamId}`

    groups.forEach(group => {
        const plan = educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        const groupSubgroups = subgroups.filter(sg => sg.parentGroupId === group.id);
        const relevantEntries = plan.entries.filter(e => e.semester === currentSemester);

        relevantEntries.forEach(planEntry => {
            const streamId = groupToStreamMap.get(group.id);

            // 1. Handle Lectures
            if (planEntry.lectureHours > 0) {
                let teacherId: string | undefined;
                const numClasses = Math.ceil(planEntry.lectureHours / 2);

                if (streamId) {
                    const streamKey = `${planEntry.subjectId}-${streamId}`;
                    if (!processedStreamLectures.has(streamKey)) {
                        processedStreamLectures.add(streamKey);
                        const stream = streams.find(s => s.id === streamId)!;
                        const streamGroups = groups.filter(g => stream.groupIds.includes(g.id));
                        const studentCount = streamGroups.reduce((sum, g) => sum + g.studentCount, 0);
                        teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
                        
                        if (teacherId) {
                            for (let i = 0; i < numClasses; i++) {
                                entries.push({
                                    uid: `unsched-${planEntry.subjectId}-${streamId}-${ClassType.Lecture}-${i}`,
                                    subjectId: planEntry.subjectId, groupId: group.id,
                                    classType: ClassType.Lecture, teacherId, streamId, studentCount,
                                });
                            }
                        }
                    }
                } else { // Regular group lecture
                    teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
                    if (teacherId) {
                        for (let i = 0; i < numClasses; i++) {
                            entries.push({
                                uid: `unsched-${planEntry.subjectId}-${group.id}-${ClassType.Lecture}-${i}`,
                                subjectId: planEntry.subjectId, groupId: group.id,
                                classType: ClassType.Lecture, teacherId, studentCount: group.studentCount,
                            });
                        }
                    }
                }
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
                        let teacherId = assignment?.teacherId ?? teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
                        if (teacherId) {
                            for (let i = 0; i < numClasses; i++) {
                                entries.push({
                                    uid: `unsched-${planEntry.subjectId}-${subgroup.id}-${type}-${i}`,
                                    subjectId: planEntry.subjectId, groupId: group.id, subgroupId: subgroup.id,
                                    classType: type, teacherId, studentCount: subgroup.studentCount,
                                });
                            }
                        }
                    });
                } else { // Whole group for practice/lab
                    const teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
                    if (teacherId) {
                        for (let i = 0; i < numClasses; i++) {
                            entries.push({
                                uid: `unsched-${planEntry.subjectId}-${group.id}-${type}-${i}`,
                                subjectId: planEntry.subjectId, groupId: group.id,
                                classType: type, teacherId, studentCount: group.studentCount,
                            });
                        }
                    }
                }
            });
        });
    });

    electives.forEach(elective => {
        const numClasses = Math.ceil(elective.hoursPerSemester / 2);
        const group = data.groups.find(g => g.id === elective.groupId);
        if (!group) return;

        for (let i = 0; i < numClasses; i++) {
            entries.push({
                uid: `unsched-elective-${elective.id}-${i}`,
                subjectId: elective.subjectId,
                groupId: elective.groupId,
                classType: ClassType.Elective,
                teacherId: elective.teacherId,
                studentCount: group.studentCount,
            });
        }
    });

    return entries;
};


export const generateScheduleWithHeuristics = async (data: GenerationData, config: HeuristicConfig): Promise<SchedulerResult> => {
    
    // --- 1. INITIALIZATION ---
    const { strictness, target, timeFrame, clearExisting } = config;
    const { teachers, groups, classrooms, subjects, timeSlots, settings } = data;

    const newSchedule: ScheduleEntry[] = [];
    const unschedulable: UnscheduledEntry[] = [];
    const softPenaltyMultiplier = strictness / 5.0; // Scale strictness from 1-10 to a multiplier

    // Grid to track resource usage: key is "resourceType-id", value is a Set of "YYYY-MM-DD-timeSlotId"
    const resourceBookings = new Map<string, Set<string>>();
    const initializeBookings = (items: (Teacher | Group | Classroom)[], type: string) => {
        items.forEach(item => resourceBookings.set(`${type}-${item.id}`, new Set()));
    };
    initializeBookings(teachers, 'teacher');
    initializeBookings(groups, 'group');
    initializeBookings(classrooms, 'classroom');
    
    // Populate with existing schedule entries that are NOT being cleared
    let existingSchedule = data.schedule;
    if (clearExisting && target) {
        existingSchedule = data.schedule.filter(entry => {
             const entryDate = new Date(entry.date + 'T00:00:00');
             const startDate = new Date(timeFrame.start + 'T00:00:00');
             const endDate = new Date(timeFrame.end + 'T00:00:00');
             if (entry.date && entryDate >= startDate && entryDate <= endDate) {
                 if (target.type === 'group' && entry.groupId === target.id) return false;
                 if (target.type === 'teacher' && entry.teacherId === target.id) return false;
                 if (target.type === 'classroom' && entry.classroomId === target.id) return false;
             }
             return true;
        });
    }

    existingSchedule.forEach(entry => {
        if (!entry.date) return; // Only consider dated entries for conflict checking
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        resourceBookings.get(`teacher-${entry.teacherId}`)?.add(bookingKey);
        resourceBookings.get(`group-${entry.groupId}`)?.add(bookingKey);
        if(entry.subgroupId) { // Also book the parent group
             resourceBookings.get(`group-${entry.groupId}`)?.add(bookingKey);
        }
        resourceBookings.get(`classroom-${entry.classroomId}`)?.add(bookingKey);
    });

    // --- 2. PREPARE CLASS POOL AND WORKDAYS ---
    let classPool = generateClassPool(data);
    const existingUids = new Set(existingSchedule.map(e => e.unscheduledUid));
    classPool = classPool.filter(e => !existingUids.has(e.uid)); // Don't try to schedule what's already there

    if (target) {
        classPool = classPool.filter(entry => {
            if (target.type === 'group') return entry.groupId === target.id;
            if (target.type === 'teacher') return entry.teacherId === target.id;
            return true; // Classroom target is a preference, not a filter
        });
    }

    classPool.sort((a, b) => getConstraintScore(b, data) - getConstraintScore(a, data));
    
    const workDays: Date[] = [];
    let currentDate = new Date(timeFrame.start + 'T00:00:00');
    const lastDate = new Date(timeFrame.end + 'T00:00:00');
    while(currentDate <= lastDate) {
        const dateStr = toYYYYMMDD(currentDate);
        const dayInfo = data.productionCalendar.find(e => e.date === dateStr);
        if (!settings.respectProductionCalendar || !dayInfo || dayInfo.isWorkDay) {
            if (currentDate.getDay() !== 0) { // Exclude Sundays
                 workDays.push(new Date(currentDate));
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // --- 3. PLACEMENT LOOP ---
    for (const entryToPlace of classPool) {
        let bestSlot: { date: Date, timeSlotId: string, classroom: Classroom, cost: number } | null = null;
        
        const parentGroup = groups.find(g => g.id === entryToPlace.groupId);
        if (!parentGroup) { unschedulable.push(entryToPlace); continue; }
        const involvedGroups = entryToPlace.streamId ? data.groups.filter(g => data.streams.find(s => s.id === entryToPlace.streamId)?.groupIds.includes(g.id)) : [parentGroup];
        if (involvedGroups.length === 0) { unschedulable.push(entryToPlace); continue; }
        
        const subject = subjects.find(s => s.id === entryToPlace.subjectId);
        if (!subject) { unschedulable.push(entryToPlace); continue; }

        const suitableClassrooms = classrooms.filter(c => c.capacity >= entryToPlace.studentCount && subject.suitableClassroomTypeIds?.includes(c.typeId));

        for (const date of workDays) {
            const dateStr = toYYYYMMDD(date);
            const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];

            for (const timeSlot of timeSlots) {
                const bookingKey = `${dateStr}-${timeSlot.id}`;
                
                // Hard constraints (pre-classroom)
                if (resourceBookings.get(`teacher-${entryToPlace.teacherId}`)?.has(bookingKey)) continue;
                if (involvedGroups.some(g => resourceBookings.get(`group-${g.id}`)?.has(bookingKey))) continue;
                if (teachers.find(t => t.id === entryToPlace.teacherId)?.availabilityGrid?.[dayName]?.[timeSlot.id] === AvailabilityType.Forbidden) continue;

                for (const classroom of suitableClassrooms) {
                    if (resourceBookings.get(`classroom-${classroom.id}`)?.has(bookingKey)) continue;
                    
                    // FIX: Pass `newSchedule` to `calculateSlotCost` to make it available in the function's scope.
                    const cost = calculateSlotCost(entryToPlace, date, timeSlot.id, classroom, involvedGroups, resourceBookings, data, softPenaltyMultiplier, newSchedule);
                    if (cost === Infinity) continue;
                    
                    if (bestSlot === null || cost < bestSlot.cost) {
                        bestSlot = { date, timeSlotId: timeSlot.id, classroom, cost };
                    }
                }
            }
        }

        if (bestSlot) {
            const bookingKey = `${toYYYYMMDD(bestSlot.date)}-${bestSlot.timeSlotId}`;
            const dayName = DAYS_OF_WEEK[bestSlot.date.getDay() === 0 ? 6 : bestSlot.date.getDay() - 1];

            const groupsToCreateEntriesFor = entryToPlace.streamId ? involvedGroups : [parentGroup];
            groupsToCreateEntriesFor.forEach(group => {
                 newSchedule.push({
                    id: `sched-h-${group.id}-${Math.random()}`,
                    day: dayName,
                    date: toYYYYMMDD(bestSlot!.date),
                    timeSlotId: bestSlot!.timeSlotId,
                    classroomId: bestSlot!.classroom.id,
                    groupId: entryToPlace.subgroupId ? entryToPlace.groupId : group.id,
                    subgroupId: entryToPlace.subgroupId,
                    subjectId: entryToPlace.subjectId,
                    teacherId: entryToPlace.teacherId,
                    classType: entryToPlace.classType,
                    deliveryMode: DeliveryMode.Offline,
                    unscheduledUid: entryToPlace.uid,
                    weekType: 'every' // Dated entries don't need week separation
                });
            });

            resourceBookings.get(`teacher-${entryToPlace.teacherId}`)?.add(bookingKey);
            resourceBookings.get(`classroom-${bestSlot.classroom.id}`)?.add(bookingKey);
            involvedGroups.forEach(g => resourceBookings.get(`group-${g.id}`)?.add(bookingKey));

        } else {
            unschedulable.push(entryToPlace);
        }
    }

    return { schedule: newSchedule, unschedulable };
};


// Determines scheduling priority. Higher score = scheduled earlier.
const getConstraintScore = (entry: UnscheduledEntry, data: GenerationData): number => {
    let score = 0;
    const { groups, subjects, teachers, teacherSubjectLinks } = data;
    const group = groups.find(g => g.id === entry.groupId);
    const subject = subjects.find(s => s.id === entry.subjectId);
    const teacher = teachers.find(t => t.id === entry.teacherId);

    if (entry.streamId) score += 200;
    if (entry.classType === ClassType.Lab) score += 100;
    if (entry.classType === ClassType.Elective) score -= 50;
    if (entry.subgroupId) score += 50;
    score += entry.studentCount * 2;

    const teacherLinkCount = teacherSubjectLinks.filter(l => l.subjectId === entry.subjectId && l.classTypes.includes(entry.classType)).length;
    if (teacherLinkCount <= 1) score += 150;
    else score -= teacherLinkCount * 5;

    if (teacher?.pinnedClassroomId) score += 30;
    if (subject?.pinnedClassroomId) score += 30;
    if (group?.pinnedClassroomId) score += 30;
    
    return score;
};

const doesConditionApply = (condition: RuleCondition, entry: UnscheduledEntry): boolean => {
    switch (condition.entityType) {
        case 'teacher':
            return condition.entityIds.includes(entry.teacherId);
        case 'group':
            return condition.entityIds.includes(entry.groupId);
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
    newSchedule: ScheduleEntry[]
): number => {
    let cost = 0;
    const { teachers, subjects, timeSlots, settings, schedulingRules } = data;
    const teacher = teachers.find(t => t.id === entry.teacherId);
    const subject = subjects.find(s => s.id === entry.subjectId);
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const dateStr = toYYYYMMDD(date);
    
    const existingOrNewBooking = (key: string, resourceFn: (g: Group) => string) => {
        const sched = [...data.schedule, ...newSchedule];
        return sched.find(e => {
            if (`${e.date}-${e.timeSlotId}` !== key) return false;
            if (involvedGroups.some(g => resourceFn(g) === `group-${e.groupId}`)) return true;
            return false;
        });
    }

    // Availability Grids
    const teacherAvailability = teacher?.availabilityGrid?.[dayName]?.[timeSlotId];
    if (teacherAvailability === AvailabilityType.Undesirable) cost += 20 * penaltyMultiplier;
    if (teacherAvailability === AvailabilityType.Desirable) cost -= 10 * penaltyMultiplier;
    involvedGroups.forEach(g => {
        const groupAvailability = g.availabilityGrid?.[dayName]?.[timeSlotId];
        if (groupAvailability === AvailabilityType.Undesirable) cost += 20 * penaltyMultiplier;
        if (groupAvailability === AvailabilityType.Desirable) cost -= 10 * penaltyMultiplier;
    });
    
    // Pinned Classrooms
    const teacherPin = teacher?.pinnedClassroomId;
    const subjectPin = subject?.pinnedClassroomId;
    const groupPins = involvedGroups.map(g => g.pinnedClassroomId).filter(Boolean);
    const isPinnedMatch = teacherPin === classroom.id || subjectPin === classroom.id || groupPins.includes(classroom.id);
    const hasAnyPin = teacherPin || subjectPin || groupPins.length > 0;
    if (hasAnyPin) {
        cost += isPinnedMatch ? -100 * penaltyMultiplier : 50 * penaltyMultiplier;
    }

    // Window Penalty
    if (!settings.allowWindows) {
        const timeSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlotId);
        const checkWindowsForResource = (resourceKey: string) => {
            const prevTimeSlot = timeSlots[timeSlotIndex - 1];
            const nextTimeSlot = timeSlots[timeSlotIndex + 1];
            const isOccupiedBefore = prevTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${prevTimeSlot.id}`) : true;
            const isOccupiedAfter = nextTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${nextTimeSlot.id}`) : true;
            const hasAnyOtherClassToday = timeSlots.some(ts => ts.id !== timeSlotId && bookings.get(resourceKey)?.has(`${dateStr}-${ts.id}`));

            if (hasAnyOtherClassToday && !isOccupiedBefore && !isOccupiedAfter) cost += 400 * penaltyMultiplier; // Isolated class
            else if (hasAnyOtherClassToday && (!isOccupiedBefore || !isOccupiedAfter)) cost += 200 * penaltyMultiplier; // Class at start/end with gap
        };
        checkWindowsForResource(`teacher-${entry.teacherId}`);
        involvedGroups.forEach(g => checkWindowsForResource(`group-${g.id}`));
    }
    
    // Day Load and Subject Duplication Penalty
    let teacherClassesOnDay = 0;
    const groupClassesOnDay = new Map<string, number>();
    involvedGroups.forEach(g => groupClassesOnDay.set(g.id, 0));

    timeSlots.forEach(ts => {
        const key = `${dateStr}-${ts.id}`;
        if (bookings.get(`teacher-${entry.teacherId}`)?.has(key)) teacherClassesOnDay++;
        involvedGroups.forEach(g => {
            if (bookings.get(`group-${g.id}`)?.has(key)) {
                groupClassesOnDay.set(g.id, (groupClassesOnDay.get(g.id) || 0) + 1);
            }
        });
        // Penalty for same subject on same day for a group
        const groupBooking = existingOrNewBooking(key, g => `group-${g.id}`);
        if(groupBooking && groupBooking.subjectId === entry.subjectId) {
            cost += 75 * penaltyMultiplier;
        }
    });

    if(teacherClassesOnDay >= 4) cost += (teacherClassesOnDay - 3) * 100 * penaltyMultiplier; // Penalize 4+ classes
    groupClassesOnDay.forEach(count => {
        if (count >= 4) cost += (count - 3) * 100 * penaltyMultiplier;
    });

    // --- NEW: Apply schedulingRules ---
    const rulePenaltyMap = {
        [RuleSeverity.Strict]: 1_000_000,
        [RuleSeverity.Strong]: 500 * penaltyMultiplier,
        [RuleSeverity.Medium]: 100 * penaltyMultiplier,
        [RuleSeverity.Weak]: 20 * penaltyMultiplier,
    };

    for (const rule of schedulingRules) {
        const conditionA = rule.conditions[0];
        if (!conditionA || !doesConditionApply(conditionA, entry)) {
            continue;
        }
        const penalty = rulePenaltyMap[rule.severity] || 0;
        if (penalty >= 1_000_000 && rule.severity === RuleSeverity.Strict) {
            if (rule.action === RuleAction.AvoidTime && rule.day === dayName && rule.timeSlotId === timeSlotId) return Infinity;
        }

        switch (rule.action) {
            case RuleAction.AvoidTime:
                if (rule.day === dayName && rule.timeSlotId === timeSlotId) {
                    cost += penalty;
                }
                break;
            case RuleAction.PreferTime:
                if (rule.day === dayName && rule.timeSlotId === timeSlotId) {
                    cost -= penalty;
                }
                break;
            case RuleAction.MaxPerDay:
                if (rule.param !== undefined) {
                    const dayBookings = [...data.schedule, ...newSchedule].filter(e => e.date === dateStr);
                    let count = dayBookings.filter(booking => {
                        switch (conditionA.entityType) {
                            case 'teacher': return conditionA.entityIds.includes(booking.teacherId);
                            case 'group': return conditionA.entityIds.includes(booking.groupId);
                            case 'subject': return conditionA.entityIds.includes(booking.subjectId) && (!conditionA.classType || conditionA.classType === booking.classType);
                            default: return false;
                        }
                    }).length;
                    
                    if (count >= rule.param) {
                        cost += penalty;
                    }
                }
                break;
        }
    }

    // Prefer weekdays over Saturday
    if (date.getDay() === 6) { // Saturday
        cost += 25 * penaltyMultiplier;
    }

    return cost;
};