import {event} from './client_utils.js'
import {initModalEvents} from './lib_panzoommodal.js'
import { svg_fix_size, svg_add_links, svg_highlight } from './lib_svg_utils.js';

function checkURLModal(){
  //check if any modal needs to be opened
  const params = new URL(location.href).searchParams;
  const modal = params.get('modal');
  if(modal){
    console.log(`opening modal ${modal}`)
    const container = document.querySelector(`.container.panzoom[data-name="${modal}"]`)
    if(container){
      const modal = container.querySelector(".modal-background")
      event(modal,"open")
    }
  }
}

async function processSVG(svg,container){
  //guard against double processing: init_svgs' load listener and the
  //theme-swap load listener can both fire for the same loaded document
  if(svg.getAttribute("data-mws-processed") === "true"){
    return;
  }
  svg.setAttribute("data-mws-processed", "true");
  svg_fix_size(svg);
  const meta_string = container.getAttribute("data-meta");
  if(meta_string){
    const meta = JSON.parse(meta_string);
    if(meta && typeof meta === "object" && Object.hasOwn(meta,"links")){
      await svg_add_links(svg, meta.links);
    }
    if(meta && typeof meta === "object" && Object.hasOwn(meta,"highlights")){
      await svg_highlight(svg, meta.highlights);
    }
  }
}

async function init_svgs() {
  const containers = document.querySelectorAll(".container.panzoom");
  await Promise.all(Array.from(containers).map(container => {
    return new Promise(async (resolve) => {  // Using async here
      const eltype = container.getAttribute("data-type");
      if (eltype === "svg") {
        const obj = container.querySelector("object");
        const svg = obj.contentDocument?.querySelector("svg");
        if (svg) {
          await processSVG(svg, container);  // Await the processing of the SVG
          resolve();
        } else {
          obj.addEventListener("load", async () => {  // Async event handler
            const svg = obj.contentDocument.querySelector("svg");
            if (svg) {
              await processSVG(svg, container);  // Await the processing of the SVG
            }
            resolve();
          });
        }
      } else {
        resolve();
      }
    });
  }));
}

function currentTheme(){
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

//theme-lazy containers (PlantUML): the build-time dark SVG is the initial
//paint; light-theme visitors get the lazily-rendered light variant swapped in
function applyThemeToContainer(container){
  if(container.getAttribute("data-theme-lazy") !== "true"){
    return;
  }
  const obj = container.querySelector("object");
  if(!obj){
    return;
  }
  let url;
  if(currentTheme() === "light"){
    const uid = encodeURIComponent(container.getAttribute("data-sid") ?? "");
    const v = encodeURIComponent(container.getAttribute("data-version-id") ?? "");
    url = `/diagrams/light-svg?uid=${uid}&v=${v}`;
  }else{
    url = container.getAttribute("data-dark-url");
  }
  if(url && obj.getAttribute("data") !== url){
    obj.setAttribute("data", url);
    obj.addEventListener("load", async () => {
      const svg = obj.contentDocument?.querySelector("svg");
      if(svg){
        await processSVG(svg, container);
      }
    }, {once: true});
  }
}

function applyThemeToAll(){
  document.querySelectorAll('.container.panzoom[data-theme-lazy="true"]').forEach(applyThemeToContainer);
}

async function init(){
  console.log("panzoom_common> init()")
  applyThemeToAll() //swap theme-lazy diagrams as early as possible
  initModalEvents() //needed to be before handling url to open
  await init_svgs() //needed before cloning the svg in modal
  checkURLModal()   //only first match will open, starting with SIDs
}

if(document.readyState == "loading"){
  document.addEventListener('DOMContentLoaded', init, false);
}else{
  init()
}

document.addEventListener('mws:theme-change', applyThemeToAll);
