const { contextBridge, ipcRenderer } = require('electron');

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

  // --- File System and Window API ---
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
  saveAsFile: (data) => ipcRenderer.invoke('save-as-file', data),
  autosave: (data) => ipcRenderer.invoke('autosave', data),
  savePdfFile: (data, defaultPath) => ipcRenderer.invoke('save-pdf-file', data, defaultPath),

  // --- Autosave Recovery ---
  onRestoreAutosaveRequest: (callback) => ipcRenderer.on('restore-autosave-prompt', callback),
  restoreAutosave: () => ipcRenderer.invoke('restore-autosave'),
  
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
  onLoadInitialProject: (callback) => ipcRenderer.on('load-initial-project', (_event, project) => callback(project)),
});