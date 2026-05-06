import React, { useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { AttestationType, ClassType, FormOfStudy, TeacherSubjectLink } from '../types';
import { AlertIcon, CheckCircleIcon, CopyIcon, EditIcon, PlusIcon, SparklesIcon, TrashIcon } from './icons';

type LinkRole = NonNullable<TeacherSubjectLink['role']>;
type ProblemLevel = 'error' | 'warning' | 'info';

interface CoverageNeed {
  subjectId: string;
  classType: ClassType;
  planCount: number;
  semesterLabels: string[];
}

interface LinkProblem {
  level: ProblemLevel;
  title: string;
  detail: string;
  subjectId?: string;
  classType?: ClassType;
  teacherId?: string;
  suggestion: string;
}

const ROLE_LABELS: Record<LinkRole, string> = {
  primary: 'Основной',
  reserve: 'Резервный',
  overloadOnly: 'Только при перегрузке',
  examiner: 'Экзаменатор',
  assistant: 'Ассистент',
  undesirable: 'Нежелательно',
};

const ROLE_BADGES: Record<LinkRole, string> = {
  primary: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reserve: 'bg-blue-50 text-blue-700 border-blue-200',
  overloadOnly: 'bg-amber-50 text-amber-700 border-amber-200',
  examiner: 'bg-violet-50 text-violet-700 border-violet-200',
  assistant: 'bg-sky-50 text-sky-700 border-sky-200',
  undesirable: 'bg-red-50 text-red-700 border-red-200',
};

const COVERAGE_CLASS_TYPES = [
  ClassType.Lecture,
  ClassType.Practical,
  ClassType.Lab,
  ClassType.Consultation,
  ClassType.Test,
  ClassType.Exam,
];

const controlClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
const buttonClass = 'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50';
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700';

const getLinkRole = (link: TeacherSubjectLink): LinkRole => link.role || 'primary';
const isLinkActive = (link: TeacherSubjectLink) => link.isActive !== false;

const LinkManager: React.FC = () => {
  const store = useStore();
  const {
    teachers,
    subjects,
    teacherSubjectLinks,
    departments,
    groups,
    specialties,
    educationalPlans,
    classrooms,
    classroomTypes,
    schedule,
    addItem,
    updateItem,
    deleteItem,
  } = store;

  const [activeTab, setActiveTab] = useState<'matrix' | 'links' | 'diagnostics'>('matrix');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<TeacherSubjectLink | null>(null);
  const [draft, setDraft] = useState<Partial<TeacherSubjectLink> | null>(null);
  const [filters, setFilters] = useState({
    query: '',
    departmentId: 'all',
    teacherId: 'all',
    subjectId: 'all',
    classType: 'all',
    role: 'all',
    problemOnly: false,
  });

  const subjectById = useMemo(() => new Map(subjects.map(subject => [subject.id, subject])), [subjects]);
  const teacherById = useMemo(() => new Map(teachers.map(teacher => [teacher.id, teacher])), [teachers]);

  const coverageNeeds = useMemo<CoverageNeed[]>(() => {
    const map = new Map<string, CoverageNeed>();
    const addNeed = (subjectId: string, classType: ClassType, semester: number, planId: string) => {
      const key = `${subjectId}::${classType}`;
      const current = map.get(key) || { subjectId, classType, planCount: 0, semesterLabels: [] };
      current.planCount += 1;
      current.semesterLabels.push(`${semester} сем. (${planId.slice(0, 6)})`);
      map.set(key, current);
    };

    educationalPlans.forEach(plan => {
      plan.entries.forEach(entry => {
        if (entry.lectureHours > 0) addNeed(entry.subjectId, ClassType.Lecture, entry.semester, plan.id);
        if (entry.practiceHours > 0) addNeed(entry.subjectId, ClassType.Practical, entry.semester, plan.id);
        if (entry.labHours > 0) addNeed(entry.subjectId, ClassType.Lab, entry.semester, plan.id);
        if (entry.attestation === AttestationType.Exam) addNeed(entry.subjectId, ClassType.Exam, entry.semester, plan.id);
        if (entry.attestation === AttestationType.Test || entry.attestation === AttestationType.DifferentiatedTest) addNeed(entry.subjectId, ClassType.Test, entry.semester, plan.id);
      });
    });

    return Array.from(map.values());
  }, [educationalPlans]);

  const linksBySubjectType = useMemo(() => {
    const map = new Map<string, TeacherSubjectLink[]>();
    teacherSubjectLinks.forEach(link => {
      link.classTypes.forEach(classType => {
        const key = `${link.subjectId}::${classType}`;
        map.set(key, [...(map.get(key) || []), link]);
      });
    });
    return map;
  }, [teacherSubjectLinks]);

  const requiredSubjectIds = useMemo(() => new Set(coverageNeeds.map(need => need.subjectId)), [coverageNeeds]);

  const matrixSubjects = useMemo(() => {
    return subjects
      .filter(subject => requiredSubjectIds.has(subject.id) || teacherSubjectLinks.some(link => link.subjectId === subject.id))
      .filter(subject => {
        const query = filters.query.trim().toLowerCase();
        if (filters.subjectId !== 'all' && subject.id !== filters.subjectId) return false;
        if (query && !subject.name.toLowerCase().includes(query)) {
          const linkedTeacherNames = teacherSubjectLinks
            .filter(link => link.subjectId === subject.id)
            .map(link => teacherById.get(link.teacherId)?.name || '')
            .join(' ')
            .toLowerCase();
          if (!linkedTeacherNames.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects, requiredSubjectIds, teacherSubjectLinks, filters, teacherById]);

  const teacherLoad = useMemo(() => {
    const map = new Map<string, number>();
    schedule.forEach(entry => map.set(entry.teacherId, (map.get(entry.teacherId) || 0) + 1));
    return map;
  }, [schedule]);

  const filteredLinks = useMemo(() => teacherSubjectLinks.filter(link => {
    const teacher = teacherById.get(link.teacherId);
    const subject = subjectById.get(link.subjectId);
    const query = filters.query.trim().toLowerCase();
    if (filters.teacherId !== 'all' && link.teacherId !== filters.teacherId) return false;
    if (filters.subjectId !== 'all' && link.subjectId !== filters.subjectId) return false;
    if (filters.role !== 'all' && getLinkRole(link) !== filters.role) return false;
    if (filters.classType !== 'all' && !link.classTypes.includes(filters.classType as ClassType)) return false;
    if (filters.departmentId !== 'all' && teacher?.departmentId !== filters.departmentId) return false;
    if (query && !`${teacher?.name || ''} ${subject?.name || ''} ${link.notes || ''}`.toLowerCase().includes(query)) return false;
    return true;
  }), [teacherSubjectLinks, filters, teacherById, subjectById]);

  const problems = useMemo<LinkProblem[]>(() => {
    const result: LinkProblem[] = [];

    coverageNeeds.forEach(need => {
      const activeLinks = (linksBySubjectType.get(`${need.subjectId}::${need.classType}`) || []).filter(isLinkActive);
      const subjectName = subjectById.get(need.subjectId)?.name || need.subjectId;
      if (activeLinks.length === 0) {
        result.push({
          level: 'error',
          title: 'Нет преподавателя для типа занятия',
          detail: `${subjectName}: ${need.classType}. Встречается в планах: ${need.planCount}.`,
          subjectId: need.subjectId,
          classType: need.classType,
          suggestion: 'Добавьте хотя бы одного основного преподавателя или резервного кандидата.',
        });
      } else if (activeLinks.length === 1) {
        result.push({
          level: 'warning',
          title: 'Нет резерва',
          detail: `${subjectName}: ${need.classType}. Единственный кандидат: ${teacherById.get(activeLinks[0].teacherId)?.name || activeLinks[0].teacherId}.`,
          subjectId: need.subjectId,
          classType: need.classType,
          teacherId: activeLinks[0].teacherId,
          suggestion: 'Добавьте резервного преподавателя, чтобы генератор мог обходить занятость и перегруз.',
        });
      }
    });

    const duplicateMap = new Map<string, TeacherSubjectLink[]>();
    teacherSubjectLinks.forEach(link => {
      const key = `${link.teacherId}::${link.subjectId}`;
      duplicateMap.set(key, [...(duplicateMap.get(key) || []), link]);
    });
    duplicateMap.forEach(links => {
      if (links.length > 1) {
        const first = links[0];
        result.push({
          level: 'warning',
          title: 'Дубли привязок',
          detail: `${teacherById.get(first.teacherId)?.name || first.teacherId} -> ${subjectById.get(first.subjectId)?.name || first.subjectId}: ${links.length} записей.`,
          teacherId: first.teacherId,
          subjectId: first.subjectId,
          suggestion: 'Объедините дубли в одну запись с общим набором типов занятий.',
        });
      }
    });

    teacherSubjectLinks.forEach(link => {
      const teacher = teacherById.get(link.teacherId);
      const subject = subjectById.get(link.subjectId);
      if (!teacher) {
        result.push({ level: 'error', title: 'Преподаватель не найден', detail: `Привязка содержит битую ссылку: ${link.teacherId}.`, teacherId: link.teacherId, suggestion: 'Удалите привязку или выберите существующего преподавателя.' });
      }
      if (!subject) {
        result.push({ level: 'error', title: 'Дисциплина не найдена', detail: `Привязка содержит битую ссылку: ${link.subjectId}.`, subjectId: link.subjectId, suggestion: 'Удалите привязку или выберите существующую дисциплину.' });
      }
      if (link.classTypes.length === 0) {
        result.push({ level: 'error', title: 'Нет типов занятий', detail: `${teacher?.name || link.teacherId} -> ${subject?.name || link.subjectId}.`, teacherId: link.teacherId, subjectId: link.subjectId, suggestion: 'Укажите хотя бы один тип занятия.' });
      }
      if (link.role === 'primary' && link.priority !== undefined && link.priority < 0) {
        result.push({ level: 'info', title: 'Низкий приоритет у основного', detail: `${teacher?.name || link.teacherId} отмечен основным, но имеет отрицательный приоритет.`, teacherId: link.teacherId, subjectId: link.subjectId, suggestion: 'Поднимите приоритет или смените роль на резервную/нежелательную.' });
      }
      const load = teacherLoad.get(link.teacherId) || 0;
      if (link.maxSemesterLessons !== undefined && load > link.maxSemesterLessons) {
        result.push({ level: 'warning', title: 'Превышен лимит по привязке', detail: `${teacher?.name || link.teacherId}: ${load} пар при лимите ${link.maxSemesterLessons}.`, teacherId: link.teacherId, subjectId: link.subjectId, suggestion: 'Добавьте резервного преподавателя или увеличьте лимит для этой дисциплины.' });
      }
    });

    return result;
  }, [coverageNeeds, linksBySubjectType, teacherSubjectLinks, subjectById, teacherById, teacherLoad]);

  const visibleProblems = useMemo(() => problems.filter(problem => {
    if (filters.subjectId !== 'all' && problem.subjectId !== filters.subjectId) return false;
    if (filters.teacherId !== 'all' && problem.teacherId !== filters.teacherId) return false;
    if (filters.classType !== 'all' && problem.classType !== filters.classType) return false;
    return true;
  }), [problems, filters]);

  const stats = useMemo(() => {
    const activeLinks = teacherSubjectLinks.filter(isLinkActive);
    const needs = coverageNeeds.length;
    const covered = coverageNeeds.filter(need => (linksBySubjectType.get(`${need.subjectId}::${need.classType}`) || []).some(isLinkActive)).length;
    const noReserve = coverageNeeds.filter(need => (linksBySubjectType.get(`${need.subjectId}::${need.classType}`) || []).filter(isLinkActive).length === 1).length;
    return {
      links: teacherSubjectLinks.length,
      active: activeLinks.length,
      coverage: needs ? Math.round(covered / needs * 100) : 100,
      missing: needs - covered,
      noReserve,
      errors: problems.filter(problem => problem.level === 'error').length,
      warnings: problems.filter(problem => problem.level === 'warning').length,
    };
  }, [teacherSubjectLinks, coverageNeeds, linksBySubjectType, problems]);

  const openAddModal = (preset?: Partial<TeacherSubjectLink>) => {
    setCurrentItem(null);
    setDraft(preset || null);
    setIsModalOpen(true);
  };

  const openEditModal = (link: TeacherSubjectLink) => {
    setCurrentItem(link);
    setDraft(null);
    setIsModalOpen(true);
  };

  const handleSave = (item: Omit<TeacherSubjectLink, 'id'> | TeacherSubjectLink) => {
    const normalized = {
      ...item,
      role: item.role || 'primary',
      priority: item.priority ?? 0,
      isActive: item.isActive !== false,
      classTypes: Array.from(new Set(item.classTypes || [])),
    };
    if ('id' in normalized && normalized.id) {
      updateItem('teacherSubjectLinks', normalized as TeacherSubjectLink);
    } else {
      addItem('teacherSubjectLinks', normalized);
    }
    setIsModalOpen(false);
  };

  const mergeDuplicateLinks = () => {
    const grouped = new Map<string, TeacherSubjectLink[]>();
    teacherSubjectLinks.forEach(link => {
      const key = `${link.teacherId}::${link.subjectId}`;
      grouped.set(key, [...(grouped.get(key) || []), link]);
    });
    grouped.forEach(links => {
      if (links.length <= 1) return;
      const [first, ...duplicates] = links;
      const classTypes = Array.from(new Set(links.flatMap(link => link.classTypes)));
      const best = links.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
      updateItem('teacherSubjectLinks', {
        ...first,
        role: best.role || first.role || 'primary',
        priority: Math.max(...links.map(link => link.priority || 0)),
        isActive: links.some(isLinkActive),
        classTypes,
      });
      duplicates.forEach(link => deleteItem('teacherSubjectLinks', link.id));
    });
  };

  const deleteLink = (id: string) => {
    if (window.confirm('Вы уверены, что хотите удалить эту привязку?')) {
      deleteItem('teacherSubjectLinks', id);
    }
  };

  const renderCoverageCell = (subjectId: string, classType: ClassType) => {
    const key = `${subjectId}::${classType}`;
    const links = (linksBySubjectType.get(key) || []).filter(link => {
      if (filters.teacherId !== 'all' && link.teacherId !== filters.teacherId) return false;
      if (filters.role !== 'all' && getLinkRole(link) !== filters.role) return false;
      if (filters.departmentId !== 'all' && teacherById.get(link.teacherId)?.departmentId !== filters.departmentId) return false;
      return true;
    });
    const activeLinks = links.filter(isLinkActive);
    const need = coverageNeeds.find(item => item.subjectId === subjectId && item.classType === classType);
    const hasProblem = need && activeLinks.length <= 1;
    if (filters.problemOnly && !hasProblem) return null;

    return (
      <td key={classType} className={`min-w-[220px] border p-2 align-top ${need && activeLinks.length === 0 ? 'bg-red-50' : need && activeLinks.length === 1 ? 'bg-amber-50' : activeLinks.length > 0 ? 'bg-emerald-50' : 'bg-white'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-500">{need ? `${need.planCount} поз.` : 'не требуется'}</span>
          <button className="rounded p-1 text-blue-600 hover:bg-blue-100" title="Добавить привязку" onClick={() => openAddModal({ subjectId, classTypes: [classType], role: activeLinks.length === 0 ? 'primary' : 'reserve' })}>
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {links.map(link => {
            const role = getLinkRole(link);
            const teacher = teacherById.get(link.teacherId);
            return (
              <button key={link.id} onClick={() => openEditModal(link)} className={`block w-full rounded-md border px-2 py-1 text-left text-xs ${isLinkActive(link) ? ROLE_BADGES[role] : 'border-gray-200 bg-gray-100 text-gray-500'}`}>
                <span className="font-semibold">{teacher?.name || link.teacherId}</span>
                <span className="block opacity-80">{ROLE_LABELS[role]} · приоритет {link.priority ?? 0}</span>
              </button>
            );
          })}
          {links.length === 0 && <p className="text-xs text-gray-400">Нет привязок</p>}
        </div>
      </td>
    );
  };

  const filteredMatrixSubjects = filters.problemOnly
    ? matrixSubjects.filter(subject => COVERAGE_CLASS_TYPES.some(classType => {
      const need = coverageNeeds.find(item => item.subjectId === subject.id && item.classType === classType);
      if (!need) return false;
      return (linksBySubjectType.get(`${subject.id}::${classType}`) || []).filter(isLinkActive).length <= 1;
    }))
    : matrixSubjects;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Кадровое покрытие</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Привязки преподавателей к дисциплинам</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Матрица показывает, кто может вести каждый тип занятия, где нет резерва и какие связи станут узким местом генератора.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openAddModal()} className={primaryButtonClass}>
              <PlusIcon className="h-5 w-5" />
              Добавить привязку
            </button>
            <button onClick={mergeDuplicateLinks} className={buttonClass}>
              <SparklesIcon className="h-4 w-4" />
              Объединить дубли
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Покрытие планов" value={`${stats.coverage}%`} tone={stats.coverage > 90 ? 'green' : stats.coverage > 70 ? 'yellow' : 'red'} />
          <Metric label="Всего связей" value={stats.links} tone="blue" />
          <Metric label="Активных" value={stats.active} tone="green" />
          <Metric label="Не хватает" value={stats.missing} tone={stats.missing ? 'red' : 'green'} />
          <Metric label="Без резерва" value={stats.noReserve} tone={stats.noReserve ? 'yellow' : 'green'} />
          <Metric label="Ошибок" value={stats.errors} tone={stats.errors ? 'red' : 'green'} />
          <Metric label="Предупреждений" value={stats.warnings} tone={stats.warnings ? 'yellow' : 'green'} />
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <input className={controlClass} value={filters.query} onChange={event => setFilters(prev => ({ ...prev, query: event.target.value }))} placeholder="Поиск по дисциплине или преподавателю" />
          <Select value={filters.departmentId} onChange={value => setFilters(prev => ({ ...prev, departmentId: value }))} options={[['all', 'Все кафедры'], ...departments.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.teacherId} onChange={value => setFilters(prev => ({ ...prev, teacherId: value }))} options={[['all', 'Все преподаватели'], ...teachers.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.subjectId} onChange={value => setFilters(prev => ({ ...prev, subjectId: value }))} options={[['all', 'Все дисциплины'], ...subjects.map(item => [item.id, item.name] as [string, string])]} />
          <Select value={filters.classType} onChange={value => setFilters(prev => ({ ...prev, classType: value }))} options={[['all', 'Все типы'], ...COVERAGE_CLASS_TYPES.map(item => [item, item] as [string, string])]} />
          <Select value={filters.role} onChange={value => setFilters(prev => ({ ...prev, role: value }))} options={[['all', 'Все роли'], ...Object.entries(ROLE_LABELS)]} />
          <button className={filters.problemOnly ? primaryButtonClass : buttonClass} onClick={() => setFilters(prev => ({ ...prev, problemOnly: !prev.problemOnly }))}>Только проблемы</button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {([
          ['matrix', 'Матрица покрытия'],
          ['links', 'Все привязки'],
          ['diagnostics', 'Диагностика'],
        ] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded-md px-4 py-2 text-sm font-semibold ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'matrix' && (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="max-h-[72vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-20 bg-gray-100">
                <tr>
                  <th className="sticky left-0 z-30 min-w-[260px] border-b border-r bg-gray-100 p-3 text-left font-semibold text-gray-700">Дисциплина</th>
                  {COVERAGE_CLASS_TYPES.map(classType => (
                    <th key={classType} className="min-w-[220px] border-b border-r p-3 text-left font-semibold text-gray-700">{classType}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMatrixSubjects.map(subject => {
                  const cells = COVERAGE_CLASS_TYPES.map(classType => renderCoverageCell(subject.id, classType));
                  if (filters.problemOnly && cells.every(cell => cell === null)) return null;
                  return (
                    <tr key={subject.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 min-w-[260px] border-r bg-white p-3 align-top">
                        <p className="font-semibold text-gray-900">{subject.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {coverageNeeds.filter(need => need.subjectId === subject.id).length} позиций в планах
                        </p>
                      </td>
                      {cells}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredMatrixSubjects.length === 0 && <EmptyState text="Нет дисциплин для отображения." />}
          </div>
        </section>
      )}

      {activeTab === 'links' && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            {filteredLinks.map(link => {
              const role = getLinkRole(link);
              const teacher = teacherById.get(link.teacherId);
              const subject = subjectById.get(link.subjectId);
              return (
                <div key={link.id} className={`rounded-lg border p-4 ${isLinkActive(link) ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_BADGES[role]}`}>{ROLE_LABELS[role]}</span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Приоритет {link.priority ?? 0}</span>
                        {link.isActive === false && <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600">Отключено</span>}
                      </div>
                      <h3 className="mt-3 font-semibold text-gray-900">{teacher?.name || link.teacherId} {'->'} {subject?.name || link.subjectId}</h3>
                      <p className="mt-1 text-sm text-gray-600">{link.classTypes.join(', ')}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {[link.allowStreams === false ? 'без потоков' : '', link.maxWeeklyLessons !== undefined ? `до ${link.maxWeeklyLessons} пар/нед.` : '', link.maxSemesterLessons !== undefined ? `до ${link.maxSemesterLessons} пар/сем.` : ''].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton label="Редактировать" onClick={() => openEditModal(link)}><EditIcon className="h-5 w-5" /></IconButton>
                      <IconButton label="Копировать" onClick={() => openAddModal({ ...link, id: undefined, role: 'reserve', priority: Math.max(0, (link.priority || 0) - 1) })}><CopyIcon className="h-5 w-5" /></IconButton>
                      <IconButton label="Удалить" danger onClick={() => deleteLink(link.id)}><TrashIcon className="h-5 w-5" /></IconButton>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredLinks.length === 0 && <EmptyState text="Привязки не найдены." />}
          </div>
        </section>
      )}

      {activeTab === 'diagnostics' && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            {visibleProblems.map((problem, index) => (
              <div key={`${problem.title}-${index}`} className={`rounded-lg border p-4 ${problem.level === 'error' ? 'border-red-200 bg-red-50' : problem.level === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className={`font-semibold ${problem.level === 'error' ? 'text-red-900' : problem.level === 'warning' ? 'text-amber-900' : 'text-blue-900'}`}>{problem.title}</p>
                    <p className="mt-1 text-sm text-gray-700">{problem.detail}</p>
                    <p className="mt-2 text-sm font-medium text-gray-900">Решение: {problem.suggestion}</p>
                  </div>
                  {problem.subjectId && problem.classType && (
                    <button className={buttonClass} onClick={() => openAddModal({ subjectId: problem.subjectId, classTypes: [problem.classType!], role: problem.level === 'error' ? 'primary' : 'reserve' })}>
                      <PlusIcon className="h-4 w-4" />
                      Добавить
                    </button>
                  )}
                </div>
              </div>
            ))}
            {visibleProblems.length === 0 && <EmptyState text="Проблем по текущим фильтрам не найдено." />}
          </div>
        </section>
      )}

      {isModalOpen && (
        <AdvancedLinkModal
          initialData={currentItem || draft}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          teachers={teachers}
          subjects={subjects}
          groups={groups}
          classrooms={classrooms}
          classroomTypes={classroomTypes}
        />
      )}
    </div>
  );
};

const AdvancedLinkModal: React.FC<{
  initialData: Partial<TeacherSubjectLink> | null;
  onClose: () => void;
  onSave: (item: Omit<TeacherSubjectLink, 'id'> | TeacherSubjectLink) => void;
  teachers: { id: string; name: string; departmentId: string }[];
  subjects: { id: string; name: string }[];
  groups: { id: string; number: string; formOfStudy: FormOfStudy }[];
  classrooms: { id: string; number: string }[];
  classroomTypes: { id: string; name: string }[];
}> = ({ initialData, onClose, onSave, teachers, subjects, groups, classrooms, classroomTypes }) => {
  const [formData, setFormData] = useState<Partial<TeacherSubjectLink>>({
    teacherId: teachers[0]?.id || '',
    subjectId: subjects[0]?.id || '',
    classTypes: [ClassType.Lecture],
    role: 'primary',
    priority: 0,
    isActive: true,
    allowStreams: true,
    ...initialData,
  });

  const update = (patch: Partial<TeacherSubjectLink>) => setFormData(prev => ({ ...prev, ...patch }));

  const toggleClassType = (classType: ClassType) => {
    const current = formData.classTypes || [];
    update({
      classTypes: current.includes(classType)
        ? current.filter(item => item !== classType)
        : [...current, classType],
    });
  };

  const toggleArrayValue = (field: keyof TeacherSubjectLink, value: string) => {
    const current = ((formData as any)[field] || []) as string[];
    update({
      [field]: current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value],
    } as Partial<TeacherSubjectLink>);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.teacherId || !formData.subjectId || !formData.classTypes?.length) {
      alert('Выберите преподавателя, дисциплину и хотя бы один тип занятия.');
      return;
    }
    onSave(formData as TeacherSubjectLink);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{formData.id ? 'Редактировать привязку' : 'Добавить привязку'}</h2>
              <p className="text-sm text-gray-500">Роль, приоритет и ограничения используются генератором при выборе преподавателя.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={buttonClass}>Отмена</button>
              <button type="submit" className={primaryButtonClass}>Сохранить</button>
            </div>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <section className="space-y-4">
              <h3 className="font-semibold text-gray-900">Основное</h3>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Преподаватель</span>
                <select value={formData.teacherId || ''} onChange={event => update({ teacherId: event.target.value })} className={controlClass}>
                  {teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Дисциплина</span>
                <select value={formData.subjectId || ''} onChange={event => update({ subjectId: event.target.value })} className={controlClass}>
                  {subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">Типы занятий</span>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(ClassType).filter(type => type !== ClassType.Elective).map(classType => (
                    <label key={classType} className="flex items-center gap-2 rounded-md border border-gray-200 p-2 text-sm">
                      <input type="checkbox" checked={(formData.classTypes || []).includes(classType)} onChange={() => toggleClassType(classType)} />
                      {classType}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="font-semibold text-gray-900">Роль и приоритет</h3>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Уровень преподавателя</span>
                <select value={formData.role || 'primary'} onChange={event => update({ role: event.target.value as LinkRole })} className={controlClass}>
                  {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Приоритет</span>
                <input type="number" min="-10" max="10" value={formData.priority ?? 0} onChange={event => update({ priority: Number(event.target.value) })} className={controlClass} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Лимит в неделю</span>
                  <input type="number" min="0" value={formData.maxWeeklyLessons ?? ''} onChange={event => update({ maxWeeklyLessons: event.target.value ? Number(event.target.value) : undefined })} className={controlClass} />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Лимит за семестр</span>
                  <input type="number" min="0" value={formData.maxSemesterLessons ?? ''} onChange={event => update({ maxSemesterLessons: event.target.value ? Number(event.target.value) : undefined })} className={controlClass} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={formData.isActive !== false} onChange={event => update({ isActive: event.target.checked })} />
                Привязка активна
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={formData.allowStreams !== false} onChange={event => update({ allowStreams: event.target.checked })} />
                Можно использовать для потоков
              </label>
            </section>

            <section className="space-y-4">
              <h3 className="font-semibold text-gray-900">Ограничения по контингенту</h3>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-700">Формы обучения</span>
                <div className="flex flex-wrap gap-2">
                  {Object.values(FormOfStudy).map(form => (
                    <label key={form} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm">
                      <input type="checkbox" checked={(formData.allowedFormOfStudy || []).includes(form)} onChange={() => toggleArrayValue('allowedFormOfStudy', form)} />
                      {form}
                    </label>
                  ))}
                </div>
              </div>
              <MultiSelect label="Разрешённые группы" values={formData.allowedGroupIds || []} options={groups.map(group => ({ id: group.id, name: group.number }))} onToggle={value => toggleArrayValue('allowedGroupIds', value)} />
              <MultiSelect label="Исключённые группы" values={formData.excludedGroupIds || []} options={groups.map(group => ({ id: group.id, name: group.number }))} onToggle={value => toggleArrayValue('excludedGroupIds', value)} />
            </section>

            <section className="space-y-4">
              <h3 className="font-semibold text-gray-900">Аудиторные ограничения</h3>
              <MultiSelect label="Разрешённые аудитории" values={formData.allowedClassroomIds || []} options={classrooms.map(classroom => ({ id: classroom.id, name: classroom.number }))} onToggle={value => toggleArrayValue('allowedClassroomIds', value)} />
              <MultiSelect label="Разрешённые типы аудиторий" values={formData.allowedClassroomTypeIds || []} options={classroomTypes.map(type => ({ id: type.id, name: type.name }))} onToggle={value => toggleArrayValue('allowedClassroomTypeIds', value)} />
              <label>
                <span className="mb-1 block text-sm font-medium text-gray-700">Комментарий</span>
                <textarea value={formData.notes || ''} onChange={event => update({ notes: event.target.value })} className={`${controlClass} h-24`} />
              </label>
            </section>
          </div>
        </form>
      </div>
    </div>
  );
};

const MultiSelect: React.FC<{ label: string; values: string[]; options: { id: string; name: string }[]; onToggle: (value: string) => void }> = ({ label, values, options, onToggle }) => (
  <div>
    <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
    <div className="max-h-32 overflow-auto rounded-md border border-gray-200 p-2">
      {options.map(option => (
        <label key={option.id} className="flex items-center gap-2 py-1 text-sm">
          <input type="checkbox" checked={values.includes(option.id)} onChange={() => onToggle(option.id)} />
          {option.name}
        </label>
      ))}
      {options.length === 0 && <p className="text-sm text-gray-400">Нет данных</p>}
    </div>
  </div>
);

const Select: React.FC<{ value: string; onChange: (value: string) => void; options: [string, string][] }> = ({ value, onChange, options }) => (
  <select value={value} onChange={event => onChange(event.target.value)} className={controlClass}>
    {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
  </select>
);

const Metric: React.FC<{ label: string; value: React.ReactNode; tone: 'blue' | 'green' | 'yellow' | 'red' }> = ({ label, value, tone }) => {
  const colors = {
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    yellow: 'border-amber-100 bg-amber-50 text-amber-800',
    red: 'border-red-100 bg-red-50 text-red-800',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
};

const IconButton: React.FC<{ label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ label, onClick, danger, children }) => (
  <button title={label} aria-label={label} onClick={onClick} className={`rounded-md p-2 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100'}`}>
    {children}
  </button>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">{text}</div>
);

export default LinkManager;
