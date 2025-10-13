import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { Role, WeekType, ScheduleEntry, ClassType, ScheduleTemplate, DeliveryMode } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { getWeekType, toYYYYMMDD, getWeekDays } from '../utils/dateUtils';
import ScheduleCell from './ScheduleCell';
import UnscheduledDeck from './UnscheduledDeck';
import { PlusIcon, ChevronDownIcon, BookmarkIcon, DocumentDownloadIcon, TrashIcon, DocumentTextIcon } from './icons';
import DatePicker from './DatePicker';
import { exportScheduleAsPdf } from '../services/pdfExporter';
import { exportScheduleAsTxt } from '../services/textExporter';

// Save Template Modal
const SaveTemplateModal: React.FC<{onSave: (name: string, description: string) => void; onClose: () => void;}> = ({ onSave, onClose }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    
    const handleSave = () => {
        if (name) {
            onSave(name, description);
            onClose();
        } else {
            alert("Введите название шаблона");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">Сохранить как шаблон</h2>
                <div className="space-y-4">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Название шаблона" className="w-full p-2 border rounded"/>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание (необязательно)" className="w-full p-2 border rounded h-24"></textarea>
                </div>
                <div className="flex justify-end space-x-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Отмена</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Сохранить</button>
                </div>
            </div>
        </div>
    );
};


// Load Template Modal
const LoadTemplateModal: React.FC<{templates: ScheduleTemplate[]; onLoad: (id: string) => void; onClose: () => void;}> = ({ templates, onLoad, onClose }) => {
    const [selectedId, setSelectedId] = useState<string>(templates[0]?.id || '');

    const handleLoad = () => {
        if (selectedId && window.confirm("Текущее расписание будет полностью заменено. Продолжить?")) {
            onLoad(selectedId);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">Загрузить шаблон</h2>
                {templates.length > 0 ? (
                    <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="w-full p-2 border rounded">
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                ) : <p>Нет сохраненных шаблонов.</p>}
                <div className="flex justify-end space-x-4 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Отмена</button>
                    {templates.length > 0 && <button onClick={handleLoad} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Загрузить</button>}
                </div>
            </div>
        </div>
    );
};


const SessionEntryModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const { groups, teachers, subjects, classrooms, timeSlots, addScheduleEntry, settings } = useStore();
    const [error, setError] = useState('');
    const [formData, setFormData] = useState<Partial<ScheduleEntry>>({});

    useEffect(() => {
        if (isOpen) {
            setError('');
            setFormData({
                date: settings.sessionStart || settings.semesterStart || toYYYYMMDD(new Date()),
                timeSlotId: timeSlots[0]?.id || '',
                groupId: groups[0]?.id || '',
                subjectId: subjects[0]?.id || '',
                teacherId: teachers[0]?.id || '',
                classroomId: classrooms[0]?.id || '',
                classType: ClassType.Consultation,
                deliveryMode: DeliveryMode.Offline,
                weekType: 'every'
            });
        }
    }, [isOpen, timeSlots, groups, subjects, teachers, classrooms, settings]);


    const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!formData.date || !settings.sessionStart || !settings.sessionEnd) {
            setError('Даты сессии не установлены в настройках. Пожалуйста, укажите их.');
            return;
        }

        const eventDate = new Date(formData.date + 'T00:00:00'); 
        const sessionStart = new Date(settings.sessionStart + 'T00:00:00');
        const sessionEnd = new Date(settings.sessionEnd + 'T23:59:59');
        
        if (isNaN(eventDate.getTime()) || isNaN(sessionStart.getTime()) || isNaN(sessionEnd.getTime())) {
            setError('Некорректный формат дат сессии в настройках.');
            return;
        }

        if (eventDate < sessionStart || eventDate > sessionEnd) {
            setError(`Дата события должна быть в пределах сессии (с ${settings.sessionStart} по ${settings.sessionEnd}).`);
            return;
        }

        const dayOfWeek = eventDate.getDay();
        const dayName = DAYS_OF_WEEK[dayOfWeek === 0 ? 6 : dayOfWeek - 1];

        addScheduleEntry({
            ...formData,
            day: dayName,
        } as Omit<ScheduleEntry, 'id'>);
        onClose();
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">Добавить сессионное событие</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <div><label>Дата</label><input type="date" name="date" value={formData.date} onChange={handleChange} className={defaultInputClass} /></div>
                       <div><label>Время</label><select name="timeSlotId" value={formData.timeSlotId} onChange={handleChange} className={defaultInputClass}>{timeSlots.map(t => <option key={t.id} value={t.id}>{t.time}</option>)}</select></div>
                       <div><label>Группа</label><select name="groupId" value={formData.groupId} onChange={handleChange} className={defaultInputClass}>{groups.map(i => <option key={i.id} value={i.id}>{i.number}</option>)}</select></div>
                       <div><label>Преподаватель</label><select name="teacherId" value={formData.teacherId} onChange={handleChange} className={defaultInputClass}>{teachers.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                       <div><label>Дисциплина</label><select name="subjectId" value={formData.subjectId} onChange={handleChange} className={defaultInputClass}>{subjects.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                       <div><label>Аудитория</label><select name="classroomId" value={formData.classroomId} onChange={handleChange} className={defaultInputClass}>{classrooms.map(i => <option key={i.id} value={i.id}>{i.number}</option>)}</select></div>
                       <div><label>Тип занятия</label><select name="classType" value={formData.classType} onChange={handleChange} className={defaultInputClass}>
                        {[ClassType.Consultation, ClassType.Test, ClassType.Exam].map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label>Тип проведения</label><select name="deliveryMode" value={formData.deliveryMode} onChange={handleChange} className={defaultInputClass}>
                        {Object.values(DeliveryMode).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    </div>
                     {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
                    <div className="flex justify-end space-x-4 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Отмена</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface ScheduleViewProps {
  currentRole: Role;
  viewDate: string;
  setViewDate: (date: string) => void;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({ currentRole, viewDate, setViewDate }) => {
  const store = useStore();
  const { schedule, groups, teachers, subjects, classrooms, timeSlots, settings, scheduleTemplates, propagateWeekSchedule, saveCurrentScheduleAsTemplate, loadScheduleFromTemplate, removeScheduleEntries } = store;
  const [filterType, setFilterType] = useState<'group' | 'teacher'>('group');
  const [selectedId, setSelectedId] = useState<string>(groups[0]?.id || '');
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [isLoadTemplateModalOpen, setIsLoadTemplateModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isTemplateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [isClearDropdownOpen, setClearDropdownOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const templateDropdownRef = useRef<HTMLDivElement>(null);
  const clearDropdownRef = useRef<HTMLDivElement>(null);
  
  const weekDays = useMemo(() => getWeekDays(new Date(viewDate)), [viewDate]);
  const weekStart = useMemo(() => toYYYYMMDD(weekDays[0]), [weekDays]);
  const weekEnd = useMemo(() => toYYYYMMDD(weekDays[5]), [weekDays]);
  
  const weekType = useMemo(() => {
    return getWeekType(new Date(viewDate), new Date(settings.semesterStart));
  }, [viewDate, settings.semesterStart]);

  const effectiveWeekType = settings.useEvenOddWeekSeparation ? weekType : 'every';

  const filterOptions = useMemo(() => {
    return filterType === 'group' ? groups : teachers;
  }, [filterType, groups, teachers]);

  const selectedItemName = useMemo(() => {
      const item = filterOptions.find(o => o.id === selectedId);
      return item ? ('number' in item ? item.number : item.name) : '';
  }, [selectedId, filterOptions]);
  
  useEffect(() => {
    if (filterOptions.length > 0 && !filterOptions.find(o => o.id === selectedId)) {
        setSelectedId(filterOptions[0].id);
    } else if (filterOptions.length > 0 && !selectedId) {
        setSelectedId(filterOptions[0].id);
    }
  }, [filterType, filterOptions, selectedId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setIsDatePickerOpen(false);
      }
      if (templateDropdownRef.current && !templateDropdownRef.current.contains(event.target as Node)) {
        setTemplateDropdownOpen(false);
      }
       if (clearDropdownRef.current && !clearDropdownRef.current.contains(event.target as Node)) {
        setClearDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSchedule = useMemo(() => {
    if (!selectedId) return [];
    
    return schedule.filter(entry => {
      const filterMatch = filterType === 'group' ? entry.groupId === selectedId : entry.teacherId === selectedId;
      if (!filterMatch) return false;

      if (entry.date) {
        return entry.date >= weekStart && entry.date <= weekEnd;
      } else {
        return entry.weekType === 'every' || entry.weekType === effectiveWeekType;
      }
    });
  }, [schedule, filterType, selectedId, effectiveWeekType, weekStart, weekEnd]);
  
  const handleDateSelect = (date: Date) => {
    setViewDate(toYYYYMMDD(date));
    setIsDatePickerOpen(false);
  };
  
  const handleCopyWeek = (type: 'even' | 'odd') => {
    const typeName = type === 'even' ? 'чётную' : 'нечётную';
    if(window.confirm(`Вы уверены, что хотите скопировать расписание этой ${typeName} недели на весь семестр? Все существующие ДАТИРОВАННЫЕ занятия для ${typeName} недель будут заменены.`)) {
      propagateWeekSchedule(type);
    }
  };

  const handleClearWeek = () => {
    const idsToClear = filteredSchedule.map(e => e.id);
    if (idsToClear.length === 0) {
        alert(`На этой неделе для ${selectedItemName} нет занятий для очистки.`);
        return;
    }
    if (window.confirm(`Вы уверены, что хотите удалить все ${idsToClear.length} занятий на этой неделе для ${selectedItemName}?`)) {
        removeScheduleEntries(idsToClear);
    }
  };

  const handleClearDay = (date: Date) => {
    const dateStr = toYYYYMMDD(date);
    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
    const idsToClear = filteredSchedule.filter(e => 
        (e.date && e.date === dateStr) || (!e.date && e.day === dayName)
    ).map(e => e.id);

    if (idsToClear.length === 0) {
        alert(`В этот день (${date.toLocaleDateString()}) нет занятий для очистки.`);
        return;
    }

    if (window.confirm(`Вы уверены, что хотите удалить все ${idsToClear.length} занятий за ${date.toLocaleDateString()} для ${selectedItemName}?`)) {
        removeScheduleEntries(idsToClear);
    }
  };

  const getFormattedDate = () => {
      const date = new Date(viewDate);
      const formatted = date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };
  
  const handleExportPdf = () => {
    if (!selectedId) {
      alert("Выберите группу или преподавателя для экспорта.");
      return;
    }
    const selectedItem = filterOptions.find(o => o.id === selectedId);
    if (!selectedItem) return;
    
    const title = `Расписание для ${filterType === 'group' ? 'группы' : 'преподавателя'}: ${'number' in selectedItem ? selectedItem.number : selectedItem.name}`;
    const subtitle = `Неделя: ${weekStart} - ${weekEnd} (${settings.useEvenOddWeekSeparation ? (effectiveWeekType === 'odd' ? 'нечётная' : 'чётная') : 'общая'})`;

    try {
        exportScheduleAsPdf({
          schedule: filteredSchedule,
          title,
          subtitle,
          weekDays,
          timeSlots,
          groups,
          teachers,
          subjects,
          classrooms,
        }, settings);
    } catch(e) {
      console.error("PDF export failed:", e);
      alert("Не удалось сгенерировать PDF. Проверьте консоль для подробностей.");
    }
  };

  const handleExportTxt = () => {
    if (!selectedId) {
      alert("Выберите группу или преподавателя для экспорта.");
      return;
    }
    const selectedItem = filterOptions.find(o => o.id === selectedId);
    if (!selectedItem) return;

    const fileName = `schedule_${selectedItemName.replace(/\s/g, '_')}_${weekStart}.txt`;
    
    try {
        exportScheduleAsTxt({
          schedule: filteredSchedule,
          fileName,
          weekDays,
          timeSlots,
          groups,
          teachers,
          subjects,
          classrooms,
        });
    } catch(e) {
      console.error("TXT export failed:", e);
      alert("Не удалось сгенерировать TXT файл. Проверьте консоль для подробностей.");
    }
  };


  const isMethodist = currentRole === Role.Methodist || currentRole === Role.Admin;
  const todayStr = toYYYYMMDD(new Date());

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Просмотр расписания</h2>
          <div className="flex items-center flex-wrap gap-2 sm:gap-4">
            <div ref={datePickerRef} className="relative">
                <button 
                  onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} 
                  className="w-64 bg-blue-600 text-white font-semibold py-2 px-4 rounded-md flex justify-between items-center hover:bg-blue-700 transition"
                >
                  <span>{getFormattedDate()}</span>
                  <ChevronDownIcon className={`w-5 h-5 transition-transform ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                </button>
                {isDatePickerOpen && <DatePicker selectedDate={new Date(viewDate)} onSelect={handleDateSelect} onClose={() => setIsDatePickerOpen(false)} />}
            </div>
            
            {settings.useEvenOddWeekSeparation && (
              <span className={`px-3 py-1 text-sm rounded-md font-semibold ${weekType === 'odd' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                  {weekType === 'odd' ? 'Нечётная' : 'Чётная'}
              </span>
            )}

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'group' | 'teacher')}
              className="p-2 border rounded-md bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="group">По группе</option>
              <option value="teacher">По преподавателю</option>
            </select>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="p-2 border rounded-md bg-white min-w-[180px] text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={filterOptions.length === 0}
            >
              {filterOptions.length === 0 && <option>Нет данных</option>}
              {filterOptions.map(option => (
                <option key={option.id} value={option.id}>
                  {(option as any).number || option.name}
                </option>
              ))}
            </select>
             {isMethodist && (
                <button onClick={() => setIsSessionModalOpen(true)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                    <PlusIcon className="w-4 h-4 mr-1"/>
                    Событие
                </button>
            )}
          </div>
        </div>
         {isMethodist && (
          <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b">
            {settings.useEvenOddWeekSeparation && (
              <>
                <button onClick={() => handleCopyWeek('odd')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Копировать нечётную неделю на семестр</button>
                <button onClick={() => handleCopyWeek('even')} className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-3 rounded-lg text-sm">Копировать чётную неделю на семестр</button>
              </>
            )}
             <div ref={templateDropdownRef} className="relative">
                <button onClick={() => setTemplateDropdownOpen(prev => !prev)} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                    <BookmarkIcon className="w-4 h-4 mr-2"/>
                    Шаблоны
                    <ChevronDownIcon className={`w-5 h-5 ml-1 transition-transform ${isTemplateDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                 {isTemplateDropdownOpen && (
                  <div className="absolute top-full mt-2 w-60 bg-white rounded-lg shadow-xl z-20 border">
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsSaveTemplateModalOpen(true); setTemplateDropdownOpen(false);}} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Сохранить текущее как шаблон...</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsLoadTemplateModalOpen(true); setTemplateDropdownOpen(false);}} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Загрузить шаблон...</a>
                  </div>
                )}
            </div>
             <div ref={clearDropdownRef} className="relative">
                <button onClick={() => setClearDropdownOpen(prev => !prev)} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                    <TrashIcon className="w-4 h-4 mr-2"/>
                    Очистить...
                    <ChevronDownIcon className={`w-5 h-5 ml-1 transition-transform ${isClearDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                 {isClearDropdownOpen && (
                  <div className="absolute top-full mt-2 w-60 bg-white rounded-lg shadow-xl z-20 border">
                    <a href="#" onClick={(e) => { e.preventDefault(); handleClearWeek(); setClearDropdownOpen(false);}} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Очистить текущую неделю</a>
                  </div>
                )}
            </div>
             <button onClick={handleExportPdf} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                <DocumentDownloadIcon className="w-4 h-4 mr-2"/>
                Экспорт в PDF
            </button>
            <button onClick={handleExportTxt} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 rounded-lg flex items-center text-sm">
                <DocumentTextIcon className="w-4 h-4 mr-2"/>
                Экспорт в TXT
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200">
                <th className="p-2 border-r text-sm font-semibold text-gray-600 w-32">Время</th>
                {weekDays.map(date => {
                    const dateStr = toYYYYMMDD(date);
                    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() -1];
                    const isToday = dateStr === todayStr;
                    return (
                      <th key={dateStr} className={`p-2 border-r text-sm font-semibold text-gray-600 relative group ${isToday ? 'bg-blue-100' : ''}`}>
                        <div className="flex items-center justify-center">
                            <span>{dayName}, {date.getDate()}</span>
                            {isMethodist && (
                                <button 
                                    onClick={() => handleClearDay(date)}
                                    title={`Очистить расписание на ${date.toLocaleDateString()}`}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <TrashIcon className="w-3.5 h-3.5"/>
                                </button>
                            )}
                        </div>
                      </th>
                    );
                })}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map(slot => (
                <tr key={slot.id} className="transition-colors hover:bg-gray-50">
                  <td className="p-2 border font-semibold text-center align-top h-32 text-gray-700">{slot.time}</td>
                  {weekDays.map(date => {
                    const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
                    const dateStr = toYYYYMMDD(date);
                    
                    const entry = filteredSchedule.find(e => 
                      e.timeSlotId === slot.id &&
                      ((e.date && e.date === dateStr) || (!e.date && e.day === dayName))
                    );
                    
                    return (
                      <ScheduleCell 
                        key={dateStr} 
                        day={dayName} 
                        timeSlotId={slot.id} 
                        entry={entry}
                        weekType={effectiveWeekType}
                        isEditable={isMethodist}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isMethodist && <UnscheduledDeck />}
      <SessionEntryModal isOpen={isSessionModalOpen} onClose={() => setIsSessionModalOpen(false)} />
      {isSaveTemplateModalOpen && <SaveTemplateModal onClose={() => setIsSaveTemplateModalOpen(false)} onSave={saveCurrentScheduleAsTemplate} />}
      {isLoadTemplateModalOpen && <LoadTemplateModal templates={scheduleTemplates} onClose={() => setIsLoadTemplateModalOpen(false)} onLoad={loadScheduleFromTemplate} />}
    </div>
  );
};

export default ScheduleView;