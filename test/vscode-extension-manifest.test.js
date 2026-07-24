import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const manifest = JSON.parse(readFileSync(resolve('packages/vscode-extension/package.json'), 'utf8'));
const commands = manifest.contributes.commands.map((entry) => entry.command);
const commandEntries = new Map(
    manifest.contributes.commands.map((entry) => [entry.command, entry])
);

test('extension exposes one embedded preview surface and hides lock internals from the palette', () => {
    assert.ok(commands.includes('microwebstacks.previewDocs'));
    assert.ok(commands.includes('microwebstacks.restartDocsPreviewServer'));
    assert.ok(commands.includes('microwebstacks.stopDocsPreviewServer'));
    assert.ok(!commands.includes('microwebstacks.openDocsInBrowser'));

    const hidden = new Map(manifest.contributes.menus.commandPalette.map((entry) => [entry.command, entry.when]));
    assert.equal(hidden.get('microwebstacks.internal.lockDocsPreview'), 'false');
    assert.equal(hidden.get('microwebstacks.internal.unlockDocsPreview'), 'false');
});

test('preview lock has no native VS Code button — it is a webview app-bar control only', () => {
    assert.equal(manifest.contributes.menus['webview/title'], undefined);

    const titleActions = new Map(
        manifest.contributes.menus['editor/title'].map((entry) => [entry.command, entry])
    );
    assert.equal(titleActions.get('microwebstacks.internal.lockDocsPreview'), undefined);
    assert.equal(titleActions.get('microwebstacks.internal.unlockDocsPreview'), undefined);
    assert.equal([...titleActions.keys()].length, 1);
    assert.equal(titleActions.get('microwebstacks.previewDocs')?.group, 'navigation');

    // Commands stay registered (internal test/programmatic surface) but are
    // reachable only via the in-page app-bar toggle's postMessage bridge.
    assert.equal(commandEntries.get('microwebstacks.internal.lockDocsPreview')?.title, 'Preview Lock');
    assert.equal(commandEntries.get('microwebstacks.internal.unlockDocsPreview')?.title, 'Preview Unlock');
});

test('restart-sensitive preview settings support workspace-folder scope', () => {
    for (const name of ['engineSource', 'enginePath', 'docsRoot', 'krokiServer']) {
        assert.equal(manifest.contributes.configuration.properties[`microwebstacks.preview.${name}`].scope, 'resource');
    }
});
