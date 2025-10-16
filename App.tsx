import React, { useState, useEffect, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { StoreProvider, useStore } from './hooks/useStore';
import { Role, HeuristicConfig } from './types';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import NewProjectWizard from './components/NewProjectWizard';
import ConfirmationModal from './components/ConfirmationModal';
import UpdateNotification from './components/UpdateNotification';
import SchedulerConfigModal from './components/SchedulerConfigModal';

const AppContent: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<Role>(Role.Admin);
  const [isNewProjectWizardOpen, setNewProjectWizardOpen] = useState(false);
  const [isNewProjectConfirmOpen, setNewProjectConfirmOpen] = useState(false);
  const [isSchedulerConfigOpen, setSchedulerConfigOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const { runScheduler, clearSchedule, resetSchedule, startNewProject, handleOpen, handleSave, handleSaveAs, settings } = useStore();

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


  const handleRunScheduler = async (method: 'heuristic' | 'gemini', config?: HeuristicConfig) => {
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

  return (
     <>
      <div className="min-h-screen flex flex-col">
        <Header 
          currentRole={currentRole} 
          onRoleChange={setCurrentRole}
          onNew={() => setNewProjectConfirmOpen(true)}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onRunScheduler={handleRunScheduler}
          onClearSchedule={handleClearSchedule}
          onResetSchedule={handleResetSchedule}
          isScheduling={isScheduling}
        />
        <Dashboard currentRole={currentRole} />
      </div>
      {isNewProjectWizardOpen && (
        <NewProjectWizard
          isOpen={isNewProjectWizardOpen}
          onClose={handleCloseWizard}
        />
      )}
      {isSchedulerConfigOpen && (
        <SchedulerConfigModal
            isOpen={isSchedulerConfigOpen}
            onClose={() => setSchedulerConfigOpen(false)}
            onStart={handleStartHeuristicScheduler}
        />
      )}
      {isNewProjectConfirmOpen && (
        <ConfirmationModal
          isOpen={isNewProjectConfirmOpen}
          onClose={() => setNewProjectConfirmOpen(false)}
          onConfirm={handleNewProjectConfirm}
          title="Создать новый проект?"
          message="Все несохраненные изменения в текущем проекте будут утеряны. Это действие необратимо."
          confirmText="СОЗДАТЬ"
        />
      )}
      {updateDownloaded && (
        <UpdateNotification onRestart={handleRestartForUpdate} />
      )}
    </>
  );
}


const App: React.FC = () => {
  return (
    <StoreProvider>
      <DndProvider backend={HTML5Backend}>
        <AppContent />
      </DndProvider>
    </StoreProvider>
  );
};

export default App;