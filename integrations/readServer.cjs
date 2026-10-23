const http = require('node:http');
const { createHash, timingSafeEqual } = require('node:crypto');
const { sanitizeFeed, diffSnapshots, filterLessons, toICS, validDate } = require('./publicSchedule.cjs');

const matches = (actual, expected) => typeof actual === 'string' && typeof expected === 'string' && expected.length >= 32 &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

function readFilter(params) {
    const allowed = new Set(['groupId', 'teacherId', 'classroomId', 'from', 'to', 'since', 'projectId', 'token']);
    for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length > 1) throw new Error('Invalid query.');
    const filter = Object.fromEntries(['groupId', 'teacherId', 'classroomId', 'from', 'to'].flatMap(key => params.has(key) ? [[key, params.get(key)]] : []));
    if (filter.from && !validDate(filter.from) || filter.to && !validDate(filter.to) || filter.from && filter.to && filter.from > filter.to) throw new Error('Invalid date range.');
    return filter;
}

function createReadServer({ getFeed, apiToken, calendarToken }) {
    if (typeof apiToken !== 'string' || apiToken.length < 32 || typeof calendarToken !== 'string' || calendarToken.length < 32 || apiToken === calendarToken) throw new Error('Two distinct access tokens of at least 32 characters are required.');
    const server = http.createServer((request, response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const send = (code, body, contentType = 'application/json; charset=utf-8') => {
            const content = typeof body === 'string' ? body : JSON.stringify(body);
            response.statusCode = code; response.setHeader('Content-Type', contentType);
            if (code === 200) {
                const etag = '"' + createHash('sha256').update(content).digest('hex') + '"';
                response.setHeader('ETag', etag);
                if (request.headers['if-none-match'] === etag) { response.statusCode = 304; response.end(); return; }
            }
            response.end(content);
        };
        if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); send(405, { error: 'Read-only API.' }); return; }
        if ((request.url || '').length > 4096) { send(414, { error: 'URL too long.' }); return; }
        const url = new URL(request.url, 'http://127.0.0.1');
        const bearer = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const calendar = url.pathname === '/calendar.ics';
        if (!matches(bearer, apiToken) && !(calendar && matches(url.searchParams.get('token'), calendarToken))) { send(401, { error: 'Unauthorized.' }); return; }
        try {
            const filter = readFilter(url.searchParams);
            const source = getFeed();
            if (!source) { send(503, { error: 'No published schedule.' }); return; }
            const feed = sanitizeFeed(source); const current = feed.current;
            if (url.searchParams.has('projectId') && url.searchParams.get('projectId') !== current.projectId) { send(409, { error: 'Project changed. Reload the schedule.', resyncRequired: true }); return; }
            const metadata = { schemaVersion: 1, projectId: current.projectId, version: current.version, revisionId: current.revisionId, publishedAt: current.publishedAt, timeZone: current.timeZone, title: current.title, range: current.range };
            if (calendar) { send(200, toICS(current, filter), 'text/calendar; charset=utf-8'); return; }
            if (url.pathname === '/api/v1/status') { send(200, metadata); return; }
            for (const key of ['groups', 'teachers', 'classrooms']) if (url.pathname === `/api/v1/${key}`) { send(200, { ...metadata, items: current[key] }); return; }
            if (url.pathname === '/api/v1/schedule') { send(200, { ...metadata, lessons: filterLessons(current, filter) }); return; }
            if (url.pathname === '/api/v1/changes') {
                const raw = url.searchParams.get('since'); const since = Number(raw);
                if (raw === null || !/^\d+$/.test(raw) || !Number.isSafeInteger(since)) { send(400, { error: 'An integer since version is required.' }); return; }
                if (url.searchParams.get('projectId') !== current.projectId) { send(409, { error: 'Project changed. Reload the schedule.', resyncRequired: true }); return; }
                const previous = since === current.version ? current : feed.history.find(item => item.version === since);
                if (since !== 0 && !previous) { send(409, { error: 'Version is unavailable. Reload the schedule.', resyncRequired: true }); return; }
                const changes = diffSnapshots(previous, current);
                const contains = item => filterLessons({ lessons: [item] }, filter).length > 0;
                changes.added = changes.added.filter(contains); changes.removed = changes.removed.filter(contains);
                changes.changed = changes.changed.filter(item => contains(item.before) || contains(item.after));
                changes.groupIds = [...new Set([...changes.added, ...changes.removed, ...changes.changed.flatMap(item => [item.before, item.after])].flatMap(item => item.groupIds))];
                send(200, { ...metadata, fromVersion: since, changes }); return;
            }
            send(404, { error: 'Not found.' });
        } catch { send(400, { error: 'Invalid query or publication.' }); }
    });
    server.requestTimeout = 10000; server.headersTimeout = 10000;
    return {
        server,
        start: (port = 8597) => new Promise((resolve, reject) => {
            if (!Number.isInteger(port) || port < 0 || port > 65535) { reject(new Error('Invalid port.')); return; }
            server.once('error', reject);
            server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(`http://127.0.0.1:${server.address().port}`); });
        }),
        stop: () => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections?.(); }),
    };
}
module.exports = { createReadServer };
