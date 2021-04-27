(function () {

const EPSILON = 0.0001;

/*------------------------------------------------------------*\
 * Point3D
\*------------------------------------------------------------*/
class Point3D {
    constructor(x,y,z) {
        if (x instanceof Array) {
            if (x.length<1) {
                x = 0;
            } else if (x.length<2) {
                x = x[0];
            } else if (x.length<3) {
                y = x[1];
                x = x[0];
            } else {
                z = x[2];
                y = x[1];
                x = x[0];
            }
        } else if (typeof x == "object") {
            if ("z" in x) { z = x.z; }
            if ("y" in x) { y = x.y; }
            if ("x" in x) { x = x.x; }
        }
        this.x = isNaN(x) ? 0 : parseFloat(x);
        this.y = isNaN(y) ? this.x : parseFloat(y);
        this.z = isNaN(z) ? this.y : parseFloat(z);
    };

    add(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        this.x += p3.x;
        this.y += p3.y;
        this.z += p3.z;
        return this;
    };

    sub(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        this.x -= p3.x;
        this.y -= p3.y;
        this.z -= p3.z;
        return this;
    };

    mul(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        this.x *= p3.x;
        this.y *= p3.y;
        this.z *= p3.z;
        return this;
    };

    div(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        this.x /= p3.x;
        this.y /= p3.y;
        this.z /= p3.z;
        return this;
    };

    get array() { return [this.x,this.y,this.z]; };
    clone() { return new Point3D(this.x,this.y,this.z); };
    copy(x,y,z) { this.set(x,y,z); };
    set(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        this.x = p3.x;
        this.y = p3.y;
        this.z = p3.z;
        return this;
    };

    dot(x,y,z) {
        let m = this.clone().mul(x,y,z);
        return m.array.reduce((r,v)=>{ return r + v; },0);
    };

    cross(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z),
            a3 = p3.array, at = this.array;
        return new Point3D([0,0,0].map((v,i)=>{
            let ni = Math.min(i+1%3,i+2%3),
                mi = Math.max(i+1%3,i+2%3);
            return at[ni]*a3[mi] - at[mi]*a3[ni];
        }));
    };

    get distance() { return Math.sqrt(this.dot(this)); };

    angleTo(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        if (Math.abs(this.distance)<EPSILON
         || Math.abs(p3.distance)<EPSILON) { return null; }
        return Math.acos(this.dot(p3)/(this.distance*p3.distance));
    };

    equal(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        if (Math.abs(this.distance-pc.distance)>EPSILON) { return false; }
        let a = this.angleTo(p3);
        if (a==null) { return true; }
        return (Math.abs(a)<EPSILON);
    };

    normalize() {
        let d = this.distance;
        this.x /= d;
        this.y /= d;
        this.z /= d;
        return this;
    };

    normalized() {
        let d = this.distance;
        return this.clone().div(d);
    };
};

/*------------------------------------------------------------*\
 * Line3D
\*------------------------------------------------------------*/
class Line3D {
    constructor(begin,close) {
        this.begin = new Point3D(begin);
        this.close = new Point3D(close);
        this.vector = this.close.clone().sub(this.begin).normalize();
    };

    lerp(d) {
        return this.begin.clone().add(this.vector.clone().mul(d));
    };

    contain(x,y,z) {
        let dir = this.close.clone().sub(x,y,z),
            angle = this.vector.angleTo(dir);
        if (angle===null) { return false; }
        return (Math.abs(angle)<EPSILON);
    };

    intersect(o) {
        if (o instanceof Line3D) {
            
        }
        if (o instanceof Plane) {
            let meet = this.vector.dot(o.normal);
            if (Math.abs(meet)<EPSILON) { return null; }
            return (o.d-this.begin.dot(o.normal))/meet;
        }
        return null;
    };
};

/*------------------------------------------------------------*\
 * Plane
\*------------------------------------------------------------*/
class Plane {
    constructor(point,normal) {
        this.point = new Point3D(point);
        this.normal = new Point3D(normal).normalize();
        this.d = this.point.dot(this.normal);
    };

};

/*------------------------------------------------------------*\
 * Geometry
 - Polygon : 
 - Triangle :
 - Edge :
\*------------------------------------------------------------*/
class Polygon {
    constructor(normal) {
        this.normal = new Point3D(normal);
        this.points = [];
        this.triangles = [];
    };

    compute() {
        //this.points = [];
        while (this.triangles.length>0) {
            let t = this.triangles.shift();
            if (this.points.length==0) {
                this.points.push(t.a,t.b,t.c);
                continue;
            }
            let index = t.array.map((i)=>{ return this.points.indexOf(i); }),
                found = index.map((i)=>{ return (i<0)?"F":"T" } ).join("");
            switch(found) {
            case "TTT":
                break;
            case "FTT":
            case "TFT":
            case "TTF":
                var m = found.indexOf("F"),
                    p = index[(m+2)%3], n = index[(m+1)%3];
                if ((n-p)==1) {
                    this.points.splice(n,0,t.array[m]);
                } else if (p==(this.points.length-1)) {
                    this.points.push(t.array[m]);
                } else {
                    console.log(t.array,index);
                }
                break;
            default:
                console.log(found);
                this.triangles.push(f);
                break;
            }
        }
    };
};

class Triangle {
    constructor(a,b,c) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.center = null;
        this.normal = null;
    };

    get array() { return [this.a,this.b,this.c]; };
};

class Edge {
    constructor(a,b) {
        this.a = a;
        this.b = b;
        this.neighbors = [];
    };
};

class Geometry {
    constructor() {
        this.vertices = [];
        this.triangles = [];
        this.edgedata = {};
    };

    addVertice(x,y,z) {
        let i = this.vertices.length;
        this.vertices.push(new Point3D(x,y,z));
        return i;
    };

    addTriangle(a,b,c) {
        let m = this.vertices.length;
        [a,b,c].map((i)=>{ if (i<0 || i>m) {
            throw "Error: invalid vertice index!"; }
        });
        this.triangles.push(new Triangle(a,b,c));
    };

    addRectangle(a,b,c,d) {
        let m = this.vertices.length;
        [a,b,c,d].map((i)=>{ if (i<0 || i>m) {
            throw "Error: invalid vertice index!"; }
        });
        this.triangles.push(new Triangle(a,b,c));
        this.triangles.push(new Triangle(a,c,d));
    };

    computeNormals() {
        this.triangles.map((t)=>{
            t.center = new Point3D(0,0,0);
            let pts = t.array.map((i)=>{
                let pt = this.vertices[i];
                t.center.add(pt);
                return pt;
            });
            t.center.div(3);
            t.normal = pts[0].clone().sub(pts[1])
                .cross(pts[2].clone().sub(pts[1]))
                .normalize();
        });
    };

    get polyhedron() {
        let poly = [];
        this.triangles.map((t)=>{
            if (t.normal==null) { throw "Error: need triangle normal!"; }
            let matched = [], tp;
            poly.map((p)=>{
                let a = p.normal.angleTo(t.normal);
                if (Math.abs(a)<EPSILON) { matched.push(p); }
            });
            matched.sort((p1,p2)=>{
                let a1 = p1.normal.angleTo(t.normal),
                    a2 = p2.normal.angleTo(t.normal);
                return a1<a2 ? -1 : 1;
            });
            if (matched.length<=0) {
                tp = new Polygon(t.normal);
                poly.push(tp);
            } else { tp = matched[0]; }
            tp.triangles.push(t);
        });
        poly.map((p)=>{ p.compute(); });
        return poly;
    };

    get edges() {
        /*
        tria.map((ci,i)=>{
            let ni = tria[(i+1)%3],
                min = Math.min(ci,ni),
                max = Math.max(ci,ni),
                k = ["E",min,max].join("-");
            if (!(k in this.edgedata)) {
                this.edgedata[k] = new Edge(min,max);
            }
            this.edgedata[k].neighbors.push(t);
        });
        */
        return Object.values(this.edgedata);
    };
};

/*------------------------------------------------------------*\
 * Export
\*------------------------------------------------------------*/
window.kjSolid = {

"Point3D": Point3D,
"Geometry": Geometry,
"toBufferGeometry": function(geometry,position,scalar) {
    if (!THREE || !THREE.BufferGeometry) { throw "Error: load Three.js first!"; }
    if (!(geometry instanceof Geometry)) { throw "Error convert only kjSolid.Geometry"; }
    let g = new THREE.BufferGeometry();
    position = (position instanceof Point3D) ? position : new Point3D(position);
    if (isNaN(scalar) || scalar<0) { scalar = 1; }

    let vertices = [], triangles = [];
    geometry.vertices.map((p3)=>{
        let v3 = p3.clone().add(position).mul(scalar);
        vertices.push(v3.x,v3.y,v3.z);
    });
    geometry.triangles.map((f3)=>{ triangles.push(f3.a,f3.b,f3.c); });
    g.setIndex(triangles);
    g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    g.computeVertexNormals();
    return g;
}

};

})();