import { Group, HeuristicConfig } from '../types';
import { GenerationData } from './heuristicScheduler';
import { planningSignature } from './scheduleRepair';

export interface WhatIfTrialRequest {
    groupIds: string[];
    plannedGroups: Partial<Group>[];
    removedTeacherId?: string;
    closedClassroomId?: string;
    mode: 'rebuild' | 'complete';
    iterations: number;
    semesterParity: 'odd' | 'even' | 'all';
}
export const buildWhatIfScenario = (source: GenerationData, request: WhatIfTrialRequest): { data: GenerationData; config: HeuristicConfig; warnings: string[]; scopeGroupIds: string[] } => {
    const data: GenerationData = JSON.parse(planningSignature(source));
    const warnings: string[] = [];
    for (const [index, planned] of request.plannedGroups.entries()) {
        if (!data.specialties.some(specialty => specialty.id === planned.specialtyId)) throw new Error('У планируемой группы не указана действующая специальность.');
        const prototype = data.groups.find(group => group.specialtyId === planned.specialtyId && group.formOfStudy === planned.formOfStudy);
        const id = planned.id || `trial-group-${index}`;
        if (data.groups.some(group => group.id === id)) throw new Error('Номер идентификатора новой группы совпадает с существующей.');
        data.groups.push({ ...(prototype || {}), ...planned, id, number: planned.number || `Пробная группа ${index + 1}`, specialtyId: planned.specialtyId!, departmentId: planned.departmentId || prototype?.departmentId || '', course: planned.course || 1, formOfStudy: planned.formOfStudy || prototype?.formOfStudy || data.groups[0]?.formOfStudy, studentCount: planned.studentCount || 1, educationalPlanId: planned.educationalPlanId || undefined } as Group);
    }
    const scope = new Set(request.groupIds.length ? request.groupIds : source.groups.map(group => group.id));
    data.groups.filter(group => !source.groups.some(original => original.id === group.id)).forEach(group => scope.add(group.id));
    // Include stream-connected groups so a scoped rebuild cannot lose shared demand.
    let changed = true;
    while (changed) { changed = false; for (const stream of data.streams) if (stream.groupIds.some(id => scope.has(id))) for (const id of stream.groupIds) if (!scope.has(id)) { scope.add(id); changed = true; } }
    if (!scope.size) throw new Error('Для пробного расчёта нужны существующие или планируемые группы.');
    const period = { start: data.settings.semesterStart, end: data.settings.semesterEnd };
    if (request.removedTeacherId) {
        if (!data.teachers.some(teacher => teacher.id === request.removedTeacherId)) throw new Error('Исключаемый преподаватель не найден.');
        data.teacherSubjectLinks = data.teacherSubjectLinks.filter(link => link.teacherId !== request.removedTeacherId);
        data.resourceAbsences = [...(data.resourceAbsences || []), { id: 'trial-teacher-absence', kind: 'teacher', resourceId: request.removedTeacherId, ...period, reason: 'Исключён из пробного сценария' }];
    }
    if (request.closedClassroomId) data.classrooms = data.classrooms.map(room => room.id === request.closedClassroomId ? { ...room, status: 'closed' } : room);
    const isUnavailable = (entry: typeof data.schedule[number]) => entry.teacherId === request.removedTeacherId || entry.additionalTeacherIds?.includes(request.removedTeacherId || '') || entry.classroomId === request.closedClassroomId;
    if (request.mode === 'complete') data.schedule = data.schedule.filter(entry => entry.locked || !isUnavailable(entry) || !(entry.groupIds || [entry.groupId]).some(id => scope.has(id || '')));
    const retainedUnavailable = data.schedule.filter(entry => isUnavailable(entry) && (entry.locked || !(entry.groupIds || [entry.groupId]).some(id => scope.has(id || ''))));
    if (retainedUnavailable.length) warnings.push(`За пределами пересоставления или в закреплённых занятиях остаются недоступные ресурсы: ${retainedUnavailable.length} занятий.`);
    const expanded = [...scope].filter(id => !request.groupIds.includes(id) && source.groups.some(group => group.id === id));
    if (request.groupIds.length && expanded.length) warnings.push(`Область расширена по потокам: ${expanded.map(id => data.groups.find(group => group.id === id)?.number || id).join(', ')}.`);
    return { data, warnings, scopeGroupIds: [...scope], config: { timeFrame: period, clearExisting: request.mode === 'rebuild', targetGroupIds: [...scope], iterations: Math.max(1, Math.min(20, request.iterations)), strictness: 5, enforceLectureOrder: true, distributeEvenly: true, semesterParity: request.semesterParity, seed: 'what-if-5003', parallelWorkers: 0 } };
};
