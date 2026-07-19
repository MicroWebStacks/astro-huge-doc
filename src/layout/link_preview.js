// Page-render-preview (plans/2026-07/19/page-render-preview): hover an
// internal article link -> spinner -> ~1s-deferred popup -> click promotes
// to an almost-full-screen modal. See plan.md for the full decision
// register (AD-001..008, OP-001..008); this file implements phases 3-5.
//
// No-recursion guarantee (AD-005): this script runs on every page
// (Layout.astro includes it unconditionally), but a previewed document sets
// data-preview-mode="true" on <html> (Layout.astro's early head script,
// read from the "#__preview" iframe src). init() checks that flag first and
// returns before arming any hover listeners inside a previewed frame.

const PREVIEW_FLAG = '__preview';
const PARAM = 'preview';
const INTENT_DELAY_MS = 150;      // AD-003: ignore drive-by pointer passes
const HOVER_DEFERRAL_MS = 1000;   // AD-003: "about one second deferred"
const DISMISS_GRACE_MS = 200;     // AD-003: time for the pointer to travel into the popup
const WARM_CACHE_MAX = 3;         // OP-007

// OP-002/OP-008 configurable best-effort: try to open a cross-page fragment
// link's preview scrolled to the target section. Flip to false if this ever
// proves unreliable in the field — the fallback (land at page top) is always
// safe and is exactly what happens when this is off.
const ENABLE_SECTION_SCROLL_PREVIEW = true;

function isPreviewModeDoc() {
	return document.documentElement.dataset.previewMode === 'true';
}

// --- Section-scroll for the previewed document itself (OP-002/OP-008) -----
// Runs unconditionally (even inside a previewed frame, where the rest of
// this file stays inert) because it acts on *this* document, not on hover.
function attemptSectionScroll() {
	if (!ENABLE_SECTION_SCROLL_PREVIEW) {
		return;
	}
	const section = document.documentElement.dataset.previewSection;
	if (!section) {
		return;
	}
	try {
		document.getElementById(section)?.scrollIntoView({block: 'start'});
	} catch (error) {
		// Best-effort only (OP-008 ruling): never fight it, just land at the top.
	}
}

// --- Eligibility (AD-006) --------------------------------------------------
function isEligibleAnchor(anchor) {
	if (!(anchor instanceof HTMLAnchorElement)) {
		return false;
	}
	if (!anchor.closest('.article-slot')) {
		return false;
	}
	if (anchor.classList.contains('external')) {
		return false;
	}
	const raw = anchor.getAttribute('href');
	if (!raw || raw.startsWith('#')) {
		return false; // pure in-page fragment
	}
	let url;
	try {
		url = new URL(anchor.href, location.href);
	} catch (error) {
		return false;
	}
	if (url.origin !== location.origin) {
		return false;
	}
	if (url.pathname.includes('/blobs/')) {
		return false; // asset link (getAssetUrl output), not a page
	}
	return true;
}

// --- Preview URL construction (AD-002, OP-002/OP-008) ----------------------
function buildPreviewSrcFromUrl(target) {
	const realFragment = target.hash ? target.hash.slice(1) : '';
	const clean = new URL(target.toString());
	clean.hash = '';
	let previewHash = PREVIEW_FLAG;
	if (ENABLE_SECTION_SCROLL_PREVIEW && realFragment) {
		previewHash += `&${encodeURIComponent(realFragment)}`;
	}
	return `${clean.toString()}#${previewHash}`;
}

function canonicalTargetFromAnchor(anchor) {
	return new URL(anchor.href, location.href).toString();
}

function buildPreviewSrcFromAnchor(anchor) {
	return buildPreviewSrcFromUrl(new URL(anchor.href, location.href));
}

// --- DOM handles -------------------------------------------------------
const els = {};

function cacheElements() {
	els.popup = document.getElementById('link-preview-popup');
	els.popupFrame = els.popup?.querySelector('.link-preview-popup-frame');
	els.popupCatcher = els.popup?.querySelector('.link-preview-popup-catcher');
	els.popupOpenPage = els.popup?.querySelector('.link-preview-popup-open-page');
	els.popupOpenPreview = els.popup?.querySelector('.link-preview-popup-open-preview');
	els.modal = document.getElementById('link-preview-modal');
	els.modalTitle = els.modal?.querySelector('.link-preview-title');
	els.modalOpen = els.modal?.querySelector('.link-preview-open');
	els.modalClose = els.modal?.querySelector('.link-preview-close');
	els.modalSlot = document.getElementById('link-preview-modal-slot');
	els.shelf = document.getElementById('link-preview-cache-shelf');
	return Boolean(els.popup && els.modal && els.modalSlot && els.shelf);
}

// --- Warm cache (AD-007/OP-007) --------------------------------------------
// Iframes must stay attached to the document (parked on the shelf) to keep
// their browsing context alive across a dismiss/re-hover gap; a fully
// detached iframe is not reliably preserved by the browser.
const warmCache = new Map(); // previewSrc -> {iframe}

function warmCacheGet(key) {
	const entry = warmCache.get(key);
	if (entry) {
		warmCache.delete(key);
		warmCache.set(key, entry); // bump to most-recently-used
	}
	return entry;
}

function warmCachePut(key, entry) {
	warmCache.delete(key);
	warmCache.set(key, entry);
	while (warmCache.size > WARM_CACHE_MAX) {
		const oldestKey = warmCache.keys().next().value;
		const oldest = warmCache.get(oldestKey);
		warmCache.delete(oldestKey);
		oldest.iframe.remove();
	}
}

// --- Iframe lifecycle --------------------------------------------------
// Keyed by Document, not by the iframe element: a freshly-inserted iframe
// can fire 'load' for its implicit about:blank document before the real
// navigation lands, so onIframeLoad may run more than once. A flag stored on
// the iframe element would latch "attached" on that throwaway document and
// then skip the real one; a Document-keyed WeakSet re-attaches per document.
const clickThroughDocs = new WeakSet();

function attachClickThrough(iframe) {
	let doc;
	try {
		doc = iframe.contentDocument;
	} catch (error) {
		return; // not same-origin (should not happen for internal previews)
	}
	if (!doc || clickThroughDocs.has(doc)) {
		return;
	}
	clickThroughDocs.add(doc);
	// AD-005/OP-004: the preview is end-game, never a live site to keep
	// working inside. Any link click inside it performs a real top-of-this-
	// window navigation instead of navigating the iframe.
	doc.addEventListener('click', (event) => {
		const anchor = event.target.closest?.('a');
		if (!anchor) {
			return;
		}
		const href = anchor.getAttribute('href');
		if (!href) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		let target;
		try {
			target = new URL(href, iframe.src).toString();
		} catch (error) {
			return;
		}
		window.location.href = target;
	}, true);
}

function onIframeLoad(iframe) {
	attachClickThrough(iframe);
	if (!session || session.iframe !== iframe) {
		return;
	}
	session.loaded = true;
	if (session.mode === 'modal') {
		els.modal.classList.remove('loading');
		updateModalChrome();
	} else {
		maybeRevealPopup();
	}
}

function createIframe(previewSrc) {
	const iframe = document.createElement('iframe');
	iframe.className = 'link-preview-iframe';
	iframe.tabIndex = -1;
	iframe.dataset.mwsPreview = 'true';
	iframe.addEventListener('load', () => onIframeLoad(iframe));
	iframe.src = previewSrc;
	return iframe;
}

// --- Session state -------------------------------------------------------
// Exactly one live preview at a time (AD-007). `session` tracks whichever
// anchor/URL is currently pending, shown as a popup, or promoted to modal.
let session = null;
let dismissTimerId = null;

function cancelPendingDismiss() {
	if (dismissTimerId) {
		clearTimeout(dismissTimerId);
		dismissTimerId = null;
	}
}

function clearSessionTimers() {
	if (session?.intentTimer) {
		clearTimeout(session.intentTimer);
	}
	if (session?.deferralTimer) {
		clearTimeout(session.deferralTimer);
	}
	cancelPendingDismiss();
}

function hidePopupUI() {
	els.popup.hidden = true;
	els.popup.classList.remove('visible');
}

function hideModalUI() {
	els.modal.hidden = true;
	els.modal.classList.remove('visible', 'loading');
}

function endSession() {
	if (!session) {
		return;
	}
	const {iframe, cacheKey, loaded, anchor, mode} = session;
	anchor?.classList.remove('link-preview-loading');
	clearSessionTimers();
	if (mode === 'popup') {
		hidePopupUI();
	}
	if (mode === 'modal') {
		hideModalUI();
	}
	if (iframe) {
		els.shelf.appendChild(iframe); // move first: keeps the browsing context alive
		if (loaded) {
			warmCachePut(cacheKey, {iframe});
		} else {
			iframe.remove();
		}
	}
	session = null;
}

function positionPopup(anchor) {
	const rect = anchor.getBoundingClientRect();
	const popup = els.popup;
	const width = popup.offsetWidth || 448;
	const height = popup.offsetHeight || 288;
	let left = rect.left;
	let top = rect.bottom + 8;
	const maxLeft = window.innerWidth - width - 8;
	left = Math.max(8, Math.min(left, maxLeft));
	if (top + height > window.innerHeight - 8) {
		const above = rect.top - height - 8;
		top = above > 8 ? above : Math.max(8, window.innerHeight - height - 8);
	}
	popup.style.left = `${left}px`;
	popup.style.top = `${top}px`;
}

function showPopupNear(anchor) {
	if (!session) {
		return;
	}
	session.mode = 'popup';
	els.popupFrame.appendChild(session.iframe);
	els.popup.hidden = false;
	positionPopup(anchor);
	els.popup.classList.add('visible');
}

function maybeRevealPopup() {
	if (!session || session.mode === 'popup' || session.mode === 'modal') {
		return;
	}
	if (!session.deferralElapsed || !session.loaded) {
		return;
	}
	session.anchor?.classList.remove('link-preview-loading');
	showPopupNear(session.anchor);
}

function beginHover(anchor) {
	if (session?.mode === 'modal') {
		return; // modal is an explicit, stable end state; hover cannot replace it
	}
	if (session && session.anchor === anchor) {
		cancelPendingDismiss();
		return;
	}
	if (session) {
		endSession();
	}

	const previewSrc = buildPreviewSrcFromAnchor(anchor);
	const warm = warmCacheGet(previewSrc);

	const mySession = {
		anchor,
		canonicalTarget: canonicalTargetFromAnchor(anchor),
		previewSrc,
		cacheKey: previewSrc,
		iframe: warm ? warm.iframe : null,
		loaded: Boolean(warm),
		deferralElapsed: false,
		mode: 'pending',
		intentTimer: null,
		deferralTimer: null
	};
	session = mySession;

	mySession.intentTimer = setTimeout(() => {
		if (session !== mySession) {
			return;
		}
		// Always acknowledge sustained hover, including warm-cache hits. Warm
		// previews still skip iframe work, but the spinner tells the user that
		// the delayed mini preview is armed.
		anchor.classList.add('link-preview-loading');
		if (!warm) {
			mySession.iframe = createIframe(previewSrc);
			els.shelf.appendChild(mySession.iframe);
			mySession.mode = 'loading';
		}
	}, INTENT_DELAY_MS);

	// Warm previews skip loading work, but never the intent delay. Immediate
	// cache hits are visually noisy when the pointer merely crosses a link.
	mySession.deferralTimer = setTimeout(() => {
		if (session !== mySession) {
			return;
		}
		mySession.deferralElapsed = true;
		maybeRevealPopup();
	}, HOVER_DEFERRAL_MS);
}

function scheduleDismiss() {
	// Pointer-leave dismissal belongs only to the transient hover flow. Once
	// promoted, the modal is stable until an explicit close action.
	if (!session || session.mode === 'modal') {
		return;
	}
	cancelPendingDismiss();
	dismissTimerId = setTimeout(() => {
		dismissTimerId = null;
		if (!session || session.mode === 'modal') {
			return;
		}
		endSession();
	}, DISMISS_GRACE_MS);
}

// --- Modal promotion (AD-004, AD-008) --------------------------------------
function updateModalChrome() {
	if (!session) {
		return;
	}
	let title = session.anchor?.textContent?.trim();
	try {
		const docTitle = session.iframe?.contentDocument?.title;
		if (docTitle) {
			title = docTitle;
		}
	} catch (error) {
		// cross-document access failure - keep the anchor-text fallback
	}
	if (els.modalTitle) {
		els.modalTitle.textContent = title || session.canonicalTarget;
	}
}

function pushPreviewParam(url) {
	const next = new URL(location.href);
	next.searchParams.set(PARAM, url);
	history.pushState({mwsPreview: url}, '', next.toString());
}

function clearPreviewParam() {
	const next = new URL(location.href);
	if (!next.searchParams.has(PARAM)) {
		return;
	}
	next.searchParams.delete(PARAM);
	history.pushState({}, '', next.toString());
}

function readPreviewParam() {
	return new URL(location.href).searchParams.get(PARAM);
}

function promote() {
	if (!session || session.mode !== 'popup' || !session.iframe) {
		return;
	}
	cancelPendingDismiss();
	session.mode = 'modal';
	hidePopupUI();
	els.modalSlot.appendChild(session.iframe);
	els.modal.classList.remove('loading');
	updateModalChrome();
	els.modal.hidden = false;
	els.modal.classList.add('visible');
	pushPreviewParam(session.canonicalTarget);
}

function closeModal() {
	if (!session || session.mode !== 'modal') {
		hideModalUI();
		return;
	}
	clearPreviewParam();
	endSession();
}

function openModalDirect(rawUrl) {
	let target;
	try {
		target = new URL(rawUrl, location.href);
	} catch (error) {
		return;
	}
	if (target.origin !== location.origin) {
		return;
	}
	if (session) {
		endSession();
	}

	const previewSrc = buildPreviewSrcFromUrl(target);
	const warm = warmCacheGet(previewSrc);

	session = {
		anchor: null,
		canonicalTarget: target.toString(),
		previewSrc,
		cacheKey: previewSrc,
		iframe: warm ? warm.iframe : createIframe(previewSrc),
		loaded: Boolean(warm),
		mode: 'modal',
		deferralElapsed: true,
		intentTimer: null,
		deferralTimer: null
	};

	if (!warm) {
		els.shelf.appendChild(session.iframe);
		els.modal.classList.add('loading');
	} else {
		els.modal.classList.remove('loading');
	}
	els.modalSlot.appendChild(session.iframe);
	els.modal.hidden = false;
	els.modal.classList.add('visible');
	updateModalChrome();
}

// --- Event wiring ----------------------------------------------------------
function withinPreviewUI(el) {
	return Boolean(el?.closest?.('.link-preview-popup') || el?.closest?.('#link-preview-modal'));
}

function wireHoverDelegation() {
	document.addEventListener('pointerover', (event) => {
		if (event.pointerType === 'touch') {
			return; // OP-006: touch is out of scope for this iteration
		}
		const anchor = event.target.closest?.('a');
		if (anchor && isEligibleAnchor(anchor)) {
			cancelPendingDismiss();
			beginHover(anchor);
			return;
		}
		if (withinPreviewUI(event.target)) {
			cancelPendingDismiss();
		}
	});

	document.addEventListener('pointerout', (event) => {
		if (event.pointerType === 'touch') {
			return;
		}
		const leavingAnchor = event.target.closest?.('a');
		const entering = event.relatedTarget;
		const staysInside = entering && (entering.closest?.('a') === leavingAnchor || withinPreviewUI(entering));
		if (staysInside) {
			return;
		}
		if ((leavingAnchor && session?.anchor === leavingAnchor) || withinPreviewUI(event.target)) {
			scheduleDismiss();
		}
	});

	// OP-006: focusin/focusout parity for keyboard users.
	document.addEventListener('focusin', (event) => {
		const anchor = event.target.closest?.('a');
		if (anchor && isEligibleAnchor(anchor)) {
			cancelPendingDismiss();
			beginHover(anchor);
		}
	});
	document.addEventListener('focusout', (event) => {
		const anchor = event.target.closest?.('a');
		if (anchor && session?.anchor === anchor) {
			scheduleDismiss();
		}
	});

	document.addEventListener('pointerdown', (event) => {
		if (!session || session.mode !== 'popup') {
			return;
		}
		if (withinPreviewUI(event.target)) {
			return;
		}
		if (session.anchor === event.target || session.anchor?.contains?.(event.target)) {
			return;
		}
		endSession();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			if (session?.mode === 'modal') {
				closeModal();
			} else if (session?.mode === 'popup') {
				endSession();
			}
			return;
		}
		if (event.key === 'Enter' && session?.mode === 'popup' && document.activeElement === session.anchor) {
			event.preventDefault();
			promote();
		}
	});
}

function wireActivate(el, handler) {
	if (!el) {
		return;
	}
	el.addEventListener('click', handler);
	el.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handler();
		}
	});
}

function wireModalChrome() {
	els.popupCatcher?.addEventListener('click', () => {
		if (session?.mode === 'popup') {
			promote();
		}
	});
	wireActivate(els.popupOpenPage, () => {
		if (session?.mode === 'popup') {
			window.location.href = session.canonicalTarget;
		}
	});
	wireActivate(els.popupOpenPreview, () => {
		if (session?.mode === 'popup') {
			promote();
		}
	});
	wireActivate(els.modalOpen, () => {
		if (session) {
			window.location.href = session.canonicalTarget;
		}
	});
	wireActivate(els.modalClose, closeModal);
	els.modal.addEventListener('click', (event) => {
		if (event.target === els.modal) {
			closeModal(); // click-outside on the overlay backdrop
		}
	});

	window.addEventListener('popstate', () => {
		const url = readPreviewParam();
		if (url) {
			if (!session || session.canonicalTarget !== url || session.mode !== 'modal') {
				openModalDirect(url);
			}
		} else if (session?.mode === 'modal') {
			hideModalUI();
			endSession();
		}
	});
}

function init() {
	attemptSectionScroll();
	if (isPreviewModeDoc()) {
		return; // AD-005: never arm the hover engine inside a previewed frame
	}
	if (!cacheElements()) {
		return;
	}
	wireModalChrome();
	wireHoverDelegation();
	const param = readPreviewParam();
	if (param) {
		openModalDirect(param);
	}
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init, false);
} else {
	init();
}
