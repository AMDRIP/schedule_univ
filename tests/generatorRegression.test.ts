import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassType, AvailabilityType, DeliveryMode, RuleAction, RuleSeverity, ScheduleEntry } from '../types';
import { generateClassPool, generateScheduleWithHeuristics, calculateScheduleScore, createScheduleValidator, createCandidateScorer } from '../services/heuristicScheduler';
import { CandidatePool, CandidateWorker, candidateWorkerBudget } from '../services/candidatePool';
import { candidateWorkerHandler } from '../services/candidateWorkerRuntime';
import { makeFixture, config } from './fixtures';

const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
    id: 'lesson', subjectId: 'subject', groupId: 'group', teacherId: 'teacher', classroomId: 'room',
    classType: ClassType.Lecture, date: '2026-10-19', day: 'Понедельник', timeSlotId: 'first',
    deliveryMode: DeliveryMode.Offline, weekType: 'every', ...patch,
});
const simpleFixture = () => {
    const data = makeFixture(); data.settings.enforceStandardRules = false;
    data.educationalPlans[0].entries = [{ subjectId: 'subject', semester: 1, lectureHours: 2, practiceHours: 0, labHours: 0 }];
    return data;
};

test('overlapping streams conserve each groups lecture demand for every group order', async () => {
    for (const order of [['a','b','c'], ['a','c','b'], ['b','a','c'], ['b','c','a'], ['c','a','b'], ['c','b','a']]) {
        const data = simpleFixture();
        data.groups = order.map(id => ({ ...data.groups[0], id, number: id }));
        data.streams = [{ id: 'ab', name: 'AB', type: 'lecture', groupIds: ['a', 'b'] }, { id: 'bc', name: 'BC', type: 'lecture', groupIds: ['b', 'c'] }];
        const pool = generateClassPool(data);
        for (const id of order) assert.equal(pool.filter(entry => (entry.groupIds || [entry.groupId]).includes(id)).length, 1);
        const result = await generateScheduleWithHeuristics(data, config);
        assert.equal(result.score?.hardViolations, 0);
        assert.equal(result.unschedulable.length, 0);
        for (const id of order) assert.equal(result.schedule.filter(entry => (entry.groupIds || [entry.groupId]).includes(id)).length, 1);
    }
});

test('other semesters and academic years never consume current semester demand', async () => {
    for (const placed of [
        lesson({ date: '2027-03-01', unscheduledUid: `unsched-subject-sem2-group-${ClassType.Lecture}-0` }),
        lesson({ unscheduledUid: `unsched-subject-sem2-group-${ClassType.Lecture}-0`, timeSlotId: 'second' }),
        lesson({ date: '2025-10-20', unscheduledUid: `unsched-subject-sem1-group-${ClassType.Lecture}-0` }),
    ]) {
        const data = simpleFixture(); data.schedule = [placed];
        const result = await generateScheduleWithHeuristics(data, config);
        assert.equal(result.schedule.length, 1); assert.equal(result.unschedulable.length, 0);
    }
    const data = simpleFixture(); data.schedule = [lesson()];
    assert.equal((await generateScheduleWithHeuristics(data, config)).schedule.length, 0);
});

test('binding order cannot reject a teacher with an allowed group and classroom binding', async () => {
    for (const reverse of [false, true]) {
        const data = simpleFixture();
        const base = data.teacherSubjectLinks[0];
        data.teacherSubjectLinks = [
            { ...base, id: 'other-group', excludedGroupIds: ['group'] },
            { ...base, id: 'other-room', allowedGroupIds: ['group'], allowedClassroomIds: ['missing'] },
            { ...base, id: 'valid', allowedGroupIds: ['group'], allowedClassroomIds: ['room'] },
        ];
        if (reverse) data.teacherSubjectLinks.reverse();
        assert.equal(createScheduleValidator(data, config)(lesson(), []).valid, true);
        assert.equal(createScheduleValidator(data, config)(lesson({ classroomId: 'room2' }), []).valid, false);
        const result = await generateScheduleWithHeuristics(data, config);
        assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].classroomId, 'room');
    }
});

test('strict minimum loads are enforced on the final grid but permit partial construction', async () => {
    for (const action of [RuleAction.MinPerDay, RuleAction.MinPerWeek]) {
        const data = simpleFixture();
        data.schedulingRules = [{ id: 'minimum', description: 'Minimum two lessons', enabled: true, severity: RuleSeverity.Strict,
            action, param: 2, conditions: [{ entityType: 'group', entityIds: ['group'] }] }];
        assert.equal(createScheduleValidator(data, config)(lesson(), []).valid, false);
        assert.equal(createScheduleValidator(data, config, { finalValidation: false })(lesson(), []).valid, true);
        const partial = await generateScheduleWithHeuristics(data, config);
        assert.equal(partial.schedule.length, 1); assert.equal(partial.score?.hardViolations, 1);
        data.educationalPlans[0].entries[0].lectureHours = 4;
        const complete = await generateScheduleWithHeuristics(data, config);
        assert.equal(complete.schedule.length, 2); assert.equal(complete.score?.hardViolations, 0);
    }
});

test('teacher target survives greedy refinement and annealing', async () => {
    const data = simpleFixture(); data.educationalPlans[0].entries[0].lectureHours = 4;
    data.teacherSubjectLinks[0].role = 'undesirable';
    data.teacherSubjectLinks.push({ ...data.teacherSubjectLinks[0], id: 'reserve-link', teacherId: 'reserve', role: 'primary', priority: 10 });
    data.teachers[0].availabilityGrid = Object.fromEntries(['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'].map(day => [day, { first: AvailabilityType.Undesirable, second: AvailabilityType.Undesirable }]));
    const result = await generateScheduleWithHeuristics(data, { ...config, target: { type: 'teacher', id: 'teacher' } });
    assert.equal(result.schedule.length, 2); assert.ok(result.schedule.every(entry => entry.teacherId === 'teacher'));
});

test('window penalties count internal gaps, not free time before or after adjacent lessons', () => {
    const data = simpleFixture(); data.timeSlots.push({ id: 'third', time: '12:30-14:00', shift: 'first' });
    for (const slot of ['first', 'third']) {
        data.schedule = [lesson({ timeSlotId: slot }), lesson({ id: 'adjacent', timeSlotId: 'second' })];
        data.settings.allowWindows = true;
        const relaxed = createScheduleValidator(data, config)(data.schedule[1]).softPenalty;
        data.settings.allowWindows = false;
        assert.equal(createScheduleValidator(data, config)(data.schedule[1]).softPenalty, relaxed);
    }
    data.schedule = [lesson(), lesson({ id: 'gap', timeSlotId: 'third' })];
    data.settings.allowWindows = true;
    const relaxed = createScheduleValidator(data, config)(data.schedule[1]).softPenalty;
    data.settings.allowWindows = false;
    assert.ok(createScheduleValidator(data, config)(data.schedule[1]).softPenalty > relaxed);
});

const inMemoryFactory = (stats: { created: number; terminated: number; active: number; peak: number }, broken = false) => () => {
    stats.created++;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const worker: CandidateWorker = { onmessage: null, onerror: null, terminate: () => { stats.terminated++; for (const timer of timers) clearTimeout(timer); }, postMessage: message => {
        const value: any = structuredClone(message);
        if (value.type !== 'evaluate') { handle(value); return; }
        stats.active++; stats.peak = Math.max(stats.peak, stats.active);
        const timer = setTimeout(() => { timers.delete(timer); stats.active--; if (broken) worker.onerror?.({ message: 'deliberate candidate failure' }); else handle(value); }, 1);
        timers.add(timer);
    } };
    const handle = candidateWorkerHandler(data => worker.onmessage?.({ data }));
    return worker;
};

test('candidate pool returns deterministic costs, sends deltas and releases every worker', async () => {
    const data = simpleFixture(); const stats = { created: 0, terminated: 0, active: 0, peak: 0 };
    const pool = new CandidatePool(3, inMemoryFactory(stats)); await pool.initialize(data, config);
    const demand = generateClassPool(data)[0];
    const candidates = Array.from({ length: 600 }, (_, i) => ({ dateStr: '2026-10-19', timeSlotId: i % 2 ? 'first' : 'second', classroomId: i % 3 ? 'room' : 'room2', teacherId: 'teacher' }));
    let schedule = [lesson()];
    const local = createCandidateScorer(data, config);
    assert.deepEqual(await pool.evaluate(demand, schedule, candidates, 'lesson'), local(demand, schedule, candidates, 'lesson'));
    schedule = [lesson({ timeSlotId: 'second' })];
    assert.deepEqual(await pool.evaluate(demand, schedule, candidates), local(demand, schedule, candidates));
    assert.equal(pool.metrics.changedEntries, 2); assert.equal(stats.peak, 3);
    assert.deepEqual(await pool.evaluate(demand, [], candidates), local(demand, [], candidates));
    pool.dispose(); assert.equal(stats.created, stats.terminated);
    assert.equal(candidateWorkerBudget(4, 1), 3); assert.equal(candidateWorkerBudget(4, 4), 0);
});

test('a failed candidate worker falls back without losing demand or changing the result', async () => {
    const data = simpleFixture(); data.educationalPlans[0].entries[0].lectureHours = 4;
    data.classrooms = Array.from({ length: 24 }, (_, i) => ({ ...data.classrooms[0], id: `room-${i}` }));
    const expected = await generateScheduleWithHeuristics(data, config);
    const stats = { created: 0, terminated: 0, active: 0, peak: 0 };
    const pool = new CandidatePool(3, inMemoryFactory(stats, true));
    const result = await generateScheduleWithHeuristics(data, config, { candidateEvaluator: pool });
    assert.deepEqual(result.schedule, expected.schedule); assert.deepEqual(result.score, expected.score);
    assert.equal(pool.metrics.fallbacks, 1); assert.equal(stats.created, stats.terminated);
});

test('one iteration with parallel candidate batches matches serial placement and refinement', async () => {
    const data = simpleFixture(); data.educationalPlans[0].entries[0].lectureHours = 6;
    data.classrooms = Array.from({ length: 24 }, (_, i) => ({ ...data.classrooms[0], id: `room-${i}` }));
    const expected = await generateScheduleWithHeuristics(data, config);
    const stats = { created: 0, terminated: 0, active: 0, peak: 0 };
    const pool = new CandidatePool(3, inMemoryFactory(stats));
    const result = await generateScheduleWithHeuristics(data, config, { candidateEvaluator: pool });
    assert.ok(pool.metrics.candidates > 0); assert.equal(stats.peak, 3);
    assert.deepEqual(result.schedule, expected.schedule); assert.deepEqual(result.score, expected.score);
    assert.equal(calculateScheduleScore(data, result, config).hardViolations, 0);
});

test('stale, malformed and timed-out worker replies trigger safe fallback and cleanup', async () => {
    for (const kind of ['stale', 'nan', 'short', 'timeout']) {
        let terminated = 0;
        const data = simpleFixture();
        const pool = new CandidatePool(2, () => {
            const worker: CandidateWorker = { onmessage: null, onerror: null, terminate: () => { terminated++; }, postMessage: value => {
                const message: any = value;
                if (message.type !== 'evaluate' || kind === 'timeout') return;
                setTimeout(() => worker.onmessage?.({ data: { id: message.id, revision: message.revision + (kind === 'stale' ? 1 : 0),
                    costs: kind === 'nan' ? [NaN] : Array(kind === 'short' ? 0 : message.candidates.length).fill(0) } }), 0);
            } };
            return worker;
        }, 25);
        await pool.initialize(data, config);
        const candidates = Array(10).fill({ dateStr: '2026-10-19', timeSlotId: 'first', classroomId: 'room', teacherId: 'teacher' });
        assert.equal(await pool.evaluate(generateClassPool(data)[0], [], candidates), undefined);
        pool.dispose(); assert.equal(terminated, 2); assert.equal(pool.metrics.fallbacks, 1);
    }
});

test('stopping during one-iteration parallel scoring preserves all demand and releases workers', async () => {
    const data = simpleFixture(); data.educationalPlans[0].entries[0].lectureHours = 60;
    data.classrooms = Array.from({ length: 24 }, (_, i) => ({ ...data.classrooms[0], id: `room-${i}` }));
    const stats = { created: 0, terminated: 0, active: 0, peak: 0 };
    const pool = new CandidatePool(3, inMemoryFactory(stats));
    const result = await generateScheduleWithHeuristics(data, config, { candidateEvaluator: pool, shouldStop: () => pool.metrics.batches > 0 });
    assert.equal(result.interrupted, true); assert.equal(result.schedule.length + result.unschedulable.length, 30);
    assert.equal(stats.created, 3); assert.equal(stats.terminated, 3);
});
