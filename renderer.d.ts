// This file provides type definitions for the API exposed by Electron's preload script.
// It is automatically picked up by the TypeScript compiler.

/**
 * Interface for the API exposed from the main process to the renderer process
 * via `preload.js`.
 */
interface IElectronAPI {
  getApiKey: () => Promise<string | undefined>;
  setApiKey: (key: string) => Promise<{ success: boolean }>;
  setWindowTitle: (title: string) => Promise<void>;
  openFile: () => Promise<{ filePath: string; data: string } | null>;
  saveFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
  saveAsFile: (data: string) => Promise<string | null>;
  autosave: (data: string) => Promise<void>;
  onRestoreAutosaveRequest: (callback: () => void) => void;
  restoreAutosave: () => Promise<{ data: string } | null>;
  log: (...args: any[]) => void;
  savePdfFile: (data: ArrayBuffer, defaultPath: string) => Promise<string | null>;
  
  // Auto Updater and App Settings API
  getAutoUpdateSetting: () => Promise<boolean>;
  setAutoUpdateSetting: (enabled: boolean) => Promise<void>;
  checkForUpdates: () => Promise<void>;
  onUpdateAvailable: (callback: () => void) => void;
  onUpdateDownloaded: (callback: () => void) => void;
  restartApp: () => void;

  // Initial Project Load
  onLoadInitialProject: (callback: (project: { filePath: string, data: string }) => void) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

// FIX: Add an empty export to make this a module, allowing global augmentation.
export {};