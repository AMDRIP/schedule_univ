const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// --- Updater Configuration ---
log.transports.file.level = 'info';
autoUpdater.logger = log;

// --- App Settings Management ---
const SETTINGS_FILE = 'app-settings.json';
const getSettingsPath = () => path.join(app.getPath('userData'), SETTINGS_FILE);
let appSettings = {
    autoUpdateEnabled: true,
    lastProjectPath: null,
};

async function loadAppSettings() {
    try {
        const data = await fs.readFile(getSettingsPath(), 'utf-8');
        appSettings = { ...appSettings, ...JSON.parse(data) };
        console.log('Main process: App settings loaded.');
    } catch (error) {
        console.log('Main process: Could not load app settings, using defaults.');
    }
}

async function saveAppSettings() {
    try {
        await fs.writeFile(getSettingsPath(), JSON.stringify(appSettings, null, 2), 'utf-8');
    } catch (error) {
        console.error('Main process: Failed to save app settings:', error);
    }
}


let mainWindow;
let userApiKey = process.env.API_KEY; // Initialize from env var, can be updated by user

// --- File Operations ---
const AUTOSAVE_FILE = 'autosave.schd';
const getAutosavePath = () => path.join(app.getPath('userData'), AUTOSAVE_FILE);

async function createWindow() {
  console.log('Main process: Creating browser window...');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  // After the window is loaded, check for an autosave file.
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      await fs.access(getAutosavePath());
      // If the file exists, ask the renderer to prompt the user.
      mainWindow.webContents.send('restore-autosave-prompt');
      console.log('Main process: Autosave file found, sent prompt to renderer.');
    } catch (error) {
      // No autosave file, do nothing.
      console.log('Main process: No autosave file found.');
    }
    // Check for updates if enabled
    if (appSettings.autoUpdateEnabled) {
        console.log('Main process: Auto-update enabled, checking for updates...');
        autoUpdater.checkForUpdatesAndNotify();
    } else {
        console.log('Main process: Auto-update disabled.');
    }

    // Load last project
    if (appSettings.lastProjectPath) {
        try {
            await fs.access(appSettings.lastProjectPath);
            const data = await fs.readFile(appSettings.lastProjectPath, 'utf-8');
            console.log(`Main process: Loading last project from ${appSettings.lastProjectPath}`);
            mainWindow.webContents.send('load-initial-project', { filePath: appSettings.lastProjectPath, data });
        } catch (error) {
            console.warn(`Main process: Could not load last project from ${appSettings.lastProjectPath}:`, error.message);
            appSettings.lastProjectPath = null;
            await saveAppSettings();
        }
    }
  });
  
  // Open DevTools automatically if not in production
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    console.log('Main process: DevTools opened because app is not packaged.');
  }
}

app.whenReady().then(async () => {
  await loadAppSettings();
  console.log('Main process: App is ready.');
  // --- IPC Handlers ---

  // API Key & AI Flag
  ipcMain.handle('get-api-key', () => userApiKey);
  ipcMain.handle('set-api-key', (event, key) => {
    console.log(`Main process: API key set in session (length: ${key ? key.length : 0})`);
    userApiKey = key;
    return { success: true };
  });
  ipcMain.handle('is-ai-forced', () => process.argv.some(arg => arg === '-ai' || arg === '--ai'));


  // Window Title
  ipcMain.handle('set-window-title', (event, title) => {
    if (mainWindow) {
      mainWindow.setTitle(title);
    }
  });
  
  // Log from renderer to main process
  ipcMain.on('log-to-main', (event, ...args) => {
    console.log('[Renderer]:', ...args);
  });

  // Open File
  ipcMain.handle('open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Открыть проект',
      buttonLabel: 'Открыть',
      filters: [{ name: 'Файлы расписания', extensions: ['schd'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) {
      return null;
    }
    const filePath = filePaths[0];
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      console.log(`Main process: Opened file ${filePath}`);
      return { filePath, data };
    } catch (error) {
      console.error('Failed to open file:', error);
      dialog.showErrorBox('Ошибка открытия файла', `Не удалось прочитать файл: ${error.message}`);
      return null;
    }
  });

  // Save File
  ipcMain.handle('save-file', async (event, filePath, data) => {
    try {
      await fs.writeFile(filePath, data, 'utf-8');
      console.log(`Main process: Saved file to ${filePath}`);
      appSettings.lastProjectPath = filePath;
      await saveAppSettings();
      return { success: true };
    } catch (error) {
      console.error('Failed to save file:', error);
      dialog.showErrorBox('Ошибка сохранения файла', `Не удалось сохранить файл: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // Save File As
  ipcMain.handle('save-as-file', async (event, data) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить проект как...',
      buttonLabel: 'Сохранить',
      filters: [{ name: 'Файлы расписания', extensions: ['schd'] }],
    });
    if (canceled || !filePath) {
      return null;
    }
    try {
      await fs.writeFile(filePath, data, 'utf-8');
      console.log(`Main process: Saved file as ${filePath}`);
      appSettings.lastProjectPath = filePath;
      await saveAppSettings();
      return filePath;
    } catch (error) {
      console.error('Failed to save file as:', error);
      dialog.showErrorBox('Ошибка сохранения файла', `Не удалось сохранить файл: ${error.message}`);
      return null;
    }
  });

  // Save PDF File
  ipcMain.handle('save-pdf-file', async (event, data, defaultPath) => {
    if (!mainWindow) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить PDF',
      defaultPath: defaultPath,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) {
      return null;
    }
    try {
      // Data arrives as a Uint8Array-like object from renderer, convert to Buffer
      await fs.writeFile(filePath, Buffer.from(data));
      console.log(`Main process: Saved PDF to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to save PDF file:', error);
      dialog.showErrorBox('Ошибка сохранения PDF', `Не удалось сохранить файл: ${error.message}`);
      return null;
    }
  });

  // Autosave
  ipcMain.handle('autosave', async (event, data) => {
    try {
      await fs.writeFile(getAutosavePath(), data, 'utf-8');
    } catch (error) {
      console.error('Autosave failed:', error);
    }
  });

  // Restore Autosave
  ipcMain.handle('restore-autosave', async () => {
    try {
      const autosavePath = getAutosavePath();
      const data = await fs.readFile(autosavePath, 'utf-8');
      // Clean up autosave file after successful read
      await fs.unlink(autosavePath).catch(err => console.error("Could not delete autosave file:", err));
      console.log('Main process: Autosave restored.');
      return { data };
    } catch (error) {
      console.error('Failed to restore autosave:', error);
      return null;
    }
  });

  // --- Auto-updater IPC and App Settings ---
  ipcMain.handle('get-auto-update-setting', () => appSettings.autoUpdateEnabled);
  ipcMain.handle('set-auto-update-setting', async (event, enabled) => {
    appSettings.autoUpdateEnabled = enabled;
    await saveAppSettings();
    console.log(`Main process: Auto-update setting changed to: ${enabled}`);
  });
  ipcMain.handle('check-for-updates', () => {
    console.log('Main process: Manual update check triggered.');
    autoUpdater.checkForUpdates();
  });
  
  ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
  });
  
  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Найдено обновление',
            message: `Доступна новая версия ${info.version}. Загрузка начнется в фоновом режиме.`
        });
      mainWindow.webContents.send('update-available');
    }
  });

   autoUpdater.on('update-not-available', (info) => {
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Проверка обновлений',
        message: 'У вас установлена последняя версия приложения.'
    });
  });
  
  autoUpdater.on('update-downloaded', () => {
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded');
    }
  });

  autoUpdater.on('error', (err) => {
    log.error('Update error:', err);
    dialog.showErrorBox('Ошибка обновления', `Не удалось проверить или загрузить обновление: ${err.message}`);
  });


  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  console.log('Main process: All windows closed.');
  // Clean up autosave file on normal exit
  fs.unlink(getAutosavePath()).catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
