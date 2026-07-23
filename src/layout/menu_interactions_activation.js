// Open/close is now driven by the app-bar toggle buttons (the side rails are
// gone). The button is the single authority; it reflects state via
// aria-expanded so the icon styling and the persisted preference stay in sync.
function configure_toggle(btn, nav_el, storageKey, options = {}){
    if(!btn || !nav_el){ return; }
    const scopedStorageKey = toggle_storage_key(nav_el, storageKey);

    function notify_visibility(open){
        nav_el.dispatchEvent(new CustomEvent("microwebstacks:nav-visibility", {
            detail: {open}
        }));
    }

    function apply(open){
        if(open){
            nav_el.classList.add("open");
            nav_el.classList.remove("closed");
            nav_el.style.width = nav_el.getAttribute("data-width");
        }else{
            nav_el.classList.add("closed");
            nav_el.classList.remove("open");
            nav_el.style.width = "0px";
        }
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        options.onApply?.(open, btn, nav_el);
        notify_visibility(open);
    }

    // Restore the last choice; default to whatever the server rendered.
    const saved = localStorage.getItem(scopedStorageKey);
    if(saved === "true" || saved === "false"){
        apply(saved === "true");
    }else{
        apply(nav_el.classList.contains("open"));
    }

    btn.addEventListener("click",(e)=>{
        const open = !nav_el.classList.contains("open");
        apply(open);
        localStorage.setItem(scopedStorageKey, open ? "true" : "false");
        e.preventDefault();
    });
}

function toggle_storage_key(nav_el, storageKey){
    return `${nav_el.getAttribute("data-state-key") || "microwebstacks:default"}:${storageKey}:open`;
}

// The thin handles between nav and content keep only the drag-to-resize role.
function configure_resize(resize_el,nav_el,left_to_right){
    if(!resize_el || !nav_el){ return; }
    var global_resize_state = false
    var x_down
    var start_width

    function finish_mouse(){
        global_resize_state = false
        nav_el.style.transition = "none"
        if(nav_el.clientWidth < 20){
            nav_el.classList.add("closed")
            nav_el.classList.remove("open")
            nav_el.setAttribute("data-width","20vw")
        }else{
            nav_el.classList.add("open")
            nav_el.classList.remove("closed")
        }
        nav_el.dispatchEvent(new CustomEvent("microwebstacks:nav-visibility", {
            detail: {open: nav_el.classList.contains("open")}
        }));
    }

    resize_el.addEventListener("mousedown",(e)=>{
        global_resize_state = true
        x_down = e.x
        start_width = nav_el.clientWidth
        nav_el.style.transition = "none"
    })
    resize_el.addEventListener("mouseup",(e)=>{
        finish_mouse()
    })
    document.addEventListener("mouseup",(e)=>{
        if(global_resize_state == true){
            finish_mouse()
        }
    })
    document.addEventListener("mousemove",(e)=>{
        if(global_resize_state == true){
            const new_width = left_to_right?(start_width + e.x - x_down):(start_width - e.x + x_down)
            if(new_width <= 60){//snap effect
                nav_el.style.width = "0px"
                nav_el.setAttribute("data-width","0px")
            }else if(new_width < 160){
                //do nothing here
            }else if(new_width < (document.documentElement.clientWidth)*0.4){
                nav_el.style.width = new_width+"px"
                nav_el.setAttribute("data-width",new_width+"px")
            }
            e.preventDefault()
        }
    })
}

function menu_interactions_activation(){
    const pages_nav = document.querySelector("#wide-nav nav.pages_menu")
    const mobile_pages_nav = document.querySelector("#mobile-nav nav.pages_menu")
    const toc_nav   = document.querySelector("#toc-nav-div nav.toc_menu")
    const leftButton = document.getElementById("nav-toggle-left")
    const rightButton = document.getElementById("nav-toggle-right")
    const backdrop = document.getElementById("mobile-nav-backdrop")
    const mobileQuery = window.matchMedia('(max-width: 700px)')
    let lastMobileTrigger = null

    function setMobileShell(wrapper, open){
        wrapper?.classList.toggle('mobile-open', open)
        const anyOpen = Boolean(document.querySelector('#mobile-nav.mobile-open, #toc-nav-div.mobile-open'))
        backdrop?.classList.toggle('visible', anyOpen)
        document.body.classList.toggle('mobile-nav-open', anyOpen)
    }

    function closeMobileMenus({restoreFocus = false} = {}){
        if(!mobileQuery.matches){ return; }
        for(const [button, nav, wrapper, storageKey] of [
            [leftButton, mobile_pages_nav, document.getElementById('mobile-nav'), 'mobile_left_open'],
            [rightButton, toc_nav, document.getElementById('toc-nav-div'), 'mobile_right_open']
        ]){
            if(nav){
                nav.classList.remove('open')
                nav.classList.add('closed')
                nav.style.width = '0px'
                localStorage.setItem(toggle_storage_key(nav, storageKey), 'false')
                nav.dispatchEvent(new CustomEvent('microwebstacks:nav-visibility', {detail:{open:false}}))
            }
            button?.setAttribute('aria-expanded', 'false')
            wrapper?.classList.remove('mobile-open')
        }
        backdrop?.classList.remove('visible')
        document.body.classList.remove('mobile-nav-open')
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

    if(mobileQuery.matches){
        configure_toggle(leftButton, mobile_pages_nav, 'mobile_left_open', {
            onApply: mobileApply(document.getElementById('mobile-nav'), rightButton, toc_nav, document.getElementById('toc-nav-div'))
        })
        configure_toggle(rightButton, toc_nav, 'mobile_right_open', {
            onApply: mobileApply(document.getElementById('toc-nav-div'), leftButton, mobile_pages_nav, document.getElementById('mobile-nav'))
        })
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
    }else{
        configure_toggle(leftButton, pages_nav, 'left_open')
        configure_toggle(rightButton, toc_nav, 'right_open')
    }

    configure_resize(document.getElementById("resize-left"),  pages_nav, true)
    configure_resize(document.getElementById("resize-right"), toc_nav,   false)
}

document.addEventListener('DOMContentLoaded', menu_interactions_activation, false);
