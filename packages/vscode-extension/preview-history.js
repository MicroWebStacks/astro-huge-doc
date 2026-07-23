'use strict';

function normalizePreviewRoute(route) {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//')) {
    return null;
  }
  try {
    const parsed = new URL(route, 'http://preview.local');
    if (parsed.origin !== 'http://preview.local') {
      return null;
    }
    return parsed.pathname || '/';
  } catch {
    return null;
  }
}

function ensurePreviewHistory(session) {
  if (!Array.isArray(session.historyRoutes)) {
    session.historyRoutes = [];
  }
  if (!Number.isInteger(session.historyIndex)) {
    session.historyIndex = session.historyRoutes.length - 1;
  }
}

function previewHistoryState(session) {
  ensurePreviewHistory(session);
  return {
    canGoBack: session.historyIndex > 0,
    canGoForward: session.historyIndex >= 0
      && session.historyIndex < session.historyRoutes.length - 1
  };
}

function recordPreviewRoute(session, route) {
  const normalized = normalizePreviewRoute(route);
  if (!normalized) {
    return false;
  }
  ensurePreviewHistory(session);
  if (session.historyRoutes[session.historyIndex] === normalized) {
    session.currentRoute = normalized;
    return false;
  }
  session.historyRoutes.splice(session.historyIndex + 1);
  session.historyRoutes.push(normalized);
  session.historyIndex = session.historyRoutes.length - 1;
  session.currentRoute = normalized;
  return true;
}

function movePreviewHistory(session, delta) {
  ensurePreviewHistory(session);
  const nextIndex = session.historyIndex + delta;
  if (nextIndex < 0 || nextIndex >= session.historyRoutes.length) {
    return null;
  }
  session.historyIndex = nextIndex;
  session.currentRoute = session.historyRoutes[nextIndex];
  return session.currentRoute;
}

module.exports = {
  movePreviewHistory,
  normalizePreviewRoute,
  previewHistoryState,
  recordPreviewRoute
};
