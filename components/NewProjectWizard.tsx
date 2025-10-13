import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../hooks/useStore';
import { SchedulingSettings, TimeSlot, Faculty, Department, UGS, Specialty, ClassroomType, Classroom } from '../types';
import { toYYYYMMDD } from '../utils/dateUtils';
import { TrashIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CheckCircleIcon } from './icons';
import DatePicker from './DatePicker';
import { OKSO_CODES, UGSN_FROM_OKSO } from '../data/codes';


interface NewProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const generateId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`;

const defaultInputClass = "w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition";
const smallButtonClass = "p-2 bg-gray-200 hover:bg-gray-300 rounded text-gray-600 transition-colors flex-shrink-0";

// Memoized components to prevent re-rendering and losing focus on input
const MemoizedTimeSlotRow = React.memo(({ ts, index, onUpdate, onRemove }: { ts: TimeSlot, index: number, onUpdate: (index: number, field: keyof TimeSlot, value: any) => void, onRemove: (index: number) => void }) => (
    <div className="flex items-center gap-2">
        <input type="text" placeholder="HH:MM-HH:MM" value={ts.time} onChange={e => onUpdate(index, 'time', e.target.value)} className={defaultInputClass} />
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedClassroomTypeRow = React.memo(({ ct, index, onUpdate, onRemove }: { ct: ClassroomType, index: number, onUpdate: (index: number, field: keyof ClassroomType, value: any) => void, onRemove: (index: number) => void }) => (
     <div className="flex items-center gap-2 mb-2">
        <input type="text" placeholder="Название типа" value={ct.name} onChange={e => onUpdate(index, 'name', e.target.value)} className={defaultInputClass} />
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedClassroomRow = React.memo(({ c, index, onUpdate, onRemove, types }: { c: Classroom, index: number, onUpdate: (index: number, field: keyof Classroom, value: any) => void, onRemove: (index: number) => void, types: ClassroomType[] }) => (
    <div className="grid grid-cols-[2fr,1fr,2fr,auto] gap-2 items-center mb-2">
        <input type="text" placeholder="Номер аудитории" value={c.number} onChange={e => onUpdate(index, 'number', e.target.value)} className={defaultInputClass} />
        <input type="number" placeholder="Мест" value={c.capacity} onChange={e => onUpdate(index, 'capacity', Number(e.target.value))} className={defaultInputClass} min="1" />
        <select value={c.typeId} onChange={e => onUpdate(index, 'typeId', e.target.value)} className={defaultInputClass}>
          <option value="" disabled>-- Тип --</option>
          {types.map(ct => ct.name && <option key={ct.id} value={ct.id}>{ct.name}</option>)}
        </select>
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedFacultyRow = React.memo(({ f, index, onUpdate, onRemove }: { f: Faculty, index: number, onUpdate: (index: number, field: keyof Faculty, value: any) => void, onRemove: (index: number) => void }) => (
    <div className="flex items-center gap-2 mb-2">
        <input type="text" placeholder="Название факультета" value={f.name} onChange={e => onUpdate(index, 'name', e.target.value)} className={defaultInputClass} />
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedDepartmentRow = React.memo(({ d, index, onUpdate, onRemove, faculties }: { d: Department, index: number, onUpdate: (index: number, field: keyof Department, value: any) => void, onRemove: (index: number) => void, faculties: Faculty[] }) => (
    <div className="grid grid-cols-[1fr,1fr,auto] gap-2 items-center mb-2">
        <input type="text" placeholder="Название кафедры" value={d.name} onChange={e => onUpdate(index, 'name', e.target.value)} className={defaultInputClass} />
        <select value={d.facultyId} onChange={e => onUpdate(index, 'facultyId', e.target.value)} className={defaultInputClass}>
            <option value="" disabled>-- Факультет --</option>
            {faculties.map(f => f.name && <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedUgsRow = React.memo(({ u, index, onUpdate, onRemove }: { u: UGS, index: number, onUpdate: (index: number, field: keyof UGS, value: any) => void, onRemove: (index: number) => void }) => (
    <div className="grid grid-cols-[1fr,3fr,auto] gap-2 mb-2">
        <input type="text" placeholder="Код (XX.XX.XX)" value={u.code} onChange={e => onUpdate(index, 'code', e.target.value)} className={defaultInputClass} />
        <input type="text" placeholder="Название УГСН" value={u.name} onChange={e => onUpdate(index, 'name', e.target.value)} className={defaultInputClass} />
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));

const MemoizedSpecialtyRow = React.memo(({ s, index, onUpdate, onRemove, ugsList }: { s: Specialty, index: number, onUpdate: (index: number, field: keyof Specialty, value: any) => void, onRemove: (index: number) => void, ugsList: UGS[] }) => (
    <div className="grid grid-cols-[1fr,3fr,2fr,auto] gap-2 mb-2">
        <input type="text" list="okso-codes-datalist" placeholder="Код" value={s.code} onChange={e => onUpdate(index, 'code', e.target.value)} className={defaultInputClass} />
        <datalist id="okso-codes-datalist">
            {OKSO_CODES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </datalist>
        <input type="text" placeholder="Название специальности" value={s.name} onChange={e => onUpdate(index, 'name', e.target.value)} className={defaultInputClass} />
        <select value={s.ugsId} onChange={e => onUpdate(index, 'ugsId', e.target.value)} className={defaultInputClass}>
            <option value="" disabled>-- УГСН --</option>
            {ugsList.map(u => u.name && <option key={u.id} value={u.id}>{u.code} {u.name}</option>)}
        </select>
        <button type="button" onClick={() => onRemove(index)} className={smallButtonClass}><TrashIcon className="w-4 h-4" /></button>
    </div>
));


const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ isOpen, onClose }) => {
    const { clearAllData, loadFullState } = useStore();
    const [step, setStep] = useState(1);
    
    // State for all wizard data
    const [settings, setSettings] = useState<SchedulingSettings>({
        semesterStart: toYYYYMMDD(new Date()),
        semesterEnd: toYYYYMMDD(new Date(new Date().setMonth(new Date().getMonth() + 4))),
        sessionStart: '', sessionEnd: '', practiceStart: '', practiceEnd: '', retakeStart: '', retakeEnd: '',
        defaultBreakMinutes: 15, allowWindows: true, useEvenOddWeekSeparation: true, showDegreeInSchedule: false,
        respectProductionCalendar: true, useShortenedPreHolidaySchedule: true, allowOverbooking: false,
        // FIX: Added missing 'showTeacherDetailsInLists' property to match the SchedulingSettings type.
        showTeacherDetailsInLists: false
    });
    const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([{ id: generateId('ts'), time: '08:30-10:00' }]);
    const [faculties, setFaculties] = useState<Faculty[]>([{ id: generateId('f'), name: '' }]);
    const [departments, setDepartments] = useState<Department[]>([{ id: generateId('d'), name: '', facultyId: '' }]);
    const [ugs, setUgs] = useState<UGS[]>([{ id: generateId('ugs'), code: '', name: '' }]);
    const [specialties, setSpecialties] = useState<Specialty[]>([{ id: generateId('spec'), code: '', name: '', ugsId: '' }]);
    const [classroomTypes, setClassroomTypes] = useState<ClassroomType[]>([
        { id: generateId('ct'), name: 'Лекционная' }, { id: generateId('ct'), name: 'Практическая' }, { id: generateId('ct'), name: 'Компьютерный класс' },
    ]);
    const [classrooms, setClassrooms] = useState<Classroom[]>([{ id: generateId('c'), number: '', capacity: 30, typeId: classroomTypes[0]?.id || '' }]);
    
    // Date picker state
    const [isStartDatePickerOpen, setStartDatePickerOpen] = useState(false);
    const [isEndDatePickerOpen, setEndDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
                setStartDatePickerOpen(false);
                setEndDatePickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSave = () => {
        if (!window.confirm("Создать новый проект? Все текущие несохраненные данные будут удалены.")) return;

        const finalState = {
            settings, timeSlots, faculties: faculties.filter(f => f.name.trim()), departments: departments.filter(d => d.name.trim()), 
            ugs: ugs.filter(u => u.name.trim()), specialties: specialties.filter(s => s.name.trim()), classrooms: classrooms.filter(c => c.number.trim()), 
            classroomTypes: classroomTypes.filter(ct => ct.name.trim()),
            teachers: [], groups: [], streams: [], subjects: [], cabinets: [], schedule: [], unscheduledEntries: [],
            teacherSubjectLinks: [], schedulingRules: [], productionCalendar: [], educationalPlans: [], scheduleTemplates: [],
            subgroups: [], electives: [], timeSlotsShortened: []
        };
        
        clearAllData();
        loadFullState(finalState);
        onClose();
    };
    
    // Generic, stable update handlers using useCallback to prevent focus loss
    const createUpdateHandler = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) => 
        useCallback((index: number, field: keyof T, value: any) => {
            setter(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
        }, []);
    
    const createAddHandler = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, newItemFactory: () => T) =>
        useCallback(() => {
            setter(prev => [...prev, newItemFactory()]);
        }, [newItemFactory]);

    const createRemoveHandler = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
        useCallback((index: number) => {
            setter(prev => prev.filter((_, i) => i !== index));
        }, []);
        
    // TimeSlots
    const updateTimeSlot = createUpdateHandler(setTimeSlots);
    const removeTimeSlot = createRemoveHandler(setTimeSlots);
    const addTimeSlot = createAddHandler(setTimeSlots, () => ({ id: generateId('ts'), time: '' }));

    // Faculties
    const updateFaculty = createUpdateHandler(setFaculties);
    const removeFaculty = createRemoveHandler(setFaculties);
    const addFaculty = createAddHandler(setFaculties, () => ({ id: generateId('f'), name: '' }));

    // Departments
    const updateDepartment = createUpdateHandler(setDepartments);
    const removeDepartment = createRemoveHandler(setDepartments);
    const addDepartment = useCallback(() => {
        setDepartments(prev => [...prev, { id: generateId('d'), name: '', facultyId: faculties.find(f => f.name.trim() !== '')?.id || '' }]);
    }, [faculties]);

    // UGS
    const updateUgs = createUpdateHandler(setUgs);
    const removeUgs = createRemoveHandler(setUgs);
    const addUgs = createAddHandler(setUgs, () => ({ id: generateId('ugs'), code: '', name: '' }));

    // Specialties (with special OKSO logic)
    const updateSpecialty = useCallback((index: number, field: keyof Specialty, value: any) => {
        if (field === 'code') {
            const codeValue = String(value);
            const matchedOkso = OKSO_CODES.find(o => o.code === codeValue);

            if (matchedOkso) {
                const ugsPrefix = codeValue.substring(0, 2);
                const canonicalUgsData = UGSN_FROM_OKSO.find(u => u.code.startsWith(ugsPrefix));

                setUgs(prevUgs => {
                    let newUgsList = [...prevUgs];
                    let targetUgsId: string | undefined;

                    if (canonicalUgsData) {
                        const existingUgs = newUgsList.find(u => u.code === canonicalUgsData.code);
                        if (existingUgs) {
                            targetUgsId = existingUgs.id;
                        } else if (canonicalUgsData.name.trim()) {
                            const newUgs = { id: generateId('ugs'), code: canonicalUgsData.code, name: canonicalUgsData.name };
                            targetUgsId = newUgs.id;
                            newUgsList = [...newUgsList.filter(u => u.name.trim() || u.code.trim()), newUgs];
                        }
                    }

                    setSpecialties(prevSpecialties => 
                        prevSpecialties.map((item, i) => 
                            i === index ? {
                                ...item,
                                code: codeValue,
                                name: matchedOkso.name,
                                ugsId: targetUgsId || item.ugsId
                            } : item
                        )
                    );
                    
                    return newUgsList;
                });
            } else {
                 setSpecialties(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
            }
        } else {
             setSpecialties(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
        }
    }, []);
    
    const removeSpecialty = createRemoveHandler(setSpecialties);
    const addSpecialty = useCallback(() => {
        setSpecialties(prev => [...prev, { id: generateId('spec'), code: '', name: '', ugsId: ugs.find(u => u.name.trim() !== '')?.id || '' }]);
    }, [ugs]);
    
    // Classroom Types
    const updateClassroomType = createUpdateHandler(setClassroomTypes);
    const removeClassroomType = createRemoveHandler(setClassroomTypes);
    const addClassroomType = createAddHandler(setClassroomTypes, () => ({ id: generateId('ct'), name: '' }));

    // Classrooms
    const updateClassroom = createUpdateHandler(setClassrooms);
    const removeClassroom = createRemoveHandler(setClassrooms);
    const addClassroom = useCallback(() => {
        setClassrooms(prev => [...prev, { id: generateId('c'), number: '', capacity: 30, typeId: classroomTypes[0]?.id || '' }]);
    }, [classroomTypes]);

    
     const isStepValid = useMemo(() => {
        switch (step) {
            case 1:
                return settings.semesterStart && settings.semesterEnd && new Date(settings.semesterStart) < new Date(settings.semesterEnd) && timeSlots.every(ts => ts.time.trim() !== '' && ts.time.includes('-'));
            case 2:
                return faculties.every(f => f.name.trim() !== '') && departments.every(d => d.name.trim() !== '' && d.facultyId);
            case 3:
                return ugs.every(u => u.code.trim() !== '' && u.name.trim() !== '') && specialties.every(s => s.code.trim() !== '' && s.name.trim() !== '' && s.ugsId);
            case 4:
                 return classroomTypes.every(ct => ct.name.trim() !== '') && classrooms.every(c => c.number.trim() !== '' && c.capacity > 0 && c.typeId);
            default:
                return false;
        }
    }, [step, settings, timeSlots, faculties, departments, ugs, specialties, classroomTypes, classrooms]);

    if (!isOpen) return null;
    
    const steps = ["Настройки", "Структура", "Программы", "Ресурсы"];
    
    const Section: React.FC<{title: string; children: React.ReactNode}> = ({title, children}) => (
        <div className="pt-6 border-t first:pt-0 first:border-t-0">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">{title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-40">
            <div className="bg-gray-50 p-6 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <h2 className="text-2xl font-bold text-gray-900">Мастер создания нового проекта</h2>
                
                 <div className="my-6">
                    <div className="flex items-center">
                        {steps.map((s, index) => (
                            <React.Fragment key={s}>
                                <div className="flex items-center">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white transition-colors ${step > index + 1 ? 'bg-green-500' : step === index + 1 ? 'bg-blue-600' : 'bg-gray-400'}`}>
                                        {step > index + 1 ? <CheckCircleIcon className="w-5 h-5"/> : index + 1}
                                    </div>
                                    <p className={`ml-2 font-medium transition-colors ${step >= index + 1 ? 'text-gray-800' : 'text-gray-500'}`}>{s}</p>
                                </div>
                                {index < steps.length - 1 && <div className={`flex-auto border-t-2 transition-colors mx-4 ${step > index + 1 ? 'border-green-500' : 'border-gray-300'}`}></div>}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="overflow-y-auto pr-4 flex-grow space-y-6">
                   {step === 1 && (
                     <Section title="1. Основные настройки">
                        <div className="grid grid-cols-2 gap-4 relative" ref={datePickerRef}>
                            <div>
                                <label className="text-sm font-medium">Начало семестра</label>
                                <button type="button" onClick={() => { setStartDatePickerOpen(p => !p); setEndDatePickerOpen(false); }} className={`${defaultInputClass} text-left flex justify-between items-center`}>
                                    {new Date(settings.semesterStart + 'T00:00:00').toLocaleDateString('ru-RU')} <CalendarIcon className="w-5 h-5 text-gray-500"/>
                                </button>
                                {isStartDatePickerOpen && <DatePicker selectedDate={new Date(settings.semesterStart)} onSelect={date => { setSettings({...settings, semesterStart: toYYYYMMDD(date)}); setStartDatePickerOpen(false); }} onClose={() => setStartDatePickerOpen(false)} />}
                            </div>
                            <div>
                                <label className="text-sm font-medium">Конец семестра</label>
                                <button type="button" onClick={() => { setEndDatePickerOpen(p => !p); setStartDatePickerOpen(false); }} className={`${defaultInputClass} text-left flex justify-between items-center`}>
                                     {new Date(settings.semesterEnd + 'T00:00:00').toLocaleDateString('ru-RU')} <CalendarIcon className="w-5 h-5 text-gray-500"/>
                                </button>
                                {isEndDatePickerOpen && <DatePicker selectedDate={new Date(settings.semesterEnd)} onSelect={date => { setSettings({...settings, semesterEnd: toYYYYMMDD(date)}); setEndDatePickerOpen(false); }} onClose={() => setEndDatePickerOpen(false)} />}
                            </div>
                        </div>
                        <div className="pt-4 border-t">
                             <h4 className="font-medium mb-2">Расписание звонков</h4>
                             {timeSlots.map((ts, index) => <MemoizedTimeSlotRow key={ts.id} ts={ts} index={index} onUpdate={updateTimeSlot} onRemove={removeTimeSlot} />)}
                             <button type="button" onClick={addTimeSlot} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить слот</button>
                        </div>
                    </Section>
                   )}

                   {step === 2 && (
                    <Section title="2. Структура университета">
                        <div>
                            <h4 className="font-medium mb-2">Факультеты</h4>
                            {faculties.map((f, index) => <MemoizedFacultyRow key={f.id} f={f} index={index} onUpdate={updateFaculty} onRemove={removeFaculty} /> )}
                            <button type="button" onClick={addFaculty} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить факультет</button>
                        </div>
                        <div className="pt-4 border-t">
                            <h4 className="font-medium mb-2">Кафедры</h4>
                            {!faculties.some(f => f.name.trim() !== '') && (
                                <p className="text-sm text-yellow-700 bg-yellow-100 p-2 rounded-md mb-2">
                                    Сначала добавьте хотя бы один факультет, чтобы создавать кафедры.
                                </p>
                            )}
                            {departments.map((d, index) => <MemoizedDepartmentRow key={d.id} d={d} index={index} onUpdate={updateDepartment} onRemove={removeDepartment} faculties={faculties} /> )}
                            <button type="button" onClick={addDepartment} disabled={!faculties.some(f => f.name.trim() !== '')} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1 disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"><PlusIcon className="w-4 h-4"/>Добавить кафедру</button>
                        </div>
                    </Section>
                   )}

                   {step === 3 && (
                    <Section title="3. Направления подготовки">
                        <div>
                            <h4 className="font-medium mb-2">УГСН (Укрупненные группы специальностей)</h4>
                            {ugs.map((u, index) => <MemoizedUgsRow key={u.id} u={u} index={index} onUpdate={updateUgs} onRemove={removeUgs} />)}
                            <button type="button" onClick={addUgs} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить УГСН</button>
                        </div>
                        <div className="pt-4 border-t">
                            <h4 className="font-medium mb-2">Специальности</h4>
                            <p className="text-xs text-gray-500 mb-2">При вводе кода специальности из справочника ОКСО, название и УГСН подставятся автоматически.</p>
                            {specialties.map((s, index) => <MemoizedSpecialtyRow key={s.id} s={s} index={index} onUpdate={updateSpecialty} onRemove={removeSpecialty} ugsList={ugs} />)}
                            <button type="button" onClick={addSpecialty} className="mt-2 text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить специальность</button>
                        </div>
                    </Section>
                   )}

                   {step === 4 && (
                     <Section title="4. Аудиторный фонд">
                         <div>
                            <h4 className="font-medium mb-2">Типы аудиторий</h4>
                             {classroomTypes.map((ct, index) => <MemoizedClassroomTypeRow key={ct.id} ct={ct} index={index} onUpdate={updateClassroomType} onRemove={removeClassroomType} /> )}
                             <button type="button" onClick={addClassroomType} className="text-sm text-blue-600 hover:underline flex items-center gap-1"><PlusIcon className="w-4 h-4"/>Добавить тип</button>
                         </div>
                         <div className="pt-4 border-t">
                            <h4 className="font-medium mb-2">Аудитории</h4>
                             {classrooms.map((c, index) => <MemoizedClassroomRow key={c.id} c={c} index={index} onUpdate={updateClassroom} onRemove={removeClassroom} types={classroomTypes} /> )}
                             <button type="button" onClick={addClassroom} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-2"><PlusIcon className="w-4 h-4"/>Добавить аудиторию</button>
                         </div>
                    </Section>
                   )}
                </div>

                 <div className="flex justify-between items-center mt-6 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition-colors">Отмена</button>
                    <div className="flex items-center gap-4">
                        {step > 1 && (
                            <button type="button" onClick={() => setStep(s => s - 1)} className="px-6 py-2 bg-white text-gray-800 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors flex items-center gap-2">
                                <ChevronLeftIcon className="w-5 h-5"/> Назад
                            </button>
                        )}
                        {step < steps.length ? (
                            <button type="button" onClick={() => setStep(s => s + 1)} disabled={!isStepValid} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-blue-300 disabled:cursor-not-allowed">
                                Далее <ChevronRightIcon className="w-5 h-5"/>
                            </button>
                        ) : (
                             <button type="button" onClick={handleSave} disabled={!isStepValid} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-300 disabled:cursor-not-allowed">
                                Создать проект
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewProjectWizard;