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
        app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'packaged-main.cjs')],
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
        const telegram = await app.evaluate(async ({ safeStorage }, archive) => {
            const req = globalThis.__univTestRequire;
            const fs = req('node:fs/promises'), path = req('node:path'), os = req('node:os');
            const { createBotController } = req(path.join(archive, 'integrations/botController.cjs'));
            const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'univ-packaged-telegram-'));
            const token = '12345:packaged_fixture_not_a_real_bot_token';
            let source = null, polls = 0; const sent = [];
            const controller = createBotController({ directory, secureStorage: safeStorage, getFeed: () => source,
                fetchImpl: async (url, init) => {
                    const method = url.split('/').at(-1);
                    if (method === 'getUpdates' && ++polls > 1) return new Promise((_resolve, reject) => {
                        const abort = () => reject(new Error('Fixture aborted'));
                        if (init.signal.aborted) abort(); else init.signal.addEventListener('abort', abort, { once: true });
                    });
                    if (method === 'sendMessage') sent.push(JSON.parse(init.body));
                    const result = method === 'getMe' ? { id: 12345, is_bot: true, username: 'packaged_fixture_bot' } : method === 'getWebhookInfo' ? { url: '' } : method === 'getUpdates' ? [{ update_id: 10, message: { chat: { id: 42, type: 'private' }, text: '/start' } }] : {};
                    return { json: async () => ({ ok: true, result }) };
                } });
            try {
                await controller.initialize();
                if (!controller.getStatus().secureStorageAvailable) throw new Error('Windows secure storage is unavailable.');
                await controller.save({ token, autoStart: true, format: 'html', layout: 'compact', showTeacher: true, showRoom: true });
                const disk = await fs.readFile(path.join(directory, 'telegram-settings.json'), 'utf8');
                if (disk.includes(token) || JSON.stringify(controller.getStatus()).includes(token)) throw new Error('Token escaped secure storage.');
                await controller.check(); await controller.start();
                if (controller.getStatus().phase !== 'waiting') throw new Error('Bot must wait for a publication.');
                source = { schemaVersion: 1, history: [], current: { schemaVersion: 1, projectId: 'fixture', revisionId: 'revision', version: 1, title: 'Fixture', publishedAt: '2026-10-23T00:00:00Z', timeZone: 'Europe/Samara', range: { start: '2026-10-19', end: '2026-10-25' }, groups: [], teachers: [], classrooms: [], lessons: [] } };
                await controller.feedChanged();
                const deadline = Date.now() + 5000;
                while (polls < 2) { if (Date.now() > deadline) throw new Error('Packaged bot timed out: ' + controller.getStatus().lastError); await new Promise(resolve => setTimeout(resolve, 10)); }
                const connected = controller.getStatus(); await controller.stop();
                const state = JSON.parse(await fs.readFile(path.join(directory, 'telegram-state-12345.json'), 'utf8'));
                return { phase: connected.phase, stopped: controller.getStatus().phase, offset: state.offset, keyboard: !!sent[0]?.reply_markup.keyboard, html: sent[0]?.parse_mode === 'HTML' };
            } finally { await controller.stop(); await fs.rm(directory, { recursive: true, force: true }); }
        }, archive);
        assert.deepEqual(telegram, { phase: 'connected', stopped: 'stopped', offset: 11, keyboard: true, html: true });
        console.log('Packaged Telegram: real Windows safeStorage, encrypted settings, no token in status, publication wait, mocked Telegram handshake/menu/poll, persisted offset and cancellation passed.');
    } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
