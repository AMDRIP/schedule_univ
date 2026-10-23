// esbuild.config.js
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = 'dist';

async function build() {
    try {
        if (fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
        }
        fs.mkdirSync(distDir);

        await esbuild.build({
            entryPoints: ['index.tsx'],
            bundle: true,
            outfile: path.join(distDir, 'bundle.js'),
            platform: 'browser',
            format: 'iife',
            sourcemap: true,
            minify: true,
            define: { 'process.env.NODE_ENV': '"production"' },
            loader: {
                '.ts': 'ts',
                '.tsx': 'tsx',
            },
            external: ['bindings', 'fs', 'path', 'node-addon-api'],
            logLevel: 'info',
        });

        await esbuild.build({
            entryPoints: ['services/schedulerWorkerHost.ts'],
            bundle: true,
            outfile: path.join(distDir, 'schedulerWorker.js'),
            platform: 'node',
            format: 'cjs',
            sourcemap: false,
            loader: {
                '.ts': 'ts',
            },
            external: ['bindings', 'fs', 'path', 'node-addon-api'],
            logLevel: 'info',
        });

        await esbuild.build({
            entryPoints: ['services/schedulerBrowserWorker.ts'], bundle: true,
            outfile: path.join(distDir, 'schedulerBrowserWorker.js'), platform: 'browser', format: 'iife',
            external: ['bindings', 'fs', 'path', 'node-addon-api'], logLevel: 'info',
        });
        await esbuild.build({
            entryPoints: ['services/schedulerCandidateBrowserWorker.ts'], bundle: true,
            outfile: path.join(distDir, 'schedulerCandidateBrowserWorker.js'), platform: 'browser', format: 'iife',
            external: ['bindings', 'fs', 'path', 'node-addon-api'], logLevel: 'info',
        });
        await esbuild.build({
            entryPoints: ['services/schedulerCandidateNodeWorker.ts'], bundle: true,
            outfile: path.join(distDir, 'schedulerCandidateNodeWorker.js'), platform: 'node', format: 'cjs',
            external: ['bindings', 'fs', 'path', 'node-addon-api'], logLevel: 'info',
        });
        console.log('JavaScript build finished successfully.');
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}

build();
