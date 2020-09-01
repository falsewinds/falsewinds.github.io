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
 * Viewport
 - HTMLCanvasElement
 - THREE.Camera
\*------------------------------------------------------------*/
function Viewport(parent) {
    this.parent = parent;
    this.canvas = document.createElement("canvas");;
    parent.appendChild(this.canvas);
    parent.style.backgroundColor = "rgb(240,240,240)";
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
    this.radianXZ = Math.PI / 3;
    this.target = new THREE.Vector3(0,0,0);
    this.resize();
    this.relocate();

    var that = this, ray = new THREE.Raycaster();
    ray.layers.set(1);
    function castRay(x,y) {
        var xy = new THREE.Vector2(
            ((x/that.canvas.width)*2) - 1,
            1 - ((y/that.canvas.height)*2)
        );
        ray.setFromCamera(xy,that.camera);
        return ray;
    };
    // Mouse Control
    this.canvas.addEventListener("wheel",function(e) {
        if (e.wheelDeltaY==0) { return; }
        that.scale += (e.wheelDeltaY>0) ? -0.1 : 0.1;
        that.relocate();
    });
    this.canvas.setAttribute("oncontextmenu","return false;");
    var dragging = false,/* button = -1,*/ method = "hover";
    this.canvas.addEventListener("mousedown",function(e) {
        dragging = true;
        //button = e.button;
        switch(e.button) {
        case 2:
            method = "rotate";
            break;
        case 0:
            selected = kjEditor.select(castRay(e.clientX,e.clientY));
            if (selected!=null) {
                kjEditor.click(selected,{
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
    this.canvas.addEventListener("mousemove",function(e) {
        if (!dragging) {
            var sect = kjEditor.select(castRay(e.clientX,e.clientY));
            if (sect!=null) { kjEditor.hover(sect); }
            return;
        }
        var movement = {
            "x": e.movementX * -0.1 * radian,
            "y": e.movementY * 0.1 * radian
        };
        //console.log(e.shiftKey,e.altKey,e.ctrlKey);
        switch(method) {
        case "rotate":
            that.radianXZ += movement.x;
            that.radianXZ %= Math.PI * 2;
            that.radianY += movement.y;
            if (that.radianY<-Math.PI/2) { that.radianY = -Math.PI / 2; }
            if (that.radianY>Math.PI/2) { that.radianY = Math.PI / 2; }
            that.relocate();
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
    this.canvas.addEventListener("mouseup",function(e) {
        dragging = false;
        method = "hover";
    });
    this.canvas.addEventListener("mouseleave",function(e) {
        dragging = false;
        method = "hover";
    });
    this.canvas.addEventListener("click",function(e) {
        kjEditor.click(this,1);
    });
};
Viewport.prototype.resize = function() {
    var w = this.parent.offsetWidth,
        h = this.parent.offsetHeight;
    this.renderer.setSize(w,h);
    this.aspect = w / h;
    this.camera.left = -this.aspect * this.scale;
    this.camera.right = this.aspect * this.scale;
    this.camera.updateProjectionMatrix();
};
Viewport.prototype.relocate = function() {
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
Viewport.prototype.render = function() {
    this.renderer.render(this.scene,this.camera);
};


/*------------------------------------------------------------*\
 * kjEditor
\*------------------------------------------------------------*/
var views = [], scene = new THREE.Scene();
var hotkeys = {}, listeners = {};
var updater = [];

window.kjEditor = {

"initialize": function() {
    var form = document.querySelector("[kj-editor-form]");
    var buttons = form.querySelectorAll("[kj-editor-button]");
    for(var i=0;i<buttons.length;i++) {
        var e = buttons[i], type = e.getAttribute("kj-editor-button");
        switch(type) {
        case "save-file":
        case "load-file":
        case "save":
        case "load":
            break;
        default:
            console.log("Undefined Type: "+type);
            break;
        }
    }
    var viewports = form.querySelectorAll("[kj-editor-area=\"viewport\"]");
    for(var i=0;i<viewports.length;i++) {
        var v = new Viewport(viewports[i]);
        views.push(v);
    }

    // Ambient Light: soft white light
    scene.add(new THREE.AmbientLight(0x000000));
    // Simulate Sun light
    [ [1,2,1,0.65], [-1,2,-1,0.5], [-1,-2,1,0.25] ].map((function(dist) {
        return function(p) {
            var light = new THREE.PointLight( 0xFFFFFF, p[3], 0 );
            light.position.set(p[0]*dist,p[1]*dist,p[2]*dist);
            scene.add(light);
        };
    })(100));
    // Grid Helper
    var grids = new THREE.GridHelper(10,10);
    grids.position.y = -5;
    scene.add(grids);

    updateFrame(0);
},

"select": function(ray) {
    var intersects = ray.intersectObjects( scene.children );
    if (intersects.length<=0) { return null; }
    return intersects[0];
},

"resize": function() {
    views.map(function(v) { v.resize(); });
},

"setHotKey": function(cmd,callback,caller) {
    if (typeof callback != "function") { return; }
    var key = cmd.toLowerCase();
    if (["ctrl+c","ctrl+v"].indexOf(key)>=0) { return; }
    if (caller==null) { caller = this; }
    hotkeys[key] = function() { callback.call(caller); };
},
"press": function(key,ctrl) {
    var cmd = (ctrl ? ("ctrl+"+key) : key).toLowerCase();
    if (cmd in hotkeys) { hotkeys[cmd].call(this); }
},

"on": function(key,callback,caller) {
    if (typeof callback != "function") { return; }
    if (caller==null) { caller = this; }
    listeners[key.toLowerCase()] = function(args) { callback.apply(caller,args); };
},
"click": function(target,buttons) {
    if (!("click" in listeners)) { return; }
    listeners["click"].call(window,[target,buttons]);
},
"hover": function(intersect) {
    if (!("hover" in listeners)) { return; }
    listeners["hover"].call(window,[intersect]);
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
    updater.map(function(f) { f.call(kjEditor,delta); });
    views.map(function(v) {
        v.renderer.render(scene,v.camera);
    });
},

"onUpdate": function(f) {
    updater.push(f);
},

"scale": function(scalar) {
    views.map(function(v) {
        v.scale += scalar;
        v.relocate();
    });
}

// Temp Function
,
"addCreatureBase": function() {
    const flat = new THREE.MeshPhongMaterial({
        //"side": THREE.DoubleSide,
        "flatShading": true,
        "color": 0xAAFFAA
    });
    const wireframe = new THREE.MeshBasicMaterial({
        "color": 0xFFFFFF,
        "wireframe": true
    });
    var g = new THREE.IcosahedronGeometry(5,3),
        o = new THREE.Mesh(g,flat);
    o.layers.enable(1);
    scene.add(o);
    scene.add(new THREE.Mesh(g,wireframe));
    return g;
},

"addMark": function(g) {
    var m = new THREE.Mesh(g,new THREE.MeshPhongMaterial({
        "flatShading": true,
        "color": 0xFF0000
    }));
    scene.add(m);
    return m;
},

"add": function(o) {
    o.position.y -= 5;
    scene.add(o);
}

};




})();