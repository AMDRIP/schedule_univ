import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS, Specialty, EducationalPlan, DeliveryMode, ClassroomType,
    Subgroup, Elective, RuleSeverity, RuleAction, AvailabilityType, ClassroomTag, Department, Faculty
} from '../types';
import { SCHEDULING_STANDARDS_PROMPT } from './schedulingStandards';

interface GenerationData {
  teachers: Teacher[];
  groups: Group[];
  classrooms: Classroom[];
  subjects: Subject[];
  streams: Stream[];
  timeSlots: TimeSlot[];
  timeSlotsShortened: TimeSlot[];
  settings: SchedulingSettings;
  teacherSubjectLinks: TeacherSubjectLink[];
  schedulingRules: SchedulingRule[];
  productionCalendar: ProductionCalendarEvent[];
  ugs: UGS[];
  specialties: Specialty[];
  educationalPlans: EducationalPlan[];
  classroomTypes: ClassroomType[];
  subgroups: Subgroup[];
  electives: Elective[];
  classroomTags: ClassroomTag[];
  faculties: Faculty[];
  departments: Department[];
}

const getOpenRouterApiKey = async (): Promise<string | null> => {
  if (!window.electronAPI || typeof window.electronAPI.getOpenRouterApiKey !== 'function') {
      console.warn("Electron API не найдено. Функции OpenRouter будут отключены.");
      return null;
  }
  
  try {
    const apiKey = await window.electronAPI.getOpenRouterApiKey();
    if (!apiKey) {
      console.warn("API-ключ OpenRouter не найден. Функции OpenRouter будут отключены.");
      return null;
    }
    return apiKey;
  } catch (error) {
    console.error("Ошибка при получении API-ключа OpenRouter:", error);
    return null;
  }
};

export const generateScheduleWithOpenRouter = async (data: GenerationData): Promise<ScheduleEntry[]> => {
  const { 
    teachers, groups, classrooms, subjects, streams, timeSlots, timeSlotsShortened, settings, 
    teacherSubjectLinks, schedulingRules, productionCalendar, ugs, specialties, educationalPlans, classroomTypes,
    subgroups, electives, classroomTags, departments, faculties
  } = data;
  
  let standardsPrompt = '';
  if (settings.enforceStandardRules) {
    standardsPrompt = `
    ВАЖНО: Соблюдай следующие общие стандарты составления расписания ВУЗа в дополнение ко всем остальным правилам:
    ${SCHEDULING_STANDARDS_PROMPT}
    `;
  }

  const prompt = `
    Ты — ИИ-ассистент для составления учебного расписания для ВУЗа на один семестр.
    Твоя задача — создать оптимальное расписание, распределив все занятия из учебных планов и факультативов по сетке на чётные и нечётные недели, строго следуя всем правилам.

    ОБЩИЕ НАСТРОЙКИ:
    - Семестр длится с ${settings.semesterStart} по ${settings.semesterEnd}.
    - "Окна" (свободные пары между занятиями) для студентов и преподавателей ${settings.allowWindows ? 'РАЗРЕШЕНЫ' : 'ЗАПРЕЩЕНЫ. Старайся ставить пары подряд.'}.
    - УЧЕТ ПРОИЗВОДСТВЕННОГО КАЛЕНДАРЯ: ${settings.respectProductionCalendar ? 'ВКЛЮЧЕН. Ты ОБЯЗАН не ставить занятия в дни, где isWorkDay: false.' : 'ВЫКЛЮЧЕН. Ты можешь игнорировать нерабочие дни.'}
    - СОКРАЩЕННЫЕ ДНИ: ${settings.useShortenedPreHolidaySchedule ? 'ВКЛЮЧЕНО. В дни с типом "Предпраздничный день" используй \`timeSlotsShortened\`. В остальные рабочие дни - \`timeSlots\`.' : 'ВЫКЛЮЧЕНО. Всегда используй \`timeSlots\`.'}
    - Производственный календарь: ${JSON.stringify(productionCalendar)}

    ${standardsPrompt}

    НОВАЯ СИСТЕМА ПРАВИЛ РАСПИСАНИЯ:
    Это самый важный раздел. Правила задают ограничения и предпочтения. У каждого правила есть 'severity' (серьезность) и 'action' (действие).
    - 'severity: ${RuleSeverity.Strict}': Это правило НАРУШАТЬ НЕЛЬЗЯ. Любое нарушение делает расписание невалидным.
    - 'severity: ${RuleSeverity.Strong}', '${RuleSeverity.Medium}', '${RuleSeverity.Weak}': Это предпочтения. Их нарушение не запрещено, но делает расписание менее оптимальным. Старайся выполнить их как можно лучше, в порядке убывания серьезности.
    - 'action': Определяет суть правила. Например:
      - '${RuleAction.AvoidTime}': Указанные в 'conditions' сущности не должны иметь занятий в указанные 'day' и 'timeSlotId'.
      - '${RuleAction.SameDay}': Сущности из первого и второго условия ('conditions') должны быть в один день.
      - '${RuleAction.Order}': Сущности из первого условия должны быть раньше, чем из второго, в пределах одного дня.
      - '${RuleAction.MaxPerDay}': Для сущности из первого условия не должно быть больше 'param' занятий в день.
      - '${RuleAction.Consecutive}': Занятия для указанных сущностей должны идти подряд, без окон.
    
    ОСНОВНЫЕ ПРАВИЛА СОСТАВЛЕНИЯ РАСПИСАНИЯ (помимо указанных в JSON):
    1.  ИСТОЧНИК ДАННЫХ: Все обязательные занятия, их количество и тип (лекция, практика, лаб.) должны браться ИСКЛЮЧИТЕЛЬНО из Учебных планов. Дополнительные занятия берутся из списка Факультативов.
    2.  ПОДГРУППЫ: Некоторые занятия в учебном плане могут быть помечены как 'splitForSubgroups'. Это значит, что для каждой подгруппы основной группы нужно создать отдельное занятие. При проверке вместимости аудитории используй 'studentCount' из подгруппы. ВАЖНО: когда занятие идет у подгруппы, вся основная группа ('parentGroupId') считается занятой.
    3.  НАЗНАЧЕНИЕ ПРЕПОДАВАТЕЛЕЙ ПОДГРУППАМ: У подгрупп может быть поле 'teacherAssignments'. Это СТРОГОЕ требование. Если для дисциплины и типа занятия у подгруппы указан конкретный преподаватель, ты ОБЯЗАН использовать именно его. Если назначения нет, выбери любого подходящего преподавателя из общих привязок.
    4.  ПОТОКИ (streams): Потоки объединяют несколько групп для лекций. Если у занятия указан 'streamId', то все группы из этого потока ('groupIds' в объекте потока) должны присутствовать на занятии одновременно. 'studentCount' для таких занятий рассчитывается как сумма студентов всех групп потока.
    5.  ПРИВЯЗКИ: Используй 'teacherSubjectLinks' для определения, какой преподаватель может вести какой тип занятия по какой дисциплине. Это СТРОГОЕ правило, если не переопределено в 'teacherAssignments' у подгруппы.
    6.  КОНФЛИКТЫ: Один преподаватель, одна группа (или подгруппа) или одна аудитория не могут быть в двух местах одновременно. Занятие у подгруппы блокирует всю родительскую группу.
    7.  АУДИТОРИИ: Вместимость аудитории ('capacity') должна быть не меньше количества студентов ('studentCount'). Для каждой дисциплины указаны подходящие типы аудиторий в 'suitableClassroomTypeIds'. Это СТРОГОЕ требование.
    8.  ТРЕБОВАНИЯ К АУДИТОРИИ (ТЕГИ): У дисциплин ('subjects') может быть поле 'requiredClassroomTagIds'. Это СТРОГОЕ требование. Если оно есть, ты ОБЯЗАН выбрать для занятия аудиторию ('classrooms'), у которой в поле 'tagIds' присутствуют ВСЕ теги из 'requiredClassroomTagIds'.
    9. СЕТКА ДОСТУПНОСТИ (availabilityGrid): У преподавателей, групп и аудиторий есть сетка доступности.
        - '${AvailabilityType.Forbidden}': СТРОГО ЗАПРЕЩЕНО ставить занятия в этот слот.
        - '${AvailabilityType.Undesirable}': Крайне нежелательно, но можно, если нет других вариантов.
        - '${AvailabilityType.Desirable}': Очень желательно ставить занятия в этот слот.
        - '${AvailabilityType.Allowed}' (или отсутствие записи): Нейтральный слот.

    ДАННЫЕ ДЛЯ РАБОТЫ:
    - Факультеты и Кафедры: ${JSON.stringify(departments.map(d => ({ id: d.id, name: d.name, faculty: faculties.find(f => f.id === d.facultyId)?.name })))}
    - УГСН и Специальности: ${JSON.stringify(specialties.map(s => ({ id: s.id, name: s.name, ugs: ugs.find(u => u.id === s.ugsId)?.name })))}
    - Преподаватели: ${JSON.stringify(teachers)}
    - Группы: ${JSON.stringify(groups)}
    - Подгруппы: ${JSON.stringify(subgroups)}
    - Потоки: ${JSON.stringify(streams)}
    - Типы аудиторий: ${JSON.stringify(classroomTypes)}
    - Теги аудиторий: ${JSON.stringify(classroomTags)}
    - Аудитории: ${JSON.stringify(classrooms)}
    - Дисциплины: ${JSON.stringify(subjects)}
    - Учебные планы: ${JSON.stringify(educationalPlans)}
    - Факультативы: ${JSON.stringify(electives)}
    - Привязки преподаватель-дисциплина: ${JSON.stringify(teacherSubjectLinks)}
    - Правила расписания: ${JSON.stringify(schedulingRules)}
    - Расписание звонков (обычное): ${JSON.stringify(timeSlots)}
    - Расписание звонков (сокращенное): ${JSON.stringify(timeSlotsShortened)}

    ТВОЯ ЗАДАЧА:
    Создай полный JSON-массив объектов 'ScheduleEntry' для всех занятий на один семестр. Каждое занятие из учебного плана должно быть представлено в расписании нужное количество раз (hours/2).
    Вместо 'date' используй 'day' (Понедельник, Вторник...) и 'weekType' ('even', 'odd', 'every').
    Не создавай записи для консультаций, зачетов и экзаменов. Только лекции, практики, лабораторные и факультативы.
    Не включай в ответ ничего, кроме JSON-массива. Без комментариев, без markdown. Только валидный JSON.
  `;

  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("API-ключ OpenRouter не настроен. Пожалуйста, добавьте его в настройках.");
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku", // A fast and capable model suitable for this task
        messages: [
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
      })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("OpenRouter API Error:", errorBody);
        throw new Error(`Ошибка от OpenRouter API: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json();
    const content = jsonResponse.choices[0].message.content;
    const schedule = JSON.parse(content) as ScheduleEntry[];

    return schedule.map(entry => ({...entry, deliveryMode: DeliveryMode.Offline}));
  } catch (error) {
    console.error("Ошибка при запросе к OpenRouter API:", error);
    throw new Error("Не удалось сгенерировать расписание с помощью OpenRouter. Проверьте консоль для подробностей.");
  }
};