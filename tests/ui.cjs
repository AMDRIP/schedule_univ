const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const esbuild = require('esbuild');
const { _electron } = require('playwright');

async function run() {
    const root = path.resolve(__dirname, '..');
    esbuild.buildSync({ entryPoints: ['tests/uiHarness.tsx'], bundle: true, outfile: '.test-output/ui-harness.js', platform: 'browser', external: ['bindings', 'fs', 'path', 'node-addon-api'] });
    esbuild.buildSync({ entryPoints: ['tests/fixtures.ts'], bundle: true, outfile: '.test-output/fixtures.cjs', platform: 'node', format: 'cjs' });
    const { makeFixture, config } = require('../.test-output/fixtures.cjs');
    const server = http.createServer((req, res) => {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/TWD/output.css"></head><body><div id="root"></div><script src="/.test-output/ui-harness.js"></script></body></html>'); return; }
        const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
        if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.statusCode = 404; res.end(); return; }
        res.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : 'text/javascript'); fs.createReadStream(filename).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let app;
    try {
        app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'ui-main.cjs')], env: { ...process.env, UNIV_TEST_URL: `http://127.0.0.1:${server.address().port}/` }, timeout: 30000 });
        const page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.waitForFunction(() => !!window.__store);
        const version = require('../package.json').version;
        await page.getByText(`Версия ${version}`, { exact: true }).waitFor();
        await page.evaluate(data => { window.__store.loadFullState(data); window.__enter(); }, makeFixture());
        await page.getByRole('link', { name: 'Работы и исследования', exact: true }).click();
        await page.getByRole('button', { name: 'Новая работа', exact: true }).click();
        const form = page.locator('form');
        await form.getByLabel('Вид работы').selectOption('coursework');
        await form.getByLabel('Обучающийся').fill('Иван Тестов');
        await form.getByLabel('Дисциплина / НИР').selectOption('subject');
        await form.getByLabel('Тема', { exact: true }).fill('Исследование методов оптимизации');
        await form.getByLabel(/^Научный руководитель/).selectOption('teacher');
        await page.getByRole('button', { name: 'Добавить этапы исследования', exact: true }).click();
        await page.screenshot({ path: '.test-output/work-editor-desktop.png', fullPage: true });
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
        await page.waitForFunction(() => window.__store.academicWorks.length === 1);
        const snapshot = await page.evaluate(() => window.__store.getFullState());
        assert.equal(snapshot.academicWorks[0].milestones.length, 5);
        await page.evaluate(data => window.__store.loadFullState(data), snapshot);
        await page.waitForFunction(() => window.__store.academicWorks[0]?.studentName === 'Иван Тестов');
        await page.screenshot({ path: '.test-output/work-register-desktop.png', fullPage: true });
        await page.setViewportSize({ width: 780, height: 1000 });
        await page.screenshot({ path: '.test-output/work-register-compact.png', fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        const result = await page.evaluate(async configuration => window.__store.runScheduler('heuristic', configuration), config);
        assert.equal(result.scheduled, 5); assert.equal(result.unscheduled, 0);
        await page.getByText('Генерация завершена.', { exact: true }).waitFor();
        await page.screenshot({ path: '.test-output/generation-desktop.png', fullPage: true });
        assert.deepEqual(errors, []);
        console.log('Electron UI: version, coursework CRUD, milestones, .schd state round-trip, worker generation and screenshots passed.');
    } finally {
        if (app) await app.close();
        await new Promise(resolve => server.close(resolve));
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
