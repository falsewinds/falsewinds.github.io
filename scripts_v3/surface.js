(function() {

const DEFAULT_EDGE = 4;
const ROUND = Math.PI * 2;

/*------------------------------------------------------------*\
 * Surface
\*------------------------------------------------------------*/
class Surface {
    constructor(size,height) {
        if (isNaN(size)) { size = Math.pow(2,DEFAULT_EDGE) + 1; }
        this.edge = size;
        this.data = [];
        height = isNaN(height) ? undefined : parseFloat(height);
        this.size = size * size;
        for(let i=0;i<this.size;i++) { this.data.push(height); }
        this.min = Infinity;
        this.max = -Infinity;
    };

    copy(heights) {
        if (!(heights instanceof Array)) { throw "Error: need a height array."; }
        if (heights.length!=this.size) { throw "Error: dimension is different."; }
        for(let i=0;i<this.size;i++) {
            let h = heights[i];
            this.data[i] = h;
            if (h>this.max) { this.max = h; }
            if (h<this.min) { this.min = h; }
        }
    };

    set(x,y,h) {
        if (x<0 || x>=this.edge) { return; }
        if (y<0 || y>=this.edge) { return; }
        let index = y * this.edge + x;
        this.data[index] = h;
        if (h>this.max) { this.max = h; }
        if (h<this.min) { this.min = h; }
    };

    get(x,y) {
        if (x<0 || x>=this.edge) { return null; }
        if (y<0 || y>=this.edge) { return null; }
        let index = y * this.edge + x;
        return this.data[index];
    };

    normalize(min,max) {
        if (isNaN(min)) { min = this.min; }
        if (isNaN(max)) { max = this.max; }
        let d = max - min;
        this.data = this.data.map((h)=>{
            return (h-min) / d;
        });
        this.min = 0;
        this.max = 1;
    };

    row(y) {
        if (y<0) { y += this.edge; }
        let end = (y+1) * this.edge;
        if (end>this.data.length) { end = this.data.length; }
        return this.data.slice(y*this.edge,end);
    };
    column(x) {
        if (x<0) { x += this.edge; }
        let column = [];
        for(let y=0;y<this.edge;y++) {
            column.push(this.data[y*this.edge+x]);
        }
        return column;
    };

    expand(expansion,method) {
        let r = isNaN(expansion) ? 1 : parseInt(expansion),
            e = this.edge, l = e - 1, x, y,
            expanded = [];
        if (typeof method != "function") { method = function() { return null; }; }

        for(y=0;y<r;y++) {
            for(x=0;x<r;x++) { expanded.push(method(this,0,0)); }
            for(x=0;x<e;x++) { expanded.push(this.get(x,0)); }
            for(x=0;x<r;x++) { expanded.push(method(this,l,0)); }
        }
        for(y=0;y<e;y++) {
            for(x=0;x<r;x++) { expanded.push(method(this,0,y)); }
            for(x=0;x<e;x++) { expanded.push(this.get(x,y)); }
            for(x=0;x<r;x++) { expanded.push(method(this,l,y)); }
        }
        for(y=0;y<r;y++) {
            for(x=0;x<r;x++) { expanded.push(method(this,0,l)); }
            for(x=0;x<e;x++) { expanded.push(this.get(x,l)); }
            for(x=0;x<r;x++) { expanded.push(method(this,l,l)); }
        }

        return expanded;
    };

    smooth(radius, factor) {
        if (isNaN(radius)) { radius = 2; }
        if (typeof factor != "function") { factor = function() { return 1; }; }
        let kernel = [], x, y,
            e = this.edge, l = e - 1,
            r = radius, expanded = this.expand(r);
        for(y=-r;y<=r;y++) {
            for(x=-r;x<=r;x++) {
                let position = (y+r) * (e+2*r) + (x+r),
                    distance = Math.sqrt(y*y + x*x);
                kernel.push([position,distance]);
            }
        }

        let smoothed = this.data.map((h,i)=>{
            y = Math.floor(i/e);
            let total = 0, count = 0;
            kernel.map(([m,d])=>{
                let eh = expanded[i+y*2*r+m];
                if (eh==null) { return; }
                let f = factor(d);
                count += f;
                total += eh * f;
            });
            return total / count;
        });

        let line_smoother = function(h,i,a) {
            if (i==0 || i==(a.length-1)) { return a[i]; }
            let total = 0, count = 0;
            for(x=-r;x<=r;x++) {
                let d = i + x;
                if (d<0 || d>=a.length) { continue; }
                total += a[d];
                count++;
            }
            return total / count;
        };
        let ys = this.row(0).map(line_smoother),
            ye = this.row(-1).map(line_smoother),
            xs = this.column(0).map(line_smoother),
            xe = this.column(-1).map(line_smoother),
            end = (e-1) * e;
        for(x=0;x<e;x++) {
            smoothed[x] = ys[x];
            smoothed[end+x] = ye[x];
            smoothed[x*e] = xs[x];
            smoothed[(x+1)*e-1] = xe[x];
        }

        this.data = smoothed;
        this.min = this.data.reduce((min,h)=>{ return (h<min)?h:min; },Infinity);
        this.max = this.data.reduce((max,h)=>{ return (h>max)?h:max; },0);
    };

};

/*------------------------------------------------------------*\
 * Widget
\*------------------------------------------------------------*/
const rollf = function() { return Math.random()*2-1; };
const average = function(map,delta) {
    return function(x,y) {
        let total = 0, count = 0;
        delta.map(([dx,dy])=>{
            let h = map.get(x+dx,y+dy);
            if (h==null) { return; }
            total += h;
            count++;
        });
        return total / count;
    };
};
function seek(opt,key,def) {
    //if (typeof opt != "object") { throw; }
    if (!(key in opt)) { return def; }
    let val = opt[key];
    switch (typeof def) {
    case "number":
        if (isNaN(val)) { val = def; }
        else { val = parseFloat(val); }
        break;
    case "string":
        val = "" + val;
        break;
    default:
        if (typeof val != typeof def) { val = def; }
        break;
    }
    return val;
};

/*------------------------------------------------------------*\
 * Export: kjScene
\*------------------------------------------------------------*/
window.kjScene = {

"Surface": Surface,

"generate": function(power,options) {
    if (options==null) { options = {}; }
    if (isNaN(power)) { power = DEFAULT_EDGE; }
    let map = new Surface(Math.pow(2,power)+1);
    /*if (edges instanceof Array) {
        let [top,right,bottom,left] = edges;
        let e = map.edge,
            end = map.size - map.edge;
        for(let i=0;i<map.edge;i++) {
            //map.data[i] = top[i];
            //map.data[end+i] = bottom[i];
            map.data[i*e] = left[i];
            //map.data[(i+1)*e-1] = right[i];
        }
    }*/
    let side = map.edge;
    let divide = function(size) {
        let x, y, h = size / 2;
        let square = average(map,[[-h,-h],[h,-h],[h,h],[-h,h]]),
            diamond = average(map,[[0,-h],[h,0],[0,h],[-h,0]]);
        if (h<1) { return 0; }
        for(y=h;y<side;y+=size) {
            for(x=h;x<side;x+=size) {
                if (map.get(x,y)!==undefined) { continue; }
                let v = square(x,y) + rollf() * size;
                map.set(x,y,v);
            }
        }
        for(y=0;y<side;y+=h) {
            for(x=(y+h)%size;x<side;x+=size) {
                if (map.get(x,y)!==undefined) { continue; }
                let v = diamond(x,y) + rollf() * size;
                map.set(x,y,v);
            }
        }
        return h;
    };

    let last = side - 1;
    [[0,0],[last,0],[last,last],[0,last]].map(([x,y])=>{
        if (map.get(x,y)!==undefined) { return; }
        map.set(x,y,rollf()*last);
    });
    let next = last;
    while (next>0) { next = divide(next); }

    return map;
},

"analysis": function(map,options) {
    if (options==null) { options = {}; }
    let max = 0, x, y, e = map.edge,
        xdiff = [], ydiff = [];
    for(y=0;y<e;y++) {
        xdiff[y] = [];
        for(x=0;x<e;x++) {
            if (y==0) { ydiff[x] = []; }
            let ch = map.get(x,y), xd = 0, yd = 0;
            if (y>0) {
                yd = ch - map.get(x,y-1);
                ydiff[x].push(yd);
            }
            if (x>0) {
                xd = ch - map.get(x-1,y);
                xdiff[y].push(xd);
            }
            let m = Math.max(Math.abs(xd),Math.abs(yd));
            if (m>max) { max = m; }
        }
    }
    let flat = seek(options,"flat",max*0.25),
        results = [], l = e - 1;
    //console.log(flat,xdiff,ydiff);
    let judge = function(dh) {
        if (Math.abs(dh)<flat) { return 0; }
        return dh<0 ? -1 : 1;
    };

    const sides = [
        [1,3,3],
        [2,4,3],
        [2,2,0]
    ];
    const types = [
        [  "hill", "cross", "ridge", "ridge", "ridge" ],
        [ "cross",   "pit","valley","valley","valley" ],
        [ "ridge","valley","rigbot","rigtop", "right" ],
        [ "ridge","valley","lefbot","leftop",  "left" ],
        [ "ridge","valley","bottom",   "top", "plain" ]
    ];
    for(y=0;y<e;y++) {
        for(x=0;x<e;x++) {
            let top = judge(y<1 ? 0 : ydiff[x][y-1]),
                bot = judge(y<l ? -ydiff[x][y] : 0),
                lef = judge(x<1 ? 0 : xdiff[y][x-1]),
                rig = judge(x<l ? -xdiff[y][x] : 0),
                ns = sides[bot+1][top+1],
                ew = sides[lef+1][rig+1];
            results.push(types[ew][ns]);
        }
    }
    return results;
},

"toGeometry": function(map,options) {
    if (!kjSolid || !kjSolid.Geometry) { throw "Error: need kjSolid.Geometry script."; }
    if (options==null) { options = {}; }
    let g = new kjSolid.Geometry(), e = map.edge;
    let grid = 1, height = 1, cx = 0, cy = 0, cz = 0;
    if ("gridsize" in options) { grid = options["gridsize"]; }
    if ("height" in options) { height = options["height"]; }
    let x, y;
    for(y=0;y<e;y++) {
        for(x=0;x<e;x++) {
            let h = map.get(x,y);
            g.addVertice(x*grid,h*height,y*grid);
            if (x>0 && y>0) {
                g.addTriangle((y-1)*e+(x-1),y*e+(x-1),(y-1)*e+x);
                g.addTriangle((y-1)*e+ x   ,y*e+(x-1), y   *e+x);
            }
        }
    }
    return g;
}

};


})();