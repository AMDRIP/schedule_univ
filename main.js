const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Включено по умолчанию и рекомендуется для безопасности
      nodeIntegration: false, // Отключено по умолчанию и рекомендуется для безопасности
    },
  });

  mainWindow.loadFile('index.html');
  
  // Раскомментируйте для открытия инструментов разработчика
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  // Обработчик для получения API-ключа из переменных окружения главного процесса
  ipcMain.handle('get-api-key', () => process.env.API_KEY);

  createWindow();

  app.on('activate', function () {
    // На macOS обычно принято заново создавать окно в приложении,
    // когда значок в доке нажат, а других окон нет.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Завершить работу, когда все окна закрыты, за исключением macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
