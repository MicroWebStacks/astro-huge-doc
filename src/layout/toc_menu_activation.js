function escape_href(href){
    //the # bothers CSS.escape in case of id starting with a number
    return `#${CSS.escape(href.replace('#',''))}`
}

function getMaxLevel(nav){
    const fromAttr = parseInt(nav.getAttribute('data-max-level') || '1',10);
    return Number.isFinite(fromAttr) && fromAttr>0?fromAttr:1;
}

function ensureActiveVisible(nav){
    const active = nav.querySelector('.entry_container.active');
    if(!active){return;}
    let node = active;
    while(node && node !== nav){
        if(node.tagName === 'UL'){
            node.classList.remove('hidden');
        }
        if(node.classList?.contains('entry_container')){
            node.classList.add('expanded');
        }
        node = node.parentElement;
    }
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

function initDepthControls(nav){
    const slider = nav.querySelector('[data-role="depth-slider"]');
    if(!slider){return;}
    const max = getMaxLevel(nav);
    const preset = parseInt(nav.getAttribute('data-default-level')||slider.value||'1',10);
    const defaultDepth = estimateDefaultDepth(nav) || preset || 1;
    slider.max = `${max}`;
    slider.value = `${Math.min(Math.max(1, defaultDepth), max)}`;
    applyDepth(nav, parseInt(slider.value,10));

    slider.addEventListener('input',(e)=>{
        const val = parseInt(e.target.value,10);
        applyDepth(nav, val);
    });
}

function toc_menu_activation(){
    const menus = document.querySelectorAll("nav.toc_menu, nav.pages_menu");
    menus.forEach((toc_menu)=>{
    //---------------   Click Expand   ---------------
    let toggler = toc_menu.getElementsByClassName("expand");
    for (let i = 0; i < toggler.length; i++) {
        toggler[i].addEventListener("click", function(e) {
        this.parentElement.parentElement.querySelector("ul")?.classList.toggle("hidden");
        this.parentElement.classList.toggle("expanded");
        e.preventDefault()
        });
    }
    initDepthControls(toc_menu);
    //---------------   Scroll Spy   ---------------
    if(toc_menu.classList.contains("toc_menu")){
        const article = document.querySelector( 'article.content' )
        const hrefs = document.getElementsByClassName("toc_href");
        const targets = [...hrefs].map(el => article.querySelector(escape_href(el.getAttribute('href'))))
        
        article?.addEventListener("scroll", (event) => {
            let spy = null//if no element on screen, keep last match and do nothing
            for ( let t in targets ){//find first within visible scroll
                if(targets[ t ]?.offsetTop > article.scrollTop){
                    spy = targets[ t ]
                    break
                }
            }
            if(spy){
                document.querySelector(".toc_href.active")?.classList.remove("active");
                document.querySelector(".heading.active")?.classList.remove("active");
                const id = spy.id
                //console.log(id)
                document.querySelector(`a[href="#${id}"].toc_href`)?.classList.add("active")
                document.getElementById(id)?.classList.add("active")
            }
        })
        
        const href_els = document.querySelectorAll(".toc_href");
        href_els.forEach(element => {
            element.addEventListener('mouseenter',()=>{
                const href = element.getAttribute('href')
                const id = href.slice(1,href.length)
                document.getElementById(id)?.classList.add("hover")
            })        
            element.addEventListener('mouseout',()=>{
                const href = element.getAttribute('href')
                const id = href.slice(1,href.length)
                document.getElementById(id)?.classList.remove("hover")
            })        
        });
    }
    }); //end menus loop

}

document.addEventListener('DOMContentLoaded', toc_menu_activation, false);
