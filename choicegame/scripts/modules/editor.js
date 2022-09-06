import { Layout } from "./layout.js";
import * as Core from "./core.js";
import * as iDB from "./indexeddb.js";

/*------------------------------------------------------------*\
 * Check & Update local DB
\*------------------------------------------------------------*/
const version = 1;
let db = await iDB.CreateDatabase("editor",version,{
    "data": { "key": "key" },
    "flags": { "key": "handle" },
    "layouts": { "key": "handle" },
    "resources": { "key": "handle" }
});

// get User.updated timestamp
let user = await Core.loadUserData();
let updated = await db.select("data","updated");

if (updated==null || updated<user.updated) {
    // Update Database
    /*await Promise.all(["resources","layouts","flags"].map((k)=>{
        return Core.loadData(k)
            .then((rows)=>{ return db.upsert(k,rows); })
            .catch((e)=>{
                console.log(e);
            });
    }));*/
    // Debug
    await Core.loadData("layout","default_layout.json")
        .then((rows)=>{ return db.upsert("layouts",rows); })
        .catch((e)=>{ console.log(e); });
}

/*------------------------------------------------------------*\
 * Prepare Editor
 - nav#scenes
\*------------------------------------------------------------*/
let nav = document.querySelector("nav#scenes"),
    main = document.querySelector("#main"),
    svg = document.querySelector("#svg");

function build_by_selector(selector,parent) {
    return selector.split(" ").reduce((p,sel)=>{
        if (sel.length>0 && sel!=">") {
            let clss = sel.split("."),
                tag = clss.shift(), id = null;
            if (tag.indexOf("#")>0) {
                [tag,id] = tag.split("#");
            }
            if (tag.length==0) { tag = "div"; }
            let e = document.createElement(tag);
            if (id!=null) { e.id = id; }
            e.classList.add(clss);
            if (p!=null) { p.appendChild(e); }
            return e;
        }
        return p;
    },parent);
}

let layouts = {}, promises = {};
async function getLayout(layout) {
    if (typeof layout == "object") { return new Layout(layout); }
    if (typeof layout != "string") { throw "Invalid Layout!"; }
    if (layout in layouts) { return layouts[layout]; }
    if (layout in promises) { return promises[layout]; }
    promises[layout] = db.select("layouts",layout).then((json)=>{
        console.log("Layout ["+layout+"] loaded.");
        delete promises[layout];
        layouts[layout] = new Layout(json);
        return layouts[layout];
    }).catch((e)=>{
        throw "Layout["+layout+"] not found!";
    });
    return promises[layout];
}

let wrapper = main.querySelector("#wrapper");
wrapper.style.width = (main.clientWidth*0.95) + "px";
function relocate_wrapper() {
    let mw = main.clientWidth, mh = main.clientHeight,
        w = wrapper.clientWidth, h = wrapper.clientHeight;
    wrapper.style.margin = [mh-h,mw-w].map((px)=>{
        return (px/2) + "px";
    }).join(" ");
}
window.addEventListener("resize",(e)=>{
    wrapper.style.width = (main.clientWidth*0.95) + "px";
    //console.log(e,main.clientWidth);
    wrapper.onresize();
    relocate_wrapper();
});
function edit_scene(scene) {
    getLayout(scene.layout).then((layout)=>{
        layout.render(scene);
        layout.fill(wrapper,{"stick":"horz"});
        relocate_wrapper();
    });
}

let ul = nav.querySelector(".scrollbox > ul");
function add_scene(scene) {
    let div = build_by_selector("li.scene > .scene",ul);
    div.addEventListener("click",(e)=>{ edit_scene(scene); });
    getLayout(scene.layout).then((layout)=>{
        layout.render(scene);
        let e = layout.fill(div,true);
        e.style.pointerEvents = "none";
    });
}


/*------------------------------------------------------------*\
 * Editor initialize
\*------------------------------------------------------------*/
let story = await Core.loadData("adventure","default_story.json");
for(let k in story.scenes) {
    let s = story.scenes[k];
    add_scene(s);
    //if (k==story.entrance) {  }
}
edit_scene(story.scenes[story.entrance]);