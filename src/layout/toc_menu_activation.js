function escape_href(href){
    //the # bothers CSS.escape in case of id starting with a number
    return `#${CSS.escape(href.replace('#',''))}`
}

function getMaxLevel(nav){
    const fromAttr = parseInt(nav.getAttribute('data-max-level') || '1',10);
    return Number.isFinite(fromAttr) && fromAttr>0?fromAttr:1;
}

function isToc(nav){
    return nav.classList.contains('toc_menu');
}

//---------------   Expand / collapse helpers   ---------------
function expandChain(nav, el, includeSelf){
    // expand the ancestor chain so `el` is visible; optionally expand el's own children
    if(includeSelf){
        const entry = el.closest?.('.entry_container');
        if(entry){
            entry.classList.add('expanded');
            const li = entry.closest('li');
            li?.querySelector(':scope > ul')?.classList.remove('hidden');
        }
    }
    let node = el;
    while(node && node !== nav){
        if(node.tagName === 'UL'){ node.classList.remove('hidden'); }
        if(node.classList?.contains('entry_container')){ node.classList.add('expanded'); }
        node = node.parentElement;
    }
}

function ensureActiveVisible(nav){
    const active = nav.querySelector('.entry_container.active');
    if(!active){return;}
    expandChain(nav, active, false);
}

function collapseAll(nav){
    nav.querySelectorAll('ul[data-level]').forEach((ul)=>{
        const level = parseInt(ul.getAttribute('data-level')||'1',10);
        if(level > 1){ ul.classList.add('hidden'); }
        ul.previousElementSibling?.classList.remove('expanded');
    });
}

function applyDepth(nav,depth){
    const max = getMaxLevel(nav);
    const target = Math.min(Math.max(1,depth),max);
    const uls = nav.querySelectorAll('ul[data-level]');
    uls.forEach((ul)=>{
        const level = parseInt(ul.getAttribute('data-level')||'1',10);
        const parentDiv = ul.previousElementSibling;
        if(level <= target){
            ul.classList.remove('hidden');
            parentDiv?.classList.add('expanded');
        }else{
            ul.classList.add('hidden');
            parentDiv?.classList.remove('expanded');
        }
    });
    ensureActiveVisible(nav);
}

function estimateDefaultDepth(nav){
    const max = getMaxLevel(nav);
    if(max <= 2){
        return max;
    }
    const lis = nav.querySelectorAll('li');
    const sampleHeight = lis[0]?.getBoundingClientRect().height || 28;
    const controlsHeight = nav.querySelector('.depth-controls')?.getBoundingClientRect().height || 0;
    const available = Math.max(nav.clientHeight - controlsHeight, sampleHeight*2);
    const counts = new Map();
    for(let lvl=1; lvl<=max; lvl++){
        counts.set(lvl,0);
    }
    lis.forEach((li)=>{
        let lvl = 1;
        const ul = li.closest('ul[data-level]');
        if(ul){
            lvl = parseInt(ul.getAttribute('data-level')||'1',10);
        }
        for(let l= lvl; l<=max; l++){
            counts.set(l, (counts.get(l)||0)+1);
        }
    });
    let chosen = Math.min(3,max);
    for(let lvl=1; lvl<=max; lvl++){
        const rows = counts.get(lvl)||0;
        if(rows*sampleHeight <= available){
            chosen = lvl;
        }else{
            break;
        }
    }
    return chosen;
}

//---------------   Per-nav mode state   ---------------
const navState = new WeakMap();
function getState(nav){
    let s = navState.get(nav);
    if(!s){
        s = { mode:'auto', depth: Math.min(getMaxLevel(nav), 3) };
        navState.set(nav, s);
    }
    return s;
}

function updateButtons(nav){
    const state = getState(nav);
    const max = getMaxLevel(nav);
    nav.querySelectorAll('.depth-controls [data-action]').forEach((btn)=>{
        const action = btn.getAttribute('data-action');
        let on = false;
        if(state.mode === 'auto'){
            on = (action === 'auto');
        }else if(action === 'min'){
            on = state.depth <= 1;
        }else if(action === 'max'){
            on = state.depth >= max;
        }
        btn.classList.toggle('active', on);
    });
}

//---------------   Auto modes   ---------------
function getTocTargets(nav){
    const article = document.querySelector('article.content');
    if(!article){ return { article:null, entries:[] }; }
    const links = [...nav.querySelectorAll('a.toc_href')];
    const entries = links.map((a)=>{
        const target = article.querySelector(escape_href(a.getAttribute('href')));
        return { a, target };
    }).filter((e)=> e.target);
    return { article, entries };
}

function applyAutoSpy(nav){
    // toc menu: expand only the heading branches whose sections intersect the viewport
    const { article, entries } = getTocTargets(nav);
    if(!article || entries.length === 0){ return; }
    const artRect = article.getBoundingClientRect();
    collapseAll(nav);
    for(let i=0;i<entries.length;i++){
        const thisTop = entries[i].target.getBoundingClientRect().top;
        const nextTop = (i+1 < entries.length)
            ? entries[i+1].target.getBoundingClientRect().top
            : Infinity;
        // section [thisTop, nextTop) overlaps the article viewport
        if(thisTop < artRect.bottom && nextTop > artRect.top){
            expandChain(nav, entries[i].a, true);
        }
    }
    ensureActiveVisible(nav);
}

function applyAuto(nav){
    const state = getState(nav);
    state.mode = 'auto';
    state.depth = estimateDefaultDepth(nav);
    if(isToc(nav)){
        applyAutoSpy(nav);          // follow scroll
    }else{
        applyDepth(nav, state.depth); // fit available height
    }
    updateButtons(nav);
}

function setManual(nav, depth){
    const state = getState(nav);
    const max = getMaxLevel(nav);
    state.mode = 'manual';
    state.depth = Math.min(Math.max(1, depth), max);
    applyDepth(nav, state.depth);
    updateButtons(nav);
}

function initDepthButtons(nav){
    const controls = nav.querySelector('.depth-controls');
    if(!controls){ return; }
    controls.addEventListener('click', (e)=>{
        const btn = e.target.closest('[data-action]');
        if(!btn || !controls.contains(btn)){ return; }
        e.preventDefault();
        const state = getState(nav);
        const max = getMaxLevel(nav);
        const base = state.mode === 'auto' ? estimateDefaultDepth(nav) : state.depth;
        switch(btn.getAttribute('data-action')){
            case 'min':  setManual(nav, 1); break;
            case 'down': setManual(nav, base - 1); break;
            case 'auto': applyAuto(nav); break;
            case 'up':   setManual(nav, base + 1); break;
            case 'max':  setManual(nav, max); break;
        }
    });
}

//---------------   Scroll spy + cross highlight (toc only)   ---------------
function initScrollSpy(nav){
    const { article, entries } = getTocTargets(nav);
    if(!article || entries.length === 0){ return; }

    function currentEntry(){
        const artRect = article.getBoundingClientRect();
        const threshold = artRect.top + 4;
        let current = entries[0];
        for(const e of entries){
            if(e.target.getBoundingClientRect().top <= threshold){
                current = e;
            }else{
                break;
            }
        }
        return current;
    }
    function updateHighlight(){
        const cur = currentEntry();
        if(!cur){ return; }
        document.querySelector('.toc_href.active')?.classList.remove('active');
        document.querySelector('.heading.active')?.classList.remove('active');
        cur.a.classList.add('active');
        cur.target.classList.add('active');
    }

    let ticking = false;
    article.addEventListener('scroll', ()=>{
        if(ticking){ return; }
        ticking = true;
        requestAnimationFrame(()=>{
            updateHighlight();
            if(getState(nav).mode === 'auto'){ applyAutoSpy(nav); }
            ticking = false;
        });
    });

    // bidirectional hover: menu link <-> in-page heading
    entries.forEach(({a, target})=>{
        a.addEventListener('mouseenter', ()=> target.classList.add('hover'));
        a.addEventListener('mouseleave', ()=> target.classList.remove('hover'));
        target.addEventListener('mouseenter', ()=> a.classList.add('hover'));
        target.addEventListener('mouseleave', ()=> a.classList.remove('hover'));
    });

    updateHighlight();
}

function toc_menu_activation(){
    const menus = document.querySelectorAll("nav.toc_menu, nav.pages_menu");
    menus.forEach((toc_menu)=>{
        //---------------   Click Expand (manual carets)   ---------------
        const toggler = toc_menu.getElementsByClassName("expand");
        for (let i = 0; i < toggler.length; i++) {
            toggler[i].addEventListener("click", function(e) {
                this.parentElement.parentElement.querySelector("ul")?.classList.toggle("hidden");
                this.parentElement.classList.toggle("expanded");
                e.preventDefault();
            });
        }
        initDepthButtons(toc_menu);
        if(isToc(toc_menu)){
            initScrollSpy(toc_menu);
        }
        //---------------   Default state: auto   ---------------
        applyAuto(toc_menu);
    });

    // re-fit auto menus on viewport resize
    let resizeTick = false;
    window.addEventListener('resize', ()=>{
        if(resizeTick){ return; }
        resizeTick = true;
        requestAnimationFrame(()=>{
            document.querySelectorAll("nav.toc_menu, nav.pages_menu").forEach((nav)=>{
                if(getState(nav).mode === 'auto'){ applyAuto(nav); }
            });
            resizeTick = false;
        });
    });
}

document.addEventListener('DOMContentLoaded', toc_menu_activation, false);
