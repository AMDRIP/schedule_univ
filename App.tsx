import React, { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { StoreProvider, useStore } from './hooks/useStore';
import { Role } from './types';
import Dashboard from './components/Dashboard';
import Header from './components/Header';
import NewProjectWizard from './components/NewProjectWizard';
import ConfirmationModal from './components/ConfirmationModal';

const AppContent: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<Role>(Role.Admin);
  const [isNewProjectWizardOpen, setNewProjectWizardOpen] = useState(false);
  const [isClearAllDataModalOpen, setClearAllDataModalOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const { clearAllData, runScheduler, clearSchedule } = useStore();

  const handleClearDataConfirm = () => {
    clearAllData();
    setClearAllDataModalOpen(false);
  };

  const handleRunScheduler = async (method: 'heuristic' | 'gemini') => {
    if (isScheduling) return;
    setIsScheduling(true);
    try {
        const result = await runScheduler(method);
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
  
  return (
     <>
      <div className="min-h-screen flex flex-col">
        <Header 
          currentRole={currentRole} 
          onRoleChange={setCurrentRole}
          onNewProject={() => setNewProjectWizardOpen(true)}
          onClearData={() => setClearAllDataModalOpen(true)}
          onRunScheduler={handleRunScheduler}
          onClearSchedule={handleClearSchedule}
          isScheduling={isScheduling}
        />
        <Dashboard currentRole={currentRole} />
      </div>
      {isNewProjectWizardOpen && (
        <NewProjectWizard
          isOpen={isNewProjectWizardOpen}
          onClose={() => setNewProjectWizardOpen(false)}
        />
      )}
      {isClearAllDataModalOpen && (
        <ConfirmationModal
          isOpen={isClearAllDataModalOpen}
          onClose={() => setClearAllDataModalOpen(false)}
          onConfirm={handleClearDataConfirm}
          title="Очистить все данные проекта?"
          message={
            <>
              <p>Это действие необратимо и приведет к удалению <strong>всех</strong> данных, включая:</p>
              <ul className="list-disc list-inside mt-2">
                  <li>Факультеты, кафедры, специальности</li>
                  <li>Преподавателей, группы, потоки</li>
                  <li>Дисциплины, аудитории, учебные планы</li>
                  <li>Составленное расписание и все правила</li>
              </ul>
              <p className="mt-2">Рекомендуется сначала сделать резервную копию (Настройки -> Экспорт в JSON).</p>
            </>
          }
          confirmText="УДАЛИТЬ"
        />
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