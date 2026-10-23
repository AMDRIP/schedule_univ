const { protectWindow } = require('./desktopSecurity.cjs');
async function printDocument(BrowserWindow, shell, owner, html) {
    if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > 8 * 1024 * 1024) throw new Error('Печатная форма превышает 8 МБ.');
    const window = new BrowserWindow({ parent: owner, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webSecurity: true, webviewTag: false } });
    protectWindow(window, shell, { printing: true });
    try {
        const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">`;
        await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8">' + policy + html));
        return await new Promise(resolve => window.webContents.print({ printBackground: true }, (success, failureReason) => resolve({ success, failureReason: failureReason || '' })));
    } finally { if (!window.isDestroyed()) window.destroy(); }
}
module.exports = { printDocument };
