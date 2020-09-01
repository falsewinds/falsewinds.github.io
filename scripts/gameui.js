(function() {

window.kjGameUI = {};

var selectElement = function(e,type) {
    var re = null;
    switch (typeof e) {
    case "string":
        re = document.getElementById(e);
        if (!(re instanceof type)) { re = null; }
        break;
    case "object":
        if (!(e instanceof type)) { re = null; }
        else { re = e; }
        break;
    default:
        re = null;
        break;
    }
    return re;
};

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

/*------------------------------------------------------------*\
 * Form
\*------------------------------------------------------------*/
window.kjGameUI.Form = function(form) {
    form = selectElement(form,HTMLFormElement);
    if (form==null) { form = document.createElement("form"); }

    var find = function(name) {
        for(var i=0;i<form.elements.length;i++) {
            var e = form.elements[i];
            if (e.name==name) { return e; }
        }
        return null;
    };

    var listeners = {};
    this.on = function(event,callback) {
        if (typeof callback == "function") {
            form.addEventListener(event,callback);
            listeners[event] = callback;
        }
    };
    this.trigger = function(event,args) {
        if (event in listeners) {
            listeners[event].apply(this,args);
        }
    };

    this.get = function(name,def) {
        var e = find(name);
        if (e!=null) {
            var tag = e.tagName.toUpperCase();
            if (tag=="SELECT") { return e.value; }
            var type = e.getAttribute("type") || "text";
            switch(type.toLowerCase()) {
            case "checkbox":
                return e.checked;
            default:
                return e.value;
            }
        }
        if (def==null) { throw "Error: "+name+" not found."; }
        return def;
    };

    this.set = function(name,value) {
        var e = find(name);
        if (e!=null) {
            if (typeof e.set == "function") { e.set(value); }
            else { e.value = value; }
        }
    };

    this.iterate = function(iterator) {
        for(var i=0;i<form.elements.length;i++) {
            var e = form.elements[i],
                type = e.getAttribute("type") || "text";
            iterator.call(this,[e,e.name,type.toLowerCase()]);
        }
    };

    while(form.children.length>0) { form.children[0].remove(); }
    var list = document.createElement("dl");
    form.appendChild(list);

    this.clear = function(keeps) {
        if (keeps==null) { keeps = []; }
        if (typeof keeps == "string") { keeps = [keeps]; }
        else if (!("indexOf" in keeps)) { keeps = []; }
        var kickout = [];
        for(var i=0;i<list.children.length;i++) {
            var e = list.children[i],
                field = e.getAttribute("kj-ui-field");
            if (keeps.indexOf(field)<0) { kickout.push(e); }
        }
        while(kickout.length>0) {
            var e = kickout.shift();
            e.remove();
        }
    };

    var convertName = function(str) {
        return str.split("-").map(function(s) {
            var l = s.length;
            return [
                s.charAt(0).toUpperCase(),
                s.substring(1,l).toLowerCase()
            ].join("");
        }).join(" ");
    };
    this.build = function(name,options,callback) {
        if (options==null) { options = {}; }
        var dt = document.createElement("dt"), main = null;
        dt.setAttribute("kj-ui-field",name);
        dt.appendChild(document.createTextNode(convertName(name)));
        list.appendChild(dt);
        var dd = document.createElement("dd");
        dd.setAttribute("kj-ui-field",name);
        var control = ("control" in options) ? options["control"] : "text";
        if (control=="select") {
            var select = document.createElement("select");
            select.setAttribute("name",name);
            var optionList = ("option" in options) ? options["option"] : [];
            optionList.map(function(opt) {
                var option = document.createElement("option");
                option.setAttribute("value",opt);
                option.appendChild(document.createTextNode(opt));
                select.appendChild(option);
            });
            if (typeof callback == "function") {
                select.addEventListener("change",callback);
            }
            select.set = function(v) {
                if (optionList.indexOf(v)<0) {
                    if (typeof v == "number") {
                        this.value = (v>=0)
                            ? optionList[v]
                            : optionList[optionList.length+v];
                    } else { return; }
                } else { this.value = v; }
                if (typeof callback == "function") {
                    callback.call(this);
                }
            };
            if ("value" in options) { select.set(options["value"]); }
            dd.appendChild(select);
            main = select;
        } else {
            var ctrls = [], val = ("value" in options) ? options["value"] : null;
            switch (control) {
            case "boolean":
                var input = document.createElement("input");
                input.setAttribute("name",name);
                input.setAttribute("type","checkbox");
                input.checked = val===true;
                ctrls.push(input);
                main = input;
                break;
            case "number":
                var input = document.createElement("input");
                input.setAttribute("name",name);
                input.setAttribute("type","number");
                ["min","max","step"].map(function(a) {
                    if (a in options) { input.setAttribute(a,options[a]); }
                });
                if (typeof val == "number") { input.value = val; }
                if (typeof callback == "function") {
                    input.addEventListener("change",callback);
                }
                ctrls.push(input);
                main = input;
                break;
            /*case "range":
                if (val==null) { val = [0,0]; }
                else if (typeof val == "number") { val = [val,val]; }
                else if (val.splice==null || val.length!=2) { val = [0,0]; }
                ["Min","Max"].map(function(suffix,i) {
                    var input = document.createElement("input");
                    input.setAttribute("name",name+suffix);
                    ["min","max","step"].map(function(a) {
                        if (a in options) { input.setAttribute(a,options[a]); }
                    });
                    input.setAttribute("value",val[i]);
                    ctrls.push(input);
                });
                // TODO: associate Min.max with Max.value & Max.min with Min.value
                break;*/
            case "text":
            default:
                var input = document.createElement("input");
                input.setAttribute("name",name);
                input.setAttribute("type","text");
                if ("length" in options) { input.setAttribute("maxlength",options["length"]); }
                if (typeof val == "string") { input.value = val; }
                ctrls.push(input);
                main = input;
                break;
            }
            /*if ("value" in options) {
                var v = options["value"];
                if (["string","number"](typeof v)
                input.setAttribute("value",);
            }*/
            if ("optional" in options) {
                var checkbox = document.createElement("input");
                checkbox.setAttribute("name",name+"_enabled");
                checkbox.setAttribute("type","checkbox");
                checkbox.checked = options["optional"]===true;
                checkbox.addEventListener("change",function() {
                    if (this.checked) { input.removeAttribute("readonly"); }
                    else { input.setAttribute("readonly","readonly"); }
                });
                ctrls.unshift(checkbox);
            }
            ctrls.map(function(ctrl) { dd.appendChild(ctrl); });
        }
        list.appendChild(dd);
        return main;
    };

    this.hide = function(name) {
        for(var i=0;i<list.children.length;i++) {
            var e = list.children[i],
                field = e.getAttribute("kj-ui-field");
            if (field==name) { e.style.display = "none"; }
        }
    };
    this.show = function(name) {
        for(var i=0;i<list.children.length;i++) {
            var e = list.children[i],
                field = e.getAttribute("kj-ui-field");
            if (field==name) { e.style.display = "inline-block"; }
        }
    };
};


if (THREE==null) { return; } // Follow IDE need THREE.js
/*------------------------------------------------------------*\
 * Common Variables
\*------------------------------------------------------------*/
const radian = Math.PI / 180, defaultRange = 1;
var scene, meshes = [], material = null, animate = null;

/*------------------------------------------------------------*\
 * Mesh Viewer
\*------------------------------------------------------------*/
var frmDetail, frmDisplay, frmOutput;
var scene, meshes = [], material = null, animate = null;
var MeshViewerDB = {};
["color","material","animation"].map(function(t) { MeshViewerDB[t] = {}; });
window.kjGameUI.MeshViewer = {
"initialize": function(canvas,ui) {
    canvas = selectElement(canvas,HTMLCanvasElement);
    if (canvas==null) { throw "No canvas!"; }
    var renderer = new THREE.WebGLRenderer({
            "canvas": canvas,
            "alpha": true,
            "antialias": true
        }),
        camera = new THREE.OrthographicCamera(
            -defaultRange,defaultRange,
            defaultRange,-defaultRange,
            0.001,1000
        );

    var padding = 1.8, scaled = 0;
    var aspect = 1, scale = defaultRange;
    var resizeCanvas = function(w,h) {
        renderer.setSize(w,h);
        aspect = w / h;
        camera.left = -aspect * scale;
        camera.right = aspect * scale;
        camera.updateProjectionMatrix();
    };
    window.addEventListener("resize",(function(parent) {
        return function() {
            resizeCanvas(
                parent.offsetWidth,
                parent.offsetHeight
            );
        };
    })(canvas.parentNode));
    resizeCanvas(
        canvas.parentNode.offsetWidth,
        canvas.parentNode.offsetHeight
    );
    var cameraDegreeY = Math.PI / 4,
        cameraDegreeXZ = Math.PI / 4;
    var relocateCamera = function() {
        camera.position.set(
            Math.sin(cameraDegreeXZ),
            Math.sin(cameraDegreeY),
            Math.cos(cameraDegreeXZ)
        ).multiplyScalar(10);
        camera.lookAt(0,0,0);
        camera.top = scale;
        camera.left = -aspect * scale;
        camera.right = aspect * scale;
        camera.bottom = -scale;
        camera.updateProjectionMatrix();
    };

    // Mouse Control
    canvas.addEventListener("wheel",function(e) {
        if (e.wheelDeltaY==0) { return; }
        scale += (e.wheelDeltaY>0) ? -0.1 : 0.1;
        relocateCamera();
    });
    //canvas.setAttribute("oncontextmenu","return false;");
    var dragging = false, button = 0;
    canvas.addEventListener("mousedown",function(e) {
        if (typeof animate == "function") { return; }
        dragging = true;
        button = e.button;
    });
    canvas.addEventListener("mousemove",function(e) {
        if (typeof animate == "function") { return; }
        if (!dragging) { return; }
        var rotatey = e.movementX * 0.1 * radian,
            rotatex = e.movementY * 0.1 * radian;
        switch(button) {
        case 0:
            cameraDegreeXZ -= rotatey;
            cameraDegreeXZ %= Math.PI * 2;
            cameraDegreeY += rotatex;
            if (cameraDegreeY<-Math.PI/2) { cameraDegreeY = -Math.PI / 2; }
            if (cameraDegreeY>Math.PI/2) { cameraDegreeY = Math.PI / 2; }
            relocateCamera();
            break;
        case 2:
            meshes.map(function(m) { m.rotateY(rotatey); });
            break;
        default:
            break;
        }
    });
    canvas.addEventListener("mouseup",function(e) { dragging = false; });
    canvas.addEventListener("mouseleave",function(e) { dragging = false; });

    scene = new THREE.Scene();
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
    scene.add(grids);

    // Canvas Keyboard Control
    window.addEventListener("keydown",function(e) {
        if (dragging) { return; }
        if (e.target!=document.body) { return; }
        switch (e.key.toUpperCase()) {
        case "Q":
            cameraDegreeXZ = 0;
            cameraDegreeY = 0;
            break;
        case "W":
            cameraDegreeXZ = Math.PI / 2;
            cameraDegreeY = 0;
            break;
        case "E":
            grids.visible = !grids.visible;
            /*cameraDegreeXZ = 0;
            cameraDegreeY = Math.PI / 2;*/
            break;
        case "R":
            cameraDegreeXZ = Math.PI / 4;
            cameraDegreeY = Math.PI / 4;
            break;
        }
        relocateCamera();
    });

    var timer = null, mixers = [], tock = 0;
    var updateFrame = function(tick) {
        var delta = tick - tock;
        if (typeof animate == "function") { meshes.map(animate); }
        else if (animate instanceof THREE.AnimationClip) {
            mixers.map(function(m) {
                m.update(delta/1000);
            });
        }
        renderer.render(scene,camera);
        timer = _nextFrame(updateFrame);
        tock = tick;
    };
    updateFrame(0);

    var triggerShown = function(e) {
        if (e.target!=this) { return; }
        var clss = this.className.trim().split(" "),
            index = clss.indexOf("shown");
        if (index<0) { clss.push("shown"); }
        else { clss.splice(index,1); }
        this.className = clss.join(" ").trim();
    };

    if (ui==null) { ui = {}; }

    // frmDetail
    if ("detail" in ui) {
        frmDetail = new kjGameUI.Form(ui["detail"]);
        frmDetail.on("click",triggerShown);
        frmDetail.on("select",function() {
            if (!(this instanceof kjGameUI.Form)) { return; }
            var type = this.get("type"),
                variables = kjGenerator.select(type);
            if (variables!=null) {
                this.clear(["type","seed"]);
                this.hide("seed");
                for(var k in variables) {
                    if (k.charAt(0)=="_") {
                        if (k=="_seed") { this.show("seed"); }
                        continue;
                    }
                    var cfg = variables[k];
                    this.build(k,cfg);
                }
            }
        });
        frmDetail.clear();
        frmDetail.build("type",
            {
                "control": "select",
                "option": kjGenerator.list()
            },
            function(e) { frmDetail.trigger("select"); }
        );
        frmDetail.build("seed",
            {
                "control": "text",
                "optional": false,
                "value": "000000000000",
                "length": 12
            }
        );
        frmDetail.trigger("select");
    }

    // frmMaterial
    if ("display" in ui) {
        var mdb = MeshViewerDB["material"],
            cdb = MeshViewerDB["color"],
            adb = MeshViewerDB["animation"];
        frmDisplay = new kjGameUI.Form(ui["display"]);
        frmDisplay.on("click",triggerShown);
        var changeMaterial = function() {
            var style = frmDisplay.get("material");
            if (!(style in mdb)) { return; }
            var m = mdb[style],
                color = frmDisplay.get("color");
            color = (color in cdb) ? cdb[color] : 0xFFFFFF;
            if (typeof m == "function") { m = m.call(null,color); }
            if (!(m instanceof THREE.Material)) { return; }
            material = m;
            meshes.map(function(m) { m.material = material; });
        };
        frmDisplay.build("material",
            {
                "control": "select",
                "option": Object.keys(mdb),
            },
            function(e) { changeMaterial(); }
        );
        frmDisplay.build("color",
            {
                "control": "select",
                "option": Object.keys(cdb),
            },
            function(e) { changeMaterial(); }
        );
        changeMaterial();
        var anima = frmDisplay.build("animation",
            {
                "control": "select",
                "option": Object.keys(adb),
            },
            function(e) {
                var ani = frmDisplay.get("animation");
                if (!(ani in adb)) { return; }
                animate = adb[ani];
                if (animate instanceof THREE.AnimationClip) {
                    mixers.map(function(m) {
                        m.clipAction(animate).play();
                    });
                }
            }
        );
        frmDisplay.on("loadAnimation",function(skm) {
            var clips = skm.animations;
            if (clips==null) { return; }
            clips.map(function(c) {
                kjGameUI.MeshViewer.register("animation",c.name,c);
                var option = document.createElement("option");
                option.setAttribute("value",c.name);
                option.appendChild(document.createTextNode(c.name));
                anima.appendChild(option);
            });
            mixers.push(new THREE.AnimationMixer(skm));
        });
        frmDisplay.build("scale-size",
            {
                "control": "number",
                "min": 0, "max": 10, "step": 1,
                "value": 0
            },
            function(e) {
                scaled = this.value;
                // TODO: scale mesh
            }
        );
        
    }

    // frmSave
    if ("output" in ui) {
        frmOutput = new kjGameUI.Form(ui["output"]);
        frmOutput.on("click",triggerShown);
    }

    // btnGenerate
    if ("button" in ui) {
        var btn = selectElement(ui["button"],HTMLButtonElement);
        if (btn!=null) {
            btn.addEventListener("click",function() {
                var t = frmDetail.get("type"),
                    o = kjGenerator.select(t);
                if (o==null) { return; }
                var opt = {};
                for(var k in o) {
                    if (k.charAt(0)=="_") { continue; }
                    opt[k] = frmDetail.get(k);
                }
                if (frmDetail.get("seed_enabled")==true) {
                    opt["seed"] = frmDetail.get("seed");
                }
                var o = kjGenerator.generate(t,opt), r = 1, meshset = [];
                if (o instanceof THREE.Geometry) {
                    o.computeFaceNormals();
                    o.computeVertexNormals();
                    o.computeBoundingSphere();
                    r = o.boundingSphere.radius;
                    if (scaled>0) {
                        var ratio = scaled / (r*2);
                        o.vertices.map(function(v) { v.multiplyScalar(ratio); });
                    }
                    console.log("Triangle:",o.faces.length);
                    o = new THREE.Mesh(o,material);
                } else if (o instanceof THREE.SkinnedMesh) {
                    o.material = material;
                    o.material.skinning = true;
                    o.geometry.computeBoundingSphere();
                    r = o.geometry.boundingSphere.radius;
                    // Show Helper
                    if (o.skeleton!=null) {
                        var sk_helper = new THREE.SkeletonHelper(o);
                        sk_helper.material.linewidth = 3;
                        meshset.push(sk_helper);
                    }
                    // TODO: load animation
                    frmDisplay.trigger("loadAnimation",[o]);
                }
                if (!(o instanceof THREE.Mesh)) { return; }
                frmDetail.set("seed",kjGenerator.Seed);
                meshset.push(o);
                meshes.map(function(m) { scene.remove(m); });
                meshset.map(function(m) { scene.add(m); });
                meshes = meshset;
                scale = r*padding;
                relocateCamera();
            });
        }
    }
},

"register": function(type,name,data) {
    if (typeof type != "string") { return; }
    type = type.toLowerCase();
    if (typeof name != "string") { return; }
    if (type in MeshViewerDB) { MeshViewerDB[type][name] = data; }
},

"select": function(type,key,value) {
    switch(type.toLowerCase()) {
    case "detail":
        frmDetail.set(key,value);
        break;
    case "display":
        frmDisplay.set(key,value);
        break;
    case "output":
        break;
    default:
        break;
    }
},

"clear": function() {
    meshes.map(function(m) { scene.remove(m); });
},

"generate": function(type,mat,pivot,options) {
    var o = kjGenerator.generate(type,options);
    if (!(o instanceof THREE.Geometry)) { return; }
    o.computeFaceNormals();
    o.computeVertexNormals();
    //o.computeBoundingSphere();
    o = new THREE.Mesh(o,mat);
    o.position.set(pivot.x,pivot.y,pivot.z);
    scene.add(o);
    meshes.push(o);
    return o;
}

};

// Pre-define Color
kjGameUI.MeshViewer.register("color","Sea Blue",0x00AAFF);
kjGameUI.MeshViewer.register("color","Orange",0xFF4500);
kjGameUI.MeshViewer.register("color","Magical",0xBB00FF);
kjGameUI.MeshViewer.register("color","Blood Red",0xFF2255);
kjGameUI.MeshViewer.register("color","Emerald",0x00FFAA);
kjGameUI.MeshViewer.register("color","Pink",0xFF00AA);
kjGameUI.MeshViewer.register("color","Red",0xFF0000);
kjGameUI.MeshViewer.register("color","Green",0x00FF00);
kjGameUI.MeshViewer.register("color","Blue",0x0000FF);
kjGameUI.MeshViewer.register("color","Cyan",0x00FFFF);
kjGameUI.MeshViewer.register("color","Magenta",0xFF00FF);
kjGameUI.MeshViewer.register("color","Yellow",0xFFFF00);
kjGameUI.MeshViewer.register("color","Black",0x000000);
kjGameUI.MeshViewer.register("color","White",0xFFFFFF);

// Pre-define Material
kjGameUI.MeshViewer.register(
    "material",
    "Wireframe",
    function(color) {
        return new THREE.MeshBasicMaterial({
            "color": color,
            "wireframe": true
        });
    }
);
kjGameUI.MeshViewer.register(
    "material",
    "Solid",
    function(color) {
        return new THREE.MeshPhongMaterial({
            "side": THREE.DoubleSide,
            "flatShading": true,
            "color": color
        });
    }
);
kjGameUI.MeshViewer.register(
    "material",
    "Solid:VertexColor",
    new THREE.MeshPhongMaterial({
        "side": THREE.DoubleSide,
        "flatShading": true,
        "vertexColors": THREE.VertexColors
    })
);
kjGameUI.MeshViewer.register(
    "material",
    "Smooth:VertexColor",
    new THREE.MeshPhongMaterial({
        "side": THREE.DoubleSide,
        "flatShading": false,
        "vertexColors": THREE.VertexColors
    })
);
kjGameUI.MeshViewer.register(
    "material",
    "Crystal",
    function(color) {
        return new THREE.MeshPhongMaterial({
            "flatShading": true,
            "color": color,
            "opacity": (color==0x000000) ? 0.6 : 0.9,
            "transparent": true
        });
    }
);

// Pre-define Animation
kjGameUI.MeshViewer.register("animation","None",null);
kjGameUI.MeshViewer.register("animation","RotateY",function(m) {m.rotateY(Math.PI/400);});
kjGameUI.MeshViewer.register("animation","RotateZ",function(m) {m.rotateZ(Math.PI/400);});
/*kjGameUI.MeshViewer.register("animation","RotateZ",(function() {
    var mixers = {};
    function(m) {
        if (!(m.uuid in mixers)) {
            mixers[m.uuid] = new THREE.AnimationMixer(m);
        }
        var mixer = mixers[m.uuid];
        mixer.update(0.001);
    }
})());*/

/*------------------------------------------------------------*\
 * Mesh Builder
\*------------------------------------------------------------*/

/*------------------------------------------------------------*\
 * Animator
\*------------------------------------------------------------*/

})();