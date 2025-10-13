const { contextBridge, ipcRenderer } = require('electron');

// Безопасно предоставляем API из главного процесса процессу рендеринга
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Запрашивает API-ключ из переменных окружения главного процесса.
   * @returns {Promise<string | undefined>} API-ключ.
   */
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
});
