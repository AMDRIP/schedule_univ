import { ScheduleEntry } from '../types';
import { createScheduleValidator, GenerationData, getActiveTimeSlotsForDate } from './heuristicScheduler';
import { DAYS_OF_WEEK } from '../constants';
import { toYYYYMMDD } from '../utils/dateUtils';

export interface RepairPreview {
    baseSignature: string;
    changes: { before: ScheduleEntry; after: ScheduleEntry }[];
    elapsedMs: number;
    message: string;
}
export const scheduleSignature = (schedule: ScheduleEntry[]) => JSON.stringify(schedule);

export const validateRepair = (data: GenerationData, changes: RepairPreview['changes'], deadline = Infinity): string[] => {
    const replacements = new Map(changes.map(change => [change.before.id, change.after]));
    const next = data.schedule.map(entry => replacements.get(entry.id) || entry);
    const validate = createScheduleValidator(data);
    // Recheck unchanged lessons too: aggregate and relative rules can be affected by a move.
    const issues: string[] = [];
    for (const entry of next) {
        if (Date.now() >= deadline) return ['Истёк лимит локального поиска.'];
        if (!entry.date) continue;
        const previous = data.schedule.find(item => item.id === entry.id)!;
        if (!replacements.has(entry.id) && !validate(previous, data.schedule).valid) continue;
        issues.push(...validate(entry, next).issues);
        if (issues.length) return issues;
    }
    return issues;
};

export const previewScheduleRepair = async (data: GenerationData, entryId: string, budgetMs = 3000): Promise<RepairPreview> => {
    const start = Date.now();
    const target = data.schedule.find(entry => entry.id === entryId);
    const base = { baseSignature: scheduleSignature(data.schedule), changes: [], elapsedMs: 0, message: '' };
    if (!target?.date) return { ...base, message: 'Для ремонта требуется занятие с календарной датой.' };
    const validate = createScheduleValidator(data);
    if (validate(target).valid) return { ...base, message: 'Занятие уже проходит общую проверку ограничений.' };
    let probes = 0;
    const candidates = function* (entry: ScheduleEntry) {
        for (const offset of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7]) {
            const date = new Date(entry.date + 'T00:00:00'); date.setDate(date.getDate() + offset);
            const dateStr = toYYYYMMDD(date);
            if (dateStr < data.settings.semesterStart || dateStr > data.settings.semesterEnd) continue;
            const day = DAYS_OF_WEEK[(date.getDay() + 6) % 7];
            const teacherIds = [...new Set([entry.teacherId, ...data.teacherSubjectLinks.filter(link => link.subjectId === entry.subjectId && link.classTypes.includes(entry.classType) && link.isActive !== false).map(link => link.teacherId)])];
            for (const slot of getActiveTimeSlotsForDate(data, date)) for (const room of data.classrooms) for (const teacherId of teacherIds) {
                if (Date.now() - start >= budgetMs) return;
                yield { ...entry, date: dateStr, day, timeSlotId: slot.id, classroomId: room.id, teacherId };
            }
        }
    };
    const finish = (changes: RepairPreview['changes']): RepairPreview => ({ ...base, changes, elapsedMs: Date.now() - start, message: changes.length ? `Найдено безопасное исправление: изменений ${changes.length}.` : 'За отведённое время безопасный локальный ход не найден. Расписание не изменено.' });
    for (const after of candidates(target)) {
        if (++probes % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (Date.now() - start >= budgetMs) return finish([]);
        if (Date.now() - start >= budgetMs * 0.6) break;
        if (validate(after).valid && !validateRepair(data, [{ before: target, after }], start + budgetMs).length) return finish([{ before: target, after }]);
    }
    const neighbors = data.schedule.filter(entry => entry.id !== target.id && entry.date === target.date && entry.timeSlotId === target.timeSlotId).slice(0, 8);
    for (const blocker of neighbors) for (const after of candidates(blocker)) {
        if (++probes % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (Date.now() - start >= budgetMs) return finish([]);
        const changes = [{ before: blocker, after }];
        const next = data.schedule.map(entry => entry.id === blocker.id ? after : entry);
        if (validate(target, next).valid && !validateRepair(data, changes, start + budgetMs).length) return finish(changes);
    }
    return finish([]);
};
