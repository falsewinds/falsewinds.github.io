
/*------------------------------------------------------------*\
 * CONST
\*------------------------------------------------------------*/
const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

/*------------------------------------------------------------*\
 * class Point2D
\*------------------------------------------------------------*/
class Point2D {
    constructor(x, y) {
        if (typeof x == "object") {
            if (x instanceof Array) {
                if (x.length>1) { y = x[1]; }
                if (x.length>0) { x = x[0]; }
            } else {
                if ("y" in x) { y = x.y; }
                if ("x" in x) { x = x.x; }
            }
        } else {
            if (!isNaN(x)) { x = parseFloat(x); }
            if (!isNaN(y)) { y = parseFloat(y); }
        }
        this.x = (x===undefined || x===null) ? 0 : x;
        this.y = (y===undefined || y===null) ? x : y;
    }

    static Create(x,y) {
        if (x instanceof Point2D) { return x; }
        return new Point2D(x,y);
    }
    static Vector(orig,dest) {
        return new Point2D(dest).sub(Point2D.Create(orig));
    }
    static Combine() {
        let cmb = new Point2D(0,0);
        for(let arg of arguments) {
            if (arg instanceof Point2D) {
                cmb.add(arg.normalized());
            }
        }
        return cmb.normalized();
    }

    clone() {
        return new Point2D(this.x,this.y);
    }
    copy(x,y) {
        let pt = Point2D.Create(x,y);
        this.x = pt.x;
        this.y = pt.y;
        return this;
    }
    set(x,y) { return this.copy(x,y); }

    add(x,y) {
        let pt = Point2D.Create(x,y);
        this.x += pt.x;
        this.y += pt.y;
        return this;
    }

    sub(x,y) {
        let pt = Point2D.Create(x,y);
        this.x -= pt.x;
        this.y -= pt.y;
        return this;
    }

    mul(x,y) {
        let pt = Point2D.Create(x,y);
        this.x *= pt.x;
        this.y *= pt.y;
        return this;
    }

    div(x,y) {
        let pt = Point2D.Create(x,y);
        this.x /= pt.x;
        this.y /= pt.y;
        return this;
    }

    mod(x,y) {
        let pt = Point2D.Create(x,y);
        this.x %= pt.x;
        this.y %= pt.y;
        return this;
    }

    distance2(x = 0, y = 0) {
        let pt = Point2D.Create(x,y),
            dx = pt.x - this.x, dy = pt.y - this.y;
        return dx*dx + dy*dy;
    }
    distance(x = 0, y = 0) {
        return Math.sqrt(this.distance2(x,y));
    }
    length() {
        return Math.sqrt(this.x*this.x+this.y*this.y);
    }

    normalized() {
        return this.clone().div(this.length());
    }

    lerp(x,y,d) {
        if (typeof x == "object") { d = y; }
        if (isNaN(d)) { d = 0.5; }
        let v = Point2D.Create(x,y).sub(this).normailized().mul(d);
        return this.clone().add(v);
    }

    cross(x,y) {
        let pt = Point2D.Create(x,y);
        return this.x*pt.y - this.y*pt.x;
    }

    dot(x,y) {
        let pt = Point2D.Create(x,y);
        return this.x*pt.x + this.y*pt.y;
    }

    radian(x = 1, y = 0) {
        //let d = (new Point2D(x,y)).mul(-1).add(this);
        //return Math.acos(this.dot(x,y));
        return Math.atan2(this.cross(x,y),this.dot(x,y));
    }
    degree(x = 1, y = 0) {
        return this.radian(x,y) * RAD2DEG;
    }

    floor() {
        this.x = Math.floor(this.x);
        this.y = Math.floor(this.y);
        return this;
    }
    ceil() {
        this.x = Math.ceil(this.x);
        this.y = Math.ceil(this.y);
        return this;
    }
};


/*------------------------------------------------------------*\
 * class Rect2D
\*------------------------------------------------------------*/
class Rect2D {
    constructor(x,y,w,h) {
        this.position = new Point2D(x,y);
        this.size = new Point2D(w,h);
    }

    static Create(x,y,w,h) {
        if (x instanceof Rect2D) { return x; }
        if (x instanceof Point2D) {
            w = y;
            y = x.y;
            x = x.x;
        }
        if (w instanceof Point2D) {
            if (w.y<y) {
                h = y - w.y;
                y = w.y;
            } else { h = w.y - y; }
            if (w.x<x) {
                let tmp = x - w.x;
                x = w.x;
                w = tmp;
            } else {
                w = w.x - x;
            }
        }
        return new Rect2D(x,y,w,h);
    }

    static Bound() {
        let xn = Infinity, xm = -Infinity,
            yn = Infinity, ym = -Infinity;
        [...arguments].forEach((pt)=>{
            if (!(pt instanceof Point2D)) { return; }
            if (pt.x<xn) { xn = pt.x; }
            if (pt.x>xm) { xm = pt.x; }
            if (pt.y<yn) { yn = pt.y; }
            if (pt.y>ym) { ym = pt.y; }
        });
        return new Rect2D(xn,yn,xm-xn,ym-yn);
    }

    clone() {
        return new Rect2D(
            this.position.x,this.position.y,
            this.size.x, this.size.y
        );
    }
    copy(x,y,w,h) {
        let r = Rect2D.Create(x,y,w,h);
        this.position.copy(r.position);
        this.size.copy(r.size);
        return this;
    }
    set(x,y,w,h) { return this.copy(x,y,w,h); }

    get x() { return this.position.x; }
    get y() { return this.position.y; }
    get w() { return this.size.x; }
    get h() { return this.size.y; }
    get width() { return this.size.x; }
    get height() { return this.size.y; }
    get area() { return this.size.x * this.size.y; }
    get center() {
        return this.size.clone().div(2).add(this.position);
    }

};


/*------------------------------------------------------------*\
 * Physic2D
\*------------------------------------------------------------*/

/*function intersect_ray_circle(p, v, c, r) {
    const r2 = r * r, n = p.clone().add(v),
        r2_p = c.distance2(p), r2_n = c.distance2(n);
    if (r2_p==r2) { return p; }
    if (r2_n==r2) { return n; }
    //console.log(r2,r2_p,r2_n);
    if ( (r2_p<r2 && r2_n<r2) || (r2_p>r2 && r2_n>r2) ) { return null; }
    let p_ = p.clone().sub(c);
    let a_ = v.distance2(0,0),
        b_ = 2 * ( p_.x * v.x + p_.y * v.y ),
        c_ = p_.distance2(0,0) - r2;
    //if (a_==0) { return null; };
    let d2 = b_*b_ - 4*a_*c_;
    if (d2<0) { return null; }
    let d_ = Math.sqrt(d2);
    let s1 = (d_ - b_) / (2*a_), s2 = -1 * (d_ + b_) / (2*a_);
    if (d_ > b_) {
        return p.clone().add(v.mul(s1));
    } else {
        console.log("d<=b");
        return p.clone().add(v.mul(s2));
    }
}*/

function intersect_ray_circle(p, v, c, r) {
    const r2 = r * r;
    let p_ = p.clone().sub(c);
    let a_ = v.distance2(0,0),
        b_ = 2 * ( p_.x * v.x + p_.y * v.y ),
        c_ = p_.distance2(0,0) - r2;
    //if (a_==0) { return null; };
    let d2 = b_*b_ - 4*a_*c_;
    if (d2<0) { return -1; }
    let d_ = Math.sqrt(d2);
    return (d_ - b_) / (2*a_);
}


function reflect_ray(v, n) {
    const dot = v.x * n.x + v.y * n.y;
    return new Point2D(
        v.x - 2 * dot * n.x,
        v.y - 2 * dot * n.y
    );
}


/*------------------------------------------------------------*\
 * EXPORT
\*------------------------------------------------------------*/
export { Point2D, Rect2D, intersect_ray_circle, reflect_ray };