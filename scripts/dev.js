#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const nodeExecutable = process.execPath;
const astroBin = join(root, 'node_modules', 'astro', 'astro.js');

function runNodeScript(script) {
    return new Promise((resolve, reject) => {
        const child = spawn(nodeExecutable, [join(root, script)], {
            cwd: root,
            stdio: 'inherit',
            env: process.env
        });
        child.on('error', reject);
        child.on('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${script} failed (code: ${code}, signal: ${signal})`));
        });
    });
}

async function main() {
    await runNodeScript('scripts/collect.js');
    await runNodeScript('scripts/diagrams.js');

    const child = spawn(nodeExecutable, [astroBin, 'dev', ...process.argv.slice(2)], {
        cwd: root,
        stdio: 'inherit',
        env: process.env
    });
    child.on('error', (error) => {
        console.error(error);
        process.exit(1);
    });
    child.on('exit', (code, signal) => {
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exit(code ?? 0);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
