/*
 * Empty stub used by the lite build to alias out full-only client libraries
 * (e.g. @google/model-viewer). The lite profile gates those islands so they are
 * never rendered/hydrated; aliasing their side-effect imports to this empty
 * module keeps the heavy code (and its bundled three.js) out of the lite dist.
 */
export {};
