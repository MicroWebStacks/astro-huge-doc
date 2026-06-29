/*
 * structure-db dispatcher.
 *
 * All content retrieval flows through this single module. It selects a backend
 * implementation at load time and re-exports its full named surface, so every
 * consumer keeps importing `@/libs/structure-db.js` unchanged.
 *
 * Backend selection (first match wins):
 *   DOCS_BACKEND env var          →  'json' | 'sqlite'
 *   else derived from DOCS_PROFILE →  'lite' ⇒ json, otherwise sqlite
 *   default                       →  'sqlite'
 *
 * The full website defaults to sqlite (canonical store). The VS Code "lite"
 * extension sets DOCS_PROFILE=lite (or DOCS_BACKEND=json) so no native deps
 * (better-sqlite3) load. This derivation MUST mirror config.js, and this module
 * must NOT import config.js — config.js imports better-sqlite3, which would
 * defeat the point of the json backend.
 */
const profile = (process.env.DOCS_PROFILE ?? 'full').trim().toLowerCase();
const backend = (process.env.DOCS_BACKEND ?? (profile === 'lite' ? 'json' : 'sqlite')).trim().toLowerCase();

const impl =
    backend === 'json'
        ? await import('./structure-db-json.js')
        : await import('./structure-db-sqlite.js');

export const {
    getEntry,
    getFirstDocument,
    getAssetByUIDVersion,
    getAssetInfoBlob_version,
    getAssetInfoBlob_blob,
    getDocument,
    getItems,
    getAssetInfo,
    parseAssetLink,
    getImageInfo,
    getAssetBlob
} = impl;
