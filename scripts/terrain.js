(function() {

if (THREE==null) { return; }
if (kjGenerator==null) { return; }

/*if (THREE==null) {
    console.log("Three.js not loaded.");
    return;
}

window.kjGame3D = window.kjGame3D || {};
window.kjGame3D.Terrain = {};


window.kjGame3D.Terrain.Surface = function(x_size,z_size) {
    this.heights = [];
    this.size = x_size * z_size;
    this.x = x_size;
    this.z = z_size;

    
};*/

function rollm() { return Math.random()*2 - 1; }

function Surface(xs,zs) {
    this.sizeX = xs;
    this.sizeZ = zs;
    this.size = xs * zs;
    this.clear();
}
Surface.prototype.clear = function(height) {
    if (isNaN(height)) { height = 0; }
    this.map = [];
    for(var i=0;i<this.size;i++) { this.map.push(height); }
    this.heightMax = height;
    this.heightMin = height;
};
Surface.prototype.set = function(x,z,height) {
    var idx = z * this.sizeX + x;
    if (z<0 || z>=this.sizeZ) { return; }
    if (x<0 || x>=this.sizeX) { return; }
    if (height>this.heightMax) { this.heightMax = height; }
    if (height<this.heightMin) { this.heightMin = height; }
    this.map[idx] = height;
};
Surface.prototype.get = function(x,z) {
    var idx = z * this.sizeX + x;
    if (z<0 || z>=this.sizeZ) { return null; }
    if (x<0 || x>=this.sizeX) { return null; }
    return this.map[idx];
};
Surface.prototype.modify = function(modifier) {
    for(var z=0;z<this.sizeZ;z++) {
        for(var x=0;x<this.sizeX;x++) {
            var m = modifier(x,z,this.get(x,z));
            if (m==null) { continue; }
            this.set(x,z,m);
        }
    }
};
Surface.prototype.toGeometry = function(pt) {
    var g = new THREE.Geometry();
    if (typeof pt != "function") {
        pt = function(x,h,z) {
            return new THREE.Vector3(x,h,z);
        };
    }
    var halfX = (this.sizeX-1) / 2,
        halfZ = (this.sizeZ-1) / 2;
    for(var z=0;z<this.sizeZ;z++) {
        for(var x=0;x<this.sizeX;x++) {
            var idx = z * this.sizeX + x;
            g.vertices.push(pt(x-halfX,this.map[idx],z-halfZ));
            if (x*z!=0) {
                g.faces.push(new THREE.Face3(
                    idx, idx-this.sizeX, idx-this.sizeX-1
                ));
                g.faces.push(new THREE.Face3(
                    idx, idx-this.sizeX-1, idx-1
                ));
            }
        }
    }
    return g;
};


/*------------------------------------------------------------*\
 * Diamond-Square Terrain
\*------------------------------------------------------------*/
kjGenerator.register(
"Surface (Diamond-Square)",
{
    "_seed": true,
    "size": {"control":"number","min":5,"max":10,"step":1,"value":8},
    "seqments": {"control":"number","min":2,"max":10,"step":1,"value":4},
    "maximum": {"control":"number","min":1,"max":5,"step":0.1,"value":3},
    "minimum": {"control":"number","min":-5,"max":1,"step":0.1,"value":0}
},
function(options) {
    const real = parseInt(options["size"]),
        last = Math.pow(2,parseInt(options["seqments"])),
        side = last + 1;
    var map = new Surface(side,side);
    var square = function(x,z,s) {
        var avg = 0, count = 0;
        [[-s,-s],[s,-s],[s,s],[-s,s]].map(function(d) {
            var h = map.get(x+d[0],z+d[1]);
            if (h===null) { return; }
            avg += h;
            count++;
        });
        return avg / count;
    };
    var diamond = function(x,z,s) {
        var avg = 0, count = 0;
        [[0,-s],[s,0],[0,s],[-s,0]].map(function(d) {
            var h = map.get(x+d[0],z+d[1]);
            if (h===null) { return; }
            avg += h;
            count++;
        });
        return avg / count;
    };

    var divide = function(size,roll) {
        var x, z, half = size / 2;
        if (half<1) { return; }
        for(z=half;z<side;z+=size) {
            for(x=half;x<side;x+=size) {
                var v = square(x,z,half) + roll() * size;
                map.set(x,z,v);
            }
        }
        for(z=0;z<side;z+=half) {
            for(x=(z+half)%size;x<side;x+=size) {
                var v = diamond(x,z,half) + roll() * size;
                map.set(x,z,v);
            }
        }
        divide(size/2,roll);
    };
    var initialize = function(size,roll) {
        map.clear();
        map.set(0,0,roll()*last);
        map.set(0,last,roll()*last);
        map.set(last,0,roll()*last);
        map.set(last,last,roll()*last);
    };
    initialize(last,rollm);
    divide(last,rollm);
    /*var mapMax = map.heightMax;
    map.modify(function(x,z,h) {
        var dx = x-((map.sizeX-1)/2),
            dz = z-((map.sizeZ-1)/2),
            d = Math.sqrt(dx*dx + dz*dz);
        if (d>4) { return h; }
        return h + (4-d)/2*mapMax;
    });*/

    var grid = real / last,
        min = parseFloat(options["minimum"]),
        max = parseFloat(options["maximum"]),
        base = Math.min(min,max),
        range = Math.max(min,max) - base,
        mapRange = map.heightMax - map.heightMin,
        mapBase = map.heightMin;
    return map.toGeometry(function(x,h,z) {
        return new THREE.Vector3(
            x * grid,
            (h-mapBase) * range / mapRange + base,
            z * grid
        );
    });
});


/*------------------------------------------------------------*\
 * Sedimentation Terrain
\*------------------------------------------------------------*/
function sedimentate(range,diff) {
    const r2 = range * 1.5 * range * 1.5;
    var edge = range * 2 + 1,
        indices = [], kernel = [];
    for(var z=0;z<edge;z++) {
        for(var x=0;x<edge;x++) {
            var dz = z - range,
                dx = x - range,
                d2 = dx*dx + dz*dz;
            indices.push([dx,dz]);
            kernel.push((d2>r2)?0:1);
        }
    }
    return function(surface,x,z) {
        if (!(surface instanceof Surface)) {
            throw "Error: need Surface.";
            return;
        }
        var base = surface.get(x,z), results = [];
        indices.map(function(v2,i) {
            var w = kernel[i];
            if (w<=0) { return; }
            var px = x + v2[0],
                pz = z + v2[1],
                p = surface.get(px,pz);
            if (p===null) { return; }
            p *= w;
            if ((base-p)>diff) {
                results.push([px,pz]);
            }
        });
        return results;
    };
};
function smooth(surface,range) {
    const r2 = range * range * 1.5;
    var edge = range * 2 + 1,
        indices = [], kernel = [], average = 0;
    for(var z=0;z<edge;z++) {
        for(var x=0;x<edge;x++) {
            var dz = z - range,
                dx = x - range,
                d2 = dx*dx + dz*dz,
                weight = (r2-d2) / r2;
            indices.push([dx,dz]);
            if (d2>r2) {
                kernel.push(weight);
                average += weight;
            } else { kernel.push(0); }
        }
    }
    surface.modify(function(x,z,h) {
        var height = 0;
        indices.map(function(v2,i) {
            var d = surface.get(x+v2[0],z+v2[1]);
            if (d===null) { d = h; }
            height += kernel[i] * d;
        });
        
        return height / average;
    });
};
kjGenerator.register(
"Surface (Sedimentation)",
{
    "_seed":    true,
    "size":     {"control":"number","min":5,"max":10,"step":1,"value":8},
    "seqments": {"control":"number","min":2,"max":10,"step":1,"value":4},
    "maximum":  {"control":"number","min":1,"max":5,"step":0.1,"value":3},
    "minimum":  {"control":"number","min":-5,"max":1,"step":0.1,"value":0},
    "range":        {"control":"number","min":1,"max":3,"step":1,"value":1},
    "difference":   {"control":"number","min":1,"max":5,"step":1,"value":2},
    "motion":       {"control":"boolean"},
    "motion-angle": {"control":"number","min":0,"max":359,"step":1,"value":0},
    "motion-range": {"control":"number","min":0,"max":90,"step":5,"value":0}
},
function(options) {
    const real = parseInt(options["size"]),
        last = Math.pow(2,parseInt(options["seqments"])),
        side = last + 1;
    var map = new Surface(side,side),
        sed = sedimentate(
            parseInt(options["range"]),
            parseInt(options["difference"])
        );
    const times = 800;
    console.log(side*side,times);
    for(var i=0;i<times;i++) {
        var x = Math.floor(Math.random()*(side+1)),
            z = Math.floor(Math.random()*(side+1));
        var rs = sed(map,x,z);
        if (rs.length>0) {
            var v2 = rs[Math.floor(Math.random()*rs.length)];
            x = v2[0];
            z = v2[1];
        }
        map.set(x,z,map.get(x,z)+1);
    }
    smooth(map,2);
    for(var i=0;i<times;i++) {
        var x = Math.floor(Math.random()*side),
            z = Math.floor(Math.random()*side);
        var rs = sed(map,x,z);
        if (rs.length>0) {
            var v2 = rs[Math.floor(Math.random()*rs.length)];
            x = v2[0];
            z = v2[1];
        }
        map.set(x,z,map.get(x,z)+1);
    }
    smooth(map,2);
    var grid = real / last,
        min = parseFloat(options["minimum"]),
        max = parseFloat(options["maximum"]),
        base = Math.min(min,max),
        range = Math.max(min,max) - base,
        mapRange = map.heightMax - map.heightMin,
        mapBase = map.heightMin;
    return map.toGeometry(function(x,h,z) {
        return new THREE.Vector3(
            x * grid,
            (h-mapBase) * range / mapRange + base,
            z * grid
        );
    });
});

})();