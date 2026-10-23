const electron = require('electron');
electron.app.setPath('userData', process.env.UNIV_SECURITY_DATA);
electron.app.disableHardwareAcceleration();
globalThis.__univTestRequire = require;
globalThis.__externalURLs = [];
electron.shell.openExternal = async url => { globalThis.__externalURLs.push(url); };
electron.dialog.showErrorBox = () => {};
electron.app.on('browser-window-created', (_event, window) => { window.hide(); window.webContents.openDevTools = () => {}; window.webContents.print = (_options, callback) => { globalThis.__finishPrint = callback; }; });
require('../main.js');
