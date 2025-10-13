import React from 'react';
import { Role } from '../types';
import { useStore } from '../hooks/useStore';
import { CalendarIcon, UsersIcon, AcademicCapIcon, CollectionIcon, HomeIcon, SparklesIcon, KeyIcon, BuildingOfficeIcon, BookmarkIcon, UserGroupIcon, ClockIcon, CogIcon, LinkIcon, ShieldCheckIcon, BookOpenIcon, IdentificationIcon, LibraryIcon } from './icons';

interface SidebarProps {
  currentRole: Role;
  activeView: string;
  setActiveView: (view: string) => void;
}

interface NavItem {
  name: string;
  // FIX: Updated icon type to be more specific to allow passing props with cloneElement.
  icon: React.ReactElement<{ className?: string }>;
  disabled?: boolean;
  tooltip?: string;
}

interface Divider {
  type: 'divider';
}

type SidebarItem = NavItem | Divider;

const Sidebar: React.FC<SidebarProps> = ({ currentRole, activeView, setActiveView }) => {
  const { isGeminiAvailable } = useStore();

  const getNavItems = (): SidebarItem[] => {
    const baseItems: NavItem[] = [
      { name: 'Просмотр расписания', icon: <CalendarIcon /> },
      { name: 'Академический календарь', icon: <CalendarIcon /> },
    ];

    if (currentRole === Role.Admin) {
      return [
        ...baseItems,
        { 
          name: 'Составление расписания', 
          icon: <SparklesIcon />, 
          disabled: !isGeminiAvailable, 
          tooltip: !isGeminiAvailable ? 'Функция недоступна. Убедитесь, что приложение запущено через Electron и API-ключ Gemini настроен.' : 'Автоматическое составление расписания с помощью ИИ'
        },
        { type: 'divider' },
        { name: 'Учебные планы', icon: <BookOpenIcon /> },
        { name: 'Дисциплины', icon: <CollectionIcon /> },
        { name: 'Факультативы', icon: <SparklesIcon /> },
        { name: 'Шаблоны расписания', icon: <BookmarkIcon /> },
        { type: 'divider' },
        { name: 'Факультеты', icon: <BuildingOfficeIcon /> },
        { name: 'Кафедры', icon: <BookmarkIcon /> },
        { name: 'Специальности', icon: <IdentificationIcon /> },
        { name: 'УГСН', icon: <LibraryIcon /> },
        { type: 'divider' },
        { name: 'Преподаватели', icon: <UsersIcon /> },
        { name: 'Группы', icon: <AcademicCapIcon /> },
        { name: 'Подгруппы', icon: <UserGroupIcon /> },
        { name: 'Потоки', icon: <UserGroupIcon /> },
        { name: 'Аудитории', icon: <HomeIcon /> },
        { name: 'Типы аудиторий', icon: <HomeIcon /> },
        { name: 'Кабинеты', icon: <KeyIcon /> },
        { name: 'Расписание звонков', icon: <ClockIcon /> },
        { name: 'Расписание сокр. звонков', icon: <ClockIcon /> },
        { type: 'divider' },
        { name: 'Привязки преподавателей', icon: <LinkIcon /> },
        { name: 'Правила расписания', icon: <ShieldCheckIcon /> },
        { name: 'Производственный календарь', icon: <CalendarIcon /> },
        { name: 'Настройки', icon: <CogIcon /> },
      ];
    }

    if (currentRole === Role.Methodist) {
      return [
        ...baseItems,
        { 
          name: 'Составление расписания', 
          icon: <SparklesIcon />,
          disabled: !isGeminiAvailable,
          tooltip: !isGeminiAvailable ? 'Функция недоступна. Убедитесь, что приложение запущено через Electron и API-ключ Gemini настроен.' : 'Автоматическое составление расписания с помощью ИИ'
        },
        { name: 'Учебные планы', icon: <BookOpenIcon /> },
      ];
    }
    
    return baseItems;
  };

  const navItems = getNavItems();

  return (
    <aside className="w-64 bg-gray-800 text-white flex flex-col">
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item, index) => {
          if ('icon' in item) {
            return (
              <a
                key={item.name}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (!item.disabled) {
                    setActiveView(item.name);
                  }
                }}
                className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-md transition-colors duration-200 ${
                  activeView === item.name
                    ? 'bg-gray-900 text-white'
                    : item.disabled
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                title={item.tooltip}
              >
                {React.cloneElement(item.icon, { className: `h-6 w-6 ${item.disabled ? 'text-gray-600' : ''}` })}
                <span className="ml-3">{item.name}</span>
              </a>
            );
          } else {
            return <hr key={`divider-${index}`} className="my-2 border-gray-600" />;
          }
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
