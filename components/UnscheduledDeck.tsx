import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import UnscheduledCard from './UnscheduledCard';
import { DocumentSearchIcon, TrashIcon } from './icons';
import { useDrop } from 'react-dnd';
import { ItemTypes } from '../constants';
import { ScheduleEntry } from '../types';

const UnscheduledDeck: React.FC = () => {
  const { 
    unscheduledEntries, groups, teachers, subjects, deleteScheduleEntry, 
    unscheduledTimeHorizon, setUnscheduledTimeHorizon 
  } = useStore();
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [teacherFilter, setTeacherFilter] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('');

  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: ItemTypes.SCHEDULE_ENTRY,
    drop: (item: ScheduleEntry) => {
      if (window.confirm('Вернуть это занятие в нераспределенные?')) {
        deleteScheduleEntry(item);
      }
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  }), [deleteScheduleEntry]);

  const filteredEntries = useMemo(() => {
    return unscheduledEntries.filter(entry => {
      return (
        (groupFilter === '' || entry.groupId === groupFilter) &&
        (teacherFilter === '' || entry.teacherId === teacherFilter) &&
        (subjectFilter === '' || entry.subjectId === subjectFilter)
      );
    });
  }, [unscheduledEntries, groupFilter, teacherFilter, subjectFilter]);

  let dropzoneClasses = 'bg-white border-transparent';
  if (canDrop && isOver) dropzoneClasses = 'bg-red-100 border-red-500 border-dashed scale-[1.01]';
  else if (canDrop) dropzoneClasses = 'bg-red-50/50 border-red-400 border-dashed';

  const horizonOptions: { value: 'week' | 'twoWeeks' | 'semester', label: string }[] = [
    { value: 'week', label: 'Неделя' },
    { value: 'twoWeeks', label: '2 недели' },
    { value: 'semester', label: 'Семестр' },
  ];

  return (
    // FIX: Cast the react-dnd connector to 'any' to resolve type conflicts,
    // which is a consistent pattern in this codebase due to likely library version mismatches.
    <div ref={drop as any} className={`p-6 rounded-xl shadow-lg transition-all border-2 ${dropzoneClasses}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">Нераспределенные занятия ({filteredEntries.length})</h3>
        {canDrop && (
            <div className="flex items-center text-red-600 animate-pulse">
                <TrashIcon className="w-6 h-6 mr-2"/>
                <span className="font-semibold">Бросьте сюда, чтобы вернуть</span>
            </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b">
        <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-gray-700">Показывать на:</span>
            <div className="flex rounded-md bg-gray-100 p-1 text-sm border border-gray-200">
                {horizonOptions.map(opt => (
                    <button 
                        key={opt.value}
                        onClick={() => setUnscheduledTimeHorizon(opt.value)} 
                        className={`px-3 py-1 rounded-md transition-all text-gray-600 font-medium ${unscheduledTimeHorizon === opt.value ? 'bg-white shadow text-blue-600' : 'hover:bg-gray-200'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
        </div>
        <div className="flex flex-wrap gap-4">
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="p-2 border rounded-md bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                <option value="">Все группы</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.number}</option>)}
            </select>
            <select value={teacherFilter} onChange={e => setTeacherFilter(e.target.value)} className="p-2 border rounded-md bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                <option value="">Все преподаватели</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className="p-2 border rounded-md bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75">
                <option value="">Все дисциплины</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
        </div>
      </div>
      
      <div className="h-48 overflow-y-auto pr-2">
        {filteredEntries.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredEntries.map(entry => (
                <UnscheduledCard key={entry.uid} entry={entry} />
            ))}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center text-center text-gray-500 h-full">
                <DocumentSearchIcon className="h-12 w-12 text-gray-400" />
                <p className="mt-2 font-semibold">Все занятия распределены</p>
                <p className="text-sm">Или измените фильтры, чтобы найти нужное занятие.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default UnscheduledDeck;