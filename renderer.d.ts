// This file provides type definitions for the API exposed by Electron's preload script.
// It is automatically picked up by the TypeScript compiler.

/**
 * Interface for the API exposed from the main process to the renderer process
 * via `preload.js`.
 */
interface TelegramBotStatus {
  autoStart: boolean; format: 'html' | 'plain'; layout: 'detailed' | 'compact'; showTeacher: boolean; showRoom: boolean;
  hasToken: boolean; secureStorageAvailable: boolean; wanted: boolean;
  phase: 'stopped' | 'waiting' | 'starting' | 'connected' | 'reconnecting' | 'error'; lastError: string;
  lastConnectedAt: string | null; username: string; name: string; subscribers: number;
  publicationTitle: string; publicationVersion: number | null;
}
interface TelegramBotSettings {
  token?: string; autoStart: boolean; format: 'html' | 'plain'; layout: 'detailed' | 'compact'; showTeacher: boolean; showRoom: boolean;
}
interface IElectronAPI {
  getTelegramBotStatus?: () => Promise<TelegramBotStatus>;
  saveTelegramBotSettings?: (settings: TelegramBotSettings) => Promise<TelegramBotStatus>;
  checkTelegramBotConnection?: () => Promise<TelegramBotStatus>;
  startTelegramBot?: () => Promise<TelegramBotStatus>;
  stopTelegramBot?: () => Promise<TelegramBotStatus>;
  forgetTelegramBotToken?: () => Promise<TelegramBotStatus>;
  syncPublishedFeed?: (feed: unknown) => Promise<{ success: boolean }>;
  getPublicationServerStatus?: () => Promise<{ running: boolean; url?: string; apiToken?: string; calendarToken?: string; publicationFile?: string }>;
  startPublicationServer?: (port: number) => Promise<{ running: boolean; url: string; apiToken: string; calendarToken: string }>;
  stopPublicationServer?: () => Promise<void>;
  getApiKey: () => Promise<string | undefined>;
  setApiKey: (key: string) => Promise<{ success: boolean }>;
  getOpenRouterApiKey: () => Promise<string | undefined>;
  setOpenRouterApiKey: (key: string) => Promise<{ success: boolean }>;
  isAiForced: () => Promise<boolean>;
  runParallelScheduler?: (data: any, config: any) => Promise<any>;
  setWindowTitle: (title: string) => Promise<void>;
  openFile: () => Promise<{ filePath: string; data: string; stats?: { size: number; lastModified: string } } | null>;
  openRecentFile: (filePath: string) => Promise<{ filePath: string; data: string; stats?: { size: number; lastModified: string } } | null>;
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
export { };
