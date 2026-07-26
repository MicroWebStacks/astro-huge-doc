import {resolveLink} from '@/libs/structure-db';
import {basePrefix, withBasePrefix} from '@/libs/blob-files.js';
import {config} from '@/config';

/** Resolve an authored Markdown link for prose or a rich table cell. */
function resolveLinkPresentation({ast = {}, docSid = null, versionId = null} = {}) {
    const rawUrl = String(ast?.url ?? '');
    const resolvedVersion = versionId ?? config.collect.version_id;
    const relation = rawUrl && !rawUrl.startsWith('#')
        ? (ast?.rel ?? (typeof resolveLink === 'function' ? resolveLink(docSid, rawUrl, resolvedVersion) : null))
        : ast?.rel ?? null;
    const external = relation ? Boolean(relation.external) : rawUrl.startsWith('http');
    const unresolved = relation?.status === 'unresolved';
    const resolved = relation?.status === 'resolved';

    let href = rawUrl;
    if (resolved && !ast?.rel && relation?.url) {
        const fragment = relation.fragment ? `#${relation.fragment}` : '';
        href = `${basePrefix(config.base)}/${relation.url}${fragment}`;
    } else if (!external) {
        // Everything not rewritten above keeps the authored value: a
        // pre-resolved ast.rel, and links the collector could not resolve.
        // Those are still site-root-relative when they start with "/", so a
        // sub-path deployment has to prefix them (WP-24, R-9).
        href = withBasePrefix(href, config.base);
    }

    return {
        href,
        rawUrl,
        title: unresolved ? `Unresolved link: ${relation?.raw ?? rawUrl}` : (ast?.title ?? null),
        className: `link ${external ? 'external' : ''} ${resolved ? 'concept' : ''}`.replace(/\s+/g, ' ').trim(),
        target: external ? '_blank' : '_self',
        rel: external ? 'noopener' : null,
        unresolved,
        resolved,
        external
    };
}

export {resolveLinkPresentation};
