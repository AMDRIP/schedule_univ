import { BuildingPlan, Classroom, DeliveryMode, ScheduleEntry, SchedulingSettings, Student, TimeSlot } from '../types';
import { groupIdsOf, groupsShareParticipants } from '../utils/participants';

export const DEFAULT_TRAVEL_POLICY = { enabled: false, sameBuildingMinutes: 3, perFloorMinutes: 2, betweenBuildingsMinutes: 20 };
export const slotInterval = (slot?: TimeSlot) => {
    const match = slot?.time.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (!match) return undefined;
    const [start, end] = [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])];
    return end > start && end < 1440 ? { start, end } : undefined;
};
const minutes = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! >= 0 ? value! : fallback;

export const transitionMinutes = (from: Classroom, to: Classroom, buildings: BuildingPlan[], settings: SchedulingSettings) => {
    if (from.id === to.id) return 0;
    const policy = { ...DEFAULT_TRAVEL_POLICY, ...settings.travelPolicy };
    const a = from.roomMetadata, b = to.roomMetadata;
    if (!a?.buildingPlanId || !b?.buildingPlanId) return undefined;
    if (a.buildingPlanId === b.buildingPlanId) {
        return minutes(policy.sameBuildingMinutes, 3) + Math.abs((a.floorNumber ?? 1) - (b.floorNumber ?? 1)) * minutes(policy.perFloorMinutes, 2);
    }
    return minutes(buildings.find(plan => plan.id === a.buildingPlanId)?.travelMinutesTo?.[b.buildingPlanId], minutes(policy.betweenBuildingsMinutes, 20));
};

export const campusPlacementIssues = (entry: ScheduleEntry, room: Classroom, slot: TimeSlot | undefined, nearby: ScheduleEntry[], data: {
    students?: Student[]; classrooms: Classroom[]; buildingPlans?: BuildingPlan[]; settings: SchedulingSettings;
}, slots: TimeSlot[], attendingStudents?: Student[]): string[] => {
    if (entry.deliveryMode === DeliveryMode.Online) return [];
    const issues: string[] = [];
    const participants = attendingStudents || (data.students || []).filter(student => entry.studentIds?.length ? entry.studentIds.includes(student.id) : groupIdsOf(entry).includes(student.groupId));
    const floor = data.buildingPlans?.find(plan => plan.id === room.roomMetadata?.buildingPlanId)?.floors.find(item => item.id === room.roomMetadata?.floorId);
    for (const student of participants) {
        if (student.requiredClassroomTagIds?.some(id => !room.tagIds?.includes(id))) issues.push(`Не выполнены требования аудитории обучающегося: ${student.name}.`);
        if (student.requiresStepFreeAccess && !(room.stepFreeAccess === true || (room.stepFreeAccess !== false && floor?.stepFreeAccess === true))) issues.push(`Не подтверждён безбарьерный доступ: ${student.name}.`);
    }
    if (!data.settings.travelPolicy?.enabled) return issues;
    const interval = slotInterval(slot);
    if (!interval) return issues;
    const teacherIds = [entry.teacherId, ...(entry.additionalTeacherIds || [])];
    for (const other of nearby) {
        if (other.deliveryMode === DeliveryMode.Online) continue;
        const sharedTeacher = [other.teacherId, ...(other.additionalTeacherIds || [])].some(id => id && teacherIds.includes(id));
        if (!sharedTeacher && !groupsShareParticipants(entry, other)) continue;
        const otherRange = slotInterval(slots.find(value => value.id === other.timeSlotId));
        const otherRoom = data.classrooms.find(value => value.id === other.classroomId);
        if (!otherRange || !otherRoom || otherRoom.id === room.id || otherRange.start < interval.end && interval.start < otherRange.end) continue;
        const before = otherRange.end <= interval.start;
        const required = transitionMinutes(before ? otherRoom : room, before ? room : otherRoom, data.buildingPlans || [], data.settings);
        if (required === undefined) continue;
        const extra = Math.max(0, ...participants.filter(student => other.studentIds?.length ? other.studentIds.includes(student.id) : groupIdsOf(other).includes(student.groupId)).map(student => minutes(student.extraTransitionMinutes, 0)));
        const available = before ? interval.start - otherRange.end : otherRange.start - interval.end;
        if (available < required + extra) issues.push(`Недостаточно времени на переход ${before ? otherRoom.number : room.number} → ${before ? room.number : otherRoom.number}: нужно ${required + extra} мин., доступно ${available} мин. (${sharedTeacher ? 'преподаватель' : 'обучающиеся'}).`);
    }
    return [...new Set(issues)];
};
