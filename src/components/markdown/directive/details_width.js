/**
 * Convert a code surface's horizontal overflow into the details shell width
 * that would satisfy it. The measurement is taken while the shell is at its
 * standard width, so adding only the overflow preserves all existing shell,
 * body, toolbar, and border chrome without duplicating CSS spacing in JS.
 */
function computeDetailsContentWidth(detailsWidth, scrollWidth, clientWidth) {
    const outer = Number(detailsWidth);
    const scroll = Number(scrollWidth);
    const client = Number(clientWidth);
    if (![outer, scroll, client].every(Number.isFinite) || outer <= 0 || client < 0) {
        return null;
    }
    const overflow = scroll - client;
    if (overflow <= 1) {
        return null;
    }
    return Math.ceil(outer + overflow);
}

export {computeDetailsContentWidth};
