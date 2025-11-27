import React from 'react';
import { useStore } from '../hooks/useStore';
import { AvailabilityGrid, AvailabilityType } from '../types';
import { DAYS_OF_WEEK, AVAILABILITY_COLORS } from '../constants';

interface AvailabilityGridEditorProps {
  grid: AvailabilityGrid;
  onGridChange: (newGrid: AvailabilityGrid) => void;
}

const AvailabilityGridEditor: React.FC<AvailabilityGridEditorProps> = ({ grid, onGridChange }) => {
  const { timeSlots } = useStore();

  const handleCellClick = (day: string, timeSlotId: string) => {
    const newGrid = JSON.parse(JSON.stringify(grid)); // Deep copy
    if (!newGrid[day]) {
      newGrid[day] = {};
    }

    const currentStatus = newGrid[day][timeSlotId];
    const statuses = Object.values(AvailabilityType);
    const currentIndex = currentStatus ? statuses.indexOf(currentStatus) : -1;
    const nextIndex = (currentIndex + 1) % statuses.length;
    
    newGrid[day][timeSlotId] = statuses[nextIndex];
    onGridChange(newGrid);
  };
  
  const getButtonClass = (status?: AvailabilityType) => {
      if (!status) return AVAILABILITY_COLORS[AvailabilityType.Allowed].btn;
      return AVAILABILITY_COLORS[status].btn;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-1 border w-24">Время</th>
            {DAYS_OF_WEEK.map(day => (
              <th key={day} className="p-1 border text-center">{day.substring(0, 2)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map(slot => (
            <tr key={slot.id}>
              <td className="p-1 border font-semibold text-center align-middle">{slot.time}</td>
              {DAYS_OF_WEEK.map(day => {
                const status = grid?.[day]?.[slot.id] || AvailabilityType.Allowed;
                return (
                  <td key={`${day}-${slot.id}`} className="p-1 border align-middle">
                    <button
                      type="button"
                      onClick={() => handleCellClick(day, slot.id)}
                      className={`w-full p-1 rounded transition-colors text-xs truncate ${getButtonClass(status)}`}
                      title={status}
                    >
                      {status}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AvailabilityGridEditor;
