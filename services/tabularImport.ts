import * as XLSX from 'xlsx';
import { MAX_PROJECT_BYTES, parseSafeJSON } from '../integrations/projectValidation.cjs';

const KNOWN_COLLECTIONS = new Set([
  'academicWorks', 'students', 'resourceAbsences', 'substitutionLog',
  'faculties', 'departments', 'teachers', 'groups', 'streams', 'classrooms', 'subjects',
  'timeSlots', 'timeSlotsShortened', 'teacherSubjectLinks', 'schedulingRules',
  'productionCalendar', 'ugs', 'specialties', 'educationalPlans', 'scheduleTemplates',
  'classroomTypes', 'subgroups', 'electives', 'classroomTags', 'bellScheduleProfiles',
]);

const parseMaybeJson = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!['[', '{'].includes(trimmed[0])) return value;
  try {
    return parseSafeJSON(trimmed);
  } catch (error) {
    if (error?.code === 'UNSAFE_KEY') throw error;
    return value;
  }
};

export interface TabularImportOptions {
  csvEncoding?: string;
  csvDelimiter?: string;
  columnMappings?: string;
}

const parseColumnMappings = (mappingText?: string) => {
  const mappings = new Map<string, string>();
  mappingText?.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.includes('=') ? trimmed.indexOf('=') : trimmed.indexOf(':');
    if (separatorIndex <= 0) return;
    const source = trimmed.slice(0, separatorIndex).trim();
    const target = trimmed.slice(separatorIndex + 1).trim();
    if (source && target) mappings.set(source, target);
  });
  return mappings;
};

const normalizeRows = (rows: Record<string, unknown>[], options: TabularImportOptions = {}) => {
  const mappings = parseColumnMappings(options.columnMappings);
  return rows.map(row => {
  const normalized: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    const trimmedKey = key.trim();
    const target = mappings.get(trimmedKey) || trimmedKey;
    if (['__proto__', 'constructor', 'prototype'].includes(target)) throw new Error('Небезопасное имя колонки.');
    normalized[target] = parseMaybeJson(value);
  });
  return normalized;
  });
};

const collectionFromFileName = (fileName: string) => {
  const base = fileName.replace(/\.(csv|xlsx|xls)$/i, '');
  return KNOWN_COLLECTIONS.has(base) ? base : null;
};

export const readTabularImport = async (file: File, options: TabularImportOptions = {}): Promise<Record<string, unknown[]>> => {
  if (file.size > MAX_PROJECT_BYTES) throw new Error('Файл импорта превышает 128 МБ.');
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > MAX_PROJECT_BYTES) throw new Error('Файл импорта превышает 128 МБ.');
  const isCsv = /\.csv$/i.test(file.name);
  const csvDelimiter = options.csvDelimiter === '\\t' ? '\t' : options.csvDelimiter;
  const workbook = isCsv
    ? XLSX.read(new TextDecoder(options.csvEncoding || 'utf-8').decode(buffer), {
        type: 'string',
        FS: csvDelimiter && csvDelimiter !== 'auto' ? csvDelimiter : undefined,
        sheetRows: 100001,
      })
    : XLSX.read(buffer, { type: 'array', sheetRows: 100001 });
  if (workbook.SheetNames.length > 100) throw new Error('В файле больше 100 листов.');
  const result: Record<string, unknown[]> = {};

  workbook.SheetNames.forEach(sheetName => {
    const collectionName = KNOWN_COLLECTIONS.has(sheetName) ? sheetName : collectionFromFileName(file.name);
    if (!collectionName) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    if (rows.length > 100000) throw new Error('В листе больше 100000 записей. Разделите импорт.');
    result[collectionName] = normalizeRows(rows, options);
  });

  return result;
};
