import React from 'react';
import { useDrag } from 'react-dnd';
import { useStore } from '../hooks/useStore';
import { UnscheduledEntry } from '../types';
import { CLASS_TYPE_COLORS, ItemTypes } from '../constants';
import { CollectionIcon, AcademicCapIcon, UsersIcon } from './icons';

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
  
  const getGroupName = () => {
      if(entry.subgroupId) {
          const group = groups.find(g => g.id === entry.groupId);
          const subgroup = subgroups.find(sg => sg.id === entry.subgroupId);
          return `${group?.number} (${subgroup?.name})`;
      }
      if(entry.groupIds && entry.groupIds.length > 0) {
          const groupNumbers = entry.groupIds.map(gid => groups.find(g => g.id === gid)?.number).filter(Boolean);
          if (groupNumbers.length > 2) {
              return `${groupNumbers.slice(0, 2).join(', ')} и еще ${groupNumbers.length - 2}`;
          }
          return groupNumbers.join(', ');
      }
      if(entry.groupId) {
          return groups.find(g => g.id === entry.groupId)?.number;
      }
      return 'N/A';
  };

  const groupName = getGroupName();

  if (!subject || !teacher || !groupName) return null;

  const colorClass = CLASS_TYPE_COLORS[entry.classType] || 'bg-gray-100 border-gray-300';
  
  return (
    <div
      // FIX: Cast the react-dnd connector to 'any' to resolve type conflicts,
      // likely caused by library version mismatches.
      ref={drag as any}
      className={`p-2 rounded-lg shadow cursor-grab text-xs ${colorClass} transition-transform transform hover:scale-105 ${isDragging ? 'opacity-50 scale-105 ring-2 ring-blue-500' : 'opacity-100'} space-y-1`}
    >
      <div>
        <div className="flex items-center gap-1.5 font-bold">
          <CollectionIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-700" />
          <p className="truncate" title={subject.name}>{subject.name}</p>
        </div>
        <p className="text-xs text-gray-500 ml-5">{entry.classType}</p>
      </div>

      <div className="flex items-center gap-1.5 text-gray-600">
        <AcademicCapIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <p className="truncate" title={groupName}>{groupName}</p>
      </div>

      <div className="flex items-center gap-1.5 text-gray-600">
        <UsersIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <p className="truncate" title={teacher.name}>{teacher.name}</p>
      </div>
    </div>
  );
};

export default UnscheduledCard;