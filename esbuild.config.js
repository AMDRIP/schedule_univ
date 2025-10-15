// esbuild.config.js
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const distDir = 'dist';

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

async function build() {
    try {
        await esbuild.build({
            entryPoints: ['index.tsx'],
            bundle: true,
            outfile: path.join(distDir, 'bundle.js'),
            platform: 'browser',
            format: 'iife',
            sourcemap: true,
            loader: {
                '.ts': 'ts',
                '.tsx': 'tsx',
            },
            logLevel: 'info',
        });
        console.log('✅ JavaScript build finished successfully.');
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}

build();
