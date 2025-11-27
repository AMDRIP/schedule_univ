import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { DataItem, DataType, TeacherSubjectLink, AcademicDegree, AcademicTitle, Teacher, ClassType } from '../types';
import DataModal from './DataModal';
import LinkModal from './LinkModal';
import { EditIcon, TrashIcon, PlusIcon, DocumentSearchIcon, CopyIcon, LinkIcon } from './icons';
import { calculateExperience } from '../utils/dateUtils';
import { renderIcon } from './IconMap';
import { COLOR_MAP } from '../constants';

interface DataManagerProps {
  dataType: DataType;
  title: string;
  onNavigate?: (view: string, id: string) => void;
}

const COLUMN_HEADERS: Record<string, string> = {
  id: 'ID',
  name: 'Название',
  code: 'Код',
  number: 'Номер',
  capacity: 'Вместимость',
  typeId: 'Тип',
  facultyId: 'Факультет',
  departmentId: 'Кафедра',
  studentCount: 'Студентов',
  groupIds: 'Группы в потоке',
  time: 'Время',
  date: 'Дата',
  isWorkDay: 'Рабочий день',
  course: 'Курс',
  specialtyId: 'Специальность',
  specialtyIds: 'Специальности',
  ugsId: 'УГСН',
  oksoCode: 'Код ОКСО',
  pinnedClassroomId: 'Закреп. ауд.',
  classroomTypeRequirements: 'Требования к аудиториям',
  requiredClassroomTagIds: 'Обязательные теги',
  description: 'Описание',
  photoUrl: 'Фото',
  academicDegree: 'Ученая степень',
  academicTitle: 'Ученое звание',
  regalia: 'Регалии',
  hireDate: 'Дата приема',
  experience: 'Стаж',
  formOfStudy: 'Форма обучения',
  parentGroupId: 'Основная группа',
  hoursPerSemester: 'Часы (семестр)',
  subjectId: 'Дисциплина',
  teacherId: 'Преподаватель',
  groupId: 'Группа',
  linkedTeachers: 'Привязанные преподаватели',
  fullName: 'ФИО',
  deanId: 'Декан',
  address: 'Адрес',
  phone: 'Телефон',
  email: 'Email',
  tagIds: 'Теги',
  color: 'Цвет',
  icon: 'Иконка',
};


const DataManager: React.FC<DataManagerProps> = ({ dataType, title, onNavigate }) => {
  const store = useStore();
  const { addItem, updateItem, deleteItem } = store;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<DataItem | null>(null);
  
  // State for the Link Modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkModalInitialData, setLinkModalInitialData] = useState<Partial<TeacherSubjectLink> | null>(null);


  const data = store[dataType] || [];

  const handleAddItem = () => {
    setCurrentItem(null);
    setIsModalOpen(true);
  };

  const handleEditItem = (item: DataItem) => {
    setCurrentItem(item);
    setIsModalOpen(true);
  };

  const handleCopyItem = (item: DataItem) => {
    const newItem = JSON.parse(JSON.stringify(item));
    delete newItem.id;

    if ('name' in newItem && typeof newItem.name === 'string') {
        newItem.name = `Копия ${newItem.name}`;
    } else if ('number' in newItem && typeof newItem.number === 'string') {
        newItem.number = `Копия ${newItem.number}`;
    }

    addItem(dataType, newItem as Omit<DataItem, 'id'>);
  };

  const handleDeleteItem = (id: string) => {
    let confirmationMessage = 'Вы уверены, что хотите удалить этот элемент?';
    
    switch (dataType) {
        case 'faculties':
            confirmationMessage = 'ВНИМАНИЕ! Удаление факультета приведет к удалению всех связанных кафедр, преподавателей и групп. Это действие необратимо. Вы уверены?';
            break;
        case 'departments':
            confirmationMessage = 'ВНИМАНИЕ! Удаление кафедры приведет к удалению всех связанных преподавателей и групп. Это действие необратимо. Вы уверены?';
            break;
        case 'specialties':
             confirmationMessage = 'ВНИМАНИЕ! Удаление специальности приведет к удалению всех связанных групп и учебных планов. Это действие необратимо. Вы уверены?';
            break;
        case 'groups':
             confirmationMessage = 'ВНИМАНИЕ! Удаление группы приведет к удалению всех записей в расписании для этой группы, а также всех её подгрупп. Это действие необратимо. Вы уверены?';
            break;
        case 'classroomTypes':
            if (store.classrooms.some(c => c.typeId === id)) {
                alert('Нельзя удалить этот тип, так как он используется в одной или нескольких аудиториях.');
                return; // Prevent deletion
            }
            break;
        default:
            break;
    }

    if (window.confirm(confirmationMessage)) {
      deleteItem(dataType, id);
    }
  };

  const handleSave = (item: Omit<DataItem, 'id'> | DataItem) => {
    if ('id' in item && item.id) {
      updateItem(dataType, item as DataItem);
    } else {
      addItem(dataType, item);
    }
    setIsModalOpen(false);
  };
  
  const handleAddLink = (subjectId: string) => {
    setLinkModalInitialData({ subjectId: subjectId, classTypes: [] });
    setIsLinkModalOpen(true);
  };
  
  const handleSaveLink = (link: Omit<TeacherSubjectLink, 'id'> | TeacherSubjectLink) => {
    if ('id' in link && link.id) {
        updateItem('teacherSubjectLinks', link as TeacherSubjectLink);
    } else {
        addItem('teacherSubjectLinks', link);
    }
    setIsLinkModalOpen(false);
  };

  const getColumns = () => {
    if (dataType === 'faculties') {
        return ['id', 'name', 'deanId', 'phone', 'email'];
    }
    if (dataType === 'teachers') {
      return ['id', 'photoUrl', 'name', 'academicDegree', 'academicTitle', 'departmentId', 'hireDate', 'experience'];
    }
    if (dataType === 'subjects') {
        return ['id', 'name', 'linkedTeachers', 'classroomTypeRequirements', 'requiredClassroomTagIds'];
    }
    if (dataType === 'classrooms') {
        return ['id', 'number', 'capacity', 'typeId', 'tagIds'];
    }
    if (dataType === 'scheduleTemplates') {
        return ['id', 'name', 'description'];
    }
    if (dataType === 'groups') {
        return ['id', 'number', 'course', 'specialtyId', 'formOfStudy', 'studentCount', 'pinnedClassroomId'];
    }
    if (dataType === 'subgroups') {
        return ['id', 'name', 'parentGroupId', 'studentCount'];
    }
    if (dataType === 'electives') {
        return ['id', 'name', 'subjectId', 'teacherId', 'groupId', 'hoursPerSemester'];
    }
    if (dataType === 'classroomTags') {
        return ['id', 'color', 'icon', 'name'];
    }

    if (!data || data.length === 0) {
        switch(dataType) {
            case 'departments': return ['id', 'name', 'facultyId', 'specialtyIds'];
            case 'streams': return ['id', 'name', 'groupIds'];
            case 'cabinets': return ['id', 'number', 'departmentId'];
            case 'timeSlots': return ['id', 'time'];
            case 'productionCalendar': return ['id', 'date', 'name', 'type', 'isWorkDay'];
            case 'ugs': return ['id', 'code', 'name'];
            case 'specialties': return ['id', 'code', 'name', 'ugsId', 'oksoCode'];
            case 'classroomTypes': return ['id', 'name'];
            case 'teacherSubjectLinks': return ['teacherId', 'subjectId', 'classTypes'];
            case 'schedulingRules': return ['description', 'type', 'target', 'targetId'];
            case 'educationalPlans': return ['specialtyId', 'entries'];
            default: return [];
        }
    }
    const baseKeys = Object.keys(data[0]);
    return baseKeys.filter(key => !['availabilityGrid', 'entries', 'photoUrl', 'regalia', 'hireDate', 'teacherAssignments', 'headTeacherId', 'address', 'phone', 'email', 'vkLink', 'telegramLink', 'notes', 'fieldOfScience', 'deanId'].includes(key));
  };

  const columns = getColumns();

  const renderCell = (item: DataItem, column: string) => {
    const renderTags = (tagIds: string[] | undefined) => {
      if (!Array.isArray(tagIds) || tagIds.length === 0) return '—';
      const tags = tagIds.map(id => store.classroomTags.find(t => t.id === id)).filter(Boolean);
      return (
          <div className="flex items-center flex-wrap gap-1">
              {tags.map(tag => tag && (
                  <span key={tag.id} title={tag.name} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${COLOR_MAP[tag.color]?.bg || 'bg-gray-100'} ${COLOR_MAP[tag.color]?.text || 'text-gray-700'}`}>
                      {renderIcon(tag.icon, { className: 'w-3 h-3' })}
                      <span>{tag.name}</span>
                  </span>
              ))}
          </div>
      );
    }
    
    if (column === 'experience') {
        return calculateExperience((item as any).hireDate);
    }
    
    if (column === 'linkedTeachers' && dataType === 'subjects') {
        const links = store.teacherSubjectLinks.filter(l => l.subjectId === item.id);
        if (links.length === 0) return '—';
        const teacherNames = links
            .map(link => store.teachers.find(t => t.id === link.teacherId)?.name)
            .filter(Boolean);
        return [...new Set(teacherNames)].join(', ');
    }
    
    if (column === 'academicDegree' && dataType === 'teachers') {
        const teacher = item as Teacher;
        if (!teacher.academicDegree) return '—';
        
        return teacher.fieldOfScience
            ? teacher.academicDegree.replace(' наук', ` ${teacher.fieldOfScience} наук`)
            : teacher.academicDegree;
    }


    const value = item[column as keyof DataItem];

    if (column === 'classroomTypeRequirements' && dataType === 'subjects') {
        if (!value || typeof value !== 'object') return '—';
        const requirements = value as { [key in ClassType]?: string[] };
        const parts = Object.entries(requirements).map(([classType, typeIds]) => {
            if (!typeIds || typeIds.length === 0) return null;
            const typeNames = typeIds.map(id => store.classroomTypes.find(ct => ct.id === id)?.name).filter(Boolean).join(', ');
            return `${classType}: ${typeNames}`;
        }).filter(Boolean);
        return parts.length > 0 ? <div className="text-xs space-y-0.5">{parts.map(p => <div key={p}>{p}</div>)}</div> : '—';
    }
    
    if (column === 'photoUrl' && dataType === 'teachers') {
         return value ? <img src={value as string} alt="фото" className="w-10 h-10 rounded-full object-cover mx-auto"/> : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 mx-auto">Нет фото</div>;
    }

    if (dataType === 'classroomTags') {
        if (column === 'color') {
            const colorClass = COLOR_MAP[value as string] || { bg: 'bg-gray-200', border: 'border-gray-300' };
            return <div className={`w-5 h-5 rounded ${colorClass.bg} border ${colorClass.border}`}></div>;
        }
        if (column === 'icon') {
            return renderIcon(value as string, { className: 'w-5 h-5 text-gray-600' });
        }
    }
    
    if (column === 'tagIds' && dataType === 'classrooms') {
      // FIX: The type of `value` is a large union. We must check if it's an array before casting and passing it to renderTags.
      return renderTags(Array.isArray(value) ? value : undefined);
    }
    if (column === 'requiredClassroomTagIds' && dataType === 'subjects') {
      // FIX: The type of `value` is a large union. We must check if it's an array before casting and passing it to renderTags.
      return renderTags(Array.isArray(value) ? value : undefined);
    }


    switch (column) {
      case 'facultyId':
        return store.faculties.find(f => f.id === value)?.name || 'N/A';
      case 'deanId':
        return store.teachers.find(t => t.id === value)?.name || '—';
      case 'departmentId':
        return store.departments.find(d => d.id === value)?.name || 'N/A';
      case 'ugsId':
        return store.ugs.find(u => u.id === value)?.name || 'N/A';
      case 'specialtyId':
        return store.specialties.find(s => s.id === value)?.name || 'N/A';
      case 'pinnedClassroomId':
        return store.classrooms.find(c => c.id === value)?.number || '—';
      case 'typeId':
          return store.classroomTypes.find(ct => ct.id === value)?.name || 'N/A';
      case 'parentGroupId':
          return store.groups.find(g => g.id === value)?.number || 'N/A';
      case 'subjectId':
          return store.subjects.find(s => s.id === value)?.name || 'N/A';
      case 'teacherId':
          return store.teachers.find(t => t.id === value)?.name || 'N/A';
       case 'groupId':
          if (dataType === 'electives') {
            return store.groups.find(g => g.id === value)?.number || 'N/A';
          }
          return String(value ?? '');
      case 'specialtyIds':
      case 'groupIds':
        if (Array.isArray(value)) {
          let nameMap;
          if (column === 'specialtyIds') nameMap = store.specialties;
          else nameMap = store.groups;
          
          return (value as any[]).map(id => (nameMap.find(g => g.id === id) as any)?.name || (nameMap.find(g => g.id === id) as any)?.number).filter(Boolean).join(', ');
        }
        return '';
      case 'isWorkDay':
        return value ? 'Да' : 'Нет';
      default:
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return String(value ?? '');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        <button
          onClick={handleAddItem}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center transition-transform transform hover:scale-105 active:scale-95"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Добавить
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              {columns.map(col => (
                <th key={col} className="p-3 text-sm font-semibold tracking-wider uppercase text-gray-600 border-b border-gray-300 text-left">{COLUMN_HEADERS[col] || col}</th>
              ))}
              <th className="p-3 text-sm font-semibold tracking-wider uppercase text-gray-600 border-b border-gray-300 text-left">Действия</th>
            </tr>
          </thead>
          <tbody>
            {data.length > 0 ? (
              data.map((item, index) => (
                <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
                  {columns.map(col => (
                    <td key={col} className="p-3 text-gray-800 border-b border-gray-200">{renderCell(item, col)}</td>
                  ))}
                  <td className="p-3 text-gray-800 border-b border-gray-200 flex items-center gap-2">
                    {dataType === 'faculties' && onNavigate && (
                        <button onClick={() => onNavigate('Просмотр института/факультета', item.id)} className="text-teal-600 hover:text-teal-800 transition-transform transform hover:scale-110" title="Просмотр">
                            <DocumentSearchIcon />
                        </button>
                    )}
                    {dataType === 'departments' && onNavigate && (
                        <button onClick={() => onNavigate('Просмотр кафедры', item.id)} className="text-teal-600 hover:text-teal-800 transition-transform transform hover:scale-110" title="Просмотр">
                            <DocumentSearchIcon />
                        </button>
                    )}
                     {dataType === 'teachers' && onNavigate && (
                        <button onClick={() => onNavigate('Просмотр преподавателя', item.id)} className="text-teal-600 hover:text-teal-800 transition-transform transform hover:scale-110" title="Просмотр">
                            <DocumentSearchIcon />
                        </button>
                    )}
                    {dataType === 'subjects' && (
                        <button onClick={() => handleAddLink(item.id)} className="text-green-600 hover:text-green-800 transition-transform transform hover:scale-110" title="Привязать преподавателя">
                            <LinkIcon />
                        </button>
                    )}
                    {['groups', 'specialties'].includes(dataType) && (
                        <button onClick={() => handleCopyItem(item)} className="text-gray-600 hover:text-gray-800 transition-transform transform hover:scale-110" title="Копировать">
                            <CopyIcon />
                        </button>
                    )}
                    <button onClick={() => handleEditItem(item)} className="text-blue-600 hover:text-blue-800 transition-transform transform hover:scale-110" title="Редактировать">
                      <EditIcon />
                    </button>
                    <button onClick={() => handleDeleteItem(item.id)} className="text-red-600 hover:text-red-800 transition-transform transform hover:scale-110" title="Удалить">
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-16 text-gray-500 bg-gray-50/50">
                  <DocumentSearchIcon className="mx-auto h-16 w-16 text-gray-300" />
                  <p className="mt-4 text-lg font-semibold text-gray-600">Пока здесь пусто</p>
                  <p className="mt-1 text-sm text-gray-500">Нажмите кнопку "Добавить", чтобы создать первую запись в этом справочнике.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isModalOpen && (
        <DataModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          item={currentItem}
          dataType={dataType}
        />
      )}
       {isLinkModalOpen && dataType === 'subjects' && (
        <LinkModal
            isOpen={isLinkModalOpen}
            onClose={() => setIsLinkModalOpen(false)}
            onSave={handleSaveLink}
            initialData={linkModalInitialData}
        />
      )}
    </div>
  );
};

export default DataManager;