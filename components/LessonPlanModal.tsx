import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ScheduleEntry, LessonPlan } from '../types';
import { XMarkIcon } from './icons';

interface LessonPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    entry: ScheduleEntry;
    onSave: (updatedEntry: ScheduleEntry) => void;
    subjectName: string;
    groupName: string;
    dateStr: string;
}

const LessonPlanModal: React.FC<LessonPlanModalProps> = ({ isOpen, onClose, entry, onSave, subjectName, groupName, dateStr }) => {
    const [topic, setTopic] = useState('');
    const [content, setContent] = useState('');
    const [homework, setHomework] = useState('');

    useEffect(() => {
        if (entry.lessonPlan) {
            setTopic(entry.lessonPlan.topic || '');
            setContent(entry.lessonPlan.content || '');
            setHomework(entry.lessonPlan.homework || '');
        } else {
            setTopic('');
            setContent('');
            setHomework('');
        }
    }, [entry]);

    if (!isOpen) return null;

    const handleSave = () => {
        const lessonPlan: LessonPlan = {
            topic,
            content,
            homework
        };
        onSave({ ...entry, lessonPlan });
        onClose();
    };

    const modalContent = (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all" onClick={(e) => e.stopPropagation()}>
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-2xl font-bold">План занятия</h2>
                        <p className="text-blue-100 text-sm mt-1">
                            {subjectName} • {groupName} • {dateStr}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white hover:bg-white/20 rounded-full p-1 transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Тема занятия</label>
                        <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="Введите тему занятия..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Содержание занятия</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={4}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                            placeholder="Опишите план проведения занятия..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Домашнее задание</label>
                        <textarea
                            value={homework}
                            onChange={(e) => setHomework(e.target.value)}
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                            placeholder="Задание для самостоятельной работы..."
                        />
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors font-medium"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md font-medium"
                    >
                        Сохранить план
                    </button>
                </div>
            </div>
        </div>
    );

    // Use React Portal to render modal at document body level
    return ReactDOM.createPortal(modalContent, document.body);
};

export default LessonPlanModal;
