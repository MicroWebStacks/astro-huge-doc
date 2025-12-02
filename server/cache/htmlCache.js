import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEFAULT_DB_PATH = join(__dirname, 'cache.db');

function initDb(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS html_cache (
      url TEXT PRIMARY KEY,
      status INTEGER NOT NULL,
      headers TEXT NOT NULL,
      body BLOB NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  return {
    db,
    select: db.prepare('SELECT status, headers, body FROM html_cache WHERE url = ?'),
    upsert: db.prepare(`
      INSERT INTO html_cache (url, status, headers, body)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        status = excluded.status,
        headers = excluded.headers,
        body = excluded.body,
        created_at = CURRENT_TIMESTAMP
    `)
  };
}

function shouldBypassCache(req) {
  if (req.method && req.method.toUpperCase() !== 'GET') {
    return true;
  }
  return req.originalUrl && req.originalUrl.startsWith('/assets/');
}

function bufferFromChunk(chunk, encoding) {
  if (!chunk) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  return Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);
}

export function createHtmlCacheMiddleware(options = {}) {
  const { dbPath = DEFAULT_DB_PATH } = options;
  const { select, upsert } = initDb(dbPath);

  return function htmlCacheMiddleware(req, res, next) {
    if (shouldBypassCache(req)) {
      return next();
    }

    const cacheKey = req.originalUrl || req.url;

    try {
      const cached = select.get(cacheKey);
      if (cached) {
        const headers = JSON.parse(cached.headers || '{}');
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === 'content-length') continue;
          res.setHeader(key, value);
        }
        res.setHeader('Content-Length', Buffer.byteLength(cached.body));
        res.setHeader('X-Cache', 'HIT');
        res.status(cached.status).end(cached.body);
        return;
      }
    } catch (err) {
      console.error('[html-cache] read failed', err);
    }

    const chunks = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = (chunk, encoding, cb) => {
      const buffered = bufferFromChunk(chunk, encoding);
      if (buffered) chunks.push(buffered);
      if (typeof encoding === 'function') {
        return originalWrite(chunk, encoding);
      }
      return originalWrite(chunk, encoding, cb);
    };

    res.end = (chunk, encoding, cb) => {
      const buffered = bufferFromChunk(chunk, encoding);
      if (buffered) chunks.push(buffered);

      const body = chunks.length ? Buffer.concat(chunks) : null;
      const statusCode = res.statusCode || 200;
      const contentType = res.getHeader('content-type');
      const isHtml = typeof contentType === 'string' && contentType.includes('text/html');

      if (body && statusCode >= 200 && statusCode < 300 && isHtml) {
        try {
          const headers = { ...res.getHeaders() };
          delete headers['content-length'];
          upsert.run(cacheKey, statusCode, JSON.stringify(headers), body);
        } catch (err) {
          console.error('[html-cache] write failed', err);
        }
      }

      if (typeof encoding === 'function') {
        return originalEnd(chunk, encoding);
      }
      return originalEnd(chunk, encoding, cb);
    };

    res.setHeader('X-Cache', 'MISS');
    return next();
  };
}
