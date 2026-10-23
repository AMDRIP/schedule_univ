const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
async function run() {
    const root = path.resolve(__dirname, '..');
    const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.includes('Content-Security-Policy')); assert.ok(html.includes("script-src 'self'"));
    assert.equal(/importmap|fonts\.google|aistudiocdn|index\.tsx|unsafe-eval/.test(html), false);
    const source = await fs.readFile(path.join(root, 'main.js'), 'utf8');
    assert.equal((source.match(/ipcMain\.handle\(/g) || []).length, 1);
    assert.equal((source.match(/ipcMain\.on\(/g) || []).length, 1);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'univ-security-'));
    await fs.writeFile(path.join(directory, 'app-settings.json'), JSON.stringify({ autoUpdateEnabled: false }));
    let app;
    try {
        app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'security-main.cjs')], env: { ...process.env, UNIV_SECURITY_DATA: directory, API_KEY: '', OPENROUTER_API_KEY: '', TG_BOT_TOKEN: '' }, timeout: 45000 });
        const page = await app.firstWindow();
        await page.getByText(`Версия ${require('../package.json').displayVersion}`, { exact: true }).waitFor();
        const isolation = await page.evaluate(async () => ({ node: typeof require, process: typeof process, key: await window.electronAPI.getApiKey() }));
        assert.equal(isolation.node, 'undefined'); assert.equal(isolation.process, 'undefined'); assert.equal(isolation.key, '');
        const preferences = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
        assert.equal(preferences.sandbox, true); assert.equal(preferences.contextIsolation, true); assert.equal(preferences.nodeIntegration, false); assert.equal(preferences.webSecurity, true);
        const updates = await app.evaluate(() => { const updater = globalThis.__univTestRequire('electron-updater').autoUpdater; return { channel: updater.channel, allowPrerelease: updater.allowPrerelease, allowDowngrade: updater.allowDowngrade }; });
        const isPrerelease = !!require('semver').prerelease(require('../package.json').version);
        assert.deepEqual(updates, { channel: isPrerelease ? 'rc' : 'latest', allowPrerelease: isPrerelease, allowDowngrade: false });
        const injected = await page.evaluate(() => { const script = document.createElement('script'); script.textContent = 'window.__injected = 1'; document.body.append(script); return window.__injected; });
        assert.equal(injected, undefined);
        assert.equal((await page.evaluate(() => window.electronAPI.saveFile('C:\\Windows\\unsafe.txt', '{"schedule":[]}'))).success, false);
        const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].id);
        const printPagePromise = app.waitForEvent('window');
        await page.evaluate(() => { window.__printJob = window.electronAPI.printHtml('<h1>Расписание</h1><script>window.__injected=1</script>'); });
        const child = await printPagePromise;
        const childPreferences = await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().find(window => window.id !== id).webContents.getLastWebPreferences(), mainId);
        assert.equal(childPreferences.nodeIntegration, false); assert.equal(childPreferences.sandbox, true); assert.equal(childPreferences.javascript, false); assert.equal(childPreferences.preload, undefined);
        await app.evaluate(async () => { const deadline = Date.now() + 3000; while (!globalThis.__finishPrint) { if (Date.now() > deadline) throw new Error('Print fixture timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } globalThis.__finishPrint(true); });
        assert.equal((await page.evaluate(() => window.__printJob)).success, true);
        const before = page.url();
        await page.evaluate(() => { window.open('https://example.org/documentation', '_blank'); });
        await page.waitForTimeout(100);
        assert.equal(page.url(), before);
        const links = await app.evaluate(() => globalThis.__externalURLs);
        assert.deepEqual(links, ['https://example.org/documentation']);
        assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
        console.log('Security: production main/preload, actual CSP blocks injected scripts, sandbox/isolation, no Node in renderer, file guard, isolated no-script print window, external browser routing and local-only renderer resources passed.');
    } finally { if (app) await app.close(); await fs.rm(directory, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
