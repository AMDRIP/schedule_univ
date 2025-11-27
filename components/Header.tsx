import React, { useState, useRef, useEffect } from 'react';
import { Role } from '../types';
import { FolderIcon, ChevronDownIcon, CogIcon, SpinnerIcon } from './icons';
import { useStore } from '../hooks/useStore';

interface HeaderProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onRunScheduler: (method: 'heuristic' | 'gemini' | 'openrouter') => void;
  onRunSessionScheduler: () => void;
  onClearSchedule: () => void;
  onResetSchedule: () => void;
  isScheduling: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
    currentRole, onRoleChange, onNew, onOpen, onSave, onSaveAs, 
    onRunScheduler, onRunSessionScheduler, onClearSchedule, onResetSchedule, isScheduling 
}) => {
  const [isProjectMenuOpen, setProjectMenuOpen] = useState(false);
  const [isSchedulerMenuOpen, setSchedulerMenuOpen] = useState(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const schedulerMenuRef = useRef<HTMLDivElement>(null);
  const { isGeminiAvailable, openRouterApiKey, lastAutosave, schedulingProgress } = useStore();
  const isOpenRouterAvailable = !!openRouterApiKey;


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
      if (schedulerMenuRef.current && !schedulerMenuRef.current.contains(event.target as Node)) {
        setSchedulerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleMenuClick = (action: () => void) => {
    action();
    setProjectMenuOpen(false);
  };

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200/80 p-4 flex justify-between items-center sticky top-0 z-30">
      <div className="flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-600 mr-3" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
        <h1 className="text-2xl font-bold text-gray-800">Система расписаний ВУЗа</h1>
      </div>
      <div className="flex items-center gap-4">
        {lastAutosave && (
            <span className="text-xs text-gray-500">
                Автосохранение: {lastAutosave.toLocaleTimeString()}
            </span>
        )}
        <div ref={schedulerMenuRef} className="relative">
          <button
            onClick={() => setSchedulerMenuOpen(prev => !prev)}
            disabled={isScheduling}
            className="flex items-center p-2 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 disabled:cursor-wait disabled:bg-gray-100"
          >
            {isScheduling ? <SpinnerIcon className="h-5 w-5 mr-2 text-gray-600" /> : <CogIcon className="h-5 w-5 mr-2 text-gray-600" />}
            <span className="text-gray-700 font-medium w-36 text-left">
                {isScheduling && schedulingProgress ? `Планировщик (${schedulingProgress.current}/${schedulingProgress.total})` : 'Планировщик'}
            </span>
            <ChevronDownIcon className={`w-5 h-5 ml-1 text-gray-500 transition-transform ${isSchedulerMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isSchedulerMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-50 border border-gray-200">
              <div className="py-1">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onRunScheduler('heuristic'); setSchedulerMenuOpen(false); }}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Запустить эвристический
                </a>
                <div className="border-t border-gray-100 my-1"></div>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); if(isGeminiAvailable) { onRunScheduler('gemini'); setSchedulerMenuOpen(false); } }}
                  className={`block px-4 py-2 text-sm ${isGeminiAvailable ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
                  title={!isGeminiAvailable ? 'Недоступно без API ключа Gemini' : ''}
                >
                  Запустить с помощью AI (Gemini)
                </a>
                 <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); if(isOpenRouterAvailable) { onRunScheduler('openrouter'); setSchedulerMenuOpen(false); } }}
                  className={`block px-4 py-2 text-sm ${isOpenRouterAvailable ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-400 cursor-not-allowed'}`}
                  title={!isOpenRouterAvailable ? 'Недоступно без API ключа OpenRouter' : ''}
                >
                  Запустить с помощью OpenRouter
                </a>
                 <div className="border-t border-gray-100 my-1"></div>
                 <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onRunSessionScheduler(); setSchedulerMenuOpen(false); }}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Сгенерировать расписание сессии
                </a>
                <div className="border-t border-gray-100 my-1"></div>
                 <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onResetSchedule(); setSchedulerMenuOpen(false); }}
                  className="block px-4 py-2 text-sm text-orange-600 hover:bg-orange-50"
                >
                  Сбросить состояние...
                </a>
                 <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onClearSchedule(); setSchedulerMenuOpen(false); }}
                  className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  Очистить расписание...
                </a>
              </div>
            </div>
          )}
        </div>
        
        <div ref={projectMenuRef} className="relative">
          <button
            onClick={() => setProjectMenuOpen(prev => !prev)}
            className="flex items-center p-2 border border-gray-300 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          >
            <FolderIcon className="h-5 w-5 mr-2 text-gray-600" />
            <span className="text-gray-700 font-medium">Файл</span>
            <ChevronDownIcon className={`w-5 h-5 ml-1 text-gray-500 transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {isProjectMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-50 border border-gray-200">
              <div className="py-1">
                <a href="#" onClick={(e) => { e.preventDefault(); handleMenuClick(onNew); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Новый проект...</a>
                <a href="#" onClick={(e) => { e.preventDefault(); handleMenuClick(onOpen); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Открыть...</a>
                <div className="border-t border-gray-100 my-1"></div>
                <a href="#" onClick={(e) => { e.preventDefault(); handleMenuClick(onSave); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Сохранить</a>
                <a href="#" onClick={(e) => { e.preventDefault(); handleMenuClick(onSaveAs); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Сохранить как...</a>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center">
          <span className="text-gray-600 mr-2">Роль:</span>
          <select
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            className="p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 bg-white text-gray-900 transition-all duration-200"
          >
            {Object.values(Role).map((role) => (
              <option key={role} value={role} className="text-black">
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};

export default Header;