

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { SchedulingRule, RuleAction, RuleSeverity, RuleEntityType, RuleCondition, ClassType, RuleLogicalOperator } from '../types';
import { EditIcon, TrashIcon, PlusIcon } from './icons';

// Main Component
const RuleManager: React.FC = () => {
  const { schedulingRules, addItem, updateItem, deleteItem, teachers, groups, subjects, timeSlots } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<SchedulingRule | null>(null);
  
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
  
  const formatRule = (rule: SchedulingRule): string => {
      const dataMap = { teachers, groups, subjects };
      
      const formatCondition = (cond: RuleCondition): string => {
          const typeMap: Record<RuleEntityType, string> = { teacher: 'Преп.', group: 'Гр.', subject: 'Дисц.', classroom: 'Ауд.', classType: 'Тип', department: 'Каф.'};
          const entityType = typeMap[cond.entityType] || cond.entityType;
          const names = cond.entityIds.map(id => (dataMap[cond.entityType as keyof typeof dataMap] as any[])?.find(e => e.id === id)?.name || (dataMap[cond.entityType as keyof typeof dataMap] as any[])?.find(e => e.id === id)?.number || id).join(', ');
          const classType = cond.classType ? ` (${cond.classType})` : '';
          return `(${entityType}: ${names}${classType})`;
      };

      let details = rule.conditions
        .map((c, i) => {
            const operator = i > 0 ? ` ${rule.logicalOperators?.[i - 1] || 'И'} ` : '';
            return operator + formatCondition(c);
        })
        .join('');

      if ([RuleAction.MaxPerDay, RuleAction.MinPerDay, RuleAction.MaxConsecutive, RuleAction.AtMostNGaps].includes(rule.action)) {
         details += ` (Параметр: ${rule.param})`;
      }

      if ([RuleAction.AvoidTime, RuleAction.RequireTime, RuleAction.PreferTime].includes(rule.action) && rule.day && rule.timeSlotId) {
         const time = timeSlots.find(t => t.id === rule.timeSlotId)?.time || '';
         details += ` в ${rule.day}, ${time}`;
      }
      
       if ([RuleAction.StartAfter, RuleAction.EndBefore].includes(rule.action) && rule.timeSlotId) {
         const time = timeSlots.find(t => t.id === rule.timeSlotId)?.time || '';
         details += ` (Время: ${time})`;
      }

      return `${rule.action}: ${details}`;
  };

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
              <th className="p-3 font-semibold uppercase text-gray-600 text-left w-1/4">Описание</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Серьезность</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left w-2/4">Суть правила</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {schedulingRules.map(rule => (
              <tr key={rule.id} className="bg-white hover:bg-gray-50 border-b">
                <td className="p-3 text-gray-800">{rule.description}</td>
                <td className="p-3 text-gray-800 font-medium">{rule.severity.split('(')[0]}</td>
                <td className="p-3 text-gray-700">{formatRule(rule)}</td>
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

const entityTypeMap: Record<RuleEntityType, string> = {
    teacher: 'Преподаватель', group: 'Группа', subject: 'Дисциплина', classroom: 'Аудитория',
    classType: 'Тип занятия', department: 'Кафедра'
};

const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const RuleConditionEditor: React.FC<{
    condition: RuleCondition;
    onChange: (newCondition: RuleCondition) => void;
    label: string;
}> = ({ condition, onChange, label }) => {
    const { teachers, groups, subjects, classrooms, departments } = useStore();
    const dataMap = useMemo(() => ({ 
        teachers, 
        groups, 
        subjects, 
        classrooms, 
        departments, 
        classType: Object.values(ClassType).map(ct => ({id: ct, name: ct})) 
    }), [teachers, groups, subjects, classrooms, departments]);
    
    const entityTypeToDataKeyMap: Record<RuleEntityType, keyof typeof dataMap | null> = {
        teacher: 'teachers',
        group: 'groups',
        subject: 'subjects',
        classroom: 'classrooms',
        department: 'departments',
        classType: 'classType'
    };

    const dataKey = entityTypeToDataKeyMap[condition.entityType];
    const options = dataKey ? dataMap[dataKey] : [];

    return (
        <div className="p-3 border rounded-md bg-gray-50">
            <label className="block text-sm font-semibold text-gray-600 mb-2">{label}</label>
            <div className="grid grid-cols-2 gap-4">
                <select 
                    value={condition.entityType} 
                    onChange={e => onChange({ ...condition, entityType: e.target.value as RuleEntityType, entityIds: [] })} 
                    className={defaultInputClass}
                >
                    {Object.entries(entityTypeMap).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                </select>
                <select 
                    multiple 
                    value={condition.entityIds} 
                    onChange={e => onChange({ ...condition, entityIds: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value) })}
                    className={`${defaultInputClass} h-24`}
                >
                    {options.map((opt: any) => <option key={opt.id} value={opt.id}>{opt.name || opt.number}</option>)}
                </select>
            </div>
            {condition.entityType === 'subject' && (
                <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-500">Опционально: уточнить тип занятия</label>
                    <select value={condition.classType || ''} onChange={e => onChange({...condition, classType: e.target.value as ClassType})} className={`${defaultInputClass} text-sm`}>
                        <option value="">Любой</option>
                        {Object.values(ClassType).map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </select>
                </div>
            )}
        </div>
    );
}


const RuleModal: React.FC<RuleModalProps> = ({ isOpen, onClose, onSave, item }) => {
    const { timeSlots } = useStore();
    const [formData, setFormData] = useState<Partial<SchedulingRule>>({});

    useEffect(() => {
        if (item) {
            setFormData(item);
        } else {
            // Default new rule
            setFormData({
                description: '',
                severity: RuleSeverity.Medium,
                action: RuleAction.MaxPerDay,
                conditions: [{ entityType: 'teacher', entityIds: [] }],
                logicalOperators: [],
                param: 3
            });
        }
    }, [item]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleConditionChange = (index: number, newCondition: RuleCondition) => {
        const newConditions = [...(formData.conditions || [])];
        newConditions[index] = newCondition;
        setFormData(prev => ({...prev, conditions: newConditions as [RuleCondition, RuleCondition?]}))
    };

    const handleAddCondition = () => {
        setFormData(prev => ({
            ...prev,
            conditions: [...(prev.conditions || []), { entityType: 'teacher', entityIds: [] }],
            logicalOperators: [...(prev.logicalOperators || []), 'AND']
        }));
    };

    const handleRemoveCondition = (index: number) => {
        setFormData(prev => {
            if (!prev.conditions || prev.conditions.length <= 1) return prev;
            const newConditions = [...prev.conditions];
            const newOperators = [...(prev.logicalOperators || [])];
            newConditions.splice(index, 1);
            if (index > 0) {
                newOperators.splice(index - 1, 1);
            } else if (newOperators.length > 0) {
                newOperators.splice(0, 1);
            }
            return { ...prev, conditions: newConditions, logicalOperators: newOperators };
        });
    };

    const handleLogicalOperatorChange = (index: number, value: RuleLogicalOperator) => {
        setFormData(prev => {
            const newOperators = [...(prev.logicalOperators || [])];
            newOperators[index] = value;
            return { ...prev, logicalOperators: newOperators };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as SchedulingRule);
    };

    if (!isOpen) return null;
    
    const needsDayAndTime = [RuleAction.AvoidTime, RuleAction.RequireTime, RuleAction.PreferTime].includes(formData.action as RuleAction);
    const needsOnlyTime = [RuleAction.StartAfter, RuleAction.EndBefore].includes(formData.action as RuleAction);
    const needsNumberParam = [RuleAction.MaxPerDay, RuleAction.MinPerDay, RuleAction.MaxConsecutive, RuleAction.AtMostNGaps].includes(formData.action as RuleAction);


    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 text-gray-900">{item ? 'Редактировать правило' : 'Добавить правило'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Описание (для себя)</label>
                        <input type="text" name="description" value={formData.description || ''} onChange={handleChange} className={defaultInputClass} placeholder="Напр. у преподавателя встреча"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Серьезность правила</label>
                        <select name="severity" value={formData.severity} onChange={handleChange} className={defaultInputClass}>
                            {Object.values(RuleSeverity).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Действие</label>
                        <select name="action" value={formData.action} onChange={handleChange} className={defaultInputClass}>
                            {Object.values(RuleAction).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    
                    <div className="space-y-3">
                        {formData.conditions?.map((condition, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && (
                                    <div className="flex items-center my-2">
                                        <div className="flex-grow border-t border-gray-300"></div>
                                        <select 
                                            value={formData.logicalOperators?.[index-1] || 'AND'} 
                                            onChange={(e) => handleLogicalOperatorChange(index - 1, e.target.value as RuleLogicalOperator)}
                                            className="mx-4 p-1 border border-gray-300 rounded text-sm font-semibold"
                                        >
                                            <option value="AND">И</option>
                                            <option value="OR">ИЛИ</option>
                                        </select>
                                        <div className="flex-grow border-t border-gray-300"></div>
                                    </div>
                                )}
                                <div className="relative">
                                    <RuleConditionEditor
                                        condition={condition}
                                        onChange={c => handleConditionChange(index, c)}
                                        label={`Условие ${String.fromCharCode(65 + index)}`}
                                    />
                                    {formData.conditions && formData.conditions.length > 1 && (
                                        <button type="button" onClick={() => handleRemoveCondition(index)} className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                    
                    <button type="button" onClick={handleAddCondition} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                        <PlusIcon className="w-4 h-4"/>Добавить условие
                    </button>

                    <div className="pt-4 border-t">
                        <h3 className="text-md font-semibold text-gray-700 mb-2">Параметры действия</h3>
                        {needsDayAndTime && (
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
                        )}
                        
                        {needsOnlyTime && (
                            <div>
                               <label className="block text-sm font-medium text-gray-700">Время</label>
                               <select name="timeSlotId" value={formData.timeSlotId} onChange={handleChange} className={defaultInputClass}>
                                   {timeSlots.map(t => <option key={t.id} value={t.id}>{t.time}</option>)}
                               </select>
                            </div>
                        )}
                        
                        {needsNumberParam && (
                             <div>
                               <label className="block text-sm font-medium text-gray-700">Параметр (число)</label>
                               <input type="number" name="param" value={formData.param || ''} onChange={e => setFormData(p => ({...p, param: Number(e.target.value)}))} className={defaultInputClass} min="0"/>
                            </div>
                        )}

                        {!needsDayAndTime && !needsOnlyTime && !needsNumberParam && (
                            <p className="text-sm text-gray-500">Для этого действия дополнительные параметры не требуются.</p>
                        )}
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