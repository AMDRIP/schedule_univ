const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;

// --- File Operations ---
const AUTOSAVE_FILE = 'autosave.schd';
const getAutosavePath = () => path.join(app.getPath('userData'), AUTOSAVE_FILE);

async function createWindow() {
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
    } catch (error) {
      // No autosave file, do nothing.
    }
  });

  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // --- IPC Handlers ---

  // API Key
  ipcMain.handle('get-api-key', () => process.env.API_KEY);

  // Window Title
  ipcMain.handle('set-window-title', (event, title) => {
    if (mainWindow) {
      mainWindow.setTitle(title);
    }
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
      return filePath;
    } catch (error) {
      console.error('Failed to save file as:', error);
      dialog.showErrorBox('Ошибка сохранения файла', `Не удалось сохранить файл: ${error.message}`);
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
  // Clean up autosave file on normal exit
  fs.unlink(getAutosavePath()).catch(() => {});
  if (process.platform !== 'darwin') app.quit();
});
