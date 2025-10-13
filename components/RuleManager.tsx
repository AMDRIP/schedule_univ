import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { SchedulingRule, RuleType, RuleTarget } from '../types';
import { EditIcon, TrashIcon, PlusIcon } from './icons';

const RuleManager: React.FC = () => {
  const { teachers, groups, classrooms, subjects, timeSlots, schedulingRules, addItem, updateItem, deleteItem } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<SchedulingRule | null>(null);
  
  const dataMap = useMemo(() => ({
      teachers, groups, classrooms, subjects
  }), [teachers, groups, classrooms, subjects]);

  const handleAddItem = () => {
    setCurrentItem(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (item: SchedulingRule) => {
    setCurrentItem(item);
    setIsModalOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить это правило?')) {
      deleteItem('schedulingRules', id);
    }
  };

  const handleSave = (item: Omit<SchedulingRule, 'id'> | SchedulingRule) => {
    if ('id' in item && item.id) {
      updateItem('schedulingRules', item as SchedulingRule);
    } else {
      addItem('schedulingRules', item);
    }
    setIsModalOpen(false);
  };
  
  const getRuleTargetName = (rule: SchedulingRule) => {
      const targetList = dataMap[rule.target];
      if (!targetList) return 'N/A';
      const targetItem = targetList.find(t => t.id === rule.targetId);
      return (targetItem as any)?.name || (targetItem as any)?.number || 'N/A';
  }
  
  const getTime = (timeSlotId: string) => timeSlots.find(t => t.id === timeSlotId)?.time || 'N/A';

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Правила расписания</h2>
        <button
          onClick={handleAddItem}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Добавить правило
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Описание</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Объект</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">День и время</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {schedulingRules.map(rule => (
              <tr key={rule.id} className="bg-white hover:bg-gray-50 border-b">
                <td className="p-3 text-gray-800">{rule.description}</td>
                <td className="p-3 text-gray-800 font-medium">{`[${rule.type}] ${getRuleTargetName(rule)}`}</td>
                <td className="p-3 text-gray-700">{`${rule.day}, ${getTime(rule.timeSlotId)}`}</td>
                <td className="p-3 text-gray-800">
                  <button onClick={() => handleEditItem(rule)} className="text-blue-600 hover:text-blue-800 mr-4">
                    <EditIcon />
                  </button>
                  <button onClick={() => handleDeleteItem(rule.id)} className="text-red-600 hover:text-red-800">
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <RuleModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          item={currentItem}
        />
      )}
    </div>
  );
};

// Modal Component for Rules
interface RuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Omit<SchedulingRule, 'id'> | SchedulingRule) => void;
    item: SchedulingRule | null;
}

const RuleModal: React.FC<RuleModalProps> = ({ isOpen, onClose, onSave, item }) => {
    const { teachers, groups, classrooms, subjects, timeSlots } = useStore();
    const [formData, setFormData] = useState<any>({});
    
    const dataMap = useMemo(() => ({ teachers, groups, classrooms, subjects }), [teachers, groups, classrooms, subjects]);
    const targetOptions = useMemo(() => dataMap[formData.target as RuleTarget] || [], [formData.target, dataMap]);

    const targetTypeMap: Record<RuleTarget, string> = {
        teachers: 'Преподаватель',
        groups: 'Группа',
        classrooms: 'Аудитория',
        subjects: 'Дисциплина'
    };

    useEffect(() => {
        if (item) {
            setFormData(item);
        } else {
            setFormData({
                description: '',
                type: RuleType.Prohibition,
                target: 'teachers',
                targetId: teachers[0]?.id || '',
                day: 'Понедельник',
                timeSlotId: timeSlots[0]?.id || ''
            });
        }
    }, [item, teachers, timeSlots]);
    
    useEffect(() => {
        // Reset targetId if target type changes and the old id is not valid
        if (targetOptions.length > 0 && !targetOptions.find(opt => opt.id === formData.targetId)) {
            setFormData((prev: any) => ({ ...prev, targetId: targetOptions[0].id }));
        }
    }, [targetOptions, formData.targetId]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-gray-900">{item ? 'Редактировать правило' : 'Добавить правило'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Описание</label>
                        <input type="text" name="description" value={formData.description} onChange={handleChange} className={defaultInputClass} placeholder="Напр. у преподавателя встреча"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Тип правила</label>
                        <select name="type" value={formData.type} onChange={handleChange} className={defaultInputClass}>
                            {Object.values(RuleType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className='flex gap-4'>
                        <div className='w-1/2'>
                           <label className="block text-sm font-medium text-gray-700">Тип объекта</label>
                           <select name="target" value={formData.target} onChange={handleChange} className={defaultInputClass}>
                               {Object.keys(targetTypeMap).map(t => <option key={t} value={t}>{targetTypeMap[t as RuleTarget]}</option>)}
                           </select>
                        </div>
                         <div className='w-1/2'>
                           <label className="block text-sm font-medium text-gray-700">Объект</label>
                           <select name="targetId" value={formData.targetId} onChange={handleChange} className={defaultInputClass} disabled={targetOptions.length === 0}>
                              {targetOptions.map(opt => <option key={opt.id} value={opt.id}>{(opt as any).name || (opt as any).number}</option>)}
                           </select>
                        </div>
                    </div>
                    <div className='flex gap-4'>
                         <div className='w-1/2'>
                           <label className="block text-sm font-medium text-gray-700">День</label>
                           <select name="day" value={formData.day} onChange={handleChange} className={defaultInputClass}>
                                {['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'].map(d => <option key={d} value={d}>{d}</option>)}
                           </select>
                        </div>
                         <div className='w-1/2'>
                           <label className="block text-sm font-medium text-gray-700">Время</label>
                           <select name="timeSlotId" value={formData.timeSlotId} onChange={handleChange} className={defaultInputClass}>
                               {timeSlots.map(t => <option key={t.id} value={t.id}>{t.time}</option>)}
                           </select>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400">Отмена</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export default RuleManager;