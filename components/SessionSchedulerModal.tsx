import React, { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { SessionSchedulerConfig } from '../types';
import { CogIcon } from './icons';

interface SessionSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: SessionSchedulerConfig) => void;
}

const SessionSchedulerModal: React.FC<SessionSchedulerModalProps> = ({ isOpen, onClose, onStart }) => {
    const { settings } = useStore();
    
    const [consultationOffset, setConsultationOffset] = useState(1);
    const [restDays, setRestDays] = useState(2);
    const [clearExisting, setClearExisting] = useState(true);
    const [startDate, setStartDate] = useState(settings.sessionStart);
    const [endDate, setEndDate] = useState(settings.sessionEnd);
    const [scheduleTests, setScheduleTests] = useState<'like_exams' | 'no_rest_days' | 'none'>('like_exams');

    useEffect(() => {
        setStartDate(settings.sessionStart);
        setEndDate(settings.sessionEnd);
    }, [settings.sessionStart, settings.sessionEnd]);

    const handleStart = () => {
        if (!startDate || !endDate) {
            alert("Даты начала и конца сессии должны быть установлены в общих настройках.");
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            alert("Дата начала сессии не может быть позже даты окончания.");
            return;
        }
        const config: SessionSchedulerConfig = {
            consultationOffset,
            restDays,
            clearExisting,
            timeFrame: { start: startDate, end: endDate },
            scheduleTests,
        };
        onStart(config);
    };

    if (!isOpen) return null;

    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg animation-fade-in-scale">
                <div className="flex items-center mb-4">
                    <CogIcon className="h-6 w-6 text-blue-600 mr-3" />
                    <h2 className="text-xl font-bold text-gray-800">Планировщик сессии</h2>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Временные рамки сессии</label>
                        <div className="flex gap-2 mt-1">
                             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={defaultInputClass} />
                             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={defaultInputClass} />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="consultationOffset" className="block text-sm font-medium text-gray-700">Размещение консультаций (к экзаменам)</label>
                        <select id="consultationOffset" value={consultationOffset} onChange={e => setConsultationOffset(Number(e.target.value))} className={defaultInputClass}>
                            <option value="0">Не размещать консультации</option>
                            <option value="1">За 1 день до экзамена</option>
                            <option value="2">За 2 дня до экзамена</option>
                        </select>
                    </div>

                     <div>
                        <label htmlFor="restDays" className="block text-sm font-medium text-gray-700">Дни отдыха между экзаменами</label>
                        <select id="restDays" value={restDays} onChange={e => setRestDays(Number(e.target.value))} className={defaultInputClass}>
                            <option value="0">0 дней (экзамены могут идти подряд)</option>
                            <option value="1">Минимум 1 день</option>
                            <option value="2">Минимум 2 дня</option>
                            <option value="3">Минимум 3 дня</option>
                        </select>
                    </div>
                    
                    <div>
                        <label htmlFor="scheduleTests" className="block text-sm font-medium text-gray-700">Планирование зачётов</label>
                        <select id="scheduleTests" value={scheduleTests} onChange={e => setScheduleTests(e.target.value as any)} className={defaultInputClass}>
                            <option value="like_exams">Как экзамены (с днями отдыха)</option>
                            <option value="no_rest_days">Без дней отдыха (1 в день)</option>
                            <option value="none">Не планировать</option>
                        </select>
                    </div>

                    <div className="flex items-center pt-2">
                        <input type="checkbox" id="clearExistingSession" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor="clearExistingSession" className="ml-2 block text-sm text-gray-700">Очистить существующее расписание сессии в этих рамках</label>
                    </div>
                </div>

                <div className="flex justify-end space-x-4 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Отмена</button>
                    <button type="button" onClick={handleStart} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Запустить</button>
                </div>
            </div>
        </div>
    );
};

export default SessionSchedulerModal;