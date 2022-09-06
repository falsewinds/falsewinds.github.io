/*------------------------------------------------------------*\
 * loader & API
\*------------------------------------------------------------*/
const API_METHOD = "GET";//"POST";
async function loadData(type,data) {
    if (typeof type != "string") { return null; }
    let fetchdata = {
        "method": API_METHOD,
        "mode": "same-origin",
        "cache": "no-cache"
    }, path = "/choicegame/" + type;
    if (data!=null) {
        switch (typeof data) {
        case "object":
            fetchdata["body"] = JSON.stringify(data);
            break;
        case "string":
        case "number":
            path += "/" + data;
            break;
        }
    }
    return fetch(path,fetchdata)
        .then((resp)=>{ return resp.json(); });
}

async function loadUserData() {
    return {
        "name": "testUser",
        "updated": 1662380350
    };
}

/*------------------------------------------------------------*\
 * Formula & Condition parser
\*------------------------------------------------------------*/
let coreMath = {
    "roll": function(min,max) {
        let range = Math.abs(max-min),
            base = Math.min(min,max),
            ran = Math.random();
        return (min%1==0 && max%1==0)
            ? Math.floor(ran*range) + base
            : ran * range + base;
    },
    "add": function() {
        let ret = 0;
        for(let i=0;i<arguments.length;i++) {
            ret += arguments[i];
        }
        return ret;
    },
    "sub": function() {
        let ret = 0;
        for(let i=0;i<arguments.length;i++) {
            ret -= arguments[i];
        }
        return ret;
    },
    "mul": function() {
        let ret = 0;
        for(let i=0;i<arguments.length;i++) {
            ret *= arguments[i];
        }
        return ret;
    },
    "div": function(a,b) { return a / b; },
    "mod": function(a,b) { return a % b; },
    "pow": function(a,b) { return Math.pow(a,b); }
};

function findBucket(formula,begin,dir = 1) {
    let buckets = 0, pos = begin,
        max = (dir<0) ? -1 : formula.length;
    while (pos!=max) {
        let c = formula.charAt(pos);
        if (c=='(') {
            buckets += dir;
            if (dir<0 && buckets==0) { break; }
        }
        if (c==')') {
            buckets -= dir;
            if (dir>0 && buckets==0) { break; }
        }
        if ("+-*/^%,".indexOf(c)>=0 && buckets==0) {
            pos -= dir;
            break;
        }
        pos += dir;
    }
    return (dir>0)
        ? formula.substring(begin,pos+1)
        : formula.substring(pos,begin+1);
}
function isArguments(formula) {
    let buckets = 0, pos = 0;
    while (pos<formula.length) {
        let c = formula.charAt(pos);
        if (c=='(') { buckets++; }
        if (c==')') { buckets--; }
        if (c==',' && buckets==1) { return true; }
        pos++;
    }
    return false;
}
function findBinaryFormula(formula,symbol) {
    const w = symbol.length;
    let index = 0, matches = [];
    while (index<formula.length) {
        let pos = formula.indexOf(symbol,index);
        if (pos<0) { break; }
        matches.push({
            "antecedent": findBucket(formula,pos-1,-1),
            "consequent": findBucket(formula,pos+w,1),
            "isargument": (formula.charAt(pos+w)=='(')
                ? isArguments(ret.consequent)
                : false
        });
        index = pos + w;
    }
    return matches;
}

function findSymbol(sentence,symbol) {
    let pos = sentence.indexOf(symbol);
    if (pos<0) { return null; }
    const w = symbol.length;
    let begin = 0, close = sentence.length - 1,
        parallels = [pos], b;
    b = 0;
    for(let i=pos-1;i>=0;i--) {
        let c = sentence.charAt(i);
        if (c==')') { b++; }
        if (c=='(') {
            b--;
            if (b<0) {
                begin = i;
                break;
            }
        }
        if (c==symbol.charAt(0)
         && sentence.substring(i,i+w)==symbol
         && b==0) { parallels.push(i); }
    }
    b = 0;
    for(let i=pos+w;i<sentence.length;i++) {
        let c = sentence.charAt(i);
        if (c=='(') { b++; }
        if (c==')') {
            b--;
            if (b<0) {
                close = i;
                break;
            }
        }
        if (c==symbol.charAt(0)
         && sentence.substring(i,i+w)==symbol
         && b==0) { parallels.push(i); }
    }
    parallels.push(begin-w,close+1);
    parallels.sort();
    let items = [];
    for(let i=1;i<parallels.length;i++) {
        items.push(sentence.substring(
            parallels[i-1]+w,
            parallels[i]
        ));
    }
    return {
        "scope": [begin,close],
        "sentence": sentence.substring(begin,close+1),
        "items": items
    };
}

function parseFormula(formula) {
    findBinaryFormula(formula,"^").map((p)=>{
        if (p.isargument) {
            formula = formula.replace(
                "^"+p.consequent,
                "pow"+p.consequent);
        } else {
            formula = formula.replace(
                p.antecedent+"^"+p.consequent,
                "pow("+p.antecedent+","+p.consequent+")");
        }
    });
    return formula.replace(/count\([A-z0-9]+\)/ig,(m)=>{
        return "@" + m.substring(6,m.length-1);
    }).replace(/[A-z\]\[]+\(/g,(m)=>{
        let f = m.substring(0,m.length-1), rep = null;
        switch(f) {
        case "roll":
        case "add":
        case "sub":
        case "mul":
        case "div":
        case "mod":
        case "pow":
            rep = "core."+f+"(";
            break;
        case "ceil":
        case "[":
            rep = "Math.ceil(";
            break;
        case "floor":
        case "]":
            rep = "Math.floor(";
            break;
        case "abs":
        case "A":
        case "a":
            rep = "Math.abs(";
            break;
        case "min":
        case "n":
        case "N":
            rep = "Math.min(";
            break;
        case "max":
        case "M":
        case "m":
            rep = "Math.max(";
            break;
        }
        return rep;
    });
}

function solveFormulae(formulae,flags) {
    let isarray = formulae instanceof Array;
    let results = (isarray?formulae:[formulae]).map((formula)=>{
        let fo = parseFormula(formula);
        return (new Function("flags","core","return "
            + fo.replace(/@[A-z0-9]+/g,(m)=>{
                let f = m.substring(1);
                if (!(f in flags)) { flags[f] = 0; }
                return "flags." + f;
            })
            + ";"))(flags,coreMath);
    });
    return isarray ? results : results[0];
}

function checkConditions(condition,flags) {
    if (condition==null) { return true; }
    ["<=","<",">=",">","==","!="].map((cmp)=>{
        let result = findSymbol(condition,cmp);
        if (result==null) { return; }
        let f = (new Function("flags","core","return " +
            result.items.map(parseFormula).join(cmp)
            .replace(/@[A-z0-9]+/g,(m)=>{
                let f = m.substring(1);
                if (!(f in flags)) { flags[f] = 0; }
                return "flags." + f;
            }) + ";"))(flags,coreMath);
        condition = condition.replace(result.sentence,f?"true":"false");
    });
    return (new Function("non","return "+condition+";"))(null);
}

/*------------------------------------------------------------*\
 * Export
\*------------------------------------------------------------*/
export {
    loadData, loadUserData,
    parseFormula, solveFormulae, checkConditions
};