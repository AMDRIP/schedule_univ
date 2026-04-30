import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  Cabinet,
  ClassType,
  Classroom,
  ClassroomTag,
  ClassroomType,
  RoomAssignmentCategory,
} from '../types';
import {
  AlertIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  EditIcon,
  HomeIcon,
  PlusIcon,
  TrashIcon,
} from './icons';
import BuildingPlanEditor from './BuildingPlanEditor';

type TabId = 'overview' | 'classrooms' | 'cabinets' | 'types' | 'tags' | 'plans' | 'quality';
type RoomStatus = NonNullable<Classroom['status']>;
type TagCategory = NonNullable<ClassroomTag['category']>;
type RequiredLevel = NonNullable<ClassroomTag['requiredLevel']>;

const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  available: 'Доступно',
  repair: 'Ремонт',
  closed: 'Закрыто',
  reserve: 'Резерв',
};

const ROOM_STATUS_BADGES: Record<RoomStatus, string> = {
  available: 'bg-green-50 text-green-700',
  repair: 'bg-amber-50 text-amber-700',
  closed: 'bg-red-50 text-red-700',
  reserve: 'bg-blue-50 text-blue-700',
};

const CATEGORY_LABELS: Record<RoomAssignmentCategory, string> = {
  educational: 'Учебное',
  administrative: 'Управление',
  support: 'Хозяйственное',
  utility: 'Техническое',
  public: 'Общее',
};

const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  equipment: 'Оборудование',
  software: 'ПО',
  infrastructure: 'Инфраструктура',
  accessibility: 'Доступность',
  restriction: 'Ограничение',
  service: 'Служебное',
};

const REQUIRED_LEVEL_LABELS: Record<RequiredLevel, string> = {
  optional: 'Справочно',
  preferred: 'Желательно',
  required: 'Обязательно',
};

const COLOR_OPTIONS = ['blue', 'green', 'indigo', 'purple', 'red', 'amber', 'gray'];

const emptyClassroomDraft = (typeId = ''): Omit<Classroom, 'id'> => ({
  number: '',
  capacity: 30,
  examCapacity: 15,
  typeId,
  tagIds: [],
  area: 0,
  departmentId: '',
  status: 'available',
  allowedClassTypes: [],
  prioritySubjectIds: [],
  notes: '',
});

const emptyCabinetDraft = (departmentId = ''): Omit<Cabinet, 'id'> => ({
  number: '',
  departmentId,
  capacity: 1,
  category: 'administrative',
  responsibleTeacherId: '',
  tagIds: [],
  status: 'available',
  notes: '',
});

const emptyTypeDraft = (): Omit<ClassroomType, 'id'> => ({
  name: '',
  category: 'educational',
  allowedClassTypes: [ClassType.Lecture],
  requiredTagIds: [],
  color: 'blue',
  priority: 50,
  description: '',
});

const emptyTagDraft = (): Omit<ClassroomTag, 'id'> => ({
  name: '',
  icon: 'BookmarkIcon',
  color: 'blue',
  category: 'equipment',
  requiredLevel: 'preferred',
  description: '',
});

const RoomResourcesManager: React.FC = () => {
  const {
    classrooms,
    cabinets,
    classroomTypes,
    classroomTags,
    departments,
    teachers,
    subjects,
    schedule,
    buildingPlans,
    addItem,
    updateItem,
    deleteItem,
    syncBuildingPlanRooms,
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState(classrooms[0]?.id || '');
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<Set<string>>(new Set());
  const [classroomDraft, setClassroomDraft] = useState<Omit<Classroom, 'id'> | Classroom>(emptyClassroomDraft(classroomTypes[0]?.id || ''));
  const [cabinetDraft, setCabinetDraft] = useState<Omit<Cabinet, 'id'> | Cabinet>(emptyCabinetDraft(departments[0]?.id || ''));
  const [typeDraft, setTypeDraft] = useState<Omit<ClassroomType, 'id'> | ClassroomType>(emptyTypeDraft());
  const [tagDraft, setTagDraft] = useState<Omit<ClassroomTag, 'id'> | ClassroomTag>(emptyTagDraft());
  const [editingClassroomId, setEditingClassroomId] = useState<string | null>(null);
  const [editingCabinetId, setEditingCabinetId] = useState<string | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<RoomStatus>('available');

  const selectedClassroom = classrooms.find(item => item.id === selectedClassroomId) || classrooms[0];
  const query = searchQuery.trim().toLowerCase();

  const filteredClassrooms = useMemo(() => classrooms.filter(room => {
    if (!query) return true;
    const type = classroomTypes.find(item => item.id === room.typeId);
    const department = departments.find(item => item.id === room.departmentId);
    const tags = (room.tagIds || []).map(id => classroomTags.find(tag => tag.id === id)?.name).join(' ');
    return [
      room.number,
      type?.name,
      department?.name,
      room.roomMetadata?.buildingName,
      room.roomMetadata?.assignmentName,
      tags,
      room.notes,
    ].join(' ').toLowerCase().includes(query);
  }), [classrooms, classroomTypes, departments, classroomTags, query]);

  const filteredCabinets = useMemo(() => cabinets.filter(cabinet => {
    if (!query) return true;
    const department = departments.find(item => item.id === cabinet.departmentId);
    const teacher = teachers.find(item => item.id === cabinet.responsibleTeacherId);
    return [
      cabinet.number,
      department?.name,
      teacher?.name,
      cabinet.roomMetadata?.buildingName,
      cabinet.roomMetadata?.assignmentName,
      cabinet.notes,
    ].join(' ').toLowerCase().includes(query);
  }), [cabinets, departments, teachers, query]);

  const totalCapacity = classrooms.reduce((sum, room) => sum + room.capacity, 0);
  const examCapacity = classrooms.reduce((sum, room) => sum + (room.examCapacity || Math.floor(room.capacity / 2)), 0);
  const roomsFromPlans = classrooms.filter(room => room.roomMetadata?.roomId).length + cabinets.filter(cabinet => cabinet.roomMetadata?.roomId).length;

  const usageByClassroom = useMemo(() => {
    const result = new Map<string, number>();
    schedule.forEach(entry => result.set(entry.classroomId, (result.get(entry.classroomId) || 0) + 1));
    return result;
  }, [schedule]);

  const qualityIssues = useMemo(() => {
    const issues: { title: string; detail: string; severity: 'critical' | 'warning' | 'info'; classroomId?: string }[] = [];
    const byBuildingNumber = new Map<string, string>();

    classrooms.forEach(room => {
      const key = `${room.roomMetadata?.buildingName || 'manual'}-${room.roomMetadata?.floorNumber || 'none'}-${room.number}`.toLowerCase();
      if (byBuildingNumber.has(key)) {
        issues.push({ title: 'Дублируется номер аудитории', detail: `${room.number}: такой номер уже есть в этом корпусе или ручном списке.`, severity: 'warning', classroomId: room.id });
      }
      byBuildingNumber.set(key, room.id);

      if (!room.typeId || !classroomTypes.some(type => type.id === room.typeId)) {
        issues.push({ title: 'Не задан тип аудитории', detail: `${room.number}: генератору будет сложнее подобрать занятие.`, severity: 'critical', classroomId: room.id });
      }
      if (!room.capacity || room.capacity < 1) {
        issues.push({ title: 'Не задана вместимость', detail: `${room.number}: у аудитории должна быть положительная вместимость.`, severity: 'critical', classroomId: room.id });
      }
      if (room.status && room.status !== 'available' && usageByClassroom.has(room.id)) {
        issues.push({ title: 'Помещение занято в расписании', detail: `${room.number}: статус "${ROOM_STATUS_LABELS[room.status]}", но есть занятия в расписании.`, severity: 'critical', classroomId: room.id });
      }
      const type = classroomTypes.find(item => item.id === room.typeId);
      const requiredTags = type?.requiredTagIds || [];
      const roomTags = room.tagIds || [];
      if (requiredTags.some(tagId => !roomTags.includes(tagId))) {
        issues.push({ title: 'Не хватает обязательного оснащения', detail: `${room.number}: тип "${type?.name}" требует теги, которых нет в карточке аудитории.`, severity: 'warning', classroomId: room.id });
      }
    });

    classroomTypes.forEach(type => {
      const suitableRooms = classrooms.filter(room => room.typeId === type.id);
      if (suitableRooms.length === 0) {
        issues.push({ title: 'Тип без аудиторий', detail: `${type.name}: нет помещений этого типа.`, severity: 'info' });
      }
    });

    subjects.forEach(subject => {
      const requiredTypeIds = Array.from(new Set(Object.values(subject.classroomTypeRequirements || {}).flat()));
      requiredTypeIds.forEach(typeId => {
        const exists = classrooms.some(room => room.typeId === typeId && (!subject.requiredClassroomTagIds?.length || subject.requiredClassroomTagIds.every(tagId => room.tagIds?.includes(tagId))));
        if (!exists) {
          const typeName = classroomTypes.find(type => type.id === typeId)?.name || 'неизвестный тип';
          issues.push({ title: 'Нет аудитории под дисциплину', detail: `${subject.name}: нужен тип "${typeName}" с требуемыми тегами.`, severity: 'warning' });
        }
      });
    });

    buildingPlans.forEach(plan => {
      plan.floors.forEach(floor => {
        floor.rooms.forEach(room => {
          if (room.resourceKind === 'classroom' && !classrooms.some(classroom => classroom.roomMetadata?.roomId === room.id)) {
            issues.push({ title: 'Комната плана не синхронизирована', detail: `${plan.name}, ${floor.name}, ${room.number || room.name}: нет связанной аудитории.`, severity: 'info' });
          }
          if (room.resourceKind === 'cabinet' && !cabinets.some(cabinet => cabinet.roomMetadata?.roomId === room.id)) {
            issues.push({ title: 'Кабинет плана не синхронизирован', detail: `${plan.name}, ${floor.name}, ${room.number || room.name}: нет связанного кабинета.`, severity: 'info' });
          }
        });
      });
    });

    return issues;
  }, [classrooms, cabinets, classroomTypes, subjects, buildingPlans, usageByClassroom]);

  const resetClassroomDraft = () => {
    setEditingClassroomId(null);
    setClassroomDraft(emptyClassroomDraft(classroomTypes[0]?.id || ''));
  };

  const saveClassroom = () => {
    const payload = {
      ...classroomDraft,
      number: classroomDraft.number.trim(),
      capacity: Number(classroomDraft.capacity) || 1,
      examCapacity: Number(classroomDraft.examCapacity) || undefined,
      area: Number(classroomDraft.area) || undefined,
      tagIds: classroomDraft.tagIds || [],
      allowedClassTypes: classroomDraft.allowedClassTypes || [],
      prioritySubjectIds: classroomDraft.prioritySubjectIds || [],
    };
    if (!payload.number) return;
    if (editingClassroomId) {
      updateItem('classrooms', { ...(payload as Classroom), id: editingClassroomId });
    } else {
      const created = addItem('classrooms', payload as Omit<Classroom, 'id'>) as Classroom;
      setSelectedClassroomId(created.id);
    }
    resetClassroomDraft();
  };

  const editClassroom = (room: Classroom) => {
    setClassroomDraft({ ...room, tagIds: room.tagIds || [], allowedClassTypes: room.allowedClassTypes || [], prioritySubjectIds: room.prioritySubjectIds || [] });
    setEditingClassroomId(room.id);
    setSelectedClassroomId(room.id);
    setActiveTab('classrooms');
  };

  const resetCabinetDraft = () => {
    setEditingCabinetId(null);
    setCabinetDraft(emptyCabinetDraft(departments[0]?.id || ''));
  };

  const saveCabinet = () => {
    const payload = {
      ...cabinetDraft,
      number: cabinetDraft.number.trim(),
      capacity: Number(cabinetDraft.capacity) || undefined,
      tagIds: cabinetDraft.tagIds || [],
    };
    if (!payload.number) return;
    if (editingCabinetId) {
      updateItem('cabinets', { ...(payload as Cabinet), id: editingCabinetId });
    } else {
      addItem('cabinets', payload as Omit<Cabinet, 'id'>);
    }
    resetCabinetDraft();
  };

  const saveType = () => {
    const payload = {
      ...typeDraft,
      name: typeDraft.name.trim(),
      requiredTagIds: typeDraft.requiredTagIds || [],
      allowedClassTypes: typeDraft.allowedClassTypes || [],
      priority: Number(typeDraft.priority) || 0,
    };
    if (!payload.name) return;
    if (editingTypeId) updateItem('classroomTypes', { ...(payload as ClassroomType), id: editingTypeId });
    else addItem('classroomTypes', payload as Omit<ClassroomType, 'id'>);
    setEditingTypeId(null);
    setTypeDraft(emptyTypeDraft());
  };

  const saveTag = () => {
    const payload = { ...tagDraft, name: tagDraft.name.trim(), icon: tagDraft.icon || 'BookmarkIcon' };
    if (!payload.name) return;
    if (editingTagId) updateItem('classroomTags', { ...(payload as ClassroomTag), id: editingTagId });
    else addItem('classroomTags', payload as Omit<ClassroomTag, 'id'>);
    setEditingTagId(null);
    setTagDraft(emptyTagDraft());
  };

  const toggleSelectedClassroom = (id: string) => {
    setSelectedClassroomIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkStatus = () => {
    Array.from(selectedClassroomIds).forEach(id => {
      const room = classrooms.find(item => item.id === id);
      if (room) updateItem('classrooms', { ...room, status: bulkStatus });
    });
  };

  const syncAllPlans = () => {
    const result = buildingPlans.reduce((sum, plan) => {
      const synced = syncBuildingPlanRooms(plan);
      return { classrooms: sum.classrooms + synced.classrooms, cabinets: sum.cabinets + synced.cabinets };
    }, { classrooms: 0, cabinets: 0 });
    alert(`Синхронизировано: аудиторий ${result.classrooms}, кабинетов ${result.cabinets}.`);
  };

  const toggleArrayValue = <T extends string,>(items: T[] | undefined, value: T) => {
    const current = items || [];
    return current.includes(value) ? current.filter(item => item !== value) : [...current, value];
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'classrooms', label: 'Аудитории' },
    { id: 'cabinets', label: 'Кабинеты' },
    { id: 'types', label: 'Типы' },
    { id: 'tags', label: 'Оснащение' },
    { id: 'plans', label: 'Планы зданий' },
    { id: 'quality', label: 'Проверка' },
  ];

  return (
    <div className="space-y-6 text-gray-900">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Аудиторный фонд</p>
          <h1 className="text-3xl font-bold text-gray-950">Помещения, оснащение и планы зданий</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Единый центр управления учебными аудиториями, служебными кабинетами, типами помещений, тегами оснащения и связью с планами этажей.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Найти аудиторию, корпус, тип, оснащение"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-80"
          />
          <button
            onClick={() => setActiveTab('quality')}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm ${qualityIssues.length > 0 ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
          >
            <AlertIcon className="h-5 w-5" />
            {qualityIssues.length > 0 ? `Проблем: ${qualityIssues.length}` : 'Фонд готов'}
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard icon={<HomeIcon />} label="Аудитории" value={classrooms.length} hint={`${totalCapacity} обычных мест`} />
        <StatCard icon={<BuildingOfficeIcon />} label="Кабинеты" value={cabinets.length} hint="служебные помещения" />
        <StatCard icon={<CheckCircleIcon />} label="Экзамены" value={examCapacity} hint="эффективных мест" />
        <StatCard icon={<PlusIcon />} label="Оснащение" value={classroomTags.length} hint="теги и свойства" />
        <StatCard icon={<AlertIcon />} label="С планов" value={roomsFromPlans} hint="связанные комнаты" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Аудитории</h2>
                <p className="text-sm text-gray-500">Выберите помещение, чтобы увидеть карточку и связанные ограничения.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select compact value={bulkStatus} onChange={value => setBulkStatus(value as RoomStatus)} options={Object.entries(ROOM_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
                <button onClick={applyBulkStatus} disabled={selectedClassroomIds.size === 0} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50 hover:bg-gray-50">
                  Назначить статус
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredClassrooms.map(room => (
                <RoomRow
                  key={room.id}
                  room={room}
                  selected={selectedClassroom?.id === room.id}
                  checked={selectedClassroomIds.has(room.id)}
                  typeName={classroomTypes.find(type => type.id === room.typeId)?.name || 'Тип не задан'}
                  tags={classroomTags.filter(tag => room.tagIds?.includes(tag.id))}
                  usageCount={usageByClassroom.get(room.id) || 0}
                  onSelect={() => setSelectedClassroomId(room.id)}
                  onCheck={() => toggleSelectedClassroom(room.id)}
                  onEdit={() => editClassroom(room)}
                  onDelete={() => deleteItem('classrooms', room.id)}
                />
              ))}
            </div>
          </section>
          <RoomDetails
            room={selectedClassroom}
            type={classroomTypes.find(type => type.id === selectedClassroom?.typeId)}
            tags={classroomTags.filter(tag => selectedClassroom?.tagIds?.includes(tag.id))}
            department={departments.find(item => item.id === selectedClassroom?.departmentId)}
            usageCount={selectedClassroom ? usageByClassroom.get(selectedClassroom.id) || 0 : 0}
            onEdit={() => selectedClassroom && editClassroom(selectedClassroom)}
          />
        </div>
      )}

      {activeTab === 'classrooms' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingClassroomId ? 'Редактировать аудиторию' : 'Новая аудитория'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Номер" value={classroomDraft.number} onChange={value => setClassroomDraft(prev => ({ ...prev, number: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Вместимость" type="number" value={classroomDraft.capacity} onChange={value => setClassroomDraft(prev => ({ ...prev, capacity: Number(value) }))} />
                <Input label="Экзаменационная" type="number" value={classroomDraft.examCapacity || ''} onChange={value => setClassroomDraft(prev => ({ ...prev, examCapacity: Number(value) || undefined }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Площадь, м²" type="number" value={classroomDraft.area || ''} onChange={value => setClassroomDraft(prev => ({ ...prev, area: Number(value) || undefined }))} />
                <Select label="Статус" value={classroomDraft.status || 'available'} onChange={value => setClassroomDraft(prev => ({ ...prev, status: value as RoomStatus }))} options={Object.entries(ROOM_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
              </div>
              <Select label="Тип аудитории" value={classroomDraft.typeId} onChange={value => setClassroomDraft(prev => ({ ...prev, typeId: value }))} options={classroomTypes.map(type => ({ value: type.id, label: type.name }))} />
              <Select label="Ответственная кафедра" value={classroomDraft.departmentId || ''} onChange={value => setClassroomDraft(prev => ({ ...prev, departmentId: value }))} options={[{ value: '', label: 'Не задана' }, ...departments.map(item => ({ value: item.id, label: item.name }))]} />
              <CheckboxGroup
                label="Подходит для занятий"
                options={Object.values(ClassType).map(value => ({ value, label: value }))}
                values={classroomDraft.allowedClassTypes || []}
                onChange={value => setClassroomDraft(prev => ({ ...prev, allowedClassTypes: toggleArrayValue(prev.allowedClassTypes, value as ClassType) }))}
              />
              <CheckboxGroup
                label="Оснащение и свойства"
                options={classroomTags.map(tag => ({ value: tag.id, label: tag.name }))}
                values={classroomDraft.tagIds || []}
                onChange={value => setClassroomDraft(prev => ({ ...prev, tagIds: toggleArrayValue(prev.tagIds, value) }))}
              />
              <CheckboxGroup
                label="Приоритетные дисциплины"
                options={subjects.map(subject => ({ value: subject.id, label: subject.name }))}
                values={classroomDraft.prioritySubjectIds || []}
                onChange={value => setClassroomDraft(prev => ({ ...prev, prioritySubjectIds: toggleArrayValue(prev.prioritySubjectIds, value) }))}
              />
              <Textarea label="Заметки" value={classroomDraft.notes || ''} onChange={value => setClassroomDraft(prev => ({ ...prev, notes: value }))} />
              <div className="flex gap-2">
                <button onClick={saveClassroom} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <PlusIcon className="h-5 w-5" />
                  {editingClassroomId ? 'Сохранить' : 'Добавить'}
                </button>
                {editingClassroomId && <button onClick={resetClassroomDraft} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Отмена</button>}
              </div>
            </div>
          </section>
          <RoomList
            rooms={filteredClassrooms}
            selectedId={selectedClassroom?.id}
            selectedIds={selectedClassroomIds}
            classroomTypes={classroomTypes}
            classroomTags={classroomTags}
            usageByClassroom={usageByClassroom}
            onSelect={setSelectedClassroomId}
            onCheck={toggleSelectedClassroom}
            onEdit={editClassroom}
            onDelete={id => deleteItem('classrooms', id)}
          />
        </div>
      )}

      {activeTab === 'cabinets' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingCabinetId ? 'Редактировать кабинет' : 'Новый кабинет'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Номер" value={cabinetDraft.number} onChange={value => setCabinetDraft(prev => ({ ...prev, number: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Рабочих мест" type="number" value={cabinetDraft.capacity || ''} onChange={value => setCabinetDraft(prev => ({ ...prev, capacity: Number(value) || undefined }))} />
                <Select label="Статус" value={cabinetDraft.status || 'available'} onChange={value => setCabinetDraft(prev => ({ ...prev, status: value as RoomStatus }))} options={Object.entries(ROOM_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
              </div>
              <Select label="Назначение" value={cabinetDraft.category || 'administrative'} onChange={value => setCabinetDraft(prev => ({ ...prev, category: value as RoomAssignmentCategory }))} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
              <Select label="Кафедра / подразделение" value={cabinetDraft.departmentId} onChange={value => setCabinetDraft(prev => ({ ...prev, departmentId: value }))} options={departments.map(item => ({ value: item.id, label: item.name }))} />
              <Select label="Ответственный" value={cabinetDraft.responsibleTeacherId || ''} onChange={value => setCabinetDraft(prev => ({ ...prev, responsibleTeacherId: value }))} options={[{ value: '', label: 'Не задан' }, ...teachers.map(item => ({ value: item.id, label: item.name }))]} />
              <CheckboxGroup
                label="Оснащение"
                options={classroomTags.map(tag => ({ value: tag.id, label: tag.name }))}
                values={cabinetDraft.tagIds || []}
                onChange={value => setCabinetDraft(prev => ({ ...prev, tagIds: toggleArrayValue(prev.tagIds, value) }))}
              />
              <Textarea label="Заметки" value={cabinetDraft.notes || ''} onChange={value => setCabinetDraft(prev => ({ ...prev, notes: value }))} />
              <div className="flex gap-2">
                <button onClick={saveCabinet} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <PlusIcon className="h-5 w-5" />
                  {editingCabinetId ? 'Сохранить' : 'Добавить'}
                </button>
                {editingCabinetId && <button onClick={resetCabinetDraft} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Отмена</button>}
              </div>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            {filteredCabinets.map(cabinet => (
              <div key={cabinet.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950">{cabinet.number}</h3>
                    <p className="text-sm text-gray-500">{CATEGORY_LABELS[cabinet.category || 'administrative']} · {departments.find(item => item.id === cabinet.departmentId)?.name || 'Подразделение не задано'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setCabinetDraft({ ...cabinet, tagIds: cabinet.tagIds || [] }); setEditingCabinetId(cabinet.id); }} className="text-blue-700 hover:text-blue-900"><EditIcon /></button>
                    <button onClick={() => deleteItem('cabinets', cabinet.id)} className="text-red-600 hover:text-red-800"><TrashIcon /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{ROOM_STATUS_LABELS[cabinet.status || 'available']}</Badge>
                  {cabinet.capacity && <Badge>{cabinet.capacity} мест</Badge>}
                  {cabinet.roomMetadata?.buildingName && <Badge>{cabinet.roomMetadata.buildingName}, {cabinet.roomMetadata.floorNumber} этаж</Badge>}
                </div>
                {cabinet.notes && <p className="mt-3 text-sm text-gray-600">{cabinet.notes}</p>}
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'types' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingTypeId ? 'Редактировать тип' : 'Новый тип помещения'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Название" value={typeDraft.name} onChange={value => setTypeDraft(prev => ({ ...prev, name: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Категория" value={typeDraft.category || 'educational'} onChange={value => setTypeDraft(prev => ({ ...prev, category: value as RoomAssignmentCategory }))} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
                <Input label="Приоритет" type="number" value={typeDraft.priority || 0} onChange={value => setTypeDraft(prev => ({ ...prev, priority: Number(value) || 0 }))} />
              </div>
              <Select label="Цвет" value={typeDraft.color || 'blue'} onChange={value => setTypeDraft(prev => ({ ...prev, color: value }))} options={COLOR_OPTIONS.map(value => ({ value, label: value }))} />
              <CheckboxGroup
                label="Подходит для типов занятий"
                options={Object.values(ClassType).map(value => ({ value, label: value }))}
                values={typeDraft.allowedClassTypes || []}
                onChange={value => setTypeDraft(prev => ({ ...prev, allowedClassTypes: toggleArrayValue(prev.allowedClassTypes, value as ClassType) }))}
              />
              <CheckboxGroup
                label="Обязательные теги"
                options={classroomTags.map(tag => ({ value: tag.id, label: tag.name }))}
                values={typeDraft.requiredTagIds || []}
                onChange={value => setTypeDraft(prev => ({ ...prev, requiredTagIds: toggleArrayValue(prev.requiredTagIds, value) }))}
              />
              <Textarea label="Описание" value={typeDraft.description || ''} onChange={value => setTypeDraft(prev => ({ ...prev, description: value }))} />
              <button onClick={saveType} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                <PlusIcon className="h-5 w-5" />
                {editingTypeId ? 'Сохранить тип' : 'Добавить тип'}
              </button>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-2">
            {classroomTypes.map(type => (
              <div key={type.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">{type.name}</h3>
                    <p className="text-sm text-gray-500">{CATEGORY_LABELS[type.category || 'educational']} · {classrooms.filter(room => room.typeId === type.id).length} аудиторий</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setTypeDraft({ ...type, allowedClassTypes: type.allowedClassTypes || [], requiredTagIds: type.requiredTagIds || [] }); setEditingTypeId(type.id); }} className="text-blue-700 hover:text-blue-900"><EditIcon /></button>
                    <button onClick={() => deleteItem('classroomTypes', type.id)} className="text-red-600 hover:text-red-800"><TrashIcon /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(type.allowedClassTypes || []).map(item => <Badge key={item}>{item}</Badge>)}
                  {(type.requiredTagIds || []).map(tagId => <Badge key={tagId}>{classroomTags.find(tag => tag.id === tagId)?.name || 'Тег удалён'}</Badge>)}
                </div>
                {type.description && <p className="mt-3 text-sm text-gray-600">{type.description}</p>}
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'tags' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingTagId ? 'Редактировать тег' : 'Новое оснащение'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Название" value={tagDraft.name} onChange={value => setTagDraft(prev => ({ ...prev, name: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Иконка" value={tagDraft.icon} onChange={value => setTagDraft(prev => ({ ...prev, icon: value }))} />
                <Select label="Цвет" value={tagDraft.color} onChange={value => setTagDraft(prev => ({ ...prev, color: value }))} options={COLOR_OPTIONS.map(value => ({ value, label: value }))} />
              </div>
              <Select label="Категория" value={tagDraft.category || 'equipment'} onChange={value => setTagDraft(prev => ({ ...prev, category: value as TagCategory }))} options={Object.entries(TAG_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />
              <Select label="Уровень" value={tagDraft.requiredLevel || 'preferred'} onChange={value => setTagDraft(prev => ({ ...prev, requiredLevel: value as RequiredLevel }))} options={Object.entries(REQUIRED_LEVEL_LABELS).map(([value, label]) => ({ value, label }))} />
              <Textarea label="Описание" value={tagDraft.description || ''} onChange={value => setTagDraft(prev => ({ ...prev, description: value }))} />
              <button onClick={saveTag} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                <PlusIcon className="h-5 w-5" />
                {editingTagId ? 'Сохранить тег' : 'Добавить тег'}
              </button>
            </div>
          </section>
          <section className="grid gap-4 lg:grid-cols-3">
            {classroomTags.map(tag => (
              <div key={tag.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-950">{tag.name}</h3>
                    <p className="text-sm text-gray-500">{TAG_CATEGORY_LABELS[tag.category || 'equipment']} · {REQUIRED_LEVEL_LABELS[tag.requiredLevel || 'preferred']}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setTagDraft({ ...tag }); setEditingTagId(tag.id); }} className="text-blue-700 hover:text-blue-900"><EditIcon /></button>
                    <button onClick={() => deleteItem('classroomTags', tag.id)} className="text-red-600 hover:text-red-800"><TrashIcon /></button>
                  </div>
                </div>
                <p className="mt-3 text-sm text-gray-600">{tag.description || 'Описание не задано.'}</p>
                <div className="mt-3 text-xs text-gray-500">Используется в аудиториях: {classrooms.filter(room => room.tagIds?.includes(tag.id)).length}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'plans' && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Планы зданий и синхронизация</h2>
              <p className="text-sm text-gray-500">Комнаты на планах могут автоматически создавать аудитории и кабинеты с привязкой к корпусу, этажу и помещению.</p>
            </div>
            <button onClick={syncAllPlans} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              <CheckCircleIcon className="h-5 w-5" />
              Синхронизировать все планы
            </button>
          </div>
          <BuildingPlanEditor />
        </section>
      )}

      {activeTab === 'quality' && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-lg font-semibold text-gray-950">Проверка аудиторного фонда</h2>
            <p className="text-sm text-gray-500">Проверка показывает проблемы, которые мешают планировщику выбрать подходящее помещение.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {qualityIssues.length === 0 ? (
              <EmptyState title="Замечаний нет" text="Аудиторный фонд выглядит готовым к генерации расписания." />
            ) : qualityIssues.map((issue, index) => (
              <button
                key={`${issue.title}-${index}`}
                onClick={() => {
                  if (issue.classroomId) {
                    setSelectedClassroomId(issue.classroomId);
                    setActiveTab('overview');
                  }
                }}
                className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span>
                  <span className="block text-sm font-semibold text-gray-950">{issue.title}</span>
                  <span className="block text-sm text-gray-600">{issue.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactElement<{ className?: string }>; label: string; value: string | number; hint: string }> = ({ icon, label, value, hint }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
        {React.cloneElement(icon, { className: 'h-5 w-5' })}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-950">{value}</p>
      </div>
    </div>
    <p className="mt-3 text-sm text-gray-500">{hint}</p>
  </div>
);

const RoomList: React.FC<{
  rooms: Classroom[];
  selectedId?: string;
  selectedIds: Set<string>;
  classroomTypes: ClassroomType[];
  classroomTags: ClassroomTag[];
  usageByClassroom: Map<string, number>;
  onSelect: (id: string) => void;
  onCheck: (id: string) => void;
  onEdit: (room: Classroom) => void;
  onDelete: (id: string) => void;
}> = ({ rooms, selectedId, selectedIds, classroomTypes, classroomTags, usageByClassroom, onSelect, onCheck, onEdit, onDelete }) => (
  <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
    <div className="border-b border-gray-100 p-4">
      <h2 className="text-lg font-semibold text-gray-950">Список аудиторий</h2>
      <p className="text-sm text-gray-500">Карточки учитывают тип, теги, статус, корпус и фактическую занятость.</p>
    </div>
    <div className="divide-y divide-gray-100">
      {rooms.map(room => (
        <RoomRow
          key={room.id}
          room={room}
          selected={selectedId === room.id}
          checked={selectedIds.has(room.id)}
          typeName={classroomTypes.find(type => type.id === room.typeId)?.name || 'Тип не задан'}
          tags={classroomTags.filter(tag => room.tagIds?.includes(tag.id))}
          usageCount={usageByClassroom.get(room.id) || 0}
          onSelect={() => onSelect(room.id)}
          onCheck={() => onCheck(room.id)}
          onEdit={() => onEdit(room)}
          onDelete={() => onDelete(room.id)}
        />
      ))}
    </div>
  </section>
);

const RoomRow: React.FC<{
  room: Classroom;
  selected: boolean;
  checked: boolean;
  typeName: string;
  tags: ClassroomTag[];
  usageCount: number;
  onSelect: () => void;
  onCheck: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ room, selected, checked, typeName, tags, usageCount, onSelect, onCheck, onEdit, onDelete }) => (
  <div className={`flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${selected ? 'bg-emerald-50/70' : 'bg-white'}`}>
    <div className="flex min-w-0 items-start gap-3">
      <input type="checkbox" checked={checked} onChange={onCheck} className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600" />
      <button onClick={onSelect} className="min-w-0 text-left">
        <span className="block text-base font-semibold text-gray-950">{room.number}</span>
        <span className="block truncate text-sm text-gray-500">{typeName}</span>
        <span className="block truncate text-xs text-gray-400">{room.roomMetadata?.buildingName ? `${room.roomMetadata.buildingName}, ${room.roomMetadata.floorNumber} этаж` : 'Ручная запись'}</span>
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-green-50 px-2 py-1 font-semibold text-green-700">{room.capacity} мест</span>
      <span className={`rounded-full px-2 py-1 font-semibold ${ROOM_STATUS_BADGES[room.status || 'available']}`}>{ROOM_STATUS_LABELS[room.status || 'available']}</span>
      <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">{usageCount} занятий</span>
      {tags.slice(0, 3).map(tag => <span key={tag.id} className="rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-700">{tag.name}</span>)}
      <button onClick={onEdit} className="rounded-md border border-gray-200 p-1.5 text-blue-700 hover:bg-white" title="Редактировать"><EditIcon /></button>
      <button onClick={onDelete} className="rounded-md border border-gray-200 p-1.5 text-red-600 hover:bg-white" title="Удалить"><TrashIcon /></button>
    </div>
  </div>
);

const RoomDetails: React.FC<{
  room?: Classroom;
  type?: ClassroomType;
  tags: ClassroomTag[];
  department?: any;
  usageCount: number;
  onEdit: () => void;
}> = ({ room, type, tags, department, usageCount, onEdit }) => {
  if (!room) return <EmptyState title="Аудитория не выбрана" text="Выберите аудиторию в списке, чтобы увидеть её паспорт." />;
  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-950">{room.number}</h2>
          <p className="text-sm text-gray-500">{type?.name || 'Тип не задан'} · {room.capacity} мест</p>
        </div>
        <button onClick={onEdit} className="rounded-md border border-gray-300 p-2 text-blue-700 hover:bg-gray-50"><EditIcon /></button>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <Info label="Статус" value={ROOM_STATUS_LABELS[room.status || 'available']} />
        <Info label="Экзамен" value={`${room.examCapacity || Math.floor(room.capacity / 2)} мест`} />
        <Info label="Площадь" value={room.area ? `${room.area} м²` : 'Не задана'} />
        <Info label="Кафедра" value={department?.name || 'Не закреплена'} />
        <Info label="Корпус" value={room.roomMetadata?.buildingName || 'Не связан'} />
        <Info label="Этаж" value={room.roomMetadata?.floorNumber ? `${room.roomMetadata.floorNumber}` : 'Не связан'} />
        <Info label="Занятость" value={`${usageCount} занятий`} />
      </dl>
      <div className="mt-5">
        <p className="text-sm font-semibold text-gray-800">Оснащение</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : <span className="text-sm text-gray-500">Не задано</span>}
        </div>
      </div>
      {room.notes && <p className="mt-5 rounded-md bg-gray-50 p-3 text-sm text-gray-600">{room.notes}</p>}
    </aside>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
    <dt className="text-gray-500">{label}</dt>
    <dd className="font-medium text-gray-900">{value}</dd>
  </div>
);

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{children}</span>
);

const EmptyState: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
    <HomeIcon className="mx-auto h-10 w-10 text-gray-300" />
    <h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-500">{text}</p>
  </div>
);

const Input: React.FC<{ label: string; value: string | number; type?: string; onChange: (value: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <input
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  </label>
);

const Select: React.FC<{ label?: string; value: string; options: { value: string; label: string }[]; compact?: boolean; onChange: (value: string) => void }> = ({ label, value, options, compact, onChange }) => {
  const control = (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className={`${compact ? '' : 'mt-1'} w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500`}
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
  if (compact || !label) return control;
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {control}
    </label>
  );
};

const Textarea: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <textarea
      value={value}
      onChange={event => onChange(event.target.value)}
      rows={3}
      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
    />
  </label>
);

const CheckboxGroup: React.FC<{ label: string; options: { value: string; label: string }[]; values: string[]; onChange: (value: string) => void }> = ({ label, options, values, onChange }) => (
  <div>
    <p className="text-sm font-medium text-gray-700">{label}</p>
    <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
      {options.length === 0 ? (
        <p className="px-2 py-1 text-sm text-gray-500">Список пуст</p>
      ) : options.map(option => (
        <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
          <input type="checkbox" checked={values.includes(option.value)} onChange={() => onChange(option.value)} className="h-4 w-4 rounded border-gray-300 text-emerald-600" />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  </div>
);

export default RoomResourcesManager;
