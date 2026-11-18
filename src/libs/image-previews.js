// Rendering/serving helpers only: never import Sharp or the collector here.
import {readFileSync, statSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {basePrefix} from './blob-files.js';

export function previewDirectory(config) {
    return join(config.collect.outdir, 'image-previews');
}

const indexes = new Map();
export function readPreviewIndex(directory) {
    const file = join(directory, 'index.json');
    try {
        const stamp = statSync(file);
        const key = `${stamp.mtimeMs}:${stamp.size}`;
        if (indexes.get(file)?.key !== key) {
            indexes.set(file, {key, index: JSON.parse(readFileSync(file, 'utf8'))});
        }
        return indexes.get(file).index;
    } catch {
        indexes.delete(file);
        return {sources: {}};
    }
}

export function imagePreview(originalUrl, config) {
    if (config.profile === 'lite' || !originalUrl) return null;
    const directory = previewDirectory(config);
    const name = originalUrl.split('/').pop();
    const source = readPreviewIndex(directory).sources?.[name];
    if (!source) return null;
    const variants = (source.variants ?? []).filter((variant) =>
        /^[a-f0-9]{64}\.webp$/.test(variant.file) && existsSync(join(directory, variant.file)));
    return {
        width: source.width,
        height: source.height,
        variants: variants.map((variant) => ({...variant,
            url: `${basePrefix(config.base)}/image-previews/${variant.file}`}))
    };
}

// Only hash-addressed binary files are public; never serve the index.
export function previewFileName(pathname, base = '/') {
    const prefix = `${basePrefix(base)}/image-previews/`;
    if (!pathname.startsWith(prefix)) return null;
    const name = pathname.slice(prefix.length);
    return /^[a-f0-9]{64}\.webp$/.test(name) ? name : null;
}

export async function exportImagePreviews(config, targetDir) {
    if (config.profile === 'lite') return;
    const {mkdir, copyFile} = await import('node:fs/promises');
    const directory = previewDirectory(config);
    const files = new Set(Object.values(readPreviewIndex(directory).sources ?? {})
        .flatMap((source) => source.variants ?? []).map((variant) => variant.file)
        .filter((file) => /^[a-f0-9]{64}\.webp$/.test(file)));
    if (!files.size) return;
    await mkdir(targetDir, {recursive: true});
    for (const file of files) await copyFile(join(directory, file), join(targetDir, file));
}
