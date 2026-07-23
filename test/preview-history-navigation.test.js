import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const {
    movePreviewHistory,
    normalizePreviewRoute,
    previewHistoryState,
    recordPreviewRoute
} = require('../packages/vscode-extension/preview-history.js');
const {renderWebviewHtml} = require('../packages/vscode-extension/preview-webview.js');

test('preview history records routes, traverses them, and truncates a forward branch', () => {
    const session = {currentRoute: '/', historyRoutes: [], historyIndex: -1};

    assert.equal(recordPreviewRoute(session, '/one'), true);
    assert.equal(recordPreviewRoute(session, '/two'), true);
    assert.equal(recordPreviewRoute(session, '/two?overlay=ignored'), false);
    assert.deepEqual(previewHistoryState(session), {canGoBack: true, canGoForward: false});

    assert.equal(movePreviewHistory(session, -1), '/one');
    assert.deepEqual(previewHistoryState(session), {canGoBack: false, canGoForward: true});
    assert.equal(recordPreviewRoute(session, '/three'), true);
    assert.deepEqual(session.historyRoutes, ['/one', '/three']);
    assert.deepEqual(previewHistoryState(session), {canGoBack: true, canGoForward: false});
    assert.equal(movePreviewHistory(session, 1), null);
});

test('preview history rejects cross-origin and malformed routes', () => {
    assert.equal(normalizePreviewRoute('/guides/setup'), '/guides/setup');
    assert.equal(normalizePreviewRoute('/guides/setup?modal=1#part'), '/guides/setup');
    assert.equal(normalizePreviewRoute('//example.com/escape'), null);
    assert.equal(normalizePreviewRoute('https://example.com/escape'), null);
    assert.equal(normalizePreviewRoute(null), null);
});

test('rendered-page controls announce routes, relay actions, and apply availability', async () => {
    const sent = [];
    const windowListeners = new Map();
    const makeButton = () => {
        const listeners = new Map();
        return {
            disabled: true,
            addEventListener(type, listener) {
                listeners.set(type, listener);
            },
            click() {
                listeners.get('click')?.();
            }
        };
    };
    const back = makeButton();
    const forward = makeButton();
    const controls = {setAttribute() {}};
    const parentWindow = {postMessage: (message) => sent.push(message)};
    const currentWindow = {
        parent: parentWindow,
        location: {pathname: '/log'},
        addEventListener(type, listener) {
            windowListeners.set(type, listener);
        }
    };
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = currentWindow;
    globalThis.document = {
        documentElement: {dataset: {previewMode: 'false'}},
        querySelector(selector) {
            if (selector === '[data-preview-history-controls]') return controls;
            if (selector === '[data-preview-history="back"]') return back;
            if (selector === '[data-preview-history="forward"]') return forward;
            return null;
        }
    };

    try {
        await import(`../src/layout/preview_history.js?test=${Date.now()}`);
        assert.deepEqual(sent.shift(), {type: 'microwebstacks.previewRoute', route: '/log'});

        windowListeners.get('message')({
            source: parentWindow,
            data: {
                type: 'microwebstacks.previewHistoryState',
                canGoBack: true,
                canGoForward: false
            }
        });
        assert.equal(back.disabled, false);
        assert.equal(forward.disabled, true);

        back.click();
        forward.click();
        assert.deepEqual(sent, [
            {type: 'microwebstacks.previewHistory', action: 'back'},
            {type: 'microwebstacks.previewHistory', action: 'forward'}
        ]);
    } finally {
        globalThis.window = previousWindow;
        globalThis.document = previousDocument;
    }
});

test('webview relay accepts a port-mapped iframe origin and returns state', () => {
    const html = renderWebviewHtml(
        'http://localhost:4321/log',
        4321,
        'vscode-webview://test',
        {canGoBack: true, canGoForward: false}
    );
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, 'expected the webview relay script');

    const frameMessages = [];
    const vscodeMessages = [];
    const frameListeners = new Map();
    const windowListeners = new Map();
    const frameWindow = {
        postMessage(message, targetOrigin) {
            frameMessages.push({message, targetOrigin});
        }
    };
    const frame = {
        contentWindow: frameWindow,
        addEventListener(type, listener) {
            frameListeners.set(type, listener);
        }
    };
    const context = {
        acquireVsCodeApi: () => ({
            postMessage(message) {
                vscodeMessages.push(message);
            }
        }),
        document: {getElementById: () => frame},
        window: {
            addEventListener(type, listener) {
                windowListeners.set(type, listener);
            }
        }
    };
    vm.runInNewContext(script, context);

    frameListeners.get('load')();
    assert.deepEqual(
        JSON.parse(JSON.stringify(frameMessages.shift())),
        {
            message: {
                type: 'microwebstacks.previewHistoryState',
                canGoBack: true,
                canGoForward: false
            },
            targetOrigin: '*'
        }
    );

    windowListeners.get('message')({
        source: frameWindow,
        origin: 'vscode-webview://mapped-localhost-origin',
        data: {type: 'microwebstacks.previewHistory', action: 'back'}
    });
    assert.deepEqual(vscodeMessages, [
        {type: 'microwebstacks.previewHistory', action: 'back'}
    ]);

    windowListeners.get('message')({
        source: null,
        data: {
            type: 'microwebstacks.previewHistoryState',
            canGoBack: false,
            canGoForward: true
        }
    });
    assert.deepEqual(
        JSON.parse(JSON.stringify(frameMessages.shift())),
        {
            message: {
                type: 'microwebstacks.previewHistoryState',
                canGoBack: false,
                canGoForward: true
            },
            targetOrigin: '*'
        }
    );
});

test('breadcrumb places accessible history arrows at its right edge', () => {
    const source = readFileSync('src/layout/Breadcrumb.astro', 'utf8');
    const indexSource = readFileSync('src/pages/index.astro', 'utf8');
    const webviewSource = readFileSync('packages/vscode-extension/preview-webview.js', 'utf8');
    assert.match(source, /aria-label="Rendered page history"/);
    assert.match(source, /data-preview-history="back"[\s\S]*aria-label="Previous rendered page"/);
    assert.match(source, /data-preview-history="forward"[\s\S]*aria-label="Next rendered page"/);
    assert.match(source, /<svg viewBox="0 0 20 20" width="20" height="20"/);
    assert.match(source, /\.preview-history-controls\s*\{[\s\S]*margin-left:auto;/);
    assert.match(source, /segments\.length > 0 \|\| showPreviewHistory/);
    assert.match(indexSource, /<Breadcrumb data=\{data\} \/>/);
    assert.match(webviewSource, /event\.source === frame\.contentWindow/);
    assert.match(webviewSource, /postMessage\(historyState, '\*'\)/);
    assert.doesNotMatch(webviewSource, /event\.origin !== frameOrigin/);
});
