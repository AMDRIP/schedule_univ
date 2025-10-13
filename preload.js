const { contextBridge, ipcRenderer } = require('electron');

// Безопасно предоставляем API из главного процесса процессу рендеринга
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Запрашивает API-ключ из переменных окружения главного процесса.
   * @returns {Promise<string | undefined>} API-ключ.
   */
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  // --- File System and Window API ---
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
  saveAsFile: (data) => ipcRenderer.invoke('save-as-file', data),
  autosave: (data) => ipcRenderer.invoke('autosave', data),

  // --- Autosave Recovery ---
  onRestoreAutosaveRequest: (callback) => ipcRenderer.on('restore-autosave-prompt', callback),
  restoreAutosave: () => ipcRenderer.invoke('restore-autosave'),
});
