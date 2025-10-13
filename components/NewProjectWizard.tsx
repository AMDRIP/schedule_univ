import React, { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { SchedulingSettings, TimeSlot, Faculty, Department, UGS, Specialty, ClassroomType } from '../types';
import { toYYYYMMDD } from '../utils/dateUtils';
import { TrashIcon, PlusIcon } from './icons';

interface NewProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";
const smallButtonClass = "p-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-600";


const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
    const { clearAllData, loadFullState } = useStore();
    const [settings, setSettings] = useState<SchedulingSettings>({
        semesterStart: toYYYYMMDD(new Date()),
        semesterEnd: toYYYYMMDD(new Date(new Date().setMonth(new Date().getMonth() + 4))),
        sessionStart: '', sessionEnd: '', practiceStart: '', practiceEnd: '', retakeStart: '', retakeEnd: '',
        defaultBreakMinutes: 15, allowWindows: true, useEvenOddWeekSeparation: true,
        showDegreeInSchedule: false,
    });
    const [timeSlots, setTimeSlots] = useState<{ id: string; time: string }[]>([{ id: generateId('ts'), time: '08:30-10:00' }]);
    const [faculties, setFaculties] = useState<{ id: string; name: string }[]>([{ id: generateId('f'), name: '' }]);
    const [departments, setDepartments] = useState<{ id: string; name: string; facultyId: string }[]>([{ id: generateId('d'), name: '', facultyId: '' }]);
    const [ugs, setUgs] = useState<{ id: string; code: string; name: string }[]>([{ id: generateId('ugs'), code: '', name: '' }]);
    const [specialties, setSpecialties] = useState<{ id: string; code: string; name: string; ugsId: string }[]>([{ id: generateId('spec'), code: '', name: '', ugsId: '' }]);
    const [classroomTypes, setClassroomTypes] = useState<ClassroomType[]>([
        { id: generateId('ct'), name: 'Лекционная' },
        { id: generateId('ct'), name: 'Практическая' },
        { id: generateId('ct'), name: 'Компьютерный класс' },
    ]);
    const [classrooms, setClassrooms] = useState<{ id: string; number: string; capacity: number; typeId: string; }[]>([
      { id: generateId('c'), number: '', capacity: 30, typeId: '' }
    ]);


    const handleSave = () => {
        if (!window.confirm("Создать новый проект? Все текущие данные будут удалены.")) return;

        const finalState = {
            settings, timeSlots, faculties, departments, ugs, specialties, classrooms, classroomTypes,
            teachers: [], groups: [], streams: [], subjects: [], cabinets: [], schedule: [], unscheduledEntries: [],
            teacherSubjectLinks: [], schedulingRules: [], productionCalendar: [], educationalPlans: [], scheduleTemplates: [],
        };

        clearAllData();
        loadFullState(finalState);
        onClose();
    };
    
    // Generic list management functions
    // FIX: Refactored updateListItem to use a functional update and accept only the setter function, making it consistent with the other helpers and resolving the type error.
    const updateListItem = <T,>(setList: React.Dispatch<React.SetStateAction<T[]>>, index: number, field: keyof T, value: any) => {
        setList(prev => {
            const newList = [...prev];
            newList[index] = { ...newList[index], [field]: value };
            return newList;
        });
    };

    const addListItem = <T,>(setList: React.Dispatch<React.SetStateAction<T[]>>, newItem: T) => {
        setList(prev => [...prev, newItem]);
    };

    const removeListItem = <T,>(setList: React.Dispatch<React.SetStateAction<T[]>>, index: number) => {
        setList(prev => prev.filter((_, i) => i !== index));
    };

    if (!isOpen) return null;
    
    const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
        <div className="pt-6 border-t first:pt-0 first:border-t-0">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">{title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40">
            <div className="bg-gray-50 p-6 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 border-b pb-4">Мастер создания нового проекта</h2>
                <div className="overflow-y-auto pr-4 flex-grow space-y-6">
                    <Section title="1. Основные настройки">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-sm">Начало семестра</label><input type="date" value={settings.semesterStart} onChange={e => setSettings({...settings, semesterStart: e.target.value})} className={defaultInputClass} /></div>
                            <div><label className="text-sm">Конец семестра</label><input type="date" value={settings.semesterEnd} onChange={e => setSettings({...settings, semesterEnd: e.target.value})} className={defaultInputClass} /></div>
                        </div>
                    </Section>
                    
                    <Section title="2. Расписание звонков">
                         {timeSlots.map((ts, index) => (
                            <div key={ts.id} className="flex items-center gap-2">
                                <input type="text" placeholder="HH:MM-HH:MM" value={ts.time} onChange={e => updateListItem(setTimeSlots, index, 'time', e.target.value)} className={defaultInputClass} />
                                <button onClick={() => removeListItem(setTimeSlots, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                            </div>
                         ))}
                         <button onClick={() => addListItem(setTimeSlots, { id: generateId('ts'), time: '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить слот</button>
                    </Section>

                     <Section title="3. Аудиторный фонд">
                         <div>
                            <h4 className="font-medium mb-2">Типы аудиторий</h4>
                             {classroomTypes.map((ct, index) => (
                                <div key={ct.id} className="flex items-center gap-2 mb-2">
                                    <input type="text" placeholder="Название типа" value={ct.name} onChange={e => updateListItem(setClassroomTypes, index, 'name', e.target.value)} className={defaultInputClass} />
                                    <button onClick={() => removeListItem(setClassroomTypes, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                </div>
                             ))}
                             <button onClick={() => addListItem(setClassroomTypes, { id: generateId('ct'), name: '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить тип</button>
                         </div>
                         <div className="pt-4 border-t">
                            <h4 className="font-medium mb-2">Аудитории</h4>
                             {classrooms.map((c, index) => (
                                <div key={c.id} className="grid grid-cols-[2fr,1fr,2fr,auto] gap-2 items-center">
                                    <input type="text" placeholder="Номер аудитории" value={c.number} onChange={e => updateListItem(setClassrooms, index, 'number', e.target.value)} className={defaultInputClass} />
                                    <input type="number" placeholder="Мест" value={c.capacity} onChange={e => updateListItem(setClassrooms, index, 'capacity', Number(e.target.value))} className={defaultInputClass} min="1" />
                                    <select value={c.typeId} onChange={e => updateListItem(setClassrooms, index, 'typeId', e.target.value)} className={defaultInputClass}>
                                      <option value="" disabled>-- Тип --</option>
                                      {classroomTypes.map(ct => ct.name && <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                                    </select>
                                    <button onClick={() => removeListItem(setClassrooms, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                </div>
                             ))}
                             <button onClick={() => addListItem(setClassrooms, { id: generateId('c'), number: '', capacity: 30, typeId: classroomTypes[0]?.id || '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить аудиторию</button>
                         </div>
                    </Section>
                    
                    <Section title="4. Структура университета">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-medium mb-2">Факультеты</h4>
                                {faculties.map((f, index) => (
                                    <div key={f.id} className="flex items-center gap-2 mb-2">
                                        <input type="text" placeholder="Название факультета" value={f.name} onChange={e => updateListItem(setFaculties, index, 'name', e.target.value)} className={defaultInputClass} />
                                        <button onClick={() => removeListItem(setFaculties, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setFaculties, { id: generateId('f'), name: '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить факультет</button>
                            </div>
                            <div>
                                <h4 className="font-medium mb-2">Кафедры</h4>
                                {departments.map((d, index) => (
                                    <div key={d.id} className="flex items-center gap-2 mb-2">
                                        <input type="text" placeholder="Название кафедры" value={d.name} onChange={e => updateListItem(setDepartments, index, 'name', e.target.value)} className={defaultInputClass} />
                                        <select value={d.facultyId} onChange={e => updateListItem(setDepartments, index, 'facultyId', e.target.value)} className={defaultInputClass}>
                                            <option value="" disabled>-- Факультет --</option>
                                            {faculties.map(f => f.name && <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                        <button onClick={() => removeListItem(setDepartments, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setDepartments, { id: generateId('d'), name: '', facultyId: faculties[0]?.id || ''})} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить кафедру</button>
                            </div>
                        </div>
                    </Section>

                     <Section title="5. Направления подготовки">
                        <div className="space-y-4">
                            <div>
                                <h4 className="font-medium mb-2">УГСН (Укрупненные группы специальностей и направлений)</h4>
                                {ugs.map((u, index) => (
                                    <div key={u.id} className="grid grid-cols-[1fr,3fr,auto] gap-2 mb-2">
                                        <input type="text" placeholder="Код (XX.XX.XX)" value={u.code} onChange={e => updateListItem(setUgs, index, 'code', e.target.value)} className={defaultInputClass} />
                                        <input type="text" placeholder="Название УГСН" value={u.name} onChange={e => updateListItem(setUgs, index, 'name', e.target.value)} className={defaultInputClass} />
                                        <button onClick={() => removeListItem(setUgs, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setUgs, { id: generateId('ugs'), code: '', name: '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить УГСН</button>
                            </div>
                             <div>
                                <h4 className="font-medium mb-2">Специальности</h4>
                                {specialties.map((s, index) => (
                                    <div key={s.id} className="grid grid-cols-[1fr,3fr,2fr,auto] gap-2 mb-2">
                                        <input type="text" placeholder="Код" value={s.code} onChange={e => updateListItem(setSpecialties, index, 'code', e.target.value)} className={defaultInputClass} />
                                        <input type="text" placeholder="Название специальности" value={s.name} onChange={e => updateListItem(setSpecialties, index, 'name', e.target.value)} className={defaultInputClass} />
                                        <select value={s.ugsId} onChange={e => updateListItem(setSpecialties, index, 'ugsId', e.target.value)} className={defaultInputClass}>
                                            <option value="" disabled>-- УГСН --</option>
                                            {ugs.map(u => u.name && <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                        <button onClick={() => removeListItem(setSpecialties, index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => addListItem(setSpecialties, { id: generateId('spec'), code: '', name: '', ugsId: ugs[0]?.id || '' })} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить специальность</button>
                            </div>
                        </div>
                    </Section>
                </div>
                 <div className="flex justify-end space-x-4 mt-6 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">Отмена</button>
                    <button type="button" onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Создать проект</button>
                </div>
            </div>
        </div>
    );
};

export default NewProjectWizard;
