import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateClassPool, generateScheduleWithHeuristics, calculateScheduleScore, createScheduleValidator, optimizeScheduleLocally } from '../services/heuristicScheduler';
import { calculatePlanBalance } from '../services/planBalance';
import { previewScheduleRepair, validateRepair } from '../services/scheduleRepair';
import { planAcademicEvent } from '../services/academicEvents';
import { generateSessionEventPool, generateSessionSchedule } from '../services/sessionScheduler';
import { getEducationLevel, getPlanForGroup, getPlanContactHours } from '../utils/educationUtils';
import { ClassType, FormOfStudy, AttestationType, RuleAction, RuleSeverity, DeliveryMode, ScheduleEntry } from '../types';
import { makeFixture, config, forbid } from './fixtures';

const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id: 'lesson', subjectId: 'subject', groupId: 'group', teacherId: 'teacher', classroomId: 'room', classType: ClassType.Lecture, date: '2026-10-19', day: 'Понедельник', timeSlotId: 'first', deliveryMode: DeliveryMode.Offline, weekType: 'every', ...patch });
const period = { ...config.timeFrame, parity: 'odd' as const };
const researchWork = () => ({ id: 'work', kind: 'masterThesis', topic: 'Research', studentName: 'Student', groupId: 'group', subjectId: 'subject', semester: 1, supervisorId: 'teacher', reviewerId: 'reserve', status: 'ready', milestones: [] });

test('cohort/profile plan resolution is deterministic and never uses an incompatible explicit plan', () => {
    const data = makeFixture(); const base = data.educationalPlans[0];
    const revised = { ...structuredClone(base), id: 'new', version: '2026', admissionYear: 2026, profile: 'AI' };
    data.educationalPlans.push(revised);
    assert.equal(getPlanForGroup({ ...data.groups[0], admissionYear: 2026, profile: 'AI' }, data.educationalPlans)?.id, 'new');
    assert.equal(getPlanForGroup({ ...data.groups[0], admissionYear: 2025, profile: 'AI' }, data.educationalPlans)?.id, 'plan');
    assert.equal(getPlanForGroup({ ...data.groups[0], admissionYear: 2025, educationalPlanId: 'new' }, data.educationalPlans), undefined);
    revised.entries[0].lectureHours = 20;
    assert.equal(base.entries[0].lectureHours, 2);
    const revisedPool = generateClassPool({ ...data, groups: [{ ...data.groups[0], admissionYear: 2026, profile: 'AI' }] });
    assert.equal(revisedPool.filter(entry => entry.classType === ClassType.Lecture).length, 10);
});

test('balance credits a stream to every group, counts subgroups separately and excludes individual/independent work', () => {
    const data = makeFixture(); data.groups.push({ ...data.groups[0], id: 'group2' });
    data.subgroups = [{ id: 'sub1', parentGroupId: 'group', name: 'A', studentCount: 6 }, { id: 'sub2', parentGroupId: 'group', name: 'B', studentCount: 6 }];
    data.educationalPlans[0].entries[0].splitForSubgroups = true;
    data.educationalPlans[0].entries[0].practiceHours = 2;
    data.schedule = [lesson({ groupId: undefined, groupIds: ['group', 'group2'] }), lesson({ id: 'pr', classType: ClassType.Practical, subgroupId: 'sub1' }), lesson({ id: 'individual', academicWorkId: 'work', classType: ClassType.ResearchConsultation })];
    const rows = calculatePlanBalance(data, period);
    assert.equal(rows.filter(row => row.classType === ClassType.Lecture).reduce((sum, row) => sum + row.scheduledHours, 0), 4);
    assert.equal(rows.find(row => row.subgroupId === 'sub1')?.missingHours, 0);
    assert.equal(rows.find(row => row.subgroupId === 'sub2')?.missingHours, 2);
    assert.equal(rows.find(row => row.classType === ClassType.ResearchConsultation)?.scheduledHours, 0);
    assert.ok(rows.every(row => row.requiredHours < 144));
});

test('shared validator rejects bans, invalid dates, closed rooms, absent links and inactive bell slots', () => {
    const data = makeFixture(); assert.equal(createScheduleValidator(data)(lesson()).valid, true);
    for (const mutate of [
        (data: any) => { data.classrooms[0].status = 'closed'; },
        (data: any) => { data.teacherSubjectLinks = []; },
        (data: any) => { data.groups[0].availabilityGrid = forbid(['first']); },
        (data: any) => { data.classrooms[0].availabilityGrid = forbid(['first']); },
        (data: any) => { data.timeSlots = [data.timeSlots[1]]; },
        (data: any) => { data.settings.respectProductionCalendar = true; data.productionCalendar = [{ date: '2026-10-19', isWorkDay: false }]; },
    ]) {
        const fixture = makeFixture(); mutate(fixture);
        assert.equal(createScheduleValidator(fixture)(lesson()).valid, false);
    }
    assert.equal(createScheduleValidator(data)(lesson({ date: '2026-02-31' })).valid, false);
    assert.equal(createScheduleValidator(data)(lesson({ day: 'Вторник' })).valid, false);
});

test('session and normal placement apply the same strict rules', async () => {
    const data = makeFixture(); data.schedulingRules = [{ id: 'ban', description: 'No Monday', enabled: true, severity: RuleSeverity.Strict, action: RuleAction.AvoidDay, day: 'Понедельник', conditions: [{ entityType: 'subject', entityIds: ['subject'] }] }];
    assert.ok(createScheduleValidator(data)(lesson()).issues.some(issue => issue.includes('No Monday')));
    const result = await generateSessionSchedule(data, { timeFrame: { start: '2026-10-19', end: '2026-10-19' }, clearExisting: false, restDays: 0, consultationOffset: 0, scheduleTests: 'no_rest_days', semesterParity: 'odd' });
    assert.equal(result.schedule.length, 0); assert.ok(result.unschedulable.length > 0);
});

test('session uses the active custom bell profile, not ordinary slots', async () => {
    const data = makeFixture();
    data.bellScheduleProfiles = [{ id: 'custom', name: 'Custom', isActive: true, appliesToDates: ['2026-10-19'], slots: [{ id: 'custom-slot', time: '13:00-14:30', shift: 'first' }] }];
    const result = await generateSessionSchedule(data, { timeFrame: { start: '2026-10-19', end: '2026-10-19' }, clearExisting: false, restDays: 0, consultationOffset: 0, scheduleTests: 'no_rest_days', semesterParity: 'odd', includeCoursework: false });
    assert.equal(result.schedule.length, 1);
    assert.equal(result.schedule[0].timeSlotId, 'custom-slot');
});

test('collision score counts actual invalid lessons and cannot remove a shared booking by accident', () => {
    const data = makeFixture();
    const result = { schedule: [lesson(), lesson({ id: 'duplicate' })], unschedulable: [] };
    assert.equal(calculateScheduleScore(data, result, config).hardViolations, 2);
    assert.ok(calculateScheduleScore(data, result, config).total >= 1_500_000);
});

test('progress reports measured scores; pending demand is not a hard violation', async () => {
    const data = makeFixture(); let samples = 0;
    const result = await generateScheduleWithHeuristics(data, config, { onProgress: point => {
        const pending = Math.max(0, point.total - point.processed);
        const score = calculateScheduleScore(data, { schedule: point.partialSchedule, unschedulable: [...point.failedEntries, ...new Array(pending)] }, config);
        assert.equal(point.penalty, score.total); assert.equal(point.softPenalty, score.softPenalty);
        assert.equal(point.hardViolations, score.hardViolations); samples++;
    } });
    assert.ok(samples >= 2); assert.equal(result.score?.hardViolations, 0);
});

test('local repair proposes a safe change without mutating the original and observes zero budget', async () => {
    const data = makeFixture(); data.schedule = [lesson(), lesson({ id: 'collision', classType: ClassType.Practical })];
    const snapshot = JSON.stringify(data.schedule);
    const preview = await previewScheduleRepair(data, 'collision');
    assert.ok(preview.changes.length > 0); assert.equal(JSON.stringify(data.schedule), snapshot);
    assert.deepEqual(validateRepair(data, preview.changes), []);
    const noTime = await previewScheduleRepair(data, 'collision', 0);
    assert.equal(noTime.changes.length, 0);
});

test('individual events require the availability of supervisor, reviewer and committee', async () => {
    const data = makeFixture(); data.academicWorks = [researchWork()]; data.teachers[1].availabilityGrid = forbid(['first']);
    const result = await planAcademicEvent(data, { workId: 'work', kind: 'defense', start: '2026-10-19', end: '2026-10-19', committeeTeacherIds: [] });
    assert.equal(result.entry?.timeSlotId, 'second'); assert.deepEqual(result.entry?.additionalTeacherIds, ['reserve']);
    data.teachers[1].availabilityGrid = forbid();
    const denied = await planAcademicEvent(data, { workId: 'work', kind: 'defense', start: '2026-10-19', end: '2026-10-19', committeeTeacherIds: [] });
    assert.equal(denied.entry, undefined); assert.ok(denied.issues.some(issue => issue.includes('Запрещённое')));
});

test('committee rules and existing committee bookings block individual events', async () => {
    const data = makeFixture(); data.academicWorks = [researchWork()];
    data.schedulingRules = [{ id: 'committee-ban', description: 'Committee unavailable', severity: RuleSeverity.Strict, action: RuleAction.AvoidDay, day: 'Понедельник', conditions: [{ entityType: 'teacher', entityIds: ['reserve'] }] }];
    const result = await planAcademicEvent(data, { workId: 'work', kind: 'defense', start: '2026-10-19', end: '2026-10-19', committeeTeacherIds: [] });
    assert.equal(result.entry, undefined); assert.ok(result.issues.some(issue => issue.includes('Committee unavailable')));
    data.schedulingRules = []; data.schedule = [lesson({ additionalTeacherIds: ['reserve'] })];
    const validator = createScheduleValidator(data);
    assert.equal(validator(lesson({ id: 'other', teacherId: 'reserve', classroomId: 'room2' })).valid, false);
});

test('validator checks weekly templates and overlapping times with different slot IDs', () => {
    const data = makeFixture(); data.schedule = [lesson({ date: undefined })];
    assert.equal(createScheduleValidator(data)(lesson({ id: 'dated' })).valid, false);
    data.schedule = [lesson({ id: 'busy', timeSlotId: 'second' })];
    data.timeSlots[1].time = '10:00-11:30';
    assert.ok(createScheduleValidator(data)(lesson()).issues.some(issue => issue.includes('разных слотов')));
});

test('optimizer cannot silently replace the supervisor of an individual event', async () => {
    const data = makeFixture(); data.academicWorks = [researchWork()];
    const result = await planAcademicEvent(data, { workId: 'work', kind: 'defense', start: '2026-10-19', end: '2026-10-19', committeeTeacherIds: [] });
    assert.ok(result.entry);
    assert.equal(createScheduleValidator(data)({ ...result.entry!, teacherId: 'reserve' }).valid, false);
    data.schedule = [result.entry];
    const optimized = await optimizeScheduleLocally(data, config);
    assert.ok(optimized.schedule.every(entry => entry.teacherId === 'teacher' && entry.additionalTeacherIds?.includes('reserve')));
    assert.ok(optimized.afterScore.hardViolations <= optimized.beforeScore.hardViolations);
});

test('100-lesson automatic stress scenario conserves demand and produces no hard violations', async () => {
    const data = makeFixture(); const group = data.groups[0]; const teacher = data.teachers[0]; const room = data.classrooms[0];
    data.groups = []; data.teachers = []; data.classrooms = []; data.teacherSubjectLinks = [];
    for (let i = 0; i < 20; i++) {
        data.groups.push({ ...group, id: `group-${i}` }); data.teachers.push({ ...teacher, id: `teacher-${i}` }); data.classrooms.push({ ...room, id: `room-${i}` });
        data.teacherSubjectLinks.push({ id: `link-${i}`, teacherId: `teacher-${i}`, subjectId: 'subject', allowedGroupIds: [`group-${i}`], classTypes: Object.values(ClassType) });
    }
    const started = performance.now();
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length + result.unschedulable.length, 100);
    assert.equal(result.score?.hardViolations, 0);
    assert.ok(performance.now() - started < 30000);
    console.log(`Automatic 100-lesson stress: ${Math.round(performance.now() - started)}ms, placed ${result.schedule.length}.`);
});

test('master/postgraduate programs and study forms keep distinct plans', () => {
    const data = makeFixture();
    assert.equal(getEducationLevel(data.specialties[0]), 'master');
    assert.equal(getEducationLevel({ ...data.specialties[0], educationLevel: 'postgraduate' }), 'postgraduate');
    assert.equal(getPlanForGroup({ ...data.groups[0], formOfStudy: FormOfStudy.Mixed }, data.educationalPlans), undefined);
});

test('research and coursework contact hours generate lessons; independent work does not', () => {
    const data = makeFixture(); const pool = generateClassPool(data);
    assert.equal(getPlanContactHours(data.educationalPlans[0].entries[0]), 10);
    assert.equal(pool.length, 5);
    assert.equal(pool.filter(entry => entry.classType === ClassType.ResearchSeminar).length, 1);
    assert.equal(pool.filter(entry => entry.classType === ClassType.CourseworkConsultation).length, 1);
});

test('missing teacher bindings remain visible as diagnosed unscheduled demand', async () => {
    const data = makeFixture(); data.teacherSubjectLinks = [];
    assert.equal(generateClassPool(data).length, 5);
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length, 0); assert.equal(result.unschedulable.length, 5);
    assert.ok(result.unschedulable.every(entry => !!entry.explanation));
});

test('generation respects teacher/group/room bans and has zero resource collisions', async () => {
    const data = makeFixture(); data.teachers[0].availabilityGrid = forbid(['first']); data.classrooms[0].status = 'closed';
    const started = performance.now(); const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length, 5); assert.equal(result.unschedulable.length, 0);
    assert.ok(result.schedule.every(entry => entry.timeSlotId === 'second' && entry.classroomId === 'room2'));
    assert.equal(calculateScheduleScore(data, result, config).hardViolations, 0);
    console.log(`Fixture generation: ${Math.round(performance.now() - started)}ms; ${result.schedule.length} lessons; no hard violations.`);
});

test('domain cache invalidates when availability changes', async () => {
    const data = makeFixture(); data.groups[0].availabilityGrid = forbid();
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length, 0); assert.equal(result.unschedulable.length, 5);
    delete data.groups[0].availabilityGrid;
    const restored = await generateScheduleWithHeuristics(data, config);
    assert.equal(restored.schedule.length, 5);
});

test('teacher restrictions apply to every group in a stream', async () => {
    const data = makeFixture(); data.groups.push({ ...data.groups[0], id: 'group2', number: 'М-2' });
    data.streams = [{ id: 'stream', name: 'Общий', groupIds: ['group', 'group2'], type: 'lecture' }];
    data.teacherSubjectLinks[0].allowedGroupIds = ['group'];
    const pool = generateClassPool(data);
    assert.ok(pool.some(entry => entry.classType === ClassType.Lecture && entry.groupIds?.length === 2 && !entry.teacherCandidates?.length));
    const result = await generateScheduleWithHeuristics(data, config);
    assert.ok(!result.schedule.some(entry => entry.groupIds?.includes('group2') && entry.teacherId === 'teacher'));
});

test('lecture streams do not absorb groups from a different year or unequal workloads', () => {
    const data = makeFixture(); data.groups.push({ ...data.groups[0], id: 'group2', number: 'М-2', course: 2 });
    data.streams = [{ id: 'stream', groupIds: ['group', 'group2'] }];
    assert.ok(generateClassPool(data).filter(entry => entry.classType === ClassType.Lecture).every(entry => !entry.groupIds?.includes('group2')));
});

test('session uses course semesters, research attestations and coursework defenses', async () => {
    const data = makeFixture(); data.groups[0].course = 2; data.specialties[0].educationLevel = 'postgraduate';
    data.educationalPlans[0].entries = [{ ...data.educationalPlans[0].entries[0], semester: 3, attestation: AttestationType.CandidateExam }];
    const sessionConfig = { timeFrame: config.timeFrame, clearExisting: false, restDays: 0, consultationOffset: 0, scheduleTests: 'no_rest_days' as const, semesterParity: 'odd' as const, includeCoursework: true };
    const pool = generateSessionEventPool(data, sessionConfig);
    assert.ok(pool.some(entry => entry.classType === ClassType.CandidateExam));
    assert.ok(pool.some(entry => entry.classType === ClassType.CourseworkDefense));
    assert.equal(generateSessionEventPool(data, { ...sessionConfig, semesterParity: 'even' }).length, 0);
    const result = await generateSessionSchedule(data, sessionConfig);
    assert.equal(result.schedule.length, 2); assert.equal(result.unschedulable.length, 0);
});

test('semester filter and safe early stop preserve demand totals', async () => {
    const data = makeFixture(); data.educationalPlans[0].entries.push({ ...data.educationalPlans[0].entries[0], semester: 2 });
    const result = await generateScheduleWithHeuristics(data, config, { shouldStop: () => true });
    assert.equal(result.interrupted, true); assert.equal(result.schedule.length + result.unschedulable.length, 5);
});

test('electives keep their explicit teacher assignment without a separate binding', async () => {
    const data = makeFixture(); data.teacherSubjectLinks = []; data.educationalPlans = [];
    data.electives = [{ id: 'elective', groupId: 'group', subjectId: 'subject', teacherId: 'teacher', hoursPerSemester: 2, classType: ClassType.Practical }];
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length, 1); assert.equal(result.unschedulable.length, 0);
});
