import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const reportDir = process.argv[2] ?? '.tmp/extension-tests/reports';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const runtimePath = join(reportDir, 'runtime.md');
if (!existsSync(runtimePath)) {
    mkdirSync(reportDir, {recursive: true});
    const missing = {
        status: 'not-run',
        os: `${process.platform} ${process.arch}`,
        node: process.version,
        reason: 'The extension-host runner did not produce a report. Inspect the preceding workflow step.'
    };
    writeFileSync(join(reportDir, 'runtime.json'), JSON.stringify(missing, null, 2));
    writeFileSync(join(reportDir, 'results.json'), JSON.stringify(missing, null, 2));
    writeFileSync(runtimePath, `# VS Code extension-host test runtime\n\n- Status: not run\n- OS: ${missing.os}\n- Node: ${missing.node}\n- Reason: ${missing.reason}\n`);
}
const report = readFileSync(runtimePath, 'utf8');
if (summaryPath) {
    appendFileSync(summaryPath, report);
} else {
    console.log(report);
}
