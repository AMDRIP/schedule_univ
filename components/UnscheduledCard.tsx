import React from 'react';
import { useDrag } from 'react-dnd';
import { useStore } from '../hooks/useStore';
import { UnscheduledEntry } from '../types';
import { CLASS_TYPE_COLORS, ItemTypes } from '../constants';

interface UnscheduledCardProps {
  entry: UnscheduledEntry;
}

const UnscheduledCard: React.FC<UnscheduledCardProps> = ({ entry }) => {
  const { subjects, teachers, groups, subgroups } = useStore();

  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.UNSCHEDULED_ENTRY,
    item: entry,
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  const subject = subjects.find(s => s.id === entry.subjectId);
  const teacher = teachers.find(t => t.id === entry.teacherId);
  const group = groups.find(g => g.id === entry.groupId);
  const subgroup = subgroups.find(sg => sg.id === entry.subgroupId);

  if (!subject || !teacher || !group) return null;

  const colorClass = CLASS_TYPE_COLORS[entry.classType] || 'bg-gray-100 border-gray-300';
  const groupName = subgroup ? `${group.number} (${subgroup.name})` : group.number;
  
  return (
    <div
      // FIX: Cast the react-dnd connector to 'any' to resolve type conflicts,
      // likely caused by library version mismatches.
      ref={drag as any}
      className={`p-2 rounded-lg shadow cursor-grab text-xs ${colorClass} transition-transform transform hover:scale-105 ${isDragging ? 'opacity-50 scale-105 ring-2 ring-blue-500' : 'opacity-100'}`}
    >
      <p className="font-bold">{subject.name}</p>
      <p>{entry.classType}</p>
      <p className="mt-1 text-gray-600">{groupName}</p>
      <p className="text-gray-600">{teacher.name}</p>
    </div>
  );
};

export default UnscheduledCard;