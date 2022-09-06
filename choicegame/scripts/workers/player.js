import { solveFormulae, checkConditions, loadData } from "../modules/core.js";

const API_METHOD = "GET";//"POST";
let scenes = {}, flags = {}, layoutlist,
    current = null, options = {}, history = [];

onmessage = function(e) {
    switch(e.data.type) {
    case "initialize":
        let handle = e.data.handle;
        if (handle==null) {
            postMessage({
                "type": "error",
                "message": "No Handle."
            });
            break;
        }
        prepare(handle);
        break;
    case "prepared":
        if (current==null) {
            postMessage({
                "type": "error",
                "message": "No current Scene!",
                "data": Object.keys(scenes)
            });
            break;
        }
        postMessage({
            "type": "show",
            "scene": filter(current),
            "flags": flags
        });
        break;
    case "select":
        if (e.data.option in options) {
            let opt = options[e.data.option];
            /* debug, not neccassery
            if (!checkConditions(opt.condition,flags)) {
                break;
            }*/
            let queue = opt.action.split(";"), next = null;
            while (queue.length>0) {
                let act = queue.shift(),
                    type = act.substring(0,4).toUpperCase(),
                    args = act.substring(5,act.length-1).split(",");
                switch (type) {
                case "GOTO":
                    next = args[0];
                    if (next.charAt(0)=="-") {
                        let goback = Math.abs(parseInt(next));
                        if (history.length<goback) {
                            postMessage({
                                "type": "error",
                                "message": "Cannot go back."
                            });
                            next = null;
                            break;
                        }
                        for(let i=0;i<goback;i++) { history.pop(); }
                        next = history[history.length-1];
                    }
                    break;
                case "GAIN":
                    let k = args[0], v = solveFormulae(args[1],flags);
                    if (!(k in flags)) { flags[k] = 0; }
                    flags[k] += v;
                    postMessage({
                        "type": "gain",
                        "flag": k,
                        "amount": v
                    });
                    break;
                case "CALL":
                    let layout = args.shift();
                    if (layoutlist.indexOf(layout)<0) {
                        loadData("layout",layout).then((layout_obj)=>{
                            postMessage({
                                "type": "popup",
                                "key": layout,
                                "layout": layout_obj,
                                "args": args.map((a)=>{
                                    return solveFormulae(a,flags);
                                })
                            });
                        }).catch((e)=>{
                            postMessage({
                                "type": "error",
                                "message": "Cannot get layout."
                            });
                        });
                    } else {
                        postMessage({
                            "type": "popup",
                            "layout": layout,
                            "args": args.map((a)=>{
                                return solveFormulae(a,flags);
                            })
                        });
                    }
                    break;
                case "CASE":
                    let cond = args.shift();
                    if (checkConditions(cond,flags)) {
                        args.map((act)=>{
                            queue.push(act);
                        });
                    }
                    break;
                }
                if (next in scenes) {
                    history.push(next);
                    current = scenes[next];
                    postMessage({
                        "type": "show",
                        "scene": filter(current),
                        "flags": flags
                    });
                }
            }
        }
        break;
    default:
        postMessage({
            "type": "error",
            "message": "Unknown event type.",
            "data": e.data
        });
        break;
    }
};

onerror = function(e) {};

function prepare(handle) {
    /* Get Adventure
     * backend should search story handle & user token
     * if no no adventure, create one.
     */
    layoutlist = [];
    let layouts = {}, loader = [];
    function add(data,key) {
        if (key in layouts) { return key; }
        switch (typeof data) {
        case "object":
            layouts[key] = data;
            layoutlist.push(key);
            break;
        case "string":
            key = data;
            if (layoutlist.indexOf(key)>=0) { break; }
            layoutlist.push(key);
            if (!(key in layouts)) {
                /*loader.push(load_layout(data).then((json)=>{
                    layouts[key] = json;
                }));*/
                loader.push(loadData("layout",data).then((json)=>{
                    layouts[key] = json;
                }).catch((e)=>{
                    postMessage({
                        "type": "error",
                        "message": "Cannot get layout."
                    });
                }));
            }
            break;
        default:
            postMessage({
                "type": "error",
                "message": "Strange layout."
            });
            break;
        }
        return key;
    };

    loadData("adventure",handle).then((adv)=>{
        //let loaders = [];
        if ("layouts" in adv) {
            for(let k in adv.layouts) {
                add(adv.layouts[k],k);
            }
        }
        if (typeof adv.scenes == "object") {
            for(let k in adv.scenes) {
                let scene = adv.scenes[k];
                scene.layout = add(scene.layout,k+"_layout");
                scenes[k] = scene;
            }
        }
        current = ["current","entrance"].reduce((cur,key)=>{
            if (cur!=null) { return cur; }
            if (key in adv && adv[key] in scenes) {
                let first = adv[key];
                history.push(first);
                return scenes[first];
            }
            return null;
        },null);
        if ("flags" in adv) {
            for(let k in adv.flags) {
                flags[k] = adv.flags[k];
            }
        }
        return Promise.all(loader);
    }).then(()=>{
        postMessage({
            "type": "loaded",
            "layouts": layouts
        });
    }).catch((e)=>{
        postMessage({
            "type": "error",
            "message": "Cannot get adventure.",
            "data": e
        });
    });
}

function copy_object(obj,ignores) {
    let copied = {};
    for(let k in obj) {
        if (ignores.indexOf(k)<0) {
            copied[k] = obj[k];
        }
    }
    return copied;
}
function filter(scene) {
    let filtered = copy_object(scene,["options"]);
    filtered.options = {};
    for(let group in scene.options) {
        filtered.options[group] = scene.options[group].reduce((arr,opt,i)=>{
            let key = group + "_" + (("key" in opt) ? opt.key : ("option"+i));
            options[key] = opt;
            if (checkConditions(opt.condition,flags)) {
                let out = copy_object(opt,["condition","action"]);
                out.option_id = key;
                arr.push(out);
            }
            return arr;
        },[]);
    }
    return filtered;
}

postMessage({ "type": "ready" });