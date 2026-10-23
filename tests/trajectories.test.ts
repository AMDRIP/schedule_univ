import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFixture, config, forbid } from './fixtures';
import { ClassType, DeliveryMode, ScheduleEntry } from '../types';
import { electiveDemand, electiveParticipants, studentAttends, linkSubjectRoomTypes, matchesElectiveUid } from '../utils/trajectories';
import { createScheduleValidator, generateClassPool, generateScheduleWithHeuristics, optimizeScheduleLocally, calculateScheduleScore, createCandidateScorer } from '../services/heuristicScheduler';
import { prepareLearningGroupUpdate } from '../services/learningGroups';
import { transitionMinutes } from '../services/campusTravel';
import { planningSignature } from '../services/scheduleRepair';

const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id: 'lesson', subjectId: 'subject', groupId: 'group', teacherId: 'teacher', classroomId: 'room', timeSlotId: 'first', day: 'Понедельник', date: '2026-10-19', weekType: 'every', classType: ClassType.Practical, deliveryMode: DeliveryMode.Offline, ...patch });
const dataWithStudents = () => {
    const data = makeFixture();
    data.groups.push({ ...data.groups[0], id: 'other', number: 'М-2' });
    data.students = [{ id: 'a', name: 'Анна', groupId: 'group' }, { id: 'b', name: 'Борис', groupId: 'other' }, { id: 'c', name: 'Светлана', groupId: 'group' }];
    data.subjects[0].classroomTypeRequirements[ClassType.Elective] = ['type'];
    data.electives = [{ id: 'choice', name: 'Исследования', subjectId: 'subject', teacherId: 'teacher', groupId: '', studentIds: ['a', 'b', 'a'], hoursPerSemester: 2 }];
    return data;
};
const campus = () => {
    const data = dataWithStudents();
    data.settings.travelPolicy = { enabled: true, sameBuildingMinutes: 3, perFloorMinutes: 2, betweenBuildingsMinutes: 30 };
    data.buildingPlans = [{ id: 'north', name: 'Северный', floors: [{ id: 'floor1', number: 1, name: '1 этаж', rooms: [], openings: [] }], travelMinutesTo: { south: 25 }, updatedAt: '' }, { id: 'south', name: 'Южный', floors: [{ id: 'floor2', number: 3, name: '3 этаж', rooms: [], openings: [] }], travelMinutesTo: { north: 25 }, updatedAt: '' }];
    data.classrooms[0].roomMetadata = { buildingPlanId: 'north', floorId: 'floor1', floorNumber: 1 };
    data.classrooms[1].roomMetadata = { buildingPlanId: 'south', floorId: 'floor2', floorNumber: 3 };
    return data;
};

test('cross-group enrollment derives every group and actual capacity without duplicating students', () => {
    const data = dataWithStudents();
    const members = electiveParticipants(data.electives[0], data.students, data.groups);
    assert.deepEqual(members.studentIds, ['a', 'b']); assert.deepEqual(members.groupIds, ['group', 'other']); assert.equal(members.studentCount, 2);
    const demand = electiveDemand(data.electives[0], data.students, data.groups)[0];
    assert.equal(demand.studentCount, 2); assert.deepEqual(demand.studentIds, ['a', 'b']);
    const wholeGroups = electiveParticipants({ ...data.electives[0], studentIds: undefined, groupIds: ['group', 'other'] }, data.students, data.groups);
    assert.equal(wholeGroups.studentCount, 24);
});

test('missing enrollment references cannot silently shrink the learning group', () => {
    const data = dataWithStudents(); data.electives[0].studentIds.push('missing');
    assert.throws(() => prepareLearningGroupUpdate(data, data.electives[0]), /Не найдены все обучающиеся/);
    assert.equal(electiveDemand(data.electives[0], data.students, data.groups).length, 1);
});

test('similarly named learning group IDs cannot capture each others entries', async () => {
    const data = dataWithStudents(); data.educationalPlans = []; data.electives[0].studentIds = ['a'];
    data.electives.push({ ...data.electives[0], id: 'choice-extra' });
    assert.equal(matchesElectiveUid('unsched-elective-choice-extra-0', 'choice'), false);
    assert.equal(matchesElectiveUid('unsched-elective-choice-extra-0', 'choice-extra'), true);
    data.schedule = [lesson({ classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-extra-0' })];
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].unscheduledUid, 'unsched-elective-choice-0');
    const update = prepareLearningGroupUpdate(data, { ...data.electives[0], studentIds: ['b'] });
    assert.deepEqual(update.schedule[0].studentIds, ['a']);
});

test('student calendar excludes other individual events and includes group, elective and own work', () => {
    const data = dataWithStudents(), student = data.students[0];
    assert.equal(studentAttends(lesson(), student), true);
    assert.equal(studentAttends(lesson({ studentIds: ['c'] }), student), false);
    assert.equal(studentAttends(lesson({ groupId: 'other', groupIds: ['group', 'other'], studentIds: ['a'] }), student), true);
    assert.equal(studentAttends(lesson({ academicWorkId: 'work', studentIds: ['a'] }), student), true);
    assert.equal(studentAttends(lesson({ academicWorkId: 'work' }), student), false);
});

test('enrollment update is atomic and checks student collisions in existing lessons', () => {
    const data = dataWithStudents();
    data.electives[0].studentIds = ['a'];
    data.schedule = [lesson({ classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' }), lesson({ id: 'busy-b', teacherId: 'reserve', classroomId: 'room2', groupId: 'other' })];
    const original = JSON.stringify(data);
    assert.throws(() => prepareLearningGroupUpdate(data, { ...data.electives[0], studentIds: ['a', 'b'] }), /Новый состав не помещается/);
    assert.equal(JSON.stringify(data), original);
    data.schedule.pop();
    const result = prepareLearningGroupUpdate(data, { ...data.electives[0], studentIds: ['a', 'b'] });
    assert.deepEqual(result.schedule[0].studentIds, ['a', 'b']); assert.deepEqual(result.schedule[0].groupIds, ['group', 'other']);
    assert.equal(result.schedule[0].id, 'lesson'); assert.deepEqual(data.schedule[0].studentIds, ['a']);
});

test('locked enrollment and invalid workload cannot be changed implicitly', () => {
    const data = dataWithStudents(); data.electives[0].studentIds = ['a'];
    data.schedule = [lesson({ locked: true, classType: ClassType.Elective, studentIds: ['a'], unscheduledUid: 'unsched-elective-choice-0' })];
    assert.throws(() => prepareLearningGroupUpdate(data, { ...data.electives[0], studentIds: ['b'] }), /закреплённого/);
    for (const hours of [0, -1, 2.5, Infinity]) assert.throws(() => prepareLearningGroupUpdate(data, { ...data.electives[0], hoursPerSemester: hours }), /часов/);
});

test('generation preserves selected participants, uses small rooms and does not duplicate completion', async () => {
    const data = dataWithStudents(); data.educationalPlans = [];
    data.classrooms = data.classrooms.map(room => ({ ...room, capacity: 2 }));
    const result = await generateScheduleWithHeuristics(data, { ...config, clearExisting: true });
    assert.equal(result.schedule.length, 1); assert.deepEqual(result.schedule[0].studentIds, ['a', 'b']); assert.equal(result.unschedulable.length, 0);
    assert.equal(createScheduleValidator(data)(result.schedule[0], result.schedule).valid, true);
    const completion = await generateScheduleWithHeuristics({ ...data, schedule: result.schedule }, { ...config, clearExisting: false });
    assert.equal(completion.schedule.length, 0); assert.equal(completion.unschedulable.length, 0);
});

test('independent student sets may share a slot; intersecting sets cannot', async () => {
    const data = dataWithStudents(); data.educationalPlans = []; data.timeSlots = [data.timeSlots[0]];
    data.electives[0].studentIds = ['a'];
    data.electives.push({ ...data.electives[0], id: 'second', teacherId: 'reserve', studentIds: ['c'] });
    const oneDay = { ...config, timeFrame: { start: '2026-10-19', end: '2026-10-19' } };
    const result = await generateScheduleWithHeuristics(data, oneDay);
    assert.equal(result.schedule.length, 2); assert.equal(result.unschedulable.length, 0);
    assert.equal(calculateScheduleScore({ ...data, schedule: [] }, { schedule: result.schedule, unschedulable: [] }, oneDay).hardViolations, 0);
    data.electives[1].studentIds = ['a'];
    const blocked = await generateScheduleWithHeuristics(data, oneDay);
    assert.equal(blocked.schedule.length, 1); assert.equal(blocked.unschedulable.length, 1);
});

test('student bans and accessibility invalidate cached domains without losing elective demand', async () => {
    const data = dataWithStudents(); data.educationalPlans = [];
    const first = await generateScheduleWithHeuristics(data, config); assert.equal(first.schedule.length, 1);
    data.students[0].availabilityGrid = forbid();
    const banned = await generateScheduleWithHeuristics(data, config); assert.equal(banned.schedule.length, 0); assert.equal(banned.unschedulable.length, 1);
    delete data.students[0].availabilityGrid; data.students[0].requiresStepFreeAccess = true;
    const inaccessible = await generateScheduleWithHeuristics(data, config); assert.equal(inaccessible.schedule.length, 0);
    assert.ok(JSON.stringify(inaccessible.explanations).includes('безбарьерный'));
    data.classrooms[0].stepFreeAccess = true;
    const fixed = await generateScheduleWithHeuristics(data, config); assert.equal(fixed.schedule.length, 1); assert.equal(fixed.schedule[0].classroomId, 'room');
});

test('elective semester filter and room-type batch links preserve unrelated requirements', async () => {
    const data = dataWithStudents(); data.educationalPlans = []; data.electives[0].semester = 2;
    assert.equal(generateClassPool(data).length, 1);
    assert.equal((await generateScheduleWithHeuristics(data, config)).schedule.length, 0);
    const subject = data.subjects[0]; const original = structuredClone(subject);
    const updated = linkSubjectRoomTypes(subject, [ClassType.Exam, ClassType.Lab], ['new', 'new'], 'add');
    assert.deepEqual(updated.classroomTypeRequirements?.[ClassType.Exam], ['type', 'new']); assert.deepEqual(subject, original);
    const replaced = linkSubjectRoomTypes(updated, [ClassType.Exam], ['new'], 'replace');
    assert.deepEqual(replaced.classroomTypeRequirements?.[ClassType.Exam], ['new']); assert.deepEqual(replaced.classroomTypeRequirements?.[ClassType.Lab], ['type', 'new']);
});

test('travel checks both chronological directions for teachers, groups and individual participants', () => {
    const data = campus(); data.schedule = [lesson()];
    const candidate = lesson({ id: 'later', timeSlotId: 'second', classroomId: 'room2' });
    assert.ok(createScheduleValidator(data)(candidate).issues.some(issue => issue.includes('переход')));
    data.schedule = [candidate]; assert.ok(createScheduleValidator(data)(lesson()).issues.some(issue => issue.includes('переход')));
    data.schedule = [lesson({ teacherId: 'reserve', studentIds: ['a'] })];
    assert.ok(createScheduleValidator(data)({ ...candidate, studentIds: ['a'] }).issues.some(issue => issue.includes('переход')));
    assert.equal(createScheduleValidator(data)({ ...candidate, studentIds: ['c'] }).issues.some(issue => issue.includes('переход')), false);
});

test('travel obeys route overrides, floors, real bell intervals and online exceptions', () => {
    const data = campus(); const from = data.classrooms[0], to = data.classrooms[1];
    assert.equal(transitionMinutes(from, to, data.buildingPlans, data.settings), 25);
    to.roomMetadata.buildingPlanId = 'north'; assert.equal(transitionMinutes(from, to, data.buildingPlans, data.settings), 7);
    to.roomMetadata.buildingPlanId = 'south'; data.schedule = [lesson()];
    const candidate = lesson({ id: 'later', timeSlotId: 'second', classroomId: 'room2' });
    data.timeSlots[1].time = '11:00-12:30'; assert.equal(createScheduleValidator(data)(candidate).valid, true);
    data.timeSlots[1].time = '10:45-12:15';
    assert.equal(createScheduleValidator(data)({ ...candidate, deliveryMode: DeliveryMode.Online }).valid, true);
    data.settings.travelPolicy.enabled = false; assert.equal(createScheduleValidator(data)(candidate).valid, true);
});

test('step-free access and equipment are checked for full groups as well as selected students', () => {
    const data = campus(); data.students[0].requiresStepFreeAccess = true; data.students[0].requiredClassroomTagIds = ['lift'];
    assert.equal(createScheduleValidator(data)(lesson()).valid, false);
    data.buildingPlans[0].floors[0].stepFreeAccess = true; data.classrooms[0].tagIds = ['lift'];
    assert.equal(createScheduleValidator(data)(lesson()).valid, true);
    data.classrooms[0].stepFreeAccess = false; assert.equal(createScheduleValidator(data)(lesson()).valid, false);
    assert.equal(createScheduleValidator(data)(lesson({ studentIds: ['c'] })).valid, true);
});

test('extra mobility time does not invent a transition when a student stays in the same room', () => {
    const data = campus(); data.students[0].extraTransitionMinutes = 20;
    data.schedule = [lesson({ studentIds: ['a'] })];
    assert.equal(createScheduleValidator(data)(lesson({ id: 'next', timeSlotId: 'second', studentIds: ['a'] })).valid, true);
});

test('campus rules affect candidate workers, final score, optimization and stale signatures', async () => {
    const data = campus(); data.schedule = [lesson(), lesson({ id: 'later', timeSlotId: 'second', classroomId: 'room2' })];
    const score = calculateScheduleScore({ ...data, schedule: [] }, { schedule: data.schedule, unschedulable: [] }, config);
    assert.ok(score.hardViolations > 0);
    const demand = { ...data.schedule[1], uid: 'later', studentCount: 12 };
    const costs = createCandidateScorer({ ...data, schedule: [data.schedule[0]] }, config)(demand, [], [{ dateStr: '2026-10-19', timeSlotId: 'second', classroomId: 'room2', teacherId: 'teacher' }]);
    assert.equal(costs[0], Infinity);
    const signature = planningSignature(data); data.buildingPlans[0].travelMinutesTo.south = 40; assert.notEqual(planningSignature(data), signature);
    const optimized = await optimizeScheduleLocally(data, config);
    assert.equal(calculateScheduleScore({ ...data, schedule: [] }, { schedule: optimized.schedule, unschedulable: [] }, config).hardViolations, 0);
});
