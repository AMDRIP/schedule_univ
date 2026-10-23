import { AcademicWork, ScheduleEntry, Student, UnscheduledEntry } from '../types';

type Entry = Pick<ScheduleEntry, 'groupId' | 'groupIds' | 'studentIds' | 'academicWorkId' | 'teacherId' | 'additionalTeacherIds' | 'classroomId'>;
export const groupIdsOf = (entry: Pick<Entry, 'groupId' | 'groupIds'>) => [...new Set((entry.groupIds?.length ? entry.groupIds : entry.groupId ? [entry.groupId] : []).filter(Boolean))];
export const isIndividualEntry = (entry: Pick<Entry, 'studentIds' | 'academicWorkId'>) => !!(entry.academicWorkId || entry.studentIds?.length);
export const studentIdentity = (name: string, groupId: string) => `student-${encodeURIComponent(groupId)}-${encodeURIComponent(name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU'))}`;
export const migrateStudents = (students: Student[] = [], works: AcademicWork[] = [], schedule: ScheduleEntry[] = []) => {
    const result = students.map(student => ({ ...student }));
    const academicWorks = works.map(work => {
        let student = result.find(student => student.id === work.studentId) || (!work.studentId ? result.find(student => student.groupId === work.groupId && student.name.trim().toLocaleLowerCase('ru-RU') === work.studentName.trim().toLocaleLowerCase('ru-RU')) : undefined);
        if (!student && !work.studentId && work.studentName.trim()) {
            student = { id: studentIdentity(work.studentName, work.groupId), name: work.studentName.trim(), groupId: work.groupId };
            result.push(student);
        }
        return { ...work, studentId: student?.id || work.studentId };
    });
    return { students: result, academicWorks, schedule: schedule.map(entry => {
        const work = academicWorks.find(work => work.id === entry.academicWorkId);
        return work?.studentId && !entry.studentIds?.length ? { ...entry, studentIds: [work.studentId] } : entry;
    }) };
};
export const studentIdsOf = (entry: Pick<Entry, 'studentIds' | 'academicWorkId'>) => [...new Set(entry.studentIds?.length ? entry.studentIds : entry.academicWorkId ? [`work:${entry.academicWorkId}`] : [])];
export const resolveParticipantEntry = (entry: ScheduleEntry, works: AcademicWork[] = []) => {
    const work = works.find(work => work.id === entry.academicWorkId);
    return work && !entry.studentIds?.length ? { ...entry, studentIds: [work.studentId || studentIdentity(work.studentName, work.groupId)] } : entry;
};
export const bookedResourceKeys = (entry: Entry) => [
    ...new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])].filter(Boolean).map(id => `teacher-${id}`)),
    `classroom-${entry.classroomId}`,
    ...groupIdsOf(entry).map(id => `${isIndividualEntry(entry) ? 'individual-group' : 'group'}-${id}`),
    ...studentIdsOf(entry).map(id => `student-${id}`),
];
export const groupsShareParticipants = (first: Entry, second: Entry) => {
    if (!isIndividualEntry(first) || !isIndividualEntry(second)) return groupIdsOf(first).some(id => groupIdsOf(second).includes(id));
    return studentIdsOf(first).some(id => studentIdsOf(second).includes(id));
};
export const sharesResource = (first: Entry, second: Entry) => first.classroomId === second.classroomId ||
    [first.teacherId, ...(first.additionalTeacherIds || [])].some(id => [second.teacherId, ...(second.additionalTeacherIds || [])].includes(id)) || groupsShareParticipants(first, second);
