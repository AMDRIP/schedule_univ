import React, { useState } from 'react';
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
import { toYYYYMMDD } from '../utils/dateUtils';
import FacultyView from './FacultyView';
import TeacherView from './TeacherView';


interface DashboardProps {
  currentRole: Role;
}

const Dashboard: React.FC<DashboardProps> = ({ currentRole }) => {
  const [activeView, setActiveView] = useState('Просмотр расписания');
  const [viewEntityId, setViewEntityId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState(toYYYYMMDD(new Date()));

  const handleNavigate = (view: string, id: string) => {
    setActiveView(view);
    setViewEntityId(id);
  };

  const handleSidebarNavigate = (view: string) => {
      setActiveView(view);
      setViewEntityId(null);
  };

  const renderContent = () => {
    switch (activeView) {
      case 'Просмотр расписания':
        return <ScheduleView currentRole={currentRole} viewDate={viewDate} setViewDate={setViewDate} />;
      case 'Академический календарь':
        return <AcademicCalendarView setViewDate={setViewDate} setActiveView={setActiveView} />;
      case 'Составление расписания':
        return <AutoScheduler />;
      case 'Факультеты':
        return <DataManager dataType="faculties" title="Управление факультетами" onNavigate={handleNavigate} />;
      case 'Просмотр института/факультета':
        return <FacultyView facultyId={viewEntityId!} onNavigate={handleNavigate} />;
      case 'Кафедры':
        return <DataManager dataType="departments" title="Управление кафедрами" onNavigate={handleNavigate} />;
      case 'Просмотр кафедры':
        return <DepartmentView departmentId={viewEntityId!} />;
      case 'Преподаватели':
        return <DataManager dataType="teachers" title="Управление преподавателями" onNavigate={handleNavigate} />;
      case 'Просмотр преподавателя':
        return <TeacherView teacherId={viewEntityId!} onNavigate={handleNavigate} />;
      case 'Группы':
        return <DataManager dataType="groups" title="Управление группами" />;
      case 'Подгруппы':
        return <DataManager dataType="subgroups" title="Управление подгруппами" />;
      case 'Потоки':
        return <DataManager dataType="streams" title="Управление потоками" />;
      case 'Аудитории':
        return <DataManager dataType="classrooms" title="Управление аудиториями" />;
       case 'Типы аудиторий':
        return <DataManager dataType="classroomTypes" title="Управление типами аудиторий" />;
      case 'Теги аудиторий':
        return <DataManager dataType="classroomTags" title="Управление тегами аудиторий" />;
       case 'Расписание звонков':
        return <DataManager dataType="timeSlots" title="Управление расписанием звонков" />;
      case 'Расписание сокр. звонков':
        return <DataManager dataType="timeSlotsShortened" title="Управление расписанием сокращенных звонков" />;
      case 'Дисциплины':
        return <DataManager dataType="subjects" title="Управление дисциплинами" />;
      case 'Факультативы':
        return <DataManager dataType="electives" title="Управление факультативами" />;
      case 'Кабинеты':
        return <DataManager dataType="cabinets" title="Управление кабинетами" />;
      case 'УГСН':
        return <DataManager dataType="ugs" title="Управление УГСН" />;
      case 'Специальности':
        return <DataManager dataType="specialties" title="Управление специальностями" />;
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
      <main className="flex-1 p-6 overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100">
        {renderContent()}
      </main>
    </div>
  );
};

export default Dashboard;