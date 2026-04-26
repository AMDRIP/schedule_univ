import * as XLSX from 'xlsx';

const KNOWN_COLLECTIONS = new Set([
  'faculties', 'departments', 'teachers', 'groups', 'streams', 'classrooms', 'subjects',
  'timeSlots', 'timeSlotsShortened', 'teacherSubjectLinks', 'schedulingRules',
  'productionCalendar', 'ugs', 'specialties', 'educationalPlans', 'scheduleTemplates',
  'classroomTypes', 'subgroups', 'electives', 'classroomTags',
]);

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!['[', '{'].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const normalizeRows = (rows: Record<string, unknown>[]) => rows.map(row => {
  const normalized: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    normalized[key.trim()] = parseMaybeJson(value);
  });
  return normalized;
});

const collectionFromFileName = (fileName: string) => {
  const base = fileName.replace(/\.(csv|xlsx|xls)$/i, '');
  return KNOWN_COLLECTIONS.has(base) ? base : null;
};

export const readTabularImport = async (file: File): Promise<Record<string, unknown[]>> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const result: Record<string, unknown[]> = {};

  workbook.SheetNames.forEach(sheetName => {
    const collectionName = KNOWN_COLLECTIONS.has(sheetName) ? sheetName : collectionFromFileName(file.name);
    if (!collectionName) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    result[collectionName] = normalizeRows(rows);
  });

  return result;
};
