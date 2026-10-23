import { BuildingPlan, Classroom, DeliveryMode, ScheduleEntry, SchedulingSettings, Student, TimeSlot } from '../types';
import { groupIdsOf, groupsShareParticipants, isIndividualEntry, studentIdsOf } from '../utils/participants';

export const DEFAULT_TRAVEL_POLICY = { enabled: false, sameBuildingMinutes: 3, perFloorMinutes: 2, betweenBuildingsMinutes: 20 };
export const slotInterval = (slot?: TimeSlot) => {
    const match = slot?.time?.match(/^\s*(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*$/);
    if (!match) return undefined;
    const [startHour, startMinute, endHour, endMinute] = match.slice(1).map(Number);
    if (startHour > 23 || endHour > 24 || startMinute > 59 || endMinute > 59 || endHour === 24 && endMinute !== 0) return undefined;
    const [start, end] = [Number(match[1]) * 60 + Number(match[2]), Number(match[3]) * 60 + Number(match[4])];
    return end > start && end <= 1440 ? { start, end } : undefined;
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
}, slots: TimeSlot[], attendingStudents?: Student[], classroomIndex?: Map<string, Classroom>): string[] => {
    const issues: string[] = [];
    const participants = attendingStudents || (data.students || []).filter(student => entry.studentIds?.length ? entry.studentIds.includes(student.id) : groupIdsOf(entry).includes(student.groupId));
    const floor = data.buildingPlans?.find(plan => plan.id === room.roomMetadata?.buildingPlanId)?.floors.find(item => item.id === room.roomMetadata?.floorId);
    for (const student of entry.deliveryMode === DeliveryMode.Online ? [] : participants) {
        if (student.requiredClassroomTagIds?.some(id => !room.tagIds?.includes(id))) issues.push(`Не выполнены требования аудитории обучающегося: ${student.name}.`);
        if (student.requiresStepFreeAccess && !(room.stepFreeAccess === true || (room.stepFreeAccess !== false && floor?.stepFreeAccess === true))) issues.push(`Не подтверждён безбарьерный доступ: ${student.name}.`);
    }
    if (!data.settings.travelPolicy?.enabled) return issues;
    const interval = slotInterval(slot);
    if (!interval) {
        if (slot) issues.push(`Некорректный интервал звонков: ${slot.time}.`);
        return issues;
    }
    const slotsById = new Map<string, TimeSlot>();
    slots.forEach(value => { if (!slotsById.has(value.id)) slotsById.set(value.id, value); });
    const roomsById = classroomIndex || new Map(data.classrooms.map(value => [value.id, value]));
    const teacherIds = new Set([entry.teacherId, ...(entry.additionalTeacherIds || [])].filter(Boolean));
    const sessions = nearby.filter(other => (!entry.date || !other.date || other.date === entry.date) && ([other.teacherId, ...(other.additionalTeacherIds || [])].some(id => teacherIds.has(id)) || groupsShareParticipants(entry, other))).map(other => ({ entry: other, range: slotInterval(slotsById.get(other.timeSlotId)), room: roomsById.get(other.classroomId), candidate: false }));
    sessions.push({ entry: { ...entry, timeSlotId: slot!.id, classroomId: room.id }, range: interval, room, candidate: true });
    sessions.sort((a, b) => (a.range?.start ?? Infinity) - (b.range?.start ?? Infinity));

    // Students with the same daily attendance share a timeline, but not another student's intervening class.
    const timelines = new Map<string, { sessions: typeof sessions; extra: number; label: string }>();
    const addTimeline = (attends: (other: ScheduleEntry) => boolean, extra: number, label: string) => {
        const indices = sessions.flatMap((item, index) => item.candidate || attends(item.entry) ? [index] : []);
        const key = `${extra}:${indices.join(',')}`;
        if (!timelines.has(key)) timelines.set(key, { sessions: indices.map(index => sessions[index]), extra, label });
    };
    teacherIds.forEach(id => addTimeline(other => [other.teacherId, ...(other.additionalTeacherIds || [])].includes(id), 0, `преподаватель ${id}`));
    if (!isIndividualEntry(entry)) groupIdsOf(entry).forEach(id => addTimeline(other => !isIndividualEntry(other) && groupIdsOf(other).includes(id), 0, `группа ${id}`));
    participants.forEach(student => addTimeline(other => isIndividualEntry(other) ? studentIdsOf(other).includes(student.id) : groupIdsOf(other).includes(student.groupId), minutes(student.extraTransitionMinutes, 0), `обучающийся ${student.name}`));
    // Invalid roster references are diagnosed by the shared validator; keep explicit occupancy conservative here too.
    studentIdsOf(entry).filter(id => !participants.some(student => student.id === id)).forEach(id => addTimeline(other => studentIdsOf(other).includes(id) || !isIndividualEntry(other) && groupIdsOf(other).some(group => groupIdsOf(entry).includes(group)), 0, `обучающийся ${id}`));

    timelines.forEach(timeline => {
        timeline.sessions.filter(item => !item.range).forEach(item => issues.push(`Некорректный интервал звонков занятия ${item.entry.id} (${timeline.label}).`));
        const physical = timeline.sessions.filter(item => item.range && item.entry.deliveryMode !== DeliveryMode.Online);
        for (let index = 1; index < physical.length; index++) {
            const from = physical[index - 1], to = physical[index];
            if (!from.room || !to.room || from.room.id === to.room.id || from.range!.end > to.range!.start) continue;
            const candidateBlocksGap = entry.deliveryMode === DeliveryMode.Online && interval.start < to.range!.start && interval.end > from.range!.end;
            if (!from.candidate && !to.candidate && !candidateBlocksGap) continue;
            const required = transitionMinutes(from.room, to.room, data.buildingPlans || [], data.settings);
            if (required === undefined) continue;
            const occupied = timeline.sessions.filter(item => item.entry.deliveryMode === DeliveryMode.Online && item.range).map(item => ({ start: Math.max(from.range!.end, item.range!.start), end: Math.min(to.range!.start, item.range!.end) })).filter(range => range.end > range.start).sort((a, b) => a.start - b.start);
            let unavailable = 0, end = from.range!.end;
            occupied.forEach(range => { unavailable += Math.max(0, range.end - Math.max(end, range.start)); end = Math.max(end, range.end); });
            const available = to.range!.start - from.range!.end - unavailable;
            if (available < required + timeline.extra) issues.push(`Недостаточно времени на переход ${from.room.number} → ${to.room.number}: нужно ${required + timeline.extra} мин., доступно ${available} мин. (${timeline.label}).`);
        }
    });
    return [...new Set(issues)];
};
