function extensionFromUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let pathname = raw.split(/[?#]/, 1)[0];
    try {
        pathname = new URL(raw, 'https://local.invalid/').pathname;
    } catch {
        // Keep the authored path when URL parsing fails.
    }
    const fileName = pathname.split('/').at(-1) ?? '';
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function classifyLinkComponent({url, assetExt = '', hasAsset = false, profile = 'full', diagram = false} = {}) {
    const normalizedAssetExt = String(assetExt ?? '').replace(/^\./, '').toLowerCase();
    const extension = hasAsset && normalizedAssetExt ? normalizedAssetExt : extensionFromUrl(url);
    // `.glb` stays full-only: lite aliases '@google/model-viewer' to an empty
    // module, so a model viewer there would render an inert element. `.xlsx`
    // has no such constraint - the workbook is parsed server-side and reuses
    // the MarkdownTable island lite already ships - so tables render in every
    // profile, matching the live site.
    const model3d = profile !== 'lite' && extension === 'glb';
    const table = extension === 'xlsx';
    const diagramCode = hasAsset && Boolean(diagram);
    return {
        extension,
        model3d,
        table,
        diagram: diagramCode,
        link: !(model3d || table || diagramCode)
    };
}

export {classifyLinkComponent, extensionFromUrl};
