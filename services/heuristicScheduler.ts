
import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS, 
    Specialty, EducationalPlan, UnscheduledEntry, AvailabilityType, WeekType, DeliveryMode, ClassroomType, Subgroup, Elective
} from '../types';
import { DAYS_OF_WEEK } from '../constants';

interface GenerationData {
  teachers: Teacher[];
  groups: Group[];
  classrooms: Classroom[];
  subjects: Subject[];
  streams: Stream[];
  timeSlots: TimeSlot[];
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
}

interface SchedulerResult {
    schedule: ScheduleEntry[];
    unschedulable: UnscheduledEntry[];
}

// Generates the initial pool of classes to be scheduled from educational plans
const generateClassPool = (data: GenerationData): UnscheduledEntry[] => {
    const entries: UnscheduledEntry[] = [];
    const currentSemester = 1; // This should ideally come from settings

    const groupToStreamMap = new Map<string, string>();
    data.streams.forEach(stream => {
        stream.groupIds.forEach(groupId => {
            groupToStreamMap.set(groupId, stream.id);
        });
    });

    data.groups.forEach(group => {
        const plan = data.educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        const groupSubgroups = data.subgroups.filter(sg => sg.parentGroupId === group.id);
        const relevantEntries = plan.entries.filter(e => e.semester === currentSemester);

        relevantEntries.forEach(planEntry => {
            const processEntry = (
                targetGroupId: string, 
                targetSubgroupId: string | undefined, 
                studentCount: number, 
                streamId: string | undefined
            ) => {
                 const classTypes = [
                    { type: ClassType.Lecture, hours: planEntry.lectureHours },
                    { type: ClassType.Practical, hours: planEntry.practiceHours },
                    { type: ClassType.Lab, hours: planEntry.labHours },
                ];
                classTypes.forEach(({ type, hours }) => {
                    if (hours <= 0) return;
                    
                    let teacherId: string | undefined;
                    const subgroup = targetSubgroupId ? data.subgroups.find(sg => sg.id === targetSubgroupId) : undefined;
                    
                    // 1. Check for a specific teacher assignment in the subgroup
                    const assignment = subgroup?.teacherAssignments?.find(a => a.subjectId === planEntry.subjectId && a.classType === type);

                    if (assignment) {
                        teacherId = assignment.teacherId;
                    } else {
                        // 2. Fallback to the general list of available teachers
                        const validTeacherIds = data.teacherSubjectLinks
                            .filter(link => link.subjectId === planEntry.subjectId && link.classTypes.includes(type))
                            .map(link => link.teacherId);
                        
                        if (validTeacherIds.length > 0) {
                            teacherId = validTeacherIds[0]; // Take the first available
                        }
                    }

                    if (teacherId) {
                        const numClasses = Math.ceil(hours / 2);
                        for (let i = 0; i < numClasses; i++) {
                            const uidSuffix = targetSubgroupId ? `${targetSubgroupId}-${type}-${i}` : `${targetGroupId}-${type}-${i}`;
                            entries.push({
                                uid: `unsched-plan-${planEntry.subjectId}-${uidSuffix}`,
                                subjectId: planEntry.subjectId,
                                groupId: targetGroupId,
                                subgroupId: targetSubgroupId,
                                classType: type,
                                teacherId: teacherId,
                                streamId: streamId,
                                studentCount: studentCount,
                            });
                        }
                    }
                });
            };
            
            if (planEntry.splitForSubgroups && groupSubgroups.length > 0) {
                 groupSubgroups.forEach(subgroup => {
                    processEntry(group.id, subgroup.id, subgroup.studentCount, undefined);
                });
            } else {
                 processEntry(group.id, undefined, group.studentCount, groupToStreamMap.get(group.id));
            }
        });
    });

    data.electives.forEach(elective => {
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


export const generateScheduleWithHeuristics = async (data: GenerationData): Promise<SchedulerResult> => {
    
    // --- 1. INITIALIZATION ---
    let classPool = generateClassPool(data);
    const finalSchedule: ScheduleEntry[] = [];
    const unschedulable: UnscheduledEntry[] = [];

    // Grid to track resource usage: key is "resourceType-id", value is a Set of "day-timeSlotId-weekType"
    const resourceBookings = new Map<string, Set<string>>();
    const initializeBookings = (items: (Teacher | Group | Classroom)[], type: string) => {
        items.forEach(item => resourceBookings.set(`${type}-${item.id}`, new Set()));
    };
    initializeBookings(data.teachers, 'teacher');
    initializeBookings(data.groups, 'group');
    initializeBookings(data.classrooms, 'classroom');

    // --- 2. HELPER FUNCTIONS ---

    // Helper to check bookings considering the 'every' week type
    const isResourceBooked = (resourceKey: string, day: string, timeSlotId: string, weekType: WeekType): boolean => {
        const bookingSet = resourceBookings.get(resourceKey);
        if (!bookingSet) return false;
        if (bookingSet.has(`${day}-${timeSlotId}-every`)) return true;
        if (weekType === 'every') {
            return bookingSet.has(`${day}-${timeSlotId}-odd`) || bookingSet.has(`${day}-${timeSlotId}-even`);
        }
        return bookingSet.has(`${day}-${timeSlotId}-${weekType}`);
    };

    // Calculates the "cost" of placing a class in a specific slot. Lower cost is better.
    const calculateSlotCost = (
        entry: UnscheduledEntry,
        day: string,
        timeSlotId: string,
        classroom: Classroom,
        involvedGroups: Group[],
    ): number => {
        let cost = 0;
        const { teachers, subjects, timeSlots, settings } = data;
        const teacher = teachers.find(t => t.id === entry.teacherId);
        const subject = subjects.find(s => s.id === entry.subjectId);
        
        // Cost factor 1: Availability Grids (Desirability)
        const teacherAvailability = teacher?.availabilityGrid?.[day]?.[timeSlotId];
        if (teacherAvailability === AvailabilityType.Undesirable) cost += 20;
        if (teacherAvailability === AvailabilityType.Desirable) cost -= 10;
        involvedGroups.forEach(g => {
            const groupAvailability = g.availabilityGrid?.[day]?.[timeSlotId];
            if (groupAvailability === AvailabilityType.Undesirable) cost += 20;
            if (groupAvailability === AvailabilityType.Desirable) cost -= 10;
        });
        
        // Cost factor 2: Pinned Classrooms (Strong preference)
        const teacherPin = teacher?.pinnedClassroomId;
        const subjectPin = subject?.pinnedClassroomId;
        const groupPins = involvedGroups.map(g => g.pinnedClassroomId).filter(Boolean);
        const isPinnedMatch = teacherPin === classroom.id || subjectPin === classroom.id || groupPins.includes(classroom.id);
        const hasAnyPin = teacherPin || subjectPin || groupPins.length > 0;
        if (hasAnyPin) {
            cost += isPinnedMatch ? -100 : 50; // Big reward for matching, penalty for ignoring
        }

        // Cost factor 3: Window Penalty (if windows are disallowed)
        if (!settings.allowWindows) {
            const timeSlotIndex = timeSlots.findIndex(ts => ts.id === timeSlotId);
            const checkWindowsForResource = (resourceKey: string) => {
                const prevTimeSlot = timeSlots[timeSlotIndex - 1];
                const nextTimeSlot = timeSlots[timeSlotIndex + 1];
                const isOccupiedBefore = prevTimeSlot ? isResourceBooked(resourceKey, day, prevTimeSlot.id, 'every') : true;
                const isOccupiedAfter = nextTimeSlot ? isResourceBooked(resourceKey, day, nextTimeSlot.id, 'every') : true;
                if (!isOccupiedBefore && timeSlots.slice(0, timeSlotIndex).some(ts => isResourceBooked(resourceKey, day, ts.id, 'every'))) cost += 200;
                if (!isOccupiedAfter && timeSlots.slice(timeSlotIndex + 1).some(ts => isResourceBooked(resourceKey, day, ts.id, 'every'))) cost += 200;
            };
            checkWindowsForResource(`teacher-${entry.teacherId}`);
            involvedGroups.forEach(g => checkWindowsForResource(`group-${g.id}`));
        }
        
        // Cost factor 4: Day Load Balancing (slight preference for less busy days)
        const countTeacherClassesOnDay = timeSlots.reduce((count, ts) => isResourceBooked(`teacher-${entry.teacherId}`, day, ts.id, 'every') ? count + 1 : count, 0);
        cost += countTeacherClassesOnDay * 5;

        return cost;
    };

    // Determines the scheduling priority. Higher score = scheduled earlier.
    const getConstraintScore = (entry: UnscheduledEntry): number => {
        let score = 0;
        const group = data.groups.find(g => g.id === entry.groupId);
        const subject = data.subjects.find(s => s.id === entry.subjectId);
        const teacher = data.teachers.find(t => t.id === entry.teacherId);

        if (entry.streamId) score += 200; // Streamed lectures are very constraining
        if (entry.classType === ClassType.Lab) score += 100; // Labs require specific rooms
        if (entry.classType === ClassType.Elective) score -= 50; // Electives are less critical than core curriculum
        if (entry.subgroupId) score += 50; // Subgroup classes can be tricky
        score += entry.studentCount * 2;

        const teacherLinkCount = data.teacherSubjectLinks.filter(l => l.subjectId === entry.subjectId && l.classTypes.includes(entry.classType)).length;
        if (teacherLinkCount <= 1) score += 150; // Only one teacher can teach this, high priority
        else score -= teacherLinkCount * 5;

        if (teacher?.pinnedClassroomId) score += 30;
        if (subject?.pinnedClassroomId) score += 30;
        if (group?.pinnedClassroomId) score += 30;
        
        return score;
    };
    
    // --- 3. PRIORITIZATION ---
    classPool.sort((a, b) => getConstraintScore(b) - getConstraintScore(a));
    
    // --- 4. PLACEMENT LOOP ---
    for (const entryToPlace of classPool) {
        let bestSlot: { day: string, timeSlotId: string, weekType: WeekType, classroom: Classroom, cost: number } | null = null;
        
        const parentGroup = data.groups.find(g => g.id === entryToPlace.groupId);
        if (!parentGroup) {
            unschedulable.push(entryToPlace);
            continue;
        }

        const involvedGroups = entryToPlace.streamId 
            ? data.groups.filter(g => data.streams.find(s => s.id === entryToPlace.streamId)?.groupIds.includes(g.id))
            : [parentGroup];
        
        if (involvedGroups.length === 0) {
            unschedulable.push(entryToPlace);
            continue;
        }
        
        const totalStudents = entryToPlace.streamId
            ? involvedGroups.reduce((sum, g) => sum + g.studentCount, 0)
            : entryToPlace.studentCount; // Use the count from the entry itself (could be subgroup or group)

        const subject = data.subjects.find(s => s.id === entryToPlace.subjectId);
        if (!subject) {
            unschedulable.push(entryToPlace);
            continue;
        }

        // Pre-filter classrooms to reduce search space
        const suitableClassrooms = data.classrooms.filter(c => {
            if (c.capacity < totalStudents) return false;
            return subject.suitableClassroomTypeIds?.includes(c.typeId);
        });

        // Iterate through all possibilities to find the lowest-cost slot
        for (const day of DAYS_OF_WEEK) {
            for (const timeSlot of data.timeSlots) {
                const weekTypes: WeekType[] = data.settings.useEvenOddWeekSeparation ? ['odd', 'even'] : ['every'];
                for (const weekType of weekTypes) {
                    
                    // --- Hard Constraint Checks (Pre-Classroom) ---
                    if (isResourceBooked(`teacher-${entryToPlace.teacherId}`, day, timeSlot.id, weekType)) continue;
                    if (involvedGroups.some(g => isResourceBooked(`group-${g.id}`, day, timeSlot.id, weekType))) continue;
                    if (data.teachers.find(t=>t.id === entryToPlace.teacherId)?.availabilityGrid?.[day]?.[timeSlot.id] === AvailabilityType.Forbidden) continue;
                    if (involvedGroups.some(g => g.availabilityGrid?.[day]?.[timeSlot.id] === AvailabilityType.Forbidden)) continue;
                    
                    for (const classroom of suitableClassrooms) {
                        // --- Hard Constraint Checks (Classroom-Specific) ---
                        if (isResourceBooked(`classroom-${classroom.id}`, day, timeSlot.id, weekType)) continue;

                        // --- Cost Calculation for this valid slot ---
                        const cost = calculateSlotCost(entryToPlace, day, timeSlot.id, classroom, involvedGroups);
                        
                        if (bestSlot === null || cost < bestSlot.cost) {
                            bestSlot = { day, timeSlotId: timeSlot.id, weekType, classroom, cost };
                        }
                    }
                }
            }
        }

        // --- 5. COMMIT PLACEMENT ---
        if (bestSlot) {
            const slotKey = `${bestSlot.day}-${bestSlot.timeSlotId}-${bestSlot.weekType}`;
            
            // For subgroup entries, we push one schedule item but book all parent groups as busy.
            // For stream entries, we push one schedule item for each group.
            const groupsToCreateEntriesFor = entryToPlace.streamId ? involvedGroups : [parentGroup];
            
            groupsToCreateEntriesFor.forEach(group => {
                finalSchedule.push({
                    id: `sched-${group.id}-${Math.random()}`,
                    ...bestSlot,
                    classroomId: bestSlot.classroom.id,
                    groupId: entryToPlace.subgroupId ? entryToPlace.groupId : group.id,
                    subgroupId: entryToPlace.subgroupId,
                    subjectId: entryToPlace.subjectId,
                    teacherId: entryToPlace.teacherId,
                    classType: entryToPlace.classType,
                    deliveryMode: DeliveryMode.Offline,
                    unscheduledUid: entryToPlace.uid,
                });
            });

            // Update resource bookings for all involved resources
            resourceBookings.get(`teacher-${entryToPlace.teacherId}`)?.add(slotKey);
            resourceBookings.get(`classroom-${bestSlot.classroom.id}`)?.add(slotKey);
            involvedGroups.forEach(g => resourceBookings.get(`group-${g.id}`)?.add(slotKey));

        } else {
            unschedulable.push(entryToPlace);
        }
    }

    return { schedule: finalSchedule, unschedulable };
};
