import React, { useEffect, useState } from 'react';
import { Role } from '../types';
import Sidebar from './Sidebar';
import ScheduleView from './ScheduleView';
import DataManager from './DataManager';
import AutoScheduler from './GeminiScheduler';
import SettingsView from './SettingsView';
import LinkManager from './LinkManager';
import RuleManager from './RuleManager';
import EducationalPlanManager from './EducationalPlanManager';
import AcademicCalendarView from './AcademicCalendarView';
import ProductionCalendarManager from './ProductionCalendarManager';
import DepartmentView from './DepartmentView';
import { useStore } from '../hooks/useStore';
import FacultyView from './FacultyView';
import TeacherView from './TeacherView';
import UniversityWideSchedule from './UniversityWideSchedule';
import TeacherGroupLessons from './TeacherGroupLessons';
import AcademicProgramsManager from './AcademicProgramsManager';
import CohortManager from './CohortManager';
import RoomResourcesManager from './RoomResourcesManager';
import BellScheduleManager from './BellScheduleManager';


interface DashboardProps {
  currentRole: Role;
}

const Dashboard: React.FC<DashboardProps> = ({ currentRole }) => {
  const [activeView, setActiveView] = useState('Просмотр расписания');
  const [viewEntityId, setViewEntityId] = useState<string | null>(null);
  const { viewDate, setViewDate } = useStore();

  const handleNavigate = (view: string, id: string) => {
    setActiveView(view);
    setViewEntityId(id);
  };

  const handleSidebarNavigate = (view: string) => {
    setActiveView(view);
    setViewEntityId(null);
  };

  useEffect(() => {
    const handleOpenTeacherCard = (event: Event) => {
      const teacherId = (event as CustomEvent<string>).detail;
      if (teacherId) {
        handleNavigate('Просмотр преподавателя', teacherId);
      }
    };

    window.addEventListener('open-teacher-card', handleOpenTeacherCard);
    return () => window.removeEventListener('open-teacher-card', handleOpenTeacherCard);
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case 'Планы зданий':
      case 'Аудиторный фонд':
        return <RoomResourcesManager />;
      case 'Просмотр расписания':
        return <ScheduleView currentRole={currentRole} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'Сводное расписание':
        return <UniversityWideSchedule setViewDate={setViewDate} setActiveView={setActiveView} />;
      case 'Академический календарь':
        return <AcademicCalendarView setViewDate={setViewDate} setActiveView={setActiveView} />;
      case 'Составление расписания':
        return <AutoScheduler />;
      case 'Планы занятий':
        return <TeacherGroupLessons />;
      case 'Факультеты':
        return <DataManager dataType="faculties" title="Управление факультетами" onNavigate={handleNavigate} />;
      case 'Просмотр института/факультета':
        return <FacultyView facultyId={viewEntityId!} onNavigate={handleNavigate} />;
      case 'Кафедры':
        return <DataManager dataType="departments" title="Управление кафедрами" onNavigate={handleNavigate} />;
      case 'Просмотр кафедры':
        return <DepartmentView departmentId={viewEntityId!} onNavigate={handleNavigate} />;
      case 'Преподаватели':
        return <DataManager dataType="teachers" title="Управление преподавателями" onNavigate={handleNavigate} />;
      case 'Просмотр преподавателя':
        return <TeacherView teacherId={viewEntityId!} onNavigate={handleNavigate} />;
      case 'Контингент':
      case 'Группы':
      case 'Подгруппы':
      case 'Потоки':
        return <CohortManager />;
      case 'Аудитории':
      case 'Типы аудиторий':
      case 'Теги аудиторий':
      case 'Кабинеты':
        return <RoomResourcesManager />;
      case 'Расписание звонков':
      case 'Расписание сокр. звонков':
      case 'Сетки звонков':
        return <BellScheduleManager />;
      case 'Дисциплины':
        return <DataManager dataType="subjects" title="Управление дисциплинами" />;
      case 'Факультативы':
        return <DataManager dataType="electives" title="Управление факультативами" />;
      case 'УГСН':
      case 'Специальности':
      case 'УГСН и специальности':
        return <AcademicProgramsManager />;
      case 'Учебные планы':
        return <EducationalPlanManager />;
      case 'Шаблоны расписания':
        return <DataManager dataType="scheduleTemplates" title="Управление шаблонами расписания" />;
      case 'Настройки':
        return <SettingsView />;
      case 'Привязки преподавателей':
        return <LinkManager />;
      case 'Правила расписания':
        return <RuleManager />;
      case 'Производственный календарь':
        return <ProductionCalendarManager />;
      default:
        return <ScheduleView currentRole={currentRole} viewDate={viewDate} setViewDate={setViewDate} />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <Sidebar currentRole={currentRole} activeView={activeView} setActiveView={handleSidebarNavigate} />
      <main className="flex-1 p-6 overflow-y-auto bg-gray-50">
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;
