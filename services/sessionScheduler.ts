import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, ProductionCalendarEvent, Specialty, EducationalPlan, 
    AvailabilityType, DeliveryMode, ClassroomType, Subgroup, SessionSchedulerConfig, AttestationType
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD } from '../utils/dateUtils';

interface SessionGenerationData {
  teachers: Teacher[];
  groups: Group[];
  classrooms: Classroom[];
  subjects: Subject[];
  streams: Stream[];
  timeSlots: TimeSlot[];
  settings: SchedulingSettings;
  teacherSubjectLinks: TeacherSubjectLink[];
  productionCalendar: ProductionCalendarEvent[];
  specialties: Specialty[];
  educationalPlans: EducationalPlan[];
  classroomTypes: ClassroomType[];
  subgroups: Subgroup[];
  schedule: ScheduleEntry[];
}

interface SessionEvent {
    uid: string;
    type: 'exam' | 'consultation' | 'test';
    subjectId: string;
    teacherId: string;
    studentCount: number;
    groupIds: string[];
    streamId?: string;
    consultationFor?: string; // UID of the exam this consultation is for
}

export interface SchedulerResult {
    schedule: ScheduleEntry[];
    unschedulable: SessionEvent[];
}

const generateSessionEventPool = (data: SessionGenerationData, config: SessionSchedulerConfig): SessionEvent[] => {
    const { groups, educationalPlans, teacherSubjectLinks, streams } = data;
    const events: SessionEvent[] = [];
    const currentSemester = 1;

    const processedAttestations = new Set<string>(); // key: `${subjectId}-${groupIds.join(',')}`

    groups.forEach(group => {
        const plan = educationalPlans.find(p => p.specialtyId === group.specialtyId);
        if (!plan) return;

        plan.entries.forEach(planEntry => {
            if (planEntry.semester !== currentSemester) return;
            
            const isExam = planEntry.attestation === AttestationType.Exam;
            const isTest = planEntry.attestation === AttestationType.Test;

            if (!isExam && !(isTest && config.scheduleTests !== 'none')) return;

            const stream = streams.find(s => s.groupIds.includes(group.id));
            const eventGroups = stream ? groups.filter(g => stream.groupIds.includes(g.id)) : [group];
            const groupIds = eventGroups.map(g => g.id).sort();
            const studentCount = eventGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const attestationKey = `${planEntry.subjectId}-${groupIds.join(',')}`;
            if (processedAttestations.has(attestationKey)) return;
            
            let teacherId: string | undefined;
            if (isExam) {
                teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
            } else { // isTest
                teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Test))?.teacherId;
            }
            if (!teacherId) {
                 teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId)?.teacherId;
            }
            
            if (teacherId) {
                const eventType = isExam ? 'exam' : 'test';
                const eventUid = `${eventType}-${attestationKey}`;
                const sessionEvent: SessionEvent = {
                    uid: eventUid,
                    type: eventType,
                    subjectId: planEntry.subjectId,
                    teacherId,
                    studentCount,
                    groupIds,
                    streamId: stream?.id,
                };
                events.push(sessionEvent);

                if (isExam && config.consultationOffset > 0) {
                     events.push({
                        uid: `consult-${attestationKey}`,
                        type: 'consultation',
                        subjectId: planEntry.subjectId,
                        teacherId,
                        studentCount,
                        groupIds,
                        streamId: stream?.id,
                        consultationFor: eventUid
                    });
                }
                processedAttestations.add(attestationKey);
            }
        });
    });

    return events;
};

export const generateSessionSchedule = async (data: SessionGenerationData, config: SessionSchedulerConfig): Promise<SchedulerResult> => {
    
    // --- 1. INITIALIZATION ---
    const { timeFrame, clearExisting } = config;
    const { teachers, groups, classrooms, subjects, timeSlots, settings, schedule } = data;

    const newSchedule: ScheduleEntry[] = [];
    const unschedulable: SessionEvent[] = [];
    
    const resourceBookings = new Map<string, Set<string>>();
    const initializeBookings = (items: (Teacher | Group | Classroom)[], type: string) => {
        items.forEach(item => resourceBookings.set(`${type}-${item.id}`, new Set()));
    };
    initializeBookings(teachers, 'teacher');
    initializeBookings(groups, 'group');
    initializeBookings(classrooms, 'classroom');
    
    let existingSchedule = schedule;
    if (clearExisting) {
        const sessionStart = new Date(timeFrame.start + 'T00:00:00').getTime();
        const sessionEnd = new Date(timeFrame.end + 'T23:59:59').getTime();
        existingSchedule = schedule.filter(entry => {
            if (!entry.date) return true;
            if (![ClassType.Exam, ClassType.Consultation, ClassType.Test].includes(entry.classType)) return true;
            
            const entryTime = new Date(entry.date).getTime();
            return entryTime < sessionStart || entryTime > sessionEnd;
        });
    }

    existingSchedule.forEach(entry => {
        if (!entry.date) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        const bookingSet = resourceBookings.get(bookingKey) || new Set();
        bookingSet.add(`classroom-${entry.classroomId}`);
        bookingSet.add(`teacher-${entry.teacherId}`);
        (entry.groupIds || [entry.groupId]).forEach(gid => gid && bookingSet.add(`group-${gid}`));
        resourceBookings.set(bookingKey, bookingSet);
    });

    const workDays: Date[] = [];
    let currentDate = new Date(timeFrame.start + 'T00:00:00');
    const lastDate = new Date(timeFrame.end + 'T00:00:00');
    while(currentDate <= lastDate) {
        const dateStr = toYYYYMMDD(currentDate);
        const dayInfo = data.productionCalendar.find(e => e.date === dateStr);
        if (!settings.respectProductionCalendar || !dayInfo || dayInfo.isWorkDay) {
            workDays.push(new Date(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    const eventPool = generateSessionEventPool(data, config);
    const exams = eventPool.filter(e => e.type === 'exam').sort((a,b) => b.studentCount - a.studentCount);
    const tests = eventPool.filter(e => e.type === 'test').sort((a,b) => b.studentCount - a.studentCount);
    const consultations = eventPool.filter(e => e.type === 'consultation');

    const placements = new Map<string, ScheduleEntry>();

    // --- 2. PLACE EXAMS & TESTS ---
    const attestationsToPlace = [...exams, ...tests];
    for (const event of attestationsToPlace) {
        let bestSlot: { date: Date, timeSlotId: string, classroom: Classroom } | null = null;
        
        for (const date of workDays) {
            for (const timeSlot of timeSlots) {
                if (!isSlotFreeForAttestation(date, timeSlot.id, event, resourceBookings, placements, config, data)) continue;
                
                const subject = subjects.find(s => s.id === event.subjectId);
                const suitableClassrooms = classrooms
                    .filter(c => {
                        if (c.capacity < event.studentCount) return false;
                        if (event.type === 'exam') {
                           return data.classroomTypes.find(ct => ct.id === c.typeId)?.name === 'Лекционная';
                        }
                        if (subject?.suitableClassroomTypeIds && subject.suitableClassroomTypeIds.length > 0) {
                            return subject.suitableClassroomTypeIds.includes(c.typeId);
                        }
                        // Fallback for tests: any non-lecture room
                        const classroomType = data.classroomTypes.find(ct => ct.id === c.typeId);
                        return classroomType?.name !== 'Лекционная';
                    })
                    .sort((a,b) => a.capacity - b.capacity);


                for (const classroom of suitableClassrooms) {
                    const bookingKey = `${toYYYYMMDD(date)}-${timeSlot.id}`;
                    if (resourceBookings.get(bookingKey)?.has(`classroom-${classroom.id}`)) continue;
                    
                    bestSlot = { date, timeSlotId: timeSlot.id, classroom };
                    break;
                }
                if (bestSlot) break;
            }
            if (bestSlot) break;
        }

        if (bestSlot) {
            const newEntry = placeEvent(event, bestSlot.date, bestSlot.timeSlotId, bestSlot.classroom, resourceBookings);
            newSchedule.push(newEntry);
            placements.set(event.uid, newEntry);
        } else {
            unschedulable.push(event);
        }
    }
    
     // --- 3. PLACE CONSULTATIONS ---
    for(const consult of consultations) {
        const examEntry = placements.get(consult.consultationFor!);
        if (!examEntry || !examEntry.date) {
            unschedulable.push(consult);
            continue;
        }

        const examDate = new Date(examEntry.date + 'T00:00:00');
        const consultDate = new Date(examDate);
        consultDate.setDate(examDate.getDate() - config.consultationOffset);
        
        let placed = false;
        for (const timeSlot of timeSlots) {
             const bookingKey = `${toYYYYMMDD(consultDate)}-${timeSlot.id}`;
             if(resourceBookings.get(bookingKey)?.has(`teacher-${consult.teacherId}`)) continue;
             if(consult.groupIds.some(gid => resourceBookings.get(bookingKey)?.has(`group-${gid}`))) continue;
             
             const subject = subjects.find(s => s.id === consult.subjectId);
             const suitableClassroom = classrooms.find(c => {
                 if (c.capacity < consult.studentCount) return false;
                 if (subject?.suitableClassroomTypeIds && !subject.suitableClassroomTypeIds.includes(c.typeId)) return false;
                 if (resourceBookings.get(bookingKey)?.has(`classroom-${c.id}`)) return false;
                 return true;
             });

             if (suitableClassroom) {
                 const newEntry = placeEvent(consult, consultDate, timeSlot.id, suitableClassroom, resourceBookings);
                 newSchedule.push(newEntry);
                 placed = true;
                 break;
             }
        }
        if(!placed) {
            unschedulable.push(consult);
        }
    }

    return { schedule: newSchedule, unschedulable };
};

const isSlotFreeForAttestation = (
    date: Date,
    timeSlotId: string,
    event: SessionEvent,
    bookings: Map<string, Set<string>>,
    placements: Map<string, ScheduleEntry>,
    config: SessionSchedulerConfig,
    data: SessionGenerationData,
): boolean => {
    const dateStr = toYYYYMMDD(date);
    const bookingKey = `${dateStr}-${timeSlotId}`;

    if(bookings.get(bookingKey)?.has(`teacher-${event.teacherId}`)) return false;
    if(event.groupIds.some(gid => bookings.get(bookingKey)?.has(`group-${gid}`))) return false;

    for(const gid of event.groupIds) {
        for(const placement of placements.values()) {
            if (placement.date === dateStr && (placement.groupIds || []).includes(gid)) {
                return false;
            }
        }
    }

    let checkRestDays = false;
    if (event.type === 'exam') {
        checkRestDays = config.restDays > 0;
    } else if (event.type === 'test' && config.scheduleTests === 'like_exams') {
        checkRestDays = config.restDays > 0;
    }

    if (checkRestDays) {
        for (let i = 1; i <= config.restDays; i++) {
            const prevDate = new Date(date);
            prevDate.setDate(date.getDate() - i);
            const prevDateStr = toYYYYMMDD(prevDate);
            
            for (const placement of placements.values()) {
                if(placement.date === prevDateStr && placement.groupIds?.some(gid => event.groupIds.includes(gid))) {
                    return false;
                }
            }
        }
    }
    
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const teacher = data.teachers.find(t => t.id === event.teacherId);
    if (teacher?.availabilityGrid?.[dayName]?.[timeSlotId] === AvailabilityType.Forbidden) return false;
    
    const groups = data.groups.filter(g => event.groupIds.includes(g.id));
    if (groups.some(g => g.availabilityGrid?.[dayName]?.[timeSlotId] === AvailabilityType.Forbidden)) return false;


    return true;
}

const placeEvent = (
    event: SessionEvent,
    date: Date,
    timeSlotId: string,
    classroom: Classroom,
    bookings: Map<string, Set<string>>
): ScheduleEntry => {
    const dateStr = toYYYYMMDD(date);
    const bookingKey = `${dateStr}-${timeSlotId}`;
    
    if(!bookings.has(bookingKey)) bookings.set(bookingKey, new Set());
    
    const bookingSet = bookings.get(bookingKey)!;
    bookingSet.add(`teacher-${event.teacherId}`);
    bookingSet.add(`classroom-${classroom.id}`);
    event.groupIds.forEach(gid => bookingSet.add(`group-${gid}`));
    
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];

    let classType: ClassType;
    if (event.type === 'exam') classType = ClassType.Exam;
    else if (event.type === 'test') classType = ClassType.Test;
    else classType = ClassType.Consultation;

    return {
        id: `session-${event.uid}`,
        day: dayName,
        date: dateStr,
        timeSlotId: timeSlotId,
        classroomId: classroom.id,
        groupIds: event.groupIds,
        streamId: event.streamId,
        subjectId: event.subjectId,
        teacherId: event.teacherId,
        classType: classType,
        deliveryMode: DeliveryMode.Offline,
        weekType: 'every'
    };
}