const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['tests/fixtures.ts'], bundle: true, outfile: '.test-output/fixtures.cjs', platform: 'node', format: 'cjs' });
const { makeFixture, config } = require('../.test-output/fixtures.cjs');
const data = makeFixture(); const group = data.groups[0]; const teacher = data.teachers[0]; const room = data.classrooms[0]; const link = data.teacherSubjectLinks[0];
data.groups = []; data.teachers = []; data.classrooms = []; data.teacherSubjectLinks = [];
for (let index = 0; index < 20; index++) {
    data.groups.push({ ...group, id: `g-${index}` }); data.teachers.push({ ...teacher, id: `t-${index}` }); data.classrooms.push({ ...room, id: `r-${index}` });
    data.teacherSubjectLinks.push({ ...link, id: `l-${index}`, teacherId: `t-${index}`, allowedGroupIds: [`g-${index}`] });
}
const run = seeds => new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve('dist/schedulerWorker.js'), { workerData: { data, config: { ...config, iterations: 1 }, seeds }, stdout: true, stderr: true });
    worker.stdout.resume(); worker.stderr.resume();
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error('Benchmark worker timeout')); }, 180000);
    worker.once('message', message => { clearTimeout(timeout); worker.terminate(); message.ok ? resolve(message.result) : reject(new Error(message.error)); });
    worker.once('error', error => { clearTimeout(timeout); reject(error); });
    worker.once('exit', code => { if (code) { clearTimeout(timeout); reject(new Error(`Benchmark worker exited: ${code}`)); } });
});
(async () => {
    await run(['warmup']);
    const seeds = ['bench-1', 'bench-2', 'bench-3', 'bench-4'];
    const startSequential = performance.now(); const sequential = await run(seeds); const sequentialMs = performance.now() - startSequential;
    const startParallel = performance.now(); const parallel = await Promise.all(seeds.map(seed => run([seed]))); const parallelMs = performance.now() - startParallel;
    for (const result of [sequential, ...parallel]) { assert.equal(result.schedule.length, 100); assert.equal(result.score.hardViolations, 0); }
    const result = { cpu: os.cpus()[0].model, logicalCores: os.availableParallelism?.() || os.cpus().length, iterations: 4, lessonsPerIteration: 100, sequentialMs: Math.round(sequentialMs), parallelMs: Math.round(parallelMs), speedup: Number((sequentialMs / parallelMs).toFixed(2)), sequentialScore: sequential.score.total, parallelBestScore: Math.min(...parallel.map(result => result.score.total)) };
    fs.writeFileSync('.test-output/parallel-benchmark.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
