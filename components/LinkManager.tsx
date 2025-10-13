
import React, { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { TeacherSubjectLink } from '../types';
import { EditIcon, TrashIcon, PlusIcon } from './icons';
import LinkModal from './LinkModal';

const LinkManager: React.FC = () => {
  const { teachers, subjects, teacherSubjectLinks, addItem, updateItem, deleteItem } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<TeacherSubjectLink | null>(null);

  const handleAddItem = () => {
    setCurrentItem(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (item: TeacherSubjectLink) => {
    setCurrentItem(item);
    setIsModalOpen(true);
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить эту привязку?')) {
      deleteItem('teacherSubjectLinks', id);
    }
  };

  const handleSave = (item: Omit<TeacherSubjectLink, 'id'> | TeacherSubjectLink) => {
    if ('id' in item && item.id) {
      updateItem('teacherSubjectLinks', item as TeacherSubjectLink);
    } else {
      addItem('teacherSubjectLinks', item);
    }
    setIsModalOpen(false);
  };
  
  const getLinkName = (link: TeacherSubjectLink) => {
      const teacher = teachers.find(t => t.id === link.teacherId);
      const subject = subjects.find(s => s.id === link.subjectId);
      return `${teacher?.name || 'N/A'} -> ${subject?.name || 'N/A'}`;
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Привязки преподавателей к дисциплинам</h2>
        <button
          onClick={handleAddItem}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Добавить привязку
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Преподаватель и дисциплина</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Разрешенные типы занятий</th>
              <th className="p-3 font-semibold uppercase text-gray-600 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {teacherSubjectLinks.map(link => (
              <tr key={link.id} className="bg-white hover:bg-gray-50 border-b">
                <td className="p-3 text-gray-800 font-medium">{getLinkName(link)}</td>
                <td className="p-3 text-gray-700">{link.classTypes.join(', ')}</td>
                <td className="p-3 text-gray-800">
                  <button onClick={() => handleEditItem(link)} className="text-blue-600 hover:text-blue-800 mr-4">
                    <EditIcon />
                  </button>
                  <button onClick={() => handleDeleteItem(link.id)} className="text-red-600 hover:text-red-800">
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <LinkModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          initialData={currentItem}
        />
      )}
    </div>
  );
};

export default LinkManager;
