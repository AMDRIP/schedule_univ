import { AttestationType, AvailabilityType, ClassType, FormOfStudy, HeuristicConfig } from '../types';

export const config: HeuristicConfig = {
    strictness: 5, clearExisting: false, iterations: 1, enforceLectureOrder: true,
    distributeEvenly: true, seed: 5000, semesterParity: 'odd',
    timeFrame: { start: '2026-10-19', end: '2026-10-24' },
};

export const makeFixture = (): any => ({
    faculties: [], departments: [{ id: 'dep', name: 'Кафедра', facultyId: '' }], ugs: [{ id: 'ugs', name: 'Информатика', code: '09.00.00' }],
    teachers: [{ id: 'teacher', name: 'Научный руководитель', departmentId: 'dep' }, { id: 'reserve', name: 'Резервный преподаватель', departmentId: 'dep' }],
    groups: [{ id: 'group', number: 'М-1', course: 1, studentCount: 12, specialtyId: 'spec', departmentId: 'dep', formOfStudy: FormOfStudy.FullTime, shift: 'first' }],
    specialties: [{ id: 'spec', name: 'Информатика', code: '09.04.01', ugsId: 'ugs', educationLevel: 'master', durationYears: 2 }],
    classrooms: [{ id: 'room', number: '101', typeId: 'type', capacity: 30 }, { id: 'room2', number: '102', typeId: 'type', capacity: 30 }],
    classroomTypes: [{ id: 'type', name: 'Семинарская' }], classroomTags: [],
    subjects: [{ id: 'subject', name: 'Методы исследования', classroomTypeRequirements: { [ClassType.Lecture]: ['type'], [ClassType.Practical]: ['type'], [ClassType.Lab]: ['type'], [ClassType.Exam]: ['type'] } }],
    timeSlots: [{ id: 'first', time: '09:00-10:30', shift: 'first' }, { id: 'second', time: '10:45-12:15', shift: 'first' }],
    timeSlotsShortened: [], bellScheduleProfiles: [],
    teacherSubjectLinks: [{ id: 'link', teacherId: 'teacher', subjectId: 'subject', classTypes: Object.values(ClassType) }],
    educationalPlans: [{ id: 'plan', specialtyId: 'spec', formOfStudy: FormOfStudy.FullTime, entries: [{ subjectId: 'subject', semester: 1, lectureHours: 2, practiceHours: 2, labHours: 0, researchSeminarHours: 2, researchConsultationHours: 2, independentStudyHours: 144, coursework: { kind: 'paper', consultationHours: 2, defenseHours: 2 }, attestation: AttestationType.Exam }] }],
    settings: { semesterStart: config.timeFrame.start, semesterEnd: config.timeFrame.end, sessionStart: config.timeFrame.start, sessionEnd: config.timeFrame.end, allowWindows: true, enforceStandardRules: true, respectProductionCalendar: true, useShortenedPreHolidaySchedule: false, useEvenOddWeekSeparation: true, showScheduleColors: true, analyticsThresholds: {} },
    streams: [], subgroups: [], electives: [], productionCalendar: [], schedulingRules: [], schedule: [], academicWorks: [],
});

export const forbid = (slotIds = ['first', 'second']) => Object.fromEntries(['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'].map(day => [day, Object.fromEntries(slotIds.map(id => [id, AvailabilityType.Forbidden]))]));
