const esbuild = require('esbuild');
const path = require('path');
const { execFileSync } = require('child_process');
const { performance } = require('perf_hooks');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.test-output');
esbuild.buildSync({ entryPoints: ['tests/fixtures.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(output, 'fixtures.cjs') });
const baselineSource = execFileSync('git', ['show', 'v4441.605.2026:services/heuristicScheduler.ts'], { cwd: root, encoding: 'utf8' });
const options = { bundle: true, platform: 'node', format: 'cjs', external: ['bindings', 'fs', 'path', 'node-addon-api'] };
esbuild.buildSync({ ...options, stdin: { contents: baselineSource, resolveDir: path.join(root, 'services'), loader: 'ts' }, outfile: path.join(output, 'scheduler-baseline.cjs') });
esbuild.buildSync({ ...options, entryPoints: ['services/heuristicScheduler.ts'], outfile: path.join(output, 'scheduler-current.cjs') });
const { makeFixture, config } = require('./../.test-output/fixtures.cjs');
async function measure(name, scheduler) {
    const data = makeFixture();
    data.groups = Array.from({ length: 20 }, (_, i) => ({ ...data.groups[0], id: `group-${i}`, number: `M-${i}` }));
    data.educationalPlans[0].entries = [{ ...data.educationalPlans[0].entries[0], lectureHours: 600, practiceHours: 0, researchSeminarHours: 0, researchConsultationHours: 0, coursework: undefined }];
    const started = performance.now();
    const result = await scheduler.generateScheduleWithHeuristics(data, { ...config, timeFrame: { start: '2026-09-01', end: '2026-12-31' } }, { shouldStop: () => true });
    if (result.unschedulable.length !== 6000) throw new Error('Benchmark demand mismatch');
    return { name, milliseconds: Math.round(performance.now() - started), demand: result.unschedulable.length };
}
(async () => {
    const previousWarn = console.warn; console.warn = () => {};
    try {
        const before = await measure('4441 preprocessing', require('../.test-output/scheduler-baseline.cjs'));
        const after = await measure('5000 preprocessing', require('../.test-output/scheduler-current.cjs'));
        console.log(JSON.stringify({ before, after, speedup: Number((before.milliseconds / after.milliseconds).toFixed(2)), note: 'Precomputation and prioritization only; this does not measure full timetable generation.' }, null, 2));
    } finally { console.warn = previousWarn; }
})().catch(error => { console.error(error); process.exitCode = 1; });
