

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { Specialty, EducationalPlan, PlanEntry, Subject, AttestationType } from '../types';
import { PlusIcon, EditIcon, TrashIcon, BookOpenIcon, DocumentSearchIcon } from './icons';

// Modal for adding/editing a plan entry
interface PlanEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: PlanEntry, newSubjectName?: string) => void;
    entry: PlanEntry | null;
}

const PlanEntryModal: React.FC<PlanEntryModalProps> = ({ isOpen, onClose, onSave, entry }) => {
    const { subjects } = useStore();
    const [subjectSelection, setSubjectSelection] = useState<'existing' | 'new'>('existing');
    const [newSubjectName, setNewSubjectName] = useState('');
    const firstInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<Omit<PlanEntry, 'subjectId'> & { subjectId?: string }>({
        semester: 1, lectureHours: 0, practiceHours: 0, labHours: 0, attestation: AttestationType.Test, splitForSubgroups: false,
    });

    useEffect(() => {
        if (isOpen && firstInputRef.current) {
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }
        if (entry) {
            setFormData(entry);
            setSubjectSelection('existing');
        } else {
             setFormData({
                subjectId: subjects[0]?.id || '',
                semester: 1, lectureHours: 0, practiceHours: 0, labHours: 0, attestation: AttestationType.Test, splitForSubgroups: false,
            });
        }
    }, [entry, subjects, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
         if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            setFormData(prev => ({ ...prev, [name]: checked }));
            return;
        }
        const numericFields = ['semester', 'lectureHours', 'practiceHours', 'labHours'];
        setFormData(prev => ({ ...prev, [name]: numericFields.includes(name) ? Number(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalEntry: PlanEntry = {
            subjectId: subjectSelection === 'new' ? '' : formData.subjectId!,
            ...formData,
        };
        onSave(finalEntry, subjectSelection === 'new' ? newSubjectName : undefined);
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
             <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg animation-fade-in-scale">
                <h2 className="text-xl font-bold mb-4 text-gray-900">{entry ? 'Редактировать дисциплину в плане' : 'Добавить дисциплину в план'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Дисциплина</label>
                        <div className="flex items-center space-x-4 mt-1">
                            <label><input type="radio" value="existing" checked={subjectSelection === 'existing'} onChange={() => setSubjectSelection('existing')} ref={firstInputRef} /> Существующая</label>
                            <label><input type="radio" value="new" checked={subjectSelection === 'new'} onChange={() => setSubjectSelection('new')} /> Новая</label>
                        </div>
                         {subjectSelection === 'existing' ? (
                            <select name="subjectId" value={formData.subjectId} onChange={handleChange} className={`${defaultInputClass} mt-2`}>
                                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        ) : (
                            <input type="text" value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} placeholder="Введите название новой дисциплины" className={`${defaultInputClass} mt-2`} />
                        )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700">Семестр</label><input type="number" name="semester" value={formData.semester} onChange={handleChange} className={defaultInputClass} min="1" /></div>
                        <div><label className="block text-sm font-medium text-gray-700">Аттестация</label><select name="attestation" value={formData.attestation} onChange={handleChange} className={defaultInputClass}>{Object.values(AttestationType).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div><label className="block text-sm font-medium text-gray-700">Лекции (ч)</label><input type="number" name="lectureHours" value={formData.lectureHours} onChange={handleChange} className={defaultInputClass} min="0" /></div>
                        <div><label className="block text-sm font-medium text-gray-700">Практики (ч)</label><input type="number" name="practiceHours" value={formData.practiceHours} onChange={handleChange} className={defaultInputClass} min="0" /></div>
                        <div><label className="block text-sm font-medium text-gray-700">Лаб. (ч)</label><input type="number" name="labHours" value={formData.labHours} onChange={handleChange} className={defaultInputClass} min="0" /></div>
                    </div>

                    <div className="flex items-center">
                        <input type="checkbox" name="splitForSubgroups" id="splitForSubgroups" checked={!!formData.splitForSubgroups} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                        <label htmlFor="splitForSubgroups" className="ml-2 block text-sm font-medium text-gray-700">Разделить по подгруппам (для практик/лабораторных)</label>
                    </div>
                    
                    <div className="flex justify-end space-x-4 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">Отмена</button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Сохранить</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// Main Component
const EducationalPlanManager: React.FC = () => {
    const { specialties, educationalPlans, subjects, updateItem, addItem } = useStore();
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>(specialties[0]?.id || '');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEntry, setCurrentEntry] = useState<PlanEntry | null>(null);

    const activePlan = useMemo(() => {
        return educationalPlans.find(p => p.specialtyId === selectedSpecialtyId);
    }, [selectedSpecialtyId, educationalPlans]);
    
    const groupedEntries = useMemo(() => {
        if (!activePlan) return {};
        return activePlan.entries.reduce((acc, entry) => {
            (acc[entry.semester] = acc[entry.semester] || []).push(entry);
            return acc;
        }, {} as Record<number, PlanEntry[]>);
    }, [activePlan]);

    const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'N/A';

    const handleAddEntry = () => {
        setCurrentEntry(null);
        setIsModalOpen(true);
    };

    const handleEditEntry = (entry: PlanEntry) => {
        setCurrentEntry(entry);
        setIsModalOpen(true);
    };
    
    const handleDeleteEntry = (entryToDelete: PlanEntry) => {
        if (!activePlan || !window.confirm(`Удалить дисциплину "${getSubjectName(entryToDelete.subjectId)}" из плана?`)) return;
        const updatedEntries = activePlan.entries.filter(e => e.subjectId !== entryToDelete.subjectId || e.semester !== entryToDelete.semester);
        updateItem('educationalPlans', { ...activePlan, entries: updatedEntries });
    };

    const handleSaveEntry = (entry: PlanEntry, newSubjectName?: string) => {
        let subjectId = entry.subjectId;
        
        if (newSubjectName) {
            const newSubject = { name: newSubjectName };
            addItem('subjects', newSubject);
            // This is a simplified way to get the new ID. In a real app, addItem would return the created item.
            // For this mock environment, we'll find it by name.
            // This is not robust if names can be duplicated.
            // A better solution would be for useStore's addItem to return the new item.
            const createdSubject = [...subjects, newSubject].find(s => s.name === newSubjectName);
            subjectId = createdSubject ? `sub-${Date.now()}` : 'error-id'; // Simplified ID generation
            if (createdSubject && 'id' in createdSubject) {
                subjectId = (createdSubject as Subject).id;
            }
        }

        const finalEntry = { ...entry, subjectId };

        let planToUpdate = activePlan;
        
        // If no plan exists for this specialty, create one
        if (!planToUpdate) {
            const newPlan: Omit<EducationalPlan, 'id'> = {
                specialtyId: selectedSpecialtyId,
                entries: [finalEntry]
            };
            addItem('educationalPlans', newPlan);
        } else {
             const existingEntryIndex = planToUpdate.entries.findIndex(e => e.subjectId === currentEntry?.subjectId && e.semester === currentEntry?.semester);
             let updatedEntries: PlanEntry[];

             if (existingEntryIndex > -1) {
                 // Update existing
                 updatedEntries = [...planToUpdate.entries];
                 updatedEntries[existingEntryIndex] = finalEntry;
             } else {
                 // Add new
                 updatedEntries = [...planToUpdate.entries, finalEntry];
             }
             updateItem('educationalPlans', { ...planToUpdate, entries: updatedEntries });
        }
        
        setIsModalOpen(false);
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                    <BookOpenIcon className="h-8 w-8 text-blue-600 mr-3" />
                    <h2 className="text-2xl font-bold text-gray-800">Учебные планы</h2>
                </div>
                 <div className="flex items-center gap-4">
                     <select value={selectedSpecialtyId} onChange={e => setSelectedSpecialtyId(e.target.value)} className="p-2 border rounded-md bg-white min-w-[300px] text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                        {specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                    </select>
                    <button onClick={handleAddEntry} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center shrink-0 transition-transform transform hover:scale-105 active:scale-95">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Добавить дисциплину
                    </button>
                 </div>
            </div>

            <div className="space-y-6">
                {Object.keys(groupedEntries).length > 0 ? Object.keys(groupedEntries).sort((a,b) => Number(a)-Number(b)).map(semester => {
                    const semesterEntries = groupedEntries[Number(semester)];
                    const totalLectures = semesterEntries.reduce((sum, e) => sum + e.lectureHours, 0);
                    const totalPractices = semesterEntries.reduce((sum, e) => sum + e.practiceHours, 0);
                    const totalLabs = semesterEntries.reduce((sum, e) => sum + e.labHours, 0);
                    const grandTotal = totalLectures + totalPractices + totalLabs;
                    const totalZET = (grandTotal / 36).toFixed(2);

                    return (
                    <div key={semester}>
                        <h3 className="text-lg font-semibold text-gray-700 mb-2">{semester} семестр</h3>
                        <div className="overflow-x-auto border rounded-lg">
                             <table className="w-full">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Дисциплина</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Лекции</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Практики</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Лаб.</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Всего, ч</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">ЗЕТ</th>
                                        <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Аттестация</th>
                                        <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Деление</th>
                                        <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {semesterEntries.map((entry, index) => {
                                         const totalHours = entry.lectureHours + entry.practiceHours + entry.labHours;
                                         const zet = (totalHours / 36).toFixed(2);
                                         return (
                                         <tr key={entry.subjectId} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                            <td className="p-2 font-medium border-t border-gray-200 text-gray-900">{getSubjectName(entry.subjectId)}</td>
                                            <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.lectureHours || '-'}</td>
                                            <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.practiceHours || '-'}</td>
                                            <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.labHours || '-'}</td>
                                            <td className="p-2 text-center font-semibold border-t border-gray-200 text-gray-800">{totalHours}</td>
                                            <td className="p-2 text-center font-semibold border-t border-gray-200 text-gray-800">{zet}</td>
                                            <td className="p-2 border-t border-gray-200 text-gray-700">{entry.attestation}</td>
                                            <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.splitForSubgroups ? 'Да' : 'Нет'}</td>
                                            <td className="p-2 border-t border-gray-200 text-gray-700">
                                                <button onClick={() => handleEditEntry(entry)} className="text-blue-600 hover:text-blue-800 mr-3 transition-transform transform hover:scale-110"><EditIcon/></button>
                                                <button onClick={() => handleDeleteEntry(entry)} className="text-red-600 hover:text-red-800 transition-transform transform hover:scale-110"><TrashIcon/></button>
                                            </td>
                                         </tr>
                                         )
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-200 font-bold">
                                    <tr>
                                        <td className="p-2 text-right border-t-2 border-gray-300">Итого за семестр:</td>
                                        <td className="p-2 text-center border-t-2 border-gray-300">{totalLectures}</td>
                                        <td className="p-2 text-center border-t-2 border-gray-300">{totalPractices}</td>
                                        <td className="p-2 text-center border-t-2 border-gray-300">{totalLabs}</td>
                                        <td className="p-2 text-center border-t-2 border-gray-300">{grandTotal}</td>
                                        <td className="p-2 text-center border-t-2 border-gray-300">{totalZET}</td>
                                        <td className="p-2 border-t-2 border-gray-300" colSpan={3}></td>
                                    </tr>
                                </tfoot>
                             </table>
                        </div>
                    </div>
                )}) : (
                    <div className="text-center py-16 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                        <BookOpenIcon className="mx-auto h-16 w-16 text-gray-300" />
                        <p className="mt-4 text-lg font-semibold text-gray-600">Учебный план пуст</p>
                        <p className="mt-1 text-sm text-gray-500">Для этой специальности еще не добавлены дисциплины. Нажмите "Добавить", чтобы начать.</p>
                    </div>
                )}
            </div>
             {isModalOpen && <PlanEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveEntry} entry={currentEntry} />}
        </div>
    );
};

export default EducationalPlanManager;