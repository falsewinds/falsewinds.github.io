(function () {

const EPSILON = 0.0001;
let DEBUG = 0;

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
            let ni = Math.min((i+1)%3,(i+2)%3),
                mi = Math.max((i+1)%3,(i+2)%3);
            return (at[ni]*a3[mi] - at[mi]*a3[ni]) * (i%2?-1:1);
        }));
    };

    get distance() { return Math.sqrt(this.dot(this)); };
    static Distance(p1,p2) {
        if (!(p1 instanceof Point3D)
         || !(p2 instanceof Point3D)) {
            throw "Error: Point3D.Distance does not support auto-casting.";
        }
        return Math.sqrt(["x","y","z"].reduce((sum,k)=>{
            return sum + Math.pow(p1[k]-p2[k],2);
        },0));
    };
    static Distance2(p1,p2) {
        if (!(p1 instanceof Point3D)
         || !(p2 instanceof Point3D)) {
            throw "Error: Point3D.Distance does not support auto-casting.";
        }
        return ["x","y","z"].reduce((sum,k)=>{
            return sum + Math.pow(p1[k]-p2[k],2);
        },0);
    };

    angleTo(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        if (Math.abs(this.distance)<EPSILON
         || Math.abs(p3.distance)<EPSILON) { return null; }
        return Math.acos(this.dot(p3)/(this.distance*p3.distance));
    };

    /*equal(x,y,z) {
        let p3 = (x instanceof Point3D) ? x : new Point3D(x,y,z),
            d = this.clone().sub(x,y,z);
        if (d.distance<EPSILON) { return true; }
        //if (Math.abs(this.distance-p3.distance)>EPSILON) { return false; }
        let a = this.angleTo(p3);
        if (a==null) { return true; }
        return (Math.abs(a)<EPSILON);
    };*/

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

    static Intersect(p1,d1,p2,d2) {
        let coef = d2.x*d1.y - d2.y*d1.x;
        if (coef==0) { return null; }
        let delta = p1.clone().sub(p2);
        if (d1.x*d1.y!=0) {
            let p2s = (delta.x*d1.y-delta.y*d1.x) / coef;
            return p2.clone().add(d2.clone().mul(p2s));
        } else {
            console.log(d1.x*d1.y);
        }
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
                this.triangles.push(found);
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
        this.needUpdateNormal = false;
        this.normals = [];
    };

    addVertice(x,y,z) {
        let i = this.vertices.length;
        this.vertices.push(new Point3D(x,y,z));
        this.needUpdateNormal = true;
        return i;
    };

    findVertice(x,y,z) {
        let v3 = (x instanceof Point3D) ? x : new Point3D(x,y,z),
            min = Infinity;
        return this.vertices.reduce((tar,v,i)=>{
            let d = Point3D.Distance2(v,v3);
            if (d<min) {
                min = d;
                return i;
            }
            return tar;
        },-1);
    };

    addTriangle(a,b,c) {
        let m = this.vertices.length;
        [a,b,c].map((i)=>{ if (i<0 || i>m) {
            throw "Error: invalid vertice index!"; }
        });
        this.triangles.push(new Triangle(a,b,c));
        this.needUpdateNormal = true;
    };

    addRectangle(a,b,c,d) {
        let m = this.vertices.length;
        [a,b,c,d].map((i)=>{ if (i<0 || i>m) {
            throw "Error: invalid vertice index!"; }
        });
        this.triangles.push(new Triangle(a,b,c));
        this.triangles.push(new Triangle(a,c,d));
        this.needUpdateNormal = true;
    };

    addPolygon(arr) {
        let a = arr.length, m = this.vertices.length;
        if (a<3) { throw "Error: not enough vertice index!"; }
        arr.map((i)=>{ if (i<0 || i>m) {
            throw "Error: invalid vertice index!"; }
        });
        for(let i=1;i<a-1;i++) {
            this.triangles.push(new Triangle(arr[0],arr[i],arr[i+1]));
        }
        this.needUpdateNormal = true;
    };

    computeNormals() {
        if (this.needUpdateNormal!==true) { return; }
        this.normals = this.vertices.map((v)=>{ return new Point3D(0,0,0); });
        this.triangles.map((t)=>{
            t.center = new Point3D(0,0,0);
            let pts = t.array.map((i)=>{
                let pt = this.vertices[i];
                t.center.add(pt);
                return pt;
            });
            t.center.div(3);
            t.normal = pts[1].clone().sub(pts[0])
                .cross(pts[2].clone().sub(pts[0]))
                .normalize();
            t.array.map((i)=>{
                this.normals[i].add(t.normal);
            });
        });
        this.needUpdateNormal = false;
    };

    polyhedron() {
        let poly = [];
        this.computeNormals();
        this.triangles.map((t)=>{
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

    edges() {
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

    // TODO: mergeVertices within distance
    mergeVertices(min) {
    };
};

/*------------------------------------------------------------*\
 * Geometry Simplyify
 - rewrite method using https://github.com/zz85 @blurspline code
 - see vendor/mesh_simplify.js for more details.
 - SymetricMatrix
 - ModeledTriangle
 - ModeledVertex
\*------------------------------------------------------------*/
class SymetricMatrix {
    constructor() { this.m = new Array(10).fill(0); };

    set(m11,m12,m13,m14,
        m22,m23,m24,
        m33,m34,
        m44) {
        this.m[0] = m11;
        this.m[1] = m12;
        this.m[2] = m13;
        this.m[3] = m14;

        this.m[4] = m22;
        this.m[5] = m23;
        this.m[6] = m24;

        this.m[7] = m33;
        this.m[8] = m34;

        this.m[9] = m44;
        return this;
    };

    makePlane(a,b,c,d) {
        return this.set(a*a,a*b,a*c,a*d,
                            b*b,b*c,b*d,
                                c*c,c*d,
                                    d*d);
    };

    det(a11,a12,a13,
        a21,a22,a23,
        a31,a32,a33) {
        let det = this.m[ a11 ] * this.m[ a22 ] * this.m[ a33 ]
                + this.m[ a13 ] * this.m[ a21 ] * this.m[ a32 ]
                + this.m[ a12 ] * this.m[ a23 ] * this.m[ a31 ]
                - this.m[ a13 ] * this.m[ a22 ] * this.m[ a31 ]
                - this.m[ a11 ] * this.m[ a23 ] * this.m[ a32 ]
                - this.m[ a12 ] * this.m[ a21 ] * this.m[ a33 ];
        return det;
    };

    add(n) {
        if (!(n instanceof SymetricMatrix)) {
            throw "Only add with SymetricMatrix!";
        }
        return new SymetricMatrix().set(
            this.m[0] + n.m[0],
            this.m[1] + n.m[1],
            this.m[2] + n.m[2],
            this.m[3] + n.m[3],

            this.m[4] + n.m[4],
            this.m[5] + n.m[5],
            this.m[6] + n.m[6],

            this.m[7] + n.m[7],
            this.m[8] + n.m[8],

            this.m[9] + n.m[9]
        );
    };

    addSelf(n) {
        this.m[0]+=n.m[0];
        this.m[1]+=n.m[1];
        this.m[2]+=n.m[2];
        this.m[3]+=n.m[3];

        this.m[4]+=n.m[4];
        this.m[5]+=n.m[5];
        this.m[6]+=n.m[6];

        this.m[7]+=n.m[7];
        this.m[8]+=n.m[8];

        this.m[9]+=n.m[9]
    };

    error(x,y,z) {
        let pt = (x instanceof Point3D) ? x : new Point3D(x,y,z);
        return [
            pt.x*pt.x, 2*pt.x*pt.y, 2*pt.x*pt.z, 2*pt.x,
            pt.y*pt.y, 2*pt.y*pt.z, 2*pt.y,
            pt.z*pt.z, 2*pt.z,
            1].reduce((sum,a,i)=>{
                sum += a*this.m[i];
                return sum;
            },0);
    };
};


class ModeledTriangle {
    constructor(t) {
        this.v = t.array.slice(0,3);
        this.err = new Array(4);
        this.deleted = false;
        this.dirty = false;
        this.n = t.normal | new Point3D();
    };
};

class ModeledVertex {
    constructor(v) {
        this.p = v.clone();
        this.tstart = -1;
        this.tcount = -1;
        this.q = new SymetricMatrix();
        this.border = false;
    };
};

function simplifyGeometry(geometry,count,factor) {
    if (count<1) { count = geometry.triangles.length * count; }
    if (factor==null) { factor = 7; }

    geometry.mergeVertices();
    
    let vertices = geometry.vertices.map((v)=>{
        let nv = new ModeledVertex(v);
        nv.p.copy(v);
        return nv;
    });
    let triangles = geometry.triangles.map((t)=>{
        let nt = new ModeledTriangle(t);
        nt.v = [t.a,t.b,t.c];
        return nt;
    });
    let refs = [];

    /*------------------------------------------------------------*\
     * Copy & Paste start
     - change Vector3 to Point3D
    \*------------------------------------------------------------*/
	function resize(array, count) {
        // TODO: get rid of this one...
		if (count < array.length) { return array.splice(count); }
	}

	//
	// Main simplification function
	//
	// target_count  : target nr. of triangles
	// agressiveness : sharpness to increase the threshold.
	//                 5..8 are good numbers
	//                 more iterations yield higher quality
	//
	function simplify_mesh(target_count, agressiveness, update) {
        // set all triangles to non deleted
        triangles.map((t)=>{ t.deleted = false; });

		let i, il;

		// main iteration loop

		var deleted_triangles = 0;
		var deleted0 = [], deleted1 = []; // std::vector<int>
		var triangle_count = triangles.length;


		for (let iteration = 0; iteration < 100; iteration++ ) {
			console.log("iteration %d - triangles %d, tris\n",
				iteration, triangle_count - deleted_triangles, triangles.length);

			if ( triangle_count - deleted_triangles <= target_count ) break;

			// update mesh once in a while
			if( iteration % update === 0 ) {
				update_mesh(iteration);
			}

			// clear dirty flag
            triangles.map((t)=>{ t.dirty = false; });

			//
			// All triangles with edges below the threshold will be removed
			//
			// The following numbers works well for most models.
			// If it does not, try to adjust the 3 parameters
			//
			var threshold = 0.000000001 * Math.pow( iteration + 3, agressiveness );

			// remove vertices & mark deleted triangles
			for ( i = 0, il = triangles.length; i < il; i++ ) {
				let t = triangles[ i ];
				if (t.err[3]>threshold
                 || t.deleted
                 || t.dirty ) { continue; }

				for (let j=0;j<3;j++) {
					if (t.err[j]<threshold) {
                        let i0 = t.v[j], i1 = t.v[(j+1)%3],
                            v0 = vertices[i0], v1 = vertices[i1];
						// Border check
						if (v0.border != v1.border) { continue; }

						// Compute vertex to collapse to
						var p = new Point3D();
						calculate_error( i0, i1, p );
						// console.log('Compute vertex to collapse to', p);

						resize(deleted0, v0.tcount); // normals temporarily
						resize(deleted1, v1.tcount); // normals temporarily

						// dont remove if flipped
						if( flipped( p, i0, i1, v0, v1, deleted0 ) ) continue;
						if( flipped( p, i1, i0, v1, v0, deleted1 ) ) continue;

						// not flipped, so remove edge
						// console.log('not flipped, remove edge');
						// console.log(v0.p, p);
						v0.p = p;
						// v0.q = v1.q + v0.q;
						v0.q.addSelf( v1.q );

						var tstart = refs.length;

						// CONTINUE

						deleted_triangles = update_triangles( i0, v0, deleted0, deleted_triangles );
						// console.log('deleted triangle v0', deleted_triangles);
						deleted_triangles = update_triangles( i0, v1, deleted1, deleted_triangles );
						// console.log('deleted triangle v1', deleted_triangles);

						var tcount = refs.length - tstart;

						if (tcount>v0.tcount ) { v0.tstart = tstart; }
						v0.tcount = tcount;
						break;
					}
				} // end for j

				// done?
				if (triangle_count - deleted_triangles <= target_count) { break; }
			}

		} // end iteration

		function move(refs, dest, source, count) {
			for (var i = 0; i < count; i++) {
				refs[dest + i] = refs[source + i];
			}
		}
	}

	// Check if a triangle flips when this edge is removed


	function /*bool*/ flipped(
		/* vec3f */ p,
		/*int*/ i0,
		/*int*/ i1,
		/*Vertex*/ v0,
		/*Vertex*/ v1, // not needed
		/*std::vector<int>*/ deleted)
	{
		// var bordercount = 0;
		for (let k=0;k<v0.tcount;k++) {
			let t = triangles[refs[v0.tstart+k].tid];
			if (t.deleted) { continue; }

			let s = refs[v0.tstart+k].tvertex,
                id1 = t.v[(s+1)%3],
                id2 = t.v[(s+2)%3];

			if(id1==i1 || id2==i1) {
				deleted[k] = true;
				continue;
			}

            let d1 = vertices[id1].p.clone().sub(p).normalize(),
                d2 = vertices[id2].p.clone().sub(p).normalize();

			if (Math.abs(d1.dot(d2))>0.999) { return true; }
			let n = d1.clone().cross(d2).normalize();

			deleted[k] = false;
			if (n.dot(t.n)<0.2) { return true; }
		}
		return false;
	}

	// Update triangle connections and edge error after a edge is collapsed

	function update_triangles(/*int*/ i0,
		/*Vertex &*/ v,
		/*std::vector<int> & */deleted,
		/*int &*/ deleted_triangles )
	{
		let p = new Point3D();
		for (let k=0;k<v.tcount;k++) {
            let r = refs[v.tstart+k],
                t = triangles[r.tid];

			if (t.deleted) { continue; }
			if (deleted[k]) {
				t.deleted = true;
				deleted_triangles++;
				continue;
			}
			t.v[r.tvertex] = i0;
			t.dirty = true;

			t.err[0] = calculate_error( t.v[0], t.v[1], p );
			t.err[1] = calculate_error( t.v[1], t.v[2], p );
			t.err[2] = calculate_error( t.v[2], t.v[0], p );
			t.err[3] = Math.min( t.err[0], t.err[1], t.err[2] );
			refs.push( r );
		}
		return deleted_triangles;
	}

	// compact triangles, compute edge error and build reference list
	function update_mesh( iteration ) /*int*/
	{
		// console.log('update_mesh', iteration, triangles.length);
		if ( iteration > 0 ) {
			// compact triangles
			let dst = 0;
			for (let i=0;i<triangles.length;i++) {
				let target = triangles[i];
				if(!target.deleted) {
					triangles[dst++] = target;
				}
			}

			console.log('not deleted dst', triangles.length, dst);
			triangles.splice( dst );
		}
		//
		// Init Quadrics by Plane & Edge Errors
		//
		// required at the beginning ( iteration == 0 )
		// recomputing during the simplification is not required,
		// but mostly improves the result for closed meshes
		//
		if( iteration === 0 ) {
            // may not need to do this.
            vertices.map((v)=>{ v.q = new SymetricMatrix(); });

			for (var i = 0; i < triangles.length; i++) {
				let t = triangles[i],
                    p = t.v.map((vi)=>{ return vertices[vi].p; });
				/*var n = new Vector3();

				var p = new Array(3);
				var p1p0 = new Vector3();
				var p2p0 = new Vector3();

				for (var j = 0; j < 3; j++) {
					p[j] = vertices[t.v[j]].p;
				}

				p1p0.subVectors(p[1], p[0]);
				p2p0.subVectors(p[2], p[0]);*/
                let p1p0 = p[1].clone().sub(p[0]),
                    p2p0 = p[2].clone().sub(p[0]);

				//n.crossVectors(p1p0, p2p0).normalize();
                let n = p1p0.clone().cross(p2p0).normalize();
				t.n = n;
				var tmp = new SymetricMatrix().makePlane(
						n.x, n.y, n.z,
                        -n.dot(p[0]))

                t.v.map((vi)=>{ vertices[vi].q.addSelf(tmp); });
			}

			for (let i=0;i<triangles.length;i++) {
                let t = triangles[i],
                    p = new Point3D();

				for (let j=0;j<3;j++) {
					t.err[ j ] = calculate_error( t.v[j], t.v[(j+1)%3], p );
				}
				t.err[ 3 ] = Math.min( t.err[0], t.err[1], t.err[2] );
			}
		}

		// Init Reference ID list
        vertices.map((v)=>{
            v.tstart = 0;
            v.tcount = 0;
        });
        triangles.map((t)=>{
            t.v.map((vi)=>{ vertices[vi].tcount++; });
        });
		let tstart = 0;
        vertices.map((v)=>{
            v.tstart = tstart;
            tstart += v.tcount;
            v.tcount = 0;
        });

		// Write References
		// resize(refs, triangles.length * 3)
		console.log('pre ref', refs.length, triangles.length * 3);
		for (let i=refs.length;i<triangles.length*3;i++) { refs[i] = {}; }

        triangles.map((t,i)=>{
            t.v.map((vi,j)=>{
                let v = vertices[vi];
				refs[ v.tstart + v.tcount ].tid = i;
				refs[ v.tstart + v.tcount ].tvertex = j;
				v.tcount++;
            });
        });

		// Identify boundary : vertices[].border=0,1
		if( iteration == 0 ) {
            vertices.map((v)=>{ v.border = 0; });
            // remove follow to get no-border land
            // can weaving with other landscape
            vertices.map((v)=>{
                let vcount = [], vids = [];
                for(let j=0;j<v.tcount;j++) {
                    let k = refs[v.tstart+j].tid,
                        t = triangles[k];
                    t.v.map((id)=>{
                        let ofs = 0;
                        while (ofs<vcount.length) {
                            if (vids[ofs]==id) { break; }
                            ofs++;
                        }
                        if (ofs==vcount.length) {
                            vcount.push(1);
                            vids.push(id);
                        } else { vcount[ofs]++; }
                    });
                }
                for(let j=0;j<v.tcount;j++) {
					if (vcount[j]==1) {
						vertices[vids[j]].border = 1;
					}
                }
            });
		}
	}

	// Error for one edge
	// if DECIMATE is defined vertex positions are NOT interpolated
	// Luebke Survey of Polygonal Simplification Algorithms:  "vertices of a model simplified by the decimation algorithm are a subset of the original model’s vertices."
	// http://www.cs.virginia.edu/~luebke/publications/pdf/cg+a.2001.pdf

	function calculate_error(id_v1, id_v2, p_result)
	{
		// compute interpolated vertex
		var vertex1 = vertices[id_v1];
		var vertex2 = vertices[id_v2];

		var q = vertex1.q.add(vertex2.q);
		var border = vertex1.border && vertex2.border;
		var error = 0;
		var det = q.det(0, 1, 2, 1, 4, 5, 2, 5, 7);

		if ( det !== 0 && !border ) {
			// q_delta is invertible
			p_result.x = -1/det*(q.det(1, 2, 3, 4, 5, 6, 5, 7, 8));	// vx = A41/det(q_delta)
			p_result.y =  1/det*(q.det(0, 2, 3, 1, 5, 6, 2, 7, 8));	// vy = A42/det(q_delta)
			p_result.z = -1/det*(q.det(0, 1, 3, 1, 4, 6, 2, 5, 8));	// vz = A43/det(q_delta)
			//error = vertex_error(q, p_result.x, p_result.y, p_result.z);
            error = q.error(p_result);
		} else {
			// det = 0 -> try to find best result
			let p1 = vertex1.p, p2 = vertex2.p,
                p3 = p1.clone().add(p2).mul(0.5);
            /*let error1 = vertex_error(q, p1.x, p1.y, p1.z),
                error2 = vertex_error(q, p2.x, p2.y, p2.z),
                error3 = vertex_error(q, p3.x, p3.y, p3.z);*/
            let error1 = q.error(p1),
                error2 = q.error(p2),
                error3 = q.error(p3);
			error = Math.min(error1, error2, error3);
			if (error1 === error) p_result.copy(p1);
			if (error2 === error) p_result.copy(p2);
			if (error3 === error) p_result.copy(p3);
		}

		return error;
	}
    /*------------------------------------------------------------*\
     * Copy & Paste end
    \*------------------------------------------------------------*/

    console.time('simplify_mesh');
    simplify_mesh(count,factor,1);
    console.timeEnd('simplify_mesh');

    // Compact Mesh (JS style)
    let g = new kjSolid.Geometry(), references = {};
    triangles.map((t)=>{
        if (t.deleted) { return; }
        let face = t.v.map((vi)=>{
            if (!(vi in references)) {
                references[vi] = g.addVertice(vertices[vi].p);
            }
            return references[vi];
        });
        g.addTriangle.apply(g,face);
    },[]);

    return g;
};

/*------------------------------------------------------------*\
 * Export
\*------------------------------------------------------------*/
function dispose(parent,key) {
    if (!(key in parent)) { return; }
    if (parent[key]==null) { return; }
    if (!("dispose" in parent[key])) { return; }
    parent[key].dispose();
};

window.kjSolid = {

"Point3D": Point3D,
"Geometry": Geometry,
"simplify": simplifyGeometry,

"toBufferGeometry": function(geometry,position,scalar) {
    let g = new THREE.BufferGeometry();
    this.updateBufferGeometry(geometry,g,position,scalar);
    return g;
},
"updateBufferGeometry": function(geometry,buffered,position,scalar) {
    if (!THREE || !THREE.BufferGeometry) { throw "Error: load Three.js first!"; }
    if (!(geometry instanceof Geometry)) { throw "Error: need kjSolid.Geometry."; }
    if (!(buffered instanceof THREE.BufferGeometry)) { throw "Error: need THREE.BufferGeometry."; }
    position = (position instanceof Point3D) ? position : new Point3D(position);
    if (isNaN(scalar) || scalar<0) { scalar = 1; }

    let vertices = [], normals = [], triangles = [];
    geometry.vertices.map((p3)=>{
        let v3 = p3.clone().add(position).mul(scalar);
        vertices.push(v3.x,v3.y,v3.z);
    });
    geometry.computeNormals();
    geometry.normals.map((vn)=>{ normals.push(vn.x,vn.y,vn.z); });
    geometry.triangles.map((f3)=>{ triangles.push(f3.a,f3.b,f3.c); });

    if (!("indexVersion" in buffered.userData)) { buffered.userData.indexVersion = 0; }
    buffered.userData.indexVersion++;
    dispose(buffered,"index");
    buffered.setIndex(triangles);
    buffered.index.version = buffered.userData.indexVersion;
    buffered.index.needsUpdate = true;

    dispose(buffered.attributes,"position");
    buffered.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    buffered.attributes.position.needsUpdate = true;

    // Manual update Vertex Normals
    dispose(buffered.attributes,"normal");
    buffered.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
    buffered.attributes.normal.needsUpdate = true;

    buffered.computeBoundingBox();
    buffered.computeBoundingSphere();
},

};

})();