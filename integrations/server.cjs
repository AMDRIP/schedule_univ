const fs = require('node:fs/promises');
const { createReadServer } = require('./readServer.cjs');
const { sanitizeFeed } = require('./publicSchedule.cjs');

async function run() {
    const filename = process.env.SCHEDULE_PUBLICATION_FILE;
    if (!filename) throw new Error('Set SCHEDULE_PUBLICATION_FILE to an exported published-schedule JSON, never a SCHD project.');
    let feed = sanitizeFeed(JSON.parse(await fs.readFile(filename, 'utf8')));
    const api = createReadServer({ getFeed: () => feed, apiToken: process.env.SCHEDULE_API_TOKEN, calendarToken: process.env.SCHEDULE_CALENDAR_TOKEN });
    const url = await api.start(Number(process.env.SCHEDULE_API_PORT || 8597));
    console.log(`Published schedule API: ${url}. Loopback only; GET with authorization.`);
    let reading = false;
    const timer = setInterval(async () => {
        if (reading) return; reading = true;
        try { feed = sanitizeFeed(JSON.parse(await fs.readFile(filename, 'utf8'))); }
        catch { feed = null; console.error('Publication is unavailable or invalid; API data access suspended.'); }
        finally { reading = false; }
    }, 3000);
    const stop = async () => { clearInterval(timer); await api.stop(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
if (require.main === module) run().catch(() => { console.error('Cannot start API. Check publication file, port and two distinct tokens (32+ characters).'); process.exitCode = 1; });
module.exports = { run };
