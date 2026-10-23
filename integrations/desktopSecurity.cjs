const { pathToFileURL } = require('node:url');
function trustedSender(window, event, entryFile) {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
    try { const url = new URL(event.senderFrame.url); url.hash = ''; return url.href === pathToFileURL(entryFile).href; } catch { return false; }
}
function externalURL(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.href.length < 4096 ? url.href : null; } catch { return null; }
}
function protectWindow(window, shell, { printing = false } = {}) {
    const content = window.webContents;
    content.on('will-navigate', (event, url) => { event.preventDefault(); const target = externalURL(url); if (target) shell.openExternal(target).catch(() => {}); });
    content.on('will-attach-webview', event => event.preventDefault());
    content.setWindowOpenHandler(({ url, frameName }) => {
        const target = externalURL(url); if (target) shell.openExternal(target).catch(() => {});
        return { action: 'deny' };
    });
    content.on('did-create-window', child => protectWindow(child, shell, { printing: true }));
}
module.exports = { trustedSender, externalURL, protectWindow };
