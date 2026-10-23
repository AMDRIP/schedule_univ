import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, ProductionCalendarEvent, Specialty, EducationalPlan, 
    DeliveryMode, ClassroomType, Subgroup, SessionSchedulerConfig, AttestationType, SchedulingRule, BellScheduleProfile, Elective, Student, AcademicWork, ResourceAbsence
} from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD } from '../utils/dateUtils';
import { isSemesterInCourse } from '../utils/semesterUtils';
import { getPlanForGroup, matchesSemesterParity, getRequiredClassroomTypes } from '../utils/educationUtils';
import { createScheduleValidator, getActiveTimeSlotsForDate, expandScheduleOccurrences, GenerationData } from './heuristicScheduler';
import { groupIdsOf, isIndividualEntry } from '../utils/participants';

interface SessionGenerationData {
  students?: Student[];
  academicWorks?: AcademicWork[];
  resourceAbsences?: ResourceAbsence[];
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

export interface SessionEvent {
    uid: string;
    type: 'exam' | 'consultation' | 'test' | 'practiceConsultation' | 'practiceDefense';
    classType: ClassType;
    subjectId: string;
    teacherId: string;
    teacherCandidates: string[];
    semester: number;
    issues?: string[];
    studentCount: number;
    groupIds: string[];
    streamId?: string;
    consultationFor?: string; // UID of the exam this consultation is for
}

export interface SchedulerResult {
    schedule: ScheduleEntry[];
    unschedulable: SessionEvent[];
    validationIssues: { entryId: string; issues: string[] }[];
}

export const getSessionClassTypesToClear = (config: SessionSchedulerConfig): ClassType[] => {
    const mode = config.generationMode || 'full';
    if (mode === 'consultations_only') return [ClassType.Consultation];
    const practice = [
        ...(config.includePracticeConsultations !== false ? [ClassType.PracticeConsultation] : []),
        ...(config.includePracticeDefenses !== false ? [ClassType.PracticeDefense] : []),
    ];
    if (mode === 'practice_only') return practice;
    const base = [ClassType.Exam, ClassType.CandidateExam];
    if (config.consultationOffset > 0) base.push(ClassType.Consultation);
    if (config.scheduleTests !== 'none') base.push(ClassType.Test, ClassType.ResearchAttestation, ClassType.ThesisDefense);
    if (config.includeCoursework !== false) base.push(ClassType.CourseworkDefense);
    if (mode === 'full_with_practice') base.push(...practice);
    return base;
};

const semesterOf = (entry: ScheduleEntry) => Number((entry.unscheduledUid || entry.id).match(/-sem(\d+)-/)?.[1]) || undefined;
export const getRetainedSessionSchedule = (schedule: ScheduleEntry[], config: SessionSchedulerConfig) => {
    const types = new Set(getSessionClassTypesToClear(config));
    return schedule.filter(entry => !config.clearExisting || entry.locked || isIndividualEntry(entry) || !entry.date ||
        entry.date < config.timeFrame.start || entry.date > config.timeFrame.end || !types.has(entry.classType) ||
        (semesterOf(entry) && !matchesSemesterParity(semesterOf(entry)!, config.semesterParity || 'all')));
};

const teacherCandidatesFor = (data: SessionGenerationData, group: Group, subjectId: string, type: ClassType) => {
    const teachers = new Set(data.teachers.map(teacher => teacher.id));
    return [...new Set(data.teacherSubjectLinks.filter(link => link.subjectId === subjectId && link.classTypes.includes(type) && link.isActive !== false &&
        (!link.allowedGroupIds?.length || link.allowedGroupIds.includes(group.id)) && !link.excludedGroupIds?.includes(group.id) &&
        (!link.allowedFormOfStudy?.length || link.allowedFormOfStudy.includes(group.formOfStudy)))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)).map(link => link.teacherId).filter(id => teachers.has(id)))];
};

export const generateSessionEventPool = (data: SessionGenerationData, config: SessionSchedulerConfig): SessionEvent[] => {
    const { groups, educationalPlans } = data;
    const events: SessionEvent[] = [];
    const generationMode = config.generationMode || 'full';
    const includeAttestations = generationMode === 'full' || generationMode === 'full_with_practice';
    const onlyConsultations = generationMode === 'consultations_only';
    const includePractice = generationMode === 'practice_only' || generationMode === 'full_with_practice';

    const processed = new Set<string>();

    groups.forEach(group => {
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
            const eventGroups = [group];
            const groupIds = eventGroups.map(g => g.id).sort();
            const studentCount = eventGroups.reduce((sum, g) => sum + g.studentCount, 0);

            const attestationKey = `${planEntry.subjectId}-sem${planEntry.semester}-${groupIds.join(',')}`;
            const addEvent = (uid: string, type: SessionEvent['type'], classType: ClassType, consultationFor?: string) => {
                if (processed.has(uid)) return;
                processed.add(uid);
                const teacherCandidates = teacherCandidatesFor(data, group, planEntry.subjectId, classType);
                events.push({ uid, type, classType, subjectId: planEntry.subjectId, semester: planEntry.semester,
                    teacherId: teacherCandidates[0] || '', teacherCandidates, studentCount, groupIds, consultationFor });
            };
            if (shouldScheduleAttestation) {
                const eventType = isExam ? 'exam' : 'test';
                const eventUid = `${eventType}-${attestationKey}`;
                addEvent(eventUid, eventType, attestationClassType);
                if (isExam && config.consultationOffset > 0) {
                    addEvent(`consult-${attestationKey}`, 'consultation', ClassType.Consultation, eventUid);
                }
            }

            if (shouldScheduleConsultationOnly) {
                addEvent(`consult-${attestationKey}`, 'consultation', ClassType.Consultation, `exam-${attestationKey}`);
            }

            if (shouldScheduleCoursework) {
                for (let i = 0; i < Math.ceil((planEntry.coursework?.defenseHours || 0) / 2); i++)
                    addEvent(`coursework-defense-${attestationKey}-${i}`, 'practiceDefense', ClassType.CourseworkDefense);
            }
            if (shouldSchedulePractice) {
                if (config.includePracticeConsultations !== false) {
                    const key = `practice-consult-${attestationKey}`;
                    addEvent(key, 'practiceConsultation', ClassType.PracticeConsultation);
                }

                if (config.includePracticeDefenses !== false) {
                    const key = `practice-defense-${attestationKey}`;
                    addEvent(key, 'practiceDefense', ClassType.PracticeDefense);
                }
            }
        });
    });

    return events;
};

export const generateSessionSchedule = async (data: SessionGenerationData, config: SessionSchedulerConfig): Promise<SchedulerResult> => {
    assertSessionConfig(config);
    const { timeFrame, restDays } = config;
    const validationData: GenerationData = { ...data, timeSlotsShortened: data.timeSlotsShortened || data.timeSlots,
        bellScheduleProfiles: data.bellScheduleProfiles || [], schedulingRules: data.schedulingRules || [], electives: data.electives || [],
        ugs: (data as Partial<GenerationData>).ugs || [] };
    const ruleConfig = { timeFrame, clearExisting: false, iterations: 1, strictness: 5, enforceLectureOrder: true, distributeEvenly: true };
    const validate = createScheduleValidator(validationData, ruleConfig, { finalValidation: false });
    const validateFinal = createScheduleValidator(validationData, ruleConfig);
    const retained = getRetainedSessionSchedule(data.schedule, config);
    const halo = { start: offsetDate(timeFrame.start, -restDays), end: offsetDate(timeFrame.end, restDays) };
    const existing = expandScheduleOccurrences(validationData, retained, halo);
    const pool = generateSessionEventPool(data, config);
    const newSchedule: ScheduleEntry[] = [];
    let current = [...existing];
    const placements = new Map<string, ScheduleEntry>();
    const credited = new Set<string>();
    const reasons = new Map(pool.map(event => [event.uid, new Set<string>()]));
    const identifiers = new Set(retained.map(entry => entry.id));
    const ids = new Map(pool.map(event => {
        let id = `session-${event.uid}-${timeFrame.start}`;
        while (identifiers.has(id)) id += '-new';
        identifiers.add(id); return [event.uid, id];
    }));
    const calendar = new Map(data.productionCalendar.map(day => [day.date, day]));
    const isWorkDay = (dateStr: string) => !data.settings.respectProductionCalendar ||
        (calendar.get(dateStr)?.isWorkDay ?? new Date(dateStr + 'T00:00:00').getDay() !== 0);
    const workDays: string[] = [];
    const endTime = new Date(timeFrame.end + 'T00:00:00').getTime();
    for (const date = new Date(timeFrame.start + 'T00:00:00'); date.getTime() <= endTime; date.setDate(date.getDate() + 1)) {
        const day = toYYYYMMDD(date); if (isWorkDay(day)) workDays.push(day);
    }
    const slots = new Map<string, TimeSlot[]>();
    const slotsFor = (date: string) => {
        if (!slots.has(date)) slots.set(date, getActiveTimeSlotsForDate(validationData, date));
        return slots.get(date)!;
    };
    const period = data.settings.sessionStart <= timeFrame.end && data.settings.sessionEnd >= timeFrame.start
        ? { start: data.settings.sessionStart, end: data.settings.sessionEnd } : timeFrame;
    const matches = (event: SessionEvent, entry: ScheduleEntry) => !isIndividualEntry(entry) && entry.date && entry.date >= period.start && entry.date <= period.end &&
        entry.subjectId === event.subjectId && entry.classType === event.classType && event.groupIds.every(id => groupIdsOf(entry).includes(id)) &&
        (!semesterOf(entry) || semesterOf(entry) === event.semester);
    const remaining = pool.filter(event => {
        const entry = existing.find(entry => matches(event, entry) && !credited.has(`${entry.id}:${event.groupIds.join(',')}`));
        if (!entry) return true;
        credited.add(`${entry.id}:${event.groupIds.join(',')}`); placements.set(event.uid, entry); return false;
    });
    const remember = (event: SessionEvent, issue: string) => {
        const issues = reasons.get(event.uid)!; if (issues.size < 8) issues.add(issue);
    };
    const rooms = new Map(remaining.map(event => {
        const subject = data.subjects.find(subject => subject.id === event.subjectId);
        const required = getRequiredClassroomTypes(subject, event.classType);
        if (!subject) remember(event, 'Дисциплина не найдена.');
        if (!event.teacherCandidates.length) remember(event, `Нет допустимой привязки преподавателя: ${subject?.name || event.subjectId}, ${event.classType}.`);
        if (!required?.length) remember(event, `Не заданы типы аудиторий для занятия «${event.classType}».`);
        const suitable = data.classrooms.filter(room => required?.includes(room.typeId) && room.capacity >= event.studentCount &&
            room.status !== 'closed' && room.status !== 'repair' && (!room.allowedClassTypes?.length || room.allowedClassTypes.includes(event.classType)) &&
            (subject?.requiredClassroomTagIds || []).every(tag => room.tagIds?.includes(tag))).sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));
        if (required?.length && !suitable.length) remember(event, 'Нет открытой аудитории нужного типа, вместимости и оборудования.');
        return [event.uid, suitable];
    }));
    let probes = 0;
    let nextYield = Date.now() + 12;
    const pause = async () => { if (Date.now() >= nextYield) { await new Promise(resolve => setTimeout(resolve, 0)); nextYield = Date.now() + 12; } };
    type Placement = { entry: ScheduleEntry; cost: number; consultation?: ScheduleEntry };
    const find = async (event: SessionEvent, dates: string[], extra: ScheduleEntry[] = [], parent?: ScheduleEntry, pair?: SessionEvent, after?: ScheduleEntry): Promise<Placement | undefined> => {
        if (!event.teacherCandidates.length || !rooms.get(event.uid)?.length) return undefined;
        for (const date of dates) {
            if (date < timeFrame.start || date > timeFrame.end || !isWorkDay(date)) {
                remember(event, 'Нужная дата выходит за рамки сессии или является нерабочей.'); continue;
            }
            if (after?.date && date < after.date) { remember(event, 'Защита или экзамен должны следовать после консультации.'); continue; }
            const others = [...current, ...extra];
            if (isAttestation(event.classType)) {
                const conflict = others.find(entry => entry.date && !isIndividualEntry(entry) && isAttestation(entry.classType) &&
                    event.groupIds.some(id => groupIdsOf(entry).includes(id)) &&
                    (entry.date === date || (requiresRest(event.classType, config) && requiresRest(entry.classType, config) && Math.abs(dayNumber(entry.date) - dayNumber(date)) <= restDays)));
                if (conflict) { remember(event, `Другая аттестация группы ${conflict.date}: нарушается правило одного экзамена/зачёта в день или интервал отдыха.`); continue; }
            }
            let best: Placement | undefined;
            for (const slot of slotsFor(date)) for (const teacherId of event.teacherCandidates) for (const room of rooms.get(event.uid)!) {
                if (++probes % 64 === 0) await pause();
                if (parent?.date === date && !isEarlierSlot(slot, slotsFor(date).find(slot => slot.id === parent.timeSlotId), slotsFor(date))) continue;
                if (after?.date === date && !isEarlierSlot(slotsFor(date).find(slot => slot.id === after.timeSlotId), slot, slotsFor(date))) continue;
                const entry: ScheduleEntry = { id: ids.get(event.uid)!, unscheduledUid: event.uid, subjectId: event.subjectId, classType: event.classType,
                    groupIds: event.groupIds, streamId: event.streamId, teacherId, classroomId: room.id, timeSlotId: slot.id, date,
                    day: DAYS_OF_WEEK[(new Date(date + 'T00:00:00').getDay() + 6) % 7], deliveryMode: DeliveryMode.Offline, weekType: 'every' };
                const check = validate(entry, others);
                if (!check.valid) { check.issues.forEach(issue => remember(event, issue)); continue; }
                let consultation: ScheduleEntry | undefined;
                let cost = check.softPenalty;
                if (pair) {
                    const found = await find(pair, [offsetDate(date, -config.consultationOffset)], [entry], entry);
                    if (!found || !validate(entry, [...others, found.entry]).valid) continue;
                    consultation = found.entry; cost += found.cost;
                }
                if (!best || cost < best.cost) best = { entry, cost, consultation };
                if (pair) return best;
            }
            if (best) return best;
        }
        if (!dates.length) remember(event, 'В выбранном периоде нет рабочих дат.');
        return undefined;
    };
    const commit = (event: SessionEvent, entry: ScheduleEntry) => { newSchedule.push(entry); current = [...current, entry]; placements.set(event.uid, entry); };
    const attestations = remaining.filter(event => event.type === 'exam' || event.type === 'test')
        .sort((a, b) => a.teacherCandidates.length - b.teacherCandidates.length || b.studentCount - a.studentCount);
    for (const event of attestations) {
        const consult = remaining.find(consult => consult.consultationFor === event.uid);
        const coveredConsult = pool.find(consult => consult.consultationFor === event.uid && placements.has(consult.uid));
        const anchor = coveredConsult && placements.get(coveredConsult.uid);
        // Reserve both events before committing the exam; otherwise the first day loses its consultation.
        const found = anchor?.date ? await find(event, [offsetDate(anchor.date, config.consultationOffset)], [], undefined, undefined, anchor) :
            consult ? await find(event, workDays, [], undefined, consult) || await find(event, workDays) : await find(event, workDays);
        if (found) {
            commit(event, found.entry);
            if (consult && found.consultation) commit(consult, found.consultation);
        }
    }
    for (const event of remaining.filter(event => event.type === 'consultation')) {
        if (placements.has(event.uid)) continue;
        let parent = event.consultationFor ? placements.get(event.consultationFor) : undefined;
        if (!parent && config.generationMode === 'consultations_only') {
            parent = existing.find(entry => matches({ ...event, classType: ClassType.Exam }, entry) || matches({ ...event, classType: ClassType.CandidateExam }, entry));
        }
        if (!parent) { remember(event, 'Связанный экзамен не размещён: сначала назначьте экзамен, затем рассчитайте консультацию.'); continue; }
        const found = await find(event, parent?.date ? [offsetDate(parent.date, -config.consultationOffset)] : workDays, [], parent);
        if (found) commit(event, found.entry);
    }
    for (const event of remaining.filter(event => event.type === 'practiceConsultation' || event.type === 'practiceDefense')) {
        const preceding = event.classType === ClassType.PracticeDefense ? placements.get(event.uid.replace(/^practice-defense-/, 'practice-consult-')) : undefined;
        const found = await find(event, workDays, [], undefined, undefined, preceding); if (found) commit(event, found.entry);
    }
    const unschedulable = remaining.filter(event => !placements.has(event.uid)).map(event => ({ ...event,
        issues: [...reasons.get(event.uid)!, ...(!reasons.get(event.uid)!.size ? ['Не найдено допустимое сочетание даты, слота, преподавателя и аудитории.'] : [])] }));
    const attestationsInGrid = current.filter(entry => entry.date && !isIndividualEntry(entry) && isAttestation(entry.classType));
    const idCounts = new Map<string, number>();
    current.forEach(entry => idCounts.set(entry.id, (idCounts.get(entry.id) || 0) + 1));
    const validationIssues = current.filter(entry => entry.date && entry.date >= timeFrame.start && entry.date <= timeFrame.end &&
        (newSchedule.includes(entry) || isAttestation(entry.classType))).flatMap(entry => {
        const issues = [...validateFinal(entry, current).issues];
        if (idCounts.get(entry.id)! > 1) issues.push('Идентификатор занятия повторяется в проекте.');
        if (!isIndividualEntry(entry) && isAttestation(entry.classType)) {
            const conflict = attestationsInGrid.find(other => other !== entry && groupIdsOf(entry).some(id => groupIdsOf(other).includes(id)) &&
                (other.date === entry.date || (requiresRest(entry.classType, config) && requiresRest(other.classType, config) && Math.abs(dayNumber(other.date!) - dayNumber(entry.date!)) <= restDays)));
            if (conflict) issues.push(`Нарушено правило одной аттестации в день или интервал отдыха: другая аттестация ${conflict.date}.`);
        }
        return issues.length ? [{ entryId: entry.id, issues }] : [];
    });
    return { schedule: newSchedule, unschedulable, validationIssues };
};

const isAttestation = (type: ClassType) => [ClassType.Exam, ClassType.CandidateExam, ClassType.Test, ClassType.ResearchAttestation, ClassType.ThesisDefense].includes(type);
const requiresRest = (type: ClassType, config: SessionSchedulerConfig) => [ClassType.Exam, ClassType.CandidateExam].includes(type) || (isAttestation(type) && config.scheduleTests === 'like_exams');
const dayNumber = (date: string) => { const [year, month, day] = date.split('-').map(Number); return Date.UTC(year, month - 1, day) / 86400000; };
const offsetDate = (value: string, offset: number) => { const date = new Date(value + 'T00:00:00'); date.setDate(date.getDate() + offset); return toYYYYMMDD(date); };
const isEarlierSlot = (candidate: TimeSlot | undefined, parent: TimeSlot | undefined, slots: TimeSlot[]) => {
    const range = (slot?: TimeSlot) => slot?.time.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    const first = range(candidate), second = range(parent);
    return first && second ? Number(first[3]) * 60 + Number(first[4]) <= Number(second[1]) * 60 + Number(second[2]) :
        !!candidate && !!parent && slots.indexOf(candidate) < slots.indexOf(parent);
};
const assertSessionConfig = (config: SessionSchedulerConfig) => {
    if (!['full', 'consultations_only', 'practice_only', 'full_with_practice'].includes(config.generationMode || 'full') ||
        !['like_exams', 'no_rest_days', 'none'].includes(config.scheduleTests) || !['odd', 'even', 'all'].includes(config.semesterParity || 'all')) throw new Error('Некорректный режим планирования сессии.');
    for (const value of [config.timeFrame.start, config.timeFrame.end]) {
        const date = new Date(value + 'T00:00:00');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || toYYYYMMDD(date) !== value) throw new Error('Некорректные даты сессии.');
    }
    if (config.timeFrame.start > config.timeFrame.end) throw new Error('Начало сессии должно быть не позже её окончания.');
    if ([config.restDays, config.consultationOffset].some(value => !Number.isInteger(value) || value < 0 || value > 365)) throw new Error('Интервалы сессии должны быть целыми числами от 0 до 365 дней.');
};
