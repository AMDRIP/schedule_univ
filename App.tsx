import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { StoreProvider } from './hooks/useStore';
import { useAppLogic } from './hooks/useAppLogic';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import NewProjectWizard from './components/NewProjectWizard';
import ConfirmationModal from './components/ConfirmationModal';
import UpdateNotification from './components/UpdateNotification';
import SchedulerConfigModal from './components/SchedulerConfigModal';
import SessionSchedulerModal from './components/SessionSchedulerModal';
import SplashScreen from './components/SplashScreen';

const AppContent: React.FC = () => {
  const {
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
  } = useAppLogic();

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
          onRunSessionScheduler={() => setSessionSchedulerOpen(true)}
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
      {isSessionSchedulerOpen && (
        <SessionSchedulerModal
          isOpen={isSessionSchedulerOpen}
          onClose={() => setSessionSchedulerOpen(false)}
          onStart={handleRunSessionScheduler}
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
  const [showSplash, setShowSplash] = useState(true);

  const handleNewProject = () => {
    // The new project wizard will be opened via the logic in useAppLogic
    console.log('Creating new project');
  };

  const handleOpenProject = () => {
    // Trigger the open file dialog
    if (window.electronAPI?.openFile) {
      window.electronAPI.openFile();
    }
  };

  return (
    <StoreProvider>
      {showSplash ? (
        <SplashScreen
          onFinish={() => setShowSplash(false)}
          onNewProject={handleNewProject}
          onOpenProject={handleOpenProject}
        />
      ) : (
        <DndProvider backend={HTML5Backend}>
          <AppContent />
        </DndProvider>
      )}
    </StoreProvider>
  );
};

export default App;