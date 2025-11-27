import { ScheduleEntry, TimeSlot, Group, Teacher, Subject, Classroom } from '../types';
import { DAYS_OF_WEEK } from '../constants';

interface TextExportData {
  schedule: ScheduleEntry[];
  fileName: string;
  weekDays: Date[];
  timeSlots: TimeSlot[];
  groups: Group[];
  teachers: Teacher[];
  subjects: Subject[];
  classrooms: Classroom[];
}

export const exportScheduleAsTxt = (data: TextExportData) => {
  const { schedule, fileName, weekDays, timeSlots, subjects, teachers, classrooms } = data;

  // Create lookup maps for efficient sorting
  const dayIndexMap = new Map(DAYS_OF_WEEK.map((day, index) => [day, index]));
  const timeSlotIndexMap = new Map(timeSlots.map((slot, index) => [slot.id, index]));
  
  // Sort schedule entries chronologically by day and then by time
  const sortedSchedule = [...schedule].sort((a, b) => {
    const dateA = a.date 
        ? new Date(a.date).getTime() 
        : new Date(weekDays[dayIndexMap.get(a.day) ?? 0] ?? 0).getTime();
    
    const dateB = b.date 
        ? new Date(b.date).getTime() 
        : new Date(weekDays[dayIndexMap.get(b.day) ?? 0] ?? 0).getTime();

    if (dateA !== dateB) {
        return dateA - dateB;
    }

    const timeIndexA = timeSlotIndexMap.get(a.timeSlotId) ?? 99;
    const timeIndexB = timeSlotIndexMap.get(b.timeSlotId) ?? 99;
    return timeIndexA - timeIndexB;
  });

  let content = '';

  sortedSchedule.forEach((entry, index) => {
    const time = timeSlots.find(ts => ts.id === entry.timeSlotId)?.time || 'N/A';
    const entryDate = entry.date 
        ? new Date(entry.date + 'T00:00:00')
        : weekDays[dayIndexMap.get(entry.day) ?? 0];
    
    const dateString = entryDate 
        ? `${entry.day}, ${entryDate.toLocaleDateString('ru-RU')}` 
        : entry.day;

    const subject = subjects.find(s => s.id === entry.subjectId)?.name || 'N/A';
    const teacher = teachers.find(t => t.id === entry.teacherId)?.name || 'N/A';
    const classroom = classrooms.find(c => c.id === entry.classroomId)?.number || 'N/A';

    content += `${time} - ${dateString}\n`;
    content += `Предмет: ${subject}\n`;
    content += `Преподаватель: ${teacher}\n`;
    content += `Тип: ${entry.classType}\n`;
    content += `Кабинет: ${classroom}\n`;

    if (index < sortedSchedule.length - 1) {
      content += '---\n\n';
    }
  });

  if (!content) {
      alert("Нет данных для экспорта на выбранную неделю.");
      return;
  }

  // Create a Blob and trigger download
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
