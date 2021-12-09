(function() {

if (!kjSolid) { throw "Error: need kjSolid."; }

/*------------------------------------------------------------*\
 * kjThree : plane
\*------------------------------------------------------------*/
if (!THREE) { throw "Error: need Three.js."; }
class Coordinate {
    constructor(up) {
        this.normal = new THREE.Vector3(up.x,up.y,up.z);
        this.q = (new THREE.Quaternion())
            .setFromUnitVectors(new THREE.Vector3(0,1,0),this.normal);
        this.left = (new THREE.Vector3(1,0,0)).applyQuaternion(this.q);
        this.forward = (new THREE.Vector3(0,0,1)).applyQuaternion(this.q);
    };

    polar(radian,radius,up=0) {
        let pt = this.normal.clone().multiplyScalar(up)
            .add( this.left.clone().multiplyScalar(Math.cos(radian)*radius) )
            .add( this.forward.clone().multiplyScalar(Math.sin(radian)*radius) );
        return new kjSolid.Point3D(pt);
    };

    toAxisHelper() {
        if (!("helper" in this)) {
            this.helper = new THREE.Group();
            // Axis X
            this.helper.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0,0,0),
                    this.left
                ]),
                new THREE.LineBasicMaterial({"color":0xFF0000})
            ));
            // Axis Y
            this.helper.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0,0,0),
                    this.normal
                ]),
                new THREE.LineBasicMaterial({"color":0x00FF00})
            ));
            // Axis Z
            this.helper.add(new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0,0,0),
                    this.forward
                ]),
                new THREE.LineBasicMaterial({"color":0x0000FF})
            ));
        }
        return this.helper;
    };
};

/*------------------------------------------------------------*\
 * kjNature : Tree
\*------------------------------------------------------------*/
const SIDES = 12,
    GROWSPEED = 0.1;

class Stem {
    constructor(parent,direction) {
        this.center = new kjSolid.Point3D(0,0,0);
        if (parent instanceof Stem) {
            this._parent = parent;
            this._tree = parent._tree;
            this._geometry = parent._geometry;
            this._original = parent._original;
            parent.ends.map((vi)=>{
                let pt = this._geometry.vertices[vi];
                this.center.add(pt);
            });
            this.center.div(parent.ends.length);
        } else if (parent instanceof Tree) {
            this._parent = null;
            this._tree = parent;
            this._geometry = parent.geometry;
            this._original = direction.normalized().mul(parent.init_factor);
        } else {
            throw "Error: Stem can only create by Stem or Tree.";
        }
        this.normal = direction.normalized();
        this.coord = new Coordinate(this.normal);

        let s = this._tree.side;
        let v0 = this._geometry.addVertice(this.center);
        this.ends = [v0];
        this.begins = [];
        for(let i=0;i<s;i++) {
            let vi = this._geometry.addVertice(this.center);
            this.begins.push(vi);
        }
        for(let i=0;i<s;i++) {
            let vi = this.begins[i],
                vpi = this.begins[((i==0)?s:i)-1];
            this._geometry.addTriangle(v0,vi,vpi);
        }

        this.maxLength = Math.random() * 14 + 1;
        this.children = [];
        this.energy = 0;
        this.length = 0;
        this.age = 0;
    };

    iterate(radian,radius) {
        if (this.children.length==0) {
            let newtriangles = [], ends = this.ends[0];
            this._geometry.triangles.map((t)=>{
                let found = t.array.indexOf(ends) >= 0;
                /*let found = t.array.reduce((val,vi)=>{
                    if (val) { return true; }
                    return (this.ends.indexOf(vi)>=0);
                },false);*/
                if (!found) { newtriangles.push(t); }
            });
            this._geometry.triangles = newtriangles;
        }
        let dir = this.coord.polar(radian,radius,1).add(this._original);
        let newstem = new Stem(this,dir), s = this._tree.side;
        this.children.push(newstem);
        this.begins.map((vi,i)=>{
            let pi = ((i==0)?s:i) - 1,
                vpi = this.begins[pi],
                ui = newstem.begins[i],
                upi = newstem.begins[pi];
            this._geometry.addRectangle(vi,vpi,upi,ui);
        });
        return newstem;
    };

    move(v3) {
        this.center.add(v3);
        this.begins.map((vi)=>{
            this._geometry.vertices[vi].add(v3);
        });
        if (this.children.length>0) {
            this.children.map((c)=>{ c.move(v3); });
        } else {
            this.ends.map((vi)=>{
                this._geometry.vertices[vi].add(v3);
            });
        }
    };

    _entend(segment=GROWSPEED) {
        if (this.energy<segment) { return; }
        this.energy -= segment;
        let ext = this.normal.clone().mul(segment);
        if (this.children.length>0) {
            let e = Math.floor(this.energy / this.children.length);
            this.energy -= e * this.children.length;
            this.children.map((c)=>{
                //c.move(ext);
                c.grow(e);
            });
            return;
        }
        let end = this.ends.reduce((sum,vi)=>{
            let pt = this._geometry.vertices[vi];
            pt.add(ext);
            sum.add(pt);
            return sum;
        },new kjSolid.Point3D(0,0,0));
        this.length = kjSolid.Point3D.Distance(this.center,end);
        if (this.length>GROWSPEED*this.maxLength) {
            let seed = Math.floor(Math.random() * this._tree.branch) + 1,
                range = 2 * Math.PI / seed,
                min = Math.random() * 2 * Math.PI,
                div = this._tree.branch_div;
            for(let i=0;i<seed;i++) {
                let r = Math.random() * 0.5 + (seed*0.1),
                    rad = (Math.random()*div+i) * range + min;
                this.iterate(rad,r);
            }
            if (seed>1) { this._tree.branch_count += seed - 1; }
        }
    };
    _expand(limit,segment=GROWSPEED/5,factor=1.2) {
        if (this.energy<segment) { return 0; }
        this.energy -= segment;
        let radius = [], min_list = [];
        let min = this.begins.reduce((n,vi)=>{
            let d = kjSolid.Point3D.Distance2(
                this.center,
                this._geometry.vertices[vi]
            );
            radius.push(d);
            return (d<n) ? d : n;
        },99999);
        if (min>limit) { return min; }
        min *= factor;
        this.begins.map((vi,i)=>{
            let d = radius[i];
            if (d<=min) { min_list.push(i); }
        });
        if (min_list.length<=0) { return min; }
        let index = min_list[Math.floor(Math.random()*min_list.length)],
            vi = this.begins[index],
            radian = Math.PI*2*index/this._tree.side;
        let dir = this.coord.polar(radian,1,0).normalize().mul(segment);
        this._geometry.vertices[vi].add(dir);
        return radius[vi] + segment;
    };

    grow(energy) {
        if (energy==null) { energy = 0; }
        this.energy += energy;
        this._entend();
        this._expand(this.length/5);
        this.age++;
    };
};

class Tree {
    constructor(s=SIDES,b=2,d=0.5) {
        this.side = s;
        this.branch = b;
        this.branch_div = d;
        this.init_factor = 0.05;
        this.geometry = new kjSolid.Geometry();
        this.core = new Stem(this,new kjSolid.Point3D(0,1,0));
        this.branch_count = 1;
        //this.root = new Stem(this.geometry,new kjSolid.Point3D(0,-1,0));
    };

    update() {};
    clear() {
        delete this.geometry;
        delete this.core;
        this.geometry = new kjSolid.Geometry();
        this.core = new Stem(this,new kjSolid.Point3D(0,1,0));
        this.branch_count = 1;
    };
};

/*------------------------------------------------------------*\
 * kjNature
\*------------------------------------------------------------*/
if (!(window.kjNature)) { window.kjNature = {}; }

kjNature.Tree = Tree;

})();