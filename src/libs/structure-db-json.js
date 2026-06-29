/*
 * structure-db JSON backend — PLACEHOLDER (Step C of the vscode_lite plan).
 *
 * This backend serves the "lite" profile (VS Code extension): it reads a
 * pre-exported JSON dataset and loads assets from disk, with NO native deps
 * (no better-sqlite3, no sharp). It is selected via DOCS_BACKEND=json.
 *
 * Until Step C is implemented, every export throws so the failure is loud and
 * obvious rather than silently returning empty content. The module exists now
 * only so the dispatcher's dynamic import target resolves at build time; the
 * default (sqlite) path is unaffected.
 */
const NOT_IMPLEMENTED = 'structure-db-json: JSON backend not implemented yet (vscode_lite plan, Step C). Use DOCS_BACKEND=sqlite.';

function notImplemented() {
    throw new Error(NOT_IMPLEMENTED);
}

export const getEntry = notImplemented;
export const getFirstDocument = notImplemented;
export const getAssetByUIDVersion = notImplemented;
export const getAssetInfoBlob_version = notImplemented;
export const getAssetInfoBlob_blob = notImplemented;
export const getDocument = notImplemented;
export const getItems = notImplemented;
export const getAssetInfo = notImplemented;
export const parseAssetLink = notImplemented;
export const getImageInfo = notImplemented;
export const getAssetBlob = notImplemented;
