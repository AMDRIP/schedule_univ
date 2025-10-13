

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { DataItem, DataType, ClassroomType, Group, ProductionCalendarEventType, FormOfStudy, Elective, Subgroup, ClassType } from '../types';
import AvailabilityGridEditor from './AvailabilityGridEditor';
import { PlusIcon, TrashIcon } from './icons';
import { OKSO_CODES, UGSN_FROM_OKSO } from '../data/codes';


const TITLE_MAP: Record<DataType, { single: string }> = {
    faculties: { single: 'факультет' },
    departments: { single: 'кафедру' },
    teachers: { single: 'преподавателя' },
    groups: { single: 'группу' },
    streams: { single: 'поток' },
    classrooms: { single: 'аудиторию' },
    subjects: { single: 'дисциплину' },
    cabinets: { single: 'кабинет' },
    timeSlots: { single: 'временной слот' },
    timeSlotsShortened: { single: 'сокращенный слот' },
    teacherSubjectLinks: { single: 'привязку' },
    schedulingRules: { single: 'правило' },
    productionCalendar: { single: 'событие' },
    ugs: { single: 'УГСН' },
    specialties: { single: 'специальность' },
    educationalPlans: { single: 'учебный план' },
    scheduleTemplates: { single: 'шаблон расписания'},
    classroomTypes: { single: 'тип аудитории' },
    subgroups: { single: 'подгруппу' },
    electives: { single: 'факультатив' },
};


interface DataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<DataItem, 'id'> | DataItem) => void;
  item: DataItem | null;
  dataType: DataType;
}

const DataModal: React.FC<DataModalProps> = ({ isOpen, onClose, onSave, item, dataType }) => {
  const [formData, setFormData] = useState<any>({});
  const { faculties, departments, groups, ugs, specialties, classrooms, classroomTypes, subjects, teachers } = useStore();
  const [selectedCourseForStream, setSelectedCourseForStream] = useState<number | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  const getInitialFormData = (type: DataType) => {
    switch (type) {
      case 'faculties': return { name: '' };
      case 'departments': return { name: '', facultyId: faculties[0]?.id || '', specialtyIds: [] };
      case 'teachers': return { name: '', departmentId: departments[0]?.id || '', availabilityGrid: {}, pinnedClassroomId: '', regalia: '', academicDegree: '', photoUrl: '', hireDate: '' };
      case 'groups': return { number: '', departmentId: departments[0]?.id || '', studentCount: 25, course: 1, specialtyId: specialties[0]?.id || '', formOfStudy: FormOfStudy.FullTime, availabilityGrid: {}, pinnedClassroomId: '' };
      case 'streams': return { name: '', groupIds: [] };
      case 'classrooms': return { number: '', capacity: 30, typeId: classroomTypes[0]?.id || '', availabilityGrid: {} };
      case 'subjects': return { name: '', pinnedClassroomId: '', suitableClassroomTypeIds: [] };
      case 'cabinets': return { number: '', departmentId: departments[0]?.id || '' };
      case 'timeSlots': return { time: '00:00-00:00' };
      case 'timeSlotsShortened': return { time: '00:00-00:00' };
      case 'productionCalendar': return { date: '', name: '', isWorkDay: false, type: ProductionCalendarEventType.Holiday };
      case 'ugs': return { code: '', name: '' };
      case 'specialties': return { code: '', name: '', ugsId: ugs[0]?.id || '', oksoCode: '' };
      case 'scheduleTemplates': return { name: '', description: '', entries: [] };
      case 'classroomTypes': return { name: '' };
      case 'subgroups': return { name: '', parentGroupId: groups[0]?.id || '', studentCount: 12, teacherAssignments: [] };
      case 'electives': return { name: '', subjectId: subjects[0]?.id || '', teacherId: teachers[0]?.id || '', groupId: groups[0]?.id || '', hoursPerSemester: 32 };
      default: return {};
    }
  };
  
  useEffect(() => {
    if (isOpen && firstInputRef.current) {
        setTimeout(() => firstInputRef.current?.focus(), 100); // Timeout for transition
    }
    const initialData = item || getInitialFormData(dataType);
    if (['teachers', 'groups', 'classrooms'].includes(dataType) && !(initialData as any).availabilityGrid) {
        (initialData as any).availabilityGrid = {};
    }
    if (dataType === 'subjects' && !(initialData as any).suitableClassroomTypeIds) {
        (initialData as any).suitableClassroomTypeIds = [];
    }
    if (dataType === 'subgroups' && !(initialData as any).teacherAssignments) {
        (initialData as any).teacherAssignments = [];
    }
    setFormData(initialData);
    if (dataType === 'streams' && item && (item as any).groupIds?.length > 0) {
        const firstGroup = groups.find(g => g.id === (item as any).groupIds[0]);
        setSelectedCourseForStream(firstGroup?.course || null);
    } else {
        setSelectedCourseForStream(null);
    }
  }, [item, dataType, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData((prev: any) => ({ ...prev, [name]: checked }));
        return;
    }

    const numericFields = ['capacity', 'studentCount', 'course', 'hoursPerSemester'];
    setFormData((prev: any) => ({ 
      ...prev, 
      [name]: numericFields.includes(name) ? Number(value) : value 
    }));
  };
  
  const handleAssignmentChange = (index: number, field: string, value: string) => {
    const updatedAssignments = [...(formData.teacherAssignments || [])];
    updatedAssignments[index] = { ...updatedAssignments[index], [field]: value };
    setFormData((prev: any) => ({ ...prev, teacherAssignments: updatedAssignments }));
  };
  
  const addAssignment = () => {
    const newAssignment = {
        subjectId: subjects[0]?.id || '',
        teacherId: teachers[0]?.id || '',
        classType: ClassType.Practical,
    };
    setFormData((prev: any) => ({
        ...prev,
        teacherAssignments: [...(prev.teacherAssignments || []), newAssignment],
    }));
  };

  const removeAssignment = (index: number) => {
    setFormData((prev: any) => ({
        ...prev,
        teacherAssignments: prev.teacherAssignments.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleUgsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    const selectedUgs = UGSN_FROM_OKSO.find(u => u.code === selectedCode);
    if (selectedUgs) {
      setFormData((prev: any) => ({ ...prev, code: selectedUgs.code, name: selectedUgs.name }));
    }
  };
  
  const handleGridChange = (newGrid) => {
      setFormData((prev) => ({ ...prev, availabilityGrid: newGrid }));
  };

  const handleMultiSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, options } = e.target;
      const values = Array.from(options)
        .filter((option: HTMLOptionElement) => option.selected)
        .map((option: HTMLOptionElement) => option.value);

      if (name === 'groupIds') {
          if (values.length === 0) {
              setSelectedCourseForStream(null);
          } else {
              const firstGroup = groups.find(g => g.id === values[0]);
              setSelectedCourseForStream(firstGroup?.course || null);
          }
      }

      setFormData((prev: any) => ({...prev, [name]: values}));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;
  
  const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";
  const showAvailabilityGrid = ['teachers', 'groups', 'classrooms'].includes(dataType);

  const renderDefaultField = (key: string, isFirst: boolean) => {
    if (key === 'id' || key === 'availabilityGrid' || key === 'entries' || key === 'teacherAssignments') return null;
    
    const labelMap: Record<string, string> = {
        name: "ФИО / Название", number: "Номер/Название", time: "Время", capacity: "Вместимость", studentCount: "Кол-во студентов", 
        code: "Код", course: "Курс", oksoCode: "Код ОКСО", description: "Описание", date: "Дата",
        photoUrl: "URL Фотографии", academicDegree: "Ученая степень", regalia: "Регалии, звания", hireDate: "Дата приема на работу",
        hoursPerSemester: 'Часы за семестр',
    };
    
    if (dataType === 'teachers' && key === 'photoUrl') {
        return (
            <div>
                <label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label>
                <div className="flex items-center gap-2">
                    <input type='url' name={key} value={formData[key] || ''} onChange={handleChange} placeholder="https://example.com/photo.jpg" className={defaultInputClass} />
                    {formData.photoUrl && <img src={formData.photoUrl} alt="preview" className="w-10 h-10 rounded-full object-cover flex-shrink-0"/>}
                </div>
            </div>
        );
    }

    if (key === 'description') {
        return <div><label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label><textarea name={key} value={formData[key] || ''} onChange={handleChange} className={`${defaultInputClass} h-24`}/></div>
    }

    switch(key) {
        case 'facultyId': return (
          <div><label className="block text-sm font-medium text-gray-700">Факультет</label><select name="facultyId" value={formData.facultyId} onChange={handleChange} className={defaultInputClass}>{faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        );
        case 'departmentId': return (
          <div><label className="block text-sm font-medium text-gray-700">Кафедра</label><select name="departmentId" value={formData.departmentId} onChange={handleChange} className={defaultInputClass}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        );
        case 'ugsId': return (
          <div><label className="block text-sm font-medium text-gray-700">УГСН</label><select name="ugsId" value={formData.ugsId} onChange={handleChange} className={defaultInputClass}>{ugs.map(u => <option key={u.id} value={u.id}>{u.code} {u.name}</option>)}</select></div>
        );
        case 'specialtyId': return (
          <div><label className="block text-sm font-medium text-gray-700">Специальность</label><select name="specialtyId" value={formData.specialtyId} onChange={handleChange} className={defaultInputClass}>{specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
        );
        case 'parentGroupId': return (
          <div><label className="block text-sm font-medium text-gray-700">Основная группа</label><select name="parentGroupId" value={formData.parentGroupId} onChange={handleChange} className={defaultInputClass}>{groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}</select></div>
        );
        case 'subjectId': return (
          <div><label className="block text-sm font-medium text-gray-700">Дисциплина</label><select name="subjectId" value={formData.subjectId} onChange={handleChange} className={defaultInputClass}>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        );
        case 'teacherId': return (
          <div><label className="block text-sm font-medium text-gray-700">Преподаватель</label><select name="teacherId" value={formData.teacherId} onChange={handleChange} className={defaultInputClass}>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        );
        case 'groupId': return (
          <div><label className="block text-sm font-medium text-gray-700">Группа</label><select name="groupId" value={formData.groupId} onChange={handleChange} className={defaultInputClass}>{groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}</select></div>
        );
        case 'pinnedClassroomId': return (
           <div><label className="block text-sm font-medium text-gray-700">Закрепленная аудитория</label><select name="pinnedClassroomId" value={formData.pinnedClassroomId} onChange={handleChange} className={defaultInputClass}><option value="">Нет</option>{classrooms.map(c => <option key={c.id} value={c.id}>{c.number} ({classroomTypes.find(ct => ct.id === c.typeId)?.name})</option>)}</select></div>
        );
        case 'specialtyIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Специальности (Ctrl/Cmd)</label><select multiple name="specialtyIds" value={formData.specialtyIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
        );
        case 'groupIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Группы в потоке (Ctrl/Cmd)</label><p className="text-xs text-gray-500 mb-1">Можно выбрать только группы одного курса.</p><select multiple name="groupIds" value={formData.groupIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{groups.map(g => <option key={g.id} value={g.id} disabled={selectedCourseForStream !== null && g.course !== selectedCourseForStream}>{g.number} ({g.course} курс)</option>)}</select></div>
        );
         case 'suitableClassroomTypeIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Подходящие типы аудиторий (Ctrl/Cmd)</label><select multiple name="suitableClassroomTypeIds" value={formData.suitableClassroomTypeIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-24`}>{classroomTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}</select></div>
        );
        case 'isWorkDay': return (
            <div className="flex items-center pt-5">
                <input type="checkbox" name="isWorkDay" id="isWorkDay" checked={!!formData.isWorkDay} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="isWorkDay" className="ml-2 block text-sm font-medium text-gray-700">Рабочий день</label>
            </div>
        );
        case 'formOfStudy': return (
            <div>
                <label className="block text-sm font-medium text-gray-700">Форма обучения</label>
                <select name="formOfStudy" value={formData.formOfStudy} onChange={handleChange} className={defaultInputClass}>
                    {Object.values(FormOfStudy).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </div>
        );
        case 'typeId': 
            if (dataType === 'classrooms') {
                return (
                    <div><label className="block text-sm font-medium text-gray-700">Тип</label><select name="typeId" value={formData.typeId} onChange={handleChange} className={defaultInputClass}>{classroomTypes.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}</select></div>
                );
            }
            return null;
        case 'type':
             if (dataType === 'productionCalendar') {
                return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Тип</label>
                        <select name="type" value={formData.type} onChange={handleChange} className={defaultInputClass}>
                            {Object.values(ProductionCalendarEventType).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                );
            }
            return null;
        case 'oksoCode': return (
           <div>
             <label className="block text-sm font-medium text-gray-700" htmlFor="oksoCode">Код ОКСО</label>
             <input list="okso-codes" id="oksoCode" name="oksoCode" value={formData.oksoCode || ''} onChange={handleChange} className={defaultInputClass} />
             <datalist id="okso-codes">
                {OKSO_CODES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
             </datalist>
           </div>
        );
        default:
            const initialData = getInitialFormData(dataType);
            const isDateField = key === 'date' || key === 'hireDate';
            const inputType = typeof initialData[key] === 'number' ? 'number' : isDateField ? 'date' : 'text';
            return (
                <div><label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label><input type={inputType} name={key} value={formData[key] || ''} onChange={handleChange} className={defaultInputClass} min={key === 'course' ? 1 : undefined} ref={isFirst ? firstInputRef : null} /></div>
            );
    }
  }
  
  const modalTitle = `${item ? 'Редактировать' : 'Добавить'} ${TITLE_MAP[dataType]?.single || 'элемент'}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 ease-out scale-95 opacity-0 animate-fade-in-scale">
        <style>{`
          @keyframes fade-in-scale {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          .animate-fade-in-scale {
            animation: fade-in-scale 0.2s forwards;
          }
        `}</style>
        <h2 className="text-xl font-bold mb-4 text-gray-900">{modalTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {Object.keys(getInitialFormData(dataType)).map((key, index) => <div key={key}>{renderDefaultField(key, index === 0)}</div>)}
          
          {dataType === 'subgroups' && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Назначения преподавателей</h3>
              <div className="space-y-2">
                {(formData.teacherAssignments || []).map((assignment: any, index: number) => (
                  <div key={index} className="grid grid-cols-[1fr,1fr,1fr,auto] gap-2 items-center p-2 bg-gray-50 rounded">
                    <select value={assignment.subjectId} onChange={e => handleAssignmentChange(index, 'subjectId', e.target.value)} className={defaultInputClass}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <select value={assignment.teacherId} onChange={e => handleAssignmentChange(index, 'teacherId', e.target.value)} className={defaultInputClass}>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <select value={assignment.classType} onChange={e => handleAssignmentChange(index, 'classType', e.target.value)} className={defaultInputClass}>
                      {[ClassType.Practical, ClassType.Lab, ClassType.Consultation].map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </select>
                    <button type="button" onClick={() => removeAssignment(index)} className="p-2 text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAssignment} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить назначение</button>
            </div>
          )}

          {showAvailabilityGrid && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Сетка доступности</h3>
              <AvailabilityGridEditor grid={formData.availabilityGrid} onGridChange={handleGridChange} />
            </div>
          )}

          <div className="flex justify-end space-x-4 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">Отмена</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Сохранить</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DataModal;