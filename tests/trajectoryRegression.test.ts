import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, config } from './fixtures';
import { ClassType, DeliveryMode, ScheduleEntry } from '../types';
import { createCandidateScorer, createScheduleValidator, generateScheduleWithHeuristics, optimizeScheduleLocally, validateResourceNeighborhood, calculateScheduleScore } from '../services/heuristicScheduler';
import { prepareLearningGroupUpdate } from '../services/learningGroups';
import { slotInterval } from '../services/campusTravel';

const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id: 'a', subjectId: 'subject', groupId: 'group', teacherId: 'teacher', classroomId: 'room', timeSlotId: 'first', day: 'Понедельник', date: '2026-10-19', weekType: 'every', classType: ClassType.Practical, deliveryMode: DeliveryMode.Offline, ...patch });
const fixture = () => {
    const data = makeFixture();
    data.students = [{ id: 'a', name: 'Анна', groupId: 'group' }, { id: 'b', name: 'Борис', groupId: 'group' }];
    data.teacherSubjectLinks.push({ ...data.teacherSubjectLinks[0], id: 'reserve-link', teacherId: 'reserve' });
    data.subjects[0].classroomTypeRequirements[ClassType.Elective] = ['type'];
    data.electives = [{ id: 'choice', name: 'Семинар', groupId: 'group', subjectId: 'subject', teacherId: 'teacher', studentIds: ['a'], hoursPerSemester: 2 }];
    return data;
};
const campus = () => {
    const data = fixture();
    data.settings.travelPolicy = { enabled: true, sameBuildingMinutes: 3, perFloorMinutes: 2, betweenBuildingsMinutes: 20 };
    data.timeSlots = [{ id: 'first', time: '09:00-10:00' }, { id: 'second', time: '10:10-11:10' }, { id: 'third', time: '11:20-12:20' }, { id: 'online', time: '10:05-11:15' }];
    data.classrooms.push({ ...data.classrooms[0], id: 'room3', number: '301' });
    data.buildingPlans = ['A', 'B', 'C'].map(id => ({ id, name: id, floors: [], updatedAt: '' }));
    data.classrooms.forEach((room, index) => { room.roomMetadata = { buildingPlanId: data.buildingPlans[index].id, floorNumber: 1 }; });
    data.buildingPlans[0].travelMinutesTo = { B: 5, C: 200 };
    data.buildingPlans[1].travelMinutesTo = { A: 5, C: 5 };
    data.buildingPlans[2].travelMinutesTo = { A: 200, B: 5 };
    return data;
};

test('trajectory membership and assigned teacher cannot be bypassed through a different valid teacher binding', () => {
    const data = fixture(); const validate = createScheduleValidator(data);
    const original = lesson({ classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' });
    assert.equal(validate(original).valid, true);
    assert.equal(validate({ ...original, teacherId: 'reserve', studentIds: ['b'] }).valid, false);
    assert.equal(validate({ ...original, teacherId: 'reserve' }).valid, false);
    assert.equal(validate({ ...original, classType: ClassType.Practical }).valid, false);
    data.electives = [];
    assert.equal(createScheduleValidator(data)(original).valid, false);
});

test('an empty optional groupIds array still uses the declared groupId', () => {
    const data = fixture();
    assert.equal(createScheduleValidator(data)(lesson({ groupIds: [] })).valid, true);
});

test('weekly enrollment changes do not collide with their own expanded template', () => {
    const data = fixture();
    data.schedule = [lesson({ date: undefined, classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' })];
    const result = prepareLearningGroupUpdate(data, { ...data.electives[0], name: 'Новое название', studentIds: ['a', 'b'] });
    assert.equal(result.schedule[0].date, undefined); assert.deepEqual(result.schedule[0].studentIds, ['a', 'b']);
});

test('weekly enrollment workload is counted by occurrences, not the number of templates', () => {
    const data = fixture(); data.settings.semesterEnd = '2026-11-02'; data.electives[0].hoursPerSemester = 6;
    data.schedule = [lesson({ date: undefined, classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' })];
    assert.throws(() => prepareLearningGroupUpdate(data, { ...data.electives[0], hoursPerSemester: 2 }), /объём|расписании больше/);
});

test('campus transitions follow consecutive physical lessons for the same participants', () => {
    const data = campus();
    data.schedule = [lesson(), lesson({ id: 'b', timeSlotId: 'second', classroomId: 'room2' })];
    const last = lesson({ id: 'c', timeSlotId: 'third', classroomId: 'room3' });
    const validation = createScheduleValidator(data)(last);
    assert.equal(validation.valid, true, validation.issues.join('\n'));
});

test('a different students middle lesson does not conceal a missing transition', () => {
    const data = campus(); data.teachers.push({ id: 'third-teacher', name: 'Третий', departmentId: 'dep' });
    data.teacherSubjectLinks.push({ ...data.teacherSubjectLinks[0], id: 'third-link', teacherId: 'third-teacher' });
    data.schedule = [lesson({ studentIds: ['a'], teacherId: 'reserve' }), lesson({ id: 'b', studentIds: ['b'], teacherId: 'third-teacher', timeSlotId: 'second', classroomId: 'room2' })];
    assert.ok(createScheduleValidator(data)(lesson({ id: 'c', studentIds: ['a'], timeSlotId: 'third', classroomId: 'room3' })).issues.some(issue => issue.includes('переход')));
});

test('online classes occupy time and cannot be used as free travel time', () => {
    const data = campus(); data.buildingPlans[0].travelMinutesTo.C = 20;
    const last = lesson({ id: 'c', timeSlotId: 'third', classroomId: 'room3' });
    const online = lesson({ id: 'online', timeSlotId: 'online', classroomId: 'room2', deliveryMode: DeliveryMode.Online });
    data.schedule = [lesson(), last];
    assert.equal(createScheduleValidator(data)(online).valid, false);
    data.schedule = [lesson(), online];
    assert.equal(createScheduleValidator(data)(last).valid, false);
});

test('malformed bell times cannot silently bypass campus checks', () => {
    assert.equal(slotInterval({ id: 'bad', time: '09:90-11:30' }), undefined);
    assert.equal(slotInterval({ id: 'bad', time: '24:00-25:30' }), undefined);
    const data = campus(); data.timeSlots[0].time = '09:90-11:30';
    assert.equal(createScheduleValidator(data)(lesson()).valid, false);
});

test('optimizer respects the requested groups and does not touch another cohort', async () => {
    const data = fixture(); data.groups.push({ ...data.groups[0], id: 'other', number: 'М-2' });
    const outside = lesson({ id: 'outside', groupId: 'other', teacherId: 'reserve', classroomId: 'room2', timeSlotId: 'second' });
    data.schedule = [lesson(), outside];
    const result = await optimizeScheduleLocally(data, { ...config, targetGroupIds: ['group'] });
    assert.equal(result.considered, 1); assert.deepEqual(result.schedule.find(entry => entry.id === outside.id), outside);
});

test('candidate scorer uses the same trajectory and travel constraints as the validator', () => {
    const data = campus(); data.schedule = [lesson(), lesson({ id: 'b', timeSlotId: 'second', classroomId: 'room2' })];
    const demand = { ...lesson({ id: 'c' }), uid: 'c', studentCount: 12 };
    assert.ok(Number.isFinite(createCandidateScorer(data, config)(demand, [], [{ dateStr: '2026-10-19', timeSlotId: 'third', classroomId: 'room3', teacherId: 'teacher' }])[0]));
});

test('moving an intermediate lesson must not break the route left on the original day', () => {
    const data = campus();
    const before = [lesson(), lesson({ id: 'b', timeSlotId: 'second', classroomId: 'room2' }), lesson({ id: 'c', timeSlotId: 'third', classroomId: 'room3' })];
    assert.ok(before.every(entry => createScheduleValidator(data)(entry, before).valid));
    const after = before.map(entry => entry.id === 'b' ? { ...entry, date: '2026-10-20', day: 'Вторник' } : entry);
    assert.equal(createScheduleValidator(data)(after[1], after).valid, true);
    assert.ok(validateResourceNeighborhood(data, before, after, config).some(issue => issue.includes('переход')));
    assert.deepEqual(validateResourceNeighborhood(data, before, before, config), []);
});

test('annealing and greedy refinement preserve individual participants and physical feasibility', async () => {
    const data = campus(); data.educationalPlans = []; data.electives = [];
    data.schedule = [lesson({ studentIds: ['a'] }), lesson({ id: 'b', studentIds: ['a'], timeSlotId: 'second', classroomId: 'room2' }), lesson({ id: 'c', studentIds: ['a'], timeSlotId: 'third', classroomId: 'room3' })];
    data.schedule.forEach((entry, index) => { entry.unscheduledUid = `unsched-elective-e${index}-0`; data.electives.push({ id: `e${index}`, name: `Семинар ${index}`, groupId: 'group', subjectId: 'subject', teacherId: 'teacher', studentIds: ['a'], hoursPerSemester: 2, classType: ClassType.Practical }); });
    for (const seed of [3, 19, 5021]) {
        const result = await optimizeScheduleLocally(data, { ...config, seed, iterations: 2 });
        assert.equal(result.schedule.length, 3);
        assert.ok(result.schedule.every(entry => entry.studentIds?.length === 1 && entry.studentIds[0] === 'a'));
        assert.ok(result.schedule.every(entry => createScheduleValidator(data)(entry, result.schedule).valid));
        assert.equal(calculateScheduleScore({ ...data, schedule: [] }, { schedule: result.schedule, unschedulable: [] }, config).hardViolations, 0);
    }
});

test('local resource checks never remove, duplicate or move a locked lesson', () => {
    const data = fixture(); const entry = lesson({ locked: true });
    assert.ok(validateResourceNeighborhood(data, [entry], [], config).length);
    assert.ok(validateResourceNeighborhood(data, [entry], [entry, entry], config).length);
    assert.ok(validateResourceNeighborhood(data, [entry], [{ ...entry, timeSlotId: 'second' }], config).some(issue => issue.includes('Закреплённое')));
});

test('optimizer does not replace an explicitly assigned elective teacher with a bound colleague', async () => {
    const data = fixture(); data.educationalPlans = [];
    data.schedule = [lesson({ classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' })];
    const result = await optimizeScheduleLocally(data, { ...config, iterations: 3, seed: 'fixed-elective-teacher' });
    assert.equal(result.schedule[0].teacherId, 'teacher');
    assert.deepEqual(result.schedule[0].studentIds, ['a']);
    assert.ok(createScheduleValidator(data)(result.schedule[0], result.schedule).valid);
});

test('locked learning group semester cannot change through an enrollment edit', () => {
    const data = fixture(); data.electives[0].semester = 1;
    data.schedule = [lesson({ locked: true, semester: 1, classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' })];
    assert.throws(() => prepareLearningGroupUpdate(data, { ...data.electives[0], semester: 2 }), /закреплённого/);
});

test('random student sets and travel candidates agree between coordinator and worker scorer', () => {
    const data = campus(); data.groups.push({ ...data.groups[0], id: 'other', number: 'М-2' });
    data.students.push({ id: 'c', name: 'Вера', groupId: 'other', extraTransitionMinutes: 8 });
    data.electives = [];
    let seed = 9631;
    const pick = (length: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % length; };
    const selected = [['a'], ['b'], ['c'], ['a', 'c']];
    const randomEntry = (id: string): ScheduleEntry => {
        const ids = pick(3) ? selected[pick(selected.length)] : undefined;
        const groupIds = ids ? [...new Set(ids.map(studentId => data.students.find(student => student.id === studentId).groupId))] : [pick(2) ? 'group' : 'other'];
        return lesson({ id, studentIds: ids, groupId: groupIds[0], groupIds: pick(2) || groupIds.length > 1 ? groupIds : [], teacherId: pick(2) ? 'teacher' : 'reserve', timeSlotId: data.timeSlots[pick(data.timeSlots.length)].id, classroomId: data.classrooms[pick(data.classrooms.length)].id, deliveryMode: pick(4) ? DeliveryMode.Offline : DeliveryMode.Online });
    };
    for (let trial = 0; trial < 150; trial++) {
        data.schedule = Array.from({ length: pick(5) }, (_, index) => randomEntry(`other-${index}`));
        const original = randomEntry('candidate');
        const placement = { dateStr: '2026-10-19', timeSlotId: data.timeSlots[pick(data.timeSlots.length)].id, classroomId: data.classrooms[pick(data.classrooms.length)].id, teacherId: pick(2) ? 'teacher' : 'reserve' };
        const entry = { ...original, date: placement.dateStr, timeSlotId: placement.timeSlotId, classroomId: placement.classroomId, teacherId: placement.teacherId };
        const result = createScheduleValidator(data, config)(entry);
        const groups = entry.groupIds?.length ? entry.groupIds : [entry.groupId];
        const demand = { ...original, uid: original.id, studentCount: original.studentIds?.length || data.groups.filter(group => groups.includes(group.id)).reduce((sum, group) => sum + group.studentCount, 0) };
        const cost = createCandidateScorer(data, config)(demand, [], [placement])[0];
        assert.equal(Number.isFinite(cost), result.valid, `Trial ${trial}: ${result.issues.join('; ')}`);
    }
});

test('registered student and campus stress keeps every planned lesson and no hard violations', async () => {
    const data = campus(); data.electives = [];
    data.settings.semesterEnd = '2026-10-31';
    data.timeSlots = data.timeSlots.filter(slot => slot.id !== 'online');
    data.groups = Array.from({ length: 4 }, (_, index) => ({ ...data.groups[0], id: `group-${index}`, number: `М-${index + 1}`, studentCount: 20 }));
    data.students = data.groups.flatMap(group => Array.from({ length: 20 }, (_, index) => ({ id: `${group.id}-student-${index}`, name: `Студент ${group.id} ${index}`, groupId: group.id, extraTransitionMinutes: index === 0 ? 5 : 0 })));
    data.educationalPlans[0].entries = [{ subjectId: 'subject', semester: 1, lectureHours: 0, practiceHours: 20, labHours: 0, attestation: 'Без аттестации' }];
    data.buildingPlans.forEach(plan => { plan.travelMinutesTo = {}; });
    data.classrooms = Array.from({ length: 24 }, (_, index) => ({ ...data.classrooms[0], id: `room-${index}`, number: `${index + 100}`, roomMetadata: { buildingPlanId: index % 2 ? 'A' : 'B', floorNumber: 1 } }));
    const configuration = { ...config, timeFrame: { start: '2026-10-19', end: '2026-10-31' }, seed: 'campus-stress' };
    const started = performance.now();
    const result = await generateScheduleWithHeuristics(data, configuration);
    assert.equal(result.schedule.length + result.unschedulable.length, 40);
    assert.equal(result.unschedulable.length, 0);
    const validate = createScheduleValidator({ ...data, schedule: result.schedule }, configuration);
    assert.ok(result.schedule.every(entry => validate(entry).valid));
    assert.ok(performance.now() - started < 20000);
    console.log(`Registered-student/campus stress: ${Math.round(performance.now() - started)}ms, 40 lessons, 80 students.`);
});
