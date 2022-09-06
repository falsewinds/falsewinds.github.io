import { Layout } from "./layout.js";

let wrapper = document.querySelector("#wrapper"),
    layout_db = {};
function prepare_layouts(layouts) {
    for(let k in layouts) {
        layout_db[k] = new Layout(layouts[k]);
    }
}
function renderScene(scene) {
    let layout = scene.layout;
    if (!(layout instanceof Layout)) {
        if (typeof layout == "string" && layout in layout_db) {
            layout = layout_db[layout];
        } else {
            throw "Cannot found Layout.";
        }
    }
    layout.render(scene);
    layout.fill(wrapper);
}
window.addEventListener("resize",(e)=>{ wrapper.onresize(); });

const DEFAULT_STORY = "default_story.json";

let worker = new Worker("./scripts/workers/player.js",{"type":"module"});
worker.onmessage = function(e) {
    switch (e.data.type) {
    case "ready":
        let handle = location.search.split("&").reduce((cur,kvp)=>{
            if (cur!=null) { return cur; }
            if (kvp.charAt(0)=="?") { kvp = kvp.substring(1); }
            let pair = kvp.split("=");
            if (pair.length==1) { return kvp; }
            if (pair.length>1 && pair[0]=="s") { return pair[1]; }
            return cur;
        },null);
        worker.postMessage({
            "type": "initialize",
            "handle": handle || DEFAULT_STORY
        });
        break;
    case "loaded":
        prepare_layouts(e.data.layouts);
        worker.postMessage({ "type": "prepared" });
        break;
    case "show":
        renderScene(e.data.scene);
        //console.log(e.data.flags);
        break;
    case "gain":
        // EVENT: Gain flag
        console.log(e.data.flag,e.data.amount);
        break;
    case "popup":
        // EVENT: popup out layout
        console.log(e.data.layout,e.data.args);
        break;
    case "error":
        console.log(e.data.message,e.data.data);
        break;
    default:
        break;
    }
}
wrapper.addEventListener("click",(e)=>{
    let elem = e.target;
    while (elem instanceof HTMLElement) {
        if (elem.hasAttribute("choicegame-option")) {
            worker.postMessage({
                "type": "select",
                "option": elem.getAttribute("choicegame-option")
            });
            break;
        }
        elem = elem.parentNode;
    }
});