const MAX_PROJECT_BYTES = 128 * 1024 * 1024;
const collections = ['teachers', 'groups', 'subjects', 'schedule', 'classrooms', 'educationalPlans', 'streams', 'students', 'academicWorks', 'subgroups', 'electives', 'teacherSubjectLinks', 'schedulingRules', 'faculties', 'departments', 'timeSlots', 'timeSlotsShortened', 'buildingPlans', 'ugs', 'specialties', 'cabinets', 'classroomTypes', 'classroomTags', 'productionCalendar', 'bellScheduleProfiles', 'educationalPlanTemplates', 'scheduleTemplates', 'resourceAbsences', 'substitutionLog'];
function parseSafeJSON(text) {
    return JSON.parse(text, (key, value) => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Object.assign(new Error('Небезопасное поле JSON.'), { code: 'UNSAFE_KEY' });
        return value;
    });
}
function parseProject(text) {
    if (typeof text !== 'string' || text.length > MAX_PROJECT_BYTES) throw new Error('Файл проекта превышает допустимый размер (128 МБ).');
    let data;
    try { data = parseSafeJSON(text); } catch { throw new Error('Некорректный JSON проекта или небезопасные поля.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !collections.some(key => Array.isArray(data[key]))) throw new Error('Файл не содержит данных проекта расписания.');
    if (data.schemaVersion !== undefined && (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1 || data.schemaVersion > 4)) throw new Error('Неподдерживаемая версия проекта. Обновите приложение.');
    if (collections.some(key => data[key] !== undefined && (!Array.isArray(data[key]) || data[key].some(item => !item || typeof item !== 'object' || Array.isArray(item))))) throw new Error('Некорректный формат справочников проекта.');
    if (data.settings !== undefined && (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))) throw new Error('Некорректные настройки проекта.');
    return data;
}
module.exports = { MAX_PROJECT_BYTES, parseProject, parseSafeJSON };
