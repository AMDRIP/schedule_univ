import { ResourceAbsence, ScheduleEntry, SubstitutionRecord } from '../types';
import { createScheduleValidator, GenerationData } from './heuristicScheduler';
import { planningSignature, previewScheduleRepair, replacementWarnings, validateRepair } from './scheduleRepair';
import { toYYYYMMDD } from '../utils/dateUtils';

export interface SubstitutionPreview {
    signature: string;
    record: SubstitutionRecord;
    unresolved: { entry: ScheduleEntry; issues: string[] }[];
}
export const affectedByAbsence = (entry: ScheduleEntry, absence: ResourceAbsence) => !!entry.date && entry.date >= absence.start && entry.date <= absence.end && (absence.kind === 'teacher' ? [entry.teacherId, ...(entry.additionalTeacherIds || [])].includes(absence.resourceId) : entry.classroomId === absence.resourceId);
export const previewSubstitution = async (data: GenerationData, absence: ResourceAbsence, budgetMs = 10000): Promise<SubstitutionPreview> => {
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T00:00:00').getTime()) && toYYYYMMDD(new Date(value + 'T00:00:00')) === value;
    if (!absence.reason.trim() || !validDate(absence.start) || !validDate(absence.end) || absence.end < absence.start) throw new Error('Укажите корректный период и причину недоступности.');
    if (!(absence.kind === 'teacher' ? data.teachers : data.classrooms).some(resource => resource.id === absence.resourceId)) throw new Error('Ресурс не найден.');
    const affected = data.schedule.filter(entry => affectedByAbsence(entry, absence));
    if (data.schedule.some(entry => !entry.date && (absence.kind === 'teacher' ? [entry.teacherId, ...(entry.additionalTeacherIds || [])].includes(absence.resourceId) : entry.classroomId === absence.resourceId))) throw new Error('Для ресурса есть недельные шаблоны. Сначала разверните их в датированные занятия.');
    const deadline = Date.now() + budgetMs;
    let scenario: GenerationData = { ...data, resourceAbsences: [...(data.resourceAbsences || []), absence], schedule: [...data.schedule] };
    for (const entry of affected) {
        if (Date.now() >= deadline) break;
        const current = scenario.schedule.find(item => item.id === entry.id)!;
        if (createScheduleValidator(scenario)(current).valid) continue;
        const proposal = await previewScheduleRepair(scenario, entry.id, Math.min(1500, Math.max(0, deadline - Date.now())));
        if (proposal.changes.length) {
            const byId = new Map(proposal.changes.map(change => [change.before.id, change.after]));
            scenario = { ...scenario, schedule: scenario.schedule.map(item => byId.get(item.id) || item) };
        }
    }
    const validate = createScheduleValidator(scenario);
    const unresolved = affected.flatMap(entry => {
        const current = scenario.schedule.find(item => item.id === entry.id)!;
        const result = validate(current); return result.valid ? [] : [{ entry, issues: result.issues }];
    });
    const changes = data.schedule.flatMap(before => { const after = scenario.schedule.find(item => item.id === before.id)!; return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ before, after }]; });
    return { signature: planningSignature(data), unresolved, record: { id: `substitution-${Date.now()}-${Math.random()}`, absence, createdAt: new Date().toISOString(), changes, warnings: replacementWarnings(changes, data) } };
};
export const validateSubstitution = (data: GenerationData, record: SubstitutionRecord) => {
    const cancellations = new Set(record.changes.filter(change => !change.after).map(change => change.before.id));
    if (record.changes.some(change => change.before.locked)) throw new Error('Закреплённые занятия нельзя переносить или снимать.');
    const scenario = { ...data, resourceAbsences: [...(data.resourceAbsences || []), record.absence], schedule: data.schedule.filter(entry => !cancellations.has(entry.id)) };
    const changes = record.changes.filter(change => !!change.after) as { before: ScheduleEntry; after: ScheduleEntry }[];
    const issues = validateRepair(scenario, changes);
    const next = scenario.schedule.map(entry => changes.find(change => change.before.id === entry.id)?.after || entry);
    for (const entry of next.filter(entry => affectedByAbsence(entry, record.absence))) issues.push('Не для всех занятий недоступного ресурса найдена замена.');
    if (issues.length) throw new Error([...new Set(issues)].join('\n'));
    return next;
};
