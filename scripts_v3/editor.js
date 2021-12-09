(function(){

const _FPS = 60;
var _nextFrame = (function(){
    return window.requestAnimationFrame    || 
        window.webkitRequestAnimationFrame || 
        window.mozRequestAnimationFrame    || 
        window.oRequestAnimationFrame      || 
        window.msRequestAnimationFrame     ||  
        function(callback) {
            return window.setTimeout(callback, 1000 / _FPS);
        };
})(),
    _cancelFrame = (function() {
    return window.cancelAnimationFrame              ||
        window.webkitCancelRequestAnimationFrame    ||
        window.mozCancelRequestAnimationFrame       ||
        window.oCancelRequestAnimationFrame         ||
        window.msCancelRequestAnimationFrame        ||
        window.clearTimeout
})();

var timer = null, tock = 0;
var updateFrame = function(tick) {
    kjEditor.update(tick-tock);
    timer = _nextFrame(updateFrame);
    tock = tick;
};

window.addEventListener("resize",function() { kjEditor.resize(); });
window.addEventListener("keydown",function(e) { kjEditor.press(e.key,e.ctrlKey); });

const radian = Math.PI / 180, defaultRange = 8;

/*------------------------------------------------------------*\
 * Scene
\*------------------------------------------------------------*/
class Scene {
    constructor() {
        if (!THREE) { throw "Error: no Three.js"; }
        let scene = new THREE.Scene();

        // Ambient Light: soft white light
        scene.add(new THREE.AmbientLight(0x000000));

        this.scene = scene;
        this.viewport = null;
        this.hovered = null;
        this.listeners = {};
    };

    add(o,pos) {
        if (!(o instanceof THREE.Object3D)) { return null; }
        if (!(pos instanceof THREE.Vector3)) {
            let x = 0, y = 0, z = 0;
            if (pos instanceof Array) {
                x = (pos.length>0) ? pos[0] : 0;
                y = (pos.length>1) ? pos[1] : x;
                z = (pos.length>2) ? pos[2] : y;
            } else if (typeof pos == "object") {
                x = ("x" in pos) ? pos.x : 0;
                y = ("y" in pos) ? pos.y : x;
                z = ("z" in pos) ? pos.z : y;
            }
            pos = new THREE.Vector3(x,y,z);
        }
        o.position.copy(pos);
        this.scene.add(o);
        return o;
    };

    select(ray) {
        let intersects = ray.intersectObjects(this.scene.children,true);
        if (intersects.length<=0) { return null; }
        let find = function(o,attrs,def) {
            let tar = o, que = attrs.slice(0,attrs.length);
            while (que.length>0) {
                let q = que.shift();
                if (typeof tar != "object" || !(q in tar)) { return def; }
                tar = tar[q];
            }
            return tar;
        };
        let attributes = ["geometry","userData","selectPriority"];
        intersects.sort((o1,o2)=>{
            let so1 = find(o1.object,attributes,-1),
                so2 = find(o2.object,attributes,-1);
            if (so1==so2) { return (o1.distance<o2.distance) ? -1 : 0; }
            return (so1>so2) ? -1 : 1;
        });
        return intersects[0];
    };

    hover(obj) {
        if (this.hovered!=null) {
            // TODO: trigger unhover
        }
        this.hovered = obj;
    };

    clear() {
        while (this.scene.children.length>0) {
            let o = this.scene.children.pop();
            o.remove();
        }
    };

    trigger(ev,args) {
        if (!(ev in this.listeners)) { return args; }
        this.listeners[ev].map((f)=>{
            f.call(this,args);
        });
        return args;
    };

    on(ev,listener) {
        if (!(ev in this.listeners)) { this.listeners[ev] = []; }
        this.listeners[ev].push(listener);
    };
};

/*------------------------------------------------------------*\
 * Viewport
 - HTMLCanvasElement
 - THREE.Camera
\*------------------------------------------------------------*/
class Viewport {
    constructor(parent,scene) {
        if (!THREE) { throw "Error: no Three.js"; }
        this.scene = scene;
        this.parent = parent;
        this.canvas = document.createElement("canvas");
        parent.appendChild(this.canvas);
        if (parent.style.backgroundColor==null) {
            parent.style.backgroundColor = "rgb(240,240,240)";
        }
        this.renderer = new THREE.WebGLRenderer({
            "canvas": this.canvas,
            "alpha": true,
            "antialias": true
        });
        this.scale = defaultRange;
        this.aspect = 1;
        this.camera = new THREE.OrthographicCamera(
            -defaultRange,defaultRange,
            defaultRange,-defaultRange,
            0.001,1000
        );
        this.radianY = Math.PI / 8;
        this.radianXZ = Math.PI / 6;
        this.target = new THREE.Vector3(0,0,0);
        this.fit();
        this.relocate();

        let castRay = (function(w,h,cam) {
            let ray = new THREE.Raycaster();
            ray.layers.set(1);
            return function(x,y) {
                let xy = new THREE.Vector2( ((x/w)*2)-1, 1-((y/h)*2) );
                ray.setFromCamera(xy,cam);
                return ray
            };
        })(this.canvas.width,this.canvas.height,this.camera);

        // Mouse Control
        this.canvas.addEventListener("wheel",(e)=>{
            /*let scene_trigger = this.scene.trigger("wheel",{"scale":true});
            console.log(scene_trigger);
            if (scene_trigger.scale==false) { return; }*/
            if (e.wheelDeltaY==0) { return; }
            this.scale += (e.wheelDeltaY>0) ? -0.1 : 0.1;
            this.relocate();
            
        });
        this.canvas.setAttribute("oncontextmenu","return false;");
        let dragging = false, method = "hover";
        this.canvas.addEventListener("mousedown",(e)=>{
            dragging = true;
            switch(e.button) {
            case 2:
                method = "rotate";
                break;
            case 0:
                let selected = this.scene.select(castRay(e.clientX,e.clientY));
                if (e.ctrlKey || selected==null) {
                    method = "rotate";
                    break;
                }
                let args = {
                    "target": selected
                };
                if (e.shiftKey) {
                    this.scene.trigger("dragstart",args);
                    method = "drag";
                    break;
                }
                method = this.scene.trigger("mousedown",args);
                if (method==null) { method = "rotate"; }
                break;
            default:
                break;
            }
        });
        this.canvas.addEventListener("mousemove",(e)=>{
            this.scene.viewport = this;
            if (!dragging) {
                let hovered = this.scene.select(castRay(e.clientX,e.clientY));
                if (hovered!=null) {
                    this.scene.trigger("hover",{"target":hovered});
                }
                return;
            }
            let movement = {
                "x": e.movementX * -0.1 * radian,
                "y": e.movementY * 0.1 * radian
            };
            switch(method) {
            case "rotate":
                this.radianXZ += movement.x;
                this.radianXZ %= Math.PI * 2;
                this.radianY += movement.y;
                if (this.radianY<-Math.PI/2) { this.radianY = -Math.PI / 2; }
                if (this.radianY>Math.PI/2) { this.radianY = Math.PI / 2; }
                this.relocate();
                break;
            case "drag":
                this.scene.trigger("drag",movement);
                break;
            default:
                break;
            }
        });
        this.canvas.addEventListener("mouseup",(e)=>{
            dragging = false;
            method = "hover";
        });
        this.canvas.addEventListener("mouseleave",(e)=>{
            dragging = false;
            method = "hover";
            this.scene.viewport = null;
        });
        this.canvas.addEventListener("click",(e)=>{
            let selected = this.scene.select(castRay(e.clientX,e.clientY));
            if (selected!=null) {
                this.scene.trigger("click",{
                    "target": selected,
                    "keys": {
                        "shift": e.shiftKey,
                        "ctrl": e.ctrlKey
                    }
                });
            }
        });

        let axis = parent.getAttribute("kj-editor-viewport-axis");
        if (axis!=null) {
            let axis_dom = document.createElement("div");
            axis_dom.style.width = "64px";
            axis_dom.style.height = "64px";
            axis_dom.style.position = "absolute";
            axis_dom.style.top = "0px";
            axis_dom.style.right = "0px";
            this.Axis = {
                "camera": new THREE.OrthographicCamera( -1,1,1,-1,0.001,1000 ),
                "scene": new THREE.Scene(),
                "renderer": new THREE.WebGLRenderer({"alpha":true,"antialias":true}),
                "render": ()=>{
                    this.Axis.camera.up = this.camera.up;
                    this.Axis.camera.position.copy(this.camera.position);
                    this.Axis.camera.position.sub(this.scene.scene.position);
                    this.Axis.camera.lookAt(this.Axis.scene.position);
                    this.Axis.renderer.render(this.Axis.scene,this.Axis.camera);
                }
            };
            axis_dom.appendChild(this.Axis.renderer.domElement);
            this.Axis.renderer.setSize(64,64);
            this.Axis.scene.add(new THREE.AxesHelper(1));
            parent.appendChild(axis_dom);
        }

    };

    fit() {
        var w = this.parent.offsetWidth,
            h = this.parent.offsetHeight;
        this.renderer.setSize(w,h);
        this.aspect = w / h;
        this.camera.left = -this.aspect * this.scale;
        this.camera.right = this.aspect * this.scale;
        this.camera.updateProjectionMatrix();
    };

    relocate() {
        this.camera.position.set(
            Math.cos(this.radianY) * Math.sin(this.radianXZ),
            Math.sin(this.radianY),
            Math.cos(this.radianY) * Math.cos(this.radianXZ)
        ).multiplyScalar(20);
        this.camera.lookAt(this.target.x,this.target.y,this.target.z);
        this.camera.top = this.scale;
        this.camera.left = -this.aspect * this.scale;
        this.camera.right = this.aspect * this.scale;
        this.camera.bottom = -this.scale;
        this.camera.updateProjectionMatrix();
    };

    render() {
        this.renderer.render(this.scene.scene,this.camera);
        if ("Axis" in this) { this.Axis.render(); }
    };

    viewAt(rad_y,rad_xz,scalar) {
        this.radianY = rad_y;
        this.radianXZ = rad_xz;
        this.scale = scalar;
        this.relocate();
    };
};

/*------------------------------------------------------------*\
 * Canvas
 - HTMLCanvasElement
\*------------------------------------------------------------*/
class Canvas {
    constructor(parent, scale) {
        this.parent = parent;
        this.canvas = document.createElement("canvas");
        parent.appendChild(this.canvas);
        this.scale = 1;
        this.fit();
        this.resize(this.width,this.height);
        this.context = this.canvas.getContext("2d");
    };

    fit(resized = false) {
        let w = this.parent.offsetWidth,
            h = this.parent.offsetHeight;
        if (resized) { this.resize(w,h); }
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
        this.width = w;
        this.height = h;
    };

    copysize(canvas) {
        if (!(canvas instanceof Canvas)) {
            console.log("Not a kjEditor Canvas.");
            return;
        }
        this.canvas.width = canvas.canvas.width;
        this.canvas.height = canvas.canvas.height;
        this.canvas.style.width = canvas.canvas.style.width;
        this.canvas.style.height = canvas.canvas.style.height;
        this.canvas.style.margin = canvas.canvas.style.margin;
        this.width = canvas.width;
        this.height = canvas.height;
    };

    resize(w,h) {
        this.canvas.width = w;
        this.canvas.height = h;
    };

    view(image,scale) {
        let pw = this.parent.offsetWidth,
            ph = this.parent.offsetHeight;
        if (scale!==false) {
            this.scale = Math.min(pw/image.width,ph/image.height);
        }
        this.resize(image.width,image.height);
        let iw = image.width * this.scale,
            ih = image.height * this.scale;
        this.canvas.style.width = iw + "px";
        this.canvas.style.height = ih + "px";
        this.width = iw;
        this.height = ih;
        let margin = [0,0];
        if (iw>pw) { ih += 20; } else { margin[1] = (pw-iw) / 2; }
        if (ih>ph) { iw += 20; } else { margin[0] = (ph-ih) / 2; }
        if (iw>pw) { this.parent.style.overflowX = "scroll"; }
        if (ih>ph) { this.parent.style.overflowY = "scroll"; }
        this.canvas.style.margin = margin.map((v)=>{ return v+"px"; }).join(" ");
        this.context.drawImage(image,0,0);
    };

    clear() { this.context.clearRect(0,0,this.width,this.height); };
    fill(color) {
        this.context.fillStyle = color;
        this.context.fillRect(0,0,this.width,this.height);
    };

    transparent(alpha,match) {
        let size = this.canvas.width * this.canvas.height,
            img = this.context.getImageData(0,0,this.canvas.width,this.canvas.height),
            mf = (typeof match == "function") ? match : ()=>{ return true; };
        for(let i=0;i<size;i++) {
            let ptr = i * 4, rgb = [0,1,2].map((i)=>{ return img.data[ptr+i]; });
            if (mf(rgb)) { img.data[ptr+3] = alpha; }
        }
        this.context.putImageData(img,0,0);
    };

    strokeCircle(center,radius,color) {
        this.context.beginPath();
        this.context.arc(center.x,center.y,radius,0,2*Math.PI);
        this.context.closePath();
        this.context.strokeStyle = color;
        this.context.stroke();
    };
};

/*------------------------------------------------------------*\
 * Layers
 - HTMLCanvasElement & Image
\*------------------------------------------------------------*/
class Layers {
    constructor(parent,name) {
        this.name = name;
        this.parent = new DOMWrapper(parent);
        this.parent.classname(["-layers"]);
        //parent.style.position = "relative";
        this.layers = [];
    };

    add(img) {
        let c = new Canvas(this.parent,1);
        this.layers.push(c);
        c.canvas.style.position = "absolute";
        c.canvas.style.zIndex = this.layers.length;
        return c;
    };

    arrange(ele,order) {
        if (order<0 || order>=this.layers.length)
        {
            this.layers.push(ele);
        }
        else
        {
            this.layers.splice(order,0,ele);
        }
    };

    addCanvas(options) {
        let p = new DOMWrapper("div",["-layer"]);
        this.parent.element.appendChild(p.element);
        let c = new Canvas(p.element),
            n = this.name + "Layer" + this.layers.length
        canvaslist[n] = c;
        this.arrange(c);
        return c;
    };

    addViewport(options) {
        return null;
    };
};

/*------------------------------------------------------------*\
 * DOM Wrapper
\*------------------------------------------------------------*/
class DOMWrapper {
    constructor(tag,cls) {
        this.element = (tag instanceof HTMLElement) ? tag : document.createElement(tag);
        this.classname(cls);
        this.components = {};
    };

    classname(cls,insert = true) {
        let new_cls = (typeof cls == "string") ? cls.split(" ") : cls;
        if (!(new_cls instanceof Array)) { new_cls = []; }
        if (insert) {
            let clss = this.element.className;
            clss = (clss.length>0) ? clss.split(" ") : [];
            new_cls = clss.concat(new_cls);
        }
        this.element.className = new_cls.join(" ");
    };

    position(x,y) {
        this.element.style.left = x + "px";
        this.element.style.top = y + "px";
    };
    resize(w,h) {
        this.element.style.width = w + "px";
        this.element.style.height = h + "px";
        this.position(
            (window.innerWidth-w)/2,
            (window.innerHeight-h)/2
        );
    };

    insert(key,tag,cls) {
        this.components[key] = new DOMWrapper(tag,cls);
        this.element.appendChild(this.components[key].element);
        return this.components[key];
    };
    get(key) { return this.components[key]; };

    clear() {
        this.element.innerHTML = "";
        /*while (this.element.children.length>1) {
            this.element.removeChild(this.element.children[0]);
        }*/
    };
    write(text) {
        this.element.appendChild(document.createTextNode(text));
    };
};

/*------------------------------------------------------------*\
 * Timer
\*------------------------------------------------------------*/
class Timer {
    constructor() {
        this.begin = performance.now();
        this.last = this.begin;
    };

    get total() { return this.last - this.begin; };

    count(digital) {
        let now = performance.now(),
            dur = (now - this.last) / 1000;
        this.last = now;
        if (isNaN(digital) || digital<=0) { return dur; }
        let digit = Math.pow(10,digital);
        return parseInt(dur*digit) / digit;
    };
};

/*------------------------------------------------------------*\
 * Pseudo Random Number Generator
 - follow from https://gist.github.com/blixt/f17b47c62508be59987b
\*------------------------------------------------------------*/
class SimplePRNG {
    constructor() { this.set(0); };

    set(seed) {
        if (isNaN(seed)) { throw "Error: seed must be Number."; }
        this._seed = parseInt(seed);
        this._next = this._seed % 2147483647;
        if (this._next<=0) { this._next += 2147483646; }
    };

    get seed() { return this._seed; };
    get(n,m) {
        this._next = this._next * 16807 % 2147483647;
        let f = (this._next-1) / 2147483645; // [0,1], original: 2147483646 [0,1)
        if (isNaN(n)) { n = 0; }
        if (isNaN(m)) { m = 1; }
        let base = Math.min(n,m), delta = Math.max(n,m) - base;
        if (delta==0) { return f; }
        return base + f * delta;
    };

    skip(count) {
        count = count % 2147483647;
        const wrap = 16807, wrap_mul = 16807n ** BigInt(wrap);
        let mod = count % wrap, mul = (count-mod) / wrap,
            bn = BigInt(this._next);
        for(let i=0;i<mul;i++) { bn = bn * wrap_mul % 2147483647n; }
        this._next = Number(bn * (16807n ** BigInt(mod)) % 2147483647n);
        return this._next;
    };
};

/*------------------------------------------------------------*\
 * Animator
\*------------------------------------------------------------*/
class Animator {
    constructor(duration) {
        this.current = 0;
        this.duration = duration;
    };

    get running() { return this.current<this.duration; }
};

/*------------------------------------------------------------*\
 * kjEditor
\*------------------------------------------------------------*/
let canvaslist = {}, layerslist = {},
    scenelist = {}, viewlist = {}, views = [],
    buttonlist = {};
let listeners = {}, updater = [];
let cover = null, overflow = null, dialog_list = {};

window.kjEditor = {

"initialize": function() {
    let editor = document.querySelector("[kj-editor]");
    this.freeze();

    // Button
    let buttons = editor.querySelectorAll("[kj-editor-button]");
    for(let i=0;i<buttons.length;i++) {
        let e = buttons[i], n = e.getAttribute("kj-editor-button");
        if (n==null) { return; }
        if (!(n in buttonlist)) { buttonlist[n] = []; }
        let btn = document.createElement("a");
        btn.className = "btn-like";
        btn.appendChild( document.createTextNode(e.innerText) );
        btn.addEventListener("click",(e)=>{ kjEditor.click(n); });
        buttonlist[n].push(btn);
        e.innerHTML = "";
        e.appendChild(btn);
    }

    // Viewport & Scene3D
    let viewports = editor.querySelectorAll("[kj-editor-viewport]");
    for(let i=0;i<viewports.length;i++) {
        let e = viewports[i], sn = e.getAttribute("kj-editor-viewport");
        if (sn==null) { throw "Error: scene need a name!"; }
        if (!(sn in scenelist)) { scenelist[sn] = new Scene(); }
        let v = new Viewport(e,scenelist[sn]);
        let n = e.getAttribute("kj-editor-viewport-name");
        if (n!=null) { viewlist[n] = v; }
        views.push(v);
    }
    // Canvas2D
    let canvases = editor.querySelectorAll("[kj-editor-canvas]");
    for(let i=0;i<canvases.length;i++) {
        let e = canvases[i], n = e.getAttribute("kj-editor-canvas");
        if (n==null) { throw "Error: canvas need a name!"; }
        if (n in canvaslist) {
            // copy Canvas & set sync listener
            continue;
        }
        canvaslist[n] = new Canvas(e);
    }
    // Layers
    let layerses = editor.querySelectorAll("[kj-editor-layers]");
    for(let i=0;i<layerses.length;i++) {
        let e = layerses[i], n = e.getAttribute("kj-editor-layers");
        if (n==null) { throw "Error: Layers need a name!"; }
        if (n in layerslist) {
            // copy Layers & set sync listener
            continue;
        }
        let layers = new Layers(e,n);
        layerslist[n] = layers;
        let frames = e.querySelectorAll("[kj-editor-layer]");
        for(let j=0;j<frames.length;j++) {
            let le = frames[j], ctx;
            let dom = new DOMWrapper(le,["-layer"]);
            if (ctx=le.getAttribute("kj-editor-viewport")) {
                let vn = le.getAttribute("kj-editor-viewport-name"),
                    v = null;
                if (vn==null) {
                    v = views.reduce((tar,cur)=>{
                        return (cur.parent==le) ? cur : null;
                    },null);
                } else if (vn in viewlist) { v = viewlist[vn]; }
                if (v==null) { console.logError("No Viewport!"); }
                v.fit();
                layers.arrange(v);
            } else if (ctx=le.getAttribute("kj-editor-canvas")) {
                if (!(ctx in canvaslist)) { console.logError("No Canvas!"); }
                let c = canvaslist[ctx];
                c.fit(true);
                layers.arrange();
            }
            /*switch (lt) {
            case "viewport":
                {
                    let sn = le.getAttribute("kj-editor-layer-scene");
                    if (sn==null) { sn = ln + "Scene"; }
                    if (!(sn in scenelist)) { scenelist[sn] = new Scene(); }
                    let v = new Viewport(le,scenelist[sn]);
                    viewlist[ln] = v;
                    views.push(v);
                    layers.arrange(v);
                }
                break;
            case "canvas":
                {
                    if (ln in canvaslist) {
                        // copy Canvas & set sync listener
                        break;
                    }
                    let c = new Canvas(le);
                    canvaslist[ln] = c;
                    layers.arrange(c);
                }
                break;
            case "image":
                {
                    if (ln in canvaslist) {
                        // copy Canvas & set sync listener
                        break;
                    }
                    let c = new Canvas(le),
                        img = le.getAttribute("kj-editor-layer-image");
                    if (img!=null) { c.view(img,true); }
                    canvaslist[ln] = c;
                    layers.arrange(c);
                }
                break;
            default:
                console.logError("No type '"+lt+"' in kjEditor.");
                break;
            }*/
        }
    }

    updateFrame(0);
    this.defreeze();
},

"resize": function() {
    views.map(function(v) { v.fit(); });
    for(let n in canvaslist) { canvaslist[n].fit(); }
},

"Scene": function(n) {
    if (!(n in scenelist)) { throw "Error no Scene named '"+n+"'."; }
    return scenelist[n];
},

"Viewport": function(n) {
    if (!(n in viewlist)) { throw "Error no Viewport named '"+n+"'."; }
    return viewlist[n];
},

"Canvas": function(n) {
    if (!(n in canvaslist)) { throw "Error: no Canvas named '"+n+"'."; }
    return canvaslist[n];
},

"Layers": function(n) {
    if (!(n in layerslist)) { throw "Error: no Layers named '"+n+"'."; }
    return layerslist[n];
},


"animate": function(callee,duration) {
    let current = 0;
    updater.push((delta)=>{
        current += delta;
        if (current<0) { return false; }
        if (current>=duration) {
            callee.call(kjEditor,1);
            return true;
        }
        callee.call(kjEditor,current/duration);
    });
},
"update": function(delta) {
    /*if (typeof animate == "function") { meshes.map(animate); }
    else if (animate instanceof THREE.AnimationClip) {
        mixers.map(function(m) {
            m.update(delta/1000);
        });
    }*/
    var remove = [];
    updater.map((f)=>{
        if (f.call(kjEditor,delta)) {
            remove.push(f);
        };
    });
    while(remove.length>0) {
        var f = remove.shift(),
            index = updater.indexOf(f);
        if (index<0) { continue; }
        updater.splice(index,1);
    }
    views.map((v)=>{ v.render(); });
},



"on": function(key,callback,caller) {
    if (typeof callback != "function") { return; }
    if (caller==null) { caller = this; }
    listeners[key.toLowerCase()] = function(args) { callback.apply(caller,args); };
},

"press": function(key,ctrl) {
    if (typeof key != "string") { return; }
    var cmd = "press:" + (ctrl ? ("ctrl+"+key) : key).toLowerCase();
    if (cmd in listeners) { listeners[cmd].call(this); }
},

"click": function(target) {
    if (typeof target != "string") { return; }
    if (!(target in buttonlist)) { return; }
    let cmd = "click:" + target;
    if (!(cmd in listeners)) { return; }
    listeners[cmd].call(window,[]);
},


"freeze": function() {
    overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (cover==null) {
        cover = document.createElement("div");
        cover.className = "-cover";
        document.body.appendChild(cover);
    }
    cover.style.display = "block";
},
"defreeze": function() {
    if (cover!=null) {
        //document.body.removeChild(cover);
        cover.style.display = "none";
        document.body.style.overflow = overflow;
    }
},

"dialog": function(name,act,args) {
    let dlg = (name in dialog_list) ? dialog_list[name] : null;
    switch(act) {
    case "build":
        if (dlg==null) {
            dlg = new DOMWrapper("div","-dialog");
            document.body.appendChild(dlg.element);
            dlg.element.style.display = "none";
            dialog_list[name] = dlg;
        }
        if ("build" in args) { args.build.call(dlg); }
        if ("receive" in args) { dlg.receive = args.receive; }
        break;
    case "show":
        if (dlg==null) { break; }
        dlg.element.style.display = "block";
        break;
    case "hide":
        if (dlg==null) { break; }
        dlg.element.style.display = "none";
        break;
    case "send":
        if (dlg==null) { break; }
        if (dlg.element.style.display=="none") { break; }
        dlg.receive(args);
        break;
    default:
        console.log(act);
        break;
    }
},

"Timer": Timer,
"PRNG": SimplePRNG,


"hover": function(intersect) {
    if (!("hover" in listeners)) { return; }
    listeners["hover"].call(window,[intersect]);
},
"unhover": function() {
    if (!("unhover" in listeners)) { return; }
    listeners["unhover"].call(window,[]);
},
"drag": function(method,movement,buttons) {
    var key = method.toLowerCase();
    if (!(key in listeners)) { return; }
    listeners[key].call(window,[movement,buttons]);
},

"onUpdate": function(f) {
    updater.push(f);
}


};




})();