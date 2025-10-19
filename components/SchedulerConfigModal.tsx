import React, { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { HeuristicConfig } from '../types';
import { CogIcon } from './icons';

interface SchedulerConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: HeuristicConfig) => void;
}

const SchedulerConfigModal: React.FC<SchedulerConfigModalProps> = ({ isOpen, onClose, onStart }) => {
    const { settings, groups, teachers, classrooms } = useStore();
    const [strictness, setStrictness] = useState(5);
    const [targetType, setTargetType] = useState('all');
    const [targetId, setTargetId] = useState('');
    const [startDate, setStartDate] = useState(settings.semesterStart);
    const [endDate, setEndDate] = useState(settings.semesterEnd);
    const [clearExisting, setClearExisting] = useState(true);
    const [iterations, setIterations] = useState(1);
    const [enforceLectureOrder, setEnforceLectureOrder] = useState(true);
    const [distributeEvenly, setDistributeEvenly] = useState(true);


    const targetOptions = {
        group: groups,
        teacher: teachers,
        classroom: classrooms,
    }[targetType] || [];

    useEffect(() => {
        setTargetId(targetOptions[0]?.id || '');
    }, [targetType, targetOptions]);

    const handleStart = () => {
        if (new Date(startDate) > new Date(endDate)) {
            alert("Дата начала не может быть позже даты окончания.");
            return;
        }
        const config: HeuristicConfig = {
            strictness,
            timeFrame: { start: startDate, end: endDate },
            clearExisting,
            iterations,
            enforceLectureOrder,
            distributeEvenly,
        };
        if (targetType !== 'all' && targetId) {
            config.target = { type: targetType as 'group' | 'teacher' | 'classroom', id: targetId };
        }
        onStart(config);
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";


    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg animation-fade-in-scale">
                <div className="flex items-center mb-4">
                    <CogIcon className="h-6 w-6 text-blue-600 mr-3" />
                    <h2 className="text-xl font-bold text-gray-800">Настройки эвристического планировщика</h2>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Строгость соблюдения правил ({strictness})</label>
                        <p className="text-xs text-gray-500 mb-2">Чем выше значение, тем сильнее планировщик старается избегать "нежелательных" слотов и "окон".</p>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            value={strictness}
                            onChange={e => setStrictness(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Количество итераций ({iterations})</label>
                        <p className="text-xs text-gray-500 mb-2">Больше итераций может улучшить результат, но займет больше времени. 1 = обычный запуск.</p>
                        <input
                            type="range"
                            min="1"
                            max="20"
                            value={iterations}
                            onChange={e => setIterations(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Цель планирования</label>
                        <div className="flex gap-2 mt-1">
                            <select value={targetType} onChange={e => setTargetType(e.target.value)} className={`${defaultInputClass} w-1/3`}>
                                <option value="all">Все</option>
                                <option value="group">Группа</option>
                                <option value="teacher">Преподаватель</option>
                                <option value="classroom">Аудитория</option>
                            </select>
                             <select value={targetId} onChange={e => setTargetId(e.target.value)} className={`${defaultInputClass} w-2/3`} disabled={targetType === 'all'}>
                                {targetOptions.map((opt: any) => <option key={opt.id} value={opt.id}>{opt.name || opt.number}</option>)}
                            </select>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Временные рамки</label>
                        <div className="flex gap-2 mt-1">
                             <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={defaultInputClass} />
                             <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={defaultInputClass} />
                        </div>
                    </div>
                    <div className="flex items-center">
                        <input type="checkbox" id="clearExisting" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor="clearExisting" className="ml-2 block text-sm text-gray-700">Очистить существующее расписание для цели в этих рамках</label>
                    </div>
                    <div className="flex items-center">
                        <input type="checkbox" id="enforceLectureOrder" checked={enforceLectureOrder} onChange={e => setEnforceLectureOrder(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor="enforceLectureOrder" className="ml-2 block text-sm text-gray-700">Соблюдать порядок "Сначала лекция, потом практика"</label>
                    </div>
                    <div className="flex items-center">
                        <input type="checkbox" id="distributeEvenly" checked={distributeEvenly} onChange={e => setDistributeEvenly(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor="distributeEvenly" className="ml-2 block text-sm text-gray-700">Строго распределять занятия по всему семестру</label>
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

export default SchedulerConfigModal;