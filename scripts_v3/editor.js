(function(){
if (!THREE) { throw "Error: need Three.js."; }

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
        let scene = new THREE.Scene();

        // Ambient Light: soft white light
        scene.add(new THREE.AmbientLight(0x000000));
        // Simulate Sun light
        /*[ [1,2,1,0.65], [-1,2,-1,0.5], [-1,-2,1,0.25] ].map((function(dist) {
            return function(p) {
                var light = new THREE.PointLight( 0xFFFFFF, p[3], 0 );
                light.position.set(p[0]*dist,p[1]*dist,p[2]*dist);
                scene.add(light);
            };
        })(100));*/
        [ [-1,0.5,1,0.65], [1,0.5,1,0.2] ].map((function(dist) {
            return function(p) {
                var light = new THREE.PointLight( 0xFFFFFF, p[3], 0 );
                light.position.set(p[0]*dist,p[1]*dist,p[2]*dist);
                scene.add(light);
            };
        })(100));

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
        return intersects[0];
    };

    hover(obj) {
        if (this.hovered!=null) {
            // TODO: trigger unhover
        }
        this.hovered = obj;
    };

    /*on(ev,listener) {
        //this.listeners
        switch (ev) {
        case "hover":
        case "unhover":
        case "enter":
        case "leave":
        }
    };*/
};

/*------------------------------------------------------------*\
 * Viewport
 - HTMLCanvasElement
 - THREE.Camera
\*------------------------------------------------------------*/
class Viewport {
    constructor(parent,scene) {
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
            if (e.wheelDeltaY==0) { return; }
            this.scale += (e.wheelDeltaY>0) ? -0.1 : 0.1;
            this.relocate();
            
        });
        this.canvas.setAttribute("oncontextmenu","return false;");
        var dragging = false,/* button = -1,*/ method = "hover";
        this.canvas.addEventListener("mousedown",(e)=>{
            dragging = true;
            switch(e.button) {
            case 2:
                method = "rotate";
                break;
            case 0:
                let selected = this.scene.select(castRay(e.clientX,e.clientY));
                if (selected!=null) {
                    this.scene.trigger("click",selected,{
                        "shift": e.shiftKey,
                        "ctrl": e.ctrlKey,
                        "alt": e.altKey
                    });
                    method = "modify";
                } else { method = "rotate"; }
                break;
            default:
                break;
            }
        });
        this.canvas.addEventListener("mousemove",(e)=>{
            this.scene.viewport = this;
            if (!dragging) {
                let hovered = this.scene.select(castRay(e.clientX,e.clientY));
                this.scene.hover(hovered);
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
            default:
                kjEditor.drag(method,{
                    "shift": e.shiftKey,
                    "ctrl": e.ctrlKey,
                    "alt": e.altKey
                },movement);
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
            //kjEditor.click(this,1);
        });
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
            Math.sin(this.radianXZ),
            Math.sin(this.radianY),
            Math.cos(this.radianXZ)
        ).multiplyScalar(10);
        this.camera.lookAt(this.target.x,this.target.y,this.target.z);
        this.camera.top = this.scale;
        this.camera.left = -this.aspect * this.scale;
        this.camera.right = this.aspect * this.scale;
        this.camera.bottom = -this.scale;
        this.camera.updateProjectionMatrix();
    };

    render() {
        this.renderer.render(this.scene.scene,this.camera);
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

    fit() {
        let w = this.parent.offsetWidth,
            h = this.parent.offsetHeight;
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
        this.width = w;
        this.height = h;
    };

    resize(w,h) {
        this.canvas.width = w;
        this.canvas.height = h;
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
 * kjEditor
\*------------------------------------------------------------*/
var canvaslist = {}, scenelist = {}, views = [], buttonlist = {};
var listeners = {}, updater = [];

window.kjEditor = {

"initialize": function() {
    var form = document.querySelector("[kj-editor-form]");
    var buttons = form.querySelectorAll("[kj-editor-button]");
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
    let viewports = form.querySelectorAll("[kj-editor-viewport]");
    for(let i=0;i<viewports.length;i++) {
        let e = viewports[i], n = e.getAttribute("kj-editor-viewport");
        if (n==null) { throw "Error: scene need a name!"; }
        if (!(n in scenelist)) { scenelist[n] = new Scene(); }
        let v = new Viewport(e,scenelist[n]);
        views.push(v);
    }
    // Canvas2D
    let canvases = form.querySelectorAll("[kj-editor-canvas]");
    for(let i=0;i<canvases.length;i++) {
        let e = canvases[i], n = e.getAttribute("kj-editor-canvas");
        if (n==null) { throw "Error: canvas need a name!"; }
        if (n in canvaslist) {
            // copy Canvas & set sync listener
            continue;
        }
        canvaslist[n] = new Canvas(e);
    }

    updateFrame(0);
},

"resize": function() {
    views.map(function(v) { v.fit(); });
    for(let n in canvaslist) { canvaslist[n].fit(); }
},

"Scene": function(n) {
    if (!(n in scenelist)) { throw "Error no Scene named '"+name+"'."; }
    return scenelist[n];
},

"Canvas": function(n) {
    if (!(n in canvaslist)) { throw "Error: no Canvas named '"+name+"'."; }
    return canvaslist[n];
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


"Timer": Timer,



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

"onUpdate": function(f) {
    updater.push(f);
}


};




})();