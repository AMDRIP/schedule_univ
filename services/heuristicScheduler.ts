import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS, 
    Specialty, EducationalPlan, UnscheduledEntry, AvailabilityType, WeekType, DeliveryMode, ClassroomType, Subgroup, Elective, HeuristicConfig,
    RuleSeverity, RuleAction, RuleCondition
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { getWeekNumber, toYYYYMMDD } from '../utils/dateUtils';

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

export interface SchedulerResult {
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

    const processedGroupLectures = new Set<string>(); // key: `${subjectId}-${groupId}` to track handled groups

    groups.forEach(group => {
        const plan = educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        const groupSubgroups = subgroups.filter(sg => sg.parentGroupId === group.id);
        const relevantEntries = plan.entries.filter(e => e.semester === currentSemester);

        relevantEntries.forEach(planEntry => {
            let teacherId: string | undefined;

             // 1. Handle Lectures
            if (planEntry.lectureHours > 0 && !processedGroupLectures.has(`${planEntry.subjectId}-${group.id}`)) {
                const numClasses = Math.ceil(planEntry.lectureHours / 2);
                const streamId = groupToStreamMap.get(group.id);

                let lectureGroups: Group[] = [group];
                
                // If in a stream, find all other groups in that stream with the same lecture
                if (streamId) {
                    const stream = streams.find(s => s.id === streamId)!;
                    const otherStreamGroups = groups.filter(g => stream.groupIds.includes(g.id) && g.id !== group.id);

                    otherStreamGroups.forEach(otherGroup => {
                        const otherPlan = educationalPlans.find(p => p.specialtyId === otherGroup.specialtyId);
                        if (otherPlan && otherPlan.entries.some(e => e.semester === currentSemester && e.subjectId === planEntry.subjectId && e.lectureHours > 0)) {
                            lectureGroups.push(otherGroup);
                        }
                    });
                }
                
                teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
                if (teacherId) {
                    const studentCount = lectureGroups.reduce((sum, g) => sum + g.studentCount, 0);
                    const groupIds = lectureGroups.map(g => g.id);
                    
                    for (let i = 0; i < numClasses; i++) {
                        const entry: UnscheduledEntry = {
                            uid: `unsched-${planEntry.subjectId}-${groupIds.join('_')}-${ClassType.Lecture}-${i}`,
                            subjectId: planEntry.subjectId,
                            classType: ClassType.Lecture,
                            teacherId,
                            studentCount,
                        };
                        if (lectureGroups.length > 1) {
                            entry.groupIds = groupIds;
                            // Check if this is a full stream lecture
                            const stream = streams.find(s => s.id === streamId);
                            if(stream && stream.groupIds.length === groupIds.length){
                                entry.streamId = streamId;
                            }
                        } else {
                            entry.groupId = group.id;
                        }
                        entries.push(entry);
                    }
                }
                
                // Mark all participating groups as processed for this subject's lecture
                lectureGroups.forEach(g => processedGroupLectures.add(`${planEntry.subjectId}-${g.id}`));
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
                        teacherId = assignment?.teacherId ?? teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
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
                    teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(type))?.teacherId;
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
    const { strictness, target, timeFrame, clearExisting, enforceLectureOrder, distributeEvenly } = config;
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
             if (!entry.date) return true;
             const entryDate = new Date(entry.date + 'T00:00:00');
             const startDate = new Date(timeFrame.start + 'T00:00:00');
             const endDate = new Date(timeFrame.end + 'T00:00:00');
             if (entryDate >= startDate && entryDate <= endDate) {
                if (target.type === 'group') {
                    if(entry.groupId === target.id) return false;
                    if(entry.groupIds?.includes(target.id)) return false;
                 }
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
        if(entry.groupIds) {
            entry.groupIds.forEach(gid => resourceBookings.get(`group-${gid}`)?.add(bookingKey));
        } else if (entry.groupId) {
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
            if (target.type === 'group') {
                return entry.groupId === target.id || (entry.groupIds || []).includes(target.id);
            }
            if (target.type === 'teacher') return entry.teacherId === target.id;
            return true; // Classroom target is a preference, not a filter
        });
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
        let bestSlots: { date: Date, timeSlotId: string, classroom: Classroom, cost: number }[] = [];
        const TOP_N_CANDIDATES = 5;
        
        const involvedGroupIds = entryToPlace.groupIds || (entryToPlace.groupId ? [entryToPlace.groupId] : []);
        if (involvedGroupIds.length === 0) { unschedulable.push(entryToPlace); continue; }
        const involvedGroups = groups.filter(g => involvedGroupIds.includes(g.id));
        if (involvedGroups.length !== involvedGroupIds.length) { unschedulable.push(entryToPlace); continue; }
        
        const subject = subjects.find(s => s.id === entryToPlace.subjectId);
        if (!subject) { unschedulable.push(entryToPlace); continue; }
        
        const requiredClassroomTypes = subject?.classroomTypeRequirements?.[entryToPlace.classType];
        if (!requiredClassroomTypes || requiredClassroomTypes.length === 0) {
            unschedulable.push(entryToPlace);
            continue;
        }

        const suitableClassrooms = classrooms.filter(c => {
            if (c.capacity < entryToPlace.studentCount) return false;
            if (!requiredClassroomTypes.includes(c.typeId)) return false;

            const requiredTags = subject.requiredClassroomTagIds || [];
            if (requiredTags.length > 0) {
                const classroomTags = c.tagIds || [];
                if (!requiredTags.every(tagId => classroomTags.includes(tagId))) {
                    return false;
                }
            }
            return true;
        });

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
                    
                    const cost = calculateSlotCost(entryToPlace, date, timeSlot.id, classroom, involvedGroups, resourceBookings, data, softPenaltyMultiplier, newSchedule, config);
                    if (cost === Infinity) continue;
                    
                    if (bestSlots.length < TOP_N_CANDIDATES) {
                        bestSlots.push({ date, timeSlotId: timeSlot.id, classroom, cost });
                        bestSlots.sort((a, b) => a.cost - b.cost);
                    } else if (cost < bestSlots[TOP_N_CANDIDATES - 1].cost) {
                        bestSlots[TOP_N_CANDIDATES - 1] = { date, timeSlotId: timeSlot.id, classroom, cost };
                        bestSlots.sort((a, b) => a.cost - b.cost);
                    }
                }
            }
        }

        if (bestSlots.length > 0) {
            const chosenSlot = bestSlots[Math.floor(Math.random() * bestSlots.length)];
            const bookingKey = `${toYYYYMMDD(chosenSlot.date)}-${chosenSlot.timeSlotId}`;
            const dayName = DAYS_OF_WEEK[chosenSlot.date.getDay() === 0 ? 6 : chosenSlot.date.getDay() - 1];

            const newEntry: ScheduleEntry = {
                id: `sched-h-${entryToPlace.uid}-${Math.random()}`,
                day: dayName,
                date: toYYYYMMDD(chosenSlot.date),
                timeSlotId: chosenSlot.timeSlotId,
                classroomId: chosenSlot.classroom.id,
                groupId: entryToPlace.groupId,
                groupIds: entryToPlace.groupIds,
                subgroupId: entryToPlace.subgroupId,
                streamId: entryToPlace.streamId,
                subjectId: entryToPlace.subjectId,
                teacherId: entryToPlace.teacherId,
                classType: entryToPlace.classType,
                deliveryMode: DeliveryMode.Offline,
                unscheduledUid: entryToPlace.uid,
                weekType: 'every' // Dated entries don't need week separation
            };
            newSchedule.push(newEntry);

            resourceBookings.get(`teacher-${entryToPlace.teacherId}`)?.add(bookingKey);
            resourceBookings.get(`classroom-${chosenSlot.classroom.id}`)?.add(bookingKey);
            involvedGroups.forEach(g => resourceBookings.get(`group-${g.id}`)?.add(bookingKey));

        } else {
            unschedulable.push(entryToPlace);
        }
    }

    // --- 4. REFINEMENT PHASE ---
    if (newSchedule.length > 0) {
        console.log(`Initial placement finished. ${newSchedule.length} entries placed. Starting refinement.`);
        const refinedSchedule = await refineSchedule(newSchedule, data, config, resourceBookings);
        return { schedule: refinedSchedule, unschedulable };
    }


    return { schedule: newSchedule, unschedulable };
};


// Determines scheduling priority. Higher score = scheduled earlier.
const getConstraintScore = (entry: UnscheduledEntry, data: GenerationData): number => {
    let score = 0;
    const { groups, subjects, teachers, teacherSubjectLinks } = data;
    const group = groups.find(g => g.id === (entry.groupId || entry.groupIds?.[0]));
    const subject = subjects.find(s => s.id === entry.subjectId);
    const teacher = teachers.find(t => t.id === entry.teacherId);

    if (entry.streamId || (entry.groupIds && entry.groupIds.length > 1)) score += 200;
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
    const groupIds = entry.groupIds || (entry.groupId ? [entry.groupId] : []);
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
    config: HeuristicConfig
): number => {
    let cost = 0;
    const { teachers, subjects, timeSlots, settings, schedulingRules } = data;
    const { enforceLectureOrder, distributeEvenly } = config;
    const teacher = teachers.find(t => t.id === entry.teacherId);
    const subject = subjects.find(s => s.id === entry.subjectId);
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const dateStr = toYYYYMMDD(date);
    
    const allBookingsTodayForGroups = [...data.schedule, ...newSchedule].filter(e => {
        if (e.date !== dateStr) return false;
        const entryGroupIds = e.groupIds || (e.groupId ? [e.groupId] : []);
        return entryGroupIds.some(gid => involvedGroups.some(ig => ig.id === gid));
    });

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
    if (!settings.allowWindows || (settings.enforceStandardRules && involvedGroups.some(g => g.course === 1))) {
        const timeSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlotId);
        const checkWindowsForResource = (resourceKey: string, isFirstYear: boolean) => {
            const prevTimeSlot = timeSlots[timeSlotIndex - 1];
            const nextTimeSlot = timeSlots[timeSlotIndex + 1];
            const isOccupiedBefore = prevTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${prevTimeSlot.id}`) : true;
            const isOccupiedAfter = nextTimeSlot ? bookings.get(resourceKey)?.has(`${dateStr}-${nextTimeSlot.id}`) : true;
            const hasAnyOtherClassToday = timeSlots.some(ts => ts.id !== timeSlotId && bookings.get(resourceKey)?.has(`${dateStr}-${ts.id}`));

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
    const teacherBookingsToday = [...data.schedule, ...newSchedule].filter(e => e.teacherId === teacher?.id && e.date === dateStr);
    const teacherClassesOnDay = teacherBookingsToday.length;

    if(settings.enforceStandardRules && teacherClassesOnDay >= 4) {
        cost += (teacherClassesOnDay - 3) * 150 * penaltyMultiplier;
    }

    // FIX: Define groupClassesOnDay to calculate class load per group.
    const groupClassesOnDay = involvedGroups.map(group => {
        return [...data.schedule, ...newSchedule].filter(e => {
            if (e.date !== dateStr) return false;
            const entryGroupIds = e.groupIds || (e.groupId ? [e.groupId] : []);
            return entryGroupIds.includes(group.id);
        }).length;
    });

    groupClassesOnDay.forEach(count => {
        if(settings.enforceStandardRules && count >= 5) {
            cost += (count - 4) * 200 * penaltyMultiplier;
        } else if (count >= 4) {
            cost += (count - 3) * 100 * penaltyMultiplier;
        }
    });

    if(settings.enforceStandardRules) {
        // Penalty for same subject on same day for a group
        if(allBookingsTodayForGroups.some(b => b.subjectId === entry.subjectId)) {
            cost += 75 * penaltyMultiplier;
        }
    }
    

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
                    const count = allBookingsTodayForGroups.filter(booking => {
                        switch (conditionA.entityType) {
                            case 'teacher': return conditionA.entityIds.includes(booking.teacherId);
                            case 'group': return (booking.groupIds || [booking.groupId]).some(gid => gid && conditionA.entityIds.includes(gid));
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

    // --- NEW: Apply Standard Rules if enabled ---
    if(settings.enforceStandardRules) {
        // Rule: No lectures after labs/practicals (of other subjects)
        if(entry.classType === ClassType.Lecture) {
            const timeSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlotId);
            const previousSlots = timeSlots.slice(0, timeSlotIndex);
            const hasPracticeBefore = previousSlots.some(slot => 
                allBookingsTodayForGroups.some(b => 
                    b.timeSlotId === slot.id &&
                    (b.classType === ClassType.Practical || b.classType === ClassType.Lab) &&
                    b.subjectId !== entry.subjectId
                )
            );
            if(hasPracticeBefore) {
                cost += 350 * penaltyMultiplier;
            }
        }
        
        // Rule: Max 3-4 consecutive classes for teacher
        const teacherBookingIndices = teacherBookingsToday
            .map(e => timeSlots.findIndex(ts => ts.id === e.timeSlotId));
        teacherBookingIndices.push(timeSlots.findIndex(ts => ts.id === timeSlotId));
        teacherBookingIndices.sort((a,b) => a-b);
        
        let maxConsecutive = 0;
        if(teacherBookingIndices.length > 0) {
            let currentConsecutive = 1;
            maxConsecutive = 1;
            for(let i=1; i<teacherBookingIndices.length; i++) {
                if(teacherBookingIndices[i] === teacherBookingIndices[i-1] + 1) {
                    currentConsecutive++;
                } else {
                    currentConsecutive = 1;
                }
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            }
        }
        if(maxConsecutive > 3) { // Penalize 4 or more
             cost += (maxConsecutive - 3) * 150 * penaltyMultiplier;
        }

        // Rule: First pair on Monday is for optimists
        if (dayName === 'Понедельник' && timeSlots.findIndex(ts => ts.id === timeSlotId) === 0) {
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

    // Lecture-Practice Order Penalty
    if (enforceLectureOrder) {
        const timeSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlotId);

        if (entry.classType === ClassType.Practical || entry.classType === ClassType.Lab) {
            const lecturesToday = allBookingsTodayForGroups.filter(e => e.subjectId === entry.subjectId && e.classType === ClassType.Lecture);
            if (lecturesToday.length > 0) {
                const earliestLectureIndex = Math.min(...lecturesToday.map(e => timeSlots.findIndex(ts => ts.id === e.timeSlotId)));
                if (timeSlotIndex < earliestLectureIndex) {
                    cost += 300 * penaltyMultiplier;
                }
            }
        } else if (entry.classType === ClassType.Lecture) {
            const practicesToday = allBookingsTodayForGroups.filter(e => e.subjectId === entry.subjectId && (e.classType === ClassType.Practical || e.classType === ClassType.Lab));
            if (practicesToday.length > 0) {
                const latestPracticeIndex = Math.max(...practicesToday.map(e => timeSlots.findIndex(ts => ts.id === e.timeSlotId)));
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


async function refineSchedule(
    initialSchedule: ScheduleEntry[],
    data: GenerationData,
    config: HeuristicConfig,
    initialBookings: Map<string, Set<string>>
): Promise<ScheduleEntry[]> {
    console.log("Starting schedule refinement phase...");
    let refinedSchedule = [...initialSchedule];
    const resourceBookings = new Map(Array.from(initialBookings.entries()).map(([key, value]) => [key, new Set(value)]));
    
    const REFINEMENT_PASSES = 3;
    const REFINEMENT_CANDIDATE_PERCENTAGE = 0.3; // Check the worst 30% of entries

    const workDays: Date[] = [];
    let currentDateIterator = new Date(config.timeFrame.start + 'T00:00:00');
    const lastDate = new Date(config.timeFrame.end + 'T00:00:00');
    while(currentDateIterator <= lastDate) {
        const dateStr = toYYYYMMDD(currentDateIterator);
        const dayInfo = data.productionCalendar.find(e => e.date === dateStr);
        if (!data.settings.respectProductionCalendar || !dayInfo || dayInfo.isWorkDay) {
            if (currentDateIterator.getDay() !== 0) { // Exclude Sundays
                 workDays.push(new Date(currentDateIterator));
            }
        }
        currentDateIterator.setDate(currentDateIterator.getDate() + 1);
    }

    for (let pass = 0; pass < REFINEMENT_PASSES; pass++) {
        const entriesWithCosts = refinedSchedule.map(entry => {
            const involvedGroups = data.groups.filter(g => (entry.groupIds || (entry.groupId ? [entry.groupId] : [])).includes(g.id));
            const subGroup = data.subgroups.find(sg => sg.id === entry.subgroupId);
            const studentCount = subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);

            // FIX: Explicitly create an UnscheduledEntry from the ScheduleEntry to match the function signature.
            // This resolves the type error.
            const cost = calculateSlotCost(
                // FIX: Convert ScheduleEntry to UnscheduledEntry-like object for cost calculation.
                // Added 'uid' and cast through 'unknown' to satisfy the type.
                { ...entry, studentCount, uid: entry.unscheduledUid! } as unknown as UnscheduledEntry,
                new Date(entry.date + 'T00:00:00'),
                entry.timeSlotId,
                data.classrooms.find(c => c.id === entry.classroomId)!,
                involvedGroups,
                resourceBookings,
                data,
                config.strictness / 5.0,
                refinedSchedule.filter(e => e.id !== entry.id), // Pass schedule without the current entry
                config
            );
            return { entry, cost };
        }).filter(item => item.cost > 0);

        if (entriesWithCosts.length === 0) {
            console.log("No entries with positive cost. Refinement finished early.");
            break;
        }

        entriesWithCosts.sort((a, b) => b.cost - a.cost);
        const candidatesToRefine = entriesWithCosts.slice(0, Math.ceil(entriesWithCosts.length * REFINEMENT_CANDIDATE_PERCENTAGE));

        let improvementsThisPass = 0;

        for (const { entry: entryToMove, cost: currentCost } of candidatesToRefine) {
            const currentEntryInSchedule = refinedSchedule.find(e => e.id === entryToMove.id);
            if (!currentEntryInSchedule) continue;

            const originalBookingKey = `${currentEntryInSchedule.date}-${currentEntryInSchedule.timeSlotId}`;
            resourceBookings.get(`teacher-${currentEntryInSchedule.teacherId}`)?.delete(originalBookingKey);
            resourceBookings.get(`classroom-${currentEntryInSchedule.classroomId}`)?.delete(originalBookingKey);
            (currentEntryInSchedule.groupIds || [currentEntryInSchedule.groupId]).forEach(gid => {
                if (gid) resourceBookings.get(`group-${gid}`)?.delete(originalBookingKey);
            });

            let bestAlternativeSlot: { date: Date, timeSlotId: string, classroom: Classroom, cost: number } | null = null;
            
            const involvedGroups = data.groups.filter(g => (entryToMove.groupIds || (entryToMove.groupId ? [entryToMove.groupId] : [])).includes(g.id));
            const subGroup = data.subgroups.find(sg => sg.id === entryToMove.subgroupId);
            const studentCount = subGroup ? subGroup.studentCount : involvedGroups.reduce((sum, g) => sum + g.studentCount, 0);
            
            // FIX: Explicitly create an UnscheduledEntry from the ScheduleEntry to match function signatures.
            // This resolves the type error.
            const unscheduledVersion = { ...entryToMove, studentCount, uid: entryToMove.unscheduledUid! } as unknown as UnscheduledEntry;

            const subject = data.subjects.find(s => s.id === unscheduledVersion.subjectId);
            if (!subject) continue;
            const requiredClassroomTypes = subject?.classroomTypeRequirements?.[unscheduledVersion.classType] || [];
            
            const suitableClassrooms = data.classrooms.filter(c => {
                 if (c.capacity < unscheduledVersion.studentCount) return false;
                 if (!requiredClassroomTypes.includes(c.typeId)) return false;
                 const requiredTags = subject.requiredClassroomTagIds || [];
                 if (requiredTags.length > 0) {
                     const classroomTags = c.tagIds || [];
                     if (!requiredTags.every(tagId => classroomTags.includes(tagId))) return false;
                 }
                 return true;
            });
            
            for (const date of workDays) {
                for (const timeSlot of data.timeSlots) {
                    const bookingKey = `${toYYYYMMDD(date)}-${timeSlot.id}`;
                    if (resourceBookings.get(`teacher-${unscheduledVersion.teacherId}`)?.has(bookingKey)) continue;
                    if (involvedGroups.some(g => resourceBookings.get(`group-${g.id}`)?.has(bookingKey))) continue;
                    
                    for (const classroom of suitableClassrooms) {
                        if (resourceBookings.get(`classroom-${classroom.id}`)?.has(bookingKey)) continue;

                        const cost = calculateSlotCost(unscheduledVersion, date, timeSlot.id, classroom, involvedGroups, resourceBookings, data, config.strictness / 5.0, refinedSchedule.filter(e => e.id !== entryToMove.id), config);

                        if (cost < (bestAlternativeSlot?.cost ?? Infinity)) {
                            bestAlternativeSlot = { date, timeSlotId: timeSlot.id, classroom, cost };
                        }
                    }
                }
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
                    };

                    const newBookingKey = `${toYYYYMMDD(newEntryData.date)}-${newEntryData.timeSlotId}`;
                    resourceBookings.get(`teacher-${entryToMove.teacherId}`)?.add(newBookingKey);
                    resourceBookings.get(`classroom-${newEntryData.classroom.id}`)?.add(newBookingKey);
                    (entryToMove.groupIds || [entryToMove.groupId]).forEach(gid => {
                        if (gid) resourceBookings.get(`group-${gid}`)?.add(newBookingKey);
                    });
                }
            } else {
                resourceBookings.get(`teacher-${currentEntryInSchedule.teacherId}`)?.add(originalBookingKey);
                resourceBookings.get(`classroom-${currentEntryInSchedule.classroomId}`)?.add(originalBookingKey);
                (currentEntryInSchedule.groupIds || [currentEntryInSchedule.groupId]).forEach(gid => {
                    if (gid) resourceBookings.get(`group-${gid}`)?.add(originalBookingKey);
                });
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