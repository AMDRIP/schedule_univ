const { createProjectStorage } = require('../integrations/projectStorage.cjs');
const fs = require('node:fs/promises');
const filename = process.argv[2];
const io = { ...fs, rename: async (from, to) => {
    if (to === filename) { process.send('before-replace'); await new Promise(() => setInterval(() => {}, 1000)); }
    return fs.rename(from, to);
} };
createProjectStorage({ io }).save(filename, JSON.stringify({ schedule: [{ id: 'new' }] })).catch(() => process.exit(1));
