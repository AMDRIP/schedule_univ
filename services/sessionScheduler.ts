import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, ProductionCalendarEvent, Specialty, EducationalPlan, 
    AvailabilityType, DeliveryMode, ClassroomType, Subgroup, SessionSchedulerConfig, AttestationType, SchedulingRule, BellScheduleProfile, Elective
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD } from '../utils/dateUtils';
import { areGroupsCompatibleWithTimeSlot } from '../utils/shiftUtils';
import { isSemesterInCourse } from '../utils/semesterUtils';
import { getPlanForGroup, matchesSemesterParity, getRequiredClassroomTypes } from '../utils/educationUtils';
import { createScheduleValidator, getActiveTimeSlotsForDate, GenerationData } from './heuristicScheduler';

interface SessionGenerationData {
  timeSlotsShortened?: TimeSlot[];
  bellScheduleProfiles?: BellScheduleProfile[];
  schedulingRules?: SchedulingRule[];
  electives?: Elective[];
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
    type: 'exam' | 'consultation' | 'test' | 'practiceConsultation' | 'practiceDefense';
    classType: ClassType;
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

export const getSessionClassTypesToClear = (config: SessionSchedulerConfig): ClassType[] => {
    const mode = config.generationMode || 'full';
    if (mode === 'consultations_only') return [ClassType.Consultation];
    if (mode === 'practice_only') return [ClassType.PracticeConsultation, ClassType.PracticeDefense];
    const base = [ClassType.Exam, ClassType.Consultation, ClassType.Test, ClassType.CandidateExam, ClassType.ResearchAttestation, ClassType.ThesisDefense];
    if (config.includeCoursework !== false) base.push(ClassType.CourseworkDefense);
    if (mode === 'full_with_practice') base.push(ClassType.PracticeConsultation, ClassType.PracticeDefense);
    return base;
};

export const generateSessionEventPool = (data: SessionGenerationData, config: SessionSchedulerConfig): SessionEvent[] => {
    const { groups, educationalPlans, teacherSubjectLinks, streams } = data;
    const events: SessionEvent[] = [];
    const generationMode = config.generationMode || 'full';
    const includeAttestations = generationMode === 'full' || generationMode === 'full_with_practice';
    const onlyConsultations = generationMode === 'consultations_only';
    const includePractice = generationMode === 'practice_only' || generationMode === 'full_with_practice';

    const processedAttestations = new Set<string>(); // key: `${subjectId}-${groupIds.join(',')}`
    const processedPractice = new Set<string>();

    groups.forEach(group => {
        const teacherSubjectLinks = data.teacherSubjectLinks.filter(link => link.isActive !== false &&
            (!link.allowedGroupIds?.length || link.allowedGroupIds.includes(group.id)) &&
            !link.excludedGroupIds?.includes(group.id) &&
            (!link.allowedFormOfStudy?.length || link.allowedFormOfStudy.includes(group.formOfStudy)));
        const plan = getPlanForGroup(group, educationalPlans);
        if (!plan) return;

        plan.entries.forEach(planEntry => {
            if (!isSemesterInCourse(planEntry.semester, group.course) || !matchesSemesterParity(planEntry.semester, config.semesterParity || 'all')) return;
            
            const isExam = planEntry.attestation === AttestationType.Exam || planEntry.attestation === AttestationType.CandidateExam;
            const isTest = [AttestationType.Test, AttestationType.DifferentiatedTest, AttestationType.ResearchReport, AttestationType.ThesisDefense].includes(planEntry.attestation);
            const attestationClassType = planEntry.attestation === AttestationType.CandidateExam ? ClassType.CandidateExam : planEntry.attestation === AttestationType.ResearchReport ? ClassType.ResearchAttestation : planEntry.attestation === AttestationType.ThesisDefense ? ClassType.ThesisDefense : isExam ? ClassType.Exam : ClassType.Test;

            const shouldScheduleAttestation = includeAttestations && (isExam || (isTest && config.scheduleTests !== 'none'));
            const shouldScheduleConsultationOnly = onlyConsultations && isExam;
            const shouldSchedulePractice = includePractice && (planEntry.practiceHours > 0 || planEntry.labHours > 0);
            const shouldScheduleCoursework = includeAttestations && config.includeCoursework !== false && (planEntry.coursework?.defenseHours || 0) > 0;
            if (!shouldScheduleAttestation && !shouldScheduleConsultationOnly && !shouldSchedulePractice && !shouldScheduleCoursework) return;

            // A lecture stream does not imply a shared exam or defense.
            const stream: Stream | undefined = undefined;
            const eventGroups = [group];
            const groupIds = eventGroups.map(g => g.id).sort();
            const studentCount = eventGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const attestationKey = `${planEntry.subjectId}-sem${planEntry.semester}-${groupIds.join(',')}`;
            if (shouldScheduleAttestation && processedAttestations.has(attestationKey)) return;
            
            let teacherId: string | undefined;
            teacherId = teacherSubjectLinks.find(link => link.subjectId === planEntry.subjectId && link.classTypes.includes(attestationClassType))?.teacherId;
            if (isExam) {
                // Priority: Lecturer -> Anyone linked to Exam -> Any teacher for subject
                teacherId ||= teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Lecture))?.teacherId;
                if (!teacherId) {
                     teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Exam))?.teacherId;
                }
            } else { // isTest
                // Priority: Anyone linked to Test -> Anyone linked to Practical -> Any teacher for subject
                teacherId ||= teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && (l.classTypes.includes(ClassType.Test) || l.classTypes.includes(ClassType.Practical)))?.teacherId;
            }
    
            // General fallback for both
            if (!teacherId) {
                 teacherId = teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId)?.teacherId;
            }
            
            if (teacherId && shouldScheduleAttestation) {
                const eventType = isExam ? 'exam' : 'test';
                const eventUid = `${eventType}-${attestationKey}`;
                const sessionEvent: SessionEvent = {
                    uid: eventUid,
                    type: eventType,
                    classType: attestationClassType,
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
                        classType: ClassType.Consultation,
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

            if (teacherId && shouldScheduleConsultationOnly && !processedAttestations.has(`consult-only-${attestationKey}`)) {
                events.push({
                    uid: `consult-only-${attestationKey}`,
                    type: 'consultation',
                    classType: ClassType.Consultation,
                    subjectId: planEntry.subjectId,
                    teacherId,
                    studentCount,
                    groupIds,
                    streamId: stream?.id,
                });
                processedAttestations.add(`consult-only-${attestationKey}`);
            }

            if (shouldScheduleCoursework) {
                const supervisorId = teacherSubjectLinks.find(link => link.subjectId === planEntry.subjectId && link.classTypes.includes(ClassType.CourseworkDefense))?.teacherId || teacherId || '';
                for (let i = 0; i < Math.ceil((planEntry.coursework?.defenseHours || 0) / 2); i++) events.push({
                    uid: `coursework-defense-${attestationKey}-${i}`, type: 'practiceDefense', classType: ClassType.CourseworkDefense,
                    subjectId: planEntry.subjectId, teacherId: supervisorId, studentCount, groupIds,
                });
            }
            if (shouldSchedulePractice) {
                const practiceTeacherId =
                    teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && (l.classTypes.includes(ClassType.Practical) || l.classTypes.includes(ClassType.Lab)))?.teacherId ||
                    teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId && l.classTypes.includes(ClassType.Consultation))?.teacherId ||
                    teacherSubjectLinks.find(l => l.subjectId === planEntry.subjectId)?.teacherId;

                if (!practiceTeacherId) return;

                if (config.includePracticeConsultations !== false) {
                    const key = `practice-consult-${attestationKey}`;
                    if (!processedPractice.has(key)) {
                        events.push({
                            uid: key,
                            type: 'practiceConsultation',
                            classType: ClassType.PracticeConsultation,
                            subjectId: planEntry.subjectId,
                            teacherId: practiceTeacherId,
                            studentCount,
                            groupIds,
                            streamId: stream?.id,
                        });
                        processedPractice.add(key);
                    }
                }

                if (config.includePracticeDefenses !== false) {
                    const key = `practice-defense-${attestationKey}`;
                    if (!processedPractice.has(key)) {
                        events.push({
                            uid: key,
                            type: 'practiceDefense',
                            classType: ClassType.PracticeDefense,
                            subjectId: planEntry.subjectId,
                            teacherId: practiceTeacherId,
                            studentCount,
                            groupIds,
                            streamId: stream?.id,
                        });
                        processedPractice.add(key);
                    }
                }
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
            if (!getSessionClassTypesToClear(config).includes(entry.classType)) return true;
            
            const entryTime = new Date(entry.date).getTime();
            return entryTime < sessionStart || entryTime > sessionEnd;
        });
    }

    existingSchedule.forEach(entry => {
        if (!entry.date) return;
        const bookingKey = `${entry.date}-${entry.timeSlotId}`;
        
        if (!resourceBookings.has(bookingKey)) {
            resourceBookings.set(bookingKey, new Set());
        }
        const bookingSet = resourceBookings.get(bookingKey)!;

        bookingSet.add(`classroom-${entry.classroomId}`);
        bookingSet.add(`teacher-${entry.teacherId}`);
        entry.additionalTeacherIds?.forEach(id => bookingSet.add(`teacher-${id}`));
        (entry.groupIds || [entry.groupId]).forEach(gid => gid && bookingSet.add(`group-${gid}`));
    });

    const validationData: GenerationData = { ...data, timeSlotsShortened: data.timeSlotsShortened || data.timeSlots, bellScheduleProfiles: data.bellScheduleProfiles || [], schedulingRules: data.schedulingRules || [], electives: data.electives || [], ugs: [] };
    const validate = createScheduleValidator(validationData, { timeFrame, clearExisting: false, iterations: 1, strictness: 5, enforceLectureOrder: true, distributeEvenly: true });
    const allows = (event: SessionEvent, date: Date, timeSlotId: string, room: Classroom) => validate(placeEvent(event, date, timeSlotId, room, new Map()), [...existingSchedule, ...newSchedule]).valid;
    const slotsForDate = (date: Date) => getActiveTimeSlotsForDate(validationData, date);
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
    const practiceEvents = eventPool.filter(e => e.type === 'practiceConsultation' || e.type === 'practiceDefense')
        .sort((a, b) => b.studentCount - a.studentCount);

    const placements = new Map<string, ScheduleEntry>();

    // --- 2. PLACE EXAMS & TESTS ---
    const attestationsToPlace = [...exams, ...tests];
    for (const event of attestationsToPlace) {
        let bestSlot: { date: Date, timeSlotId: string, classroom: Classroom } | null = null;
        
        const subject = subjects.find(s => s.id === event.subjectId);

        const findSlotInClassrooms = (roomList: Classroom[]) => {
            for (const date of workDays) {
                for (const timeSlot of slotsForDate(date)) {
                    const involvedGroups = groups.filter(group => event.groupIds.includes(group.id));
                    if (!areGroupsCompatibleWithTimeSlot(timeSlot, involvedGroups)) continue;
                    if (!isSlotFreeForAttestation(date, timeSlot.id, event, resourceBookings, placements, config, validationData)) continue;

                    for (const classroom of roomList) {
                        const bookingKey = `${toYYYYMMDD(date)}-${timeSlot.id}`;
                        if (resourceBookings.get(bookingKey)?.has(`classroom-${classroom.id}`)) continue;
                        if (!allows(event, date, timeSlot.id, classroom)) continue;
                        
                        return { date, timeSlotId: timeSlot.id, classroom };
                    }
                }
            }
            return null;
        };
        
        // Pass 1: Ideal classrooms
        const idealClassrooms = classrooms.filter(c => {
            if (c.status === 'repair' || c.status === 'closed') return false;
            if (c.allowedClassTypes?.length && !c.allowedClassTypes.includes(event.classType)) return false;
            if (c.capacity < event.studentCount) return false;
            
            const requiredTypes = getRequiredClassroomTypes(subject, event.classType);

            if (requiredTypes && requiredTypes.length > 0) {
                return requiredTypes.includes(c.typeId);
            }
            
            // Fallback logic
            if (event.type === 'exam') {
                return data.classroomTypes.find(ct => ct.id === c.typeId)?.name === 'Лекционная';
            }
            const classroomType = data.classroomTypes.find(ct => ct.id === c.typeId);
            return classroomType?.name !== 'Лекционная';
        }).sort((a,b) => a.capacity - b.capacity);

        bestSlot = findSlotInClassrooms(idealClassrooms);

        // Pass 2: Fallback for exams if ideal failed
        if (!bestSlot && event.type === 'exam') {
            const fallbackClassrooms = classrooms.filter(c => c.capacity >= event.studentCount && c.status !== 'closed' && c.status !== 'repair' && !(getRequiredClassroomTypes(subject, event.classType)?.length))
                .sort((a, b) => a.capacity - b.capacity);
            bestSlot = findSlotInClassrooms(fallbackClassrooms);
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
    const placeFlexibleEvent = (event: SessionEvent, candidateDates: Date[]) => {
        for (const date of candidateDates) {
            for (const timeSlot of slotsForDate(date)) {
                const involvedGroups = groups.filter(group => event.groupIds.includes(group.id));
                if (!areGroupsCompatibleWithTimeSlot(timeSlot, involvedGroups)) continue;
                if (!isSlotFreeForAttestation(date, timeSlot.id, event, resourceBookings, placements, config, validationData)) continue;

                const bookingKey = `${toYYYYMMDD(date)}-${timeSlot.id}`;
                const subject = subjects.find(s => s.id === event.subjectId);
                const requiredTypes = getRequiredClassroomTypes(subject, event.classType);

                const suitableClassroom = classrooms.find(c => {
                    if (!allows(event, date, timeSlot.id, c)) return false;
                    if (c.status === 'repair' || c.status === 'closed') return false;
                    if (c.allowedClassTypes?.length && !c.allowedClassTypes.includes(event.classType)) return false;
                    const day = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
                    if (c.availabilityGrid?.[day]?.[timeSlot.id] === AvailabilityType.Forbidden) return false;
                    if ((subject?.requiredClassroomTagIds || []).some(tag => !c.tagIds?.includes(tag))) return false;
                    if (c.capacity < event.studentCount) return false;
                    if (requiredTypes && requiredTypes.length > 0 && !requiredTypes.includes(c.typeId)) return false;
                    if (resourceBookings.get(bookingKey)?.has(`classroom-${c.id}`)) return false;
                    return true;
                });

                if (suitableClassroom) {
                    const newEntry = placeEvent(event, date, timeSlot.id, suitableClassroom, resourceBookings);
                    newSchedule.push(newEntry);
                    placements.set(event.uid, newEntry);
                    return true;
                }
            }
        }
        return false;
    };

    for(const consult of consultations) {
        const examEntry = consult.consultationFor ? placements.get(consult.consultationFor) : undefined;
        if (consult.consultationFor && (!examEntry || !examEntry.date)) {
            unschedulable.push(consult);
            continue;
        }

        if (!consult.consultationFor) {
            if (!placeFlexibleEvent(consult, workDays)) {
                unschedulable.push(consult);
            }
            continue;
        }

        const examDate = new Date(examEntry.date + 'T00:00:00');
        const consultDate = new Date(examDate);
        consultDate.setDate(examDate.getDate() - config.consultationOffset);
        
        const placed = placeFlexibleEvent(consult, [consultDate]);
        if(!placed) {
            unschedulable.push(consult);
        }
    }

    // --- 4. PLACE PRACTICE CONSULTATIONS & DEFENSES ---
    for (const event of practiceEvents) {
        if (!placeFlexibleEvent(event, workDays)) {
            unschedulable.push(event);
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
    const dayBookingSet = bookings.get(bookingKey);
    const timeSlot = getActiveTimeSlotsForDate(data as GenerationData, date).find(slot => slot.id === timeSlotId);
    const involvedGroupsForShift = data.groups.filter(group => event.groupIds.includes(group.id));
    if (!areGroupsCompatibleWithTimeSlot(timeSlot, involvedGroupsForShift)) return false;

    if(dayBookingSet?.has(`teacher-${event.teacherId}`)) return false;
    if(event.groupIds.some(gid => dayBookingSet?.has(`group-${gid}`))) return false;

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
    if (!teacher || teacher.availabilityGrid?.[dayName]?.[timeSlotId] === AvailabilityType.Forbidden) return false;
    
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
        classType: event.classType,
        deliveryMode: DeliveryMode.Offline,
        weekType: 'every'
    };
}
