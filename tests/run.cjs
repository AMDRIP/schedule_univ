const path = require('path');
const { spawnSync } = require('child_process');
const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'scheduler.test.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: '.test-output/scheduler.test.cjs', external: ['bindings', 'fs', 'path', 'node-addon-api'] });
const result = spawnSync(process.execPath, ['--test', '.test-output/scheduler.test.cjs'], { stdio: 'inherit' });
process.exit(result.status || 0);
