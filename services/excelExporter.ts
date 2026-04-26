import * as XLSX from 'xlsx';
import { ScheduleEntry, TimeSlot, Group, Teacher, Subject, Classroom } from '../types';

interface ExcelExportData {
  schedule: ScheduleEntry[];
  fileName: string;
  timeSlots: TimeSlot[];
  groups: Group[];
  teachers: Teacher[];
  subjects: Subject[];
  classrooms: Classroom[];
}

export const exportScheduleAsExcel = (data: ExcelExportData) => {
  const { schedule, fileName, timeSlots, groups, teachers, subjects, classrooms } = data;

  const rows = schedule
    .slice()
    .sort((a, b) => `${a.date || a.day}-${a.timeSlotId}`.localeCompare(`${b.date || b.day}-${b.timeSlotId}`))
    .map(entry => ({
      Дата: entry.date || '',
      День: entry.day,
      Время: timeSlots.find(ts => ts.id === entry.timeSlotId)?.time || entry.timeSlotId,
      Дисциплина: subjects.find(s => s.id === entry.subjectId)?.name || entry.subjectId,
      Тип: entry.classType,
      Преподаватель: teachers.find(t => t.id === entry.teacherId)?.name || entry.teacherId,
      Группы: entry.groupIds?.map(id => groups.find(g => g.id === id)?.number || id).join(', ') || groups.find(g => g.id === entry.groupId)?.number || '',
      Аудитория: classrooms.find(c => c.id === entry.classroomId)?.number || entry.classroomId,
      UID: entry.unscheduledUid || '',
    }));

  if (rows.length === 0) {
    alert('Нет данных для экспорта в Excel.');
    return;
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 34 }, { wch: 18 },
    { wch: 28 }, { wch: 20 }, { wch: 12 }, { wch: 34 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Расписание');
  XLSX.writeFile(workbook, fileName);
};
