import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dejavu_sans_base64 } from '../utils/fonts';
import { ScheduleEntry, TimeSlot, Group, Teacher, Subject, Classroom, SchedulingSettings, ProductionCalendarEvent, ProductionCalendarEventType, ClassType, SchedulingExplanation } from '../types';
import { DAYS_OF_WEEK } from '../constants';
import { useStore } from '../hooks/useStore';
import { calculateExperience, toYYYYMMDD } from '../utils/dateUtils';

const FONT_NAME = 'DejaVuSans';
const FONT_STYLES = ['normal', 'bold', 'italic', 'bolditalic'] as const;

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
    FONT_STYLES.forEach(style => {
        doc.addFont(`${FONT_NAME}.ttf`, FONT_NAME, style);
    });
    doc.setFont(FONT_NAME, 'normal');
    return doc;
}

const asPdfText = (value: unknown) => {
    if (value === null || typeof value === 'undefined') return '';
    if (Array.isArray(value)) return value.map(asPdfText).join(', ');
    return String(value);
};

const normalizeTable = (rows: unknown[][]) => rows.map(row => row.map(asPdfText));

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const pluralLessons = (count: number) => `${count} пар`;

const shortList = (items: string[], limit = 4) => {
    const clean = items.filter(Boolean);
    if (clean.length <= limit) return clean.join(', ');
    return `${clean.slice(0, limit).join(', ')} +${clean.length - limit}`;
};

const getLastTableY = (doc: jsPDF, fallback: number) => ((doc as any).lastAutoTable?.finalY || fallback);

export const exportScheduleAsPdf = async (data: ScheduleExportData, settings: SchedulingSettings) => {
    const { schedule, title, subtitle, weekDays, timeSlots, timeSlotsShortened, groups, teachers, subjects, classrooms, productionCalendar } = data;
    const doc = initializeDoc();

    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(subtitle, 14, 22);

    const head = normalizeTable([['Время', ...weekDays.map(d => `${DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.getDate()}`)]]);

    const getActiveTimeSlotsForDate = (date: Date) => {
        const dateStr = toYYYYMMDD(date);
        const dayInfo = productionCalendar.find(e => e.date === dateStr);
        const isPreHoliday = settings.useShortenedPreHolidaySchedule && dayInfo?.type === ProductionCalendarEventType.PreHoliday;
        return isPreHoliday ? timeSlotsShortened : timeSlots;
    };

    const displayTimeSlots: TimeSlot[] = Array.from(
        new Map(weekDays.flatMap(getActiveTimeSlotsForDate).map(item => [item.id, item])).values()
    )
        .sort((a, b) => a.time.localeCompare(b.time));

    const body = displayTimeSlots.map(slot => {
        const row = [slot.time];
        weekDays.forEach(date => {
            const dayName = DAYS_OF_WEEK[date.getDay() === 0 ? 6 : date.getDay() - 1];
            const dateStr = toYYYYMMDD(date);
            const activeTimeSlots = getActiveTimeSlotsForDate(date);

            if (!activeTimeSlots.some(ts => ts.id === slot.id)) {
                row.push(''); // This slot doesn't exist on this day type
                return;
            }

            const entries = schedule.filter(e =>
                e.timeSlotId === slot.id &&
                ((e.date && e.date === dateStr) || (!e.date && e.day === dayName))
            );

            if (entries.length > 0) {
                const cellContent = entries.map(entry => {
                    const subjectName = subjects.find(s => s.id === entry.subjectId)?.name || 'N/A';
                    const teacher = teachers.find(t => t.id === entry.teacherId);
                    const teacherName = teacher
                        ? (settings.showDegreeInSchedule && teacher.academicDegree
                            ? `${teacher.name}, ${teacher.academicDegree}`
                            : teacher.name)
                        : 'N/A';
                    const classroomName = classrooms.find(c => c.id === entry.classroomId)?.number || 'N/A';
                    const groupName = groups.find(g => g.id === entry.groupId)?.number || (entry.groupIds ? entry.groupIds.map(gid => groups.find(g => g.id === gid)?.number).join(', ') : 'N/A');

                    return `${subjectName} (${entry.classType})\n${teacherName}\nАуд. ${classroomName}, Гр. ${groupName}`;
                }).join('\n\n');
                row.push(cellContent);
            } else {
                row.push('');
            }
        });
        return row;
    });

    autoTable(doc, {
        head,
        body: normalizeTable(body),
        startY: 30,
        theme: 'grid',
        styles: {
            font: FONT_NAME,
            fontStyle: 'normal',
            fontSize: 8,
            cellPadding: 2,
            valign: 'middle',
            overflow: 'linebreak',
            minCellHeight: 15
        },
        headStyles: {
            fillColor: [22, 160, 133],
            textColor: 255,
            font: FONT_NAME,
            fontStyle: 'bold',
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 20, font: FONT_NAME, fontStyle: 'bold' } // Time column
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index > 0) {
                const cellText = data.cell.raw as string;
                if (cellText && cellText.trim() !== '') {
                    // Highlight cells with content
                }
            }
        }
    });

    if (window.electronAPI?.savePdfFile) {
        const pdfOutput = doc.output('arraybuffer');
        await window.electronAPI.savePdfFile(pdfOutput, 'schedule.pdf');
    } else {
        doc.save('schedule.pdf');
    }
};

export const exportAllDataAsPdf = async (store: ReturnType<typeof useStore>) => {
    const doc = initializeDoc();
    let yPos = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const generatedAt = new Date().toLocaleString('ru-RU');
    const subjectById: Map<string, string> = new Map(store.subjects.map(item => [item.id, item.name]));
    const teacherById: Map<string, string> = new Map(store.teachers.map(item => [item.id, item.name]));
    const groupById: Map<string, string> = new Map(store.groups.map(item => [item.id, item.number]));
    const classroomById: Map<string, string> = new Map(store.classrooms.map(item => [item.id, item.number]));
    const departmentById: Map<string, string> = new Map(store.departments.map(item => [item.id, item.name]));
    const facultyById: Map<string, string> = new Map(store.faculties.map(item => [item.id, item.name]));
    const specialtyById: Map<string, string> = new Map(store.specialties.map(item => [item.id, item.name]));
    const ugsById: Map<string, string> = new Map(store.ugs.map(item => [item.id, `${item.code} ${item.name}`]));
    const classroomTypeById: Map<string, string> = new Map(store.classroomTypes.map(item => [item.id, item.name]));
    const timeSlotById: Map<string, string> = new Map([...store.timeSlots, ...store.timeSlotsShortened].map(item => [item.id, item.time]));

    const addTitle = (title: string) => {
        if (yPos > 260) {
            doc.addPage();
            yPos = 15;
        }
        doc.setFontSize(14);
        doc.text(title, 14, yPos);
        yPos += 10;
    };

    const addText = (text: string, fontSize = 9) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 15;
        }
        doc.setFontSize(fontSize);
        const lines = doc.splitTextToSize(text, 182);
        doc.text(lines, 14, yPos);
        yPos += lines.length * (fontSize * 0.45) + 4;
    };

    const addTable = (title: string, head: unknown[][], body: unknown[][], options: { limit?: number; note?: string; fontSize?: number } = {}) => {
        addTitle(title);
        const limit = options.limit || 0;
        const rows = limit > 0 ? body.slice(0, limit) : body;
        autoTable(doc, {
            head: normalizeTable(head),
            body: normalizeTable(rows.length ? rows : [['Нет данных']]),
            startY: yPos,
            theme: 'grid',
            styles: { font: FONT_NAME, fontSize: options.fontSize || 7, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
            headStyles: { fillColor: [37, 99, 235], textColor: 255, font: FONT_NAME, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 14, right: 14 },
        });
        yPos = getLastTableY(doc, yPos) + 7;
        if (limit > 0 && body.length > limit) {
            addText(`Показано ${limit} из ${body.length}. Остальные записи есть в проекте и попадают в тематические сводки.`, 8);
        }
        if (options.note) addText(options.note, 8);
    };

    const getEntryGroupIds = (entry: ScheduleEntry) => entry.groupIds?.length ? entry.groupIds : (entry.groupId ? [entry.groupId] : []);
    const getEntryDateKey = (entry: ScheduleEntry) => entry.date || `${entry.weekType}-${entry.day}`;
    const countBy = <T,>(items: T[], keyGetter: (item: T) => string) => {
        const result = new Map<string, number>();
        items.forEach(item => {
            const key = keyGetter(item) || 'Не задано';
            result.set(key, (result.get(key) || 0) + 1);
        });
        return Array.from(result.entries()).sort((a, b) => b[1] - a[1]);
    };

    const loadByTeacher = countBy<ScheduleEntry>(store.schedule, entry => teacherById.get(entry.teacherId) || entry.teacherId || 'Без преподавателя');
    const loadByClassroom = countBy<ScheduleEntry>(store.schedule, entry => classroomById.get(entry.classroomId) || entry.classroomId || 'Без аудитории');
    const loadBySubject = countBy<ScheduleEntry>(store.schedule, entry => subjectById.get(entry.subjectId) || entry.subjectId || 'Без дисциплины');
    const loadByGroup = new Map<string, number>();
    store.schedule.forEach(entry => getEntryGroupIds(entry).forEach(groupId => loadByGroup.set(groupById.get(groupId) || groupId, (loadByGroup.get(groupById.get(groupId) || groupId) || 0) + 1)));
    const sortedGroupLoad = Array.from(loadByGroup.entries()).sort((a, b) => b[1] - a[1]);

    const planHours = store.educationalPlans.map(plan => {
        const entries = plan.entries || [];
        const totalHours = sum(entries.map(entry => (entry.lectureHours || 0) + (entry.practiceHours || 0) + (entry.labHours || 0)));
        const semesters = Array.from(new Set<number>(entries.map(entry => entry.semester))).sort((a, b) => a - b).join(', ');
        return {
            plan,
            totalHours,
            semesters,
            entryCount: entries.length,
            zet: (totalHours / 36).toFixed(1),
        };
    });

    const missingPlanGroups: Group[] = store.groups.filter(group =>
        !store.educationalPlans.some(plan => plan.specialtyId === group.specialtyId && (!plan.formOfStudy || plan.formOfStudy === group.formOfStudy))
    );
    const planTeacherIssues: Array<[string, string, number, string, ClassType, number]> = [];
    store.educationalPlans.forEach(plan => {
        plan.entries.forEach(entry => {
            const lessonTypes: Array<[ClassType, number]> = [
                [ClassType.Lecture, entry.lectureHours],
                [ClassType.Practical, entry.practiceHours],
                [ClassType.Lab, entry.labHours],
            ];
            lessonTypes.forEach(([classType, hours]) => {
                if (!hours) return;
                const hasTeacher = store.teacherSubjectLinks.some(link => link.subjectId === entry.subjectId && link.classTypes.includes(classType));
                if (!hasTeacher) {
                    planTeacherIssues.push([
                        specialtyById.get(plan.specialtyId) || plan.specialtyId,
                        plan.formOfStudy || 'Любая',
                        entry.semester,
                        subjectById.get(entry.subjectId) || entry.subjectId,
                        classType,
                        hours,
                    ]);
                }
            });
        });
    });

    const conflictRows: unknown[][] = [];
    const conflictGroups = new Map<string, ScheduleEntry[]>();
    const pushConflict = (type: string, resource: string, entries: ScheduleEntry[]) => {
        if (entries.length < 2) return;
        conflictRows.push([
            type,
            resource,
            getEntryDateKey(entries[0]),
            timeSlotById.get(entries[0].timeSlotId) || entries[0].timeSlotId,
            entries.map(entry => `${subjectById.get(entry.subjectId) || entry.subjectId} (${shortList(getEntryGroupIds(entry).map(id => groupById.get(id) || id), 3)})`).join('\n'),
        ]);
    };
    store.schedule.forEach(entry => {
        const baseKey = `${getEntryDateKey(entry)}|${entry.timeSlotId}`;
        [
            `Преподаватель|${teacherById.get(entry.teacherId) || entry.teacherId}`,
            `Аудитория|${classroomById.get(entry.classroomId) || entry.classroomId}`,
            ...getEntryGroupIds(entry).map(groupId => `Группа/поток|${groupById.get(groupId) || groupId}`),
        ].forEach(resourceKey => {
            const key = `${resourceKey}|${baseKey}`;
            conflictGroups.set(key, [...(conflictGroups.get(key) || []), entry]);
        });
    });
    conflictGroups.forEach((entries, key) => {
        const [type, resource] = key.split('|');
        pushConflict(type, resource, entries);
    });

    const explanationRows = (Object.values(store.schedulingExplanations || {}) as SchedulingExplanation[]).map(explanation => [
        explanation.bottleneck,
        explanation.resource,
        explanation.summary,
        shortList(explanation.conflicts || [], 3),
        explanation.checkedSlots,
        explanation.checkedClassrooms,
    ]);

    doc.setFontSize(20);
    doc.text("Полный отчет по данным проекта", pageWidth / 2, yPos, { align: 'center' });
    yPos += 9;
    doc.setFontSize(10);
    doc.text(`Сформировано: ${generatedAt}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 7;
    if (store.currentFilePath) {
        doc.text(`Файл проекта: ${store.currentFilePath}`, pageWidth / 2, yPos, { align: 'center' });
        yPos += 7;
    }
    if (store.lastSchedulingRunSummary) {
        addText(store.lastSchedulingRunSummary, 9);
    }

    addTable("Паспорт проекта", [['Показатель', 'Значение']], [
        ['Факультеты / кафедры', `${store.faculties.length} / ${store.departments.length}`],
        ['Преподаватели / группы / подгруппы / потоки', `${store.teachers.length} / ${store.groups.length} / ${store.subgroups.length} / ${store.streams.length}`],
        ['Специальности / УГСН / учебные планы / шаблоны планов', `${store.specialties.length} / ${store.ugs.length} / ${store.educationalPlans.length} / ${store.educationalPlanTemplates.length}`],
        ['Дисциплины / привязки преподавателей', `${store.subjects.length} / ${store.teacherSubjectLinks.length}`],
        ['Аудитории / кабинеты / типы аудиторий / теги', `${store.classrooms.length} / ${store.cabinets.length} / ${store.classroomTypes.length} / ${store.classroomTags.length}`],
        ['Занятия в расписании / нераспределенные', `${store.schedule.length} / ${store.unscheduledEntries.length}`],
        ['Период семестра', `${store.settings.semesterStart || '-'} - ${store.settings.semesterEnd || '-'}`],
        ['Сессия / практика / пересдачи', `${store.settings.sessionStart || '-'} - ${store.settings.sessionEnd || '-'}; ${store.settings.practiceStart || '-'} - ${store.settings.practiceEnd || '-'}; ${store.settings.retakeStart || '-'} - ${store.settings.retakeEnd || '-'}`],
    ]);

    addTable("Быстрая диагностика", [['Проверка', 'Результат']], [
        ['Группы без подходящего учебного плана', missingPlanGroups.length],
        ['Дисциплины в планах без привязки преподавателя', planTeacherIssues.length],
        ['Обнаруженные ресурсные коллизии в расписании', conflictRows.length],
        ['Нераспределенные занятия с объяснениями', explanationRows.length],
        ['Аудитории в ремонте/закрыты/резерв', store.classrooms.filter(c => c.status && c.status !== 'available').length],
        ['Правила расписания', store.schedulingRules.length],
    ]);

    // Faculties
    addTable("Факультеты", [['ID', 'Название', 'Декан', 'Контакты']], store.faculties.map(f => [
        f.id,
        f.name,
        teacherById.get(f.deanId || '') || '',
        shortList([f.phone || '', f.email || '', f.address || ''], 3),
    ]));

    // Departments
    addTable("Кафедры", [['ID', 'Название', 'Факультет', 'Заведующий', 'Специальности', 'Преподаватели']], store.departments.map(d => [
        d.id,
        d.name,
        facultyById.get(d.facultyId) || '',
        teacherById.get(d.headTeacherId || '') || '',
        shortList((d.specialtyIds || []).map(id => specialtyById.get(id) || id), 5),
        store.teachers.filter(t => t.departmentId === d.id).length,
    ]));

    // Teachers
    addTable("Преподаватели", [['ID', 'Имя', 'Степень', 'Звание', 'Кафедра', 'Дата приема', 'Стаж', 'Привязки', 'Пар в расписании']], store.teachers.map(t => [
            t.id,
            t.name,
            t.academicDegree || '',
            t.academicTitle || '',
            departmentById.get(t.departmentId) || '',
            t.hireDate || '',
            calculateExperience(t.hireDate),
            store.teacherSubjectLinks.filter(l => l.teacherId === t.id).length,
            store.schedule.filter(e => e.teacherId === t.id).length,
    ]), { limit: 150 });

    // Groups
    addTable("Группы", [['ID', 'Номер', 'Курс', 'Форма', 'Смена', 'Студентов', 'Специальность', 'Кафедра', 'План']], store.groups.map(g => {
        const hasPlan = store.educationalPlans.some(plan => plan.specialtyId === g.specialtyId && (!plan.formOfStudy || plan.formOfStudy === g.formOfStudy));
        return [g.id, g.number, g.course, g.formOfStudy, g.shift || 'Любая', g.studentCount, specialtyById.get(g.specialtyId) || '', departmentById.get(g.departmentId) || '', hasPlan ? 'Есть' : 'Нет'];
    }), { limit: 150 });

    addTable("Группы по курсам и формам", [['Курс/форма', 'Групп', 'Студентов']], countBy<Group>(store.groups, g => `${g.course} курс, ${g.formOfStudy}`).map(([key, count]) => [
        key,
        count,
        sum(store.groups.filter(g => `${g.course} курс, ${g.formOfStudy}` === key).map(g => g.studentCount || 0)),
    ]));

    addTable("УГСН и специальности", [['Код', 'Название', 'УГСН', 'Уровень', 'Профили', 'Компетенции']], store.specialties.map(s => [
        s.oksoCode || s.code,
        s.name,
        ugsById.get(s.ugsId) || '',
        s.educationLevel || '',
        shortList(s.profiles || [], 4),
        shortList(s.competencies || [], 4),
    ]), { limit: 120 });

    addTable("Учебные планы", [['Специальность', 'Форма', 'Семестры', 'Дисциплин', 'Часы', 'ЗЕТ', 'Блоки']], planHours.map(item => [
        specialtyById.get(item.plan.specialtyId) || item.plan.specialtyId,
        item.plan.formOfStudy || 'Любая',
        item.semesters,
        item.entryCount,
        item.totalHours,
        item.zet,
        shortList((item.plan.blocks || []).map(block => block.name), 5),
    ]), { limit: 120 });

    addTable("Состав учебных планов", [['Специальность', 'Форма', 'Семестр', 'Блок', 'Дисциплина', 'Лекц.', 'Практ.', 'Лаб.', 'Аттестация']], store.educationalPlans.flatMap(plan => plan.entries.map(entry => [
        specialtyById.get(plan.specialtyId) || plan.specialtyId,
        plan.formOfStudy || 'Любая',
        entry.semester,
        plan.blocks?.find(block => block.id === entry.blockId)?.name || '',
        subjectById.get(entry.subjectId) || entry.subjectId,
        entry.lectureHours || '',
        entry.practiceHours || '',
        entry.labHours || '',
        entry.attestation,
    ])), { limit: 220, fontSize: 6 });

    // Subjects
    addTable("Дисциплины", [['ID', 'Название', 'Требования к аудиториям', 'Теги', 'Пар в расписании']], store.subjects.map(s => [
        s.id,
        s.name,
        s.classroomTypeRequirements ? Object.entries(s.classroomTypeRequirements).map(([type, ids]) => `${type}: ${(ids as string[]).map(id => classroomTypeById.get(id) || id).join(', ')}`).join('\n') : '',
        shortList((s.requiredClassroomTagIds || []).map(id => store.classroomTags.find(tag => tag.id === id)?.name || id), 4),
        store.schedule.filter(entry => entry.subjectId === s.id).length,
    ]), { limit: 180 });

    // Classrooms
    addTable("Аудитории", [['ID', 'Номер', 'Вместимость', 'Экз. мест', 'Тип', 'Теги', 'Статус', 'Кафедра', 'Пар']], store.classrooms.map(c => [
        c.id,
        c.number,
        c.capacity,
        c.examCapacity || '',
        classroomTypeById.get(c.typeId) || 'N/A',
        shortList((c.tagIds || []).map(id => store.classroomTags.find(tag => tag.id === id)?.name || id), 4),
        c.status || 'available',
        departmentById.get(c.departmentId || '') || '',
        store.schedule.filter(entry => entry.classroomId === c.id).length,
    ]), { limit: 180 });

    addTable("Типы аудиторий и теги", [['Раздел', 'Название', 'Описание / цвет']], [
        ...store.classroomTypes.map(item => ['Тип аудитории', item.name, item.description || '']),
        ...store.classroomTags.map(item => ['Тег аудитории', item.name, item.color || '']),
    ], { limit: 160 });

    addTable("Кабинеты и служебные помещения", [['ID', 'Номер', 'Категория', 'Кафедра', 'Ответственный', 'Вместимость', 'Статус']], store.cabinets.map(c => [
        c.id,
        c.number,
        c.category || c.roomMetadata?.assignmentCategory || '',
        departmentById.get(c.departmentId) || '',
        teacherById.get(c.responsibleTeacherId || '') || '',
        c.capacity || '',
        c.status || 'available',
    ]), { limit: 160 });

    // Teacher-Subject Links
    addTable("Привязки преподавателей", [['Преподаватель', 'Кафедра', 'Дисциплина', 'Типы занятий']], store.teacherSubjectLinks.map(l => {
        const teacher = store.teachers.find(t => t.id === l.teacherId);
        return [
            teacher?.name || '',
            teacher ? departmentById.get(teacher.departmentId) || '' : '',
            subjectById.get(l.subjectId) || '',
            l.classTypes.join(', ')
        ];
    }), { limit: 220 });

    addTable("Потоки", [['ID', 'Название', 'Тип', 'Семестр', 'Дисциплина', 'Преподаватель', 'Группы', 'Подгруппы', 'Ограничение мест']], store.streams.map(stream => [
        stream.id,
        stream.name,
        stream.type || '',
        stream.semester || '',
        subjectById.get(stream.subjectId || '') || '',
        teacherById.get(stream.teacherId || '') || '',
        shortList(stream.groupIds.map(id => groupById.get(id) || id), 8),
        shortList((stream.subgroupIds || []).map(id => store.subgroups.find(sg => sg.id === id)?.name || id), 5),
        stream.maxStudentCount || '',
    ]), { limit: 140 });

    addTable("Подгруппы и факультативы", [['Раздел', 'Название', 'Группа', 'Студентов/часов', 'Дисциплина', 'Преподаватель']], [
        ...store.subgroups.map(sg => ['Подгруппа', sg.name, groupById.get(sg.parentGroupId) || '', sg.studentCount, shortList((sg.subjectIds || []).map(id => subjectById.get(id) || id), 3), '']),
        ...store.electives.map(e => ['Факультатив', e.name, groupById.get(e.groupId) || '', e.hoursPerSemester, subjectById.get(e.subjectId) || '', teacherById.get(e.teacherId) || '']),
    ], { limit: 160 });

    addTable("Звонки и профили времени", [['Раздел', 'Название/время', 'Смена', 'Тип/применение']], [
        ...store.timeSlots.map(slot => ['Обычные звонки', slot.time, slot.shift || '', slot.name || '']),
        ...store.timeSlotsShortened.map(slot => ['Сокращенные звонки', slot.time, slot.shift || '', slot.name || '']),
        ...store.bellScheduleProfiles.map(profile => ['Профиль', profile.name, '', `${profile.type}; слотов: ${profile.slots.length}; активен: ${profile.isActive ? 'да' : 'нет'}`]),
    ], { limit: 120 });

    addTable("Расписание: структура", [['Разрез', 'Значение', 'Пар']], [
        ...countBy<ScheduleEntry>(store.schedule, entry => `Тип занятия: ${entry.classType}`).map(([key, count]) => ['Тип занятия', key.replace('Тип занятия: ', ''), count]),
        ...countBy<ScheduleEntry>(store.schedule, entry => `Неделя: ${entry.weekType}`).map(([key, count]) => ['Тип недели', key.replace('Неделя: ', ''), count]),
        ...countBy<ScheduleEntry>(store.schedule, entry => `Формат: ${entry.deliveryMode}`).map(([key, count]) => ['Формат', key.replace('Формат: ', ''), count]),
    ]);

    addTable("Нагрузка преподавателей", [['Преподаватель', 'Пар', 'Часов', 'Кафедра']], loadByTeacher.map(([name, lessons]) => {
        const teacher = store.teachers.find(item => item.name === name);
        return [name, lessons, lessons * 2, teacher ? departmentById.get(teacher.departmentId) || '' : ''];
    }), { limit: 80 });

    addTable("Нагрузка групп", [['Группа', 'Пар', 'Часов', 'Специальность']], sortedGroupLoad.map(([name, lessons]) => {
        const group = store.groups.find(item => item.number === name);
        return [name, lessons, lessons * 2, group ? specialtyById.get(group.specialtyId) || '' : ''];
    }), { limit: 100 });

    addTable("Загрузка аудиторий", [['Аудитория', 'Пар', 'Часов', 'Тип']], loadByClassroom.map(([name, lessons]) => {
        const classroom = store.classrooms.find(item => item.number === name);
        return [name, lessons, lessons * 2, classroom ? classroomTypeById.get(classroom.typeId) || '' : ''];
    }), { limit: 100 });

    addTable("Самые частые дисциплины в расписании", [['Дисциплина', 'Пар', 'Часов']], loadBySubject.map(([name, lessons]) => [name, lessons, lessons * 2]), { limit: 80 });

    addTable("Коллизии ресурсов", [['Тип ресурса', 'Ресурс', 'Дата/неделя', 'Слот', 'Занятия']], conflictRows, { limit: 120, fontSize: 6 });

    addTable("Нераспределенные занятия", [['Дисциплина', 'Тип', 'Группа/поток', 'Преподаватель', 'Студентов', 'Причина']], store.unscheduledEntries.map(entry => [
        subjectById.get(entry.subjectId) || entry.subjectId,
        entry.classType,
        shortList([...(entry.groupIds || []).map(id => groupById.get(id) || id), entry.groupId ? groupById.get(entry.groupId) || entry.groupId : ''].filter((item): item is string => Boolean(item)), 6),
        teacherById.get(entry.teacherId) || entry.teacherId || shortList((entry.teacherCandidates || []).map(id => teacherById.get(id) || id), 3),
        entry.studentCount,
        entry.explanation?.summary || store.schedulingExplanations?.[entry.uid]?.summary || '',
    ]), { limit: 160, fontSize: 6 });

    addTable("Объяснимость планировщика", [['Узкое место', 'Ресурс', 'Итог', 'Конфликты', 'Слотов', 'Аудиторий']], explanationRows, { limit: 120, fontSize: 6 });

    addTable("Проблемы покрытия учебных планов", [['Проблема', 'Контекст', 'Детали']], [
        ...missingPlanGroups.map(group => ['Нет учебного плана', group.number, `${specialtyById.get(group.specialtyId) || group.specialtyId}; ${group.formOfStudy}; ${group.course} курс`]),
        ...planTeacherIssues.map(row => ['Нет привязки преподавателя', `${row[0]}, ${row[1]}, ${row[2]} семестр`, `${row[3]} / ${row[4]} / ${row[5]} ч.`]),
    ], { limit: 180, fontSize: 6 });

    addTable("Правила и производственный календарь", [['Раздел', 'Описание', 'Параметры']], [
        ...store.schedulingRules.map(rule => ['Правило', rule.description, `${rule.severity}; ${rule.action}; ${rule.day || ''}; ${rule.param || ''}`]),
        ...store.productionCalendar.map(event => ['Календарь', `${event.date}: ${event.type}`, event.description || '']),
    ], { limit: 160, fontSize: 6 });

    addTable("Настройки генерации и аналитики", [['Параметр', 'Значение']], [
        ['Разделение четных/нечетных недель', store.settings.useEvenOddWeekSeparation ? 'Да' : 'Нет'],
        ['Учитывать производственный календарь', store.settings.respectProductionCalendar ? 'Да' : 'Нет'],
        ['Сокращенные предпраздничные звонки', store.settings.useShortenedPreHolidaySchedule ? 'Да' : 'Нет'],
        ['Разрешать окна', store.settings.allowWindows ? 'Да' : 'Нет'],
        ['Разрешать перегрузки', store.settings.allowOverbooking ? 'Да' : 'Нет'],
        ['Цветовая политика', store.settings.colorPolicy.defaultScheduleColorMode],
        ['CSV: кодировка / разделитель', `${store.settings.importPolicy.csvEncoding} / ${store.settings.importPolicy.csvDelimiter}`],
        ['Целевая недельная нагрузка преподавателя', store.settings.analyticsThresholds.targetWeeklyTeacherLoad],
        ['Порог окон', store.settings.analyticsThresholds.windowMinGapSlots],
        ['Что, если: группы/занятия/преподаватели/аудитории', `${store.settings.whatIfDefaults.extraGroups} / ${store.settings.whatIfDefaults.lessonsPerGroupPerWeek} / ${store.settings.whatIfDefaults.extraTeachers} / ${store.settings.whatIfDefaults.extraClassrooms}`],
    ]);

    addTable("Планы зданий", [['Здание', 'Этажей', 'Комнат', 'Аудиторий', 'Кабинетов', 'Окон/дверей', 'Мебели']], store.buildingPlans.map(plan => {
        const rooms = plan.floors.flatMap(floor => floor.rooms);
        return [
            plan.name,
            plan.floors.length,
            rooms.length,
            rooms.filter(room => room.resourceKind === 'classroom').length,
            rooms.filter(room => room.resourceKind === 'cabinet').length,
            sum(rooms.map(room => room.openings?.length || 0)),
            sum(rooms.map(room => room.furniture?.length || 0)),
        ];
    }));

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.text(`Страница ${page} из ${pageCount}`, pageWidth - 14, 288, { align: 'right' });
        doc.text('Экспорт всех данных проекта', 14, 288);
    }

    if (window.electronAPI?.savePdfFile) {
        const pdfOutput = doc.output('arraybuffer');
        const defaultName = `full_data_report_${new Date().toISOString().slice(0, 10)}.pdf`;
        await window.electronAPI.savePdfFile(pdfOutput, defaultName);
    } else {
        doc.save(`full_data_report_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
};
