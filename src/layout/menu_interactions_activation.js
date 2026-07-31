const MOBILE_QUERY = '(max-width: 700px)';

// Open/close is now driven by the app-bar toggle buttons (the side rails are
// gone). The button is the single authority; it reflects state via
// aria-expanded so the icon styling and the persisted preference stay in sync.
//
// A toggle drives a different nav on each side of the mobile breakpoint (rail
// vs overlay), and the viewport can cross that breakpoint at any time - a
// preview panel gets dragged wider, a window gets restored. So a button is
// never bound to one nav: it is bound to a `target` descriptor
// {nav, storageKey, onApply} resolved per interaction. See
// menu_interactions_activation() for the resolvers and the matchMedia
// rebinding.
function apply_open_state(btn, target, open){
    const nav_el = target.nav;
    if(nav_el){
        if(open){
            nav_el.classList.add("open");
            nav_el.classList.remove("closed");
            nav_el.style.width = nav_el.getAttribute("data-width");
        }else{
            nav_el.classList.add("closed");
            nav_el.classList.remove("open");
            nav_el.style.width = "0px";
        }
    }
    btn?.setAttribute("aria-expanded", open ? "true" : "false");
    target.onApply?.(open, btn, nav_el);
    nav_el?.dispatchEvent(new CustomEvent("microwebstacks:nav-visibility", {
        detail: {open}
    }));
}

// Restore the last choice for this target; default to whatever the server
// rendered. Runs at load and again whenever the breakpoint is crossed, so each
// mode picks up its own persisted state instead of inheriting the other's.
//
// A single-page tree (data-single-page, set by SideMenu.astro or, for the
// lazily loaded rail, by lazy_navigation.js) overrides the stored preference:
// its only page is the one already on screen, so the rail would open on nothing
// worth navigating to. The preference itself is left untouched, so a section
// with several pages still opens as the reader left it.
function restore_open_state(btn, target){
    if(!target.nav){ return; }
    if(target.nav.getAttribute("data-single-page") === "true"){
        apply_open_state(btn, target, false);
        return;
    }
    const saved = localStorage.getItem(toggle_storage_key(target.nav, target.storageKey));
    apply_open_state(btn, target, saved === "true" || saved === "false"
        ? saved === "true"
        : target.nav.classList.contains("open"));
}

function configure_toggle(btn, resolve_target){
    if(!btn){ return; }
    btn.addEventListener("click",(e)=>{
        const target = resolve_target();
        if(target.nav){
            const open = !target.nav.classList.contains("open");
            // Opening a single-page tree by hand is a deliberate override; drop
            // the flag so a later breakpoint crossing does not close it again,
            // and record the override so a rail still loading its items does
            // not re-apply the rule underneath the reader. The next page load
            // re-renders the attribute, restoring the rule.
            target.nav.removeAttribute("data-single-page");
            target.nav.setAttribute("data-nav-toggled", "true");
            apply_open_state(btn, target, open);
            localStorage.setItem(
                toggle_storage_key(target.nav, target.storageKey),
                open ? "true" : "false"
            );
        }
        e.preventDefault();
    });
}

function toggle_storage_key(nav_el, storageKey){
    return `${nav_el.getAttribute("data-state-key") || "microwebstacks:default"}:${storageKey}:open`;
}

// The thin handles between nav and content keep only the drag-to-resize role.
// Both sides use the same snap band: widths at or below 60px collapse, while
// the 61-159px band keeps the last usable width until the collapse threshold
// is crossed.
function configure_resize(resize_el, nav_el, left_to_right, options = {}){
    if(!resize_el || !nav_el){ return; }
    const collapseWidth = 60;
    const minimumWidth = 160;
    const maximumViewportRatio = 0.4;
    let activePointerId = null;
    let xDown = 0;
    let startWidth = 0;

    function store_open_state(open){
        options.button?.setAttribute("aria-expanded", open ? "true" : "false");
        if(options.storageKey){
            localStorage.setItem(
                toggle_storage_key(nav_el, options.storageKey),
                open ? "true" : "false"
            );
        }
    }

    function set_width(width){
        const value = `${width}px`;
        nav_el.style.width = value;
        nav_el.setAttribute("data-width", value);
    }

    function finish_pointer(event){
        if(activePointerId === null){ return; }
        if(event?.pointerId !== undefined && event.pointerId !== activePointerId){ return; }
        const pointerId = activePointerId;
        activePointerId = null;
        if(resize_el.hasPointerCapture?.(pointerId)){
            resize_el.releasePointerCapture(pointerId);
        }
        resize_el.classList.remove("is-resizing");
        document.body.classList.remove("nav-resizing");
        nav_el.style.transition = "none";
        if(nav_el.clientWidth < 20){
            nav_el.classList.add("closed");
            nav_el.classList.remove("open");
            nav_el.setAttribute("data-width","20vw");
        }else{
            nav_el.classList.add("open");
            nav_el.classList.remove("closed");
        }
        const open = nav_el.classList.contains("open");
        store_open_state(open);
        nav_el.dispatchEvent(new CustomEvent("microwebstacks:nav-visibility", {
            detail: {open}
        }));
    }

    resize_el.addEventListener("pointerdown",(event)=>{
        if(event.button !== 0 || activePointerId !== null){ return; }
        activePointerId = event.pointerId;
        xDown = event.clientX;
        startWidth = nav_el.clientWidth;
        nav_el.style.transition = "none";
        resize_el.classList.add("is-resizing");
        document.body.classList.add("nav-resizing");
        resize_el.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    resize_el.addEventListener("pointermove",(event)=>{
        if(event.pointerId !== activePointerId){ return; }
        const desiredWidth = left_to_right
            ? startWidth + event.clientX - xDown
            : startWidth - event.clientX + xDown;
        if(desiredWidth <= collapseWidth){
            set_width(0);
        }else if(desiredWidth < minimumWidth){
            // Preserve the established snap band until collapse is crossed.
        }else{
            const maximumWidth = document.documentElement.clientWidth * maximumViewportRatio;
            set_width(Math.min(desiredWidth, maximumWidth));
        }
        event.preventDefault();
    });
    resize_el.addEventListener("pointerup", finish_pointer);
    resize_el.addEventListener("pointercancel", finish_pointer);
    resize_el.addEventListener("lostpointercapture", finish_pointer);
    window.addEventListener("blur", finish_pointer);
}

function menu_interactions_activation(){
    const pages_nav = document.querySelector("#wide-nav nav.pages_menu")
    const mobile_pages_nav = document.querySelector("#mobile-nav nav.pages_menu")
    const toc_nav   = document.querySelector("#toc-nav-div nav.toc_menu")
    const leftButton = document.getElementById("nav-toggle-left")
    const rightButton = document.getElementById("nav-toggle-right")
    const backdrop = document.getElementById("mobile-nav-backdrop")
    const mobile_wrapper = document.getElementById("mobile-nav")
    const toc_wrapper = document.getElementById("toc-nav-div")
    const mobileQuery = window.matchMedia(MOBILE_QUERY)
    let lastMobileTrigger = null

    function setMobileShell(wrapper, open){
        wrapper?.classList.toggle('mobile-open', open)
        const anyOpen = Boolean(document.querySelector('#mobile-nav.mobile-open, #toc-nav-div.mobile-open'))
        backdrop?.classList.toggle('visible', anyOpen)
        document.body.classList.toggle('mobile-nav-open', anyOpen)
    }

    function clearMobileShell(){
        mobile_wrapper?.classList.remove('mobile-open')
        toc_wrapper?.classList.remove('mobile-open')
        backdrop?.classList.remove('visible')
        document.body.classList.remove('mobile-nav-open')
    }

    function closeMobileMenus({restoreFocus = false} = {}){
        if(!mobileQuery.matches){ return; }
        for(const [button, target] of [[leftButton, mobile_left], [rightButton, mobile_right]]){
            apply_open_state(button, target, false)
            if(target.nav){
                localStorage.setItem(toggle_storage_key(target.nav, target.storageKey), 'false')
            }
        }
        clearMobileShell()
        if(restoreFocus){ lastMobileTrigger?.focus() }
    }

    const mobileApply = (wrapper, otherButton, otherNav, otherWrapper) => (open, button) => {
        if(!mobileQuery.matches){ return; }
        if(open){
            lastMobileTrigger = button
            if(otherNav){
                otherNav.classList.remove('open')
                otherNav.classList.add('closed')
                otherNav.style.width = '0px'
            }
            otherButton?.setAttribute('aria-expanded', 'false')
            otherWrapper?.classList.remove('mobile-open')
        }
        setMobileShell(wrapper, open)
    }

    // The two navs a side can drive. Mobile aims the left button at the overlay
    // copy of the pages menu and wraps the toc in the drawer shell; desktop
    // aims it at the rail. The toc element is shared by both modes - only its
    // wrapper and its persisted key differ.
    const mobile_left = {
        nav: mobile_pages_nav,
        storageKey: 'mobile_left_open',
        onApply: mobileApply(mobile_wrapper, rightButton, toc_nav, toc_wrapper)
    }
    const mobile_right = {
        nav: toc_nav,
        storageKey: 'mobile_right_open',
        onApply: mobileApply(toc_wrapper, leftButton, mobile_pages_nav, mobile_wrapper)
    }
    const desktop_left = {nav: pages_nav, storageKey: 'left_open'}
    const desktop_right = {nav: toc_nav, storageKey: 'right_open'}

    const left_target = ()=> mobileQuery.matches ? mobile_left : desktop_left
    const right_target = ()=> mobileQuery.matches ? mobile_right : desktop_right

    configure_toggle(leftButton, left_target)
    configure_toggle(rightButton, right_target)

    // Mobile-only affordances, bound unconditionally: the breakpoint can be
    // crossed after load, and each of these is inert on desktop anyway
    // (closeMobileMenus() returns early, and the backdrop is display:none).
    backdrop?.addEventListener('click', ()=>closeMobileMenus({restoreFocus:true}))
    for(const nav of [mobile_pages_nav, toc_nav]){
        // Delegate from the nav so links added by lazy navigation receive
        // the same close behavior as server-rendered links.
        nav?.addEventListener('click', (event)=>{
            const link = event.target.closest?.('a[href]')
            if(link && nav.contains(link)){
                closeMobileMenus()
            }
        })
    }
    document.addEventListener('keydown', (event)=>{
        if(event.key === 'Escape' && document.body.classList.contains('mobile-nav-open')){
            closeMobileMenus({restoreFocus:true})
        }
    })

    // Re-aim both toggles whenever the viewport crosses the breakpoint. Without
    // this a panel that loaded narrow stays wired to the overlay after it is
    // widened (and vice versa), leaving the button driving a display:none nav.
    function bind_to_viewport(){
        // Leaving mobile: drop the overlay shell first, or the backdrop and the
        // body scroll lock survive into a layout that cannot dismiss them.
        if(!mobileQuery.matches){ clearMobileShell() }
        restore_open_state(leftButton, left_target())
        restore_open_state(rightButton, right_target())
    }

    // The extension rail arrives after first paint, so its page count - and
    // with it the single-page rule - is only known once lazy_navigation.js has
    // populated it. Re-run the restore then, against the freshly set flag.
    for(const nav of [pages_nav, mobile_pages_nav]){
        nav?.addEventListener('microwebstacks:navigation-ready', ()=>{
            restore_open_state(leftButton, left_target())
        })
    }

    if(typeof mobileQuery.addEventListener === 'function'){
        mobileQuery.addEventListener('change', bind_to_viewport)
    }else{
        mobileQuery.addListener?.(bind_to_viewport)
    }
    bind_to_viewport()

    configure_resize(document.getElementById("resize-left"), pages_nav, true, {
        button: leftButton,
        storageKey: "left_open"
    })
    configure_resize(document.getElementById("resize-right"), toc_nav, false, {
        button: rightButton,
        storageKey: "right_open"
    })
}

document.addEventListener('DOMContentLoaded', menu_interactions_activation, false);
