(function() {

if (THREE==null) { return; }
if (kjGenerator==null) { return; }

var _rollByRange = function(o,k1,k2,floor) {
    var min = parseFloat(o[k1]), max = parseFloat(o[k2]);
    if (min==max) { return function() { return min; }; }
    var d = max - min;
    if (floor===true) { return function() { return Math.floor(Math.random()*d) + min; }; }
    return function() { return Math.random()*d + min; };
};


var _createLeafGenerator = function(points) {
    var supple = function(array,max) {
        var lost = max - array.length + 1,
            last = array.pop(),
            big = array[array.length-1],
            d = (last-big) / lost;
        for(var i=1;i<lost;i++) { array.push(big+i*d); }
        array.push(last);
    };
    var vertices = {
        "1": [1],
        "2": [0,2],
        "3": [1,0,2]
    };
    var pfs = [];
    points.map((function(faces) {
        var index = 0, last;
        return function(size,i) {
            if (i>0) {
                faces[size][last].map(function(f) {
                    pfs.push([f[0]+index,f[1]+index,f[2]+index]);
                });
            }
            last = size;
            index += size;
        };
    })({
        "1": {
            "2": [ [ 0,-2,-1] ],
            "3": [ [ 0,-2,-3],[0,-3,-1] ]
        },
        "2": {
            "1": [ [ 0,-1, 1] ],
            "3": [ [ 0,-2,-3],[ 0,-3, 1],[ 1,-3,-1] ]
        },
        "3": {
            "1": [ [ 1,-1, 0],[ 0,-1, 2] ],
            "2": [ [ 1,-2, 0],[ 0,-2,-1],[ 0,-1, 2] ],
            "3": [ [ 1,-2,-3],[ 1,-3, 0],[ 0,-3, 2],[-3,-1, 2] ]
        }
    }));;

    return function(maxlength,dir,pv,nv,widths,radians) {
        dir.normalize();
        if (widths.length<points.length) { supple(widths,points.length); }
        if (radians.length<points.length) { supple(radians,points.length); };
        var vs = [], fs = [],
            wd = [pv.normalize(),new THREE.Vector3(0,0,0),nv.normalize()],
            max = points.length;
        points.map(function(size,i) {
            var r = radians[i] * Math.PI / 180,
                w = widths[i] / 2,
                l = i / max * maxlength;
                cp = dir.clone().multiplyScalar(Math.sin(r)*l)
                    .add(new THREE.Vector3(0,Math.cos(r)*l,0)),
                c = vs.length;
            vertices[size].map(function(vi) {
                var v3 = cp.clone().add(wd[vi].clone().multiplyScalar(w));
                vs.push(v3);
            });
        });
        return {
            "vertices": vs,
            "faces": pfs.map(function(f) { return new THREE.Face3(f[0],f[1],f[2]); })
        };
    };
};

/*------------------------------------------------------------*\
 * Grass Type 1
\*------------------------------------------------------------*/
kjGenerator.register(
"Grass Type 1",
{
    "_seed": true,
    "base": {"control":"number","min":3,"max":8,"value":3},
    "height": {"control":"number","min":1,"max":4,"step":0.2,"value":2},
    "minimum": {"control":"number","min":0,"max":90,"step":1,"value":45},
    "maximum": {"control":"number","min":0,"max":90,"step":1,"value":60}
},
function(options) {
    const base = parseInt(options["base"]),
        height = parseFloat(options["height"]),
        radian = Math.PI * 2 / base,
        side = 2 * Math.sin(radian/2);
    var gravity = _rollByRange(options,"minimum","maximum",true);

    var g = new THREE.Geometry();
    for(var i=0;i<base;i++) {
        var r = radian * i;
        g.vertices.push(new THREE.Vector3(Math.cos(r),0,Math.sin(r)));
    }
    var ratio = [ 1,1,1 ], total = 0, cc = 0;
    ratio.map(function(r) { total+=r; });
    ratio = ratio.map(function(r) { cc += r; return cc/total; });
    for(var i=0;i<base;i++) {
        var ni = (i+1) % base,
            c = g.vertices[i],
            n = g.vertices[ni],
            r = radian * (i+0.5);

        var cp = new THREE.Vector3().addVectors(c,n).divideScalar(2),
            pv = c.clone().sub(cp).normalize(),
            nv = n.clone().sub(cp).normalize(),
            xv = new THREE.Vector3(Math.cos(r),0,Math.sin(r)),
            up = new THREE.Vector3(0,1,0);
        var ga = 0, max = ratio.length;
        var last = [ i, g.vertices.length, ni ];
        g.vertices.push(cp);
        for(var j=0;j<max;j++) {
            ga = gravity() * (Math.PI/180) * (j+1) / max;
            var index = g.vertices.length;
            var h = height * ratio[j], w = side * (1-ratio[j]) / 2;
            var step_cp = cp.clone()
                .add(xv.clone().multiplyScalar(Math.sin(ga)*h))
                .add(up.clone().multiplyScalar(Math.cos(ga)*h));
            switch(max-j) {
            case 1:
                g.vertices.push(step_cp);
                g.faces.push(new THREE.Face3(last[0],last[1],index));
                last = [];
                break;
            case 2:
                g.vertices.push(step_cp.clone().add(pv.clone().multiplyScalar(w)));
                g.vertices.push(step_cp.clone().add(nv.clone().multiplyScalar(w)));
                g.faces.push(new THREE.Face3(last[0],last[1],index));
                g.faces.push(new THREE.Face3(index,last[1],index+1));
                g.faces.push(new THREE.Face3(last[1],last[2],index+1));
                last = [ index, index+1 ];
                break;
            default:
                g.vertices.push(step_cp.clone());
                g.vertices.push(step_cp.clone().add(pv.clone().multiplyScalar(w)));
                g.vertices.push(step_cp.clone().add(nv.clone().multiplyScalar(w)));
                g.faces.push(new THREE.Face3(index+1,last[0],index));
                g.faces.push(new THREE.Face3(index,last[0],last[1]));
                g.faces.push(new THREE.Face3(index,last[1],last[2]));
                g.faces.push(new THREE.Face3(index,last[2],index+2));
                last = [ index+1, index, index+2 ];
            }
        }
    }

    g.faces.map(function(f) { f.color = new THREE.Color( 0x009900 ); });
    return g;
});

/*------------------------------------------------------------*\
 * Grass Type 2
\*------------------------------------------------------------*/
kjGenerator.register(
"Grass Type 2",
{
    "_seed": true,
    "base": {"control":"number","min":3,"max":8,"value":3},
    "root": {"control":"number","min":0,"max":0.5,"step":0.1,"value":0.2},
    "height": {"control":"number","min":1,"max":4,"step":0.2,"value":2},
    "width": { "control":"number","min":0.2,"max":4,"step":0.1,"value":0.3},
    "minimum": {"control":"number","min":0,"max":90,"step":1,"value":20},
    "maximum": {"control":"number","min":0,"max":90,"step":1,"value":80}
},
function(options) {
    const base = parseInt(options["base"]),
        h = parseFloat(options["height"]),
        w = parseFloat(options["width"]),
        radian = Math.PI * 2 / base,
        side = h * Math.sin(radian/2) * 2;
    var gravity = _rollByRange(options,"minimum","maximum",true),
        leaf = _createLeafGenerator([1,2,3,2,1]);

    var g = new THREE.Geometry();
    var putv = (function(zero) {
        return function(v3) {
            v3.add(zero);
            g.vertices.push(v3);
        };
    })(new THREE.Vector3(0,-parseFloat(options["root"]),0));
    var putf = function(color,index) {
        return function(f) {
            f.a += index;
            f.b += index;
            f.c += index;
            f.color = new THREE.Color(color);
            g.faces.push(f);
        };
    };
    for(var i=0;i<base;i++) {
        var r = radian * i;
        var lf = leaf(
            h,
            new THREE.Vector3(Math.cos(r),0,Math.sin(r)),
            new THREE.Vector3(Math.sin(r),Math.random()-0.5,-Math.cos(r)),
            new THREE.Vector3(-Math.sin(r),Math.random()-0.5,Math.cos(r)),
            [0,w],
            [0,parseFloat(options["minimum"]),gravity()]
        );
        var index = g.vertices.length;
        lf.vertices.map(putv);
        lf.faces.map(putf(0x009900,index));
    }

    return g;
});

/*------------------------------------------------------------*\
 * Stone Type 1
\*------------------------------------------------------------*/
kjGenerator.register(
"Stone Type 1",
{
    "_seed": true,
    "base": {"control":"number","min":3,"max":8,"value":5},
    "minimum": {"control":"number","min":0.1,"max":2,"step":0.1,"value":0.2},
    "maximum": {"control":"number","min":0.1,"max":4,"step":0.1,"value":0.5}
},
function(options) {
    var radius = _rollByRange(options,"minimum","maximum");
    var g = kjGenerator.generate("Crystal Pillar",{
        "base": parseInt(options["base"]),
        "height": 1,
        "ratio": 0.5,
        "twisted": true
    });
    g.vertices.map(function(v3) { v3.normalize().multiplyScalar(radius()); });
    return g;
});

/*------------------------------------------------------------*\
 * Tree Type 1
\*------------------------------------------------------------*/
kjGenerator.register(
"Tree Type 1",
{
    "sides":        {"control":"number","min":3,"max":8,"value":5},
    "trunk-height": {"control":"number","min":3,"max":16,"step":1,"value":4},
    "trunk-radius": {"control":"number","min":0.1,"max":4,"step":0.1,"value":0.4},
    "leaf-layer":   {"control":"number","min":1,"max":5,"step":1,"value":4},
    "leaf-radius":  {"control":"number","min":0.5,"max":6,"step":0.5,"value":1},
    "leaf-area":    {"control":"number","min":0.1,"max":0.8,"step":0.05,"value":0.8}
},
function(options) {
    const sides = parseInt(options["sides"]),
        th = parseFloat(options["trunk-height"]),
        tr = parseFloat(options["trunk-radius"]),
        layers = parseInt(options["leaf-layer"]),
        llr = parseFloat(options["leaf-radius"]) / layers,
        llh = th * parseFloat(options["leaf-area"]) / layers;

    const radian = Math.PI * 2 / sides;

    var g = new THREE.Geometry();

    // Trunk
    g.vertices.push(new THREE.Vector3(0,th,0));
    for(var i=0;i<sides;i++) {
        var r = radian * i;
        g.vertices.push(new THREE.Vector3(Math.cos(r)*tr,0,Math.sin(r)*tr));
        var face = new THREE.Face3(0,(i+1)%sides+1,i+1);
        face.color = new THREE.Color( 0x887722 );
        g.faces.push(face);
    }

    // Leaf
    for(var l=0;l<layers;l++) {
        var top = 0,
            up = th - llh * (l-0.5),
            down = th - llh * (l+1);
        if (l>0) {
            top = g.vertices.length;
            g.vertices.push(new THREE.Vector3(0,up,0));
        }
        var idx = g.vertices.length;
        for(var i=0;i<sides;i++) {
            var r = radian * i;
            g.vertices.push(new THREE.Vector3(
                Math.cos(r)*llr*(l+1),
                down,
                Math.sin(r)*llr*(l+1)
            ));
            [   new THREE.Face3(top,idx+(i+1)%sides,idx+i),
                new THREE.Face3(top,idx+i,idx+(i+1)%sides)
            ].map(function(face) {
                face.color = new THREE.Color( 0x009900 );
                g.faces.push(face);
            });
        }
    }

    return g;
});

/*------------------------------------------------------------*\
 * Tree Type 2
\*------------------------------------------------------------*/
kjGenerator.register(
"Tree Type 2",
{
    "_seed": true,
    "sides": {"control":"number","min":3,"max":8,"value":5},
    "trunk-height": {"control":"number","min":3,"max":16,"step":1,"value":3},
    "trunk-radius": {"control":"number","min":0.1,"max":4,"step":0.1,"value":0.2},
    "trunk-section": {"control":"number","min":3,"max":16,"step":1,"value":6},
    "leaf-section": {"control":"number","min":1,"max":4,"step":1,"value":1},
    "leaf-radius": {"control":"number","min":1,"max":6,"step":0.5,"value":2.5}
},
function(options) {
    const sides = parseInt(options["sides"]),
        th = parseFloat(options["trunk-height"]),
        tr = parseFloat(options["trunk-radius"]),
        sections = parseInt(options["trunk-section"]),
        minleaf = sections - parseInt(options["leaf-section"]),
        llf = parseFloat(options["leaf-radius"]) / sections,
        tlh = th / sections;

    const radian = Math.PI * 2 / sides;

    var g = new THREE.Geometry();
    var putv = function(zero) {
        return function(v3) {
            v3.add(zero);
            g.vertices.push(v3);
        };
    };
    var putf = function(color,index) {
        return function(f) {
            f.a += index;
            f.b += index;
            f.c += index;
            f.color = new THREE.Color(color);
            g.faces.push(f);
        };
    };

    var leaf = _createLeafGenerator([1,2,3,3,1]);
    for(var s=0;s<sections;s++) {
        var bot = g.vertices.length, idx = bot + 1;
        g.vertices.push(new THREE.Vector3(0,tlh*(s-1.5),0));
        // Trunk
        for(var i=0;i<sides;i++) {
            var r = radian * i;
            g.vertices.push(new THREE.Vector3(
                Math.cos(r)*tr,
                tlh*(s+1),
                Math.sin(r)*tr
            ));
            var face = new THREE.Face3(bot,idx+i,idx+(i+1)%sides);
            face.color = new THREE.Color(0x887722);
            g.faces.push(face);
        }
        if (s<minleaf) { continue; }
        // Leaf
        idx += sides;
        var rr = Math.random();
        for(var i=0;i<sides;i++) {
            var r = radian * (i+rr);
            var lf = leaf(
                (s+1) * llf,
                new THREE.Vector3(Math.cos(r),0,Math.sin(r)),
                new THREE.Vector3(Math.sin(r),0.1,-Math.cos(r)),
                new THREE.Vector3(-Math.sin(r),0.1,Math.cos(r)),
                [0,tr*(s+1)],
                [0,30,80+Math.random()*10]
            );
            lf.vertices.map(putv(new THREE.Vector3(0,tlh*(s+0.5),0)));
            lf.faces.map(putf(0x009900,idx+i*lf.vertices.length));
        }
    }

    return g;
});

/*------------------------------------------------------------*\
 * Storm
\*------------------------------------------------------------*/
kjGenerator.register(
"Storm",
{
    "turns": {"control":"number","min":1,"max":6,"value":3},
    "height": {"control":"number","min":4,"max":10,"step":1,"value":4},
    "angle": {"control":"number","min":20,"max":45,"step":5,"value":30},
    "outer": {"control":"number","min":2,"max":8,"step":1,"value":3},
    "inner": {"control":"number","min":0.1,"max":2,"step":0.1,"value":1},
},
function(options) {
    const h = parseInt(options["height"]),
        a = parseFloat(options["angle"]) * Math.PI / 180,
        t = parseInt(options["turns"]),
        ohb = h * Math.sin(a) / t,
        ph = (h-ohb) / t,
        or = parseFloat(options["outer"]) / t,
        ir = parseFloat(options["inner"]) / t;

    var g = new THREE.Geometry(),
        lastbone = new THREE.Bone(), bones = [lastbone];
    lastbone.name = "Root";
    for(var i=0;i<t;i++) {
        var tor = or * (i+1), tir = ir * (i+1),
            sides = Math.min(6,i+4),
            radian = Math.PI * 2 / sides,
            index = g.vertices.length;
        for(var s=0;s<sides;s++) {
            var rad = radian * s;
            g.vertices.push(new THREE.Vector3(
                tir * Math.sin(rad),
                ph * (i+s/sides),
                tir * Math.cos(rad)
            ));
            g.vertices.push(new THREE.Vector3(
                tor * Math.sin(rad),
                ph * (i+s/sides) + ohb,
                tor * Math.cos(rad)
            ));
            if ((i+s) > 0) {
                var idx = index + s * 2;
                g.faces.push(new THREE.Face3(idx-2,idx-1,idx+1));
                g.faces.push(new THREE.Face3(idx-2,idx+1,idx-1));
                g.faces.push(new THREE.Face3(idx,idx+1,idx-2));
                g.faces.push(new THREE.Face3(idx,idx-2,idx+1));
            }
        }
        var bone = new THREE.Bone();
        bone.name = "Section" + (i+1);
        bone.position.y = ph;
        lastbone.add(bone);
        bones.push(bone);
        lastbone = bone;
    }
    g.computeFaceNormals();
    g.computeVertexNormals();

    // Convert to Skinned Mesh
    var bf = new THREE.BufferGeometry().fromGeometry(g),
        mt = new THREE.MeshBasicMaterial({"color":0xFFFFFF}),
        skin_indices = [], skin_weights = [],
        temp_position = bf.attributes.position,
        temp_vertex = new THREE.Vector3();
    for(var i=0;i<temp_position.count;i++) {
        temp_vertex.fromBufferAttribute(temp_position,i);
        var y = temp_vertex.y,
            bone = Math.floor(y/ph),
            weight = (y%ph) / ph;
        skin_indices.push(bone,bone+1,0,0);
        skin_weights.push(1-weight,weight,0,0);
    }
    bf.setAttribute("skinIndex",new THREE.Uint16BufferAttribute(skin_indices,4));
    bf.setAttribute("skinWeight",new THREE.Float32BufferAttribute(skin_weights,4));
    var skeleton = new THREE.Skeleton(bones),
        sk = new THREE.SkinnedMesh(bf,mt);
    sk.add(skeleton.bones[0]);
    sk.bind(skeleton);

    // Rotate Animation
    const dura = 1, div = 5, half = div / 2, sm = 0.5;
    var r = Math.PI * 2 / div, timeline = [], rotated = [], scaled = [];
    for(var i=0;i<=div;i++) {
        timeline.push(i/div*dura);
        rotated.push(i*Math.PI*2/div);
        var m = half - Math.abs(i-half);
        scaled.push(1+(m/Math.floor(half)*sm));
    }
    sk.animations = [new THREE.AnimationClip("Rotating",dura,[
        new THREE.NumberKeyframeTrack(".rotation[y]",timeline,rotated),
        new THREE.NumberKeyframeTrack(".scale[x]",timeline,scaled),
        new THREE.NumberKeyframeTrack(".scale[z]",timeline,scaled),
        new THREE.NumberKeyframeTrack(".skeleton.bones[1].scale[y]",timeline,scaled)
    ])];

    return sk;
});

/*------------------------------------------------------------*\
 * Crystal Pillar
\*------------------------------------------------------------*/
kjGenerator.register(
"Crystal Pillar",
{
    "base": {"control":"number","min":3,"max":6,"value":4},
    "height": {"control":"number","min":4,"max":10,"step":1,"value":6},
    "ratio": {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.4},
    "twisted": {"control":"boolean"}
},
function(options) {
    const base = parseInt(options["base"]),
        height = parseFloat(options["height"]),
        middle = height * parseFloat(options["ratio"]),
        twisted = options["twisted"]===true;

    var g = new THREE.Geometry();
    const r = Math.PI * 2 / base, h2 = height / 2, m2 = middle / 2;
    for(var s=0;s<base;s++) {
        var radian = r * s;
        g.vertices.push(
            new THREE.Vector3(Math.sin(radian),m2,Math.cos(radian))
        );
    }
    if (middle>0) {
        for(var s=0;s<base;s++) {
            var radian = r * s + (twisted?(r/2):0);
            g.vertices.push(
                new THREE.Vector3(Math.sin(radian),-m2,Math.cos(radian))
            );
            g.faces.push(new THREE.Face3(s     , s        +base,(s+1)%base));
            g.faces.push(new THREE.Face3(s+base,(s+1)%base+base,(s+1)%base));
        }
    }
    if (height>middle) {
        var index = g.vertices.length;
        g.vertices.push(new THREE.Vector3(0,h2,0));
        g.vertices.push(new THREE.Vector3(0,-h2,0));
        var extend = (middle==0) ? 0 : base;
        for(var s=0;s<base;s++) {
            g.faces.push(new THREE.Face3(index,s,(s+1)%base));
            g.faces.push(new THREE.Face3(index+1,(s+1)%base+extend,s+extend));
        }
    }

    return g;
});


if (kjGame3D==null || kjGame3D.Polyhedron==null) { return; }
/*------------------------------------------------------------*\
 * Crystal Shard : need Polyhedron
\*------------------------------------------------------------*/
kjGenerator.register(
"Crystal Shard",
{
    "_seed": true,
    "base": {"control":"number","min":3,"max":6,"value":4},
    "height": {"control":"number","min":2,"max":6,"step":0.25,"value":3.5}
},
function(options) {
    const cut = Math.floor(Math.random()*6) + 3,
        height = options["height"];

    options["ratio"] = 0.4;
    options["twisted"] = true;
    var poly = new kjGame3D.Polyhedron(
        kjGenerator.generate("Crystal Pillar",options)
    );
    for(var i=0;i<cut;i++) {
        var upper = Math.PI * 2 * (i+(Math.random()*-0.2)+0.1) / cut,
            lower = upper + Math.PI / cut;
        poly.cut(new THREE.Plane(new THREE.Vector3(
            Math.cos(upper),
            Math.random() * -2 / height,
            Math.sin(upper)
        ),0.6));
        poly.cut(new THREE.Plane(new THREE.Vector3(
            Math.cos(lower),
            Math.random() * 2 / height,
            Math.sin(lower)
        ),0.6));
    }
    var newfaces = [], crystal = poly.toGeometry();
    crystal.faces.map(function(f) {
        newfaces.unshift(new THREE.Face3(f.a,f.c,f.b));
        newfaces.push(f);
    });
    crystal.faces = newfaces;
    return crystal;
});


})();