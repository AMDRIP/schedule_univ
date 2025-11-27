import { useState, useEffect, useCallback } from 'react';
import { useStore } from './useStore';
import { Role, HeuristicConfig, SessionSchedulerConfig } from '../types';

export const useAppLogic = () => {
    const [currentRole, setCurrentRole] = useState<Role>(Role.Admin);
    const [isNewProjectWizardOpen, setNewProjectWizardOpen] = useState(false);
    const [isNewProjectConfirmOpen, setNewProjectConfirmOpen] = useState(false);
    const [isSchedulerConfigOpen, setSchedulerConfigOpen] = useState(false);
    const [isSessionSchedulerOpen, setSessionSchedulerOpen] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);

    const {
        runScheduler,
        runSessionScheduler,
        clearSchedule,
        resetSchedule,
        startNewProject,
        handleOpen,
        handleSave,
        handleSaveAs,
        settings
    } = useStore();

    useEffect(() => {
        console.log('Renderer process started. AppContent mounted.');
        if (window.electronAPI?.log) {
            window.electronAPI.log('Renderer process started and successfully mounted the AppContent component.');
        }

        // Listen for update events from the main process
        if (window.electronAPI?.onUpdateDownloaded) {
            window.electronAPI.onUpdateDownloaded(() => {
                console.log("Update downloaded signal received in renderer.");
                setUpdateDownloaded(true);
            });
        }
    }, []);

    const handleRestartForUpdate = () => {
        window.electronAPI?.restartApp();
    };

    const handleStartHeuristicScheduler = (config: HeuristicConfig) => {
        setSchedulerConfigOpen(false);
        handleRunScheduler('heuristic', config);
    };

    const handleRunSessionScheduler = async (config: SessionSchedulerConfig) => {
        if (isScheduling) return;
        setIsScheduling(true);
        setSessionSchedulerOpen(false);

        try {
            const result = await runSessionScheduler(config);
            alert(`Генерация расписания сессии завершена!\n\nРазмещено экзаменов/консультаций: ${result.scheduled}\nНе удалось разместить: ${result.unscheduled}`);
            if (result.failedEntries.length > 0) {
                console.log("Не удалось разместить следующие события сессии:", result.failedEntries);
                alert("Подробности о неразмещенных событиях смотрите в консоли разработчика (Ctrl+Shift+I).");
            }
        } catch (err: any) {
            alert(`Ошибка при генерации расписания сессии: ${err.message}`);
            console.error(err);
        } finally {
            setIsScheduling(false);
        }
    };


    const handleRunScheduler = async (method: 'heuristic' | 'gemini' | 'openrouter', config?: HeuristicConfig) => {
        if (isScheduling) return;

        if (method === 'heuristic' && !config) {
            setSchedulerConfigOpen(true);
            return;
        }

        if (method === 'heuristic' && settings.respectProductionCalendar && !config?.timeFrame) {
            if (!window.confirm("Внимание: Эвристический планировщик в режиме без указания дат не может в полной мере учитывать производственный календарь и может разместить занятия на нерабочие дни. Рекомендуется использовать ИИ-планировщик (Gemini) или задать конкретный диапазон дат.\n\nПродолжить генерацию?")) {
                return;
            }
        }

        setIsScheduling(true);
        try {
            const result = await runScheduler(method, config);
            if (result.scheduled === 0 && result.unscheduled === 0 && result.failedEntries.length === 0) {
                // User likely cancelled the confirmation dialog
                alert("Генерация расписания отменена.");
            } else {
                let message = `Генерация завершена!\nРазмещено: ${result.scheduled}\nНе удалось разместить: ${result.unscheduled}`;
                if (result.failedEntries.length > 0) {
                    message += '\n\nСм. консоль для детального списка неразмещенных занятий.';
                    console.log("Не удалось разместить:", result.failedEntries);
                }
                alert(message);
            }
        } catch (err: any) {
            alert(`Ошибка при генерации расписания: ${err.message}`);
            console.error(err);
        } finally {
            setIsScheduling(false);
        }
    };

    const handleClearSchedule = () => {
        clearSchedule();
    };

    const handleResetSchedule = () => {
        resetSchedule();
    };

    const handleNewProjectConfirm = () => {
        startNewProject();
        setNewProjectConfirmOpen(false);
        setNewProjectWizardOpen(true);
    };

    const handleCloseWizard = useCallback(() => {
        setNewProjectWizardOpen(false);
    }, []);

    return {
        currentRole,
        setCurrentRole,
        isNewProjectWizardOpen,
        setNewProjectWizardOpen,
        isNewProjectConfirmOpen,
        setNewProjectConfirmOpen,
        isSchedulerConfigOpen,
        setSchedulerConfigOpen,
        isSessionSchedulerOpen,
        setSessionSchedulerOpen,
        isScheduling,
        updateDownloaded,
        handleRestartForUpdate,
        handleStartHeuristicScheduler,
        handleRunSessionScheduler,
        handleRunScheduler,
        handleClearSchedule,
        handleResetSchedule,
        handleNewProjectConfirm,
        handleCloseWizard,
        handleOpen,
        handleSave,
        handleSaveAs
    };
};
