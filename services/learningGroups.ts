import { Elective, ScheduleEntry } from '../types';
import { electiveDemand, electiveParticipants, matchesElectiveUid } from '../utils/trajectories';
import { createScheduleValidator, expandScheduleOccurrences, GenerationData } from './heuristicScheduler';

export const prepareLearningGroupUpdate = (data: GenerationData, draft: Elective) => {
    if (!draft.name.trim() || !data.subjects.some(subject => subject.id === draft.subjectId) || !data.teachers.some(teacher => teacher.id === draft.teacherId)) throw new Error('Укажите название, дисциплину и преподавателя.');
    if (!Number.isInteger(draft.hoursPerSemester) || draft.hoursPerSemester < 1 || draft.hoursPerSemester > 2000) throw new Error('Количество часов должно быть целым числом от 1 до 2000.');
    if (draft.semester !== undefined && (!Number.isInteger(draft.semester) || draft.semester < 1 || draft.semester > 20)) throw new Error('Номер семестра должен быть от 1 до 20.');
    const participants = electiveParticipants(draft, data.students || [], data.groups);
    if (participants.issues.length) throw new Error(participants.issues.join('\n'));
    const elective = { ...draft, name: draft.name.trim(), groupId: participants.groupIds[0], groupIds: participants.groupIds, studentIds: participants.studentIds.length ? participants.studentIds : undefined };
    const electives = data.electives.some(item => item.id === elective.id) ? data.electives.map(item => item.id === elective.id ? elective : item) : [...data.electives, elective];
    const affected = data.schedule.filter(entry => matchesElectiveUid(entry.unscheduledUid, elective.id) && (!entry.date || entry.date >= data.settings.semesterStart && entry.date <= data.settings.semesterEnd));
    const period = { start: data.settings.semesterStart, end: data.settings.semesterEnd };
    if (expandScheduleOccurrences(data, affected, period).length > Math.ceil(elective.hoursPerSemester / 2)) throw new Error('В расписании больше занятий, чем в новом объёме часов. Сначала снимите лишние занятия.');
    const demand = electiveDemand(elective, data.students || [], data.groups)[0];
    const schedule = data.schedule.map(entry => {
        if (!affected.includes(entry)) return entry;
        const { uid, studentCount, teacherCandidates, ...changes } = demand;
        const next: ScheduleEntry = { ...entry, ...changes };
        const identity = (value: ScheduleEntry) => JSON.stringify([value.subjectId, value.teacherId, value.classType, value.deliveryMode, value.semester, [...(value.studentIds || [])].sort(), [...(value.groupIds?.length ? value.groupIds : [value.groupId])].sort(), value.classroomTypeIds, value.requiredClassroomTagIds, value.pinnedClassroomId, value.preferredTimeSlotIds]);
        if (entry.locked && identity(entry) !== identity(next)) throw new Error('Состав закреплённого занятия нельзя изменить. Сначала снимите закрепление.');
        return next;
    });
    const validate = createScheduleValidator({ ...data, electives, schedule }, undefined, { finalValidation: false });
    const occurrences = expandScheduleOccurrences({ ...data, schedule }, schedule, period);
    const affectedIds = new Set(expandScheduleOccurrences({ ...data, schedule }, schedule.filter(item => affected.some(old => old.id === item.id)), period).map(entry => entry.id));
    for (const entry of occurrences.filter(item => affectedIds.has(item.id))) {
        const result = validate(entry, occurrences);
        if (!result.valid) throw new Error(`Новый состав не помещается в существующее расписание (${entry.date}): ${result.issues.join(' ')}`);
    }
    return { elective, electives, schedule };
};
