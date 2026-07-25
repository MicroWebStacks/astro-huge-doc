/*
 * Fenced-block kind classification — the single source of truth for
 * "which custom component does this ```yaml <meta> block belong to".
 *
 * This rule used to exist twice, with two different predicates: the collector
 * matched the meta exactly (`meta === 'gallery'`) while the renderer matched a
 * prefix (`params.startsWith('gallery')`). A ```yaml gallery_dir block landed
 * on opposite sides of the two tests, so the collector produced no gallery
 * items while the renderer still mounted <Gallery> and dereferenced the ast
 * that was never written — a TypeError that aborted the whole static build.
 *
 * Both sides now import this module. Prefix matching is intentional: a kind
 * can carry a suffix that selects a variant of the same feature (`gallery` vs
 * `gallery_dir`); the yaml body, not the meta, decides how it is expanded.
 */

// Order matters only for readability; the kinds share no common prefix.
const CUSTOM_YAML_KINDS = ['gallery', 'glb', 'cards'];

/**
 * Classify a fenced code block.
 *
 * @param {string|null|undefined} language - the fence language (`yaml`, ...).
 *   The collector passes its slugified tag, the renderer the stored asset ext;
 *   both normalise to lowercase here so the two call sites cannot drift.
 * @param {string|null|undefined} meta - the text after the language on the
 *   fence line (`gallery`, `gallery_dir`, `glb`, `cards`, ...).
 * @returns {'gallery'|'glb'|'cards'|null} the custom component kind, or null
 *   for an ordinary code block that should be syntax-highlighted.
 */
export function codeBlockKind(language, meta) {
    const lang = String(language ?? '').trim().toLowerCase();
    if (lang !== 'yaml') {
        return null;
    }
    const metaText = String(meta ?? '').trim().toLowerCase();
    if (!metaText) {
        return null;
    }
    return CUSTOM_YAML_KINDS.find((kind) => metaText.startsWith(kind)) ?? null;
}

export {CUSTOM_YAML_KINDS};
