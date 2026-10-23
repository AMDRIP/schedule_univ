import test from 'node:test';
import assert from 'node:assert/strict';
import { ClassType, DeliveryMode, ScheduleEntry } from '../types';
import { makeFixture, config } from './fixtures';
import { prepareRevision, publishRevision, publicationIssues, emptyPublications, exportPublishedFeed, normalizePublications, diffSnapshots, toICS } from '../services/publication';
import { createScheduleValidator, generateClassPool, generateScheduleWithHeuristics, optimizeScheduleLocally } from '../services/heuristicScheduler';
import { areGroupsCompatibleWithTimeSlot, getTimeSlotShiftLabel } from '../utils/shiftUtils';
import { sanitizeSnapshot, sanitizeFeed } from '../integrations/publicSchedule.cjs';
import { createReadServer } from '../integrations/readServer.cjs';
import { createBot, createAPI, chunks, dayInZone } from '../integrations/telegramBot.cjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const lesson = (patch: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id: 'lesson', subjectId: 'subject', groupId: 'group', teacherId: 'teacher', classroomId: 'room', timeSlotId: 'first', day: 'Понедельник', date: '2026-10-19', weekType: 'every', classType: ClassType.Practical, deliveryMode: DeliveryMode.Offline, ...patch });
const fixture = () => { const data = makeFixture(); data.schedule = [lesson()]; return data; };
const published = async (data = fixture()) => {
    const revision = prepareRevision(data, emptyPublications(), 'test-project', 'Семестр');
    return publishRevision(data, { revisions: [revision] }, revision.id);
};

test('shared shift is compatible with both cohorts, but never permits a resource collision', () => {
    const data = fixture(); const second = { ...data.groups[0], id: 'other', shift: 'second' };
    const shared = { ...data.timeSlots[0], shift: 'both' };
    assert.equal(areGroupsCompatibleWithTimeSlot(shared, [...data.groups, second]), true);
    assert.equal(areGroupsCompatibleWithTimeSlot(data.timeSlots[0], [second]), false);
    assert.equal(getTimeSlotShiftLabel('both'), 'Обе смены');
    data.groups.push(second); data.timeSlots[0] = shared;
    assert.equal(createScheduleValidator(data)(lesson({ id: 'other', groupId: 'other' })).valid, false);
});

test('generator and optimizer place cross-shift stream lectures only in a shared slot', async () => {
    const data = makeFixture();
    data.groups.push({ ...data.groups[0], id: 'evening', number: 'В-1', shift: 'second' });
    data.streams = [{ id: 'stream', name: 'Общий', groupIds: ['group', 'evening'], type: 'lecture' }];
    data.educationalPlans[0].entries = [{ subjectId: 'subject', semester: 1, lectureHours: 2, practiceHours: 0, labHours: 0, attestation: 'Без аттестации' }];
    data.timeSlots[1].shift = 'both';
    const demand = generateClassPool(data);
    assert.equal(demand.length, 1); assert.deepEqual(demand[0].groupIds.sort(), ['evening', 'group']);
    const result = await generateScheduleWithHeuristics(data, config);
    assert.equal(result.unschedulable.length, 0); assert.equal(result.schedule.length, 1); assert.equal(result.schedule[0].timeSlotId, 'second');
    data.schedule = result.schedule;
    const optimized = await optimizeScheduleLocally(data, config);
    assert.equal(optimized.schedule[0].timeSlotId, 'second'); assert.ok(createScheduleValidator(data)(optimized.schedule[0], optimized.schedule).valid);
});

test('review is an independent snapshot; publication does not replace the editable draft', async () => {
    const data = fixture(); const revision = prepareRevision(data, emptyPublications(), 'test-project', 'Осень');
    data.schedule[0].classroomId = 'room2';
    assert.equal(revision.schedule[0].classroomId, 'room'); assert.equal(revision.snapshot.lessons[0].classroomName, '101');
    await assert.rejects(publishRevision(data, { revisions: [revision] }, revision.id), /изменились/);
    data.schedule[0].classroomId = 'room';
    const state = await publishRevision(data, { revisions: [revision] }, revision.id);
    assert.equal(state.revisions[0].status, 'published'); assert.equal(revision.status, 'review');
    data.subjects[0].name = 'Новый черновик';
    assert.equal(exportPublishedFeed(state).current.lessons[0].subjectName, 'Методы исследования');
});

test('publish rejects changed input data, collisions and hard rules', async () => {
    const data = fixture(); const revision = prepareRevision(data, emptyPublications(), 'test-project', 'Осень');
    data.teachers[0].name = 'Изменённый преподаватель';
    await assert.rejects(publishRevision(data, { revisions: [revision] }, revision.id), /изменились/);
    data.schedule.push(lesson({ id: 'collision' }));
    assert.ok((await publicationIssues(data)).length);
    const colliding = prepareRevision(data, emptyPublications(), 'test-project', 'Коллизии');
    await assert.rejects(publishRevision(data, { revisions: [colliding] }, colliding.id));
});

test('new publication archives its predecessor and retains a stable diff and restorable schedule', async () => {
    const data = fixture(); const first = await published(data);
    data.schedule = [lesson({ timeSlotId: 'second', classroomId: 'room2' })];
    const revision = prepareRevision(data, first, 'test-project', 'Перенос');
    const second = await publishRevision(data, { revisions: [...first.revisions, revision] }, revision.id);
    assert.equal(second.revisions[0].status, 'archived'); assert.equal(first.revisions[0].status, 'published');
    const feed = exportPublishedFeed(second); const diff = diffSnapshots(feed.history[0], feed.current);
    assert.equal(diff.changed.length, 1); assert.equal(diff.added.length, 0); assert.deepEqual(diff.groupIds, ['group']);
    data.schedule = JSON.parse(JSON.stringify(second.revisions[0].schedule));
    const restored = prepareRevision(data, second, 'test-project', 'Возврат');
    const third = await publishRevision(data, { revisions: [...second.revisions, restored] }, restored.id);
    assert.equal(exportPublishedFeed(third).current.version, 3); assert.equal(exportPublishedFeed(third).current.lessons[0].startTime, '09:00');
    assert.deepEqual(normalizePublications(third, 'test-project'), third);
});

test('public allowlist omits students, private individual appointments and all draft metadata', async () => {
    const data = fixture(); data.students = [{ id: 'secret-student', name: 'Секретный студент', groupId: 'group', recordNumber: 'secret-record' }];
    data.schedule.push(lesson({ id: 'private-event', studentIds: ['secret-student'], date: '2026-10-20', day: 'Вторник' }));
    data.schedule[0].lessonPlan = { teacherNotes: 'secret-notes' } as any;
    const state = await published(data); const feed = exportPublishedFeed(state); const text = JSON.stringify(feed);
    for (const secret of ['secret-student', 'Секретный студент', 'secret-record', 'private-event', 'secret-notes', 'sourceSignature', 'availabilityGrid']) assert.equal(text.includes(secret), false, secret);
    assert.equal(feed.current.lessons.length, 1); assert.equal(state.revisions[0].excludedIndividual, 1);
    assert.equal(JSON.stringify(sanitizeFeed({ ...feed, token: 'SECRET', current: { ...feed.current, students: data.students } })).includes('SECRET'), false);
});

test('older reviews and edited snapshot payloads cannot supersede a newer publication', async () => {
    const data = fixture(); const first = prepareRevision(data, emptyPublications(), 'test-project', 'First');
    const second = prepareRevision(data, { revisions: [first] }, 'test-project', 'Second');
    const state = await publishRevision(data, { revisions: [first, second] }, second.id);
    await assert.rejects(publishRevision(data, state, first.id), /более новая/);
    const third = prepareRevision(data, state, 'test-project', 'Third');
    third.snapshot.lessons[0].classroomName = 'Непроверенная аудитория';
    await assert.rejects(publishRevision(data, { revisions: [...state.revisions, third] }, third.id), /Снимок/);
});

test('weekly templates expand into dated public lessons and use the active bell profile', async () => {
    const data = fixture(); data.settings.semesterEnd = '2026-11-02';
    data.schedule = [lesson({ date: undefined })];
    data.bellScheduleProfiles = [{ id: 'special', name: 'Особый', type: 'custom', isActive: true, appliesToDates: ['2026-10-26'], slots: [{ ...data.timeSlots[0], time: '11:00-12:30', shift: 'both' }] }];
    const state = await published(data); const snapshot = exportPublishedFeed(state).current;
    assert.equal(snapshot.lessons.length, 3); assert.equal(new Set(snapshot.lessons.map(item => item.id)).size, 3);
    assert.equal(snapshot.lessons.find(item => item.date === '2026-10-26').startTime, '11:00');
});

test('publication includes session dates beyond the semester without extending weekly teaching templates', async () => {
    const data = fixture();
    data.schedule = [lesson({ date: undefined }), lesson({ id: 'exam', date: '2026-10-26', day: 'Понедельник', classType: ClassType.Exam })];
    const state = await published(data); const snapshot = exportPublishedFeed(state).current;
    assert.equal(snapshot.range.end, '2026-10-26'); assert.equal(snapshot.lessons.length, 2);
    assert.equal(snapshot.lessons.filter(item => item.date === '2026-10-26').length, 1);
});

test('ICS uses publication time zone, stable UIDs, proper escaping and UTF-8 line folding', async () => {
    const data = fixture(); data.subjects[0].name = ('Наука, методы; исследования\n').repeat(10);
    const snapshot = exportPublishedFeed(await published(data)).current;
    const calendar = toICS(snapshot);
    assert.ok(calendar.includes('DTSTART:20261019T050000Z')); assert.ok(calendar.includes('DTEND:20261019T063000Z'));
    assert.ok(calendar.includes('\\,') && calendar.includes('\\;') && calendar.includes('\\n'));
    assert.ok(calendar.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
    assert.equal((toICS(snapshot, { groupId: 'not-a-group' }).match(/BEGIN:VEVENT/g) || []).length, 0);
    assert.equal(dayInZone(new Date('2026-10-18T22:30:00Z'), 'Europe/Samara'), '2026-10-19');
});

test('malformed publication periods and duplicate public identities cannot be accepted', () => {
    const data = fixture(); data.settings.semesterEnd = '2030-01-01';
    assert.throws(() => prepareRevision(data, emptyPublications(), 'project', 'Bad'), /границы/);
    data.settings.semesterEnd = config.timeFrame.end;
    const revision = prepareRevision(data, emptyPublications(), 'project', 'OK');
    assert.throws(() => sanitizeSnapshot({ ...revision.snapshot, lessons: [revision.snapshot.lessons[0], revision.snapshot.lessons[0]] }), /Duplicate/);
    assert.throws(() => normalizePublications({ revisions: [revision] }, 'another-project'), /версия/);
});

test('read-only API protects every endpoint, filters before/after changes, serves ICS and closes cleanly', async t => {
    const data = fixture(); let state = await published(data);
    data.schedule = [lesson({ groupId: 'other', timeSlotId: 'second' })]; data.groups.push({ ...data.groups[0], id: 'other', number: 'М-2' });
    const next = prepareRevision(data, state, 'test-project', 'Перенос группы');
    state = await publishRevision(data, { revisions: [...state.revisions, next] }, next.id);
    let feed = exportPublishedFeed(state);
    const token = 'api-'.repeat(16), calendarToken = 'ics-'.repeat(16);
    const server = createReadServer({ getFeed: () => feed, apiToken: token, calendarToken });
    const base = String(await server.start(0)); t.after(() => server.stop());
    const request = (route: string, options: any = {}) => fetch(base + route, { headers: { Authorization: `Bearer ${token}` }, ...options });
    assert.equal((await fetch(base + '/api/v1/schedule')).status, 401);
    assert.equal((await fetch(base + '/api/v1/schedule?token=' + calendarToken)).status, 401);
    assert.equal((await request('/api/v1/schedule', { method: 'POST' })).status, 405);
    assert.equal((await request('/api/v1/schedule?from=2026-02-30')).status, 400);
    assert.equal((await request('/api/v1/status')).headers.get('access-control-allow-origin'), null);
    const changes = await (await request('/api/v1/changes?since=1&projectId=test-project&groupId=group')).json();
    assert.equal(changes.changes.changed.length, 1);
    assert.equal((await request('/api/v1/changes?since=999&projectId=test-project')).status, 409);
    assert.equal((await request('/api/v1/changes?since=1&projectId=wrong')).status, 409);
    const response = await request('/api/v1/schedule?groupId=other'); assert.equal((await response.json()).lessons.length, 1);
    assert.equal((await request('/api/v1/schedule?groupId=other', { headers: { Authorization: `Bearer ${token}`, 'If-None-Match': response.headers.get('etag') } })).status, 304);
    const calendar = await fetch(base + '/calendar.ics?token=' + calendarToken + '&groupId=other');
    assert.equal(calendar.status, 200); assert.match(calendar.headers.get('content-type'), /text\/calendar/);
    assert.ok((await calendar.text()).includes('BEGIN:VEVENT'));
    const client = createAPI(base, token); assert.equal((await client('status')).version, 2);
    feed = null; assert.equal((await request('/api/v1/schedule')).status, 503);
});

test('bot selects concrete resources, uses semester time zone and notifies only after explicit subscription', async () => {
    const snapshot = exportPublishedFeed(await published()).current; const sent: string[] = []; let version = 1; let count = 0;
    const api = async (resource: string, params: any = {}) => {
        if (resource === 'status') return { ...snapshot, version };
        if (resource === 'groups') return { items: snapshot.groups };
        if (resource === 'schedule') { assert.equal(params.groupId, 'group'); assert.equal(params.from, '2026-10-19'); return { ...snapshot, version }; }
        if (resource === 'changes') { count++; return { version, changes: { added: [], removed: [], changed: [{ before: snapshot.lessons[0], after: { ...snapshot.lessons[0], startTime: '10:45' } }] } }; }
        throw new Error('Unexpected bot request.');
    };
    const bot = createBot({ api, send: async (_id: string, message: string) => { sent.push(message); }, now: () => new Date('2026-10-18T22:30:00Z') });
    const command = (text: string, type = 'private') => bot.handle({ message: { chat: { id: 42, type }, text } });
    await command('/group М-1'); await command('/today'); assert.ok(sent.at(-1).includes('Методы исследования'));
    version = 2; await bot.notify(); assert.equal(count, 0);
    await command('/subscribe'); version = 3; await bot.notify(); assert.equal(count, 1); assert.ok(sent.at(-1).includes('Стало:'));
    await bot.notify(); assert.equal(count, 1);
    await command('/unsubscribe'); version = 4; await bot.notify(); assert.equal(count, 1);
    const before = sent.length; await command('/group М-1', 'group'); assert.equal(sent.length, before);
    await command('/forget'); assert.equal(Object.keys(bot.state.chats).length, 0);
});

test('bot tokens cannot be sent to plaintext remote services; long messages remain bounded', () => {
    assert.throws(() => createAPI('http://example.com', 'a'.repeat(32)), /HTTPS/);
    assert.throws(() => createAPI('https://user:secret@example.com', 'a'.repeat(32)), /HTTPS/);
    assert.ok(chunks('Длинный текст '.repeat(1000)).every(item => item.length <= 3501));
});

test('an unavailable schedule does not block later bot commands or prevent unsubscribing', async () => {
    const sent: string[] = [];
    const bot = createBot({ api: async () => { throw new Error('Offline'); }, send: async (_id: string, message: string) => { sent.push(message); },
        state: { offset: 0, chats: { '42': { projectId: 'project', kind: 'group', id: 'group', name: 'Группа', version: 1, subscribed: true } } } });
    const command = (text: string) => bot.handle({ message: { chat: { id: 42, type: 'private' }, text } });
    await command('/today'); assert.ok(sent[0].includes('временно недоступно'));
    await command('/unsubscribe'); assert.equal(bot.state.chats['42'].subscribed, false);
    await command('/forget'); assert.deepEqual(bot.state.chats, {});
});

test('desktop IPC serializes API startup, rotates tokens, sanitizes files and stops on project switch', async t => {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'univ-publication-'));
    const root = process.cwd(); const actualRequire = createRequire(path.join(root, 'main.js'));
    const handlers = new Map<string, (...args: any[]) => any>(); let ready: Promise<unknown>;
    const app = Object.assign(new EventEmitter(), { getPath: () => folder, isPackaged: true,
        whenReady: () => ({ then: (callback: () => unknown) => { ready = Promise.resolve().then(callback); return ready; } }), quit: () => {} });
    let window: any;
    class FakeWindow {
        static getAllWindows() { return [window]; }
        webContents = Object.assign(new EventEmitter(), { mainFrame: {}, send: () => {}, openDevTools: () => {} });
        constructor() { window = this; }
        loadFile() {} setTitle() {}
    }
    const updater = new EventEmitter();
    const customRequire = (name: string) => {
        if (name === 'electron') return { app, BrowserWindow: FakeWindow, ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => handlers.set(name, handler), on: () => {} }, dialog: {} };
        if (name === 'electron-updater') return { autoUpdater: updater };
        if (name === 'electron-log') return { transports: { file: {} }, error: () => {} };
        return actualRequire(name);
    };
    vm.runInNewContext(await fs.readFile(path.join(root, 'main.js'), 'utf8'), { require: customRequire, __dirname: root, process: { env: {}, argv: [], platform: 'win32' }, console: { log() {}, warn() {}, error() {} } });
    await ready;
    const event = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
    const call = (name: string, ...args: any[]) => Promise.resolve().then(() => handlers.get(name)(event, ...args));
    t.after(async () => { await call('stop-publication-server'); await fs.rm(folder, { recursive: true, force: true }); });
    await assert.rejects(Promise.resolve().then(() => handlers.get('publication-server-status')({ sender: {}, senderFrame: {} })), /denied/);
    const feed = exportPublishedFeed(await published());
    await call('sync-published-feed', { ...feed, students: [{ name: 'PRIVATE' }], current: { ...feed.current, privateNotes: 'PRIVATE' } });
    const [first, duplicate] = await Promise.all([call('start-publication-server', 0), call('start-publication-server', 0)]);
    assert.equal(first.url, duplicate.url); assert.equal(first.apiToken, duplicate.apiToken);
    assert.equal((await createAPI(first.url, first.apiToken)('status')).version, 1);
    const file = await fs.readFile(path.join(folder, 'published-schedule.json'), 'utf8');
    assert.equal(file.includes('PRIVATE'), false); assert.equal(file.includes(first.apiToken), false);
    await call('stop-publication-server'); const second = await call('start-publication-server', 0);
    assert.notEqual(second.apiToken, first.apiToken); assert.notEqual(second.calendarToken, first.calendarToken);
    const another = JSON.parse(JSON.stringify(feed)); another.current.projectId = 'another-project';
    await call('sync-published-feed', another);
    assert.equal((await call('publication-server-status')).running, false);
    await call('sync-published-feed', null);
    await assert.rejects(fs.access(path.join(folder, 'published-schedule.json')));
});
