const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const asar = require('@electron/asar');
const esbuild = require('esbuild');

(async () => {
    const archive = path.resolve('dist/win-unpacked/resources/app.asar');
    assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, require('../package.json').version);
    for (const name of ['schedulerWorker.js', 'schedulerBrowserWorker.js', 'schedulerCandidateBrowserWorker.js', 'schedulerCandidateNodeWorker.js']) {
        const packaged = asar.extractFile(archive, `dist/${name}`);
        assert.ok(packaged.length > 1000);
        assert.deepEqual(packaged, fs.readFileSync(path.join('dist', name)));
    }
    esbuild.buildSync({ entryPoints: ['tests/fixtures.ts'], bundle: true, outfile: '.test-output/fixtures.cjs', platform: 'node', format: 'cjs' });
    const { makeFixture, config } = require('../.test-output/fixtures.cjs');
    const data = makeFixture();
    data.classrooms = Array.from({ length: 24 }, (_, i) => ({ ...data.classrooms[0], id: `packaged-room-${i}` }));
    const surface = path.resolve('.test-output/packaged-worker.html');
    fs.writeFileSync(surface, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    let app;
    try {
        app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'ui-main.cjs')],
            env: { ...process.env, UNIV_TEST_URL: pathToFileURL(surface).href }, timeout: 30000 });
        const page = await app.firstWindow();
        const workerURL = pathToFileURL(path.join(archive, 'dist/schedulerBrowserWorker.js')).href;
        const result = await page.evaluate(({ url, data, config }) => new Promise((resolve, reject) => {
            const worker = new Worker(url);
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('Packaged worker timed out')); }, 30000);
            worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
            worker.onmessage = event => {
                if (event.data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(event.data.error)); }
                if (event.data.type === 'result') { clearTimeout(timer); worker.terminate(); resolve(event.data); }
            };
            worker.postMessage({ type: 'start-iteration', data, config, candidateWorkers: 3 });
        }), { url: workerURL, data, config });
        assert.equal(result.result.schedule.length, 5);
        assert.equal(result.result.score.hardViolations, 0);
        assert.equal(result.candidateMetrics.workers, 3);
        assert.ok(result.candidateMetrics.candidates > 0);
        assert.equal(result.candidateMetrics.fallbacks, 0);
        console.log(`Packaged ASAR ${require('../package.json').version}: all worker bundles present; file:// generation with 3 nested workers passed.`);
    } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
