import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { DataItem, DataType, ClassroomType, Group, ProductionCalendarEventType, FormOfStudy, Elective, Subgroup, ClassType, AcademicDegree, AcademicTitle, FieldOfScience, Teacher, DeliveryMode } from '../types';
import AvailabilityGridEditor from './AvailabilityGridEditor';
import { PlusIcon, TrashIcon } from './icons';
import { OKSO_CODES, UGSN_FROM_OKSO } from '../data/codes';
import { renderIcon } from './IconMap';
import { COLOR_MAP } from '../constants';
import { SHIFT_LABELS, TIME_SLOT_SHIFT_LABELS } from '../utils/shiftUtils';
import { ColorPalettePicker, IconSelect } from './VisualPickers';


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
    classroomTags: { single: 'тег аудитории' },
    buildingPlans: { single: 'план здания' },
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
  const { faculties, departments, groups, ugs, specialties, classrooms, classroomTypes, subjects, teachers, settings, teacherSubjectLinks, classroomTags, timeSlots } = useStore();
  const [selectedCourseForStream, setSelectedCourseForStream] = useState<number | null>(null);
  const [ugsNotFoundMessage, setUgsNotFoundMessage] = useState<string>('');
  const firstInputRef = useRef<HTMLInputElement>(null);

    const teacherDisplayNames = useMemo(() => {
        if (!settings.showTeacherDetailsInLists) {
            return new Map(teachers.map(t => [t.id, t.name]));
        }
        return new Map(teachers.map(teacher => {
            const departmentName = departments.find(d => d.id === teacher.departmentId)?.name || 'Б/К';
            const teacherSubjects = teacherSubjectLinks
                .filter(link => link.teacherId === teacher.id)
                .map(link => subjects.find(s => s.id === link.subjectId)?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(', ');
            const subjectsText = teacherSubjects ? ` [${teacherSubjects}... ]` : '';
            return [teacher.id, `${teacher.name} (${departmentName})${subjectsText}`];
        }));
    }, [settings, teachers, departments, teacherSubjectLinks, subjects]);

  const getInitialFormData = (type: DataType) => {
    switch (type) {
      case 'faculties': return { name: '', deanId: '', address: '', phone: '', email: '', notes: '' };
      case 'departments': return { name: '', facultyId: faculties[0]?.id || '', specialtyIds: [], headTeacherId: '', address: '', phone: '', email: '', vkLink: '', telegramLink: '', notes: '' };
      case 'teachers': return { name: '', departmentId: departments[0]?.id || '', availabilityGrid: {}, pinnedClassroomId: '', regalia: '', academicDegree: '', fieldOfScience: '', academicTitle: '', photoUrl: '', hireDate: '', color: '', quickSubjectLinks: [] };
      case 'groups': return { number: '', departmentId: departments[0]?.id || '', studentCount: 25, course: 1, specialtyId: specialties[0]?.id || '', formOfStudy: FormOfStudy.FullTime, shift: 'both', availabilityGrid: {}, pinnedClassroomId: '', curatorTeacherId: '', admissionYear: new Date().getFullYear(), notes: '' };
      case 'streams': return { name: '', groupIds: [], subgroupIds: [], type: 'lecture', subjectId: '', teacherId: '', classroomTypeId: '', maxStudentCount: 0, semester: 1, notes: '' };
      case 'classrooms': return { number: '', capacity: 30, examCapacity: 15, typeId: classroomTypes[0]?.id || '', availabilityGrid: {}, tagIds: [], area: 0, departmentId: '', status: 'available', allowedClassTypes: [], prioritySubjectIds: [], notes: '' };
      case 'subjects': return { name: '', pinnedClassroomId: '', classroomTypeRequirements: {}, requiredClassroomTagIds: [], color: '' };
      case 'cabinets': return { number: '', departmentId: departments[0]?.id || '', capacity: 1, category: 'administrative', responsibleTeacherId: '', tagIds: [], status: 'available', notes: '' };
      case 'timeSlots': return { time: '00:00-00:00', shift: 'first' };
      case 'timeSlotsShortened': return { time: '00:00-00:00', shift: 'first' };
      case 'productionCalendar': return { date: '', name: '', isWorkDay: false, type: ProductionCalendarEventType.Holiday };
      case 'ugs': return { code: '', name: '' };
      case 'specialties': return { code: '', name: '', ugsId: ugs[0]?.id || '', oksoCode: '' };
      case 'scheduleTemplates': return { name: '', description: '', entries: [] };
      case 'classroomTypes': return { name: '', category: 'educational', allowedClassTypes: [], requiredTagIds: [], color: 'blue', priority: 50, description: '' };
      case 'subgroups': return { name: '', parentGroupId: groups[0]?.id || '', studentCount: 12, type: 'general', subjectIds: [], notes: '', teacherAssignments: [] };
      case 'electives': return { name: '', subjectId: subjects[0]?.id || '', teacherId: teachers[0]?.id || '', groupId: groups[0]?.id || '', hoursPerSemester: 32, classType: ClassType.Elective, deliveryMode: DeliveryMode.Offline, pinnedClassroomId: '', classroomTypeIds: [], requiredClassroomTagIds: [], preferredTimeSlotIds: [] };
      case 'classroomTags': return { name: '', icon: 'BookmarkIcon', color: 'gray', category: 'equipment', requiredLevel: 'preferred', description: '' };
      case 'buildingPlans': return { name: '', address: '', floors: [], updatedAt: new Date().toISOString() };
      default: return {};
    }
  };
  
  useEffect(() => {
    if (isOpen) {
        setUgsNotFoundMessage('');
        if (firstInputRef.current) {
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }
    }

    const initialData = item ? { ...(item as any) } : getInitialFormData(dataType);
    if (['teachers', 'groups', 'classrooms'].includes(dataType) && !(initialData as any).availabilityGrid) {
        (initialData as any).availabilityGrid = {};
    }
    if (dataType === 'groups' && !(initialData as any).shift) {
        (initialData as any).shift = 'both';
    }
    if (dataType === 'teachers') {
        (initialData as any).quickSubjectLinks = item && (item as any).id
            ? teacherSubjectLinks
                .filter(link => link.teacherId === (item as any).id)
                .map(link => ({ subjectId: link.subjectId, classTypes: [...link.classTypes] }))
            : [];
    }
    if ((dataType === 'timeSlots' || dataType === 'timeSlotsShortened') && !(initialData as any).shift) {
        (initialData as any).shift = 'first';
    }
    if (dataType === 'subjects' && !(initialData as any).classroomTypeRequirements) {
        (initialData as any).classroomTypeRequirements = {};
    }
     if (dataType === 'classrooms' && !(initialData as any).tagIds) {
        (initialData as any).tagIds = [];
    }
    if (dataType === 'subjects' && !(initialData as any).requiredClassroomTagIds) {
        (initialData as any).requiredClassroomTagIds = [];
    }
    if (dataType === 'electives') {
        if (!(initialData as any).classType) (initialData as any).classType = ClassType.Elective;
        if (!(initialData as any).deliveryMode) (initialData as any).deliveryMode = DeliveryMode.Offline;
        if (!(initialData as any).classroomTypeIds) (initialData as any).classroomTypeIds = [];
        if (!(initialData as any).requiredClassroomTagIds) (initialData as any).requiredClassroomTagIds = [];
        if (!(initialData as any).preferredTimeSlotIds) (initialData as any).preferredTimeSlotIds = [];
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
    
     // Autocomplete for UGS
    if (dataType === 'ugs' && name === 'code') {
        const codeValue = String(value);
        const matchedUgs = UGSN_FROM_OKSO.find(u => u.code === codeValue);
        setFormData((prev: any) => ({
            ...prev,
            code: codeValue,
            name: matchedUgs ? matchedUgs.name : prev.name
        }));
        return;
    }
    
    // Autocomplete for Specialties
    if (dataType === 'specialties' && name === 'code') {
        const codeValue = String(value);
        const matchedOkso = OKSO_CODES.find(o => o.code === codeValue);
        
        let updatedFormData = { ...formData, code: codeValue };

        if (matchedOkso) {
            updatedFormData.name = matchedOkso.name;
            const ugsPrefix = codeValue.substring(0, 2);
            const canonicalUgsData = UGSN_FROM_OKSO.find(u => u.code.startsWith(ugsPrefix));
            
            if (canonicalUgsData) {
                const existingUgs = ugs.find(u => u.code === canonicalUgsData.code);
                if (existingUgs) {
                    updatedFormData.ugsId = existingUgs.id;
                    setUgsNotFoundMessage(''); // Clear any warning
                } else {
                    setUgsNotFoundMessage(`Требуемая УГСН "${canonicalUgsData.name}" не найдена. Пожалуйста, сначала добавьте ее в справочник УГСН.`);
                }
            }
        } else {
             setUgsNotFoundMessage('');
        }
        setFormData(updatedFormData);
        return;
    }


    const numericFields = ['capacity', 'studentCount', 'course', 'hoursPerSemester', 'admissionYear', 'maxStudentCount', 'semester', 'examCapacity', 'area', 'priority'];
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

  const addQuickSubjectLink = () => {
    setFormData((prev: any) => ({
      ...prev,
      quickSubjectLinks: [
        ...(prev.quickSubjectLinks || []),
        { subjectId: subjects[0]?.id || '', classTypes: [ClassType.Lecture] },
      ],
    }));
  };

  const updateQuickSubjectLink = (index: number, patch: any) => {
    setFormData((prev: any) => {
      const links = [...(prev.quickSubjectLinks || [])];
      links[index] = { ...links[index], ...patch };
      return { ...prev, quickSubjectLinks: links };
    });
  };

  const toggleQuickSubjectClassType = (index: number, classType: ClassType) => {
    setFormData((prev: any) => {
      const links = [...(prev.quickSubjectLinks || [])];
      const currentTypes = links[index]?.classTypes || [];
      links[index] = {
        ...links[index],
        classTypes: currentTypes.includes(classType)
          ? currentTypes.filter((item: ClassType) => item !== classType)
          : [...currentTypes, classType],
      };
      return { ...prev, quickSubjectLinks: links };
    });
  };

  const removeQuickSubjectLink = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      quickSubjectLinks: (prev.quickSubjectLinks || []).filter((_: any, itemIndex: number) => itemIndex !== index),
    }));
  };
  
  const handleGridChange = (newGrid) => {
      setFormData((prev) => ({ ...prev, availabilityGrid: newGrid }));
  };

  // FIX: Refactored to use `selectedOptions` for better type safety and cleaner code when handling multi-select changes. This resolves an issue where item types were being inferred as 'unknown'.
  const handleMultiSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const { name, selectedOptions } = e.target;
      // FIX: Property 'value' does not exist on type 'unknown'. Explicitly type `option` to resolve this.
      const values = Array.from(selectedOptions).map((option: HTMLOptionElement) => option.value);

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
  
  // FIX: Proactively refactored this function to match the safer implementation of `handleMultiSelectChange`, using `selectedOptions` to prevent potential 'unknown' type errors.
  const handleClassroomRequirementsChange = (classType: ClassType, e: React.ChangeEvent<HTMLSelectElement>) => {
    const { selectedOptions } = e.target;
    // FIX: Property 'value' does not exist on type 'unknown'. Explicitly type `option` to resolve this.
    const values = Array.from(selectedOptions).map((option: HTMLOptionElement) => option.value);

    setFormData((prev: any) => ({
        ...prev,
        classroomTypeRequirements: {
            ...prev.classroomTypeRequirements,
            [classType]: values
        }
    }));
  };

  const handleTagCheckboxChange = (tagId: string) => {
    setFormData((prev: any) => {
        const currentTags = prev.tagIds || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter((id: string) => id !== tagId)
            : [...currentTags, tagId];
        return { ...prev, tagIds: newTags };
    });
  };
  
  const handleRequiredTagCheckboxChange = (tagId: string) => {
    setFormData((prev: any) => {
        const currentTags = prev.requiredClassroomTagIds || [];
        const newTags = currentTags.includes(tagId)
            ? currentTags.filter((id: string) => id !== tagId)
            : [...currentTags, tagId];
        return { ...prev, requiredClassroomTagIds: newTags };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  if (!isOpen) return null;
  
  const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";
  const showAvailabilityGrid = ['teachers', 'groups', 'classrooms'].includes(dataType);

  const renderDefaultField = (key: string, isFirst: boolean) => {
    if (key === 'id' || key === 'availabilityGrid' || key === 'entries' || key === 'teacherAssignments' || key === 'fieldOfScience' || key === 'tagIds' || key === 'requiredClassroomTagIds' || key === 'classroomTypeRequirements' || key === 'classroomTypeIds' || key === 'preferredTimeSlotIds') return null;
    
    const labelMap: Record<string, string> = {
        name: "ФИО / Название", number: "Номер/Название", time: "Время", capacity: "Вместимость", studentCount: "Кол-во студентов", 
        code: "Код", course: "Курс", oksoCode: "Код ОКСО", description: "Описание", date: "Дата",
        photoUrl: "URL Фотографии", regalia: "Регалии, звания", hireDate: "Дата приема на работу",
        hoursPerSemester: 'Часы за семестр', address: 'Адрес', phone: 'Телефон', email: 'Email', vkLink: 'Ссылка ВКонтакте',
        telegramLink: 'Ссылка Telegram', notes: 'Заметки', icon: 'Иконка', color: 'Цвет', shift: 'Смена'
    };

    if (key === 'shift') {
      const options = dataType === 'groups' ? SHIFT_LABELS : TIME_SLOT_SHIFT_LABELS;
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700">Смена</label>
          <select name="shift" value={formData.shift || (dataType === 'groups' ? 'both' : 'first')} onChange={handleChange} className={defaultInputClass}>
            {Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      );
    }
    
    if (key === 'color' && (dataType === 'teachers' || dataType === 'subjects' || dataType === 'classroomTags' || dataType === 'classroomTypes')) {
      return (
        <ColorPalettePicker
          label="Цветовая метка"
          value={formData[key] || ''}
          onChange={value => setFormData((prev: any) => ({ ...prev, [key]: value }))}
          allowEmpty={dataType !== 'classroomTypes'}
        />
      );
    }

    if (dataType === 'teachers') {
        if (key === 'photoUrl') {
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
        if (key === 'academicDegree') {
             return (
                 <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Ученая степень</label>
                        <select name="academicDegree" value={formData.academicDegree || ''} onChange={handleChange} className={defaultInputClass}>
                            <option value="">-- Не указана --</option>
                            {Object.values(AcademicDegree).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">Отрасль наук</label>
                        <select name="fieldOfScience" value={formData.fieldOfScience || ''} onChange={handleChange} className={defaultInputClass}>
                            <option value="">-- Не указана --</option>
                            {Object.entries(FieldOfScience).map(([key, value]) => <option key={key} value={value}>{value}</option>)}
                        </select>
                     </div>
                 </div>
             );
        }
         if (key === 'academicTitle') {
             return <div><label className="block text-sm font-medium text-gray-700">Ученое звание</label><select name="academicTitle" value={formData.academicTitle || ''} onChange={handleChange} className={defaultInputClass}><option value="">-- Не указано --</option>{Object.values(AcademicTitle).map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        }
    }

    if (key === 'description' || key === 'notes') {
        return <div><label className="block text-sm font-medium text-gray-700">{labelMap[key] || key}</label><textarea name={key} value={formData[key] || ''} onChange={handleChange} className={`${defaultInputClass} h-24`}/></div>
    }

    if (dataType === 'classroomTags' && key === 'icon') {
        return (
            <IconSelect
              label={labelMap[key] || key}
              value={formData.icon || 'BookmarkIcon'}
              onChange={value => setFormData((prev: any) => ({ ...prev, icon: value }))}
            />
        );
    }

    switch(key) {
      case 'facultyId': return (
          <div><label className="block text-sm font-medium text-gray-700">Факультет</label><select name="facultyId" value={formData.facultyId} onChange={handleChange} className={defaultInputClass}>{faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        );
      case 'deanId': return (
          <div><label className="block text-sm font-medium text-gray-700">Декан</label><select name="deanId" value={formData.deanId || ''} onChange={handleChange} className={defaultInputClass}><option value="">-- Не назначен --</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        );
      case 'departmentId': return (
          <div><label className="block text-sm font-medium text-gray-700">Кафедра</label><select name="departmentId" value={formData.departmentId} onChange={handleChange} className={defaultInputClass}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        );
       case 'headTeacherId': return (
          <div><label className="block text-sm font-medium text-gray-700">Заведующий кафедрой</label><select name="headTeacherId" value={formData.headTeacherId || ''} onChange={handleChange} className={defaultInputClass}><option value="">-- Не назначен --</option>{teachers.map(t => <option key={t.id} value={t.id}>{teacherDisplayNames.get(t.id)}</option>)}</select></div>
        );
      case 'ugsId': return (
          <div>
              <label className="block text-sm font-medium text-gray-700">УГСН</label>
              <select name="ugsId" value={formData.ugsId} onChange={handleChange} className={defaultInputClass}>
                {ugs.map(u => <option key={u.id} value={u.id}>{u.code} {u.name}</option>)}
              </select>
               {ugsNotFoundMessage && <p className="text-xs text-red-600 mt-1">{ugsNotFoundMessage}</p>}
          </div>
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
          <div><label className="block text-sm font-medium text-gray-700">Преподаватель</label><select name="teacherId" value={formData.teacherId} onChange={handleChange} className={defaultInputClass}>{teachers.map(t => <option key={t.id} value={t.id}>{teacherDisplayNames.get(t.id)}</option>)}</select></div>
        );
       case 'groupId': return (
          <div><label className="block text-sm font-medium text-gray-700">Группа</label><select name="groupId" value={formData.groupId} onChange={handleChange} className={defaultInputClass}>{groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}</select></div>
        );
      case 'pinnedClassroomId': return (
           <div><label className="block text-sm font-medium text-gray-700">Закрепленная аудитория</label><select name="pinnedClassroomId" value={formData.pinnedClassroomId} onChange={handleChange} className={defaultInputClass}><option value="">Нет</option>{classrooms.map(c => <option key={c.id} value={c.id}>{c.number} ({classroomTypes.find(ct => ct.id === c.typeId)?.name})</option>)}</select></div>
        );
      case 'classType':
        if (dataType === 'electives') {
          return (
            <div>
              <label className="block text-sm font-medium text-gray-700">Тип занятия</label>
              <select name="classType" value={formData.classType || ClassType.Elective} onChange={handleChange} className={defaultInputClass}>
                {[ClassType.Elective, ClassType.Lecture, ClassType.Practical, ClassType.Lab, ClassType.Consultation].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          );
        }
        return null;
      case 'deliveryMode':
        if (dataType === 'electives') {
          return (
            <div>
              <label className="block text-sm font-medium text-gray-700">Формат проведения</label>
              <select name="deliveryMode" value={formData.deliveryMode || DeliveryMode.Offline} onChange={handleChange} className={defaultInputClass}>
                {Object.values(DeliveryMode).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          );
        }
        return null;
      case 'specialtyIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Специальности (Ctrl/Cmd)</label><select multiple name="specialtyIds" value={formData.specialtyIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</select></div>
        );
      case 'groupIds': return (
          <div><label className="block text-sm font-medium text-gray-700">Группы в потоке (Ctrl/Cmd)</label><p className="text-xs text-gray-500 mb-1">Можно выбрать только группы одного курса.</p><select multiple name="groupIds" value={formData.groupIds} onChange={handleMultiSelectChange} className={`${defaultInputClass} h-32`}>{groups.map(g => <option key={g.id} value={g.id} disabled={selectedCourseForStream !== null && g.course !== selectedCourseForStream}>{g.number} ({g.course} курс)</option>)}</select></div>
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
        case 'code':
            if (dataType === 'ugs') {
                return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="ugsCode">Код</label>
                        <input list="ugs-codes" id="ugsCode" name="code" value={formData.code || ''} onChange={handleChange} className={defaultInputClass} ref={isFirst ? firstInputRef : null} />
                        <datalist id="ugs-codes">
                           {UGSN_FROM_OKSO.map(u => <option key={u.code} value={u.code}>{u.name}</option>)}
                        </datalist>
                    </div>
                );
            }
            if (dataType === 'specialties') {
                 return (
                    <div>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="specialtyCode">Код</label>
                        <input list="okso-codes" id="specialtyCode" name="code" value={formData.code || ''} onChange={handleChange} className={defaultInputClass} ref={isFirst ? firstInputRef : null} />
                        <datalist id="okso-codes">
                            {OKSO_CODES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </datalist>
                    </div>
                );
            }
            // Fallthrough for other types
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

  const fields = Object.keys(getInitialFormData(dataType));
  const hiddenLayoutFields = ['id', 'availabilityGrid', 'entries', 'teacherAssignments', 'quickSubjectLinks', 'notes', 'description', 'specialtyIds', 'groupIds', 'classroomTypeRequirements', 'classroomTypeIds', 'preferredTimeSlotIds', 'requiredClassroomTagIds'];
  const half = Math.ceil(fields.filter(f => !['id', 'availabilityGrid', 'entries', 'teacherAssignments', 'quickSubjectLinks', 'notes'].includes(f)).length / 2);

  const column1Fields = fields.filter(f => !hiddenLayoutFields.includes(f)).slice(0, half);
  const column2Fields = fields.filter(f => !hiddenLayoutFields.includes(f)).slice(half);
  const fullWidthFields = fields.filter(f => ['notes', 'description', 'specialtyIds', 'groupIds'].includes(f));


  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animation-fade-in-scale">
        <h2 className="text-xl font-bold mb-4 text-gray-900">{modalTitle}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              {column1Fields.map((key, index) => <div key={key}>{renderDefaultField(key, index === 0)}</div>)}
            </div>
            <div className="space-y-4">
              {column2Fields.map((key) => <div key={key}>{renderDefaultField(key, false)}</div>)}
            </div>
          </div>
          <div className="space-y-4">
             {fullWidthFields.map((key) => <div key={key}>{renderDefaultField(key, false)}</div>)}
          </div>
          
          {dataType === 'subjects' && (
            <div className="pt-4 border-t">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Требования к типам аудиторий</h3>
              <div className="space-y-3">
                {[ClassType.Lecture, ClassType.Practical, ClassType.Lab, ClassType.Elective, ClassType.Consultation, ClassType.PracticeConsultation, ClassType.PracticeDefense].map(classType => (
                  <div key={classType}>
                    <label className="block text-sm font-medium text-gray-700">{classType}</label>
                    <select
                      multiple
                      value={formData.classroomTypeRequirements?.[classType] || []}
                      onChange={e => handleClassroomRequirementsChange(classType, e)}
                      className={`${defaultInputClass} h-24`}
                    >
                      {classroomTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dataType === 'teachers' && (
            <div className="pt-4 border-t">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-lg font-medium text-gray-800">Быстрые привязки к предметам</h3>
                  <p className="text-sm text-gray-500">Сразу закрепите преподавателя за дисциплинами и типами занятий.</p>
                </div>
                <button
                  type="button"
                  onClick={addQuickSubjectLink}
                  disabled={subjects.length === 0}
                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  <PlusIcon className="w-4 h-4" />
                  Добавить
                </button>
              </div>
              {subjects.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-md p-3">Сначала добавьте дисциплины в справочнике предметов.</p>
              ) : (
                <div className="space-y-3">
                  {(formData.quickSubjectLinks || []).map((link: any, index: number) => (
                    <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr),minmax(0,1.3fr),auto] gap-3 items-start">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Дисциплина</label>
                          <select
                            value={link.subjectId || ''}
                            onChange={e => updateQuickSubjectLink(index, { subjectId: e.target.value })}
                            className={defaultInputClass}
                          >
                            {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Типы занятий</label>
                          <div className="flex flex-wrap gap-2">
                            {[ClassType.Lecture, ClassType.Practical, ClassType.Lab, ClassType.Consultation, ClassType.PracticeConsultation, ClassType.PracticeDefense, ClassType.Test, ClassType.Exam].map(classType => (
                              <label key={classType} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-700 cursor-pointer hover:border-blue-300">
                                <input
                                  type="checkbox"
                                  checked={(link.classTypes || []).includes(classType)}
                                  onChange={() => toggleQuickSubjectClassType(index, classType)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                {classType}
                              </label>
                            ))}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeQuickSubjectLink(index)} className="p-2 text-red-500 hover:text-red-700 justify-self-end" title="Удалить привязку">
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {(formData.quickSubjectLinks || []).length === 0 && (
                    <p className="text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-300 rounded-md p-3">Привязок пока нет. Нажмите «Добавить», чтобы закрепить предмет.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {dataType === 'electives' && (
            <div className="pt-4 border-t space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-2">Параметры планирования факультатива</h3>
                <label className="block text-sm font-medium text-gray-700">Допустимые типы аудиторий</label>
                <select
                  multiple
                  name="classroomTypeIds"
                  value={formData.classroomTypeIds || []}
                  onChange={handleMultiSelectChange}
                  className={`${defaultInputClass} h-28`}
                >
                  {classroomTypes.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Если не выбрать типы, генератор возьмет требования из дисциплины.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Предпочтительные слоты звонков</label>
                <select
                  multiple
                  name="preferredTimeSlotIds"
                  value={formData.preferredTimeSlotIds || []}
                  onChange={handleMultiSelectChange}
                  className={`${defaultInputClass} h-28`}
                >
                  {timeSlots.map(slot => <option key={slot.id} value={slot.id}>{slot.time}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">Это мягкое предпочтение: при нехватке ресурсов генератор сможет поставить занятие в другой слот.</p>
              </div>
            </div>
          )}

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
                      {teachers.map(t => <option key={t.id} value={t.id}>{teacherDisplayNames.get(t.id)}</option>)}
                    </select>
                    <select value={assignment.classType} onChange={e => handleAssignmentChange(index, 'classType', e.target.value)} className={defaultInputClass}>
                      {[ClassType.Practical, ClassType.Lab, ClassType.Consultation, ClassType.PracticeConsultation, ClassType.PracticeDefense].map(ct => <option key={ct} value={ct}>{ct}</option>)}
                    </select>
                    <button type="button" onClick={() => removeAssignment(index)} className="p-2 text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addAssignment} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить назначение</button>
            </div>
          )}

           {dataType === 'classrooms' && (
                <div className="pt-4 border-t">
                    <label className="block text-sm font-medium text-gray-700">Теги аудитории</label>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border p-3 rounded-md bg-gray-50">
                        {classroomTags.length > 0 ? classroomTags.map(tag => (
                            <label key={tag.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={(formData.tagIds || []).includes(tag.id)}
                                    onChange={() => handleTagCheckboxChange(tag.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <div className={`w-4 h-4 rounded-sm ${COLOR_MAP[tag.color]?.bg || 'bg-gray-200'} border ${COLOR_MAP[tag.color]?.border || 'border-gray-300'}`}></div>
                                {renderIcon(tag.icon, { className: "w-4 h-4 text-gray-600" })}
                                <span>{tag.name}</span>
                            </label>
                        )) : <p className="text-xs text-gray-500">Сначала добавьте теги в справочнике "Теги аудиторий".</p>}
                    </div>
                </div>
           )}
           
          {(dataType === 'subjects' || dataType === 'electives') && (
              <div className="pt-4 border-t">
                  <label className="block text-sm font-medium text-gray-700">Обязательные теги аудитории</label>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border p-3 rounded-md bg-gray-50">
                      {classroomTags.length > 0 ? classroomTags.map(tag => (
                          <label key={tag.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 cursor-pointer">
                              <input
                                  type="checkbox"
                                  checked={(formData.requiredClassroomTagIds || []).includes(tag.id)}
                                  onChange={() => handleRequiredTagCheckboxChange(tag.id)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className={`w-4 h-4 rounded-sm ${COLOR_MAP[tag.color]?.bg || 'bg-gray-200'} border ${COLOR_MAP[tag.color]?.border || 'border-gray-300'}`}></div>
                              {renderIcon(tag.icon, { className: "w-4 h-4 text-gray-600" })}
                              <span>{tag.name}</span>
                          </label>
                      )) : <p className="text-xs text-gray-500">Сначала добавьте теги в справочнике "Теги аудиторий".</p>}
                  </div>
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
