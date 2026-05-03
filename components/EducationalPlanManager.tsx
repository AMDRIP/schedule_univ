import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import {
    Specialty,
    EducationalPlan,
    EducationalPlanTemplate,
    PlanEntry,
    PlanBlock,
    Subject,
    AttestationType,
    TeacherSubjectLink,
    ClassType,
    FormOfStudy,
} from '../types';
import { PlusIcon, EditIcon, TrashIcon, BookOpenIcon, CopyIcon, DocumentTextIcon } from './icons';
import { formatSemesterCourse } from '../utils/semesterUtils';

const UNASSIGNED_BLOCK_ID = '__unassigned__';
const BLOCK_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be123c', '#4b5563'];
const BINDING_CLASS_TYPES = [ClassType.Lecture, ClassType.Practical, ClassType.Lab, ClassType.Consultation];

const createLocalId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface TeacherBindingDraft {
    teacherId: string;
    classTypes: ClassType[];
}

interface PlanEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: PlanEntry, newSubjectName?: string, bindings?: TeacherBindingDraft[]) => void;
    entry: PlanEntry | null;
    blocks: PlanBlock[];
}

const PlanEntryModal: React.FC<PlanEntryModalProps> = ({ isOpen, onClose, onSave, entry, blocks }) => {
    const { subjects, teachers, teacherSubjectLinks } = useStore();
    const [subjectSelection, setSubjectSelection] = useState<'existing' | 'new'>('existing');
    const [newSubjectName, setNewSubjectName] = useState('');
    const [bindTeacher, setBindTeacher] = useState(false);
    const [teacherBindings, setTeacherBindings] = useState<TeacherBindingDraft[]>([]);
    const firstInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<Omit<PlanEntry, 'subjectId'> & { subjectId?: string }>({
        subjectId: subjects[0]?.id || '',
        blockId: blocks[0]?.id || '',
        semester: 1,
        lectureHours: 0,
        practiceHours: 0,
        labHours: 0,
        attestation: AttestationType.Test,
        splitForSubgroups: false,
    });

    useEffect(() => {
        if (isOpen && firstInputRef.current) {
            setTimeout(() => firstInputRef.current?.focus(), 100);
        }

        if (entry) {
            setFormData({ ...entry, blockId: entry.blockId || '' });
            setSubjectSelection('existing');
            const existingLinks = teacherSubjectLinks.filter(link => link.subjectId === entry.subjectId);
            setBindTeacher(existingLinks.length > 0);
            setTeacherBindings(existingLinks.length > 0
                ? existingLinks.map(link => ({
                    teacherId: link.teacherId,
                    classTypes: link.classTypes?.length ? link.classTypes : [ClassType.Lecture],
                }))
                : [{ teacherId: teachers[0]?.id || '', classTypes: [ClassType.Lecture] }]
            );
        } else {
            setFormData({
                subjectId: subjects[0]?.id || '',
                blockId: blocks[0]?.id || '',
                semester: 1,
                lectureHours: 0,
                practiceHours: 0,
                labHours: 0,
                attestation: AttestationType.Test,
                splitForSubgroups: false,
            });
            setSubjectSelection('existing');
            setNewSubjectName('');
            setBindTeacher(false);
            setTeacherBindings([{ teacherId: teachers[0]?.id || '', classTypes: [ClassType.Lecture] }]);
        }
    }, [entry, subjects, teachers, teacherSubjectLinks, blocks, isOpen]);

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

    const updateTeacherBinding = (index: number, patch: Partial<TeacherBindingDraft>) => {
        setTeacherBindings(prev => prev.map((binding, itemIndex) => itemIndex === index ? { ...binding, ...patch } : binding));
    };

    const addTeacherBinding = () => {
        setTeacherBindings(prev => [...prev, { teacherId: teachers[0]?.id || '', classTypes: [ClassType.Lecture] }]);
    };

    const removeTeacherBinding = (index: number) => {
        setTeacherBindings(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    };

    const toggleBindingClassType = (index: number, classType: ClassType) => {
        setTeacherBindings(prev => prev.map((binding, itemIndex) => {
            if (itemIndex !== index) return binding;
            const classTypes = binding.classTypes.includes(classType)
                ? binding.classTypes.filter(item => item !== classType)
                : [...binding.classTypes, classType];
            return { ...binding, classTypes };
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalEntry: PlanEntry = {
            subjectId: subjectSelection === 'new' ? '' : formData.subjectId!,
            blockId: formData.blockId || undefined,
            semester: formData.semester,
            lectureHours: formData.lectureHours,
            practiceHours: formData.practiceHours,
            labHours: formData.labHours,
            attestation: formData.attestation,
            splitForSubgroups: formData.splitForSubgroups,
        };
        const bindings = bindTeacher
            ? teacherBindings.filter(binding => binding.teacherId && binding.classTypes.length > 0)
            : undefined;
        onSave(finalEntry, subjectSelection === 'new' ? newSubjectName.trim() : undefined, bindings);
    };

    if (!isOpen) return null;
    const defaultInputClass = 'w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition';

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl animation-fade-in-scale max-h-[90vh] overflow-y-auto">
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Блок дисциплин</label>
                        <select name="blockId" value={formData.blockId || ''} onChange={handleChange} className={defaultInputClass}>
                            <option value="">Без блока</option>
                            {blocks.map(block => <option key={block.id} value={block.id}>{block.name}</option>)}
                        </select>
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
                        <input type="checkbox" name="splitForSubgroups" id="splitForSubgroups" checked={!!formData.splitForSubgroups} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <label htmlFor="splitForSubgroups" className="ml-2 block text-sm font-medium text-gray-700">Разделить по подгруппам для практик/лабораторных</label>
                    </div>

                    <div className="rounded-md border border-blue-100 bg-blue-50 p-4">
                        <label className="flex items-center text-sm font-semibold text-blue-900">
                            <input type="checkbox" checked={bindTeacher} onChange={event => setBindTeacher(event.target.checked)} className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                            Быстро закрепить преподавателя за дисциплиной
                        </label>
                        {bindTeacher && (
                            <div className="mt-3 space-y-3">
                                {teacherBindings.map((binding, index) => (
                                    <div key={index} className="rounded-md border border-blue-100 bg-white p-3">
                                        <div className="grid grid-cols-[1fr_auto] gap-2">
                                            <select value={binding.teacherId} onChange={event => updateTeacherBinding(index, { teacherId: event.target.value })} className={defaultInputClass}>
                                                {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                                            </select>
                                            <button type="button" onClick={() => removeTeacherBinding(index)} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md" title="Удалить привязку">Удалить</button>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            {BINDING_CLASS_TYPES.map(classType => (
                                                <label key={classType} className="flex items-center text-sm text-blue-900">
                                                    <input type="checkbox" checked={binding.classTypes.includes(classType)} onChange={() => toggleBindingClassType(index, classType)} className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                    {classType}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                <button type="button" onClick={addTeacherBinding} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50">
                                    <PlusIcon className="w-4 h-4" />
                                    Добавить ещё преподавателя
                                </button>
                            </div>
                        )}
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

type CopyDialogState = {
    mode: 'entry' | 'plan' | 'block';
    entry?: PlanEntry;
    blockId?: string;
} | null;

type BlockDialogState = {
    mode: 'add' | 'edit';
    block?: PlanBlock;
} | null;

const EducationalPlanManager: React.FC = () => {
    const {
        specialties,
        educationalPlans,
        educationalPlanTemplates,
        subjects,
        teachers,
        teacherSubjectLinks,
        updateItem,
        addItem,
        deleteItem,
    } = useStore();
    const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<string>(specialties[0]?.id || '');
    const [selectedFormOfStudy, setSelectedFormOfStudy] = useState<FormOfStudy>(FormOfStudy.FullTime);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEntry, setCurrentEntry] = useState<PlanEntry | null>(null);
    const [copyDialog, setCopyDialog] = useState<CopyDialogState>(null);
    const [targetSpecialtyIds, setTargetSpecialtyIds] = useState<string[]>([]);
    const [replaceTargetPlan, setReplaceTargetPlan] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateMethod, setTemplateMethod] = useState<'merge' | 'replace'>('merge');
    const [blockDialog, setBlockDialog] = useState<BlockDialogState>(null);
    const [blockDialogName, setBlockDialogName] = useState('');
    const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
    const [templateDialogName, setTemplateDialogName] = useState('');
    const [templateDialogDescription, setTemplateDialogDescription] = useState('');

    const activePlan = useMemo(() => {
        return educationalPlans.find(p => p.specialtyId === selectedSpecialtyId && p.formOfStudy === selectedFormOfStudy) ||
            educationalPlans.find(p => p.specialtyId === selectedSpecialtyId && !p.formOfStudy);
    }, [selectedSpecialtyId, selectedFormOfStudy, educationalPlans]);

    const activeBlocks = activePlan?.blocks || [];
    const availableCopyTargets = useMemo(() => specialties.filter(s => s.id !== selectedSpecialtyId), [specialties, selectedSpecialtyId]);
    const selectedTemplate = educationalPlanTemplates.find(template => template.id === selectedTemplateId);

    const getSubjectName = (id: string) => subjects.find(s => s.id === id)?.name || 'N/A';
    const getSpecialtyLabel = (specialty: Specialty) => `${specialty.code} ${specialty.name}`.trim();
    const getBlock = (blockId?: string) => activeBlocks.find(block => block.id === blockId);
    const getBlockName = (blockId?: string) => getBlock(blockId)?.name || 'Без блока';
    const getBlockColor = (blockId?: string) => getBlock(blockId)?.color || '#6b7280';

    const sortPlanEntries = (entries: PlanEntry[]) => [...entries].sort((a, b) => {
        if (a.semester !== b.semester) return a.semester - b.semester;
        const blockCompare = (a.blockId || '').localeCompare(b.blockId || '', 'ru');
        if (blockCompare !== 0) return blockCompare;
        return getSubjectName(a.subjectId).localeCompare(getSubjectName(b.subjectId), 'ru');
    });

    const mergeBlocks = (currentBlocks: PlanBlock[] = [], copiedBlocks: PlanBlock[] = []) => {
        const next = [...currentBlocks];
        copiedBlocks.forEach(block => {
            const existingIndex = next.findIndex(item => item.id === block.id);
            if (existingIndex >= 0) {
                next[existingIndex] = { ...block };
            } else {
                next.push({ ...block });
            }
        });
        return next;
    };

    const mergePlanEntries = (currentEntries: PlanEntry[], copiedEntries: PlanEntry[]) => {
        const next = [...currentEntries];
        copiedEntries.forEach(entry => {
            const existingIndex = next.findIndex(item => item.subjectId === entry.subjectId && item.semester === entry.semester);
            if (existingIndex >= 0) {
                next[existingIndex] = { ...entry };
            } else {
                next.push({ ...entry });
            }
        });
        return sortPlanEntries(next);
    };

    const groupedBySemesterAndBlock = useMemo(() => {
        const result: Record<number, Record<string, PlanEntry[]>> = {};
        (activePlan?.entries || []).forEach(entry => {
            const semester = entry.semester;
            const blockId = entry.blockId || UNASSIGNED_BLOCK_ID;
            result[semester] = result[semester] || {};
            result[semester][blockId] = result[semester][blockId] || [];
            result[semester][blockId].push(entry);
        });
        Object.values(result).forEach(blocks => {
            Object.keys(blocks).forEach(blockId => {
                blocks[blockId] = sortPlanEntries(blocks[blockId]);
            });
        });
        return result;
    }, [activePlan, subjects]);

    const updatePlan = (plan: EducationalPlan) => updateItem('educationalPlans', plan);
    const createPlanPayload = (entries: PlanEntry[] = [], blocks: PlanBlock[] = []): Omit<EducationalPlan, 'id'> => ({
        specialtyId: selectedSpecialtyId,
        formOfStudy: selectedFormOfStudy,
        blocks,
        entries,
    });

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
        updatePlan({ ...activePlan, entries: updatedEntries });
    };

    const applyTeacherBindings = (subjectId: string, bindings: TeacherBindingDraft[] = []) => {
        bindings.forEach(binding => {
            if (!binding.teacherId || binding.classTypes.length === 0) return;
            const existingLink = teacherSubjectLinks.find(link => link.teacherId === binding.teacherId && link.subjectId === subjectId);
            if (existingLink) {
                const classTypes = Array.from(new Set([...existingLink.classTypes, ...binding.classTypes]));
                updateItem('teacherSubjectLinks', { ...existingLink, classTypes });
            } else {
                addItem('teacherSubjectLinks', {
                    teacherId: binding.teacherId,
                    subjectId,
                    classTypes: binding.classTypes,
                } as Omit<TeacherSubjectLink, 'id'>);
            }
        });
    };

    const handleSaveEntry = (entry: PlanEntry, newSubjectName?: string, bindings?: TeacherBindingDraft[]) => {
        let subjectId = entry.subjectId;
        if (newSubjectName) {
            const createdSubject = addItem('subjects', { name: newSubjectName } as Omit<Subject, 'id'>) as Subject;
            subjectId = createdSubject.id;
        }

        const finalEntry = { ...entry, subjectId };
        if (!selectedSpecialtyId) return;

        if (!activePlan) {
            addItem('educationalPlans', createPlanPayload([finalEntry], []));
        } else {
            const existingEntryIndex = activePlan.entries.findIndex(e => e.subjectId === currentEntry?.subjectId && e.semester === currentEntry?.semester);
            const updatedEntries = [...activePlan.entries];
            if (existingEntryIndex > -1) {
                updatedEntries[existingEntryIndex] = finalEntry;
            } else {
                updatedEntries.push(finalEntry);
            }
            updatePlan({ ...activePlan, formOfStudy: activePlan.formOfStudy || selectedFormOfStudy, entries: sortPlanEntries(updatedEntries), blocks: activePlan.blocks || [] });
        }

        applyTeacherBindings(subjectId, bindings);
        setIsModalOpen(false);
    };

    const handleAddBlock = () => {
        setBlockDialog({ mode: 'add' });
        setBlockDialogName('Профессиональный блок');
    };

    const handleEditBlock = (block: PlanBlock) => {
        setBlockDialog({ mode: 'edit', block });
        setBlockDialogName(block.name);
    };

    const handleConfirmBlockDialog = () => {
        const name = blockDialogName.trim();
        if (!blockDialog || !name) return;

        if (blockDialog.mode === 'add') {
            if (!selectedSpecialtyId) return;
            const color = BLOCK_COLORS[(activePlan?.blocks || []).length % BLOCK_COLORS.length];
            const block: PlanBlock = { id: createLocalId('plan-block'), name, color };
            if (activePlan) {
                updatePlan({ ...activePlan, formOfStudy: activePlan.formOfStudy || selectedFormOfStudy, blocks: [...(activePlan.blocks || []), block] });
            } else {
                addItem('educationalPlans', createPlanPayload([], [block]));
            }
        } else if (activePlan && blockDialog.block) {
            updatePlan({
                ...activePlan,
                blocks: activeBlocks.map(item => item.id === blockDialog.block!.id ? { ...item, name } : item),
            });
        }

        setBlockDialog(null);
        setBlockDialogName('');
    };

    const handleDeleteBlock = (block: PlanBlock) => {
        if (!activePlan || !window.confirm(`Удалить блок "${block.name}"? Дисциплины останутся в плане без блока.`)) return;
        updatePlan({
            ...activePlan,
            blocks: activeBlocks.filter(item => item.id !== block.id),
            entries: activePlan.entries.map(entry => entry.blockId === block.id ? { ...entry, blockId: undefined } : entry),
        });
    };

    const handleChangeBlockColor = (block: PlanBlock, color: string) => {
        if (!activePlan) return;
        updatePlan({
            ...activePlan,
            blocks: activeBlocks.map(item => item.id === block.id ? { ...item, color } : item),
        });
    };

    const openCopyDialog = (mode: 'entry' | 'plan' | 'block', entry?: PlanEntry, blockId?: string) => {
        setCopyDialog({ mode, entry, blockId });
        setTargetSpecialtyIds([]);
        setReplaceTargetPlan(false);
    };

    const toggleTargetSpecialty = (specialtyId: string) => {
        setTargetSpecialtyIds(prev =>
            prev.includes(specialtyId) ? prev.filter(id => id !== specialtyId) : [...prev, specialtyId]
        );
    };

    const handleSelectAllTargets = () => setTargetSpecialtyIds(availableCopyTargets.map(s => s.id));

    const getCopyPayload = () => {
        if (!copyDialog) return { entries: [] as PlanEntry[], blocks: [] as PlanBlock[] };
        if (copyDialog.mode === 'entry') {
            const entry = copyDialog.entry;
            const block = entry?.blockId ? activeBlocks.find(item => item.id === entry.blockId) : undefined;
            return {
                entries: entry ? [{ ...entry }] : [],
                blocks: block ? [{ ...block }] : [],
            };
        }
        if (copyDialog.mode === 'block') {
            const block = activeBlocks.find(item => item.id === copyDialog.blockId);
            return {
                entries: (activePlan?.entries || []).filter(entry => entry.blockId === copyDialog.blockId).map(entry => ({ ...entry })),
                blocks: block ? [{ ...block }] : [],
            };
        }
        return {
            entries: (activePlan?.entries || []).map(entry => ({ ...entry })),
            blocks: activeBlocks.map(block => ({ ...block })),
        };
    };

    const handleConfirmCopy = () => {
        if (!copyDialog) return;
        const { entries, blocks } = getCopyPayload();

        if (entries.length === 0) {
            alert('Нет дисциплин для копирования.');
            return;
        }
        if (targetSpecialtyIds.length === 0) {
            alert('Выберите хотя бы одну специальность-получатель.');
            return;
        }

        let createdPlans = 0;
        let updatedPlans = 0;
        targetSpecialtyIds.forEach(targetSpecialtyId => {
            const targetPlan = educationalPlans.find(plan => plan.specialtyId === targetSpecialtyId && plan.formOfStudy === selectedFormOfStudy) ||
                educationalPlans.find(plan => plan.specialtyId === targetSpecialtyId && !plan.formOfStudy);
            if (targetPlan) {
                const nextBlocks = copyDialog.mode === 'plan' && replaceTargetPlan ? blocks : mergeBlocks(targetPlan.blocks || [], blocks);
                const nextEntries = copyDialog.mode === 'plan' && replaceTargetPlan ? sortPlanEntries(entries) : mergePlanEntries(targetPlan.entries, entries);
                updatePlan({ ...targetPlan, formOfStudy: targetPlan.formOfStudy || selectedFormOfStudy, blocks: nextBlocks, entries: nextEntries });
                updatedPlans += 1;
            } else {
                addItem('educationalPlans', {
                    specialtyId: targetSpecialtyId,
                    formOfStudy: selectedFormOfStudy,
                    blocks,
                    entries: sortPlanEntries(entries),
                });
                createdPlans += 1;
            }
        });

        alert(`Копирование завершено.\nДисциплин скопировано: ${entries.length * targetSpecialtyIds.length}\nСоздано планов: ${createdPlans}\nОбновлено планов: ${updatedPlans}`);
        setCopyDialog(null);
        setTargetSpecialtyIds([]);
        setReplaceTargetPlan(false);
    };

    const handleSaveTemplate = () => {
        if (!activePlan || activePlan.entries.length === 0) {
            alert('В текущем плане нет дисциплин для шаблона.');
            return;
        }
        setTemplateDialogName('Шаблон учебного плана');
        setTemplateDialogDescription('');
        setTemplateDialogOpen(true);
    };

    const handleConfirmTemplateDialog = () => {
        if (!activePlan || activePlan.entries.length === 0) {
            setTemplateDialogOpen(false);
            return;
        }
        const name = templateDialogName.trim();
        if (!name) return;
        const template: Omit<EducationalPlanTemplate, 'id'> = {
            name,
            description: templateDialogDescription.trim(),
            blocks: activeBlocks.map(block => ({ ...block })),
            entries: activePlan.entries.map(entry => ({ ...entry })),
            createdAt: new Date().toISOString(),
        };
        const created = addItem('educationalPlanTemplates', template) as EducationalPlanTemplate;
        setSelectedTemplateId(created.id);
        setTemplateDialogOpen(false);
        setTemplateDialogName('');
        setTemplateDialogDescription('');
        alert(`Шаблон "${created.name}" сохранён.`);
    };

    const handleApplyTemplate = () => {
        if (!selectedTemplate) {
            alert('Выберите шаблон учебного плана.');
            return;
        }
        const blocks = selectedTemplate.blocks.map(block => ({ ...block }));
        const entries = selectedTemplate.entries.map(entry => ({ ...entry }));
        if (!selectedSpecialtyId) return;
        if (!activePlan) {
            addItem('educationalPlans', createPlanPayload(sortPlanEntries(entries), blocks));
        } else if (templateMethod === 'replace') {
            updatePlan({ ...activePlan, formOfStudy: activePlan.formOfStudy || selectedFormOfStudy, blocks, entries: sortPlanEntries(entries) });
        } else {
            updatePlan({
                ...activePlan,
                formOfStudy: activePlan.formOfStudy || selectedFormOfStudy,
                blocks: mergeBlocks(activePlan.blocks || [], blocks),
                entries: mergePlanEntries(activePlan.entries, entries),
            });
        }
        alert(templateMethod === 'replace' ? 'План заменён шаблоном.' : 'Шаблон вставлен в план.');
    };

    const handleDeleteTemplate = () => {
        if (!selectedTemplate || !window.confirm(`Удалить шаблон "${selectedTemplate.name}"?`)) return;
        deleteItem('educationalPlanTemplates', selectedTemplate.id);
        setSelectedTemplateId('');
    };

    const renderTotals = (entries: PlanEntry[]) => {
        const lectures = entries.reduce((sum, entry) => sum + entry.lectureHours, 0);
        const practices = entries.reduce((sum, entry) => sum + entry.practiceHours, 0);
        const labs = entries.reduce((sum, entry) => sum + entry.labHours, 0);
        const total = lectures + practices + labs;
        return { lectures, practices, labs, total, zet: (total / 36).toFixed(2) };
    };

    const copyDialogTitle =
        copyDialog?.mode === 'entry' ? 'Копировать дисциплину' :
        copyDialog?.mode === 'block' ? 'Копировать блок дисциплин' :
        'Копировать учебный план';

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex flex-col gap-4 mb-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-center">
                    <BookOpenIcon className="h-8 w-8 text-blue-600 mr-3" />
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">Учебные планы</h2>
                        <p className="text-sm text-gray-500">Блоки дисциплин, шаблоны и переносы между специальностями</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select value={selectedSpecialtyId} onChange={e => setSelectedSpecialtyId(e.target.value)} className="p-2 border rounded-md bg-white min-w-[300px] text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                        {specialties.map(s => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                    </select>
                    <select value={selectedFormOfStudy} onChange={e => setSelectedFormOfStudy(e.target.value as FormOfStudy)} className="p-2 border rounded-md bg-white min-w-[180px] text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                        {Object.values(FormOfStudy).map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <button onClick={handleAddBlock} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg flex items-center shrink-0 transition-transform transform hover:scale-105 active:scale-95">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Блок
                    </button>
                    <button onClick={() => openCopyDialog('plan')} disabled={!activePlan || activePlan.entries.length === 0 || availableCopyTargets.length === 0} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg flex items-center shrink-0 transition-transform transform hover:scale-105 active:scale-95">
                        <CopyIcon className="w-5 h-5 mr-2" />
                        Копировать план
                    </button>
                    <button onClick={handleAddEntry} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center shrink-0 transition-transform transform hover:scale-105 active:scale-95">
                        <PlusIcon className="w-5 h-5 mr-2" />
                        Дисциплина
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
                <div className="space-y-6">
                    {Object.keys(groupedBySemesterAndBlock).length > 0 ? Object.keys(groupedBySemesterAndBlock).sort((a, b) => Number(a) - Number(b)).map(semester => {
                        const semesterBlocks = groupedBySemesterAndBlock[Number(semester)];
                        const semesterEntries = Object.values(semesterBlocks).flat();
                        const semesterTotals = renderTotals(semesterEntries);
                        const orderedBlockIds = Object.keys(semesterBlocks).sort((a, b) => getBlockName(a === UNASSIGNED_BLOCK_ID ? undefined : a).localeCompare(getBlockName(b === UNASSIGNED_BLOCK_ID ? undefined : b), 'ru'));

                        return (
                            <div key={semester} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between bg-gray-100 px-4 py-3">
                                    <h3 className="text-lg font-semibold text-gray-800">{formatSemesterCourse(Number(semester))}</h3>
                                    <div className="text-sm text-gray-600">Всего: <span className="font-semibold">{semesterTotals.total} ч</span> / {semesterTotals.zet} ЗЕТ</div>
                                </div>
                                <div className="divide-y divide-gray-200">
                                    {orderedBlockIds.map(blockKey => {
                                        const blockId = blockKey === UNASSIGNED_BLOCK_ID ? undefined : blockKey;
                                        const entries = semesterBlocks[blockKey];
                                        const totals = renderTotals(entries);
                                        const color = getBlockColor(blockId);
                                        const block = blockId ? getBlock(blockId) : undefined;
                                        return (
                                            <div key={blockKey}>
                                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ backgroundColor: `${color}14` }}>
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                        <div className="min-w-0">
                                                            <h4 className="font-semibold text-gray-900 truncate">{getBlockName(blockId)}</h4>
                                                            <p className="text-xs text-gray-600">{entries.length} дисциплин, {totals.total} ч, {totals.zet} ЗЕТ</p>
                                                        </div>
                                                    </div>
                                                    {block && (
                                                        <div className="flex items-center gap-2">
                                                            {BLOCK_COLORS.map(item => (
                                                                <button key={item} type="button" onClick={() => handleChangeBlockColor(block, item)} className="h-5 w-5 rounded-full border border-white shadow" style={{ backgroundColor: item }} title="Цвет блока" />
                                                            ))}
                                                            <button onClick={() => openCopyDialog('block', undefined, block.id)} className="text-indigo-700 hover:text-indigo-900" title="Копировать блок"><CopyIcon /></button>
                                                            <button onClick={() => handleEditBlock(block)} className="text-blue-700 hover:text-blue-900" title="Переименовать блок"><EditIcon /></button>
                                                            <button onClick={() => handleDeleteBlock(block)} className="text-red-700 hover:text-red-900" title="Удалить блок"><TrashIcon /></button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Дисциплина</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Лекции</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Практики</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Лаб.</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Всего</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">ЗЕТ</th>
                                                                <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Аттестация</th>
                                                                <th className="p-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Деление</th>
                                                                <th className="p-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Действия</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {entries.map((entry, index) => {
                                                                const totalHours = entry.lectureHours + entry.practiceHours + entry.labHours;
                                                                const zet = (totalHours / 36).toFixed(2);
                                                                return (
                                                                    <tr key={`${entry.subjectId}-${entry.semester}-${index}`} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                                                        <td className="p-2 font-medium border-t border-gray-200 text-gray-900">{getSubjectName(entry.subjectId)}</td>
                                                                        <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.lectureHours || '-'}</td>
                                                                        <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.practiceHours || '-'}</td>
                                                                        <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.labHours || '-'}</td>
                                                                        <td className="p-2 text-center font-semibold border-t border-gray-200 text-gray-800">{totalHours}</td>
                                                                        <td className="p-2 text-center font-semibold border-t border-gray-200 text-gray-800">{zet}</td>
                                                                        <td className="p-2 border-t border-gray-200 text-gray-700">{entry.attestation}</td>
                                                                        <td className="p-2 text-center border-t border-gray-200 text-gray-700">{entry.splitForSubgroups ? 'Да' : 'Нет'}</td>
                                                                        <td className="p-2 border-t border-gray-200 text-gray-700">
                                                                            <button onClick={() => handleEditEntry(entry)} className="text-blue-600 hover:text-blue-800 mr-3 transition-transform transform hover:scale-110"><EditIcon /></button>
                                                                            <button onClick={() => openCopyDialog('entry', entry)} className="text-indigo-600 hover:text-indigo-800 mr-3 transition-transform transform hover:scale-110" title="Копировать дисциплину"><CopyIcon /></button>
                                                                            <button onClick={() => handleDeleteEntry(entry)} className="text-red-600 hover:text-red-800 transition-transform transform hover:scale-110"><TrashIcon /></button>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="text-center py-16 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50/50">
                            <BookOpenIcon className="mx-auto h-16 w-16 text-gray-300" />
                            <p className="mt-4 text-lg font-semibold text-gray-600">Учебный план пуст</p>
                            <p className="mt-1 text-sm text-gray-500">Добавьте блоки и дисциплины или вставьте готовый шаблон.</p>
                        </div>
                    )}
                </div>

                <aside className="space-y-4">
                    <section className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <DocumentTextIcon className="h-5 w-5 text-indigo-600" />
                            <h3 className="font-semibold text-gray-900">Шаблоны учебных планов</h3>
                        </div>
                        <div className="space-y-3">
                            <select value={selectedTemplateId} onChange={event => setSelectedTemplateId(event.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-800">
                                <option value="">Выберите шаблон</option>
                                {educationalPlanTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                            </select>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="flex items-center text-sm text-gray-700"><input type="radio" checked={templateMethod === 'merge'} onChange={() => setTemplateMethod('merge')} className="mr-2" /> Вставить</label>
                                <label className="flex items-center text-sm text-gray-700"><input type="radio" checked={templateMethod === 'replace'} onChange={() => setTemplateMethod('replace')} className="mr-2" /> Заменить</label>
                            </div>
                            {selectedTemplate && <p className="text-xs text-gray-500">{selectedTemplate.description || 'Без описания'} · {selectedTemplate.entries.length} дисциплин</p>}
                            <div className="grid grid-cols-1 gap-2">
                                <button onClick={handleApplyTemplate} disabled={!selectedTemplateId} className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed">Применить шаблон</button>
                                <button onClick={handleSaveTemplate} disabled={!activePlan || activePlan.entries.length === 0} className="px-3 py-2 rounded-md border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed">Сохранить текущий как шаблон</button>
                                <button onClick={handleDeleteTemplate} disabled={!selectedTemplateId} className="px-3 py-2 rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed">Удалить шаблон</button>
                            </div>
                        </div>
                    </section>

                    <section className="border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Блоки текущего плана</h3>
                        <div className="space-y-2">
                            {activeBlocks.length > 0 ? activeBlocks.map(block => {
                                const count = activePlan?.entries.filter(entry => entry.blockId === block.id).length || 0;
                                return (
                                    <div key={block.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 p-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: block.color }} />
                                            <span className="text-sm font-medium text-gray-800 truncate">{block.name}</span>
                                            <span className="text-xs text-gray-500">{count}</span>
                                        </div>
                                        <button onClick={() => openCopyDialog('block', undefined, block.id)} className="text-indigo-700 hover:text-indigo-900" title="Копировать блок"><CopyIcon /></button>
                                    </div>
                                );
                            }) : <p className="text-sm text-gray-500">Блоки ещё не созданы.</p>}
                        </div>
                    </section>
                </aside>
            </div>

            {isModalOpen && <PlanEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveEntry} entry={currentEntry} blocks={activeBlocks} />}
            {blockDialog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md animation-fade-in-scale">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">
                            {blockDialog.mode === 'add' ? 'Новый блок дисциплин' : 'Переименовать блок'}
                        </h2>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Название блока</label>
                        <input
                            value={blockDialogName}
                            onChange={event => setBlockDialogName(event.target.value)}
                            className="w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-opacity-75"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3 mt-6">
                            <button type="button" onClick={() => setBlockDialog(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">Отмена</button>
                            <button type="button" onClick={handleConfirmBlockDialog} disabled={!blockDialogName.trim()} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                                {blockDialog.mode === 'add' ? 'Добавить' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {templateDialogOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg animation-fade-in-scale">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Сохранить шаблон учебного плана</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Название шаблона</label>
                                <input
                                    value={templateDialogName}
                                    onChange={event => setTemplateDialogName(event.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                                <textarea
                                    value={templateDialogDescription}
                                    onChange={event => setTemplateDialogDescription(event.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 min-h-24"
                                    placeholder="Например: базовый план для ИТ-направлений"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button type="button" onClick={() => setTemplateDialogOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">Отмена</button>
                            <button type="button" onClick={handleConfirmTemplateDialog} disabled={!templateDialogName.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Сохранить шаблон</button>
                        </div>
                    </div>
                </div>
            )}
            {copyDialog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300 ease-out">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl animation-fade-in-scale">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{copyDialogTitle}</h2>
                                <p className="text-sm text-gray-600 mt-1">
                                    {copyDialog.mode === 'entry' && copyDialog.entry
                                        ? `Будет скопирована дисциплина "${getSubjectName(copyDialog.entry.subjectId)}".`
                                        : copyDialog.mode === 'block'
                                            ? `Будет скопирован блок "${getBlockName(copyDialog.blockId)}" со всеми дисциплинами.`
                                            : `Будут скопированы все блоки и дисциплины текущего учебного плана: ${activePlan?.entries.length || 0}.`}
                                </p>
                            </div>
                            <CopyIcon className="h-7 w-7 text-indigo-600 shrink-0" />
                        </div>

                        {availableCopyTargets.length > 0 ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-medium text-gray-700">Специальности-получатели</p>
                                    <button type="button" onClick={handleSelectAllTargets} className="text-sm text-indigo-700 hover:text-indigo-900 font-medium">Выбрать все</button>
                                </div>
                                <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                                    {availableCopyTargets.map(specialty => (
                                        <label key={specialty.id} className="flex items-start gap-3 p-3 hover:bg-indigo-50 cursor-pointer">
                                            <input type="checkbox" checked={targetSpecialtyIds.includes(specialty.id)} onChange={() => toggleTargetSpecialty(specialty.id)} className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            <span>
                                                <span className="block text-sm font-semibold text-gray-900">{getSpecialtyLabel(specialty)}</span>
                                                <span className="block text-xs text-gray-500">{educationalPlans.some(plan => plan.specialtyId === specialty.id && (plan.formOfStudy === selectedFormOfStudy || !plan.formOfStudy)) ? `Есть учебный план (${selectedFormOfStudy}): совпадающие дисциплины будут обновлены` : `Учебного плана (${selectedFormOfStudy}) пока нет: он будет создан`}</span>
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                {copyDialog.mode === 'plan' && (
                                    <label className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                                        <input type="checkbox" checked={replaceTargetPlan} onChange={event => setReplaceTargetPlan(event.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500" />
                                        <span>
                                            <span className="block text-sm font-semibold text-amber-900">Заменить существующие планы полностью</span>
                                            <span className="block text-xs text-amber-800">Если не включать этот режим, приложение добавит недостающие блоки и дисциплины, а совпадения обновит.</span>
                                        </span>
                                    </label>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg text-gray-500">Нет других специальностей для копирования.</div>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <button type="button" onClick={() => setCopyDialog(null)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">Отмена</button>
                            <button type="button" onClick={handleConfirmCopy} disabled={targetSpecialtyIds.length === 0 || availableCopyTargets.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">Скопировать</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EducationalPlanManager;
