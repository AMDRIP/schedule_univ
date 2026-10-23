import { ScheduleEntry } from '../types';
import { createScheduleValidator, GenerationData, getActiveTimeSlotsForDate, expandScheduleOccurrences } from './heuristicScheduler';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD, getWeekNumber } from '../utils/dateUtils';
import { sharesResource, isIndividualEntry, groupIdsOf } from '../utils/participants';
import { getRequiredClassroomTypes } from '../utils/educationUtils';

export interface RepairAlternative {
    id: string;
    changes: { before: ScheduleEntry; after: ScheduleEntry }[];
    score: number;
    warnings: string[];
}
export interface RepairPreview {
    baseSignature: string;
    dataSignature?: string;
    changes: RepairAlternative['changes'];
    alternatives?: RepairAlternative[];
    selectedAlternativeId?: string;
    elapsedMs: number;
    message: string;
}
export const scheduleSignature = (schedule: ScheduleEntry[]) => JSON.stringify(schedule);
export const planningSignature = (data: GenerationData) => JSON.stringify(Object.fromEntries(['teachers', 'groups', 'classrooms', 'subjects', 'streams', 'timeSlots', 'timeSlotsShortened', 'bellScheduleProfiles', 'settings', 'teacherSubjectLinks', 'schedulingRules', 'productionCalendar', 'ugs', 'specialties', 'educationalPlans', 'classroomTypes', 'subgroups', 'electives', 'schedule', 'academicWorks', 'students', 'resourceAbsences', 'buildingPlans'].map(key => [key, data[key] ?? []])));
const slotMinutes = (entry: ScheduleEntry, data: GenerationData) => {
    const slot = [...data.timeSlots, ...data.timeSlotsShortened, ...(data.bellScheduleProfiles || []).flatMap(profile => profile.slots)].find(slot => slot.id === entry.timeSlotId);
    const match = slot?.time.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    return match ? [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])] : undefined;
};
export const resourceConflicts = (entry: ScheduleEntry, schedule: ScheduleEntry[], data: GenerationData) => {
    if (!entry.date) return [];
    const occurrences = expandScheduleOccurrences(data, schedule.filter(item => item.id !== entry.id), { start: entry.date, end: entry.date });
    const time = slotMinutes(entry, data);
    return occurrences.filter(other => {
        if (other.date !== entry.date || !sharesResource(entry, other)) return false;
        if (entry.timeSlotId === other.timeSlotId) return true;
        const range = slotMinutes(other, data);
        return !!time && !!range && time[0] < range[1] && range[0] < time[1];
    });
};
export const validateRepair = (data: GenerationData, changes: RepairPreview['changes'], deadline = Infinity): string[] => {
    if (changes.some(change => change.before.locked)) return ['Закреплённое занятие нельзя переносить.'];
    const replacements = new Map(changes.map(change => [change.before.id, change.after]));
    const next = data.schedule.map(entry => replacements.get(entry.id) || entry);
    const validate = createScheduleValidator(data);
    for (const entry of next) {
        if (Date.now() >= deadline) return ['Истёк лимит локального поиска.'];
        if (!entry.date) continue;
        const result = validate(entry, next);
        if (replacements.has(entry.id)) {
            if (!result.valid) return result.issues.length ? result.issues : ['Нарушено ограничение привязки преподавателя.'];
        } else if (!result.valid) {
            const baseline = validate(entry, data.schedule);
            const beforeConflicts = new Set(resourceConflicts(entry, data.schedule, data).map(item => item.id));
            if (result.issues.some(issue => !baseline.issues.includes(issue)) || resourceConflicts(entry, next, data).some(item => !beforeConflicts.has(item.id))) return result.issues;
        }
    }
    return [];
};
export const replacementWarnings = (changes: RepairPreview['changes'], data: GenerationData) => {
    const replacements = new Map(changes.map(change => [change.before.id, change.after]));
    const schedule = data.schedule.map(entry => replacements.get(entry.id) || entry);
    const warnings = new Set<string>();
    for (const change of changes) {
        if (change.before.teacherId === change.after.teacherId) continue;
        const id = change.after.teacherId;
        const all = schedule.filter(entry => entry.teacherId === id || entry.additionalTeacherIds?.includes(id));
        const date = new Date(change.after.date + 'T00:00:00');
        const week = getWeekNumber(date); const year = date.getFullYear();
        const weekly = all.filter(entry => entry.date && new Date(entry.date + 'T00:00:00').getFullYear() === year && getWeekNumber(new Date(entry.date + 'T00:00:00')) === week).length;
        const semester = all.filter(entry => entry.date >= data.settings.semesterStart && entry.date <= data.settings.semesterEnd).length;
        const link = data.teacherSubjectLinks.find(link => link.teacherId === id && link.subjectId === change.after.subjectId && link.classTypes.includes(change.after.classType) && link.isActive !== false);
        const maxWeek = link?.maxWeeklyLessons ?? Math.min(20, data.settings.analyticsThresholds?.targetWeeklyTeacherLoad || 20);
        const maxSemester = link?.maxSemesterLessons ?? 540;
        if (weekly > maxWeek || semester > maxSemester) warnings.add(`Нежелательная замена: ${data.teachers.find(teacher => teacher.id === id)?.name || id}, ${weekly} пар в неделю, ${semester} за семестр.`);
    }
    return [...warnings];
};
export const previewScheduleRepair = async (data: GenerationData, entryId: string, budgetMs = 3000): Promise<RepairPreview> => {
    const start = Date.now(); const deadline = start + Math.max(0, budgetMs);
    const target = data.schedule.find(entry => entry.id === entryId);
    const base = { baseSignature: scheduleSignature(data.schedule), dataSignature: planningSignature(data), changes: [], elapsedMs: 0, message: '' };
    if (!target?.date || target.locked) return { ...base, message: target?.locked ? 'Занятие закреплено.' : 'Для ремонта требуется календарная дата.' };
    const validate = createScheduleValidator(data);
    if (validate(target).valid) return { ...base, message: 'Занятие уже проходит общую проверку ограничений.' };
    const validatePlacement = createScheduleValidator(data, undefined, { finalValidation: false });
    const alternatives: RepairAlternative[] = []; const signatures = new Set<string>(); let probes = 0; let nodes = 0;
    const maxChanges = Math.min(4, Math.max(2, Math.floor(data.schedule.length * 0.05)));
    const candidates = function* (entry: ScheduleEntry, preferred?: ScheduleEntry) {
        if (preferred?.date) yield { ...entry, date: preferred.date, day: preferred.day, timeSlotId: preferred.timeSlotId, classroomId: preferred.classroomId };
        const subject = data.subjects.find(subject => subject.id === entry.subjectId);
        const types = entry.classroomTypeIds?.length ? entry.classroomTypeIds : getRequiredClassroomTypes(subject, entry.classType);
        const rooms = [...data.classrooms].filter(room => types?.includes(room.typeId) && room.status !== 'closed' && room.status !== 'repair').sort((a, b) => Number(b.id === entry.classroomId) - Number(a.id === entry.classroomId) || a.capacity - b.capacity).slice(0, 12);
        const teachers = isIndividualEntry(entry) ? [entry.teacherId] : [...new Set([entry.teacherId, ...data.teacherSubjectLinks.filter(link => link.subjectId === entry.subjectId && link.classTypes.includes(entry.classType) && link.isActive !== false).sort((a, b) => (b.priority || 0) - (a.priority || 0)).map(link => link.teacherId)])].slice(0, 6);
        for (const offset of [0, 1, -1, 2, -2, 3, -3, 7, -7]) {
            const date = new Date(entry.date + 'T00:00:00'); date.setDate(date.getDate() + offset);
            const dateStr = toYYYYMMDD(date);
            if (dateStr < data.settings.semesterStart || dateStr > data.settings.semesterEnd) continue;
            const slots = [...getActiveTimeSlotsForDate(data, date)].sort((a, b) => Number(b.id === entry.timeSlotId) - Number(a.id === entry.timeSlotId));
            for (const slot of slots) for (const teacherId of teachers) for (const room of rooms) {
                if (Date.now() >= deadline) return;
                yield { ...entry, date: dateStr, day: DAYS_OF_WEEK[(date.getDay() + 6) % 7], timeSlotId: slot.id, classroomId: room.id, teacherId };
            }
        }
    };
    const remember = (changes: RepairPreview['changes']) => {
        changes = changes.filter(change => JSON.stringify(change.before) !== JSON.stringify(change.after));
        if (Date.now() >= deadline || validateRepair(data, changes, deadline).length) return;
        const signature = JSON.stringify(changes.map(change => change.after).sort((a, b) => a.id.localeCompare(b.id)));
        if (signatures.has(signature)) return; signatures.add(signature);
        const next = data.schedule.map(entry => changes.find(change => change.before.id === entry.id)?.after || entry);
        const warnings = replacementWarnings(changes, data);
        const score = changes.reduce((sum, change) => sum + Math.max(0, validate(change.after, next).softPenalty) + 150 + (change.before.date !== change.after.date ? 180 : 0) + (change.before.teacherId !== change.after.teacherId ? 120 : 0) + (change.before.classroomId !== change.after.classroomId ? 20 : 0), 0) + warnings.length * 1000;
        alternatives.push({ id: `alternative-${alternatives.length + 1}`, changes, score, warnings });
        alternatives.sort((a, b) => a.score - b.score || a.changes.length - b.changes.length);
    };
    const place = async (entry: ScheduleEntry, current: ScheduleEntry[], changes: RepairPreview['changes'], moving: Set<string>, preferred?: ScheduleEntry): Promise<RepairPreview['changes'] | null> => {
        if (entry.locked || moving.has(entry.id) || changes.length >= maxChanges || nodes++ > 60) return null;
        let checked = 0;
        for (const candidate of candidates(entry, preferred)) {
            if (Date.now() >= deadline || ++checked > 240) break;
            if (++probes % 16 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            const blockers = resourceConflicts(candidate, current, data);
            if (blockers.length > 2 || blockers.some(blocker => blocker.locked || moving.has(blocker.id) || !current.some(item => item.id === blocker.id))) continue;
            if (!validatePlacement(candidate, current.filter(item => !blockers.some(blocker => blocker.id === item.id))).valid) continue;
            let proposed = current.map(item => item.id === candidate.id ? candidate : item);
            let result = [...changes.filter(change => change.before.id !== entry.id), { before: data.schedule.find(item => item.id === entry.id)!, after: candidate }];
            let failed = false;
            for (const blocker of blockers) {
                const resolved = await place(blocker, proposed, result, new Set([...moving, entry.id]), entry);
                if (!resolved) { failed = true; break; }
                result = resolved; proposed = data.schedule.map(item => result.find(change => change.before.id === item.id)?.after || item);
            }
            if (failed) continue;
            if (!validatePlacement(candidate, proposed).valid) continue;
            if (entry.id === target.id) {
                remember(result);
                if (alternatives.length >= 8) break;
            } else return result;
        }
        return null;
    };
    await place(target, data.schedule, [], new Set());
    // Keeping the selected lesson in place may need moving its blockers instead.
    if (alternatives.length < 3 && Date.now() < deadline) for (const blocker of resourceConflicts(target, data.schedule, data).slice(0, 6)) {
        if (Date.now() >= deadline || !data.schedule.some(entry => entry.id === blocker.id)) break;
        const changes = await place(blocker, data.schedule, [], new Set([target.id]), target);
        if (changes) {
            const next = data.schedule.map(entry => changes.find(change => change.before.id === entry.id)?.after || entry);
            if (validate(target, next).valid) remember(changes);
        }
    }
    const selected = alternatives[0];
    return { ...base, alternatives: alternatives.slice(0, 5), selectedAlternativeId: selected?.id, changes: selected?.changes || [], elapsedMs: Date.now() - start, message: selected ? `Найдено вариантов: ${Math.min(5, alternatives.length)}. Изменений в выбранном: ${selected.changes.length}.` : 'За отведённое время безопасный локальный ход не найден. Расписание не изменено.' };
};
