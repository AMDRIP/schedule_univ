


import { GoogleGenAI, Type } from '@google/genai';
import { 
    ScheduleEntry, Teacher, Group, Classroom, Subject, Stream, TimeSlot, ClassType, 
    SchedulingSettings, TeacherSubjectLink, SchedulingRule, ProductionCalendarEvent, UGS, Specialty, EducationalPlan, DeliveryMode, ClassroomType,
    Subgroup, Elective, RuleSeverity, RuleAction, RuleEntityType
} from '../types';

interface GenerationData {
  teachers: Teacher[];
  groups: Group[];
  classrooms: Classroom[];
  subjects: Subject[];
  streams: Stream[];
  timeSlots: TimeSlot[];
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
}

let ai: GoogleGenAI | null = null;
let isInitialized = false;

// Инициализирует и возвращает клиент Gemini API, получая ключ через Electron IPC.
// Возвращает null, если клиент не может быть создан (нет ключа или не Electron).
const getAiClient = async (): Promise<GoogleGenAI | null> => {
  if (isInitialized) {
    return ai;
  }
  isInitialized = true; // Попытка инициализации только один раз

  // Проверяем, доступен ли Electron API
  if (!window.electronAPI || typeof window.electronAPI.getApiKey !== 'function') {
      console.warn("Electron API не найдено. Функции Gemini будут отключены.");
      return null;
  }
  
  try {
    const apiKey = await window.electronAPI.getApiKey();
  
    if (!apiKey) {
      console.warn("API-ключ Gemini не найден. Функции Gemini будут отключены.");
      ai = null;
      return null;
    }
    
    ai = new GoogleGenAI({ apiKey });
    return ai;
  } catch (error) {
    console.error("Ошибка при получении API-ключа:", error);
    ai = null;
    return null;
  }
};

export const generateScheduleWithGemini = async (data: GenerationData): Promise<ScheduleEntry[]> => {
  const { 
    teachers, groups, classrooms, subjects, streams, timeSlots, settings, 
    teacherSubjectLinks, schedulingRules, productionCalendar, ugs, specialties, educationalPlans, classroomTypes,
    subgroups, electives
  } = data;

  const prompt = `
    Ты — ИИ-ассистент для составления учебного расписания для ВУЗа на один семестр.
    Твоя задача — создать оптимальное расписание, распределив все занятия из учебных планов и факультативов по сетке на чётные и нечётные недели, строго следуя всем правилам.

    ОБЩИЕ НАСТРОЙКИ:
    - Семестр длится с ${settings.semesterStart} по ${settings.semesterEnd}.
    - Производственный календарь (нерабочие дни, которые нужно пропустить): ${JSON.stringify(productionCalendar)}
    - "Окна" (свободные пары между занятиями) для студентов и преподавателей ${settings.allowWindows ? 'РАЗРЕШЕНЫ' : 'ЗАПРЕЩЕНЫ. Старайся ставить пары подряд.'}.

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
    
    ПРИМЕРЫ ПРАВИЛ:
    - \`{ "action": "${RuleAction.Order}", "severity": "${RuleSeverity.Strong}", "conditions": [{ "entityType": "subject", "entityIds": ["subj-1"], "classType": "Лекция" }, { "entityType": "subject", "entityIds": ["subj-1"], "classType": "Практика" }]}\`
      Означает: лекция по предмету subj-1 должна быть раньше практики по нему же в тот же день. Это сильное предпочтение.
    - \`{ "action": "${RuleAction.MaxPerDay}", "severity": "${RuleSeverity.Strict}", "conditions": [{ "entityType": "group", "entityIds": ["group-101"] }], "param": 3 }\`
      Означает: у группы group-101 не может быть больше 3 пар в день. Это строгое требование.

    ОСНОВНЫЕ ПРАВИЛА СОСТАВЛЕНИЯ РАСПИСАНИЯ (помимо указанных в JSON):
    1.  ИСТОЧНИК ДАННЫХ: Все обязательные занятия, их количество и тип (лекция, практика, лаб.) должны браться ИСКЛЮЧИТЕЛЬНО из Учебных планов. Дополнительные занятия берутся из списка Факультативов.
    2.  ПОДГРУППЫ: Некоторые занятия в учебном плане могут быть помечены как 'splitForSubgroups'. Это значит, что для каждой подгруппы основной группы нужно создать отдельное занятие. При проверке вместимости аудитории используй 'studentCount' из подгруппы. ВАЖНО: когда занятие идет у подгруппы, вся основная группа ('parentGroupId') считается занятой.
    3.  НАЗНАЧЕНИЕ ПРЕПОДАВАТЕЛЕЙ ПОДГРУППАМ: У подгрупп может быть поле 'teacherAssignments'. Это СТРОГОЕ требование. Если для дисциплины и типа занятия у подгруппы указан конкретный преподаватель, ты ОБЯЗАН использовать именно его. Если назначения нет, выбери любого подходящего преподавателя из общих привязок.
    4.  ФАКУЛЬТАТИВЫ: Это необязательные занятия. Их нужно запланировать для указанной в факультативе группы. Тип такого занятия должен быть 'Факультатив'.
    5.  ЗАПРЕТ КОНФЛИКТОВ: Один преподаватель, одна группа (или одна из ее подгрупп) или одна аудитория не могут быть заняты в одно и то же время на неделе одного типа. Это самое строгое правило.
    6.  СООТВЕТСТВИЕ АУДИТОРИЙ: Вместимость аудитории должна быть не меньше количества студентов в группе (или подгруппе, или суммарного для потока). Тип аудитории ('typeId') должен входить в список разрешенных типов для данной дисциплины ('suitableClassroomTypeIds').
    7.  КОМПЕТЕНЦИИ ПРЕПОДАВАТЕЛЕЙ: Преподаватель может вести только те дисциплины и типы занятий, которые указаны в привязках "преподаватель-дисциплина" (teacherSubjectLinks), если только для подгруппы не сделано явное назначение в 'teacherAssignments'.
    8.  ПОТОКИ И КУРСЫ: Лекции для групп, состоящих в потоке, должны проходить одновременно. ВАЖНО: в один поток можно объединять только группы ОДНОГО курса.
    9.  ЗАКРЕПЛЕННЫЕ АУДИТОРИИ: У некоторых преподавателей, групп или дисциплин может быть 'pinnedClassroomId'. Это ОЧЕНЬ СИЛЬНОЕ ПРЕДПОЧТЕНИЕ. Старайся использовать эту аудиторию для них в первую очередь.
    10. РАСПРЕДЕЛЕНИЕ ПО НЕДЕЛЯМ: Равномерно распредели занятия между чётными ('even') и нечётными ('odd') неделями. Если занятие еженедельное, используй 'every'.
    11. СЕТКИ ДОСТУПНОСТИ: У многих сущностей есть сетка доступности. 'Запрещено' - строго нельзя ставить. 'Нежелательно' — избегать. 'Желательно' — ставить в приоритете.
    12. РЕЗУЛЬТАТ: Ответ должен быть только в формате JSON-массива объектов ScheduleEntry, без каких-либо пояснений или markdown-форматирования.

    ДАННЫЕ ДЛЯ СОСТАВЛЕНИЯ РАСПИСАНИЯ:
    - УГСН: ${JSON.stringify(ugs)}
    - Специальности: ${JSON.stringify(specialties)}
    - Учебные планы (источник для обязательных занятий): ${JSON.stringify(educationalPlans)}
    - Преподаватели: ${JSON.stringify(teachers)}
    - Группы: ${JSON.stringify(groups)}
    - Подгруппы (части основных групп, могут иметь строгие назначения преподавателей): ${JSON.stringify(subgroups)}
    - Факультативы (дополнительные занятия): ${JSON.stringify(electives)}
    - Потоки: ${JSON.stringify(streams)}
    - Справочник типов аудиторий: ${JSON.stringify(classroomTypes)}
    - Аудитории: ${JSON.stringify(classrooms)}
    - Справочник дисциплин: ${JSON.stringify(subjects)}
    - Временные слоты: ${JSON.stringify(timeSlots)}
    - Дни недели: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"]
    - Привязки преподавателей к дисциплинам: ${JSON.stringify(teacherSubjectLinks)}
    - Правила расписания (НОВАЯ СТРУКТУРА): ${JSON.stringify(schedulingRules)}

    Создай полное и оптимальное расписание на семестр.
  `;

  // FIX: Replaced unsupported 'enum' property with guidance in the 'description' to resolve parsing errors.
  const responseSchema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        day: { type: Type.STRING, description: 'День недели' },
        timeSlotId: { type: Type.STRING, description: 'ID временного слота' },
        groupId: { type: Type.STRING, description: 'ID основной группы' },
        subgroupId: { type: Type.STRING, description: 'ID подгруппы, если занятие для нее' },
        subjectId: { type: Type.STRING, description: 'ID предмета' },
        teacherId: { type: Type.STRING, description: 'ID преподавателя' },
        classroomId: { type: Type.STRING, description: 'ID аудитории' },
        classType: { type: Type.STRING, description: `Тип занятия. Допустимые значения: ${Object.values(ClassType).join(', ')}` },
        weekType: { type: Type.STRING, description: "Тип недели. Допустимые значения: 'even', 'odd', 'every'" },
        deliveryMode: { type: Type.STRING, description: `Тип проведения. Допустимые значения: ${Object.values(DeliveryMode).join(', ')}` },
      },
      required: ['day', 'timeSlotId', 'groupId', 'subjectId', 'teacherId', 'classroomId', 'classType', 'weekType', 'deliveryMode']
    }
  };

  try {
    const aiClient = await getAiClient();
    
    // Если клиент не создан (нет ключа или не Electron), сообщаем пользователю.
    if (!aiClient) {
      throw new Error("Не удалось инициализировать ИИ-ассистента. Убедитесь, что приложение запущено в среде Electron и API-ключ Gemini предоставлен.");
    }

    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    const jsonText = response.text.trim();
    const cleanedJsonText = jsonText.replace(/^```json\s*/, '').replace(/```$/, '');
    const schedule = JSON.parse(cleanedJsonText);
    return schedule;

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw error; // Перебрасываем оригинальную ошибку
    }
    throw new Error("Не удалось получить данные от Gemini API. Проверьте правильность ключа API и наличие данных для генерации.");
  }
};
