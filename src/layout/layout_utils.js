import { load_json } from '@/libs/utils.js'
import { section_from_pathname } from '@/libs/assets.js'
import { config } from '@/config.js'

function cloneHeading(heading) {
    return {
        label: heading.label ?? heading.body_text ?? '',
        slug: heading.slug,
        depth: heading.depth ?? heading.level ?? 1,
        link: heading.link ?? '',
        uid: heading.uid ?? null
    };
}

function find_parent(index, headings) {
    const element_depth = headings[index].depth ?? 1;
    if (index === 0) {
        return null;
    }
    for (let rev_i = index - 1; rev_i >= 0; rev_i--) {
        if ((headings[rev_i].depth ?? 1) < element_depth) {
            return headings[rev_i];
        }
    }
    return null;
}

/* not recursive o(n²)
*/
function headings_list_to_tree(headings, is_toc) {
    const copies = headings.map((heading) => ({
        ...cloneHeading(heading),
        order_index: heading.order_index ?? 0
    }));
    for (const element of copies) {
        element.items = [];
        element.parent = true;
        element.expanded = true;
        if (is_toc) {
            element.link = `#${element.slug ?? ''}`;
        }
    }

    const tree = [];

    for (let index = 0; index < copies.length; index++) {
        const element = copies[index];
        const parent = find_parent(index, copies);
        if (parent) {
            parent.items.push(element);
        } else {
            tree.push(element);
        }
    }

    for (const element of copies) {
        if (element.items.length === 0) {
            element.parent = false;
            delete element.items;
            delete element.expanded;
        } else {
            element.items.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        }
    }
    return tree.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

/** headings start at Sidemenu
 * 
 */
function process_toc_list(headings){
    if(!Array.isArray(headings) || headings.length === 0){
        return {items:[],visible:false}
    }
    const tree = headings_list_to_tree(headings,true)
    return {items:tree,visible:true}
}

function get_active_submenu(raw_menu,section,pathname){
    return raw_menu.map((entry)=>{
        //console.log(`/${section}/${entry.url} == '${pathname}'`)
        entry.active = (`/${section}/${entry.url}` == pathname)
        if(Object.hasOwn(entry,"items")){
            entry.items = get_active_submenu(entry.items,section,pathname)
        }
        return entry
    })
}


async function get_generated_section_menu(pathname){
    const generated_menu = await load_json(config.collect_content.out_menu)
    const section = section_from_pathname(pathname);
    let section_menu = generated_menu.sections[section]
    if(!Object.hasOwn(generated_menu.sections,section)){
        section_menu = []
    }
    return get_active_submenu(section_menu,section,pathname)
}

function get_active_appbar_menu(raw_menu,pathname){
    const current_section = section_from_pathname(pathname)
    console.log(`current_section = '${current_section}'`)
    return raw_menu.map((item)=>{
        item.active_class = (section_from_pathname(item.link) == current_section)?"active":""
        return item
    })
}

async function get_menu_hash(){
    const generated_menu = await load_json(config.collect_content.out_menu)
    return generated_menu.hash
}

async function get_base_menu(){
    const generated_menu = await load_json(config.collect_content.out_menu)
    return generated_menu.base_menu
}

export{
    process_toc_list,
    get_generated_section_menu,
    get_menu_hash,
    get_base_menu,
    get_active_appbar_menu
}
