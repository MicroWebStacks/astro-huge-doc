const fs = require('fs');
const path = require('path');
const {runTests} = require('@vscode/test-electron');

// Some developer shells set this so VS Code's Electron binary can be used as
// a Node runner. The test process itself must launch as Electron.
delete process.env.ELECTRON_RUN_AS_NODE;

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workRoot = path.join(repoRoot, '.tmp', 'extension-tests');
const fixtureRoot = path.join(workRoot, 'workspace');
const reportRoot = path.join(workRoot, 'reports');
const userDataRoot = path.join(workRoot, 'user-data');
const sourceFixtures = path.join(__dirname, 'fixtures');

fs.rmSync(workRoot, {recursive: true, force: true});
fs.mkdirSync(fixtureRoot, {recursive: true});
fs.cpSync(sourceFixtures, fixtureRoot, {recursive: true});
fs.mkdirSync(reportRoot, {recursive: true});

const workspaceFile = path.join(fixtureRoot, 'active-tracking.code-workspace');
fs.writeFileSync(workspaceFile, JSON.stringify({
  folders: [{name: 'one', path: 'one'}, {name: 'two', path: 'two'}],
  settings: {
    'microwebstacks.preview.engineSource': 'local',
    'microwebstacks.preview.enginePath': repoRoot,
    'microwebstacks.preview.docsRoot': 'docs'
  }
}, null, 2));

runTests({
  version: '1.100.3',
  extensionDevelopmentPath: path.join(repoRoot, 'packages', 'vscode-extension'),
  extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
  launchArgs: [workspaceFile, '--disable-extensions', `--user-data-dir=${userDataRoot}`],
  extensionTestsEnv: {
    MWS_TEST_INTERNALS: '1',
    MWS_TEST_REPORT_DIR: reportRoot,
    MWS_TEST_WORKSPACE_ROOT: fixtureRoot
  }
}).catch((error) => {
  const failure = {status: 'failed-to-launch', error: error?.stack || String(error), platform: process.platform, node: process.version, at: new Date().toISOString()};
  if (!fs.existsSync(path.join(reportRoot, 'results.json'))) {
    fs.writeFileSync(path.join(reportRoot, 'results.json'), JSON.stringify(failure, null, 2));
    fs.writeFileSync(path.join(reportRoot, 'runtime.json'), JSON.stringify(failure, null, 2));
    fs.writeFileSync(path.join(reportRoot, 'runtime.md'), `# VS Code extension-host test runtime\n\nStatus: failed to launch\n\n\`\`\`text\n${failure.error}\n\`\`\`\n`);
  }
  console.error(error);
  process.exitCode = 1;
});
