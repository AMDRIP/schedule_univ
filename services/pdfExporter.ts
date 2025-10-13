
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dejavu_sans_base64 } from '../utils/fonts';
import { ScheduleEntry, TimeSlot, Group, Teacher, Subject, Classroom, SchedulingSettings, ProductionCalendarEvent, ProductionCalendarEventType } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { useStore } from '../hooks/useStore';
import { calculateExperience } from '../utils/dateUtils';

const FONT_NAME = 'DejaVuSans';

interface ScheduleExportData {
  schedule: ScheduleEntry[];
  title: string;
  subtitle: string;
  weekDays: Date[];
  timeSlots: TimeSlot[];
  timeSlotsShortened: TimeSlot[];
  groups: Group[];
  teachers: Teacher[];
  subjects: Subject[];
  classrooms: Classroom[];
  productionCalendar: ProductionCalendarEvent[];
}

function initializeDoc(): jsPDF {
    const doc = new jsPDF();
    doc.addFileToVFS(`${FONT_NAME}.ttf`, dejavu_sans_base64);
    doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, 'normal');
    doc.setFont(FONT_NAME);
    return doc;
}

export const exportScheduleAsPdf = (data: ScheduleExportData, settings: SchedulingSettings) => {
  const { schedule, title, subtitle, weekDays, timeSlots, timeSlotsShortened, groups, teachers, subjects, classrooms, productionCalendar } = data;
  const doc = initializeDoc();

  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(subtitle, 14, 22);

  const head = [['Время', ...weekDays.map(d => `${DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.getDate()}`)]];
  
  const allTimeSlots = [...timeSlots, ...timeSlotsShortened];
  // FIX: Corrected typo from `allSlots` to `allTimeSlots` and explicitly typed the variable to resolve downstream type errors.
  const displayTimeSlots: TimeSlot[] = Array.from(new Map(allTimeSlots.map(item => [item.time, item])).values())
      .sort((a, b) => a.time.localeCompare(b.time));

  const body = displayTimeSlots.map(slot => {
    const row = [slot.time];
    weekDays.forEach(date => {
        const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
        const dateStr = date.toISOString().split('T')[0];

        const dayInfo = productionCalendar.find(e => e.date === dateStr);
        const isPreHoliday = settings.useShortenedPreHolidaySchedule && dayInfo?.type === ProductionCalendarEventType.PreHoliday;
        const activeTimeSlots = isPreHoliday ? timeSlotsShortened : timeSlots;

        if (!activeTimeSlots.some(ts => ts.id === slot.id)) {
            row.push(''); // This slot doesn't exist on this day type
            return;
        }

        const entry = schedule.find(e => 
            e.timeSlotId === slot.id &&
            ((e.date && e.date === dateStr) || (!e.date && e.day === dayName))
        );

        if (entry) {
            const subjectName = subjects.find(s => s.id === entry.subjectId)?.name || 'N/A';
            const teacher = teachers.find(t => t.id === entry.teacherId);
            const teacherName = teacher 
                ? (settings.showDegreeInSchedule && teacher.academicDegree 
                    ? `${teacher.name}, ${teacher.academicDegree}` 
                    : teacher.name) 
                : 'N/A';
            const classroomName = classrooms.find(c => c.id === entry.classroomId)?.number || 'N/A';
            const groupName = groups.find(g => g.id === entry.groupId)?.number || 'N/A';
            const cellText = `${subjectName}\n${entry.classType}\n${teacherName}\nАуд. ${classroomName}\nГр. ${groupName}`;
            row.push(cellText);
        } else {
            row.push('');
        }
    });
    return row;
  });

  autoTable(doc, {
    head: head,
    body: body,
    startY: 30,
    theme: 'grid',
    styles: {
        font: FONT_NAME,
        fontSize: 8,
        cellPadding: 2,
    },
    headStyles: {
        fillColor: [22, 160, 133],
        textColor: 255,
        fontStyle: 'bold',
    },
  });

  doc.save('schedule.pdf');
};

export const exportAllDataAsPdf = (store: ReturnType<typeof useStore>) => {
    const doc = initializeDoc();
    let yPos = 15;
    const addTitle = (title: string) => {
        if(yPos > 260) {
            doc.addPage();
            yPos = 15;
        }
        doc.setFontSize(14);
        doc.text(title, 14, yPos);
        yPos += 10;
    };
    
    doc.setFontSize(20);
    doc.text("Полный отчет по данным системы", 105, yPos, { align: 'center' });
    yPos += 15;

    // Faculties
    addTitle("Факультеты");
    autoTable(doc, {
        head: [['ID', 'Название']],
        body: store.faculties.map(f => [f.id, f.name]),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    
    // Departments
    addTitle("Кафедры");
    autoTable(doc, {
        head: [['ID', 'Название', 'Факультет']],
        body: store.departments.map(d => [d.id, d.name, store.faculties.find(f=>f.id === d.facultyId)?.name || '']),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Teachers
    addTitle("Преподаватели");
    autoTable(doc, {
        head: [['ID', 'Имя', 'Степень', 'Регалии', 'Кафедра', 'Дата приема', 'Стаж']],
        body: store.teachers.map(t => [
            t.id, 
            t.name, 
            t.academicDegree || '', 
            t.regalia || '',
            store.departments.find(d=>d.id === t.departmentId)?.name || '', 
            t.hireDate || '',
            calculateExperience(t.hireDate)
        ]),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Groups
    addTitle("Группы");
    autoTable(doc, {
        head: [['ID', 'Номер', 'Курс', 'Студентов', 'Специальность']],
        body: store.groups.map(g => [g.id, g.number, g.course, g.studentCount, store.specialties.find(s=>s.id === g.specialtyId)?.name || '']),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Subjects
    addTitle("Дисциплины");
    autoTable(doc, {
        head: [['ID', 'Название']],
        body: store.subjects.map(s => [s.id, s.name]),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    
    // Classrooms
    addTitle("Аудитории");
    autoTable(doc, {
        head: [['ID', 'Номер', 'Вместимость', 'Тип']],
        body: store.classrooms.map(c => [c.id, c.number, c.capacity, store.classroomTypes.find(ct => ct.id === c.typeId)?.name || 'N/A']),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    
    // Teacher-Subject Links
    addTitle("Привязки преподавателей");
    autoTable(doc, {
        head: [['Преподаватель', 'Дисциплина', 'Типы занятий']],
        body: store.teacherSubjectLinks.map(l => [
            store.teachers.find(t=>t.id === l.teacherId)?.name || '',
            store.subjects.find(s=>s.id === l.subjectId)?.name || '',
            l.classTypes.join(', ')
        ]),
        startY: yPos,
        styles: { font: FONT_NAME, fontSize: 8 },
    });

    doc.save(`full_data_report_${new Date().toISOString().slice(0, 10)}.pdf`);
};