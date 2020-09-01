(function() {
if(!THREE) { throw "Error: No THREE.js!"; }

const UNIT = 0.05,
    DEF_EDGES = 6,
    Y_FACTOR = 0.001,
    STEM_MAXIMUM = 5,
    STEM_RADIUS = 100;

function CoordSys(v3) {
    this.z = v3.clone().normalize();
    if (v3.x==0 && v3.z==0) {
        this.x = new THREE.Vector3(1,0,0);
        this.y = new THREE.Vector3(0,0,1);
    } else {
        this.x = new THREE.Vector3(v3.z,0,-v3.x).normalize();
        this.y = new THREE.Vector3().crossVectors(this.x,this.z).normalize();
    }
};
CoordSys.prototype.polar = function(radian,radius) {
    var x = this.x.clone(), y = this.y.clone();
    return x.multiplyScalar(Math.cos(radian)*radius).add(
        y.multiplyScalar(Math.sin(radian)*radius));
};

function alignCircle(v,bot,top) {
    const edge = top.length;
    var off = 0, min = 1000;
    for(var o=0;o<edge;o++) {
        var d = 0;
        for(var i=0;i<edge;i++) {
            var ti = (o+i) % edge,
                pi = (o+i+edge-1) % edge;
            d += v[bot[i]].distanceToSquared(v[top[pi]])
                + v[bot[i]].distanceToSquared(v[top[ti]]);
        }
        if (d<min) {
            min = d;
            off = o;
        }
    }
    return off;
};

function Tree(edges) {
    this.top_vertex = new THREE.Vector3(0,0,0);
    this.radius = 500;
    this.edges = (edges==null) ? DEF_EDGES : edges;
    //this.radian = MATH.PI * 2 / edges;
    this.geometry = new THREE.Geometry();
    this.node = new Stem(this,new THREE.Vector3(0,1,0));

    this.moveVertices = (function(vertices) {
        return function(v3) {
            return function(i) { vertices[i].add(v3); };
        };
    })(this.geometry.vertices);
    this.moveVerticesByFunction = (function(vertices) {
        return function(f) {
            return function(i) {
                var v3 = f(i,vertices[i]);
                vertices[i].add(v3);
            };
        };
    })(this.geometry.vertices);
};
Tree.prototype.grow = function() {
    this.node.prime(1000);
    this.geometry.verticesNeedUpdate = true;
    this.geometry.elementsNeedUpdate = true;
    this.geometry.computeFaceNormals();
    this.geometry.computeBoundingBox();
};
Tree.prototype.size = function() {
    var v = this.geometry.boundingBox.max;
    return Math.max(v.x,v.y,v.z);
};

function Stem(parent,dir) {
    this.parent = parent;
    this.tree = (parent instanceof Tree) ? parent : parent.tree;
    this.system = new CoordSys(dir);
    this.child = null;

    this.size = 1;
    this.radius = 1;
    var edges = this.tree.edges,
        geo = this.tree.geometry,
        rad = Math.PI * 2 / edges,
        dif = Math.random() * 0.5;

    this.bot_indices = [];
    this.bot_vertex = parent.top_vertex;
    for(var i=0;i<edges;i++) {
        this.bot_indices.push(geo.vertices.length);
        var v3 = this.system.polar((i+dif)*rad,UNIT*0.5)
            .add(this.bot_vertex);
        geo.vertices.push(v3);
    }

    this.top_indices = [];
    this.top_vertex = this.system.z.clone()
        .multiplyScalar(UNIT)
        .add(this.bot_vertex);
    var top = geo.vertices.length;
    this.top_indices.push(top);
    geo.vertices.push(this.top_vertex);
    this.faces = [];
    for(var i=0;i<edges;i++) {
        var n = (i+1) % edges;
        this.faces.push(geo.faces.length);
        geo.faces.push(new THREE.Face3(
            top,
            this.bot_indices[n],
            this.bot_indices[i]
        ));
    }
};
Stem.prototype.expand = function() {
    var grow = this.system.z.clone().add(
            this.system.polar(Math.random()*Math.PI*2,0.1)
        ).add(new THREE.Vector3(0,Y_FACTOR,0)).normalize();
    this.child = new Stem(this,grow);
    var d = this.radian - this.child.radian,
        di = alignCircle(
            this.tree.geometry.vertices,
            this.bot_indices,
            this.child.bot_indices),
        edges = this.tree.edges,
        faces = this.tree.geometry.faces;
    this.top_indices = [];
    for(var i=0;i<edges;i++) {
        var fi = this.faces[i],
            ci = (di+i) % edges,
            pi = (di+i+edges-1) % edges;
        faces[fi].a = this.child.bot_indices[ci];
        this.faces.push(faces.length);
        faces.push(new THREE.Face3(
            this.child.bot_indices[pi],
            this.child.bot_indices[ci],
            faces[fi].c
        ));
        this.top_indices.push(faces[fi].a);
    }
};
Stem.prototype.move = function(v3) {
    var fv = this.tree.moveVertices(v3);
    this.bot_vertex.add(v3);
    this.bot_indices.map(fv);
    this.top_vertex.add(v3);
    this.top_indices.map(fv);
    if (this.child!=null) { this.child.move(v3); }
};
Stem.prototype.prime = function(energy) {
    if (energy<=0) { return; }
    var used = 0;
    var vertices = this.tree.geometry.vertices,
        vf = function(c,u) {
            return function(i) {
                var r = u;//*Math.random();
                var d = vertices[i].clone()
                    .sub(c).normalize()
                    .multiplyScalar(r);
                vertices[i].add(d);
            };
        };
    if (this.radius<this.parent.radius) {
        var radius_unit = UNIT / 6;
        if (this.radius>STEM_RADIUS) { radius_unit /= 2; }
        used++;
        this.radius++;
        this.bot_indices.map(vf(this.bot_vertex,radius_unit));
    }

    var dir = this.system.z.clone().multiplyScalar(UNIT);
    if (this.size<STEM_MAXIMUM) {
        used++;
        this.size++;
        this.top_vertex.add(dir);
    } else if (this.child!=null) {
        if (this.size<STEM_MAXIMUM*2) {
            used++;
            this.size++;
            this.child.move(dir);
        }
        this.child.prime(energy-used);
    } else { this.expand(); }
};

window.kjTree = Tree;


})();