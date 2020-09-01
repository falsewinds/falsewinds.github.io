(function() {

/*------------------------------------------------------------*\
 * Point2D
\*------------------------------------------------------------*/
function Point2D(x,y) {
    if (x instanceof Array) {
        y = x[1];
        x = x[0];
    } else if (x instanceof Point2D) {
        y = x.y;
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
function roll(array) { return array[Math.floor(Math.random()*array.length)]; };

/*------------------------------------------------------------*\
 * Environment & Cell
\*------------------------------------------------------------*/
function Cell(position,departure,door) {
    this.position = new Point2D(position);
    this.size = 1;
    this.exits = {};
    this.items = [];
    if (departure instanceof Cell) {
        var angle = this.position.angleTo(departure.position);
        this.exits["deg"+angle] = departure;
        if (door!=null) {
            // TODO: door...?
            this.items.push(door);
        }
    }
};

Cell.prototype.deploy = function(item) { this.items.push(item); };

function Dungeon() {
    this.levels = {};
    this.current = null;
};

Dungeon.prototype.create = function(id) {
    if (id in this.levels) { throw "Error: Same ID."; }
    this.levels[id] = {};
    if (this.current==null) { this.current = id; }
    return id;
};

Dungeon.prototype.use = function(id) {
    if (!(id in this.levels)) { return; }
    this.current = id;
};

Dungeon.prototype.expand = function(cell) {
    if (!(this.current in this.levels)) { return; }
    if (!(cell instanceof Cell)) { return; }
    var pt = cell.position.toString(),
        lv = this.levels[this.current];
    if (!(pt in lv)) { return; }
    // TODO: expand cell
};


/*------------------------------------------------------------*\
 * Mover
\*------------------------------------------------------------*/
const TOTAL = 60;
function Mover(name) {
    this.name = name;
    this.target = null;
    this.progress = 0;
    this.path = [];
};

Mover.prototype.toward = function(x,y) {
    this.target = new Point2D(x,y);
    this.progress = (this.path.length==0) ? TOTAL : 0;
};

Mover.prototype.backward = function() {
    return this.path[this.path.length-2];
};

Mover.prototype.search = function(map) {
    var options = [],
        p = this.position(1),
        c = map[p.toString()];
    for(var d in c.exits) {
        var e = c.exits[d], pt = e.position;
        if (e.entered<=0) { options.push(pt); }
    }
    return options;
};

Mover.prototype.move = function(speed) {
    this.progress += speed;
    if (this.progress>=TOTAL) {
        var index = -1;
        for(var i=0;i<this.path.length;i++) {
            var p = this.path[i];
            if (this.target.equal(p)) {
                index = i;
                break;
            }
        }
        if (index>=0) {
            var count = this.path.length - index;
            this.path.splice(index+1,count-1);
        } else { this.path.push(this.target); }
        return true;
    }
    return false;
};

Mover.prototype.position = function(scale) {
    var max = this.path.length, prev = this.path[max-1].clone();
    if (this.progress<TOTAL) {
        var d = this.target.clone().sub(prev);
        prev.add(d.multiply(this.progress/TOTAL));
    }
    return prev.multiply(scale);
};

/*------------------------------------------------------------*\
 * DungeonMap
\*------------------------------------------------------------*/
const LINE = 12, GRID = 12;
var canvas = null, ctx = null;
var area = {}, covered = [], miner = new Mover("礦工");
var monsters = {}, envs = {}, hero = new Combatant("勇者",1,100);
window.DungeonMap = {

"initialize": function(c) {
    if (typeof c == "string") { c = document.getElementById(c); }
    if (!(c instanceof HTMLCanvasElement)) { throw "Error: not a CANVAS."; }
    ctx = c.getContext("2d");
    canvas = c;
    var resizeCanvas = function() {
        var p = canvas.parentNode;
        canvas.width = p.offsetWidth;
        canvas.height = p.offsetHeight;
        ctx.fillStyle = "white";
        ctx.fillRect(0,0,canvas.width,canvas.height);
    };
    window.addEventListener("resize",resizeCanvas);
    resizeCanvas();
    miner = new Mover("礦工");
    /*hero = new Combatant("勇者",1,100);
    hero.addAttack(Attack("正拳","physic:bludgeoning",1,3,null));*/
    //center = new Point2D();
    var entrance = DungeonMap.generate([0,0]);
    DungeonMap.enter(miner,entrance);
},

"generate": function(position,departure,door) {
    if (!(position instanceof Point2D)) { position = new Point2D(position); }
    var pt = position.toString();
    if (!(pt in area)) {
        area[pt] = {
            "position": position,
            "exits": {},
            "items": [],
            "entered": 0
        };
        covered.push(pt);
        if (departure!=null) {
            var angle = position.angleTo(departure.position);
            area[pt].exits = {};
            area[pt].exits["deg"+angle] = departure;
            if (door!=null) {
                // TODO: door...?
                area[pt].items.push(door);
            }
        }
        // TODO: generate Monster & Item -> determine cell name
    }
    return area[pt];
},

"enter": function(actor,dest) {
    if (dest.entered<=0) {
        var vi = covered.indexOf(dest.position.toString());
        if (vi>=0) { covered.splice(vi,1); } else { console.log(dest); }
        var exits = roll(covered.length>20 ? [1,2,2] : [1,2,2,2,2,2,2,3,3,4]),
            nb = dest.position.neighborhood(1);
        //nb.splice(3,1);
        if ("exits" in dest) {
            Object.keys(dest.exits).map(function(e) {
                var i = nb.indexOf(e);
                if (i>=0) { nb.splice(i,1); }
                exits--;
            });
        } else { dest.exits = {}; }
        while(exits>0) {
            if (nb.length<=0) { break; }
            var d = roll(nb), i = nb.indexOf(d);
            nb.splice(i,1);
            if (d.toString() in area) { continue; }
            var angle = dest.position.angleTo(d),
                dir = "deg" + angle;
            // TODO: door?
            dest.exits[dir] = DungeonMap.generate(d,dest);
            exits--;
        }
    }
    dest.entered++;
    if (actor instanceof Mover) {
        actor.toward(dest.position);
    }
},

"update": function(step) {
    if (covered.length<=0) { return false; }
    if (step==null) { step = 2; }
    if (miner.move(step)) {
        DungeonMap.enter(miner,area[miner.target.toString()]);
        var opt = miner.search(area),
            dir = (opt.length==0) ? miner.backward() : roll(opt);
        miner.toward(dir);
    }
    return true;
},

"draw": function() {
    const g2 = GRID / 2, gap = GRID * 1.5, o2 = gap / 2, l2 = LINE / 2;
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = "black";
    ctx.fillRect(0,0,w,h);
    for(var pt in area) {
        var cell = area[pt],
            p = cell.position.clone().multiply(gap).sub(miner.position(gap)).add(w/2,h/2);
        if ((p.x+g2)<0 || (p.y+g2)<0
         || (p.x-g2)>w || (p.y-g2)>h) { continue; }
        ctx.lineCap = "round";
        ctx.lineWidth = LINE;
        ctx.strokeStyle = "white";
        ctx.beginPath();
        Object.keys(cell.exits).map(function(angle) {
            var degree = angle.substring(3,angle.length),
                radian = parseFloat(degree) * Math.PI / 180;
            ctx.moveTo(p.x+Math.cos(radian)*g2,p.y+Math.sin(radian)*g2);
            ctx.lineTo(p.x+Math.cos(radian)*o2,p.y+Math.sin(radian)*o2);
            ctx.moveTo(p.x+Math.cos(radian)*o2,p.y+Math.sin(radian)*o2);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = (cell.entered>0) ? "white" : "rgb(100,100,100)";
        ctx.fillRect(p.x-g2,p.y-g2,GRID,GRID);
        //ctx.strokeRect(p.x-g2,p.y-g2,GRID,GRID);
    }
    // Show Hero Position
    //var cp = center.clone().multiply(gap).add(w/2,h/2);
    ctx.beginPath();
    ctx.arc(w/2,h/2,GRID*0.3,0,2*Math.PI);
    ctx.closePath();
    ctx.fillStyle = "green";
    ctx.fill();
},

"trigger": function(event,data) {
    var lines = [];
    switch(event) {
    case "damage":
        var s = data[0], t = data[1], n = data[2], dmg = data[3];
        lines.push([ s, "對", t, "使用", n, "！" ]);
        if (dmg>0) {
            var ef = dmg / t.hp;
            lines.push([ n, "對", t, (ef>0.3)?"十分有效！":"有效。" ]);
            lines.push([ t, "受到", dmg, "點傷害。" ]);
        } else { lines.push([ n, "沒有對", t, "造成傷害。" ]); }
        t.hp -= dmg;
        if (t.hp<=0) { DungeonMap.trigger("dead",[t]); }
        break;
    case "miss":
        var s = data[0], t = data[1], n = data[2];
        lines.push([ s, "對", t, "使用", n, "！" ]);
        lines.push([ s, "的", n, "沒有擊中。" ]);
        break;
    case "dead":
        var d = data[0];
        lines.push([ d, "死了！" ]);
        if (d==hero) {
            // TODO: Game Over.
        } else {
            // TODO: remove enemy
        }
        break;
    }
    var str = lines.map(function(line) {
        return line.map(function(term) {
            switch(typeof term) {
            case "string":
            case "number":
                return term;
                break;
            case "object":
                if ("name" in term) { return term["name"]; }
                break;
            case "function":
                return term.call(null,data);
                break;
            }
            return "";
        }).join(" ");
    }).join("<br/>");
    console.log(str);
},

"registerMonster": function(name,hp,attack) {
    
}

};

/*------------------------------------------------------------*\
 * Combatant
\*------------------------------------------------------------*/
function Attack(name,type,min,max,eff) {
    var range = max - min + 1;
    return function(target) {
        if (!(this instanceof Combatant) ||
            !(target instanceof Combatant)) {
            throw "Error: Attack can only from Combatant to Combatant.";
        }
        var ld = this.level - target.level,
            dc = 50 + (ld*ld)*(ld>0?1:-1),
            hit = Math.random() * 100 + 1;
        if (hit>dc) {
            var dmg = Math.floor(Math.random()*range+min);
            if (type in target.defense) {
                var def = target.defense[type];
                dmg = def.call(target,dmg);
                if (dmg<0) { dmg = 0; }
            }
            DungeonMap.trigger("damage",[this,target,name,dmg]);
            if (typeof eff == "function") { eff.apply(this,[target,dmg]); }
        } else {
            DungeonMap.trigger("miss",[this,target,name,dc,hit]);
        }
    };
};
function Liner(a,b) { return function(dmg) { return a * dmg + b; }; };
function Combatant(name,lv,hd) {
    this.name = name;
    this.level = lv;
    this.hp = hd * lv;
    this.defense = {};
    this.attacks = [];
};
Combatant.prototype.addAttack = function(atk) { this.attacks.push(atk); };
Combatant.prototype.addDefense = function(type,df) { this.defense[type] = df; };
//Combatant.prototype.



})();