
import React, { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { TeacherSubjectLink, ClassType } from '../types';

interface LinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: Omit<TeacherSubjectLink, 'id'> | TeacherSubjectLink) => void;
    initialData: Partial<TeacherSubjectLink> | null;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const { teachers, subjects } = useStore();
    const [formData, setFormData] = useState<Partial<TeacherSubjectLink>>({
        teacherId: teachers[0]?.id || '',
        subjectId: subjects[0]?.id || '',
        classTypes: [],
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                teacherId: initialData.teacherId || teachers[0]?.id || '',
                subjectId: initialData.subjectId || subjects[0]?.id || '',
                classTypes: initialData.classTypes || [],
                ...(initialData.id && { id: initialData.id }),
            });
        } else {
            setFormData({
                teacherId: teachers[0]?.id || '',
                subjectId: subjects[0]?.id || '',
                classTypes: [],
            });
        }
    }, [initialData, teachers, subjects]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: value }));
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { value, checked } = e.target;
        const type = value as ClassType;
        setFormData((prev: any) => {
            const currentTypes = prev.classTypes || [];
            if (checked) {
                return { ...prev, classTypes: [...currentTypes, type] };
            } else {
                return { ...prev, classTypes: currentTypes.filter((t: ClassType) => t !== type) };
            }
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData as TeacherSubjectLink);
    };

    if (!isOpen) return null;
    const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
    const isEditing = !!initialData?.id;
    const isSubjectPreset = !!initialData?.subjectId && !initialData?.id;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-gray-900">{isEditing ? 'Редактировать привязку' : 'Добавить привязку'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Преподаватель</label>
                        <select name="teacherId" value={formData.teacherId} onChange={handleChange} className={defaultInputClass}>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Дисциплина</label>
                        <select name="subjectId" value={formData.subjectId} onChange={handleChange} className={defaultInputClass} disabled={isSubjectPreset || isEditing}>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                         {isSubjectPreset && <p className="text-xs text-gray-500 mt-1">Дисциплина выбрана из контекста.</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Типы занятий</label>
                        <div className="mt-2 space-y-2">
                            {Object.values(ClassType).map(type => (
                                (type !== ClassType.Elective) && <div key={type} className="flex items-center">
                                    <input
                                        id={`type-${type}`}
                                        type="checkbox"
                                        value={type}
                                        checked={formData.classTypes?.includes(type)}
                                        onChange={handleCheckboxChange}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor={`type-${type}`} className="ml-2 text-sm text-gray-800">{type}</label>
                                </div>
                            ))}
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

export default LinkModal;
