(function() {
//------------ >> Begin of storyline.js >>
const DEBUG = true;

/*------------------------------------------------------------*\
 * 
\*------------------------------------------------------------*/
function _uuid() {
    var d = Date.now();
    if (typeof performance !== "undefined"
     && typeof performance.now === "function") {
        //use high-precision timer if available
        d += performance.now();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,
        function (c) {
            var r = (d + Math.random() * 16) % 16 | 0;
            d = Math.floor(d / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }
    );
};

var names = {}, variables = [];
function _find(n,type) {
    if (n instanceof type) { return n; }
    if (typeof n === "string") {
        var k = type.name + "#" + n;
        if (k in names) { return names[k]; }
    }
    return null;
};
function _finds(type,va = true) {
    var set = [];
    for(var k in names) {
        var o = names[k];
        if (o instanceof type) { set.push(o); }
    }
    if (va!==false) {
        variables.map(function(v) {
            if (v.type==type) { set.push(v); }
        });
    }
    return set;
};

function _toString(o) {
    if (typeof o == "string") { return o; }
    if (o==null) { return ""; }
    if ("name" in o) { return o.name; }
    if (o instanceof Variable) { return "some-" + o.type.name; }
    if (o instanceof Sentence) { return kjStory.describe(o); }
    if (DEBUG) { throw new Exception("Unnamed object",[o]); }
    return "";
};

function _uniquef(a) {
    if (!(a instanceof Array)) { throw "Error: a is not Array."; }
    return function(o) {
        if (a.indexOf(o)<0) { a.push(o); }
    }
};

function roll(arr,ex) {
    var max = arr.length + 1,
        idx = Math.floor(Math.random()*max),
        r = arr[idx];
    if (ex===true) { arr.splice(idx,1); }
    return r;
};

function rollf(min,max) {
    var base = Math.min(min,max),
        range = Math.max(min,max) - base;
    return function() {
        return Math.floor(Math.random()*range) + base;
    };
};

function _rollf(arr) {
    var max = arr.length;
    return function(exclude) {
        var idx = Math.floor(Math.random()*max),
            r = arr[idx];
        if (exclude===true) {
            arr.splice(idx,1);
            max--;
        }
        return r;
    };
};

function _roll(arr,ex) {
    var max = arr.length,
        idx = Math.floor(Math.random()*max),
        r = arr[idx];
    if (ex===true) { arr.splice(idx,1); }
    return r;
};

function _typename(names, types) {
    if (names.length!=types.length) { return null; }
    return function(o) {
        var tn = "";
        types.map(function(t,i) {
            if (o instanceof t) {
                tn = names[i];
            }
        });
        return tn;
    }
}

function _rankname(names, ranks) {
    var rank_count = ranks.length, last;
    if ((names.length-rank_count)!=1) { return null; }
    return function(rank) {
        var ni = 0, r;
        for(var i=0;i<rank_count;i++) {
            r = ranks[i];
            if (rank<r) { break; }
            ni++;
        }
        if (rank>r) { ni++; }
        return names[ni];
    }
}

function _fixFloat(num,digit) {
    if (num%1==0 || digit<=0) { return num; }
    var r = num.toString(),
        dot = r.indexOf(".");
    return r.substring(0,dot+1+digit);
}


/*------------------------------------------------------------*\
 * CLASS Exception
\*------------------------------------------------------------*/
function Exception(msg,args) {
    this.message = msg;
    this.arguments = args;
};


/*------------------------------------------------------------*\
 * Story Entities
 - Char : character in story
 - Area : place in story
 - Item : MacGuffin
 - Variable
 - Sentence
 - Event
\*------------------------------------------------------------*/
function Char(name) {
    this.id = _uuid();
    this.name = name;
    this.area = null;
    this.goals = [];
    this.beliefs = [];
    this.inventory = [];
    names["Char#"+name] = this;
};
Char.prototype.has = function(item) {
    item = _find(item,Item);
    if (item==null) {
        if (DEBUG) { throw new Exception("not Item.",[item]); }
        return false;
    }
    return (item.id in this.inventory);
};
Char.prototype.at = function(area) {
    area = _find(area,Area);
    if (area==null) {
        if (DEBUG) { throw new Exception("not Area.",[area]); }
        return false;
    }
    return (this.area==area);
};

function Area(name) {
    this.id = _uuid();
    this.name = name;
    this.people = [];
    names["Area#"+name] = this;
};

function Item(name) {
    this.id = _uuid();
    this.name = name;
    this.owner = null;
    names["Item#"+name] = this;
};

function Variable(type) {
    if (ArgumentSchema.indexOf(type)<0) {
        throw new Exception("Variable type should be one of "
            + ArgumentSchema.map(_toString).join(",")
            + ".",[type]);
    }
    this.id = _uuid();
    this.type = type;
    this.usage = [];
    variables.push(this);
};
Variable.prototype.merge = function(v) {
    if (v==this) { return; }
    if (v.type!=this.type) {
        throw new Exception("Can not merge Variables with different type.",[this,v]);
        return;
    }
    var that = this, useby = _uniquef(this.usage);
    v.usage.map(function(s) {
        var i = s.content.indexOf(v);
        if (i>=0) {
            s.content[i] = that;
            useby(s);
        }
    });
};
Variable.prototype.solve = function(o) {
    if (!(o instanceof this.type)) { return; }
    var v = this;
    this.usage.map(function(s) {
        var i = s.content.indexOf(v);
        if (i>=0) { s.content[i] = o; }
    });
    var i = variables.indexOf(this);
    variables.splice(i,1);
};

function Sentence(ev,args) {
    this.id = _uuid();
    this.predicate = ev;
    this.content = args;
    this.timestamp = 0;
    var s = this;
    args.map(function(o) {
        if (o instanceof Variable) {
            o.usage.push(s);
        }
    });
};
/*Sentence.prototype.equal = function(s) {
    if (!(s instanceof Sentence)) { return false; }
    if (this.type!=s.type) { return false; }
    var s_args = this.type.order ? s.content : s.content.slice().sort(arg_sort),
        myargs = this.type.order ? this.content : this.content.slice().sort(arg_sort);
    var same = myargs.map(function(o,i) { return o == s_args[i]; });
    return (same.indexOf(false)<0);
};*/
Sentence.prototype.declared = function() {
    var v = this.content.map(function(o) {
        if (o instanceof Sentence) {
            return !o.declared();
        }
        return (o instanceof Variable);
    });
    return (v.indexOf(true)<0);
};
Sentence.prototype.variables = function() {
    var vs = [], vspush = _uniquef(vs);
    this.content.map(function(o) {
        if (o instanceof Sentence) {
            o.variables().map(function(v) { vspush(v); });
            return;
        }
        if (o instanceof Variable) { vspush(o); }
    });
    return vs;
};
Sentence.prototype.validate = function() {
    var s = this;
    var valids = this.predicate.validaters.map(function(v) {
        return v.apply(s,s.content)!==false;
    });
    return (valids.indexOf(false)<0);
};
Sentence.prototype.realized = function() {
    var s = this;
    this.predicate.listeners.map(function(f) {
        f.apply(s,s.content);
    });
};
Sentence.prototype.match = function(filters) {
    if (!(filters instanceof Array)) { filters = [filters]; }
    var pred = this.predicate, content = this.content;
    if ("area" in this) { content.push(this.area); }
    var chk = filters.map(function(f) {
        if ("predicate" in f && f["predicate"]!=pred) { return false; }
        if ("contains" in f) {
            var contains = f["contains"].map(function(c) {
                return content.indexOf(c)>=0;
            });
            if (contains.indexOf(false)>=0) { return false; }
        }
        if ("content" in f) {
            if (f["content"].length!=content.length) { return false; }
            var contents = f["content"].map(function(c,i) {
                return c==content[i];
            });
            if (contents.indexOf(false)>=0) { return false; }
        }
        return true;
    });
    return chk.indexOf(true) >= 0;
};

Sentence.Search = function(sentences,filters) {
    if (!(sentences instanceof Array)) { sentences = [sentences]; }
    //if (!(filters instanceof Array)) { filters = [filters]; }
    var matched = [];
    sentences.map(function(s,i) {
        if (!(s instanceof Sentence)) { return; }
        if (s.match(filters)) {
            matched.push(s);
        }
    });
    return matched;
};

const ArgumentSchema = [Char,Area,Item,Sentence];
function arg_index(a) {
    var n = ArgumentSchema.indexOf(a);
    if (n<0) {
        if (a instanceof Variable) {
            var types = ArgumentSchema.map(_toString);
            n = types.indexOf(a.type);
        }
        ArgumentSchema.map(function(type,i) {
            if (a instanceof type) { n = i; }
        });
    }
    return n;
};
function arg_sort(a1,a2) {
    var a1n = arg_index(a1),
        a2n = arg_index(a2);
    if (a1n<0 || a2n<0) {
        throw new Exception("arguments should be one of "
            + ArgumentSchema.map(_toString).join(",")
            + ".",[a1,a2]);
    }
    if (a1==a2) { return 0; }
    if (a1n==a2n) {
        if ("id" in a1 && "id" in a2) {
            return (a1.id<a2.id) ? -1 : 1;
        }
        return 0;
    }
    return (a1n<a2n) ? -1 : 1;
};

function Event(args) {
    var checks = [];
    if (args instanceof Array) {
        args.map(function(a) {
            var checked = false, arr = (a instanceof Array);
            switch(typeof a) {
            case "function":
                checked = ArgumentSchema.indexOf(a)<0;
                break;
            case "object":
                if (arr) {
                    checked = (a.map(function(aa) {
                        return ArgumentSchema.indexOf(a)<0;
                    }).indexOf(true)) >= 0;
                }
                break;
            default:
                break;
            }
            if (checked<0) {
                throw new Exception("arguments should be one of "
                    + ArgumentSchema.map(_toString).join(",")
                    + ".",[a,args]);
                return;
            }
            checks.push(arr?a:[a]);
        });
    }
    this.types = checks;
    this.describer = null;
    this.listeners = [];
    this.validaters = []
};
Event.prototype.build = function(args) {
    if (!(args instanceof Array)) {
        throw new Exception("arguments should be Array.",[args]);
        return null;
    }
    var checks = this.types.map(function(t,i) {
        var a = args[i];
        if (a instanceof Variable) {
            return t.indexOf(a.type)>=0;
        }
        var chk = t.map(function(to) {
            return (a instanceof to);
        });
        return chk.indexOf(true)>=0;
    });
    if (checks.indexOf(false)>=0) {
        throw new Exception("arguments not match.",[this.types,args,checks]);
        return null;
    }
    return new Sentence(this,args);
};
Event.prototype.listen = function(callback) {
    if (typeof callback != "function") {
        throw new Exception("listener should be function.",[callback]);
        return;
    }
    this.listeners.push(callback);
};
Event.prototype.verify = function(callback) {
    if (typeof callback != "function") {
        throw new Exception("validater should be function.",[callback]);
        return;
    }
    this.validaters.push(callback);
};


/*------------------------------------------------------------*\
 * Detail System
\*------------------------------------------------------------*/
var systems = [];
function DetailSystem(name,init) {
    this.name = name;
    if (typeof init == "function") { init.call(this); }
    systems.push(this);
};
DetailSystem.prototype.view = function(s) {};
//DetailSystem.prototype.view = function(s) {};

/*------------------------------------------------------------*\
 * kjStory
\*------------------------------------------------------------*/
var world = [], timemark = 0;
window.kjStory = {

"deploy": function(type, name) {
    var o = null;
    switch (type.toLowerCase()) {
    case "area":
    case "place":
        o = new Area(name);
        break;
    case "char":
    case "character":
    case "people":
    case "person":
        o = new Char(name);
        break;
    case "item":
        o = new Item(name);
        break;
    }
    return o;
},

"weave": function(sentences) {
    if (!(sentences instanceof Array)) { sentences = [sentences]; }
    var ignores = [], nextaction = {}, actions = _roll([8,24,28]);
    while(sentences.length>0) {
        var s = sentences.shift();
        if (!(s instanceof Sentence)) { continue; }
        if (world.indexOf(s)>=0) { continue; }
        if (!s.declared() || !s.validate()) {
            ignores.push(s);
            continue;
        }
        var c = s.content[0],
            max = (s.predicate==kjStory.Event.Move) ? 48 : 5;
        if (c instanceof Char) {
            var min = 1;
            if (c.id in nextaction) {
                var next = nextaction[c.id];
                if (timemark<=next) {
                    timemark = nextaction[c.id] + 1;
                    actions = _roll([8,24,28]);
                } else { min = timemark - next; }
            } else { nextaction[c.id] = timemark; }
            nextaction[c.id] += Math.floor(Math.random()*max)+min;
        }
        s.timestamp = timemark;
        world.push(s);
        s.realized();

        actions--;
        if (actions==0) {
            timemark += Math.floor(Math.random()*10)+1;
            actions = _roll([8,24,48]);
        }
    }
    return ignores;
},

"finds": function(type) {
    var results = [];
    switch (type.toLowerCase()) {
    case "area":
    case "place":
        results = _finds(Area);
        break;
    case "char":
    case "character":
    case "people":
    case "person":
        results = _finds(Char);
        break;
    case "item":
        results = _finds(Item);
        break;
    }
    return results;
},

"search": function(filters) {
    return Sentence.Search(world,filters);
},

"describe": function(s) {
    var writer = s.predicate.describer;
    if (writer!=null) {
        return writer.apply(s,s.content);
    }
    var verb = "";
    Object.keys(kjStory.Event).map(function(v) {
        if (kjStory.Event[v]==s.predicate) {
            verb = v.toLowerCase();
        }
    });
    return [s.content[0],verb,s.content[1]].map(_toString).join(" ")+".";
},

"Event": {
    "Meet": new Event([Char,Char]),
    "Gain": new Event([Char,Item]),
    "Lose": new Event([Char,Item]),
    "Move": new Event([Char,Area])
},

"Meta": {
    "In": new Event([[Char,Area,Item]]),
    "Out": new Event([[Char,Area,Item]]),
    "Not": new Event([Sentence]),
    "Cause": new Event([Sentence,Sentence])
}

};

kjStory.Event.Meet.describer = function(c1,c2) {
    return [c1,"和",c2,"在",this.area,"相遇"].map(_toString).join(" ")+"。";
};
kjStory.Event.Meet.verify(function(c1,c2) { return (c1.area==c2.area); });
kjStory.Event.Meet.listen(function(c1,c2) { this.area = c1.area; });
kjStory.Event.Gain.describer = function(c,i) {
    return [c,"在",this.area,"得到了",i].map(_toString).join(" ")+"。";
};
kjStory.Event.Gain.verify(function(c,i) { return (i.owner==null); });
kjStory.Event.Gain.listen(function(c,i) {
    this.area = c.area;
    i.owner = c;
    c.inventory.push(i);
});
kjStory.Event.Lose.describer = function(c,i) {
    return [c,"在",this.area,"失去了",i].map(_toString).join(" ")+"。";
};
kjStory.Event.Lose.verify(function(c,i) { return (i.owner==c); });
kjStory.Event.Lose.listen(function(c,i) {
    this.area = c.area;
    i.owner = null;
    var idx = c.inventory.indexOf(i);
    c.inventory.splice(idx,1);
});
kjStory.Event.Move.describer = function(c,a) {
    return [c,"離開",this.area,"前往",a].map(_toString).join(" ")+"。";
};
kjStory.Event.Move.verify(function(c,a) { return (c.area!=a); });
kjStory.Event.Move.listen(function(c,a) {
    this.area = c.area;
    var idx = c.area.people.indexOf(c);
    c.area.people.splice(idx,1);
    a.people.push(c);
    c.area = a;
});

/*------------------------------------------------------------*\
 * DetailSystem: Romance
\*------------------------------------------------------------*/
var Romance = new DetailSystem("Romance",function() {

Char.prototype.relate = function(c, val = 0) {
    if (!("relations" in this)) { this.relations = {}; }
    if (!(c.id in this.relations)) { this.relations[c.id] = 0; }
    //if (typeof factor != "number") { factor = 1; };
    if (typeof val != "number") { val = 0; };
    //this.relations[c.id] *= factor;
    this.relations[c.id] += val;
    return this.relations[c.id];
};

function related(c,t) {
    /*var r = c.relate(t);
    if (r<=-9) {
        // add goal: OUT(t)
    } else if (r<=-7) {
        // add goal: ??
    } else if (r<=-5) {
        
    } else if (r>5) {
        // share belief
    } else if (r>7) {
        
    }*/
};

const relationName = _rankname([
    "憎恨", "仇視", "厭惡", "討厭",
    "普通",
    "好感", "喜歡", "愛", "熱戀"
],[-7,-5,-3,-1,1,3,5,7]);
const relationNameRank = function(rank) {
    return [relationName(rank)," (",_fixFloat(rank,2),") "].join("");
    //return [" ",_fixFloat(rank,2)," "].join("");
};

kjStory.Event.Meet.listen(function(c1,c2) {
    var r12 = c1.relate(c2), r21 = c2.relate(c1);
    var fr12 = c1.relate(c2,(r12==0)
        ? Math.floor(Math.random()*6) - 3
        : r12*(Math.floor(Math.random()*20)-10)/10);
    related(c1,c2);
    var fr21 = c2.relate(c1,(r21==0)
        ? Math.floor(Math.random()*6) - 3
        : r21*(Math.floor(Math.random()*20)-10)/10);
    related(c2,c1);
    this.relations = [
        [r12,fr12].map(relationNameRank).join("變成"),
        [r21,fr21].map(relationNameRank).join("變成")
    ];
});
var saved = kjStory.Event.Meet.describer;
kjStory.Event.Meet.describer = function(c1,c2) {
    msg = saved.call(this,c1,c2);
    return [ msg,
        "<br/>", c1, "對", c2, "的關係從" + this.relations[0],
        "<br/>", c2, "對", c1, "的關係從" + this.relations[1]
    ].map(_toString).join(" ");
};

});

//------------ << End of storyline.js <<
})();