(function() {


function roll(arr,ex) {
    var max = arr.length + 1,
        idx = Math.floor(Math.random()*max),
        r = arr[idx];
    if (ex===true) { arr.splice(idx,1); }
    return r;
};

/*------------------------------------------------------------*\
 * Storyline Object
\*------------------------------------------------------------*/
var generated_count = 0;
function getid(prefix) {
    generated_count++;
    return prefix + "#" + generated_count;
};

function Statement(type,args) {
    this.id = type + ":" + args.map(function(a) {
        if ("id" in a) { return a.id;}
        if (typeof a == "string") { return a; }
        console.log(a);
        throw "Error: unavailable Statement arguments.";
    }).join("-");
    this.type = "Statement:" + type;
    this.arguments = args;
};

var reference = {};
function refer(entity,n) {
    if (n in reference) { return; }
    if (!(entity instanceof Character)
     || !(entity instanceof Flag) ) { return; }
    reference[n] = entity;
    //return new Statement("Reference",[n,entity]);
};

function StoryEvent(type,args) {
    this.id = getid("Event");
    this.type = "Event:" + type;
    this.arguments = args;
};

function Character() {
    this.id = getid("Character");
    this.type = "Character";
    this.place = null;
    this.relations = {};
    this.backpack = {};
    this.history = [];
    this.knowledge = [];
};
Character.prototype.meet = function(c,r) {
    if (!(c instanceof Character)) { return; }
    var e = new StoryEvent("Meet",[this,c,r]);
    this.history.push(e);
    // TODO: change relation
    if (!(c.id in this.relations)) {
        if ("name" in c) {
            // Add Knowledge of Reference
            //this.knowledge.push(c);
        }
        this.relations[c.id] = 0;
    }
    this.relations[c.id] += r;
};


/*------------------------------------------------------------*\
 * Storyline
\*------------------------------------------------------------*/
var character_pool = [], place_pool = [];
var character_list = {};

window.Storyline = {

"initialize": function(character_count) {
    for(var i=0;i<character_count;i++) {
        var c = new Character();
        character_list[c.id] = c;
        character_pool.push(c.id);
    }
},

"iterate": function(event_count) {
    var c_count = Object.keys(character_list).length,
        c_pool = character_pool.slice(0);
    if (c_count<50) { c_pool.push(null); }
    for(var i=0;i<event_count;i++) {
        var cid = roll(c_pool,true), c;
        if (cid==null) {
            c = new Character();
            cid = c.id;
            character_list[c.id] = c;
            character_pool.push(c.id);
        } else { c = character_list[cid]; }
        // Meet
        var pool = character_pool.slice(0),
            index = pool.indexOf(cid);
        if (index>=0) { pool.splice(index,1); }
        var rcid = roll(pool);
        c.meet(character_list[rcid],Math.floor(Math.random()*10));
    }
    // Calculate Complexity
    var ids = Object.keys(character_list),
        complexity = 0;
    ids.map(function(id) {
        var c = character_list[id];
        complexity += c.history.length;
    });
    complexity /= ids.length;
    console.log("Complexity:",complexity);
    if (complexity>8) {
        ids.map(function(id) {
            var c = character_list[id],
                cc = c.history.length;
            if (cc>complexity) {
                console.log(c);
            }
        });
    }
}

};

})();