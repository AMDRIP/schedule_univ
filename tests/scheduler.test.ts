import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateClassPool, generateScheduleWithHeuristics, calculateScheduleScore } from '../services/heuristicScheduler';
import { generateSessionEventPool, generateSessionSchedule } from '../services/sessionScheduler';
import { getEducationLevel, getPlanForGroup, getPlanContactHours } from '../utils/educationUtils';
import { ClassType, FormOfStudy, AttestationType } from '../types';
import { makeFixture, config, forbid } from './fixtures';

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
