import {
    Layout,
    findBlockElement,
    getBlockKey,
    IsLayoutRoot
} from "./layout.js";
import * as Core from "./core.js";
import * as iDB from "./indexeddb.js";
import * as DOM from "./dom.js";
import * as layoutControl from "./layout-controller.js";

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

let layouts = {}, promises = {};
async function getLayout(layout) {
    if (typeof layout == "object") { return layout; }
    if (typeof layout != "string") { throw "Invalid Layout!"; }
    //if (layout in layouts) { return layouts[layout]; }
    if (layout in promises) { return promises[layout]; }
    promises[layout] = db.select("layouts",layout).then((json)=>{
        console.log("Layout ["+layout+"] loaded.");
        //delete promises[layout];
        //layouts[layout] = json;
        //return layouts[layout];
        return json;
    }).catch((e)=>{
        console.log(e);
        throw "Layout["+layout+"] not found!";
    });
    return promises[layout];
}

/*------------------------------------------------------------*\
 * Prepare Editor
 - nav#scenes
\*------------------------------------------------------------*/
let ul = document.querySelector("nav#scenes ul");
async function addScene(scene) {
    let div = DOM.buildBySelector("li.scene > .scene",ul);
    div.addEventListener("click",(e)=>{
        // TODO: set style for activate Scene
        editScene(scene);
    });
    return getLayout(scene.layout).then((json)=>{
        scene.referred_layout = scene.layout;
        scene.layout = new Layout(json);
        scene.layout.render(scene);
        scene.layout.fill(div,{
            "clone": true,
            "orient": "landscape",
            "resize": true,
            "clip": true,
            "enable": false
        });
    });
}

/*------------------------------------------------------------*\
 * Prepare Editor
 - #main
 - #wrapper
\*------------------------------------------------------------*/
let main = document.querySelector("#main"),
    box = layoutControl.create(main,{
        "color": "blue"
    });

let targetBlock = null, targetLayout = null;
main.addEventListener("sizeChange",(e)=>{
    if (targetBlock==null) { return; }
    let rect = e.detail.rect;
    targetBlock.style.top = rect.y + "px";
    targetBlock.style.left = rect.x + "px";
    targetBlock.style.width = rect.w + "px";
    targetBlock.style.height = rect.h + "px";
    /*let key = getBlockKey(targetBlock);
    let b = targetLayout.blocks[key];
    console.log(key,b,e.detail.rect);*/
});
main.addEventListener("sizeChanged",(e)=>{
    if (targetBlock==null) { return; }
    // TODO: apply change to styles
    let key = getBlockKey(targetBlock),
        b = targetLayout.blocks[key];
    //console.log(key,b,e.detail.rect);
    targetLayout.update();
});
main.addEventListener("contentEdit",(e)=>{
    if (targetBlock==null) { return; }
    box.hide();
    let key = getBlockKey(targetBlock);
    let b = targetLayout.blocks[key];
    console.log(key,b);
});

const ratio = 0.95;
let wrapper = main.querySelector("#wrapper"),
    resize = null;
function relocateWrapper() {
    let mw = main.clientWidth, mh = main.clientHeight;
    wrapper.style.width = (mw*ratio) + "px";
    wrapper.style.height = (mh*ratio) + "px";
    if (resize!=null) { resize(); }
    let w = wrapper.clientWidth, h = wrapper.clientHeight;
    wrapper.style.margin = [mh-h,mw-w].map((px)=>{
        return (px/2) + "px";
    }).join(" ");
}
window.addEventListener("resize",relocateWrapper);
function editScene(scene) {
    if (targetLayout!=null) {
        wrapper.removeChild(targetLayout.root.element);
    }
    targetLayout = scene.layout;
    scene.layout.render(scene);
    resize = scene.layout.fill(wrapper,{
        "orient": "auto",
        "resize": true,
        "clip": true
    }) || resize;
    relocateWrapper();
    box.hide();
}

wrapper.addEventListener("click",(e)=>{
    let be = findBlockElement(e.target),
        pe = findBlockElement(be.parentNode);
    box.show(be,pe==document?null:pe);
    box.set("scalar",1/targetLayout.scalar);
    targetBlock = be;
});

/*------------------------------------------------------------*\
 * Editor initialize
\*------------------------------------------------------------*/
//loading start
let story = await Core.loadData("adventure","default_story.json");
// loading end
for(let k in story.scenes) {
    let s = story.scenes[k];
    await addScene(s);
}    
editScene(story.scenes[story.entrance]);
