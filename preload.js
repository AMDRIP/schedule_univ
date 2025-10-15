const { contextBridge, ipcRenderer } = require('electron');

// Безопасно предоставляем API из главного процесса процессу рендеринга
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Запрашивает API-ключ из главного процесса.
   * @returns {Promise<string | undefined>} API-ключ.
   */
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  
  /**
   * Устанавливает API-ключ в главном процессе для текущей сессии.
   * @param {string} key - The API key to set.
   * @returns {Promise<{success: boolean}>}
   */
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),

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
});