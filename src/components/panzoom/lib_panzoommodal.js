import { svg_text_focus } from './lib_svg_utils';

let pzref = null
const zoomOptions = {
  minZoom: 0.1,
  maxZoom:4,
  //autocenter:true
}

function addFocusStyles(shadowRoot) {
  if (!shadowRoot.getElementById('glowStyles')) {
      const style = document.createElement('style');
      style.id = 'focusStyles';
      style.textContent = `
          .focus-effect {
              font-weight: bold;
          }
      `;
      shadowRoot.appendChild(style);
  }
}

async function appendShadowSVG(center,svg){
  //cannot detatch a shadow root, so check existing before creation
  let shadowRoot = center.shadowRoot
  if(!shadowRoot){
    shadowRoot = center.attachShadow({mode: 'open'});
  }
  const div = document.createElement("div")//needed for the panzoom as it takes the parent
  shadowRoot.appendChild(div)
  addFocusStyles(shadowRoot)
  let new_svg
  const clone_fails_with_SVGjs = true
  if(clone_fails_with_SVGjs){
    new_svg = serializeAndDeserializeSVG(svg);
  }else{
    new_svg = svg.cloneNode(true)
  }
  div.appendChild(new_svg)
  const oldstyle = new_svg.getAttribute("style")
  new_svg.setAttribute("style",`${oldstyle};user-select: none; cursor:grab;`)
  //new_svg.querySelectorAll('tspan,text').forEach((el)=>{
  //    el.style.cursor = "pointer";
  //});
  return new_svg
}

function findContainer(center){
  return center.closest('[data-panzoom-root="true"]')
    ?? center.closest('.container.panzoom')
    ?? center.parentElement?.parentElement?.parentElement?.parentElement
}

function serializeAndDeserializeSVG(svg) {
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svg);
  const parser = new DOMParser();
  const new_svg = parser.parseFromString(svgStr, "image/svg+xml").documentElement;
  return new_svg;
}

// The diagram <object> loads its SVG asynchronously. On a heavy page the user
// can click "open full view" before contentDocument is populated; reading the
// svg too early returns null and later throws in the serializer, leaving the
// modal closed. Wait for the SVG to become available (object already loaded,
// its load event, or a short poll) before cloning.
function waitForObjectSvg(obj, timeout = 5000){
  const ready = obj.contentDocument?.querySelector("svg")
  if(ready){
    return Promise.resolve(ready)
  }
  return new Promise((resolve)=>{
    let settled = false
    const finish = (svg)=>{
      if(settled) return
      settled = true
      obj.removeEventListener("load", onLoad)
      clearInterval(poll)
      clearTimeout(timer)
      resolve(svg)
    }
    const onLoad = ()=> finish(obj.contentDocument?.querySelector("svg") ?? null)
    obj.addEventListener("load", onLoad)
    // Safety net: the load event may have already fired before this ran.
    const poll = setInterval(()=>{
      const svg = obj.contentDocument?.querySelector("svg")
      if(svg) finish(svg)
    }, 100)
    const timer = setTimeout(()=> finish(obj.contentDocument?.querySelector("svg") ?? null), timeout)
  })
}

async function cloneAsset(center){
    const container = findContainer(center)
    if(!container){
      return {is_svg: false, svg_img: null}
    }
    const sourceSelector = center.getAttribute("data-source-selector")
    if(sourceSelector){
      const source = container.querySelector(sourceSelector)
      const tagName = source?.tagName?.toLowerCase()
      if(tagName === "svg"){
        return {is_svg: true, svg_img: await appendShadowSVG(center, source)}
      }
      if(tagName === "img"){
        const svg_img = source.cloneNode(true)
        center.appendChild(svg_img)
        return {is_svg: false, svg_img}
      }
      if(tagName === "object"){
        const svg = await waitForObjectSvg(source)
        if(!svg){
          return {is_svg: true, svg_img: null}
        }
        return {is_svg: true, svg_img: await appendShadowSVG(center, svg)}
      }
    }
    const obj = container.querySelector("object")
    let is_svg = false
    let svg
    let svg_img
    if(obj){
      is_svg = true
      svg = await waitForObjectSvg(obj)
      if(!svg){
        return {is_svg, svg_img: null}
      }
      svg_img = await appendShadowSVG(center,svg)
    }else{
      const img = container.querySelector("img")
      svg_img = img.cloneNode(true)
      center.appendChild(svg_img)
    }
    return {is_svg,svg_img}
}

function window_url_add_pan(x,y){
  // Convert to integers to remove fractions and ensure the format "&pan=x33_y48"
  const intX = Math.floor(x);
  const intY = Math.floor(y);
  console.log(`Pan finished at (${intX},${intY})`);
  
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('pan', `x${intX}_y${intY}`);
  window.history.pushState({}, "", currentUrl.toString());
}

function window_url_add_zoom(zoom){
  // Round to two decimal places to ensure the format "&zoom=1.27"
  const roundedZoom = Math.round(zoom * 100) / 100;
  console.log(`Zoom done at (${roundedZoom})`);
  
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('zoom', roundedZoom.toString());
  window.history.pushState({}, "", currentUrl.toString());
}
function window_url_add_modal(center){
    const container = findContainer(center)
    if(!container){
      return
    }
    let modal_name
    const data_name = container.getAttribute("data-name")
    if(data_name != "diagram.svg"){
      modal_name = data_name
    }else{
      modal_name = container.getAttribute("data-sid")
    }
    const new_href = window.location.origin+window.location.pathname+`?modal=${modal_name}`
    window.history.pushState({},"",new_href)
}
function window_url_remove_modal(){
    const new_href = window.location.origin+window.location.pathname
    window.history.pushState({},"",new_href)
}
function is_url_modal(center){
  const params = new URL(location.href).searchParams;
  const modal_name = params.get('modal');
  if(modal_name){
    const container = findContainer(center)
    if(!container){
      return false
    }
    const pz_name = container.getAttribute("data-name")
    return (modal_name == pz_name)
  }
  return false
}

async function handle_url_modal(modal,is_svg,svg,pzref){
  const params = new URL(location.href).searchParams;
  
  // Handling text focus if applicable
  const text = params.get('text')
  if(text){
    if(is_svg){
      await svg_text_focus(modal,svg,text,pzref)
    }
  }

  // Handling pan parameter
  const pan = params.get('pan');
  if (pan) {
    const matches = pan.match(/x(-?\d+)_y(-?\d+)/i);  // Adjusted regex to include negative numbers
    console.log(matches)
    if (matches) {
      const x = parseInt(matches[1], 10);
      const y = parseInt(matches[2], 10);
      setTimeout(()=>{pzref.smoothMoveTo(x, y)}, 400)
      console.log(`Moving to x: ${x}, y: ${y}`);
    }
  }

  // Handling zoom parameter
  const zoom = params.get('zoom');
  if (zoom) {
    const scale = parseFloat(zoom);
    let delay = 400
    if(pan){
      delay = 0
    }
    const svg_cx = svg.getAttribute("width").replace(/px$/, '')/2
    const svg_cy = svg.getAttribute("height").replace(/px$/, '')/2
    setTimeout(()=>{pzref.smoothZoom(svg_cx, svg_cy, zoom)}, delay)
    console.log(`Zooming to scale: ${scale}`);
  }
}

async function openModal(event){

  const modal = event.target
  const close = modal.querySelector(".close")
  const center = modal.querySelector(".modal-center")

  const {is_svg,svg_img} = await cloneAsset(center)
  if(!svg_img){
    console.warn("panzoom: diagram asset is not ready yet, cannot open full view")
    return
  }
  if(pzref){
    pzref.dispose()
  }
  const { default: panzoom } = await import('panzoom');
  pzref = panzoom(svg_img,zoomOptions)
  pzref.on('panend', () => {
    const t = pzref.getTransform()
    window_url_add_pan(t.x,t.y)
  });
  pzref.on('zoom', function() {
    window_url_add_zoom(pzref.getTransform().scale)
  });

  close.onclick = ()=>{
    //console.log("closed click")
    modal.classList.remove("visible")
    pzref.dispose()
    const img = center.querySelector("img")
    if(img){
      img.remove()
    }else{// SVG - remove the parent div and leave the shadowRoot for reuse
      const shadowRoot = center.shadowRoot
      const svg = shadowRoot?.querySelector("svg")
      svg?.parentElement?.remove()
    }
    window_url_remove_modal()
  }
  modal.classList.add("visible")
  if(is_url_modal(center)){
    handle_url_modal(modal.querySelector(".modal-content"),is_svg,svg_img,pzref)
  }else{
    window_url_add_modal(center)
  }
}

function initModalEvents(){
    const modalsbkgs = document.querySelectorAll(`.modal-background`)
    modalsbkgs.forEach(modal=>{
      if(modal.getAttribute("data-state") == "init"){
        modal.addEventListener("open",openModal  ,false)
        modal.setAttribute("data-state","run")
      }
    })
}

export{
  initModalEvents
}
