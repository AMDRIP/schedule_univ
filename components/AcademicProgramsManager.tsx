import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { Specialty, UGS } from '../types';
import { OKSO_CODES, UGSN_FROM_OKSO } from '../data/codes';
import { AcademicCapIcon, BookOpenIcon, CheckCircleIcon, DocumentSearchIcon, EditIcon, LibraryIcon, PlusIcon, TrashIcon } from './icons';

type EducationLevel = NonNullable<Specialty['educationLevel']>;

const EDUCATION_LEVELS: { value: EducationLevel; label: string }[] = [
    { value: 'bachelor', label: 'Бакалавриат' },
    { value: 'specialist', label: 'Специалитет' },
    { value: 'master', label: 'Магистратура' },
    { value: 'postgraduate', label: 'Аспирантура' },
    { value: 'secondary', label: 'СПО' },
    { value: 'additional', label: 'Допобразование' },
];

const emptyUgsDraft = (): Omit<UGS, 'id'> => ({
    code: '',
    name: '',
    oksoPrefix: '',
    professionCodes: [],
    description: '',
});

const emptySpecialtyDraft = (ugsId = ''): Omit<Specialty, 'id'> => ({
    code: '',
    name: '',
    ugsId,
    oksoCode: '',
    professionCodes: [],
    profiles: [],
    competencies: [],
    qualification: '',
    educationLevel: 'bachelor',
    standardCode: '',
    description: '',
});

const splitList = (value: string) => value.split(/\n|;/).map(item => item.trim()).filter(Boolean);
const joinList = (value?: string[]) => (value || []).join('\n');

const getLevelByCode = (code?: string): EducationLevel => {
    if (!code) return 'bachelor';
    const middle = code.split('.')[1];
    if (middle === '02') return 'secondary';
    if (middle === '03') return 'bachelor';
    if (middle === '04') return 'master';
    if (middle === '05') return 'specialist';
    if (middle === '06') return 'postgraduate';
    return 'bachelor';
};

const AcademicProgramsManager: React.FC = () => {
    const { ugs, specialties, educationalPlans, groups, addItem, updateItem, deleteItem } = useStore();
    const [selectedUgsId, setSelectedUgsId] = useState<string>(ugs[0]?.id || '');
    const [searchQuery, setSearchQuery] = useState('');
    const [ugsDraft, setUgsDraft] = useState<Omit<UGS, 'id'> | UGS>(emptyUgsDraft());
    const [specialtyDraft, setSpecialtyDraft] = useState<Omit<Specialty, 'id'> | Specialty>(emptySpecialtyDraft(ugs[0]?.id || ''));
    const [editingUgsId, setEditingUgsId] = useState<string | null>(null);
    const [editingSpecialtyId, setEditingSpecialtyId] = useState<string | null>(null);

    const selectedUgs = ugs.find(item => item.id === selectedUgsId) || ugs[0];
    const filteredUgs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return ugs;
        return ugs.filter(item => `${item.code} ${item.name} ${item.description || ''}`.toLowerCase().includes(query));
    }, [ugs, searchQuery]);

    const specialtiesByUgs = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return specialties
            .filter(item => !selectedUgs?.id || item.ugsId === selectedUgs.id)
            .filter(item => {
                if (!query) return true;
                return [
                    item.code,
                    item.oksoCode,
                    item.name,
                    item.qualification,
                    item.standardCode,
                    item.description,
                    ...(item.profiles || []),
                    ...(item.competencies || []),
                    ...(item.professionCodes || []),
                ].join(' ').toLowerCase().includes(query);
            })
            .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));
    }, [specialties, selectedUgs, searchQuery]);

    const stats = useMemo(() => ({
        ugs: ugs.length,
        specialties: specialties.length,
        profiles: specialties.reduce((sum, item) => sum + (item.profiles?.length || 0), 0),
        competencies: specialties.reduce((sum, item) => sum + (item.competencies?.length || 0), 0),
    }), [ugs, specialties]);

    const startEditUgs = (item: UGS) => {
        setEditingUgsId(item.id);
        setUgsDraft({ ...item, professionCodes: item.professionCodes || [], oksoPrefix: item.oksoPrefix || item.code.slice(0, 2), description: item.description || '' });
    };

    const resetUgsForm = () => {
        setEditingUgsId(null);
        setUgsDraft(emptyUgsDraft());
    };

    const startEditSpecialty = (item: Specialty) => {
        setEditingSpecialtyId(item.id);
        setSpecialtyDraft({
            ...item,
            oksoCode: item.oksoCode || item.code,
            professionCodes: item.professionCodes || [],
            profiles: item.profiles || [],
            competencies: item.competencies || [],
            qualification: item.qualification || '',
            educationLevel: item.educationLevel || getLevelByCode(item.code || item.oksoCode),
            standardCode: item.standardCode || '',
            description: item.description || '',
        });
    };

    const resetSpecialtyForm = (ugsId = selectedUgs?.id || '') => {
        setEditingSpecialtyId(null);
        setSpecialtyDraft(emptySpecialtyDraft(ugsId));
    };

    const handleUgsCodeChange = (code: string) => {
        const matched = UGSN_FROM_OKSO.find(item => item.code === code || item.code.startsWith(code.slice(0, 2)));
        setUgsDraft(current => ({
            ...current,
            code,
            oksoPrefix: code.slice(0, 2),
            name: matched?.name || current.name,
        }));
    };

    const handleSpecialtyCodeChange = (code: string) => {
        const matchedOkso = OKSO_CODES.find(item => item.code === code);
        const matchedUgs = UGSN_FROM_OKSO.find(item => item.code.startsWith(code.slice(0, 2)));
        const existingUgs = matchedUgs ? ugs.find(item => item.code === matchedUgs.code || item.code.startsWith(code.slice(0, 2))) : undefined;
        setSpecialtyDraft(current => ({
            ...current,
            code,
            oksoCode: code,
            name: matchedOkso?.name || current.name,
            ugsId: existingUgs?.id || current.ugsId,
            educationLevel: getLevelByCode(code),
        }));
        if (existingUgs?.id) setSelectedUgsId(existingUgs.id);
    };

    const saveUgs = () => {
        const payload = {
            ...ugsDraft,
            code: ugsDraft.code.trim(),
            name: ugsDraft.name.trim(),
            oksoPrefix: ugsDraft.oksoPrefix?.trim() || ugsDraft.code.trim().slice(0, 2),
            professionCodes: ugsDraft.professionCodes || [],
            description: ugsDraft.description?.trim() || '',
        };
        if (!payload.code || !payload.name) {
            alert('Укажите код и название УГСН.');
            return;
        }
        if (editingUgsId) {
            updateItem('ugs', { ...(payload as UGS), id: editingUgsId });
            setSelectedUgsId(editingUgsId);
        } else {
            const created = addItem('ugs', payload) as UGS;
            setSelectedUgsId(created.id);
            resetSpecialtyForm(created.id);
        }
        resetUgsForm();
    };

    const saveSpecialty = () => {
        const payload = {
            ...specialtyDraft,
            code: specialtyDraft.code.trim(),
            oksoCode: specialtyDraft.oksoCode?.trim() || specialtyDraft.code.trim(),
            name: specialtyDraft.name.trim(),
            ugsId: specialtyDraft.ugsId || selectedUgs?.id || '',
            professionCodes: specialtyDraft.professionCodes || [],
            profiles: specialtyDraft.profiles || [],
            competencies: specialtyDraft.competencies || [],
            qualification: specialtyDraft.qualification?.trim() || '',
            standardCode: specialtyDraft.standardCode?.trim() || '',
            description: specialtyDraft.description?.trim() || '',
            educationLevel: specialtyDraft.educationLevel || getLevelByCode(specialtyDraft.code),
        };
        if (!payload.code || !payload.name || !payload.ugsId) {
            alert('Укажите код, название и УГСН для специальности.');
            return;
        }
        if (editingSpecialtyId) {
            updateItem('specialties', { ...(payload as Specialty), id: editingSpecialtyId });
        } else {
            addItem('specialties', payload);
        }
        resetSpecialtyForm(payload.ugsId);
    };

    const deleteUgsSafely = (item: UGS) => {
        const linkedSpecialties = specialties.filter(specialty => specialty.ugsId === item.id).length;
        if (linkedSpecialties > 0) {
            alert(`Нельзя удалить УГСН: к ней привязано специальностей: ${linkedSpecialties}.`);
            return;
        }
        deleteItem('ugs', item.id);
        if (selectedUgsId === item.id) setSelectedUgsId(ugs.find(next => next.id !== item.id)?.id || '');
    };

    const deleteSpecialtySafely = (item: Specialty) => {
        const planExists = educationalPlans.some(plan => plan.specialtyId === item.id);
        const groupsCount = groups.filter(group => group.specialtyId === item.id).length;
        if (planExists || groupsCount > 0) {
            alert(`Специальность используется: групп ${groupsCount}, учебный план ${planExists ? 'есть' : 'нет'}. Удаление лучше выполнять через проверенный справочник специальностей.`);
            return;
        }
        deleteItem('specialties', item.id);
    };

    return (
        <div className="flex h-full flex-col bg-gray-100">
            <div className="border-b border-gray-200 bg-white px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <LibraryIcon className="h-8 w-8 text-blue-600" />
                            <h1 className="text-2xl font-semibold text-gray-900">УГСН, ОКСО и образовательные программы</h1>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">Единый справочник кодов, специальностей, профилей, профессий и компетенций.</p>
                    </div>
                    <input
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        placeholder="Поиск по коду, названию, профилю, компетенции"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-200 md:grid-cols-4">
                <Metric label="УГСН" value={stats.ugs} icon={<LibraryIcon className="h-5 w-5" />} />
                <Metric label="Специальности" value={stats.specialties} icon={<AcademicCapIcon className="h-5 w-5" />} />
                <Metric label="Профили" value={stats.profiles} icon={<BookOpenIcon className="h-5 w-5" />} />
                <Metric label="Компетенции" value={stats.competencies} icon={<CheckCircleIcon className="h-5 w-5" />} />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
                <aside className="min-h-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
                    <div className="mb-4 rounded-lg border border-gray-200 p-4">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{editingUgsId ? 'Редактирование УГСН' : 'Новая УГСН'}</h2>
                        <div className="mt-3 space-y-3">
                            <input list="ugsn-codes" value={ugsDraft.code} onChange={event => handleUgsCodeChange(event.target.value)} className={inputClass} placeholder="Код УГСН, например 09.00.00" />
                            <input value={ugsDraft.name} onChange={event => setUgsDraft(current => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Название УГСН" />
                            <input value={ugsDraft.oksoPrefix || ''} onChange={event => setUgsDraft(current => ({ ...current, oksoPrefix: event.target.value }))} className={inputClass} placeholder="Префикс ОКСО" />
                            <textarea value={joinList(ugsDraft.professionCodes)} onChange={event => setUgsDraft(current => ({ ...current, professionCodes: splitList(event.target.value) }))} className={`${inputClass} min-h-20`} placeholder="Коды профессий, каждый с новой строки" />
                            <textarea value={ugsDraft.description || ''} onChange={event => setUgsDraft(current => ({ ...current, description: event.target.value }))} className={`${inputClass} min-h-20`} placeholder="Описание области" />
                            <div className="flex gap-2">
                                <button type="button" onClick={saveUgs} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                    <PlusIcon className="h-4 w-4" />
                                    {editingUgsId ? 'Сохранить' : 'Добавить'}
                                </button>
                                {editingUgsId && <button type="button" onClick={resetUgsForm} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Отмена</button>}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {filteredUgs.map(item => {
                            const count = specialties.filter(specialty => specialty.ugsId === item.id).length;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedUgsId(item.id)}
                                    className={`w-full rounded-lg border px-3 py-3 text-left transition ${selectedUgs?.id === item.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900">{item.code}</div>
                                            <div className="mt-1 text-sm text-gray-700">{item.name}</div>
                                            <div className="mt-1 text-xs text-gray-500">Специальностей: {count}</div>
                                        </div>
                                        <div className="flex gap-1">
                                            <span onClick={(event) => { event.stopPropagation(); startEditUgs(item); }} className="rounded-md p-1 text-gray-500 hover:bg-white hover:text-blue-600" title="Редактировать">
                                                <EditIcon className="h-4 w-4" />
                                            </span>
                                            <span onClick={(event) => { event.stopPropagation(); deleteUgsSafely(item); }} className="rounded-md p-1 text-gray-500 hover:bg-white hover:text-red-600" title="Удалить">
                                                <TrashIcon className="h-4 w-4" />
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className="min-h-0 overflow-y-auto p-6">
                    <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
                        <h2 className="text-lg font-semibold text-gray-900">{editingSpecialtyId ? 'Редактирование специальности' : 'Новая специальность / программа'}</h2>
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                            <input list="okso-codes-programs" value={specialtyDraft.code} onChange={event => handleSpecialtyCodeChange(event.target.value)} className={inputClass} placeholder="Код ОКСО" />
                            <input value={specialtyDraft.name} onChange={event => setSpecialtyDraft(current => ({ ...current, name: event.target.value }))} className={`${inputClass} lg:col-span-2`} placeholder="Название специальности" />
                            <select value={specialtyDraft.ugsId || selectedUgs?.id || ''} onChange={event => setSpecialtyDraft(current => ({ ...current, ugsId: event.target.value }))} className={inputClass}>
                                <option value="">УГСН не выбрана</option>
                                {ugs.map(item => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}
                            </select>
                            <select value={specialtyDraft.educationLevel || 'bachelor'} onChange={event => setSpecialtyDraft(current => ({ ...current, educationLevel: event.target.value as EducationLevel }))} className={inputClass}>
                                {EDUCATION_LEVELS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                            <input value={specialtyDraft.qualification || ''} onChange={event => setSpecialtyDraft(current => ({ ...current, qualification: event.target.value }))} className={inputClass} placeholder="Квалификация" />
                            <input value={specialtyDraft.standardCode || ''} onChange={event => setSpecialtyDraft(current => ({ ...current, standardCode: event.target.value }))} className={inputClass} placeholder="ФГОС / стандарт" />
                            <input value={specialtyDraft.oksoCode || ''} onChange={event => setSpecialtyDraft(current => ({ ...current, oksoCode: event.target.value }))} className={inputClass} placeholder="Доп. код ОКСО" />
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <textarea value={joinList(specialtyDraft.profiles)} onChange={event => setSpecialtyDraft(current => ({ ...current, profiles: splitList(event.target.value) }))} className={`${inputClass} min-h-24`} placeholder="Профили подготовки, каждый с новой строки" />
                            <textarea value={joinList(specialtyDraft.competencies)} onChange={event => setSpecialtyDraft(current => ({ ...current, competencies: splitList(event.target.value) }))} className={`${inputClass} min-h-24`} placeholder="Компетенции, каждая с новой строки" />
                            <textarea value={joinList(specialtyDraft.professionCodes)} onChange={event => setSpecialtyDraft(current => ({ ...current, professionCodes: splitList(event.target.value) }))} className={`${inputClass} min-h-20`} placeholder="Коды профессий / должностей" />
                            <textarea value={specialtyDraft.description || ''} onChange={event => setSpecialtyDraft(current => ({ ...current, description: event.target.value }))} className={`${inputClass} min-h-20`} placeholder="Описание, особенности программы, примечания" />
                        </div>
                        <div className="mt-4 flex gap-2">
                            <button type="button" onClick={saveSpecialty} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                                <PlusIcon className="h-4 w-4" />
                                {editingSpecialtyId ? 'Сохранить программу' : 'Добавить программу'}
                            </button>
                            {editingSpecialtyId && <button type="button" onClick={() => resetSpecialtyForm()} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Отмена</button>}
                        </div>
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{selectedUgs ? `${selectedUgs.code} ${selectedUgs.name}` : 'Специальности'}</h2>
                            <p className="text-sm text-gray-500">Показано программ: {specialtiesByUgs.length}</p>
                        </div>
                    </div>

                    {specialtiesByUgs.length === 0 ? (
                        <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white">
                            <div className="text-center text-gray-500">
                                <DocumentSearchIcon className="mx-auto h-10 w-10 text-gray-300" />
                                <p className="mt-2 text-sm">Для выбранной УГСН программы не найдены.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                            {specialtiesByUgs.map(item => (
                                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{item.code}</span>
                                                {item.oksoCode && <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">ОКСО {item.oksoCode}</span>}
                                                {item.educationLevel && <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700">{EDUCATION_LEVELS.find(level => level.value === item.educationLevel)?.label}</span>}
                                            </div>
                                            <h3 className="mt-2 text-base font-semibold text-gray-900">{item.name}</h3>
                                            {item.qualification && <p className="mt-1 text-sm text-gray-600">Квалификация: {item.qualification}</p>}
                                        </div>
                                        <div className="flex gap-1">
                                            <button type="button" onClick={() => startEditSpecialty(item)} className="rounded-md p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="Редактировать">
                                                <EditIcon className="h-4 w-4" />
                                            </button>
                                            <button type="button" onClick={() => deleteSpecialtySafely(item)} className="rounded-md p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Удалить">
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <ProgramList title="Профили" items={item.profiles} />
                                    <ProgramList title="Компетенции" items={item.competencies} />
                                    <ProgramList title="Коды профессий" items={item.professionCodes} compact />
                                    {item.description && <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-600">{item.description}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>

            <datalist id="okso-codes-programs">
                {OKSO_CODES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </datalist>
            <datalist id="ugsn-codes">
                {UGSN_FROM_OKSO.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </datalist>
        </div>
    );
};

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

const Metric: React.FC<{ label: string; value: string | number; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-gray-500">
            {icon}
            <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
);

const ProgramList: React.FC<{ title: string; items?: string[]; compact?: boolean }> = ({ title, items, compact }) => {
    if (!items?.length) return null;
    return (
        <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
            <div className="mt-2 flex flex-wrap gap-2">
                {items.map((item, index) => (
                    <span key={`${title}-${index}`} className={`rounded-md border border-gray-200 bg-gray-50 px-2 py-1 ${compact ? 'text-xs' : 'text-sm'} text-gray-700`}>
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default AcademicProgramsManager;
