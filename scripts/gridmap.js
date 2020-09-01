(function() {

/*------------------------------------------------------------*\
 * Point2D
\*------------------------------------------------------------*/
function Point2D(x,y) {
    if (x instanceof Array) {
        y = x[1];
        x = x[0];
    } else if (typeof x == "object" && "x" in x) {
        if ("y" in x) { y = x.y; }
        x = x.x;
    }
    if (typeof x == "undefined") { x = 0; }
    if (typeof y == "undefined") { y = x; }
    if (typeof x != "number") { throw "Error: Point2D.x must be a number!"; }
    if (typeof y != "number") { throw "Error: Point2D.y must be a number!"; }
    this.x = x;
    this.y = y;
};
Point2D.prototype.clone = function() {
    return new Point2D(this.x,this.y);
};
Point2D.prototype.add = function(x,y) {
    var pt = new Point2D(x,y);
    this.x += pt.x;
    this.y += pt.y;
    return this;
};
Point2D.prototype.sub = function(x,y) {
    var pt = new Point2D(x,y);
    this.x -= pt.x;
    this.y -= pt.y;
    return this;
};
Point2D.prototype.multiply = function(x,y) {
    var pt = new Point2D(x,y);
    this.x *= pt.x;
    this.y *= pt.y;
    return this;
};
Point2D.prototype.divide = function(x,y) {
    var pt = new Point2D(x,y);
    this.x /= pt.x;
    this.y /= pt.y;
    return this;
};

Point2D.prototype.equal = function(x,y) {
    var pt = new Point2D(x,y),
        dx = this.x - pt.x,
        dy = this.y - pt.y;
    return ((dx*dx+dy*dy) < Number.EPSILON);
};

Point2D.prototype.angleTo = function(x,y) {
    var pt = new Point2D(x,y);
    return Math.atan2(pt.y-this.y,pt.x-this.x) * 180 / Math.PI;
};

Point2D.prototype.fix = function() {
    this.x = Math.floor(this.x);
    this.y = Math.floor(this.y);
    return this;
};

Point2D.prototype.toString = function() {
    return "(" + this.x + "," + this.y + ")";
};

Point2D.prototype.neighborhood = function(radius,self=false) {
    radius = Math.abs(radius);
    var nbs = [], min = radius * radius;
    for(var y=-radius;y<=radius;y++) {
        for(var x=-radius;x<=radius;x++) {
            var d = (y*y) + (x*x);
            if (d==0&&!self) { continue; }
            if (d>min) { continue; }
            nbs.push(this.clone().add(x,y));
        }
    }
    return nbs;
};

/*------------------------------------------------------------*\
 * Roll by Array
\*------------------------------------------------------------*/
function roll(min,max,conti) {
    if (min instanceof Array) {
        return min[Math.floor(Math.random()*min.length)];
    }
    var base = Math.min(min,max),
        range = Math.max(min,max) - base;
    if (range==0) {
        return (conti===true)
            ? function() { return base; }
            : base;
    }
    if (range<0) { throw "Error: roll range < 0."; }
    return (conti===true)
        ? function() { return Math.floor(Math.random()*range) + base; }
        : Math.floor(Math.random()*range) + base;
};

/*------------------------------------------------------------*\
 * Radian
\*------------------------------------------------------------*/
const CIRCLE = 2 * Math.PI;
function normalizeRadian(r) {
    while (r<0) { r += CIRCLE; }
    return r % CIRCLE;
};

function measureRadian(f,t) {
    return normalizeRadian(t-f);
}

/*------------------------------------------------------------*\
 * Grid & Chunk & GridMap
\*------------------------------------------------------------*/
function Grid(color) {
    this.occupied = -1;
    this.visited = 0;
    this.color = color;
};
const EmptyGrid = new Grid(0),
    GridReveal = new Grid(0),
    GridBlock = new Grid(0),
    GridEnter = new Grid(0);

function Chunk(edge,xy) {
    this.data = [];
    this.position = (new Point2D(xy)).fix();
    this.edge = edge;
    this.size = edge * edge;
    this.clear();
    //console.log("New Chunk at "+this.position.toString());
};
Chunk.prototype.clear = function() {
    this.data = [];
    for(var i=0;i<this.size;i++) {
        this.data.push(new Grid(0));
    }
};
Chunk.prototype.set = function(x,y,c) {
    if(x<0 || x>=this.edge) { return; }
    if(y<0 || y>=this.edge) { return; }
    if(isNaN(c)) { throw ""; }
    this.data[(y*this.edge+x)].color = c;
};
Chunk.prototype.seek = function(x,y) {
    if (x instanceof Point2D) {
        y = x.y;
        x = x.x;
    }
    if(x<0 || x>=this.edge) { return; }
    if(y<0 || y>=this.edge) { return; }
    return this.data[(y*this.edge+x)];
};

function GridMap(chunk_size) {
    this.size = chunk_size;
    this.chunks = {};
    this.palette = [null];
};
GridMap.prototype.find = function(xy) {
    xy = new Point2D(xy);
    var fixed = xy.clone().divide(this.size).fix();
    return fixed;
};
GridMap.prototype.set = function(xy,data) {
    var pt = new Point2D(xy).fix();
    var chunk_pos = this.find(pt),
        chunk_id = chunk_pos.toString();
    if (!(chunk_id in this.chunks)) {
        this.chunks[chunk_id] = new Chunk(
            this.size,
            chunk_pos.clone().multiply(this.size)
        );
    }
    var chunk = this.chunks[chunk_id],
        rp = pt.clone().sub(chunk.position);
    if (data instanceof Grid) {
        var g = chunk.seek(rp);
        switch(data) {
        case GridReveal:
            g.occupied = 1;
            break;
        case GridBlock:
            g.occupied = 0;
            break;
        case GridEnter:
            g.visited++;
            break;
        default:
            break;
        }
        return;
    }
    var pid = this.palette.indexOf(data);
    if (pid<0) {
        pid = this.palette.length;
        //if (pid>256) { throw "Error: Palette is full!"; }
        this.palette.push(data);
    }
    chunk.set(rp.x,rp.y,pid);
};
GridMap.prototype.clip = function(xy,width,height) {
    var pt = new Point2D(xy).fix();
    if (height==null) { height = width; }
    var mapdata = [], palette = {};
    for(var y=0;y<height;y++) {
        for(var x=0;x<width;x++) {
            var p = pt.clone().add(x,y),
                chunk_id = this.find(p).toString();
            if (!(chunk_id in this.chunks)) {
                mapdata.push(EmptyGrid);
                continue;
            }
            var chunk = this.chunks[chunk_id];
            var g = chunk.seek(p.clone().sub(chunk.position));
            mapdata.push(g);
            if (!(g.color in palette)) {
                palette[g.color] = this.palette[g.color];
            }
        }
    }
    return [mapdata,palette];
};
GridMap.prototype.peek = function(xy,radius) {
    var pt = new Point2D(xy).fix().sub(radius);
    return this.clip(pt,radius*2+1);
};
GridMap.prototype.seek = function(xy) {
    var pt = new Point2D(xy).fix();
    var chunk_id = this.find(pt).toString();
    if (!(chunk_id in this.chunks)) { return EmptyGrid; }
    var chunk = this.chunks[chunk_id];
    return chunk.seek(pt.clone().sub(chunk.position));
};


/*------------------------------------------------------------*\
 * Observer
\*------------------------------------------------------------*/
function Observer(explore) {
    this.position = null;
    this.moveable = [];
    this.explore = explore;
};
Observer.prototype.move = function(x,y) {
    //console.log(x,y);
    this.position = new Point2D(x,y);
};
Observer.prototype.automove = function() {
    if (this.moveable.length<=0) { return null; }
    return roll(this.moveable);
};


/*------------------------------------------------------------*\
 * AutoMap Singleton
\*------------------------------------------------------------*/
var map = null, observers = {}, ob = null;
window.AutoMap = {

"initialize": function(size = 10) {
    if (ob==null) {
        var obs = Object.keys(observers);
        if (obs.length<=0) { throw "Error: No observer!"; }
        ob = observers[roll(obs)];
    }
    map = new GridMap(size);
    map.set([0,0],GridReveal);
    this.enter(0,0);
},

"register": function(name,explore) {
    observers[name] = new Observer(explore);
},

"use": function(name) {
    if (name in observers) {
        ob = observers[name];
    }
},

"enter": function(x,y) {
    ob.move(x,y);
    map.set(ob.position,GridEnter);
    ob.explore(map);
},

"update": function() {
    var pt = ob.automove();
    this.enter(pt);
},

"draw": function(canvas,painter) {
    if (painter==null) { painter = this.defaultPainter; }
    const grid_size = painter.size,
        grid_half = grid_size / 2;
    var ctx = canvas.getContext("2d"),
        center = new Point2D(canvas.width/2,canvas.height/2),
        maximum = center.clone().divide(grid_size).fix().add(1).multiply(-1);
    var w = maximum.x * -2 + 1,
        h = maximum.y * -2 + 1,
        leftop = maximum.clone().add(ob.position),
        [grids,palette] = map.clip(leftop,w,h);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    grids.map(function(g,i) {
        var x = i % w, y = (i-x) / w,
            nearby = [], tg = g.occupied > 0;
        square(1).map(function(d) {
            var pos = leftop.clone().add(x,y).add(d),
                ng = map.seek(pos);
            if (ng.occupied>0) { nearby.push(tg?1:0); }
            else { nearby.push(tg?0:1); }
        });
        painter.drawGrid(
            ctx,
            new Point2D(x,y).add(maximum).multiply(grid_size).add(center),
            g,nearby
        );
    });
    // Observer
    painter.drawObserver(ctx,center);
},

"defaultPainter": {
    "size": 10,
    "position": new Point2D(0,0),
    "drawGrid": function(ctx,cp,grid,nearby) {
        const half = this.size / 2;
        ctx.beginPath();
        ctx.moveTo(cp.x-half,cp.y-half);
        ctx.lineTo(cp.x+half,cp.y-half);
        ctx.lineTo(cp.x+half,cp.y+half);
        ctx.lineTo(cp.x-half,cp.y+half);
        ctx.closePath();
        ctx.fillStyle = (grid.occupied>0)
            ? "white"
            : ((grid.occupied==0) ? "black" : "gray");
        ctx.fill();
        ctx.strokeStyle = "lightgray";
        ctx.stroke();
    },
    "drawObserver": function(ctx,cp) {
        const half = this.size / 2;
        ctx.beginPath();
        ctx.arc(cp.x,cp.y,half/2,0,2*Math.PI);
        ctx.closePath();
        ctx.fillStyle = "green";
        ctx.fill();
    }
}

};



/*------------------------------------------------------------*\
 * Observer Instance 1
\*------------------------------------------------------------*/
function square(radius) {
    const directs = [[0,-1],[1,0],[0,1],[-1,0]];
    var vectors = [],
        s = new Point2D(-radius,0);
    for(var i=0;i<4;i++) {
        for(var j=0;j<=1;j++) {
            for(var k=0;k<radius;k++) {
                vectors.push(s.clone());
                s.add(directs[(i+j)%4]);
            }
        }
    }
    return vectors;
};
function diamond(radius) {
    var directs = [[1,-1],[1,1],[-1,1],[-1,-1]];
    var vectors = [],
        s = new Point2D(-radius,0);
    for(var i=0;i<4;i++) {
        for(var k=0;k<radius;k++) {
            vectors.push(s.clone());
            s.add(directs[i%4]);
        }
    }
    return vectors;
};
function corner(radius) {
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(function(d) {
        return (new Point2D(d)).multiply(radius);
    });
};

const RADIAN = Math.PI / 180;
const cornors = [[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]];
function EyeRayBlock(dx,dy) {
    var delta = new Point2D(dx,dy);
    var r = Math.atan2(delta.y,delta.x),
        min = 0, max = 0;
    cornors.map(function(c) {
        var d = new Point2D(c).add(delta),
            dr = Math.atan2(d.y,d.x),
            rr = dr - r;
        if (r==Math.PI && dr<0) { rr = dr + Math.PI; }
        if (rr<min) { min = rr; }
        if (rr>max) { max = rr; }
    });
    this.radian = normalizeRadian(r+min);
    this.range = max - min;
    this.radius2 = delta.x * delta.x + delta.y * delta.y;
};
EyeRayBlock.prototype.visible = function(dx,dy) {
    var delta = new Point2D(dx,dy),
        r = measureRadian(this.radian,Math.atan2(delta.y,delta.x));
    if (r<=0 || r>=this.range) { return true; }
    var r2 = delta.x * delta.x + delta.y * delta.y;
    return (r2<this.radius2);
};

AutoMap.register("WildTamer",function(gridmap) {
    const vision = 3;
    var blocks = [], that = this;
    this.moveable = [];
    for(var r=1;r<=vision;r++) {
        var current = blocks.slice(0);
        square(r).map(function(d) {
            var blocked = false;
            current.map(function(b) {
                blocked |= !b.visible(d);
            });
            //console.log(d,blocked);
            if (blocked) { return; }
            var pos = d.clone().add(that.position);
            var g = gridmap.seek(pos);
            if (g.occupied>=0) {
                if (g.occupied>0) {
                    that.moveable.push(pos);
                }
                return;
            }
            if (Math.random()<0.8) {
                gridmap.set(pos,GridReveal);
                that.moveable.push(pos);
                return;
            }
            map.set(pos,GridBlock);
            blocks.push(new EyeRayBlock(d));
        });
    }
});

AutoMap.register("DungeonDiger",function(gridmap) {
    const room = 2;
    var that = this;
    gridmap.set(this.position,GridReveal);
    if (room>1) {
        for(var r=1;r<room;r++) {
            square(r).map(function(d) {
                var pos = d.clone().add(that.position);
                gridmap.set(pos,GridReveal);
            });
        }
    }
    this.moveable = [];
    diamond(1).map(function(d) {
        var dir = d.clone().multiply(room),
            pos = that.position.clone().add(dir),
            next = pos.clone().add(dir),
            g = gridmap.seek(pos);
        //console.log(next);
        if (g.occupied>=0) {
            if (g.occupied>0) {
                that.moveable.push(next);
            }
            return;
        }
        var gd = GridBlock;
        if (Math.random()<0.8) {
            gd = GridReveal;
            that.moveable.push(next);
        }
        map.set(pos,gd);
        var side = new Point2D(d.y,-d.x);
        for(var i=1;i<room;i++) {
            map.set(side.clone().multiply(i).add(pos),gd);
            map.set(side.clone().multiply(-i).add(pos),gd);
        }
    });
    corner(room).map(function(d) {
        var pos = d.clone().add(that.position),
            wall = false, count = 0;
        var c = gridmap.seek(pos);
        if (c.occupied>=0) { return; }
        diamond(1).map(function(wd) {
            var g = gridmap.seek(pos.clone().add(wd));
            if (g.occupied==0) { wall = true; }
            else if (g.occupied>0) { count++; }
        });
        if (wall) { gridmap.set(pos,GridBlock); }
        else if (count>=3) { gridmap.set(pos,GridReveal); }
    });
});


})();