const { app, BrowserWindow, ipcMain, dialog, safeStorage, net, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { Worker } = require('worker_threads');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { randomBytes } = require('node:crypto');
const { createReadServer } = require('./integrations/readServer.cjs');
const { sanitizeFeed } = require('./integrations/publicSchedule.cjs');
const { createBotController } = require('./integrations/botController.cjs');
const { createProjectStorage, projectPath } = require('./integrations/projectStorage.cjs');
const { trustedSender, protectWindow } = require('./integrations/desktopSecurity.cjs');
const { printDocument } = require('./integrations/printWindow.cjs');
const { parseProject } = require('./integrations/projectValidation.cjs');
const { prerelease } = require('semver');
const entryFile = path.join(__dirname, 'index.html');
const projectStorage = createProjectStorage();
const approvedProjects = new Set();
const approveProject = filename => approvedProjects.add(projectPath(filename).toLowerCase());
const assertProject = filename => { if (!approvedProjects.has(projectPath(filename).toLowerCase())) throw new Error('Сначала откройте проект через приложение.'); };

let telegramController;

let publishedFeed = null;
let publicationServer = null;
let publicationAccess = null;
let publicationQueue = Promise.resolve();
const queuePublication = operation => {
  const result = publicationQueue.then(operation);
  publicationQueue = result.catch(() => {});
  return result;
};
const stopPublicationServer = async () => {
  if (publicationServer) await publicationServer.stop();
  publicationServer = null; publicationAccess = null;
};
const assertPublicationSender = event => {
  if (!trustedSender(mainWindow, event, entryFile)) throw new Error('IPC access denied.');
};
const handle = (channel, callback) => ipcMain.handle(channel, (event, ...args) => { assertPublicationSender(event); if (quitting) throw new Error('Приложение завершает работу.'); return callback(event, ...args); });
const listen = (channel, callback) => ipcMain.on(channel, (event, ...args) => { if (trustedSender(mainWindow, event, entryFile)) callback(event, ...args); });

// --- Updater Configuration ---
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.allowPrerelease = !!prerelease(require('./package.json').version);
autoUpdater.channel = autoUpdater.allowPrerelease ? 'rc' : 'latest';
autoUpdater.allowDowngrade = false;

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
    const loaded = JSON.parse(data);
    appSettings = { autoUpdateEnabled: loaded.autoUpdateEnabled !== false, lastProjectPath: typeof loaded.lastProjectPath === 'string' ? loaded.lastProjectPath : null };
    if (appSettings.lastProjectPath) { try { approveProject(appSettings.lastProjectPath); } catch { appSettings.lastProjectPath = null; } }
    console.log('Main process: App settings loaded.');
  } catch (error) {
    console.log('Main process: Could not load app settings, using defaults.');
  }
}

async function saveAppSettings() {
  try {
    await projectStorage.atomic(getSettingsPath(), Buffer.from(JSON.stringify(appSettings, null, 2)));
  } catch (error) {
    console.error('Main process: Failed to save app settings:', error);
  }
}


let mainWindow;
let userApiKey = process.env.API_KEY; // Initialize from env var, can be updated by user
let userOpenRouterKey = process.env.OPENROUTER_API_KEY; // Key for OpenRouter

// --- File Operations ---
const AUTOSAVE_FILE = 'autosave.schd';
const getAutosavePath = () => path.join(app.getPath('userData'), AUTOSAVE_FILE);
let pendingProject = process.argv.find(value => typeof value === 'string' && path.isAbsolute(value) && /\.schd$/i.test(value));
async function loadProject(filename) {
  const project = await projectStorage.open(filename); approveProject(project.filePath);
  appSettings.lastProjectPath = project.filePath; await saveAppSettings(); return project;
}
async function loadLastProject() {
  const filename = pendingProject || appSettings.lastProjectPath;
  pendingProject = null;
  if (!filename) return;
  try { mainWindow.webContents.send('load-initial-project', await loadProject(filename)); }
  catch { dialog.showErrorBox('Ошибка открытия проекта', 'Проект недоступен или повреждён. Откройте его резервную копию через настройки.'); }
}

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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  protectWindow(mainWindow, shell);
  mainWindow.webContents.session.setPermissionRequestHandler((_content, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);

  // After the window is loaded, check for an autosave file.
  mainWindow.webContents.on('did-finish-load', async () => {
    if (appSettings.autoUpdateEnabled) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    try {
      if (pendingProject) throw new Error('Explicit project requested');
      await projectStorage.open(getAutosavePath());
      // If the file exists, ask the renderer to prompt the user.
      mainWindow.webContents.send('restore-autosave-prompt');
      console.log('Main process: Autosave file found, sent prompt to renderer.');
      return;
    } catch (error) {
      // No autosave file, do nothing.
      console.log('Main process: No autosave file found.');
    }
    await loadLastProject();
  });

  // Open DevTools automatically if not in production
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    console.log('Main process: DevTools opened because app is not packaged.');
  }
  await mainWindow.loadFile(entryFile);
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  await loadAppSettings();
  telegramController = createBotController({ directory: app.getPath('userData'), secureStorage: safeStorage, getFeed: () => publishedFeed,
    fetchImpl: net?.fetch ? net.fetch.bind(net) : undefined });
  await telegramController.initialize();
  console.log('Main process: App is ready.');
  // --- IPC Handlers ---
  handle('sync-published-feed', (event, value) => {
    assertPublicationSender(event);
    const next = value === null ? null : sanitizeFeed(value);
    return queuePublication(async () => {
      if (!next || publishedFeed?.current.projectId !== next.current.projectId) await stopPublicationServer();
      const filename = path.join(app.getPath('userData'), 'published-schedule.json');
      if (next) {
        await fs.writeFile(filename + '.tmp', JSON.stringify(next), 'utf8');
        await fs.rename(filename + '.tmp', filename);
      } else await fs.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
      publishedFeed = next;
      telegramController.feedChanged().catch(() => {});
      return { success: true };
    });
  });
  handle('publication-server-status', event => {
    assertPublicationSender(event);
    return queuePublication(() => ({ running: !!publicationServer, ...publicationAccess, publicationFile: path.join(app.getPath('userData'), 'published-schedule.json') }));
  });
  handle('start-publication-server', (event, port) => {
    assertPublicationSender(event);
    return queuePublication(async () => {
      if (!publishedFeed) throw new Error('Сначала опубликуйте расписание.');
      if (publicationServer) return { running: true, ...publicationAccess };
      const apiToken = randomBytes(32).toString('hex'), calendarToken = randomBytes(32).toString('hex');
      const server = createReadServer({ getFeed: () => publishedFeed, apiToken, calendarToken });
      const url = await server.start(port);
      publicationServer = server; publicationAccess = { url, apiToken, calendarToken };
      return { running: true, ...publicationAccess };
    });
  });
  handle('stop-publication-server', event => queuePublication(stopPublicationServer));
  handle('telegram-bot-status', () => telegramController.getStatus());
  handle('telegram-bot-save', (_event, input) => telegramController.save(input));
  handle('telegram-bot-check', () => telegramController.check());
  handle('telegram-bot-start', () => telegramController.start());
  handle('telegram-bot-stop', () => telegramController.stop());
  handle('telegram-bot-forget', () => telegramController.forget());

  // API Key & AI Flag
  handle('get-api-key', () => userApiKey);
  handle('set-api-key', (event, key) => {
    if (typeof key !== 'string' || key.length > 4096) throw new Error('Некорректный ключ API.');
    console.log(`Main process: Gemini API key set in session (length: ${key ? key.length : 0})`);
    userApiKey = key;
    return { success: true };
  });
  handle('get-openrouter-api-key', () => userOpenRouterKey);
  handle('set-openrouter-api-key', (event, key) => {
    if (typeof key !== 'string' || key.length > 4096) throw new Error('Некорректный ключ API.');
    console.log(`Main process: OpenRouter API key set in session (length: ${key ? key.length : 0})`);
    userOpenRouterKey = key;
    return { success: true };
  });
  handle('is-ai-forced', () => process.argv.some(arg => arg === '-ai' || arg === '--ai'));

  handle('run-parallel-scheduler', async (event, data, config) => {
    parseProject(JSON.stringify(data));
    const iterations = Math.max(1, Math.min(1000, Math.floor(Number(config?.iterations) || 1)));
    const cpuCount = Math.max(1, (os.cpus()?.length || 2) - 1);
    const concurrency = Math.max(1, Math.min(iterations, cpuCount, 4));
    const spare = Math.floor(Math.min(cpuCount, 4) / concurrency) - 1;
    const candidateWorkers = spare >= 2 ? spare : 0;
    const baseSeed = config?.seed ?? Date.now();
    const workerPath = path.join(__dirname, 'dist', 'schedulerWorker.js');
    const batches = Array.from({ length: concurrency }, () => []);
    Array.from({ length: iterations }, (_, index) => index + 1).forEach((iteration, index) => {
      batches[index % concurrency].push(`${baseSeed}-${iteration}`);
    });
    const results = [];

    const runBatch = (seeds) => new Promise((resolve, reject) => {
      const workerConfig = {
        ...config,
        stochasticity: config?.stochasticity ?? 0.35,
      };
      const worker = new Worker(workerPath, {
        workerData: { data, config: workerConfig, seeds, candidateWorkers },
      });

      worker.once('message', message => {
        if (message?.ok) {
          resolve(message.result);
        } else {
          reject(new Error(message?.error || 'Scheduler worker failed'));
        }
      });
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code !== 0) {
          reject(new Error(`Scheduler worker exited with code ${code}`));
        }
      });
    });

    const workers = batches.filter(batch => batch.length > 0).map(async (batch) => {
      const result = await runBatch(batch);
      results.push(result);
    });

    await Promise.all(workers);
    if (results.length === 0) return null;

    return results.reduce((best, current) => {
      const bestScore = best?.score?.total ?? Number.POSITIVE_INFINITY;
      const currentScore = current?.score?.total ?? Number.POSITIVE_INFINITY;
      return currentScore < bestScore ? current : best;
    }, results[0]);
  });


  // Window Title
  handle('set-window-title', (event, title) => {
    if (typeof title !== 'string' || title.length > 1000) throw new Error('Некорректное название окна.');
    if (mainWindow) {
      mainWindow.setTitle(title);
    }
  });

  // Log from renderer to main process
  // Renderer logs are intentionally not persisted: they can contain project data or keys.
  listen('log-to-main', () => {});

  // Open File
  handle('open-file', async () => {
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
      return await loadProject(filePath);
    } catch (error) {
      console.error('Failed to open file:', error);
      dialog.showErrorBox('Ошибка открытия файла', `Не удалось прочитать файл: ${error.message}`);
      return null;
    }
  });

  handle('open-recent-file', async (event, filePath) => {
    try {
      return await loadProject(filePath);
    } catch (error) {
      console.error('Failed to open recent file:', error);
      dialog.showErrorBox('Ошибка открытия файла', `Не удалось прочитать файл: ${error.message}`);
      return null;
    }
  });

  // Save File
  handle('save-file', async (event, filePath, data) => {
    try {
      assertProject(filePath);
      const result = await projectStorage.save(filePath, data);
      appSettings.lastProjectPath = filePath;
      await saveAppSettings();
      return result;
    } catch (error) {
      console.error('Failed to save file:', error);
      dialog.showErrorBox('Ошибка сохранения файла', `Не удалось сохранить файл: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // Save File As
  handle('save-as-file', async (event, data) => {
    parseProject(data);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить проект как...',
      buttonLabel: 'Сохранить',
      filters: [{ name: 'Файлы расписания', extensions: ['schd'] }],
    });
    if (canceled || !filePath) {
      return null;
    }
    try {
      await projectStorage.save(filePath, data, { force: true }); approveProject(filePath);
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
  handle('save-pdf-file', async (event, data, defaultPath) => {
    if (!mainWindow) return null;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Сохранить PDF',
      defaultPath: typeof defaultPath === 'string' ? path.basename(defaultPath) : 'schedule.pdf',
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
  handle('autosave', async (event, data) => {
    await projectStorage.save(getAutosavePath(), data, { force: true });
  });

  // Restore Autosave
  handle('restore-autosave', async () => {
    try {
      const autosavePath = getAutosavePath();
      const { data } = await projectStorage.open(autosavePath);
      console.log('Main process: Autosave restored.');
      return { data };
    } catch (error) {
      console.error('Failed to restore autosave:', error);
      return null;
    }
  });
  handle('skip-autosave-recovery', () => loadLastProject());
  handle('list-project-backups', (_event, filename) => { assertProject(filename); return projectStorage.list(filename); });
  handle('create-project-backup', (_event, filename) => { assertProject(filename); return projectStorage.backup(filename); });
  handle('restore-project-backup', async (_event, filename, id) => { assertProject(filename); return projectStorage.restore(filename, id); });
  handle('choose-project-for-recovery', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Выбрать проект для восстановления', filters: [{ name: 'Проект расписания', extensions: ['schd'] }], properties: ['openFile'] });
    if (canceled || !filePaths[0]) return null;
    const filename = projectPath(filePaths[0]); approveProject(filename); return filename;
  });
  handle('print-html', (_event, html) => printDocument(BrowserWindow, shell, mainWindow, html));

  // --- Auto-updater IPC and App Settings ---
  handle('get-auto-update-setting', () => appSettings.autoUpdateEnabled);
  handle('set-auto-update-setting', async (event, enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('Некорректная настройка обновлений.');
    appSettings.autoUpdateEnabled = enabled;
    await saveAppSettings();
    console.log(`Main process: Auto-update setting changed to: ${enabled}`);
  });
  handle('check-for-updates', () => {
    console.log('Main process: Manual update check triggered.');
    return autoUpdater.checkForUpdates().then(() => {});
  });

  listen('restart-app', () => {
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
    log.warn('Update check failed.');
    dialog.showErrorBox('Ошибка обновления', 'Не удалось проверить или загрузить обновление. Проверьте доступ к GitHub и повторите попытку позже.');
  });


  await createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', async (_event, argv) => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus();
  const filename = argv.find(value => typeof value === 'string' && path.isAbsolute(value) && /\.schd$/i.test(value));
  if (!filename) return;
  const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['Открыть проект', 'Отмена'], defaultId: 1, cancelId: 1, message: 'Открыть выбранный проект? Несохранённые изменения в текущем проекте будут потеряны.' });
  if (response === 0) { pendingProject = filename; await loadLastProject(); }
});

app.on('window-all-closed', function () {
  telegramController?.stop().catch(() => {});
  stopPublicationServer().catch(() => {});
  console.log('Main process: All windows closed.');
  if (process.platform !== 'darwin') app.quit();
});

let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true; event.preventDefault();
  Promise.allSettled([telegramController?.stop(), stopPublicationServer(), projectStorage.flush()]).finally(() => app.quit());
});
