import { ScheduleEntry, ClassType, DeliveryMode } from '../types';
import { createScheduleValidator, GenerationData, getActiveTimeSlotsForDate } from './heuristicScheduler';
import { toYYYYMMDD } from '../utils/dateUtils';
import { DAYS_OF_WEEK } from '../constants';
import { studentIdentity } from '../utils/participants';

export interface AcademicEventRequest {
    workId: string;
    kind: NonNullable<ScheduleEntry['academicEventKind']>;
    start: string;
    end: string;
    committeeTeacherIds: string[];
}
export const planAcademicEvent = async (data: GenerationData, request: AcademicEventRequest): Promise<{ entry?: ScheduleEntry; issues: string[] }> => {
    const work = data.academicWorks?.find(item => item.id === request.workId);
    if (!work || work.status === 'defended') return { issues: ['Работа не найдена или уже защищена.'] };
    if (!request.start || !request.end || request.end < request.start || request.start < data.settings.semesterStart || request.end > data.settings.semesterEnd) return { issues: ['Период должен находиться в пределах семестра.'] };
    const committee = [...new Set([...(request.kind !== 'consultation' && work.reviewerId ? [work.reviewerId] : []), ...request.committeeTeacherIds])].filter(id => id !== work.supervisorId);
    if (request.kind !== 'consultation' && !committee.length) return { issues: ['Для предзащиты и защиты укажите хотя бы одного участника комиссии или рецензента.'] };
    const studentId = work.studentId || studentIdentity(work.studentName, work.groupId);
    if (work.studentId && !data.students?.some(student => student.id === work.studentId && student.groupId === work.groupId)) return { issues: ['Обучающийся научной работы не найден в реестре или относится к другой группе.'] };
    const students = data.students?.some(student => student.id === studentId) ? data.students : [...(data.students || []), { id: studentId, name: work.studentName, groupId: work.groupId }];
    const validate = createScheduleValidator({ ...data, students });
    const issues = new Map<string, number>();
    const start = new Date(request.start + 'T00:00:00');
    if (!Number.isFinite(start.getTime()) || toYYYYMMDD(start) !== request.start) return { issues: ['Некорректная дата.'] };
    let probes = 0;
    for (const date = start; toYYYYMMDD(date) <= request.end; date.setDate(date.getDate() + 1)) {
        const dateStr = toYYYYMMDD(date);
        if (request.kind === 'defense' && data.schedule.some(entry => entry.academicWorkId === work.id && entry.academicEventKind === 'predefense' && entry.date > dateStr)) continue;
        for (const slot of getActiveTimeSlotsForDate(data, date)) for (const room of data.classrooms) {
            if (++probes % 32 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            const entry: ScheduleEntry = {
                id: `academic-${work.id}-${Date.now()}-${probes}`, academicWorkId: work.id, academicEventKind: request.kind,
                additionalTeacherIds: committee, studentIds: [studentId], groupId: work.groupId, subjectId: work.subjectId, teacherId: work.supervisorId,
                classType: request.kind === 'consultation' ? ClassType.ResearchConsultation : work.kind === 'coursework' || work.kind === 'courseProject' ? ClassType.CourseworkDefense : ClassType.ThesisDefense,
                date: dateStr, day: DAYS_OF_WEEK[(date.getDay() + 6) % 7], timeSlotId: slot.id, classroomId: room.id, weekType: 'every', deliveryMode: DeliveryMode.Offline,
            };
            const result = validate(entry);
            if (result.valid) return { entry, issues: [] };
            for (const issue of result.issues) issues.set(issue, (issues.get(issue) || 0) + 1);
        }
    }
    return { issues: [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([issue]) => issue).concat('Общее свободное время для всех участников не найдено.') };
};
