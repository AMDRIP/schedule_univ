

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { SchedulingSettings } from '../types';
import { CogIcon } from './icons';
import { exportAllDataAsPdf } from '../services/pdfExporter';

const SettingsView: React.FC = () => {
  const store = useStore();
  const { settings, updateSettings, getFullState, loadFullState } = store;
  const [formData, setFormData] = useState<SchedulingSettings>(settings);
  const [isSaved, setIsSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
    }));
    setIsSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleExportJson = () => {
      const state = getFullState();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(state, null, 2))}`;
      const link = document.createElement("a");
      link.href = jsonString;
      const date = new Date().toISOString().slice(0, 10);
      link.download = `schedule_backup_${date}.json`;
      link.click();
  };

  const handleImportJson = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!window.confirm("Вы уверены, что хотите импортировать данные? Это перезапишет ВСЕ существующие данные безвозвратно.")) {
          return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const text = e.target?.result;
              if (typeof text !== 'string') throw new Error("Не удалось прочитать файл");
              const data = JSON.parse(text);
              loadFullState(data);
              alert("Данные успешно импортированы!");
          } catch (error) {
              console.error("Ошибка импорта JSON:", error);
              alert("Ошибка при импорте файла. Убедитесь, что это корректный файл резервной копии.");
          }
      };
      reader.readAsText(file);
      // Reset file input
      if(fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleExportPdf = () => {
    try {
      exportAllDataAsPdf(store);
    } catch(e) {
      console.error(e);
      alert("Не удалось сгенерировать PDF. Подробности в консоли.");
    }
  };

  const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-2xl mx-auto space-y-10">
       <div>
         <div className="flex items-center mb-6">
            <CogIcon className="h-8 w-8 text-blue-600 mr-3" />
            <h2 className="text-2xl font-bold text-gray-800">Общие настройки расписания</h2>
          </div>
          <p className="mb-6 text-gray-600">
            Здесь задаются ключевые параметры, которые влияют на весь процесс составления расписания, включая работу ИИ-ассистента и академический календарь.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="semesterStart" className="block text-sm font-medium text-gray-700 mb-1">Начало семестра</label>
                  <input type="date" id="semesterStart" name="semesterStart" value={formData.semesterStart} onChange={handleChange} className={defaultInputClass}/>
                </div>
                <div>
                  <label htmlFor="semesterEnd" className="block text-sm font-medium text-gray-700 mb-1">Конец семестра</label>
                  <input type="date" id="semesterEnd" name="semesterEnd" value={formData.semesterEnd} onChange={handleChange} className={defaultInputClass}/>
                </div>
                <div>
                  <label htmlFor="sessionStart" className="block text-sm font-medium text-gray-700 mb-1">Начало сессии</label>
                  <input type="date" id="sessionStart" name="sessionStart" value={formData.sessionStart} onChange={handleChange} className={defaultInputClass}/>
                </div>
                <div>
                  <label htmlFor="sessionEnd" className="block text-sm font-medium text-gray-700 mb-1">Конец сессии</label>
                  <input type="date" id="sessionEnd" name="sessionEnd" value={formData.sessionEnd} onChange={handleChange} className={defaultInputClass}/>
                </div>
                 <div>
                  <label htmlFor="practiceStart" className="block text-sm font-medium text-gray-700 mb-1">Начало практик</label>
                  <input type="date" id="practiceStart" name="practiceStart" value={formData.practiceStart} onChange={handleChange} className={defaultInputClass}/>
                </div>
                <div>
                  <label htmlFor="practiceEnd" className="block text-sm font-medium text-gray-700 mb-1">Конец практик</label>
                  <input type="date" id="practiceEnd" name="practiceEnd" value={formData.practiceEnd} onChange={handleChange} className={defaultInputClass}/>
                </div>
                 <div>
                  <label htmlFor="retakeStart" className="block text-sm font-medium text-gray-700 mb-1">Начало пересдач</label>
                  <input type="date" id="retakeStart" name="retakeStart" value={formData.retakeStart} onChange={handleChange} className={defaultInputClass}/>
                </div>
                <div>
                  <label htmlFor="retakeEnd" className="block text-sm font-medium text-gray-700 mb-1">Конец пересдач</label>
                  <input type="date" id="retakeEnd" name="retakeEnd" value={formData.retakeEnd} onChange={handleChange} className={defaultInputClass}/>
                </div>
            </div>
            
            <div>
              <label htmlFor="defaultBreakMinutes" className="block text-sm font-medium text-gray-700 mb-1">
                Длительность перемены (минут)
              </label>
              <input
                type="number"
                id="defaultBreakMinutes"
                name="defaultBreakMinutes"
                value={formData.defaultBreakMinutes}
                onChange={handleChange}
                className={defaultInputClass}
                min="0"
              />
            </div>
            
            <div className="pt-4 border-t space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                    "Окна" в расписании
                  </label>
                   <label htmlFor="allowWindows" className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" id="allowWindows" name="allowWindows" className="sr-only" checked={formData.allowWindows} onChange={handleChange} />
                        <div className={`block w-14 h-8 rounded-full transition ${formData.allowWindows ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.allowWindows ? 'translate-x-6' : ''}`}></div>
                      </div>
                      <div className="ml-3 text-gray-700">
                        {formData.allowWindows ? 'Разрешены' : 'Запрещены'} (свободные пары между занятиями)
                      </div>
                    </label>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                    Режим недель
                  </label>
                   <label htmlFor="useEvenOddWeekSeparation" className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" id="useEvenOddWeekSeparation" name="useEvenOddWeekSeparation" className="sr-only" checked={formData.useEvenOddWeekSeparation} onChange={handleChange} />
                        <div className={`block w-14 h-8 rounded-full transition ${formData.useEvenOddWeekSeparation ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.useEvenOddWeekSeparation ? 'translate-x-6' : ''}`}></div>
                      </div>
                      <div className="ml-3 text-gray-700">
                        {formData.useEvenOddWeekSeparation ? 'Включено' : 'Выключено'} (разделение на чётную/нечётную неделю)
                      </div>
                    </label>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-2">
                    Отображение в расписании
                  </label>
                   <label htmlFor="showDegreeInSchedule" className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input type="checkbox" id="showDegreeInSchedule" name="showDegreeInSchedule" className="sr-only" checked={formData.showDegreeInSchedule} onChange={handleChange} />
                        <div className={`block w-14 h-8 rounded-full transition ${formData.showDegreeInSchedule ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${formData.showDegreeInSchedule ? 'translate-x-6' : ''}`}></div>
                      </div>
                      <div className="ml-3 text-gray-700">
                        {formData.showDegreeInSchedule ? 'Включено' : 'Выключено'} (показывать ученую степень рядом с ФИО)
                      </div>
                    </label>
               </div>
            </div>


            <div className="flex justify-end items-center">
                {isSaved && (
                     <span className="text-green-600 text-sm mr-4 transition-opacity duration-300">
                        Сохранено!
                     </span>
                )}
                <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                    Сохранить
                </button>
            </div>
          </form>
       </div>
       <div className="pt-8 border-t">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Управление данными</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button onClick={handleExportJson} className="p-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-center">Экспорт в JSON</button>
              <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-center">Импорт из JSON</button>
              <input type="file" ref={fileInputRef} onChange={handleImportJson} className="hidden" accept=".json"/>
              <button onClick={handleExportPdf} className="p-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-center">Экспорт всех данных в PDF</button>
          </div>
          <p className="text-xs text-gray-500 mt-3">Используйте JSON для создания резервных копий и переноса данных. PDF подходит для печати и архивации.</p>
       </div>
    </div>
  );
};

export default SettingsView;