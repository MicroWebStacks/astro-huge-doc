/**
 * Fit root-section links into the app bar without letting intrinsic label
 * widths compete with the protected utility group.
 *
 * The active section is mandatory in priority-overflow mode. Home and then
 * the remaining sections are added in configured order while they fit. Once
 * an ordered optional item does not fit, later optional items remain in More
 * so the visible row does not become a surprising sample of the source order.
 */
function fitAppBarItems(widths, availableWidth, {
    activeIndex = -1,
    overflowWidth = 0,
    safety = 8
} = {}) {
    const normalized = widths.map((width) => Math.max(0, Number(width) || 0));
    const available = Math.max(0, Number(availableWidth) || 0);
    const usableWithoutOverflow = Math.max(0, available - safety);
    const allWidth = normalized.reduce((total, width) => total + width, 0);

    if (allWidth <= usableWithoutOverflow) {
        return {
            visibleIndices: normalized.map((_, index) => index),
            hiddenIndices: [],
            compact: false
        };
    }

    const itemBudget = Math.max(0, usableWithoutOverflow - Math.max(0, overflowWidth));
    const resolvedActive = activeIndex >= 0 && activeIndex < normalized.length
        ? activeIndex
        : (normalized.length ? 0 : -1);

    if (resolvedActive < 0 || normalized[resolvedActive] > itemBudget) {
        return {
            visibleIndices: [],
            hiddenIndices: normalized.map((_, index) => index),
            compact: true
        };
    }

    const visible = new Set([resolvedActive]);
    let used = normalized[resolvedActive];

    // Home is the first generated item. It is second only to current context.
    if (resolvedActive !== 0 && normalized.length && used + normalized[0] <= itemBudget) {
        visible.add(0);
        used += normalized[0];
    }

    for (let index = 0; index < normalized.length; index += 1) {
        if (visible.has(index)) {
            continue;
        }
        if (used + normalized[index] > itemBudget) {
            break;
        }
        visible.add(index);
        used += normalized[index];
    }

    const visibleIndices = [...visible].sort((a, b) => a - b);
    const hiddenIndices = normalized
        .map((_, index) => index)
        .filter((index) => !visible.has(index));

    return {visibleIndices, hiddenIndices, compact: false};
}

export {fitAppBarItems};
