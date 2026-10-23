const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');

esbuild.buildSync({ entryPoints: ['tests/fixtures.ts'], bundle: true, outfile: '.test-output/fixtures.cjs', platform: 'node', format: 'cjs' });
const { makeFixture, config } = require('../.test-output/fixtures.cjs');
const data = makeFixture();
const group = data.groups[0], teacher = data.teachers[0], room = data.classrooms[0], link = data.teacherSubjectLinks[0];
const groups = Number(process.env.UNIV_BENCH_GROUPS || 12);
data.groups = []; data.teachers = []; data.classrooms = []; data.teacherSubjectLinks = [];
for (let i = 0; i < groups; i++) {
    data.groups.push({ ...group, id: `g-${i}` });
    for (let j = 0; j < 2; j++) {
        data.teachers.push({ ...teacher, id: `t-${i}-${j}` });
        data.teacherSubjectLinks.push({ ...link, id: `l-${i}-${j}`, teacherId: `t-${i}-${j}`, allowedGroupIds: [`g-${i}`] });
    }
}
data.classrooms = Array.from({ length: 24 }, (_, i) => ({ ...room, id: `r-${i}` }));
data.timeSlots = Array.from({ length: 6 }, (_, i) => ({ id: `slot-${i}`, shift: 'first', time: `${String(8 + i * 2).padStart(2, '0')}:00-${String(9 + i * 2).padStart(2, '0')}:30` }));
data.educationalPlans[0].entries = [{ subjectId: 'subject', semester: 1, lectureHours: 10, practiceHours: 10, labHours: 0 }];
data.settings.enforceStandardRules = false;
data.settings.semesterEnd = '2026-11-07';
const configuration = { ...config, iterations: 1, seed: 'one-iteration-5004', timeFrame: { start: data.settings.semesterStart, end: data.settings.semesterEnd } };
const run = candidateWorkers => new Promise((resolve, reject) => {
    const start = performance.now();
    const worker = new Worker(path.resolve('dist/schedulerWorker.js'), { workerData: { data, config: configuration, candidateWorkers }, stdout: true, stderr: true });
    worker.stdout.resume(); worker.stderr.resume();
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Single iteration benchmark timed out')); }, 240000);
    worker.once('message', async message => {
        clearTimeout(timer); await worker.terminate();
        if (!message.ok) { reject(new Error(message.error)); return; }
        resolve({ ms: Math.round(performance.now() - start), result: message.result, metrics: message.candidateMetrics });
    });
    worker.once('error', error => { clearTimeout(timer); worker.terminate(); reject(error); });
});
(async () => {
    const serial = await run(0);
    const parallel = await run(3);
    assert.equal(serial.result.schedule.length, groups * 10);
    assert.equal(serial.result.score.hardViolations, 0);
    assert.deepEqual(parallel.result.schedule, serial.result.schedule);
    assert.deepEqual(parallel.result.score, serial.result.score);
    assert.equal(parallel.metrics[0].workers, 3);
    assert.ok(parallel.metrics[0].candidates > 0);
    assert.equal(parallel.metrics[0].fallbacks, 0);
    const report = { cpu: os.cpus()[0].model, logicalCores: os.availableParallelism?.() || os.cpus().length,
        iterations: 1, lessons: groups * 10, serialMs: serial.ms, parallelMs: parallel.ms,
        speedup: Number((serial.ms / parallel.ms).toFixed(2)), identicalSchedule: true,
        hardViolations: parallel.result.score.hardViolations, candidateMetrics: parallel.metrics[0] };
    fs.writeFileSync('.test-output/one-iteration-benchmark.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
