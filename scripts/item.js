(function() {

if (THREE==null) { return; }
if (kjGenerator==null) { return; }

const IRON = 0xCCCCCC,
    WOOD = 0xAA3300,
    CROSS = 0x333333,
    FEATHER = 0xFFFFFF;

function drawCone(top,indices,flip) {
    var fs = [], max = indices.length, ni = (flip===true) ? 1 : max-1;
    for(var i=0;i<max;i++) {
        fs.push(new THREE.Face3(
            top,
            indices[i],
            indices[(i+ni)%max]
        ));
    }
    return fs;
};

function drawDiamond(upper,lower,flip) {
    if (upper.length!=lower.length) { throw "Error: Array size not match!"; }
    var max = upper.length;
    if (max%2!=0) { throw "Error: Array size shoould be even to make Diamond."; }
    var fs = [],
        pi = (flip===true) ? 1 : max-1,
        ni = (flip===true) ? max-1 : 1;
    for(var i=0;i<max;i++) {
        var uc = upper[i], lc = lower[i],
            p = (i%2==1) ? upper[(i+pi)%max] : lower[(i+pi)%max],
            n = (i%2==1) ? upper[(i+ni)%max] : lower[(i+ni)%max];
        fs.push(new THREE.Face3(uc, n,lc));
        fs.push(new THREE.Face3(uc,lc, p));
    }
    return fs;
};

function putDiamond(x,xz,y,yz) {
    var vs = [];
    if (typeof yz == "undefined") { yz = xz; }
    if (typeof y  == "undefined") { y  = x; }
    vs.push(new THREE.Vector3( 0, y,yz));
    vs.push(new THREE.Vector3( x, 0,xz));
    vs.push(new THREE.Vector3( 0,-y,yz));
    vs.push(new THREE.Vector3(-x, 0,xz));
    return vs;
};

function sequence(begin,size,offset) {
    if (typeof offset == "undefined") { offset = 0; }
    while(offset>size) { offset %= size; }
    var a = [];
    for(var i=0;i<size;i++) { a.push(begin+i); }
    while(offset>0) {
        var e = a.shift();
        a.push(e);
        offset--;
    }
    return a;
};

function drawTriStrip(upper,lower,flip) {
    flip = (flip===true);
    if (Math.abs(upper.length-lower.length)>1) {
        throw "Error: only Array size difference <= 1 can make TriStrip";
    }
    var ub = upper.length >= lower.length,
        u = ub ? upper : lower,
        l = ub ? lower : upper;
    if (!ub) { flip = !flip; }
    var fs = [];
    for(var t=1;t<u.length;t++) {
        fs.push( flip
            ? new THREE.Face3(u[t-1],u[t],l[t-1])
            : new THREE.Face3(u[t-1],l[t-1],u[t])
        );
    }
    for(var t=1;t<l.length;t++) {
        fs.push( flip
            ? new THREE.Face3(l[t-1],u[t],l[t])
            : new THREE.Face3(l[t-1],l[t],u[t])
        );
    }
    return fs;
};

function drawPolygon(edge,flip) {
    flip = (flip==true);
    var max = edge.length - 2, fs = [];
    if (max<=0) { throw "Error: not even one triangle."; }
    for(var i=0;i<max;i++) {
        fs.push(flip
            ? new THREE.Face3(edge[0],edge[i+1],edge[i+2])
            : new THREE.Face3(edge[0],edge[i+2],edge[i+1])
        );
    }
    return fs;
};

/*------------------------------------------------------------*\
 * Sword
\*------------------------------------------------------------*/
kjGenerator.register(
"Sword",
{
    "blade-length": {"control":"number","min":4,"max":12,"step":1,"value":8},
    "blade-thick":  {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.4},
    "blade-width":  {"control":"number","min":0.5,"max":2,"step":0.1,"value":1},
    "front-ratio":  {"control":"number","min":0,"max":0.4,"step":0.01,"value":0.2},
    "front-width":  {"control":"number","min":0,"max":2,"step":0.1,"value":1.5},
    "cross-long":   {"control":"number","min":1,"max":4,"step":0.1,"value":2},
    "cross-short":  {"control":"number","min":0.25,"max":2,"step":0.05,"value":0.5},
    "cross-thick":  {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.5},
    "hilt-length":  {"control":"number","min":1,"max":5,"step":0.1,"value":1.5},
    "hilt-width":   {"control":"number","min":0.25,"max":1,"step":0.05,"value":0.5},
    "hilt-bottom":  {"control":"number","min":0.75,"max":1.25,"step":0.05,"value":1}
},
function(options) {
    const bl = parseFloat(options["blade-length"]),
        bt = parseFloat(options["blade-thick"]) / 2,
        bw = parseFloat(options["blade-width"]) / 2,
        fwr = parseFloat(options["front-width"]),
        flr = parseFloat(options["front-ratio"]),
        ct = parseFloat(options["cross-thick"]),
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2,
        hbw = hw * parseFloat(options["hilt-bottom"]);

    var g = new THREE.Geometry(),
        index = 0,
        putv = function(v3) { g.vertices.push(v3); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    g.vertices.push(new THREE.Vector3(0,0,bl+ct+hl/2));
    drawCone(0,[1,2,3,4]).map(putf(IRON));
    if (fwr*flr!=0) {
        putDiamond(
            bw*fwr, ct+hl/2 + bl*(1-flr),
            bt*fwr, ct+hl/2 + bl*(1-flr) - bl*flr*flr
        ).map(putv);
        drawDiamond([1,2,3,4],[5,6,7,8]).map(putf(IRON));
    }
    putDiamond(bw,ct+hl/2,bt).map(putv);

    index = g.vertices.length;
    putDiamond(
        parseFloat(options["cross-long"])/2, (ct+hl)/2,
        parseFloat(options["cross-short"])/2, (ct+hl)/2,
    ).map(putv);
    putDiamond(hw,hl/2).map(putv);
    drawDiamond(sequence(index-4,4,1),sequence(index,4,1)).map(putf(CROSS));
    drawDiamond(sequence(index,4),sequence(index+4,4)).map(putf(CROSS));

    index = g.vertices.length;
    putDiamond(hbw,-hl/2+hw).map(putv);
    g.vertices.push(new THREE.Vector3(0,0,-hl/2));
    drawDiamond(sequence(index-4,4),sequence(index,4)).map(putf(WOOD));
    drawCone(index+4,sequence(index,4),true).map(putf(WOOD));

    return g;
});

/*------------------------------------------------------------*\
 * Blade
\*------------------------------------------------------------*/
kjGenerator.register(
"Blade",
{
    "blade-length": {"control":"number","min":4,"max":12,"step":1,"value":8},
    "blade-thick":  {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.2},
    "blade-width":  {"control":"number","min":0.5,"max":2,"step":0.1,"value":0.8},
    "blade-section":{"control":"number","min":2,"max":6,"step":1,"value":3},
    "front-width":  {"control":"number","min":0,"max":2,"step":0.1,"value":1.5},
    "front-angle":  {"control":"number","min":0,"max":60,"step":5,"value":20},
    "cross-long":   {"control":"number","min":1,"max":4,"step":0.1,"value":2},
    "cross-short":  {"control":"number","min":0.25,"max":2,"step":0.05,"value":0.5},
    "cross-thick":  {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.4},
    "hilt-length":  {"control":"number","min":1,"max":5,"step":0.1,"value":1.6},
    "hilt-width":   {"control":"number","min":0.25,"max":1,"step":0.05,"value":0.5},
    "hilt-bottom":  {"control":"number","min":0.75,"max":1.25,"step":0.05,"value":0.75}
},
function(options) {
    const bt = parseFloat(options["blade-thick"]) / 2,
        bw = parseFloat(options["blade-width"]),
        sections = parseInt(options["blade-section"]),
        sbl = parseFloat(options["blade-length"]) / sections,
        sfw = (parseFloat(options["front-width"])-1) * bw / (sections-1),
        sfa = parseInt(options["front-angle"]) / sections * Math.PI / 180,
        ct = parseFloat(options["cross-thick"]),
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2,
        hbw = hw * parseFloat(options["hilt-bottom"]);

    var g = new THREE.Geometry(),
        putv = function(v3) { g.vertices.push(v3); },
        gf = function(idx) { return function(f) {
            return new THREE.Face3(f[0]+idx,f[1]+idx,f[2]+idx);
        }; },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    // Blade
    var cp = new THREE.Vector3(bt/2,0,ct+hl/2), radian = 0;
    for(var i=0;i<sections;i++) {
        var index = g.vertices.length,
            w = (bw + sfw * i) / 2;
            xv = new THREE.Vector3(Math.cos(radian),0,Math.sin(radian)),
            tcp = cp.clone().add(xv.clone().multiplyScalar(-w));
        g.vertices.push(cp.clone().add(xv.clone().multiplyScalar(w)));
        g.vertices.push(tcp.clone().add(new THREE.Vector3(0,bt,0)));
        g.vertices.push(tcp.clone().add(new THREE.Vector3(0,-bt,0)));
        cp.add(new THREE.Vector3(
            Math.cos(radian+Math.PI/2),0,
            Math.sin(radian+Math.PI/2)).multiplyScalar(sbl)
        );
        radian += sfa;
        if (i>0) {
            [
                [-3,-2,0],[-2,1,0],
                [-3,0,-1],[-1,0,2],
                [-2,-1,1],[-1,2,1]
            ].map(gf(index)).map(putf(IRON));
        }
    }
    var index = g.vertices.length;
    g.vertices.push(cp.add(
        new THREE.Vector3(Math.cos(radian),0,Math.sin(radian))
            .multiplyScalar(-(bw+sfw*sections)/2)
    ));
    drawCone(index,[index-1,index-2,index-3]).map(putf(IRON));

    index = g.vertices.length;
    putDiamond(
        parseFloat(options["cross-long"])/2, (ct+hl)/2,
        parseFloat(options["cross-short"])/2, (ct+hl)/2,
    ).map(putv);
    putDiamond(hw,hl/2).map(putv);
    [   [0,index,1],[0,index+1,index],[0,index+2,index+1],[0,2,index+2],
        [1,index,index+3],[1,index+3,2],[2,index+3,index+2]
    ].map(gf(0)).map(putf(CROSS));
    drawDiamond(sequence(index,4),sequence(index+4,4)).map(putf(CROSS));

    index = g.vertices.length;
    putDiamond(hbw,-hl/2+hw).map(putv);
    g.vertices.push(new THREE.Vector3(0,0,-hl/2));
    drawDiamond(sequence(index-4,4),sequence(index,4)).map(putf(WOOD));
    drawCone(index+4,sequence(index,4),true).map(putf(WOOD));

    return g;
});

/*------------------------------------------------------------*\
 * Axe
\*------------------------------------------------------------*/
kjGenerator.register(
"Axe",
{
    "blade-length":{"control":"number","min":1,"max":6,"step":1,"value":2},
    "blade-thick": {"control":"number","min":0.1,"max":1,"step":0.1,"value":0.4},
    "blade-width": {"control":"number","min":1,"max":6,"step":1,"value":3},
    "upper-angle": {"control":"number","min":0,"max":45,"step":5,"value":20},
    "lower-angle": {"control":"number","min":0,"max":45,"step":5,"value":20},
    "double-sides":{"control":"boolean"},
    "hilt-length": {"control":"number","min":1,"max":10,"step":0.1,"value":6},
    "hilt-width":  {"control":"number","min":0.25,"max":1,"step":0.05,"value":0.5},
    "hilt-bottom": {"control":"number","min":0.75,"max":1.25,"step":0.05,"value":0.75}
},
function(options) {
    const bl = parseFloat(options["blade-length"]),
        bt = parseFloat(options["blade-thick"]) / 2,
        bw = parseFloat(options["blade-width"]),
        bua = parseInt(options["upper-angle"]) * Math.PI / 180,
        bla = parseInt(options["lower-angle"]) * Math.PI / 180,
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2,
        hbw = hw * parseFloat(options["hilt-bottom"]);

    var g = new THREE.Geometry(),
        putv = function(v) { g.vertices.push(v); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    putDiamond(bt,bl+hl/2).map(putv);
    putDiamond(bt,hl/2).map(putv);

    var axe_face = putf(IRON);
    var sides = [1];
    if(options["double-sides"]===true) { sides.push(-1); }
    else { // TODO: seal another side
        drawTriStrip([0,3,2],[4,7,6]).map(axe_face);
        axe_face(new THREE.Face3(0,3,2));
    }
    sides.map(function(xf) {
        var pfv = new THREE.Vector3(xf, bt,1),
            nfv = new THREE.Vector3(xf,-bt,1),
            center = 1,
            edge = [
                new THREE.Vector3(bw,0,bl+hl/2),
                new THREE.Vector3(bw,0,(bl+hl)/2),
                new THREE.Vector3(bw,0,hl/2)
            ],
            mids = [
                new THREE.Vector3(bw/2,0.5,bl+hl/2),
                new THREE.Vector3(bw/2,0.5,(bl+hl)/2),
                new THREE.Vector3(bw/2,0.5,hl/2)
            ];
        if (bua>0) {
            var x = bw * Math.cos(bua), z = bw * Math.sin(bua);
            edge.unshift(new THREE.Vector3(x,0,bl+hl/2+z));
            center += 1;
            edge[center].x += (bw-x) / 4;
            mids[0].x = x / 2;
            mids[0].z += z / 3;
        }
        if (bla>0) {
            var x = bw * Math.cos(bla), z = bw * Math.sin(bla);
            edge.push(new THREE.Vector3(x,0,hl/2-z));
            edge[center].x += (bw-x) / 4;
            mids[2].x = x / 2;
            mids[2].z -= z / 3;
        }
        var index = g.vertices.length, flip = xf==1,
            el = edge.length, ml = mids.length,
            upper_edge = sequence(index,center+1),
            lower_edge = sequence(index+center,el-center);
        edge.map(function (v) { g.vertices.push(v.clone().multiply(pfv)); });
        mids.map(function (v) { g.vertices.push(v.clone().multiply(pfv)); });
        mids.map(function (v) { g.vertices.push(v.clone().multiply(nfv)); });
        // Axe Face
        drawTriStrip(upper_edge,sequence(index+el,2),flip).map(axe_face);
        drawTriStrip(lower_edge,sequence(index+el+1,2),flip).map(axe_face);
        drawTriStrip(upper_edge,sequence(index+el+ml,2),!flip).map(axe_face);
        drawTriStrip(lower_edge,sequence(index+el+ml+1,2),!flip).map(axe_face);
        axe_face(flip
            ? new THREE.Face3(index,index+el,index+el+ml)
            : new THREE.Face3(index,index+el+ml,index+el)
        );
        axe_face(flip
            ? new THREE.Face3(index+el-1,index+el+ml+ml-1,index+el+ml-1)
            : new THREE.Face3(index+el-1,index+el+ml-1,index+el+ml+ml-1)
        );
        drawTriStrip(sequence(index+el,3),[0,4],flip).map(axe_face);
        drawTriStrip(sequence(index+el+ml,3),[2,6],!flip).map(axe_face);
        drawCone(flip?1:3,[0,2,index+el+ml,index+el],flip).map(axe_face);
        drawTriStrip([4,flip?5:7,6],[index+el+ml-1,index+el+ml+ml-1],!flip).map(axe_face);
    });

    var index = g.vertices.length;
    putDiamond(hbw,-hl/2+hw).map(putv);
    g.vertices.push(new THREE.Vector3(0,0,-hl/2));
    drawDiamond([4,5,6,7],sequence(index,4)).map(putf(WOOD));
    drawCone(index+4,sequence(index,4),true).map(putf(WOOD));

    return g;
});

/*------------------------------------------------------------*\
 * Spear
\*------------------------------------------------------------*/
kjGenerator.register(
"Spear",
{
    "blade-length":{"control":"number","min":1,"max":6,"step":1,"value":2},
    "blade-thick": {"control":"number","min":0.2,"max":1,"step":0.1,"value":0.3},
    "blade-width": {"control":"number","min":0.2,"max":2,"step":0.1,"value":0.6},
    "hilt-length": {"control":"number","min":1,"max":18,"step":0.1,"value":9},
    "hilt-width":  {"control":"number","min":0.2,"max":1,"step":0.1,"value":0.3},
    "hilt-bottom": {"control":"number","min":0.75,"max":1.25,"step":0.05,"value":1}
},
function(options) {
    const bl = parseFloat(options["blade-length"]),
        bt = parseFloat(options["blade-thick"]) / 2,
        bw = parseFloat(options["blade-width"]) / 2,
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2,
        hbw = hw * parseFloat(options["hilt-bottom"]);

    var g = new THREE.Geometry(),
        putv = function(v) { g.vertices.push(v); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    putv(new THREE.Vector3(0,0,bl+hl/2));
    putDiamond(bw,bw+hl/2,bt,bw/2+hl/2).map(putv);;
    putDiamond(hw,hl/2).map(putv);
    putDiamond(hbw,hw-hl/2).map(putv);
    putv(new THREE.Vector3(0,0,-hl/2));

    drawCone(0,[1,2,3,4]).map(putf(IRON));
    drawDiamond([1,2,3,4],[5,6,7,8]).map(putf(IRON));
    drawDiamond([5,6,7,8],[9,10,11,12]).map(putf(WOOD));
    drawCone(13,[9,10,11,12],true).map(putf(WOOD));

    return g;
});

/*------------------------------------------------------------*\
 * Hammer
\*------------------------------------------------------------*/
kjGenerator.register(
"Hammer",
{
    "head-sides":   {"control":"number","min":3,"max":8,"step":1,"value":5},
    "head-length":  {"control":"number","min":1,"max":6,"step":1,"value":2},
    "head-outer":   {"control":"number","min":1,"max":6,"step":1,"value":2},
    "head-inner":   {"control":"number","min":0.5,"max":1.5,"step":0.05,"value":0.75},
    "head-face":    {"control":"number","min":0,"max":1,"step":0.1,"value":0.2},
    "double-sides":  {"control":"boolean"},
    "hilt-length":  {"control":"number","min":1,"max":18,"step":1,"value":6},
    "hilt-width":   {"control":"number","min":0.2,"max":1,"step":0.1,"value":0.5},
    "hilt-bottom":  {"control":"number","min":0.75,"max":1.25,"step":0.05,"value":1}
},
function(options) {
    const sides = parseInt(options["head-sides"]),
        l = parseFloat(options["head-length"]),
        or = parseFloat(options["head-outer"]) / 2,
        ir = or * parseFloat(options["head-inner"]),
        f = parseFloat(options["head-face"]),
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2,
        hbw = hw * parseFloat(options["hilt-bottom"]);

    var g = new THREE.Geometry(),
        putv = function(v) { g.vertices.push(v); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };
    var headf = putf(IRON);

    // Head
    var radian = Math.PI * 2 / sides;
    var ip = new THREE.Vector3(0,0,ir+hl/2), xfs = [1], diamond = [0,sides-1];
    for(var i=0;i<sides;i++) {
        var r = radian * (i+0.5);
        putv(new THREE.Vector3(0,
            ir * Math.sin(r),
            ir * (1-Math.cos(r)) + hl/2));
    }
    if (!(options["double-sides"])) {
        putv(new THREE.Vector3(-ir,0,ir+hl/2));
        sequence(0,sides-1)
            .map(function(i) { return new THREE.Face3(sides,i+1,i); })
            .map(headf);
        diamond.push(sides);
    } else { xfs.push(-1); }
    xfs.map(function(xf) {
        var index = g.vertices.length, flip = xf==1;
        if (xf==1) { diamond.splice(1,0,index); }
        else { diamond.push(index); }
        for(var i=0;i<sides;i++) {
            var r = radian * i, p = (i+sides-1) % sides, n = (i+1) % sides;
            putv(new THREE.Vector3(
                xf * l,
                or * Math.sin(r),
                ir - or*Math.cos(r) + hl/2));
            if (i>0) {
                headf(flip
                    ? new THREE.Face3(index+i,p,i)
                    : new THREE.Face3(index+i,i,p)
                );
            }
            headf(flip
                ? new THREE.Face3(index+i,i,index+n)
                : new THREE.Face3(index+i,index+n,i)
            );
        }
        var seq = sequence(index,sides);
        if (f>0) {
            putv(new THREE.Vector3(xf*l*(1+f),0,ir+hl/2));
            drawCone(index+sides,seq,flip).map(headf);
        } else { drawPolygon(seq,flip).map(headf); }
    });

    // Hilt
    var index = g.vertices.length;
    putDiamond(hw,(hl+or-ir)/2).map(putv);
    putDiamond(hbw,hw-hl/2).map(putv);
    putv(new THREE.Vector3(0,0,-hl/2));
    drawDiamond(diamond,sequence(index,4)).map(headf);
    drawDiamond(sequence(index,4),sequence(index+4,4)).map(putf(WOOD));
    drawCone(index+8,sequence(index+4,4),true).map(putf(WOOD));

    return g;
});

/*------------------------------------------------------------*\
 * Bow
\*------------------------------------------------------------*/
kjGenerator.register(
"Bow",
{
    "upper-length": {"control":"number","min":1,"max":6,"step":1,"value":4},
    "lower-length": {"control":"number","min":1,"max":6,"step":1,"value":4},
    "bow-width":    {"control":"number","min":1,"max":5,"step":1,"value":3},
    "bow-thick":    {"control":"number","min":0.2,"max":0.5,"step":0.1,"value":0.3},
    "bow-center":   {"control":"number","min":0,"max":0.25,"step":0.05,"value":0.2},
    "recurve":      {"control":"boolean","value":true},
    "horn-length":  {"control":"number","min":0,"max":2,"step":0.1,"value":1},
    "horn-angle":   {"control":"number","min":-20,"max":45,"step":5,"value":20},
    "string-thick": {"control":"number","min":0,"max":0.1,"step":0.01,"value":0.01}
},
function(options) {
    const bow_radian = Math.PI / 6,
        radian = Math.PI * 2 / 3,
        ul = parseFloat(options["upper-length"]),
        ll = parseFloat(options["lower-length"]),
        bw = parseFloat(options["bow-width"]),
        bt = parseFloat(options["bow-thick"]) / 2,
        ct = parseFloat(options["bow-center"]) / 2,
        hl = parseFloat(options["horn-length"]),
        hr = parseInt(options["horn-angle"]) * Math.PI / 180;

    var g = new THREE.Geometry(),
        putTriangle = function(cp,xv,radius,twisted) {
            xv.normalize();
            var dr = (twisted==true) ? (radian/2) : 0,
                yv = new THREE.Vector3(0,1,0),
                index = g.vertices.length;
            for(var i=0;i<3;i++) {
                g.vertices.push(cp.clone()
                    .add(xv.clone().multiplyScalar(radius*Math.cos(radian*i+dr)))
                    .add(yv.clone().multiplyScalar(radius*Math.sin(radian*i+dr)))
                );
            }
            return [index,index+1,index+2];
        },
        tryFlip = function(f,flip) {
            if (flip!==true) { return f; }
            var tmp = f.c;
            f.c = f.b;
            f.b = tmp;
            return f;
        },
        putf = function(f) {
            f.color = new THREE.Color(WOOD);
            g.faces.push(f);
        };

    var dx = bw * (1 - Math.cos(bow_radian)),
        hand = new THREE.Vector3(bw-dx/2,0,ll*Math.sin(-bow_radian)/2);
    var bcp = new THREE.Vector3(bw,0,0), bca = [0];
    if (options["recurve"]) {
        bcp.x -= dx * 2;
        hand.x -= dx;
    }
    bcp.sub(hand);
    if (ct>0) { bca = putTriangle(bcp,new THREE.Vector3(1,0,0),ct,true); }
    else { g.vertices.push(bcp); }

    var thicks = [ 0, ct, bt, 0 ];
    [ ul, ll ].map(function(l,li) {
        var last = bca, flip = li == 0, sign = flip ? 1 : -1;
        for(var i=1;i<=3;i++) {
            var v = new THREE.Vector3(
                    bw * Math.cos(bow_radian*i*sign),
                    0,
                    l * Math.sin(bow_radian*i*sign)),
                c = v.clone().sub(hand);
            if (hl>0 && i==3) {
                var r = (Math.PI/2 + hr) / 2;
                v = new THREE.Vector3(Math.cos(r*sign),0,Math.sin(r*sign));
            }
            var next = putTriangle(c,v,bt);
            if (last.length>1) {
                for(var j=0;j<3;j++) {
                    var p = (j+2) % 3, n = (j+1) % 3;
                    putf(tryFlip(new THREE.Face3(last[j],next[j],last[p]),!flip));
                    putf(tryFlip(new THREE.Face3(last[j],next[n],next[j]),!flip));
                }
            } else { drawCone(last[0],next).map(putf); }
            last = next;
        }
        if (hl>0) {
            var r = Math.PI/2 + hr, index = g.vertices.length;
            g.vertices.push(new THREE.Vector3(
                hl * Math.cos(r*sign), 0,
                hl * Math.sin(r*sign) + l * sign
            ).sub(hand));
            drawCone(index,last,flip).map(putf);
        } else { putf(new THREE.Face3(last[0],last[1],last[2])); }
    });

    const st = parseFloat(options["string-thick"]);
    if (st>0) {
        var index = g.vertices.length;
        g.vertices.push(new THREE.Vector3(0,st,ul).sub(hand));
        g.vertices.push(new THREE.Vector3(0,-st,ul).sub(hand));
        g.vertices.push(new THREE.Vector3(0,0,0).sub(hand));
        g.vertices.push(new THREE.Vector3(0,st,-ll).sub(hand));
        g.vertices.push(new THREE.Vector3(0,-st,-ll).sub(hand));
        [
            new THREE.Face3(index,index+2,index+1),
            new THREE.Face3(index+1,index+2,index),
            new THREE.Face3(index+4,index+2,index+3),
            new THREE.Face3(index+3,index+2,index+4)
        ].map(function(f) {
            f.color = new THREE.Color(WOOD);
            g.faces.push(f);
        });
    }

    return g;
});

/*------------------------------------------------------------*\
 * Arrow
\*------------------------------------------------------------*/
kjGenerator.register(
"Arrow",
{
    "crossbow":{"control":"boolean"},
    "length":  {"control":"number","min":2,"max":8,"step":1,"value":4},
    "thick":   {"control":"number","min":0.05,"max":0.5,"step":0.05,"value":0.1},
    "head":    {"control":"number","min":0.1,"max":2,"step":0.1,"value":0.6},
    "feather": {"control":"number","min":0.1,"max":2,"step":0.1,"value":0.5}
},
function(options) {
    const side = options["crossbow"] ? 3 : 4,
        l = parseFloat(options["length"]),
        r = parseFloat(options["thick"]) / 2,
        hl = parseFloat(options["head"]),
        fl = parseFloat(options["feather"]);

    var g = new THREE.Geometry(),
        putv = function(v) { g.vertices.push(v); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    // head
    g.vertices.push(new THREE.Vector3(0,0,l/2+hl));
    if (side==3) {
        var ha = Math.PI * 2 / 3;
        for(var i=0;i<3;i++) {
            g.vertices.push(new THREE.Vector3(
                Math.sin(ha*i) * hl/2,
                Math.cos(ha*i) * hl/2,
                l/2
            ));
        }
    } else {
        putDiamond(hl/2,l/2,r,l/2+hl/3).map(putv);
        drawCone(0,sequence(1,4)).map(putf(IRON));
    }

    var index = g.vertices.length;
    // body
    if (side==3) {
        drawCone(0,[index-3,index+1,index-2,index+3,index-1,index+5]).map(putf(IRON));
        var ba = Math.PI / 3, fs = [];
        for(var i=0;i<6;i++) {
            g.vertices.push(new THREE.Vector3(
                Math.sin(ba*i) * r,
                Math.cos(ba*i) * r,
                l/2+hl/9)
            );
            if (i%2==0) {
                var out = 1 + (i/2), p = (i+5) % 6, n = (i+1) % 6;
                fs.push(new THREE.Face3(index+i,index+p,out));
                fs.push(new THREE.Face3(index+i,out,index+n));
            }
        }
        fs.map(putf(WOOD));
        for(var i=0;i<6;i++) {
            g.vertices.push(new THREE.Vector3(
                Math.sin(ba*i) * r,
                Math.cos(ba*i) * r,
                -l/2)
            );
        }
        drawDiamond(sequence(index,6),sequence(index+6,6)).map(putf(WOOD));
        drawPolygon(sequence(index+6,6),true).map(putf(WOOD));
    } else {
        putDiamond(r,l/2+hl/9).map(putv);
        drawDiamond(sequence(index-4,4),sequence(index,4)).map(putf(IRON));
        putDiamond(r,-l/2).map(putv);
        drawDiamond(sequence(index,4),sequence(index+4,4)).map(putf(WOOD));
        drawPolygon(sequence(index+4,4),true).map(putf(WOOD));
    }

    // feather
    const left = 5;
    index = g.vertices.length;
    var fs = [], fr = fl / 2 + r, fb = fl / left;
    g.vertices.push(new THREE.Vector3(0,0,fb*(left+1)-l/2));
    g.vertices.push(new THREE.Vector3(0,0,fb-l/2));
    if (side==3) {
        var fa = Math.PI * 2 / 3;
        for(var i=0;i<3;i++) {
            g.vertices.push(new THREE.Vector3(
                Math.sin(fa*i) * fr,
                Math.cos(fa*i) * fr,
                -l/2
            ));
            fs.push(new THREE.Face3(index,index+1,index+i+2));
            fs.push(new THREE.Face3(index,index+i+2,index+1));
        }
    } else {
        g.vertices.push(new THREE.Vector3(fr,0,-l/2));
        fs.push(new THREE.Face3(index,index+1,index+2));
        fs.push(new THREE.Face3(index,index+2,index+1));
        g.vertices.push(new THREE.Vector3(-fr,0,-l/2));
        fs.push(new THREE.Face3(index,index+1,index+3));
        fs.push(new THREE.Face3(index,index+3,index+1));
    }
    fs.map(putf(FEATHER));

    return g;
});

/*------------------------------------------------------------*\
 * Whip
\*------------------------------------------------------------*/
kjGenerator.register(
"Whip",
{
    "length":     {"control":"number","min":6,"max":20,"step":1,"value":10},
    "section":    {"control":"number","min":5,"max":16,"step":1,"value":8},
    "chain":      {"control":"boolean","value":true},
    "hilt-length":{"control":"number","min":1,"max":2,"step":0.1,"value":1.5},
    "hilt-width": {"control":"number","min":0.2,"max":0.5,"step":0.05,"value":0.3}
},
function(options) {
    const s = parseInt(options["section"]),
        sl = parseInt(options["length"]) / s,
        hl = parseFloat(options["hilt-length"]),
        hw = parseFloat(options["hilt-width"]) / 2;

    var g = new THREE.Geometry(),
        putv = function(v) { g.vertices.push(v); },
        putf = function(c) { return function(f) {
            f.color = new THREE.Color(c);
            g.faces.push(f);
        }; };

    g.vertices.push(new THREE.Vector3(0,0,hl/2));
    putDiamond(hw,hl/2-hw).map(putv);
    putDiamond(hw,hw-hl/2).map(putv);
    g.vertices.push(new THREE.Vector3(0,0,-hl/2));
    drawCone(0,[1,2,3,4]).map(putf(WOOD));
    drawDiamond([1,2,3,4],[5,6,7,8]).map(putf(WOOD));
    drawCone(9,[5,6,7,8],true).map(putf(WOOD));

    const side = 3, add = hw / 2;
    var z = hl/2, radian = Math.PI * 2 / side;
    for(var i=0;i<s;i++) {
        var index = g.vertices.length;
        putv(new THREE.Vector3(0,0,z+sl));
        for(var j=0;j<side;j++) {
            putv(new THREE.Vector3(
                Math.cos(radian*j) * hw,
                Math.sin(radian*j) * hw,
                z - add
            ));
        }
        drawCone(index,sequence(index+1,3),true).map(putf(WOOD));
        z += sl;
    }

    return g;
});



})();