(function() {
if(!THREE) { throw "Error: No THREE.js!"; }

const UNIT = 0.05,
    RADIUS_UNIT = UNIT * 0.05,
    DEF_EDGES = 6,
    Y_FACTOR = 0.05,
    STEM_MAXIMUM = 5,
    JOINT_EGO = 50;
    
const STEM_SIZE = 10,
    STEM_RADIUS = 2,
    STEM_RATIO = 10,
    BRANCH_SIZE = 20,
    RANDOM_FACTOR = 0.05;

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
CoordSys.prototype.random = function(radius) {
    return this.z.clone().add(
        this.polar(Math.random()*2*Math.PI,radius)
    );
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

function roll(min,max) {
    var base = Math.min(min,max),
        range = Math.max(min,max) - base;
    return Math.floor(Math.random()*range) + base;
};

function rollf(min,max) {
    var base = Math.min(min,max),
        range = Math.max(min,max) - base;
    return function() {
        return Math.floor(Math.random()*range) + base;
    };
};

/*------------------------------------------------------------*\
 * Branch
\*------------------------------------------------------------*/
function Branch(tree,pos,dir,options) {
    this.tree = tree;
    this.position = pos;
    this.stems = [];
    this.end = new BranchEnd(tree,pos);

    this.rollStemSize = rollf(STEM_SIZE,STEM_SIZE+10);

    var size_min = BRANCH_SIZE,
        size_max = BRANCH_SIZE + 5;
    if ("lengthMinimum" in options) { size_min = options["lengthMinimum"]; }
    if ("lengthMaximum" in options) { size_max = options["lengthMaximum"]; }
    if ("length" in options) {
        size_min = options["length"];
        size_max = options["length"];
    }
    this.sizeLimit = roll(size_min,size_max);

    var radius_min = STEM_RADIUS,
        radius_max = Math.floor(STEM_RADIUS*1.5);
    if ("radiusMinimum" in options) { radius_min = options["radiusMinimum"]; }
    if ("radiusMaximum" in options) { radius_max = options["radiusMaximum"]; }
    if ("radius" in options) {
        radius_min = options["radius"];
        radius_max = options["radius"];
    }
    this.radiusLimit = roll(radius_min,radius_max);

    this.stems.push(new Stem(this,dir));
};
Branch.prototype.prime = function(energy) {
    if (energy<=0) { return; }
    var size = this.stems.length,
        last = size - 1,
        radius = this.radiusLimit,
        movement = new THREE.Vector3(0,0,0),
        grown = false;
    for(var i=0;i<size;i++) {
        var stem = this.stems[i];
        stem.move(movement);
        movement.add(stem.grow(radius));
        //radius = stem.radius * 0.98;
        energy--;
        if (i==last) { grown = stem.size >= stem.sizeLimit; }
        if (energy<=0) { break; }
    }
    this.end.move(movement);
    if (grown && energy>0) {
        var parent = this.stems[last];
        if (size<this.sizeLimit) {
            var stem = new Stem(this,parent.system.random(RANDOM_FACTOR));
            this.stems.push(stem);
            parent.weave(stem.nodes);
        } else if (this.end instanceof BranchEnd) {
            // TODO: make Joint
            this.end = new Joint(this,parent.system.z);
        } else { this.end.prime(energy); }
    }
};
Branch.prototype.move = function(v3) {
    this.stems.map(function(stem) { stem.move(v3); });
    this.end.move(v3);
};

function BranchEnd(tree,pos) {
    this.tree = tree;
    this.position = pos.clone();
    this.index = tree.geometry.vertices.length;
    tree.geometry.vertices.push(this.position);
};
BranchEnd.prototype.move = function(v3) {
    this.position.add(v3);
};


/*------------------------------------------------------------*\
 * Joint
\*------------------------------------------------------------*/
function Joint(branch,dir) {
    this.system = new CoordSys(dir);
    this.position = branch.end.position;
    this.index = branch.end.index;
    this.lastStem = branch.stems[branch.stems.length-1];

    this.nodes = [];
    this.children = [];

    var base = this.lastStem.position,
        radius = this.lastStem.radius,
        edges = branch.tree.edges,
        radian = Math.PI * 2 / edges;

    this.children.push(new Branch(branch.tree,
        this.position.clone().add(this.system.z.clone().multiplyScalar(UNIT)),
        this.system.z, {
            "radius": branch.radiusLimit,
            //"radius": radius,
            //"length": branch.sizeLimit
        }
    ));

    const side = 2, gap = edges / 2;
    var s = 0;//roll(0,edges);
    for(var i=0;i<side;i++) {
        var d = this.system.polar(s*radian,radius);
        this.children.push(new Branch(branch.tree,
            this.position.clone().add(d),
            d.add(new THREE.Vector3(0,UNIT*0.5,0))
                .add(this.system.z.clone().multiplyScalar(UNIT*0.5)),
            {
                "radius": branch.radiusLimit * 0.5,
                //"radius": radius * 0.5,
                //"length": branch.sizeLimit * 0.5
            }
        ));
        s = (s+gap) % edges;
    }
};
Joint.prototype.move = function(v3) {
    this.children.map(function(c) { c.move(v3); });
};
Joint.prototype.prime = function(energy) {
    var e = energy / this.children.length,
        r = this.lastStem.radius;
    this.children.map(function(c,i) {
        //c.radiusLimit = (i==0) ? r : r * 0.5;
        c.prime(e);
    });
};


/*------------------------------------------------------------*\
 * Stem
\*------------------------------------------------------------*/
function Stem(branch,dir) {
    this.geometry = branch.tree.geometry;
    this.system = new CoordSys(dir);
    this.branch = branch;
    this.position = branch.end.position.clone();
    this.size = 0;
    this.sizeLimit = branch.rollStemSize() * UNIT;
    this.radius = RADIUS_UNIT;
    this.nodes = [];
    this.skin = [];

    var vertices = this.geometry.vertices,
        faces = this.geometry.faces,
        edges = branch.tree.edges,
        radian = Math.PI * 2 / edges
        radius = UNIT * 0.5,
        end = branch.end.index,
        begin = vertices.length;
    for(var i=0;i<edges;i++) {
        vertices.push(
            this.position.clone().add(
                this.system.polar(i*radian,radius)
            )
        );
        this.nodes.push(begin+i);
        this.skin.push(faces.length);
        faces.push(new THREE.Face3(end,begin+(i+1)%edges,begin+i));
    }
};
Stem.prototype.move = function(v3) {
    var vertices = this.geometry.vertices;
    this.nodes.map(function(vi) { vertices[vi].add(v3); });
};
Stem.prototype.weave = function(nodes) {
    var vertices = this.geometry.vertices,
        faces = this.geometry.faces,
        edges = this.branch.tree.edges,
        offset = alignCircle(vertices,this.nodes,nodes);
    for(var i=0;i<edges;i++) {
        var fi = this.skin[i],
            ci = (offset+i) % edges,
            pi = (offset+i+edges-1) % edges;
        faces[fi].a = nodes[ci];
        this.skin.push(faces.length);
        faces.push(new THREE.Face3(nodes[pi],nodes[ci],faces[fi].c));
    }
};
Stem.prototype.grow = function(max) {
    if (this.size<this.sizeLimit) {
        var ratio = this.size / this.radius;
        if(ratio<STEM_RATIO) {
            this.size += UNIT;
            return this.system.z.clone().multiplyScalar(UNIT);
        }
    }
    if (this.radius<max) {
        this.radius += RADIUS_UNIT;
        var center = this.position,
            vertices = this.geometry.vertices;
        this.nodes.map(function(vi) {
            var v = vertices[vi],
                d = v.clone().sub(center).normalize().multiplyScalar(RADIUS_UNIT);
            v.add(d);
        });
    }
    return new THREE.Vector3(0,0,0);
};


/*------------------------------------------------------------*\
 * Tree
\*------------------------------------------------------------*/
function Tree(edges) {
    this.edges = (edges==null) ? DEF_EDGES : edges;
    this.geometry = new THREE.Geometry();

    this.position = new THREE.Vector3(0,0,0);
    this.trunk = new Branch(this,this.position,new THREE.Vector3(0,1,0),{});
    //this.root = new Branch(this,this.position,new THREE.Vector3(0,-1,0),{});

};
Tree.prototype.update = function() {
    //if (this.stem_count>300) { return; }
    this.trunk.prime(99999);
    //this.root.prime(1000);
    this.geometry.verticesNeedUpdate = true;
    this.geometry.elementsNeedUpdate = true;
    this.geometry.computeFaceNormals();
    this.geometry.computeBoundingBox();
};
Tree.prototype.size = function() {
    var v = this.geometry.boundingBox.max;
    return Math.max(v.x,v.y,v.z);
};


window.kjTree = Tree;


})();