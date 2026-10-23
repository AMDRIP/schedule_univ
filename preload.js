const { contextBridge, ipcRenderer } = require('electron');
let initialProjectCallback, restoreCallback, pendingProject, pendingRestore = false;
ipcRenderer.on('load-initial-project', (_event, project) => { if (initialProjectCallback) initialProjectCallback(project); else pendingProject = project; });
ipcRenderer.on('restore-autosave-prompt', () => { if (restoreCallback) restoreCallback(); else pendingRestore = true; });

// Безопасно предоставляем API из главного процесса процессу рендеринга
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Запрашивает API-ключ Gemini из главного процесса.
   * @returns {Promise<string | undefined>} API-ключ.
   */
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  /**
   * Устанавливает API-ключ Gemini в главном процессе для текущей сессии.
   * @param {string} key - The API key to set.
   * @returns {Promise<{success: boolean}>}
   */
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),

  /**
   * Запрашивает API-ключ OpenRouter из главного процесса.
   * @returns {Promise<string | undefined>} API-ключ.
   */
  getOpenRouterApiKey: () => ipcRenderer.invoke('get-openrouter-api-key'),

  /**
   * Устанавливает API-ключ OpenRouter в главном процессе для текущей сессии.
   * @param {string} key - The API key to set.
   * @returns {Promise<{success: boolean}>}
   */
  setOpenRouterApiKey: (key) => ipcRenderer.invoke('set-openrouter-api-key', key),

  /**
   * Проверяет, был ли передан флаг для принудительной активации ИИ.
   * @returns {Promise<boolean>}
   */
  isAiForced: () => ipcRenderer.invoke('is-ai-forced'),
  runParallelScheduler: (data, config) => ipcRenderer.invoke('run-parallel-scheduler', data, config),
  syncPublishedFeed: (feed) => ipcRenderer.invoke('sync-published-feed', feed),
  getPublicationServerStatus: () => ipcRenderer.invoke('publication-server-status'),
  startPublicationServer: (port) => ipcRenderer.invoke('start-publication-server', port),
  stopPublicationServer: () => ipcRenderer.invoke('stop-publication-server'),
  getTelegramBotStatus: () => ipcRenderer.invoke('telegram-bot-status'),
  saveTelegramBotSettings: (settings) => ipcRenderer.invoke('telegram-bot-save', settings),
  checkTelegramBotConnection: () => ipcRenderer.invoke('telegram-bot-check'),
  startTelegramBot: () => ipcRenderer.invoke('telegram-bot-start'),
  stopTelegramBot: () => ipcRenderer.invoke('telegram-bot-stop'),
  forgetTelegramBotToken: () => ipcRenderer.invoke('telegram-bot-forget'),

  // --- File System and Window API ---
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  openFile: () => ipcRenderer.invoke('open-file'),
  openRecentFile: (filePath) => ipcRenderer.invoke('open-recent-file', filePath),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
  saveAsFile: (data) => ipcRenderer.invoke('save-as-file', data),
  autosave: (data) => ipcRenderer.invoke('autosave', data),
  savePdfFile: (data, defaultPath) => ipcRenderer.invoke('save-pdf-file', data, defaultPath),
  listProjectBackups: (filename) => ipcRenderer.invoke('list-project-backups', filename),
  createProjectBackup: (filename) => ipcRenderer.invoke('create-project-backup', filename),
  restoreProjectBackup: (filename, id) => ipcRenderer.invoke('restore-project-backup', filename, id),
  chooseProjectForRecovery: () => ipcRenderer.invoke('choose-project-for-recovery'),
  printHtml: (html) => ipcRenderer.invoke('print-html', html),

  // --- Autosave Recovery ---
  onRestoreAutosaveRequest: (callback) => { restoreCallback = callback; if (pendingRestore) { pendingRestore = false; callback(); } },
  restoreAutosave: () => ipcRenderer.invoke('restore-autosave'),
  skipAutosaveRecovery: () => ipcRenderer.invoke('skip-autosave-recovery'),

  /**
   * Отправляет сообщение для логирования в консоль основного процесса.
   * @param {...any} args - Аргументы для логирования.
   */
  log: (...args) => ipcRenderer.send('log-to-main', ...args),

  // --- Auto Updater and App Settings API ---
  getAutoUpdateSetting: () => ipcRenderer.invoke('get-auto-update-setting'),
  setAutoUpdateSetting: (enabled) => ipcRenderer.invoke('set-auto-update-setting', enabled),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, ...args) => callback(...args)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, ...args) => callback(...args)),
  restartApp: () => ipcRenderer.send('restart-app'),

  // --- Initial Project Load ---
  onLoadInitialProject: (callback) => { initialProjectCallback = callback; if (pendingProject) { const project = pendingProject; pendingProject = null; callback(project); } },
});
