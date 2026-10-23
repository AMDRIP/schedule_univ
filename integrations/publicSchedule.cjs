const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const text = value => typeof value === 'string' ? value.slice(0, 1000) : '';
const strings = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').map(text))] : [];
const validDate = value => datePattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const clock = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || value === '24:00';

// This allowlist is also used on the main-process boundary and by the standalone server.
function sanitizeSnapshot(value) {
    if (!value || value.schemaVersion !== 1 || !text(value.projectId) || !text(value.revisionId) || !Number.isSafeInteger(value.version) || value.version < 1) throw new Error('Invalid public schedule version.');
    if (!validDate(value.range?.start) || !validDate(value.range?.end) || value.range.start > value.range.end) throw new Error('Invalid publication period.');
    if (typeof value.timeZone !== 'string' || !value.timeZone) throw new Error('Missing publication time zone.');
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }).format(); } catch { throw new Error('Invalid publication time zone.'); }
    if (!Array.isArray(value.lessons) || value.lessons.length > 100000) throw new Error('Invalid public lessons.');
    const lessons = value.lessons.map(item => {
        if (!item || !text(item.id) || !validDate(item.date) || !clock(item.startTime) || !clock(item.endTime) || item.startTime === '24:00' || item.startTime >= item.endTime) throw new Error('Invalid public lesson date or time.');
        return { id: text(item.id), date: item.date, startTime: item.startTime, endTime: item.endTime,
            subjectId: text(item.subjectId), subjectName: text(item.subjectName), classType: text(item.classType), deliveryMode: text(item.deliveryMode),
            teacherIds: strings(item.teacherIds), teacherNames: strings(item.teacherNames), classroomId: text(item.classroomId), classroomName: text(item.classroomName),
            groupIds: strings(item.groupIds), groupNames: strings(item.groupNames), subgroupName: text(item.subgroupName),
            shift: ['first', 'second', 'both'].includes(item.shift) ? item.shift : undefined };
    });
    if (new Set(lessons.map(item => item.id)).size !== lessons.length) throw new Error('Duplicate public lesson identifiers.');
    const registry = items => Array.isArray(items) ? items.map(item => ({ id: text(item.id), name: text(item.name) })).filter(item => item.id) : [];
    return { schemaVersion: 1, projectId: text(value.projectId), revisionId: text(value.revisionId), version: value.version, title: text(value.title),
        publishedAt: text(value.publishedAt), timeZone: value.timeZone, range: { start: value.range.start, end: value.range.end },
        groups: registry(value.groups), teachers: registry(value.teachers), classrooms: registry(value.classrooms), lessons };
}

function sanitizeFeed(value) {
    if (!value || value.schemaVersion !== 1 || !value.current) throw new Error('No published schedule.');
    const current = sanitizeSnapshot(value.current);
    const history = (Array.isArray(value.history) ? value.history : []).map(sanitizeSnapshot);
    if ([current, ...history].some(item => item.projectId !== current.projectId || !item.publishedAt || Number.isNaN(Date.parse(item.publishedAt))) || history.some(item => item.version >= current.version)) throw new Error('Invalid published history.');
    if (new Set(history.map(item => item.version)).size !== history.length) throw new Error('Duplicate publication versions.');
    return { schemaVersion: 1, current, history };
}

function diffSnapshots(before, after) {
    const old = new Map((before?.lessons || []).map(item => [item.id, item]));
    const next = new Map((after?.lessons || []).map(item => [item.id, item]));
    const added = [...next.values()].filter(item => !old.has(item.id));
    const removed = [...old.values()].filter(item => !next.has(item.id));
    const changed = [...next.values()].flatMap(item => old.has(item.id) && JSON.stringify(old.get(item.id)) !== JSON.stringify(item) ? [{ before: old.get(item.id), after: item }] : []);
    const groupIds = [...new Set([...added, ...removed, ...changed.flatMap(item => [item.before, item.after])].flatMap(item => item.groupIds))];
    return { added, removed, changed, groupIds };
}

function filterLessons(snapshot, filter = {}) {
    return snapshot.lessons.filter(item => (!filter.groupId || item.groupIds.includes(filter.groupId)) &&
        (!filter.teacherId || item.teacherIds.includes(filter.teacherId)) && (!filter.classroomId || item.classroomId === filter.classroomId) &&
        (!filter.from || item.date >= filter.from) && (!filter.to || item.date <= filter.to));
}

const escapeICS = value => String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
function foldLine(line) {
    const output = []; let part = ''; let bytes = 0;
    for (const character of line) {
        const size = new TextEncoder().encode(character).length;
        if (bytes + size > 75) { output.push(part); part = ' '; bytes = 1; }
        part += character; bytes += size;
    }
    output.push(part); return output.join('\r\n');
}
function utcTime(date, time, timeZone) {
    const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    let guess = target;
    for (let i = 0; i < 4; i++) {
        const parts = Object.fromEntries(format.formatToParts(new Date(guess)).map(item => [item.type, item.value]));
        const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
        const delta = target - wall; if (!delta) return new Date(guess).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        guess += delta;
    }
    throw new Error('Nonexistent local time in publication time zone.');
}
function toICS(snapshot, filter = {}) {
    const stamp = new Date(snapshot.publishedAt).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UNIV//Published Schedule//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeICS(snapshot.title)}`, `X-WR-TIMEZONE:${snapshot.timeZone}`];
    filterLessons(snapshot, filter).forEach(item => lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(snapshot.projectId)}.${encodeURIComponent(item.id)}@univ.local`,
        `DTSTAMP:${stamp}`, `SEQUENCE:${snapshot.version}`, `LAST-MODIFIED:${stamp}`, `DTSTART:${utcTime(item.date, item.startTime, snapshot.timeZone)}`, `DTEND:${utcTime(item.date, item.endTime, snapshot.timeZone)}`,
        `SUMMARY:${escapeICS(`${item.subjectName} (${item.classType})`)}`, `LOCATION:${escapeICS(item.classroomName)}`,
        `DESCRIPTION:${escapeICS([...item.groupNames, ...item.teacherNames, item.subgroupName, item.deliveryMode].filter(Boolean).join('; '))}`, 'END:VEVENT'));
    lines.push('END:VCALENDAR'); return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { sanitizeSnapshot, sanitizeFeed, diffSnapshots, filterLessons, toICS, validDate, utcTime };
