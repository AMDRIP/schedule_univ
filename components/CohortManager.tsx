import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import {
  ClassType,
  FormOfStudy,
  Group,
  Stream,
  StreamType,
  StudyShift,
  Subgroup,
  SubgroupType,
} from '../types';
import {
  AcademicCapIcon,
  AlertIcon,
  BookOpenIcon,
  CheckCircleIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
} from './icons';
import AvailabilityGridEditor from './AvailabilityGridEditor';

type TabId = 'overview' | 'groups' | 'subgroups' | 'streams' | 'quality';

const SHIFT_LABELS: Record<StudyShift, string> = {
  first: 'Первая смена',
  second: 'Вторая смена',
  both: 'Любая смена',
};

const SUBGROUP_TYPE_LABELS: Record<SubgroupType, string> = {
  general: 'Общая',
  language: 'Языковая',
  lab: 'Лабораторная',
  practice: 'Практическая',
  project: 'Проектная',
  individual: 'Индивидуальная',
};

const STREAM_TYPE_LABELS: Record<StreamType, string> = {
  lecture: 'Лекционный',
  practice: 'Практический',
  elective: 'Факультативный',
  exam: 'Экзаменационный',
  project: 'Проектный',
  custom: 'Свободный',
};

const CLASS_TYPES_FOR_ASSIGNMENTS = [ClassType.Practical, ClassType.Lab, ClassType.Elective];

const emptyGroupDraft = (departmentId = '', specialtyId = ''): Omit<Group, 'id'> => ({
  number: '',
  departmentId,
  specialtyId,
  course: 1,
  studentCount: 25,
  formOfStudy: FormOfStudy.FullTime,
  shift: 'first',
  availabilityGrid: {},
  pinnedClassroomId: '',
  curatorTeacherId: '',
  admissionYear: new Date().getFullYear(),
  notes: '',
});

const emptyStreamDraft = (): Omit<Stream, 'id'> => ({
  name: '',
  groupIds: [],
  subgroupIds: [],
  type: 'lecture',
  subjectId: '',
  teacherId: '',
  classroomTypeId: '',
  maxStudentCount: 0,
  semester: undefined,
  notes: '',
});

const getGroupLabel = (group?: Group) => group ? `${group.number} · ${group.course} курс` : 'Группа не выбрана';

const CohortManager: React.FC = () => {
  const store = useStore();
  const {
    groups,
    subgroups,
    streams,
    departments,
    faculties,
    specialties,
    educationalPlans,
    subjects,
    teachers,
    classrooms,
    classroomTypes,
    schedule,
    addItem,
    updateItem,
    deleteItem,
  } = store;

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id || '');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupDraft, setGroupDraft] = useState<Omit<Group, 'id'> | Group>(emptyGroupDraft(departments[0]?.id || '', specialties[0]?.id || ''));
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [streamDraft, setStreamDraft] = useState<Omit<Stream, 'id'> | Stream>(emptyStreamDraft());
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  const [splitParts, setSplitParts] = useState(2);
  const [splitType, setSplitType] = useState<SubgroupType>('lab');
  const [bulkShift, setBulkShift] = useState<StudyShift>('first');

  const selectedGroup = groups.find(group => group.id === selectedGroupId) || groups[0];
  const selectedGroupSubgroups = selectedGroup ? subgroups.filter(item => item.parentGroupId === selectedGroup.id) : [];
  const selectedGroupStreams = selectedGroup ? streams.filter(stream => stream.groupIds.includes(selectedGroup.id)) : [];

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return groups.filter(group => {
      if (!query) return true;
      const department = departments.find(item => item.id === group.departmentId);
      const specialty = specialties.find(item => item.id === group.specialtyId);
      return [
        group.number,
        group.course,
        department?.name,
        specialty?.name,
        group.notes,
      ].join(' ').toLowerCase().includes(query);
    });
  }, [groups, departments, specialties, searchQuery]);

  const groupsByCourse = useMemo(() => {
    const result = new Map<number, Group[]>();
    filteredGroups.forEach(group => {
      const list = result.get(group.course) || [];
      list.push(group);
      result.set(group.course, list);
    });
    return Array.from(result.entries()).sort(([a], [b]) => a - b);
  }, [filteredGroups]);

  const totalStudents = groups.reduce((sum, group) => sum + group.studentCount, 0);
  const streamStudents = (stream: Stream) => {
    const groupCount = stream.groupIds.reduce((sum, groupId) => sum + (groups.find(group => group.id === groupId)?.studentCount || 0), 0);
    const subgroupCount = (stream.subgroupIds || []).reduce((sum, subgroupId) => sum + (subgroups.find(subgroup => subgroup.id === subgroupId)?.studentCount || 0), 0);
    return groupCount + subgroupCount;
  };

  const getPlanForGroup = (group: Group) =>
    educationalPlans.find(item => item.specialtyId === group.specialtyId && item.formOfStudy === group.formOfStudy) ||
    educationalPlans.find(item => item.specialtyId === group.specialtyId && !item.formOfStudy) ||
    educationalPlans.find(item => item.specialtyId === group.specialtyId);

  const qualityIssues = useMemo(() => {
    const issues: { title: string; detail: string; severity: 'critical' | 'warning' | 'info'; groupId?: string }[] = [];

    groups.forEach(group => {
      const groupSubgroups = subgroups.filter(item => item.parentGroupId === group.id);
      const subgroupTotal = groupSubgroups.reduce((sum, item) => sum + item.studentCount, 0);
      const plan = getPlanForGroup(group);
      const splitRequired = plan?.entries.some(entry => entry.splitForSubgroups);

      if (!group.specialtyId || !specialties.some(item => item.id === group.specialtyId)) {
        issues.push({ title: 'Нет специальности', detail: `${group.number}: группа не связана с действующей специальностью.`, severity: 'critical', groupId: group.id });
      }
      if (!group.departmentId || !departments.some(item => item.id === group.departmentId)) {
        issues.push({ title: 'Нет кафедры', detail: `${group.number}: группа не связана с действующей кафедрой.`, severity: 'critical', groupId: group.id });
      }
      if (!group.shift) {
        issues.push({ title: 'Не задана смена', detail: `${group.number}: планировщик не сможет уверенно выбирать слоты первой или второй смены.`, severity: 'warning', groupId: group.id });
      }
      if (!plan) {
        issues.push({ title: 'Нет учебного плана', detail: `${group.number}: для специальности группы не найден учебный план.`, severity: 'warning', groupId: group.id });
      }
      if (splitRequired && groupSubgroups.length === 0) {
        issues.push({ title: 'Нужны подгруппы', detail: `${group.number}: в учебном плане есть дисциплины с делением, но подгруппы не созданы.`, severity: 'warning', groupId: group.id });
      }
      if (groupSubgroups.length > 0 && subgroupTotal !== group.studentCount) {
        issues.push({ title: 'Не совпала численность', detail: `${group.number}: в группе ${group.studentCount}, в подгруппах суммарно ${subgroupTotal}.`, severity: 'warning', groupId: group.id });
      }
    });

    streams.forEach(stream => {
      const count = streamStudents(stream);
      if (count === 0) {
        issues.push({ title: 'Пустой поток', detail: `${stream.name}: не выбраны группы или подгруппы.`, severity: 'warning' });
      }
      if (stream.maxStudentCount && count > stream.maxStudentCount) {
        issues.push({ title: 'Превышена вместимость потока', detail: `${stream.name}: ${count} студентов при лимите ${stream.maxStudentCount}.`, severity: 'critical' });
      }
      if (stream.classroomTypeId) {
        const suitableCapacity = classrooms
          .filter(room => room.typeId === stream.classroomTypeId)
          .reduce((max, room) => Math.max(max, room.capacity), 0);
        if (suitableCapacity > 0 && count > suitableCapacity) {
          issues.push({ title: 'Нет подходящей аудитории', detail: `${stream.name}: крупнейшая аудитория выбранного типа вмещает ${suitableCapacity}, в потоке ${count}.`, severity: 'warning' });
        }
      }
    });

    return issues;
  }, [groups, subgroups, streams, educationalPlans, specialties, departments, classrooms]);

  const resetGroupDraft = () => {
    setEditingGroupId(null);
    setGroupDraft(emptyGroupDraft(departments[0]?.id || '', specialties[0]?.id || ''));
  };

  const saveGroup = () => {
    const payload = {
      ...groupDraft,
      number: groupDraft.number.trim(),
      studentCount: Number(groupDraft.studentCount) || 1,
      course: Number(groupDraft.course) || 1,
      admissionYear: Number(groupDraft.admissionYear) || undefined,
    };
    if (!payload.number) return;

    if (editingGroupId) {
      updateItem('groups', { ...(payload as Group), id: editingGroupId });
    } else {
      const created = addItem('groups', payload as Omit<Group, 'id'>) as Group;
      setSelectedGroupId(created.id);
    }
    resetGroupDraft();
  };

  const editGroup = (group: Group) => {
    setGroupDraft({ ...group });
    setEditingGroupId(group.id);
    setSelectedGroupId(group.id);
    setActiveTab('groups');
  };

  const removeGroup = (group: Group) => {
    if (!window.confirm(`Удалить группу "${group.number}" вместе со связанными подгруппами и расписанием?`)) return;
    deleteItem('groups', group.id);
    if (selectedGroupId === group.id) {
      setSelectedGroupId(groups.find(item => item.id !== group.id)?.id || '');
    }
  };

  const toggleSelectedGroup = (groupId: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const createSubgroupsForSelectedGroup = () => {
    if (!selectedGroup || splitParts < 2) return;
    const existing = subgroups.filter(item => item.parentGroupId === selectedGroup.id && item.type === splitType);
    if (existing.length > 0 && !window.confirm('У этой группы уже есть подгруппы такого типа. Создать дополнительные?')) return;

    const baseSize = Math.floor(selectedGroup.studentCount / splitParts);
    const remainder = selectedGroup.studentCount % splitParts;
    for (let index = 0; index < splitParts; index += 1) {
      addItem('subgroups', {
        name: `${selectedGroup.number}-${index + 1}`,
        parentGroupId: selectedGroup.id,
        studentCount: baseSize + (index < remainder ? 1 : 0),
        type: splitType,
        subjectIds: [],
        notes: '',
        teacherAssignments: [],
      } as Omit<Subgroup, 'id'>);
    }
  };

  const updateSubgroup = (subgroup: Subgroup, patch: Partial<Subgroup>) => {
    updateItem('subgroups', { ...subgroup, ...patch });
  };

  const addTeacherAssignment = (subgroup: Subgroup) => {
    updateSubgroup(subgroup, {
      teacherAssignments: [
        ...(subgroup.teacherAssignments || []),
        {
          subjectId: subjects[0]?.id || '',
          teacherId: teachers[0]?.id || '',
          classType: ClassType.Practical,
        },
      ],
    });
  };

  const updateTeacherAssignment = (subgroup: Subgroup, index: number, patch: any) => {
    const assignments = [...(subgroup.teacherAssignments || [])];
    assignments[index] = { ...assignments[index], ...patch };
    updateSubgroup(subgroup, { teacherAssignments: assignments });
  };

  const removeTeacherAssignment = (subgroup: Subgroup, index: number) => {
    updateSubgroup(subgroup, {
      teacherAssignments: (subgroup.teacherAssignments || []).filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const saveStream = () => {
    const selectedGroups = Array.from(selectedGroupIds);
    const payload = {
      ...streamDraft,
      name: streamDraft.name.trim(),
      groupIds: selectedGroups,
      subgroupIds: streamDraft.subgroupIds || [],
      maxStudentCount: Number(streamDraft.maxStudentCount) || undefined,
      semester: Number(streamDraft.semester) || undefined,
    };
    if (!payload.name || (payload.groupIds.length === 0 && (payload.subgroupIds || []).length === 0)) return;

    if (editingStreamId) {
      updateItem('streams', { ...(payload as Stream), id: editingStreamId });
    } else {
      addItem('streams', payload as Omit<Stream, 'id'>);
    }
    setStreamDraft(emptyStreamDraft());
    setEditingStreamId(null);
    setSelectedGroupIds(new Set());
  };

  const editStream = (stream: Stream) => {
    setStreamDraft({ ...stream, subgroupIds: stream.subgroupIds || [] });
    setSelectedGroupIds(new Set(stream.groupIds));
    setEditingStreamId(stream.id);
    setActiveTab('streams');
  };

  const applyBulkShift = () => {
    Array.from(selectedGroupIds).forEach(groupId => {
      const group = groups.find(item => item.id === groupId);
      if (group) updateItem('groups', { ...group, shift: bulkShift });
    });
  };

  const promoteSelectedGroups = () => {
    Array.from(selectedGroupIds).forEach(groupId => {
      const group = groups.find(item => item.id === groupId);
      if (group) updateItem('groups', { ...group, course: Math.min(6, group.course + 1) });
    });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'groups', label: 'Группы' },
    { id: 'subgroups', label: 'Подгруппы' },
    { id: 'streams', label: 'Потоки' },
    { id: 'quality', label: 'Проверка данных' },
  ];

  return (
    <div className="space-y-6 text-gray-900">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Контингент</p>
          <h1 className="text-3xl font-bold text-gray-950">Группы, подгруппы и потоки</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Единый рабочий раздел для структуры учебного контингента, массовых операций и проверки готовности данных к планированию расписания.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Найти группу, кафедру, специальность"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-80"
          />
          <button
            onClick={() => setActiveTab('quality')}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm ${qualityIssues.length > 0 ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
          >
            <AlertIcon className="h-5 w-5" />
            {qualityIssues.length > 0 ? `Проблем: ${qualityIssues.length}` : 'Данные готовы'}
          </button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={<AcademicCapIcon />} label="Группы" value={groups.length} hint={`${totalStudents} студентов`} />
        <StatCard icon={<UserGroupIcon />} label="Подгруппы" value={subgroups.length} hint="для лабораторных и практик" />
        <StatCard icon={<BookOpenIcon />} label="Потоки" value={streams.length} hint="лекции, экзамены, проекты" />
        <StatCard icon={<CheckCircleIcon />} label="Проверка" value={qualityIssues.length === 0 ? 'OK' : qualityIssues.length} hint="готовность к генерации" />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === tab.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            {groupsByCourse.map(([course, courseGroups]) => (
              <div key={course} className="rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="font-semibold text-gray-950">{course} курс</h2>
                  <span className="text-sm text-gray-500">{courseGroups.length} групп · {courseGroups.reduce((sum, group) => sum + group.studentCount, 0)} студентов</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {courseGroups.map(group => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      selected={selectedGroup?.id === group.id}
                      checked={selectedGroupIds.has(group.id)}
                      departmentName={departments.find(item => item.id === group.departmentId)?.name || 'Кафедра не задана'}
                      specialtyName={specialties.find(item => item.id === group.specialtyId)?.name || 'Специальность не задана'}
                      subgroupCount={subgroups.filter(item => item.parentGroupId === group.id).length}
                      streamCount={streams.filter(item => item.groupIds.includes(group.id)).length}
                      onSelect={() => setSelectedGroupId(group.id)}
                      onCheck={() => toggleSelectedGroup(group.id)}
                      onEdit={() => editGroup(group)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
          <SelectedGroupPanel
            group={selectedGroup}
            subgroups={selectedGroupSubgroups}
            streams={selectedGroupStreams}
            departments={departments}
            specialties={specialties}
            faculties={faculties}
            teachers={teachers}
            classrooms={classrooms}
            scheduleCount={selectedGroup ? schedule.filter(entry => entry.groupId === selectedGroup.id || entry.groupIds?.includes(selectedGroup.id)).length : 0}
            onEdit={() => selectedGroup && editGroup(selectedGroup)}
            onDelete={() => selectedGroup && removeGroup(selectedGroup)}
          />
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingGroupId ? 'Редактировать группу' : 'Новая группа'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Номер группы" value={groupDraft.number} onChange={value => setGroupDraft(prev => ({ ...prev, number: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Курс" type="number" value={groupDraft.course} onChange={value => setGroupDraft(prev => ({ ...prev, course: Number(value) }))} />
                <Input label="Студентов" type="number" value={groupDraft.studentCount} onChange={value => setGroupDraft(prev => ({ ...prev, studentCount: Number(value) }))} />
              </div>
              <Select label="Кафедра" value={groupDraft.departmentId} onChange={value => setGroupDraft(prev => ({ ...prev, departmentId: value }))} options={departments.map(item => ({ value: item.id, label: item.name }))} />
              <Select label="Специальность" value={groupDraft.specialtyId} onChange={value => setGroupDraft(prev => ({ ...prev, specialtyId: value }))} options={specialties.map(item => ({ value: item.id, label: `${item.code} ${item.name}` }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Форма" value={groupDraft.formOfStudy} onChange={value => setGroupDraft(prev => ({ ...prev, formOfStudy: value as FormOfStudy }))} options={Object.values(FormOfStudy).map(value => ({ value, label: value }))} />
                <Select label="Смена" value={groupDraft.shift || 'both'} onChange={value => setGroupDraft(prev => ({ ...prev, shift: value as StudyShift }))} options={Object.entries(SHIFT_LABELS).map(([value, label]) => ({ value, label }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Год набора" type="number" value={groupDraft.admissionYear || ''} onChange={value => setGroupDraft(prev => ({ ...prev, admissionYear: Number(value) || undefined }))} />
                <Select label="Закреплённая аудитория" value={groupDraft.pinnedClassroomId || ''} onChange={value => setGroupDraft(prev => ({ ...prev, pinnedClassroomId: value }))} options={[{ value: '', label: 'Не задана' }, ...classrooms.map(item => ({ value: item.id, label: `${item.number} · ${item.capacity} мест` }))]} />
              </div>
              <Select label="Куратор" value={groupDraft.curatorTeacherId || ''} onChange={value => setGroupDraft(prev => ({ ...prev, curatorTeacherId: value }))} options={[{ value: '', label: 'Не задан' }, ...teachers.map(item => ({ value: item.id, label: item.name }))]} />
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Сетка расписания группы</h3>
                  <p className="mt-1 text-xs text-gray-500">Отмечайте желательные, нежелательные и запрещённые слоты для генератора расписания.</p>
                </div>
                <AvailabilityGridEditor
                  grid={groupDraft.availabilityGrid || {}}
                  onGridChange={availabilityGrid => setGroupDraft(prev => ({ ...prev, availabilityGrid }))}
                />
              </div>
              <Textarea label="Заметки" value={groupDraft.notes || ''} onChange={value => setGroupDraft(prev => ({ ...prev, notes: value }))} />
              <div className="flex gap-2">
                <button onClick={saveGroup} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <PlusIcon className="h-5 w-5" />
                  {editingGroupId ? 'Сохранить' : 'Добавить'}
                </button>
                {editingGroupId && (
                  <button onClick={resetGroupDraft} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">Список групп</h2>
                <p className="text-sm text-gray-500">Выберите несколько групп для массовых операций или создания потока.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select compact value={bulkShift} onChange={value => setBulkShift(value as StudyShift)} options={Object.entries(SHIFT_LABELS).map(([value, label]) => ({ value, label }))} />
                <button onClick={applyBulkShift} disabled={selectedGroupIds.size === 0} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50 hover:bg-gray-50">
                  Назначить смену
                </button>
                <button onClick={promoteSelectedGroups} disabled={selectedGroupIds.size === 0} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50 hover:bg-gray-50">
                  Перевести курс
                </button>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredGroups.map(group => (
                <GroupRow
                  key={group.id}
                  group={group}
                  selected={selectedGroup?.id === group.id}
                  checked={selectedGroupIds.has(group.id)}
                  departmentName={departments.find(item => item.id === group.departmentId)?.name || 'Кафедра не задана'}
                  specialtyName={specialties.find(item => item.id === group.specialtyId)?.name || 'Специальность не задана'}
                  subgroupCount={subgroups.filter(item => item.parentGroupId === group.id).length}
                  streamCount={streams.filter(item => item.groupIds.includes(group.id)).length}
                  onSelect={() => setSelectedGroupId(group.id)}
                  onCheck={() => toggleSelectedGroup(group.id)}
                  onEdit={() => editGroup(group)}
                  onDelete={() => removeGroup(group)}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'subgroups' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Быстрое деление группы</h2>
            <div className="mt-4 space-y-3">
              <Select label="Группа" value={selectedGroup?.id || ''} onChange={setSelectedGroupId} options={groups.map(group => ({ value: group.id, label: getGroupLabel(group) }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Частей" type="number" value={splitParts} onChange={value => setSplitParts(Math.max(2, Number(value) || 2))} />
                <Select label="Тип" value={splitType} onChange={value => setSplitType(value as SubgroupType)} options={Object.entries(SUBGROUP_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
              </div>
              <button onClick={createSubgroupsForSelectedGroup} disabled={!selectedGroup} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-700">
                <PlusIcon className="h-5 w-5" />
                Создать подгруппы
              </button>
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">
                Численность распределяется автоматически, остаток добавляется в первые подгруппы.
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-950">{getGroupLabel(selectedGroup)}</h2>
            {selectedGroupSubgroups.length === 0 ? (
              <EmptyState title="Подгруппы ещё не созданы" text="Создайте деление для лабораторных, языковых или проектных занятий." />
            ) : selectedGroupSubgroups.map(subgroup => (
              <div key={subgroup.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_160px_180px_auto] lg:items-end">
                  <Input label="Название" value={subgroup.name} onChange={value => updateSubgroup(subgroup, { name: value })} />
                  <Input label="Студентов" type="number" value={subgroup.studentCount} onChange={value => updateSubgroup(subgroup, { studentCount: Number(value) || 1 })} />
                  <Select label="Тип" value={subgroup.type || 'general'} onChange={value => updateSubgroup(subgroup, { type: value as SubgroupType })} options={Object.entries(SUBGROUP_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
                  <button onClick={() => deleteItem('subgroups', subgroup.id)} className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
                <Textarea label="Заметки к подгруппе" value={subgroup.notes || ''} onChange={value => updateSubgroup(subgroup, { notes: value })} />
                <div className="mt-4 rounded-md border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-800">Назначения преподавателей</h3>
                    <button onClick={() => addTeacherAssignment(subgroup)} className="text-sm font-semibold text-blue-700 hover:text-blue-900">Добавить</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(subgroup.teacherAssignments || []).map((assignment, index) => (
                      <div key={`${assignment.subjectId}-${assignment.teacherId}-${index}`} className="grid gap-2 lg:grid-cols-[1fr_1fr_160px_auto]">
                        <Select compact value={assignment.subjectId} onChange={value => updateTeacherAssignment(subgroup, index, { subjectId: value })} options={subjects.map(item => ({ value: item.id, label: item.name }))} />
                        <Select compact value={assignment.teacherId} onChange={value => updateTeacherAssignment(subgroup, index, { teacherId: value })} options={teachers.map(item => ({ value: item.id, label: item.name }))} />
                        <Select compact value={assignment.classType} onChange={value => updateTeacherAssignment(subgroup, index, { classType: value as ClassType })} options={CLASS_TYPES_FOR_ASSIGNMENTS.map(value => ({ value, label: value }))} />
                        <button onClick={() => removeTeacherAssignment(subgroup, index)} className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-600 hover:bg-white">Удалить</button>
                      </div>
                    ))}
                    {(subgroup.teacherAssignments || []).length === 0 && <p className="text-sm text-gray-500">Для подгруппы пока нет специальных назначений.</p>}
                  </div>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'streams' && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">{editingStreamId ? 'Редактировать поток' : 'Конструктор потока'}</h2>
            <div className="mt-4 space-y-3">
              <Input label="Название потока" value={streamDraft.name} onChange={value => setStreamDraft(prev => ({ ...prev, name: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Тип" value={streamDraft.type || 'lecture'} onChange={value => setStreamDraft(prev => ({ ...prev, type: value as StreamType }))} options={Object.entries(STREAM_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
                <Input label="Семестр" type="number" value={streamDraft.semester || ''} onChange={value => setStreamDraft(prev => ({ ...prev, semester: Number(value) || undefined }))} />
              </div>
              <Select label="Дисциплина (необязательно, ограничивает поток)" value={streamDraft.subjectId || ''} onChange={value => setStreamDraft(prev => ({ ...prev, subjectId: value }))} options={[{ value: '', label: 'Любые общие дисциплины' }, ...subjects.map(item => ({ value: item.id, label: item.name }))]} />
              <Select label="Преподаватель" value={streamDraft.teacherId || ''} onChange={value => setStreamDraft(prev => ({ ...prev, teacherId: value }))} options={[{ value: '', label: 'Не задан' }, ...teachers.map(item => ({ value: item.id, label: item.name }))]} />
              <Select label="Тип аудитории" value={streamDraft.classroomTypeId || ''} onChange={value => setStreamDraft(prev => ({ ...prev, classroomTypeId: value }))} options={[{ value: '', label: 'Любой' }, ...classroomTypes.map(item => ({ value: item.id, label: item.name }))]} />
              <Input label="Лимит студентов" type="number" value={streamDraft.maxStudentCount || ''} onChange={value => setStreamDraft(prev => ({ ...prev, maxStudentCount: Number(value) || undefined }))} />
              <Textarea label="Заметки" value={streamDraft.notes || ''} onChange={value => setStreamDraft(prev => ({ ...prev, notes: value }))} />
              <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                В поток попадут отмеченные группы из списка. Сейчас выбрано: {selectedGroupIds.size}.
              </div>
              <div className="flex gap-2">
                <button onClick={saveStream} className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                  <PlusIcon className="h-5 w-5" />
                  {editingStreamId ? 'Сохранить поток' : 'Создать поток'}
                </button>
                {editingStreamId && (
                  <button onClick={() => { setEditingStreamId(null); setStreamDraft(emptyStreamDraft()); setSelectedGroupIds(new Set()); }} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    Отмена
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Группы для потока</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {filteredGroups.map(group => (
                  <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input type="checkbox" checked={selectedGroupIds.has(group.id)} onChange={() => toggleSelectedGroup(group.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{group.number}</span>
                      <span className="text-xs text-gray-500">{group.studentCount} студентов · {SHIFT_LABELS[group.shift || 'both']}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {streams.map(stream => (
                <div key={stream.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-950">{stream.name}</h3>
                      <p className="text-sm text-gray-500">{STREAM_TYPE_LABELS[stream.type || 'custom']} · {streamStudents(stream)} студентов</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => editStream(stream)} className="text-blue-700 hover:text-blue-900"><EditIcon /></button>
                      <button onClick={() => deleteItem('streams', stream.id)} className="text-red-600 hover:text-red-800"><TrashIcon /></button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stream.groupIds.map(groupId => (
                      <span key={groupId} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                        {groups.find(group => group.id === groupId)?.number || 'Группа удалена'}
                      </span>
                    ))}
                  </div>
                  {stream.notes && <p className="mt-3 text-sm text-gray-600">{stream.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'quality' && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="text-lg font-semibold text-gray-950">Проверка готовности контингента</h2>
            <p className="text-sm text-gray-500">Эти предупреждения помогают заранее поймать причины, по которым генератор не сможет поставить занятия.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {qualityIssues.length === 0 ? (
              <EmptyState title="Критичных замечаний нет" text="Группы, подгруппы и потоки выглядят готовыми к планированию." />
            ) : qualityIssues.map((issue, index) => (
              <button
                key={`${issue.title}-${index}`}
                onClick={() => {
                  if (issue.groupId) {
                    setSelectedGroupId(issue.groupId);
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
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-700">
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

const GroupRow: React.FC<{
  group: Group;
  selected: boolean;
  checked: boolean;
  departmentName: string;
  specialtyName: string;
  subgroupCount: number;
  streamCount: number;
  onSelect: () => void;
  onCheck: () => void;
  onEdit: () => void;
  onDelete?: () => void;
}> = ({ group, selected, checked, departmentName, specialtyName, subgroupCount, streamCount, onSelect, onCheck, onEdit, onDelete }) => (
  <div className={`flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between ${selected ? 'bg-blue-50/70' : 'bg-white'}`}>
    <div className="flex min-w-0 items-start gap-3">
      <input type="checkbox" checked={checked} onChange={onCheck} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600" />
      <button onClick={onSelect} className="min-w-0 text-left">
        <span className="block text-base font-semibold text-gray-950">{group.number}</span>
        <span className="block truncate text-sm text-gray-500">{specialtyName}</span>
        <span className="block truncate text-xs text-gray-400">{departmentName}</span>
      </button>
    </div>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="rounded-full bg-gray-100 px-2 py-1 font-semibold text-gray-700">{group.course} курс</span>
      <span className="rounded-full bg-green-50 px-2 py-1 font-semibold text-green-700">{group.studentCount} студентов</span>
      <span className="rounded-full bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">{SHIFT_LABELS[group.shift || 'both']}</span>
      <span className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">{subgroupCount} подгрупп</span>
      <span className="rounded-full bg-blue-50 px-2 py-1 font-semibold text-blue-700">{streamCount} потоков</span>
      <button onClick={onEdit} className="rounded-md border border-gray-200 p-1.5 text-blue-700 hover:bg-white" title="Редактировать"><EditIcon /></button>
      {onDelete && <button onClick={onDelete} className="rounded-md border border-gray-200 p-1.5 text-red-600 hover:bg-white" title="Удалить"><TrashIcon /></button>}
    </div>
  </div>
);

const SelectedGroupPanel: React.FC<{
  group?: Group;
  subgroups: Subgroup[];
  streams: Stream[];
  departments: any[];
  specialties: any[];
  faculties: any[];
  teachers: any[];
  classrooms: any[];
  scheduleCount: number;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ group, subgroups, streams, departments, specialties, faculties, teachers, classrooms, scheduleCount, onEdit, onDelete }) => {
  if (!group) return <EmptyState title="Группа не выбрана" text="Выберите группу в списке, чтобы увидеть её карточку." />;
  const department = departments.find(item => item.id === group.departmentId);
  const faculty = faculties.find(item => item.id === department?.facultyId);
  const specialty = specialties.find(item => item.id === group.specialtyId);
  const teacher = teachers.find(item => item.id === group.curatorTeacherId);
  const classroom = classrooms.find(item => item.id === group.pinnedClassroomId);

  return (
    <aside className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-950">{group.number}</h2>
          <p className="text-sm text-gray-500">{group.course} курс · {group.studentCount} студентов · {SHIFT_LABELS[group.shift || 'both']}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="rounded-md border border-gray-300 p-2 text-blue-700 hover:bg-gray-50"><EditIcon /></button>
          <button onClick={onDelete} className="rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50"><TrashIcon /></button>
        </div>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <Info label="Факультет" value={faculty?.name || 'Не задан'} />
        <Info label="Кафедра" value={department?.name || 'Не задана'} />
        <Info label="Специальность" value={specialty ? `${specialty.code} ${specialty.name}` : 'Не задана'} />
        <Info label="Форма обучения" value={group.formOfStudy} />
        <Info label="Куратор" value={teacher?.name || 'Не задан'} />
        <Info label="Аудитория" value={classroom ? `${classroom.number} · ${classroom.capacity} мест` : 'Не закреплена'} />
        <Info label="В расписании" value={`${scheduleCount} занятий`} />
      </dl>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniMetric label="Подгруппы" value={subgroups.length} />
        <MiniMetric label="Потоки" value={streams.length} />
      </div>
      {group.notes && <p className="mt-5 rounded-md bg-gray-50 p-3 text-sm text-gray-600">{group.notes}</p>}
    </aside>
  );
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
    <dt className="text-gray-500">{label}</dt>
    <dd className="font-medium text-gray-900">{value}</dd>
  </div>
);

const MiniMetric: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="rounded-md bg-gray-50 p-3">
    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-xl font-bold text-gray-950">{value}</p>
  </div>
);

const EmptyState: React.FC<{ title: string; text: string }> = ({ title, text }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
    <DocumentIcon />
    <h3 className="mt-3 text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-1 text-sm text-gray-500">{text}</p>
  </div>
);

const DocumentIcon: React.FC = () => (
  <svg className="mx-auto h-10 w-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6l6 6v10a2 2 0 01-2 2z" />
  </svg>
);

const Input: React.FC<{ label: string; value: string | number; type?: string; onChange: (value: string) => void }> = ({ label, value, type = 'text', onChange }) => (
  <label className="block">
    <span className="text-sm font-medium text-gray-700">{label}</span>
    <input
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  </label>
);

const Select: React.FC<{ label?: string; value: string; options: { value: string; label: string }[]; compact?: boolean; onChange: (value: string) => void }> = ({ label, value, options, compact, onChange }) => {
  const control = (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className={`${compact ? '' : 'mt-1'} w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
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
      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  </label>
);

export default CohortManager;
