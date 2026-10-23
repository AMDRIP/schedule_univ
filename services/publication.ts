import { ScheduleEntry } from '../types';
import { GenerationData, createScheduleValidator, expandScheduleOccurrences, getActiveTimeSlotsForDate } from './heuristicScheduler';
import { planningSignature } from './scheduleRepair';
import { groupIdsOf, isIndividualEntry } from '../utils/participants';
import { slotInterval } from './campusTravel';
import { sanitizeFeed, sanitizeSnapshot, diffSnapshots, toICS, validDate } from '../integrations/publicSchedule.cjs';

export { diffSnapshots, toICS };
export interface PublicLesson {
    id: string; date: string; startTime: string; endTime: string; subjectId: string; subjectName: string;
    classType: string; deliveryMode: string; teacherIds: string[]; teacherNames: string[];
    classroomId: string; classroomName: string; groupIds: string[]; groupNames: string[]; subgroupName: string; shift?: 'first' | 'second' | 'both';
}
export interface PublicSnapshot {
    schemaVersion: 1; projectId: string; revisionId: string; version: number; title: string; publishedAt: string; timeZone: string;
    range: { start: string; end: string }; groups: { id: string; name: string }[]; teachers: { id: string; name: string }[];
    classrooms: { id: string; name: string }[]; lessons: PublicLesson[];
}
export interface ScheduleRevision {
    id: string; number: number; title: string; note: string; status: 'review' | 'published' | 'archived';
    createdAt: string; publishedAt?: string; restoredFrom?: string; sourceSignature: string;
    schedule: ScheduleEntry[]; snapshot: PublicSnapshot; excludedIndividual: number;
}
export interface PublicationState { revisions: ScheduleRevision[]; }
export const emptyPublications = (): PublicationState => ({ revisions: [] });
export const publishedRevision = (state: PublicationState) => state.revisions.find(item => item.status === 'published');
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const verifyPeriod = (data: GenerationData) => {
    const dates = [data.settings.semesterStart, data.settings.semesterEnd, ...data.schedule.flatMap(entry => entry.date ? [entry.date] : [])];
    if (dates.some(date => !validDate(date)) || data.settings.semesterEnd < data.settings.semesterStart) throw new Error('Проверьте границы семестра и даты занятий.');
    dates.sort(); const range = { start: dates[0], end: dates.at(-1) };
    if (Date.parse(range.end) - Date.parse(range.start) > 732 * 86400000) throw new Error('Проверьте границы семестра: период публикации не должен превышать два года.');
    return range;
};

export function prepareRevision(data: GenerationData, state: PublicationState, projectId: string, title: string, note = '', timeZone = 'Europe/Samara'): ScheduleRevision {
    const range = verifyPeriod(data);
    if (!title.trim()) throw new Error('Укажите название версии.');
    const number = Math.max(0, ...state.revisions.map(item => item.number)) + 1;
    const id = crypto.randomUUID();
    const publicEntries = expandScheduleOccurrences(data, data.schedule, { start: data.settings.semesterStart, end: data.settings.semesterEnd }).filter(entry => !isIndividualEntry(entry));
    const format = (minutes: number) => `${Math.floor(minutes / 60)}`.padStart(2, '0') + ':' + `${minutes % 60}`.padStart(2, '0');
    const slotsByDate = new Map<string, ReturnType<typeof getActiveTimeSlotsForDate>>();
    const recurring = new Set(data.schedule.filter(entry => !entry.date).map(entry => entry.unscheduledUid || entry.id));
    const lessons: PublicLesson[] = publicEntries.map(entry => {
        if (!slotsByDate.has(entry.date)) slotsByDate.set(entry.date, getActiveTimeSlotsForDate(data, entry.date));
        const slot = slotsByDate.get(entry.date).find(item => item.id === entry.timeSlotId);
        const interval = slotInterval(slot);
        if (!interval) throw new Error(`Некорректный слот занятия ${entry.id}.`);
        const groups = groupIdsOf(entry); const teachers = [...new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])].filter(Boolean))];
        const classroom = data.classrooms.find(item => item.id === entry.classroomId);
        return { id: entry.unscheduledUid ? entry.unscheduledUid + (recurring.has(entry.unscheduledUid) ? `@${entry.date}` : '') : entry.id, date: entry.date,
            startTime: format(interval.start), endTime: format(interval.end), subjectId: entry.subjectId,
            subjectName: data.subjects.find(item => item.id === entry.subjectId)?.name || entry.subjectId, classType: entry.classType, deliveryMode: entry.deliveryMode,
            teacherIds: teachers, teacherNames: teachers.map(id => data.teachers.find(item => item.id === id)?.name || id),
            classroomId: entry.classroomId, classroomName: [classroom?.number || entry.classroomId, classroom?.roomMetadata?.buildingName].filter(Boolean).join(', '),
            groupIds: groups, groupNames: groups.map(id => data.groups.find(item => item.id === id)?.number || id),
            subgroupName: data.subgroups.find(item => item.id === entry.subgroupId)?.name || '', shift: slot.shift };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
    const registry = (ids: string[], names: string[]) => ids.map((id, index) => ({ id, name: names[index] }));
    const unique = (items: { id: string; name: string }[]) => [...new Map(items.map(item => [item.id, item])).values()];
    const snapshot = sanitizeSnapshot({ schemaVersion: 1, projectId, revisionId: id, version: number, title: title.trim(), publishedAt: '', timeZone, range, lessons,
        groups: unique(lessons.flatMap(item => registry(item.groupIds, item.groupNames))), teachers: unique(lessons.flatMap(item => registry(item.teacherIds, item.teacherNames))),
        classrooms: unique(lessons.map(item => ({ id: item.classroomId, name: item.classroomName }))) }) as PublicSnapshot;
    return { id, number, title: title.trim(), note: note.trim(), status: 'review', createdAt: new Date().toISOString(), sourceSignature: planningSignature(data),
        schedule: clone(data.schedule), snapshot, excludedIndividual: data.schedule.filter(isIndividualEntry).length };
}

export async function publicationIssues(data: GenerationData): Promise<string[]> {
    const range = verifyPeriod(data);
    const schedule = expandScheduleOccurrences(data, data.schedule, { start: data.settings.semesterStart, end: data.settings.semesterEnd });
    if (!schedule.length) return ['Расписание пустое.'];
    if (new Set(schedule.map(item => item.id)).size !== schedule.length) return ['В расписании повторяются идентификаторы занятий.'];
    const validate = createScheduleValidator(data, { strictness: 5, iterations: 1, clearExisting: false, enforceLectureOrder: true, distributeEvenly: true, timeFrame: range }); const issues: string[] = [];
    let nextYield = Date.now() + 15;
    for (const entry of schedule) {
        if (Date.now() >= nextYield) { await new Promise(resolve => setTimeout(resolve, 0)); nextYield = Date.now() + 15; }
        const result = validate(entry, schedule);
        if (!result.valid) issues.push(`${entry.date}: ${data.subjects.find(item => item.id === entry.subjectId)?.name || entry.id}: ${result.issues.join(' ')}`);
        if (issues.length >= 50) break;
    }
    return issues;
}

export async function publishRevision(data: GenerationData, state: PublicationState, id: string): Promise<PublicationState> {
    const candidate = state.revisions.find(item => item.id === id && item.status === 'review');
    if (!candidate) throw new Error('Выберите версию на согласовании.');
    if (state.revisions.some(item => item.publishedAt && item.number >= candidate.number)) throw new Error('Уже опубликована более новая версия. Создайте новый снимок.');
    if (candidate.sourceSignature !== planningSignature(data)) throw new Error('Черновик или исходные данные изменились. Создайте новую версию для согласования.');
    const rebuilt = prepareRevision(data, state, candidate.snapshot.projectId, candidate.title, candidate.note, candidate.snapshot.timeZone);
    if (JSON.stringify(candidate.snapshot) !== JSON.stringify({ ...rebuilt.snapshot, revisionId: candidate.id, version: candidate.number }) || JSON.stringify(candidate.schedule) !== JSON.stringify(data.schedule)) throw new Error('Снимок версии не совпадает с проверяемым черновиком. Создайте новую версию.');
    const issues = await publicationIssues(data); if (issues.length) throw new Error(issues.join('\n'));
    if (!candidate.snapshot.lessons.length) throw new Error('Нет общегрупповых занятий для публикации. Индивидуальные записи не публикуются.');
    const publishedAt = new Date().toISOString();
    const result: PublicationState = { revisions: state.revisions.map(item => item.id === id ? { ...item, status: 'published', publishedAt, snapshot: { ...item.snapshot, publishedAt } } : item.status === 'published' ? { ...item, status: 'archived' } : item) };
    exportPublishedFeed(result);
    return result;
}

export function exportPublishedFeed(state: PublicationState) {
    const current = publishedRevision(state); if (!current) return null;
    return sanitizeFeed({ schemaVersion: 1, current: current.snapshot, history: state.revisions.filter(item => item.publishedAt && item.number < current.number).map(item => item.snapshot) });
}

export function normalizePublications(value: any, projectId: string): PublicationState {
    if (value == null) return emptyPublications();
    if (!Array.isArray(value.revisions)) throw new Error('Некорректная история публикаций.');
    const state = clone(value) as PublicationState;
    if (!Array.isArray(state.revisions) || state.revisions.length > 500) throw new Error('Некорректная история публикаций.');
    const versions = new Set<number>(); let published = 0;
    for (const item of state.revisions) {
        item.snapshot = sanitizeSnapshot(item.snapshot) as PublicSnapshot;
        if (item.snapshot.projectId !== projectId || item.id !== item.snapshot.revisionId || item.number !== item.snapshot.version || versions.has(item.number) || !['review', 'published', 'archived'].includes(item.status) || !Array.isArray(item.schedule) || typeof item.sourceSignature !== 'string' || item.publishedAt !== (item.snapshot.publishedAt || undefined) || item.status === 'published' && !item.publishedAt) throw new Error('Повреждена версия расписания.');
        versions.add(item.number); if (item.status === 'published') published++;
    }
    if (published > 1) throw new Error('В проекте несколько действующих публикаций.');
    const current = publishedRevision(state);
    if (current && state.revisions.some(item => item.publishedAt && item.number > current.number)) throw new Error('Нарушен порядок опубликованных версий.');
    exportPublishedFeed(state);
    return state;
}
