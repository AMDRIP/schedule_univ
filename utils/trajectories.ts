import { Elective, Group, ScheduleEntry, Student, UnscheduledEntry, DeliveryMode, ClassType, Subject } from '../types';
import { groupIdsOf } from './participants';

export const electiveIdOf = (uid?: string) => uid?.match(/^unsched-elective-(.+)-\d+$/)?.[1];

export const matchesElectiveUid = (uid: string | undefined, id: string) => {
    const prefix = `unsched-elective-${id}-`;
    return !!uid?.startsWith(prefix) && /^\d+$/.test(uid.slice(prefix.length));
};

export const electiveParticipants = (elective: Elective, students: Student[], groups: Group[]) => {
    const studentIds = [...new Set(elective.studentIds || [])];
    const selected = students.filter(student => studentIds.includes(student.id));
    const groupIds = studentIds.length
        ? [...new Set(selected.map(student => student.groupId))]
        : [...new Set(elective.groupIds?.length ? elective.groupIds : [elective.groupId].filter(Boolean))];
    const issues: string[] = [];
    if (studentIds.length !== selected.length) issues.push('Не найдены все обучающиеся учебного объединения.');
    if (!groupIds.length || groupIds.some(id => !groups.some(group => group.id === id))) issues.push('Не найдены все группы учебного объединения.');
    return { studentIds, groupIds, issues, studentCount: studentIds.length || groups.filter(group => groupIds.includes(group.id)).reduce((sum, group) => sum + group.studentCount, 0) };
};

export const electiveDemand = (elective: Elective, students: Student[], groups: Group[]): UnscheduledEntry[] => {
    const participants = electiveParticipants(elective, students, groups);
    const count = Math.ceil(Math.max(0, elective.hoursPerSemester) / 2);
    return Array.from({ length: count }, (_, i) => ({
        uid: `unsched-elective-${elective.id}-${i}`, subjectId: elective.subjectId, semester: elective.semester,
        groupId: participants.groupIds[0] || elective.groupId,
        groupIds: participants.groupIds, studentIds: participants.studentIds.length ? participants.studentIds : undefined,
        classType: elective.classType || ClassType.Elective, teacherId: elective.teacherId, teacherCandidates: [elective.teacherId],
        studentCount: participants.studentCount, deliveryMode: elective.deliveryMode || DeliveryMode.Offline,
        classroomTypeIds: elective.classroomTypeIds, requiredClassroomTagIds: elective.requiredClassroomTagIds,
        pinnedClassroomId: elective.pinnedClassroomId, preferredTimeSlotIds: elective.preferredTimeSlotIds,
    }));
};

export const studentAttends = (entry: ScheduleEntry, student: Student) => entry.studentIds?.length
    ? entry.studentIds.includes(student.id)
    : !entry.academicWorkId && groupIdsOf(entry).includes(student.groupId);

export const linkSubjectRoomTypes = (subject: Subject, classTypes: ClassType[], typeIds: string[], mode: 'add' | 'replace'): Subject => ({
    ...subject,
    classroomTypeRequirements: {
        ...subject.classroomTypeRequirements,
        ...Object.fromEntries(classTypes.map(type => [type, [...new Set(mode === 'add' ? [...(subject.classroomTypeRequirements?.[type] || []), ...typeIds] : typeIds)]])),
    },
});
