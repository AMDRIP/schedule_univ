const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

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
  });
  
  // Open DevTools automatically if not in production
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    console.log('Main process: DevTools opened because app is not packaged.');
  }
}

app.whenReady().then(() => {
  console.log('Main process: App is ready.');
  // --- IPC Handlers ---

  // API Key
  ipcMain.handle('get-api-key', () => userApiKey);
  ipcMain.handle('set-api-key', (event, key) => {
    console.log(`Main process: API key set in session (length: ${key ? key.length : 0})`);
    userApiKey = key;
    return { success: true };
  });

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