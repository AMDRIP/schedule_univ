import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassType, AttestationType, DeliveryMode, RuleAction, RuleSeverity, SessionSchedulerConfig, ScheduleEntry } from '../types';
import { generateSessionEventPool, generateSessionSchedule, getRetainedSessionSchedule } from '../services/sessionScheduler';
import { createScheduleValidator } from '../services/heuristicScheduler';
import { makeFixture, forbid } from './fixtures';

const configuration = (patch: Partial<SessionSchedulerConfig> = {}): SessionSchedulerConfig => ({
    timeFrame: { start: '2026-10-19', end: '2026-10-24' }, clearExisting: false,
    restDays: 2, consultationOffset: 0, scheduleTests: 'like_exams', semesterParity: 'odd', includeCoursework: false, ...patch,
});
const fixture = () => {
    const data = makeFixture();
    data.settings.enforceStandardRules = false;
    data.educationalPlans[0].entries = [{ subjectId: 'subject', semester: 1, lectureHours: 2, practiceHours: 2, labHours: 0, attestation: AttestationType.Exam }];
    data.subjects[0].classroomTypeRequirements = Object.fromEntries(Object.values(ClassType).map(type => [type, ['type']]));
    return data;
};
const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    id: 'existing', subjectId: 'other', groupId: 'group', teacherId: 'reserve', classroomId: 'room2',
    classType: ClassType.Exam, date: '2026-10-21', day: 'Среда', timeSlotId: 'first', weekType: 'every', deliveryMode: DeliveryMode.Offline, ...patch,
});

test('session never loses events whose teacher binding is missing', async () => {
    const data = fixture(); data.teacherSubjectLinks = [];
    const config = configuration({ consultationOffset: 1 });
    assert.equal(generateSessionEventPool(data, config).length, 2);
    const result = await generateSessionSchedule(data, config);
    assert.equal(result.schedule.length, 0); assert.equal(result.unschedulable.length, 2);
    assert.ok(result.unschedulable.every(event => (event as any).issues?.length));
});

test('session tries another correctly bound teacher when the first is unavailable', async () => {
    const data = fixture(); data.teachers[0].availabilityGrid = forbid();
    data.teacherSubjectLinks.push({ ...data.teacherSubjectLinks[0], id: 'reserve-binding', teacherId: 'reserve' });
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].teacherId, 'reserve');
});

test('session reserves a feasible consultation before selecting the exam date', async () => {
    const data = fixture();
    const result = await generateSessionSchedule(data, configuration({ consultationOffset: 1 }));
    assert.equal(result.schedule.length, 2); assert.equal(result.unschedulable.length, 0);
    assert.equal(result.schedule.find(entry => entry.classType === ClassType.Consultation)?.date, '2026-10-19');
    assert.equal(result.schedule.find(entry => entry.classType === ClassType.Exam)?.date, '2026-10-20');
});

test('session respects rest days before and after retained exams', async () => {
    const data = fixture(); data.schedule = [lesson()];
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].date, '2026-10-24');
});

test('session permits only one exam or test per group per day including retained groupId entries', async () => {
    const data = fixture(); data.schedule = [lesson({ date: '2026-10-19', day: 'Понедельник' })];
    const result = await generateSessionSchedule(data, configuration({ restDays: 0 }));
    assert.equal(result.schedule[0]?.date, '2026-10-20');
});

test('retained consultations do not incorrectly create rest-day restrictions', async () => {
    const data = fixture(); data.schedule = [lesson({ date: '2026-10-20', day: 'Вторник', classType: ClassType.Consultation })];
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule[0]?.date, '2026-10-19');
});

test('session rebuilding preserves locked exams and does not place another exam that day', async () => {
    const data = fixture(); data.schedule = [lesson({ locked: true, date: '2026-10-19', day: 'Понедельник' })];
    const before = structuredClone(data);
    const result = await generateSessionSchedule(data, configuration({ clearExisting: true, restDays: 0 }));
    assert.equal(result.schedule.length, 1); assert.notEqual(result.schedule[0].date, '2026-10-19');
    assert.deepEqual(data, before);
});

test('repeated session completion recognizes generated and manually placed exams', async () => {
    for (const id of ['session-exam-subject-sem1-group', 'manual-exam']) {
        const data = fixture(); data.schedule = [lesson({ id, subjectId: 'subject', teacherId: 'teacher' })];
        const result = await generateSessionSchedule(data, configuration());
        assert.equal(result.schedule.length, 0); assert.equal(result.unschedulable.length, 0);
    }
});

test('consultations-only mode follows the date of an existing exam', async () => {
    const data = fixture(); data.schedule = [lesson({ subjectId: 'subject', teacherId: 'teacher', date: '2026-10-23', day: 'Пятница' })];
    const result = await generateSessionSchedule(data, configuration({ generationMode: 'consultations_only', consultationOffset: 1 }));
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].date, '2026-10-22');
});

test('consultations-only mode reports a missing exam instead of inventing its date', async () => {
    const result = await generateSessionSchedule(fixture(), configuration({ generationMode: 'consultations_only', consultationOffset: 1 }));
    assert.equal(result.schedule.length, 0); assert.equal(result.unschedulable.length, 1);
    assert.ok(result.unschedulable[0].issues?.some(issue => issue.includes('экзамен')));
});

test('practice consultation and defense can use separate slots of the same day', async () => {
    const data = fixture();
    const result = await generateSessionSchedule(data, configuration({ generationMode: 'practice_only', timeFrame: { start: '2026-10-19', end: '2026-10-19' } }));
    assert.equal(result.schedule.length, 2); assert.equal(result.unschedulable.length, 0);
    assert.equal(new Set(result.schedule.map(entry => entry.timeSlotId)).size, 2);
});

test('session rejects malformed dates and negative preparation intervals', async () => {
    for (const config of [configuration({ timeFrame: { start: 'invalid', end: '2026-10-24' } }), configuration({ restDays: -1 }), configuration({ consultationOffset: -1 }), configuration({ generationMode: 'invalid' as any })]) {
        await assert.rejects(generateSessionSchedule(fixture(), config));
    }
});

test('session does not place Sunday events unless the calendar explicitly opens that day', async () => {
    const data = fixture(); const config = configuration({ timeFrame: { start: '2026-10-25', end: '2026-10-25' } });
    assert.equal((await generateSessionSchedule(data, config)).schedule.length, 0);
    data.productionCalendar = [{ date: '2026-10-25', isWorkDay: true }];
    assert.equal((await generateSessionSchedule(data, config)).schedule.length, 1);
});

test('session reports strict minimum rule violations on the completed grid', async () => {
    const data = fixture(); data.schedulingRules = [{ id: 'min', enabled: true, action: RuleAction.MinPerDay, severity: RuleSeverity.Strict,
        param: 2, conditions: [{ entityType: 'group', entityIds: ['group'] }] }];
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule.length, 1);
    assert.ok((result as any).validationIssues?.length);
    assert.equal(createScheduleValidator(data)(result.schedule[0], result.schedule).valid, false);
});

test('session clearing preserves locked, individual, unselected and other-semester events', () => {
    const entries = [lesson({ id: 'replace' }), lesson({ id: 'locked', locked: true }),
        lesson({ id: 'individual', classType: ClassType.ThesisDefense, academicWorkId: 'work' }),
        lesson({ id: 'even', unscheduledUid: 'exam-subject-sem2-group' }),
        lesson({ id: 'test', classType: ClassType.Test }), lesson({ id: 'consult', classType: ClassType.Consultation }),
        lesson({ id: 'coursework', classType: ClassType.CourseworkDefense }),
        lesson({ id: 'outside', date: '2026-11-01' }), lesson({ id: 'weekly', date: undefined })];
    const config = configuration({ clearExisting: true, scheduleTests: 'none' });
    assert.deepEqual(getRetainedSessionSchedule(entries, config).map(entry => entry.id), entries.slice(1).map(entry => entry.id));
    const practices = [lesson({ id: 'pc', classType: ClassType.PracticeConsultation }), lesson({ id: 'pd', classType: ClassType.PracticeDefense })];
    assert.deepEqual(getRetainedSessionSchedule(practices, configuration({ clearExisting: true, generationMode: 'practice_only', includePracticeDefenses: false })).map(entry => entry.id), ['pd']);
});

test('another semester does not fulfill an exam and generated IDs cannot collide with history', async () => {
    const data = fixture(); data.schedule = [lesson({ subjectId: 'subject', id: 'session-exam-subject-sem1-group-2026-10-19', unscheduledUid: 'exam-subject-sem2-group' })];
    const result = await generateSessionSchedule(data, configuration({ restDays: 0 }));
    assert.equal(result.schedule.length, 1); assert.notEqual(result.schedule[0].id, data.schedule[0].id);
});

test('a retained consultation anchors the newly generated exam instead of being duplicated', async () => {
    const data = fixture(); data.schedule = [lesson({ subjectId: 'subject', teacherId: 'teacher', date: '2026-10-21', classType: ClassType.Consultation })];
    const result = await generateSessionSchedule(data, configuration({ consultationOffset: 1 }));
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].classType, ClassType.Exam); assert.equal(result.schedule[0].date, '2026-10-22');
});

test('same-day consultation-only generation requires a slot before the existing exam', async () => {
    const data = fixture(); data.schedule = [lesson({ subjectId: 'subject', teacherId: 'teacher', timeSlotId: 'second' })];
    const result = await generateSessionSchedule(data, configuration({ generationMode: 'consultations_only', consultationOffset: 0 }));
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].date, '2026-10-21'); assert.equal(result.schedule[0].timeSlotId, 'first');
    data.schedule[0].timeSlotId = 'first';
    assert.equal((await generateSessionSchedule(data, configuration({ generationMode: 'consultations_only', consultationOffset: 0 }))).schedule.length, 0);
});

test('practice defense cannot precede its placed consultation', async () => {
    const data = fixture();
    data.schedulingRules = [{ id: 'consult-tuesday', action: RuleAction.RequireDay, severity: RuleSeverity.Strict, day: 'Вторник', enabled: true,
        conditions: [{ entityType: 'classType', entityIds: [ClassType.PracticeConsultation] }] }];
    const result = await generateSessionSchedule(data, configuration({ generationMode: 'practice_only' }));
    assert.equal(result.schedule.length, 2);
    const consult = result.schedule.find(entry => entry.classType === ClassType.PracticeConsultation)!;
    const defense = result.schedule.find(entry => entry.classType === ClassType.PracticeDefense)!;
    assert.ok(defense.date! >= consult.date!);
    if (defense.date === consult.date) assert.equal(defense.timeSlotId, 'second');
});

test('lecture streams do not merge exams, but an explicit existing stream exam credits every group', async () => {
    const data = fixture(); data.groups.push({ ...data.groups[0], id: 'other-group' });
    data.streams = [{ id: 'stream', name: 'Stream', type: 'lecture', groupIds: ['group', 'other-group'] }];
    assert.equal(generateSessionEventPool(data, configuration()).length, 2);
    assert.ok(generateSessionEventPool(data, configuration()).every(event => event.groupIds.length === 1));
    data.schedule = [lesson({ subjectId: 'subject', groupId: undefined, streamId: 'stream', teacherId: 'teacher' })];
    assert.equal((await generateSessionSchedule(data, configuration())).schedule.length, 0);
});

test('rest-day checking includes weekly attestation templates', async () => {
    const data = fixture(); data.schedule = [lesson({ date: undefined })];
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule[0]?.date, '2026-10-24');
});

test('session honors resource absences, group bans and classroom binding restrictions', async () => {
    const data = fixture();
    data.teacherSubjectLinks[0].allowedClassroomIds = ['room2'];
    data.resourceAbsences = [{ id: 'absence', kind: 'teacher', resourceId: 'teacher', start: '2026-10-19', end: '2026-10-20', reason: 'Absent' }];
    data.groups[0].availabilityGrid = { Среда: { first: 'Запрещено', second: 'Запрещено' } };
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].date, '2026-10-22'); assert.equal(result.schedule[0].classroomId, 'room2');
    assert.equal(createScheduleValidator(data)(result.schedule[0], result.schedule).valid, true);
});

test('missing classroom requirements and wrong-type teacher bindings remain diagnosed demand', async () => {
    const data = fixture(); data.subjects[0].classroomTypeRequirements = {};
    let result = await generateSessionSchedule(data, configuration());
    assert.equal(result.unschedulable.length, 1); assert.ok(result.unschedulable[0].issues?.some(issue => issue.includes('типы аудиторий')));
    data.subjects[0].classroomTypeRequirements = { [ClassType.Exam]: ['type'] };
    data.teacherSubjectLinks[0].classTypes = [ClassType.Lecture];
    result = await generateSessionSchedule(data, configuration());
    assert.equal(result.unschedulable.length, 1); assert.ok(result.unschedulable[0].issues?.some(issue => issue.includes('привязки')));
});

test('session stress conserves demand, yields to the UI and produces a valid grid', async () => {
    const data = fixture(); const group = data.groups[0], teacher = data.teachers[0], subject = data.subjects[0];
    data.groups = []; data.teachers = []; data.teacherSubjectLinks = [];
    data.subjects = Array.from({ length: 3 }, (_, i) => ({ ...subject, id: `s${i}` }));
    data.educationalPlans[0].entries = data.subjects.map(subject => ({ ...data.educationalPlans[0].entries[0], subjectId: subject.id }));
    for (let i = 0; i < 10; i++) {
        data.groups.push({ ...group, id: `g${i}` }); data.teachers.push({ ...teacher, id: `t${i}` });
        for (const subject of data.subjects) data.teacherSubjectLinks.push({ id: `l${i}-${subject.id}`, teacherId: `t${i}`, subjectId: subject.id, allowedGroupIds: [`g${i}`], classTypes: Object.values(ClassType) });
    }
    data.classrooms = Array.from({ length: 10 }, (_, i) => ({ ...data.classrooms[0], id: `r${i}` }));
    const config = configuration({ consultationOffset: 1, timeFrame: { start: '2026-10-19', end: '2026-11-07' } });
    const started = Date.now();
    let yielded = false; const timer = setTimeout(() => { yielded = true; }, 0);
    const result = await generateSessionSchedule(data, config); clearTimeout(timer);
    assert.equal(result.schedule.length + result.unschedulable.length, 60);
    assert.equal(result.unschedulable.length, 0); assert.equal(result.validationIssues.length, 0); assert.equal(yielded, true);
    const validate = createScheduleValidator(data, { timeFrame: config.timeFrame, clearExisting: false, iterations: 1, strictness: 5, enforceLectureOrder: true, distributeEvenly: true });
    assert.ok(result.schedule.every(entry => validate(entry, result.schedule).valid));
    assert.ok(Date.now() - started < 30000);
    console.log(`Session stress: ${result.schedule.length} events, ${Date.now() - started}ms, no validation issues.`);
});

test('session final audit reports inherited rest-day violations and duplicate identifiers', async () => {
    const data = fixture();
    data.schedule = [lesson({ id: 'duplicate', subjectId: 'subject', teacherId: 'teacher' }), lesson({ id: 'duplicate', date: '2026-10-22', day: 'Четверг' })];
    const result = await generateSessionSchedule(data, configuration());
    assert.equal(result.schedule.length, 0);
    assert.ok(result.validationIssues.some(item => item.issues.some(issue => issue.includes('интервал отдыха'))));
    assert.ok(result.validationIssues.some(item => item.issues.some(issue => issue.includes('Идентификатор'))));
});
