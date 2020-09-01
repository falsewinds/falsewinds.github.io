(function() {

var database = {}
window.kjGenerator = {

"register": function(type,variables,method) {
    if (variables==null) { variables = {}; }
    if (typeof variables != "object") { throw "variables should be object."; }
    if (typeof method != "function") { throw "method should be function."; }
    database[type] = {
        "variables": variables,
        "method": method
    };
},

"list": function() { return Object.keys(database); },
"select": function(type) {
    if (!(type in database)) { return null; }
    return database[type]["variables"];
},

"generate": function(type,options) {
    if (!(type in database)) { throw "Error: No "+type+" type model generator."; }
    var model = database[type], useseed = model.variables._seed === true;
    if (Math.seedrandom && useseed) {
        if ("seed" in options) { this.Seed = options["seed"]; }
        else {
            const seedCount = 12;
            this.Seed = "";
            for(var i=0;i<seedCount;i++) {
                var digit = Math.floor(Math.random()*10);
                this.Seed += digit;
            }
        }

        Math.seedrandom(this.Seed);
        console.log("Use RNG seed: "+this.Seed);
    }
    return model.method(options);
},

"Seed": "000000000000"

};

})();