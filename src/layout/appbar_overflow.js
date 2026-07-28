import {fitAppBarItems} from './appbar_fit.js';

const MOBILE_QUERY = '(max-width: 700px)';
const disclosures = new Set();

function closeDisclosure(disclosure, {restoreFocus = false} = {}) {
    if (!disclosure || disclosure.panel.hidden) {
        return;
    }
    disclosure.panel.hidden = true;
    disclosure.button.setAttribute('aria-expanded', 'false');
    disclosure.root?.classList.remove('disclosure-open');
    if (restoreFocus) {
        disclosure.button.focus();
    }
}

function openDisclosure(disclosure) {
    for (const other of disclosures) {
        if (other !== disclosure) {
            closeDisclosure(other);
        }
    }
    disclosure.panel.hidden = false;
    disclosure.button.setAttribute('aria-expanded', 'true');
    disclosure.root?.classList.add('disclosure-open');
    disclosure.onOpen?.();
}

function configureDisclosure(button, panel, options = {}) {
    if (!button || !panel) {
        return null;
    }
    const disclosure = {
        button,
        panel,
        root: options.root ?? button.parentElement,
        onOpen: options.onOpen
    };
    disclosures.add(disclosure);

    button.addEventListener('click', () => {
        if (panel.hidden) {
            openDisclosure(disclosure);
        } else {
            closeDisclosure(disclosure);
        }
    });

    panel.addEventListener('click', (event) => {
        if (event.target.closest?.('a[href], button')) {
            closeDisclosure(disclosure);
        }
    });

    panel.addEventListener('focusout', () => {
        window.setTimeout(() => {
            if (!panel.contains(document.activeElement) && document.activeElement !== button) {
                closeDisclosure(disclosure);
            }
        }, 0);
    });

    return disclosure;
}

function positionSectionPanel(bar, trigger, panel) {
    const barRect = bar.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panel.getBoundingClientRect().width;
    const inset = 8;
    const ideal = triggerRect.left - barRect.left;
    const maximum = Math.max(inset, barRect.width - panelWidth - inset);
    panel.style.left = `${Math.max(inset, Math.min(ideal, maximum))}px`;
}

function configureUtilityOverflow(bar, scheduleFit) {
    const toolbar = bar.querySelector('[data-utility-list]');
    const returnAnchor = bar.querySelector('[data-utility-return-anchor]');
    const triggerItem = bar.querySelector('[data-utility-overflow-trigger]');
    const trigger = bar.querySelector('[data-utility-overflow-toggle]');
    const panel = bar.querySelector('[data-utility-overflow-panel]');
    const list = bar.querySelector('[data-utility-overflow-list]');
    const utilityItems = [...bar.querySelectorAll('[data-secondary-utility]')];
    if (!toolbar || !returnAnchor || !triggerItem || !trigger || !panel || !list) {
        return;
    }

    configureDisclosure(trigger, panel, {root: triggerItem});
    const media = window.matchMedia(MOBILE_QUERY);

    function apply() {
        closeDisclosure([...disclosures].find((entry) => entry.button === trigger));
        if (media.matches && utilityItems.length) {
            utilityItems.forEach((item) => list.append(item));
            triggerItem.hidden = false;
        } else {
            utilityItems.forEach((item) => toolbar.insertBefore(item, returnAnchor));
            triggerItem.hidden = true;
        }
        scheduleFit();
    }

    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', apply);
    } else {
        media.addListener?.(apply);
    }
    apply();
}

function configureSectionOverflow(bar) {
    const region = bar.querySelector('[data-section-nav]');
    const items = [...bar.querySelectorAll('[data-section-item]')];
    const triggerItem = bar.querySelector('[data-section-overflow-trigger]');
    const trigger = bar.querySelector('[data-section-overflow-toggle]');
    const triggerLabel = trigger?.querySelector('[data-section-overflow-label]');
    const triggerCount = trigger?.querySelector('[data-section-overflow-count]');
    const panel = bar.querySelector('[data-section-overflow-panel]');
    const overflowItems = [...bar.querySelectorAll('[data-section-overflow-item]')];
    if (!region || !triggerItem || !trigger || !triggerLabel || !triggerCount || !panel) {
        return () => {};
    }

    const activeIndex = items.findIndex((item) => item.matches('[data-active-section="true"]'));
    const activeLabel = activeIndex >= 0 ? items[activeIndex].dataset.sectionLabel : null;
    const sectionDisclosure = configureDisclosure(trigger, panel, {
        root: triggerItem,
        onOpen: () => positionSectionPanel(bar, trigger, panel)
    });
    let frame = 0;

    function fit() {
        frame = 0;
        closeDisclosure(sectionDisclosure);
        bar.classList.remove('section-compact');
        triggerLabel.textContent = 'More';
        triggerCount.hidden = false;
        triggerItem.hidden = false;
        items.forEach((item) => {
            item.hidden = false;
        });

        const widths = items.map((item) => item.getBoundingClientRect().width);
        const overflowWidth = triggerItem.getBoundingClientRect().width;
        const result = fitAppBarItems(widths, region.clientWidth, {
            activeIndex,
            overflowWidth,
            safety: 8
        });
        const visible = new Set(result.visibleIndices);

        items.forEach((item, index) => {
            item.hidden = !visible.has(index);
        });
        overflowItems.forEach((item) => {
            const index = Number(item.dataset.sectionOverflowItem);
            item.hidden = visible.has(index);
        });

        triggerItem.hidden = result.hiddenIndices.length === 0;
        triggerCount.textContent = String(result.hiddenIndices.length);
        triggerCount.hidden = result.compact;
        bar.classList.toggle('section-compact', result.compact);
        if (result.compact) {
            triggerLabel.textContent = activeLabel || 'Sections';
            trigger.setAttribute(
                'aria-label',
                activeLabel ? `Sections, current section: ${activeLabel}` : 'Sections'
            );
        } else {
            triggerLabel.textContent = 'More';
            trigger.setAttribute('aria-label', `More sections, ${result.hiddenIndices.length} hidden`);
        }
    }

    function scheduleFit() {
        if (frame) {
            window.cancelAnimationFrame(frame);
        }
        frame = window.requestAnimationFrame(fit);
    }

    const observer = typeof ResizeObserver === 'function'
        ? new ResizeObserver(scheduleFit)
        : null;
    observer?.observe(bar);
    window.addEventListener('resize', scheduleFit);
    document.fonts?.ready?.then(scheduleFit);
    scheduleFit();
    return scheduleFit;
}

function activateAppBarOverflow() {
    const bar = document.querySelector('[data-appbar]');
    if (!bar) {
        return;
    }
    const scheduleFit = configureSectionOverflow(bar);
    configureUtilityOverflow(bar, scheduleFit);

    document.addEventListener('click', (event) => {
        for (const disclosure of disclosures) {
            if (!disclosure.panel.hidden
                && !disclosure.panel.contains(event.target)
                && !disclosure.button.contains(event.target)) {
                closeDisclosure(disclosure);
            }
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
            return;
        }
        for (const disclosure of disclosures) {
            if (!disclosure.panel.hidden) {
                closeDisclosure(disclosure, {restoreFocus: true});
                break;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', activateAppBarOverflow, false);
