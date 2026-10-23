import { AttestationType, ClassType, EducationalPlan, Group, ScheduleEntry, Stream, Subgroup } from '../types';
import { getPlanForGroup, getPlanContactActivities, matchesSemesterParity } from '../utils/educationUtils';
import { isSemesterInCourse } from '../utils/semesterUtils';
import { isIndividualEntry } from '../utils/participants';

export interface PlanBalanceRow {
    groupId: string; subjectId: string; classType: ClassType; subgroupId?: string;
    requiredHours: number; scheduledHours: number; missingHours: number; excessHours: number;
    planId?: string;
}
export const calculatePlanBalance = (data: {
    groups: Group[]; educationalPlans: EducationalPlan[]; schedule: ScheduleEntry[]; streams: Stream[]; subgroups: Subgroup[];
}, period: { start: string; end: string; parity: 'odd' | 'even' | 'all' }): PlanBalanceRow[] => {
    const rows = new Map<string, PlanBalanceRow>();
    const getRow = (groupId: string, subjectId: string, classType: ClassType, subgroupId?: string) => {
        const key = JSON.stringify([groupId, subjectId, classType, subgroupId || '']);
        if (!rows.has(key)) rows.set(key, { groupId, subjectId, classType, subgroupId, requiredHours: 0, scheduledHours: 0, missingHours: 0, excessHours: 0 });
        return rows.get(key)!;
    };
    for (const group of data.groups) {
        const plan = getPlanForGroup(group, data.educationalPlans);
        for (const item of plan?.entries || []) {
            if (!isSemesterInCourse(item.semester, group.course) || !matchesSemesterParity(item.semester, period.parity)) continue;
            const activities = getPlanContactActivities(item);
            if (item.coursework?.defenseHours) activities.push({ type: ClassType.CourseworkDefense, hours: item.coursework.defenseHours });
            const attestation = ({ [AttestationType.Exam]: ClassType.Exam, [AttestationType.Test]: ClassType.Test,
                [AttestationType.DifferentiatedTest]: ClassType.Test, [AttestationType.CandidateExam]: ClassType.CandidateExam,
                [AttestationType.ResearchReport]: ClassType.ResearchAttestation, [AttestationType.ThesisDefense]: ClassType.ThesisDefense })[item.attestation];
            if (attestation) activities.push({ type: attestation, hours: 2 });
            for (const activity of activities.filter(activity => activity.hours > 0)) {
                const subgroups = item.splitForSubgroups && [ClassType.Practical, ClassType.Lab].includes(activity.type)
                    ? data.subgroups.filter(subgroup => subgroup.parentGroupId === group.id) : [];
                for (const subgroupId of subgroups.length ? subgroups.map(subgroup => subgroup.id) : [undefined]) {
                    const row = getRow(group.id, item.subjectId, activity.type, subgroupId);
                    row.planId = plan!.id; row.requiredHours += activity.hours;
                }
            }
        }
    }
    for (const entry of data.schedule) {
        if (!entry.date || entry.date < period.start || entry.date > period.end || isIndividualEntry(entry) || entry.classType === ClassType.Elective) continue;
        const groupIds = entry.groupIds?.length ? entry.groupIds : entry.groupId ? [entry.groupId] : data.streams.find(stream => stream.id === entry.streamId)?.groupIds || [];
        for (const groupId of new Set(groupIds)) getRow(groupId, entry.subjectId, entry.classType, entry.subgroupId).scheduledHours += 2;
    }
    return [...rows.values()].map(row => ({ ...row, missingHours: Math.max(0, row.requiredHours - row.scheduledHours), excessHours: Math.max(0, row.scheduledHours - row.requiredHours) }));
};
