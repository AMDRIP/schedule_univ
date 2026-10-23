const { app, BrowserWindow } = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
    await window.loadURL(process.env.UNIV_TEST_URL);
});
app.on('window-all-closed', () => app.quit());
