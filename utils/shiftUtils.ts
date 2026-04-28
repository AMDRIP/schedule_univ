import { Group, StudyShift, TimeSlot, TimeSlotShift } from '../types';

export const SHIFT_LABELS: Record<StudyShift, string> = {
  first: '1 смена',
  second: '2 смена',
  both: 'Любая смена',
};

export const TIME_SLOT_SHIFT_LABELS: Record<TimeSlotShift, string> = {
  first: '1 смена',
  second: '2 смена',
};

export const getGroupShiftLabel = (shift?: StudyShift) => SHIFT_LABELS[shift || 'both'];

export const getTimeSlotShiftLabel = (shift?: TimeSlotShift) =>
  shift ? TIME_SLOT_SHIFT_LABELS[shift] : 'Без смены';

export const isTimeSlotCompatibleWithGroup = (timeSlot: TimeSlot | undefined, group: Group | undefined) => {
  if (!timeSlot || !group) return true;
  if (!timeSlot.shift || !group.shift || group.shift === 'both') return true;
  return timeSlot.shift === group.shift;
};

export const areGroupsCompatibleWithTimeSlot = (timeSlot: TimeSlot | undefined, groups: Group[]) =>
  groups.every(group => isTimeSlotCompatibleWithGroup(timeSlot, group));

export const getGroupsShiftMismatchText = (timeSlot: TimeSlot | undefined, groups: Group[]) => {
  if (!timeSlot || !timeSlot.shift) return '';

  const mismatchedGroups = groups.filter(group => !isTimeSlotCompatibleWithGroup(timeSlot, group));
  if (mismatchedGroups.length === 0) return '';

  return mismatchedGroups
    .map(group => `${group.number} (${getGroupShiftLabel(group.shift)})`)
    .join(', ');
};
