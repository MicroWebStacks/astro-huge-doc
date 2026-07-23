'use strict';

const crypto = require('crypto');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWebviewHtml(url, port, cspSource, historyState) {
  const escapedUrl = escapeHtml(url);
  const escapedCspSource = escapeHtml(cspSource);
  const nonce = crypto.randomBytes(16).toString('base64');
  const initialHistoryState = JSON.stringify({
    type: 'microwebstacks.previewHistoryState',
    canGoBack: Boolean(historyState?.canGoBack),
    canGoForward: Boolean(historyState?.canGoForward)
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} http://127.0.0.1:${port}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${escapedCspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MicroWebStacks Docs</title>
  <style>
    html, body, iframe {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <iframe id="preview-frame" src="${escapedUrl}" title="Markdown Site Preview"></iframe>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const frame = document.getElementById('preview-frame');
    let historyState = ${initialHistoryState};
    const sendHistoryState = () => {
      frame.contentWindow?.postMessage(historyState, '*');
    };
    frame.addEventListener('load', sendHistoryState);
    window.addEventListener('message', (event) => {
      if (event.source === frame.contentWindow) {
        const message = event.data;
        if (message?.type === 'microwebstacks.previewRoute'
          || message?.type === 'microwebstacks.previewHistory') {
          vscode.postMessage(message);
        }
        return;
      }
      if (event.data?.type === 'microwebstacks.previewHistoryState') {
        historyState = event.data;
        sendHistoryState();
      }
    });
  </script>
</body>
</html>`;
}

module.exports = {renderWebviewHtml};
