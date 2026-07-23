const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const EXTENSION_ID = 'microwebstacks.markdown-site-preview';
const reportRoot = process.env.MWS_TEST_REPORT_DIR;
const fixtureRoot = process.env.MWS_TEST_WORKSPACE_ROOT;
const timings = [];

async function waitFor(predicate, message, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

async function runCase(name, task) {
  const startedAt = Date.now();
  try {
    await task();
    timings.push({name, status: 'passed', durationMs: Date.now() - startedAt});
  } catch (error) {
    timings.push({name, status: 'failed', durationMs: Date.now() - startedAt, error: error.stack || String(error)});
    throw error;
  }
}

async function openFile(relativePath) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureRoot, relativePath)));
  return vscode.window.showTextDocument(document, {preview: false});
}

function writeReports(startedAt, error = null) {
  fs.mkdirSync(reportRoot, {recursive: true});
  const totalMs = Date.now() - startedAt;
  const passed = timings.filter((item) => item.status === 'passed').length;
  const failed = timings.filter((item) => item.status === 'failed').length;
  const runtime = {
    status: error ? 'failed' : 'passed', os: `${process.platform} ${process.arch}`,
    vscode: vscode.version, node: process.version, totalMs, passed, failed,
    timeouts: timings.filter((item) => item.error?.includes('Timed out')).length,
    suites: timings,
    slowest: [...timings].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5)
  };
  fs.writeFileSync(path.join(reportRoot, 'results.json'), JSON.stringify({error: error?.stack || null, tests: timings}, null, 2));
  fs.writeFileSync(path.join(reportRoot, 'runtime.json'), JSON.stringify(runtime, null, 2));
  const rows = runtime.slowest.map((item) => `| ${item.name} | ${item.status} | ${item.durationMs} |`).join('\n');
  fs.writeFileSync(path.join(reportRoot, 'runtime.md'), [
    '# VS Code extension-host test runtime', '', `- Status: ${runtime.status}`, `- OS: ${runtime.os}`,
    `- VS Code: ${runtime.vscode}`, `- Node: ${runtime.node}`, `- Total: ${runtime.totalMs} ms`,
    `- Passed/failed/timeouts: ${passed}/${failed}/${runtime.timeouts}`, '',
    '| Slowest test | Status | Duration (ms) |', '| --- | --- | ---: |', rows, ''
  ].join('\n'));
}

async function run() {
  const startedAt = Date.now();
  let failure = null;
  try {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `Extension ${EXTENSION_ID} was not discovered`);
    const snapshots = () => vscode.commands.executeCommand('microwebstacks.internal.testSessionSnapshots');
    await runCase('lazy activation and command surface', async () => {
      await extension.activate();
      const commands = await vscode.commands.getCommands(true);
      assert.equal((await snapshots()).length, 0);
      assert.ok(commands.includes('microwebstacks.previewDocs'));
      assert.ok(commands.includes('microwebstacks.restartDocsPreviewServer'));
      assert.ok(commands.includes('microwebstacks.stopDocsPreviewServer'));
      assert.ok(!commands.includes('microwebstacks.openDocsInBrowser'));
    });

    const oneRoot = vscode.workspace.workspaceFolders.find((folder) => folder.name === 'one').uri.fsPath;
    const twoRoot = vscode.workspace.workspaceFolders.find((folder) => folder.name === 'two').uri.fsPath;
    await runCase('active Markdown route and follow/lock behavior', async () => {
      await openFile('one/docs/guides/setup.md');
      await vscode.commands.executeCommand('microwebstacks.previewDocs');
      let one = await waitFor(async () => (await snapshots()).find((item) => item.workspace === oneRoot && item.currentRoute === '/guides/setup'), 'workspace-one setup route');
      assert.ok(one.serverRunning && one.panelOpen && one.watcherOpen);
      await openFile('one/docs/guides/install.md');
      await waitFor(async () => (await snapshots()).find((item) => item.workspace === oneRoot && item.currentRoute === '/guides/install'), 'follow navigation');
      await vscode.commands.executeCommand('microwebstacks.internal.lockDocsPreview');
      await openFile('one/docs/guides/setup.md');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal((await snapshots()).find((item) => item.workspace === oneRoot).currentRoute, '/guides/install');
      await vscode.commands.executeCommand('microwebstacks.internal.unlockDocsPreview');
      await waitFor(async () => (await snapshots()).find((item) => item.workspace === oneRoot && item.currentRoute === '/guides/setup'), 'unlock catch-up navigation');
      await vscode.commands.executeCommand(
        'microwebstacks.internal.testPreviewMessage',
        oneRoot,
        {type: 'microwebstacks.previewHistory', action: 'back'}
      );
      await waitFor(async () => (await snapshots()).find((item) => (
        item.workspace === oneRoot
        && item.currentRoute === '/guides/install'
        && item.historyIndex === 1
      )), 'preview-local history back');
      await vscode.commands.executeCommand(
        'microwebstacks.internal.testPreviewMessage',
        oneRoot,
        {type: 'microwebstacks.previewHistory', action: 'forward'}
      );
      await waitFor(async () => (await snapshots()).find((item) => (
        item.workspace === oneRoot
        && item.currentRoute === '/guides/setup'
        && item.historyIndex === 2
      )), 'preview-local history forward');
      await openFile('one/docs/component.mdx');
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal((await snapshots()).find((item) => item.workspace === oneRoot).currentRoute, '/guides/setup');

      const current = (await snapshots()).find((item) => item.workspace === oneRoot);
      fs.appendFileSync(path.join(oneRoot, 'docs', 'guides', 'setup.md'), '\nWatcher edit.\n');
      await waitFor(() => fs.existsSync(path.join(current.storageRoot, 'store', 'json', 'reload.stamp')), 'reload stamp');
      fs.writeFileSync(path.join(oneRoot, 'docs', 'guides', 'new-page.md'), '# New page\n');
      await waitFor(() => fs.existsSync(path.join(current.storageRoot, 'store', 'json', 'tree.stamp')), 'tree stamp');
    });

    await runCase('multi-root isolation and workspace-scoped stop', async () => {
      await openFile('two/docs/guide.md');
      await vscode.commands.executeCommand('microwebstacks.previewDocs');
      await waitFor(async () => (await snapshots()).find((item) => item.workspace === twoRoot && item.currentRoute === '/guide'), 'workspace-two route');
      const before = await snapshots();
      assert.equal(before.length, 2);
      assert.notEqual(before[0].port, before[1].port);
      assert.notEqual(before[0].storageRoot, before[1].storageRoot);
      await vscode.commands.executeCommand('microwebstacks.stopDocsPreviewServer');
      await waitFor(async () => !(await snapshots()).some((item) => item.workspace === twoRoot), 'workspace-two disposal');
      assert.ok((await snapshots()).some((item) => item.workspace === oneRoot && item.serverRunning));
    });

    await runCase('effective configuration restart and panel disposal', async () => {
      await openFile('two/docs/guide.md');
      await vscode.commands.executeCommand('microwebstacks.previewDocs');
      await waitFor(async () => (await snapshots()).find((item) => item.workspace === twoRoot && item.serverRunning), 'workspace-two reopen');
      await openFile('one/docs/guides/setup.md');
      const before = (await snapshots()).find((item) => item.workspace === oneRoot);
      const unaffected = (await snapshots()).find((item) => item.workspace === twoRoot);
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(oneRoot));
      const config = vscode.workspace.getConfiguration('microwebstacks.preview', folder.uri);
      await config.update('krokiServer', 'http://127.0.0.1:18001', vscode.ConfigurationTarget.WorkspaceFolder);
      const restarted = await waitFor(async () => {
        const item = (await snapshots()).find((candidate) => candidate.workspace === oneRoot);
        return item?.serverRunning && item.port !== before.port ? item : null;
      }, 'workspace-one configuration restart');
      assert.equal(restarted.currentRoute, '/guides/setup');
      assert.equal((await snapshots()).find((item) => item.workspace === twoRoot).port, unaffected.port);
      await vscode.commands.executeCommand('microwebstacks.restartDocsPreviewServer');
      const manuallyRestarted = await waitFor(async () => {
        const item = (await snapshots()).find((candidate) => candidate.workspace === oneRoot);
        return item?.serverRunning && item.port !== restarted.port ? item : null;
      }, 'manual workspace-one restart');
      assert.equal(manuallyRestarted.currentRoute, '/guides/setup');
      assert.equal((await snapshots()).find((item) => item.workspace === twoRoot).port, unaffected.port);
      await vscode.commands.executeCommand('microwebstacks.internal.testDisposePanel', oneRoot);
      await waitFor(async () => !(await snapshots()).some((item) => item.workspace === oneRoot), 'panel-close session disposal');
      await vscode.commands.executeCommand('microwebstacks.internal.testDisposePanel', twoRoot);
      await waitFor(async () => !(await snapshots()).some((item) => item.workspace === twoRoot), 'second panel-close session disposal');
    });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    writeReports(startedAt, failure);
  }
}

module.exports = {run};
