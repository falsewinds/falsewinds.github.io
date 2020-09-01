(function() {

if (THREE==null) { return; }
if (kjGenerator==null) { return; }

const RADIAN = Math.PI / 180,
    d30 = Math.PI / 6,
    qr3 = Math.cos(d30);

const HAIR = 0xFF0000,
    SKINs = [ 0xECBCB4, 0xD1A3A4, 0xC58C85, 0xA1665E, 0x503335, 0x592F2A ],
    SKIN = SKINs[1];

function putArc(y,arc,section,radius,edge=false) {
    var vs = [], length = Math.PI * arc * radius * 2;
    //console.log(arc,length,section,length/section);
    var radian = Math.PI * arc / section,
        offset = Math.PI * (1-arc/2),
        s = (arc==2 || edge) ? 0 : 1,
        e = section + ((arc==2 || !edge) ? 0 : 1);
    for(var i=s;i<e;i++) {
        vs.push(new THREE.Vector3(
            radius*Math.sin(radian*i+offset),
            y,
            radius*Math.cos(radian*i+offset)
        ));
    }
    return vs;
};

function linkArc(indices,arcs) {
    if (arcs == null) { arcs = indices.map(function() { return 0; }); }
    if (arcs.length < indices.length) {
        var lastarc = 0;
        arcs = indices.map(function(ids,i) {
            if (i in arcs) {
                lastarc = arcs[i];
                return arcs[i];
            }
            return lastarc;
        });
    }
    const diff_radian = 0.45;
    var last = indices[0], lmax = last.length, larc = arcs[0], fs = [];
    for(var i=1;i<indices.length;i++) {
        var cur = indices[i], arc = arcs[i];
        if (lmax==1) {
            for(var j=1;j<cur.length;j++) {
                fs.push(new THREE.Face3(last[0],cur[j-1],cur[j]));
            }
        } else {
            var flip = cur.length < lmax,
                less = flip ? cur : last,
                more = flip ? last : cur,
                half = (less.length-1) / 2,
                tri = more.length - 1,
                div = Math.floor(tri/less.length),
                divs = less.map(function() { return div; }),
                left = tri - less.length * div,
                delta = (larc-arc) * (flip?1:-1),
                prev = 0;
            if (left>0) {
                if (less.length%2==0) { // Even
                    if (left%2!=0) { throw "Error: linkArc need Even-Odd interlaced."; }
                    divs[Math.floor(half)] += left / 2;
                    divs[Math.ceil(half)] += left / 2;
                } else { // Odd
                    if (delta>0 && left>=2) {
                        divs[half-1] += 1
                        divs[half+1] += 1;
                        divs[half] += left - 2;
                    } else { divs[half] += left; }
                }
            }
            for(var j=0;j<less.length;j++) {
                var ci = less[j], max = divs[j];
                if (j>half && (j-1)>=half) {
                    fs.push(flip
                        ? new THREE.Face3(more[prev],less[j-1],ci)
                        : new THREE.Face3(more[prev],ci,less[j-1])
                    );
                }
                for(var k=0;k<max;k++) {
                    fs.push(flip
                        ? new THREE.Face3(ci,more[prev+1],more[prev])
                        : new THREE.Face3(ci,more[prev],more[prev+1])
                    );
                    prev++;
                }
                if (j<half) {
                    fs.push(flip
                        ? new THREE.Face3(more[prev],ci,less[j+1])
                        : new THREE.Face3(more[prev],less[j+1],ci)
                    );
                }
            }
        }
        last = cur;
        lmax = cur.length;
        larc = arc;
    }
    return fs;
};

function modArc(indices,bif,is) {
    var ra = indices.map(function(x) { return x });
    switch (typeof bif) {
    case "number":
        for(;bif>0;bif--) {
            ra.shift();
            ra.pop();
        }
        break;
    case "boolean":
        if (bif) { ra.push(ra[0]); }
        else { ra.shift(); }
        break;
    case "function":
        for(var i=0;i<is.length;i++) {
            var idx = is[i];
            ra.unshift(bif(idx));
            ra.push(bif(-idx));
        }
        break;
    default:
        console.log(typeof bif);
        break;
    }
    return ra;
}

/*------------------------------------------------------------*\
 * Head
\*------------------------------------------------------------*/
kjGenerator.register(
"Head",
{
    "width":   {"control":"number","min":2,"max":8,"step":0.1,"value":2},
    "forehead":{"control":"number","min":1,"max":4,"step":0.1,"value":1},
    "face":    {"control":"number","min":1,"max":6,"step":0.1,"value":1.5},
    "front":   {"control":"number","min":1,"max":4,"step":0.1,"value":1},
    "back":    {"control":"number","min":1,"max":4,"step":0.1,"value":1},
    "ear":     {"control":"select","option":["None","Human","Elvish","Goblin"],"value":2},
    "hair":    {"control":"select","option":["None","Cover"],"value":1}
},
function (options) {
    var g = new THREE.Geometry(),
        putv = function(x,y,z) {
            var i = g.vertices.length;
            if (x instanceof THREE.Vector3) { g.vertices.push(x); }
            else { g.vertices.push(new THREE.Vector3(x,y,z)); }
            return i;
        },
        putf = function(color,ds) {
            var c = new THREE.Color(color);
            return ds
            ? function(f) {
                f.color = c;
                g.faces.push(f);
                var another = new THREE.Face3(f.a,f.c,f.b);
                another.color = c;
                g.faces.push(another);
            }
            : function(f) {
                f.color = c;
                g.faces.push(f);
            }
        },
        mid = function(radius,ratio) {
            return function(p1i,p2i) {
                var p = new THREE.Vector3()
                    .addVectors(g.vertices[p1i],g.vertices[p2i])
                    .multiply(new THREE.Vector3(ratio,1-ratio,0));
                p.z = Math.sqrt(radius*radius-p.y*p.y-p.x*p.x);
                //p.z = ((cv.z-1) * ratio) + 1;
                return p;
            };
        },
        rad = function(radius) {
            return function(v3) {
                v3.z = Math.sqrt(radius*radius-v3.y*v3.y-v3.x*v3.x);
                return v3;
            };
        },
        df = function(indices,xf,loop = false) {
            if (xf>0) { return function(i) { return indices[i]; }; }
            var max = indices.length, d = loop ? 0 : 1;
            return function(i) { return indices[(max-(i+d))%max]; };
        };

    var face = drawFace(g);
    // Backhead & Neck
    var backhead = putArc(-5/8,1,5,qr3).map(putv),
        nb0 = putv(0,-1,-0.5),
        nk0 = putv(0,-1.4,0.25),
        neck = putArc(-1.75,2,8,0.5).map(function(v3) {
            v3.z -= 0.25;
            return v3;
        }).map(putv);
    [1,-1].map(function(xf) {
        var ff = function(i) { return face(i==6?6:i*xf) },
            bh = df(backhead,xf),
            nk = df(neck,xf,true),
            nb1 = putv(0.5*xf,-1,-0.25),
            nb2 = putv(0.5*xf,-1.25,0);
        var faces = [
            [bh(0), nb1 ,bh(1)],[bh(1), nb1 , nb0 ],[bh(0),ff(4), nb1 ],
            [ nb2 , nb1 ,ff(4)],[ff(4),ff(5), nb2 ],[ nb2 ,ff(5),ff(6)],
            [ nb2 ,ff(6), nk0 ],
            [nk(0),nk(1), nk0 ],[nk(1), nb2 , nk0 ],[nk(1),nk(2), nb2 ],
            [nk(2), nb1 , nb2 ],[nk(2),nk(3), nb1 ],[nk(3), nb0 , nb1 ],
            [nk(3),nk(4), nb0 ]
        ];
        if (xf==1) { faces.push([bh(2),bh(1), nb0 ]); }
        faces.map(function(f) {
            var face = (xf==1)
                ? new THREE.Face3(f[0],f[1],f[2])
                : new THREE.Face3(f[0],f[2],f[1]);
            face.color = new THREE.Color(SKIN);
            g.faces.push(face);
        });
    });

    var headloop = [];
    switch(options["ear"]) {
    case "Human":
        headloop = drawEar(-30,30,0.5,180,3,face,backhead,putv,putf);
        break;
    case "Goblin":
        headloop = drawEar(15,60,0.5,240,2,face,backhead,putv,putf);
        break;
    case "Elvish":
        headloop = drawEar(15,30,1.5,180,1,face,backhead,putv,putf);
        break;
    default:
        break;
    }
    /*var c = new THREE.Vector3(0,0,0);
    headloop.map(function(i) { c.add(g.vertices[i]); });
    c.divideScalar(headloop.length);
    var ci = putv(c);
    linkArc([[ci],headloop]).map(putf(0x00FFFF));*/

    switch(options["hair"]) {
    case "None": // Hairless Head
        var top = putv(0,1,0),
            layer1 = putArc( qr3,2,4,0.5).map(putv),
            layer2 = putArc( 0.5,1,5,qr3).map(putv),
            layer3 = putArc( 0  ,1,4,1  ).map(putv);
        var forehead = modArc([layer1[1],top,layer1[3]],face,[1,0]),
            hairless = putf(SKIN,false);

        linkArc([[layer1[0]],forehead]).map(hairless);
        linkArc([
            [top],
            modArc(layer1,false),
            modArc(layer2,face,[2,1])
        ]).map(hairless);
        if (headloop.length==0) {
            linkArc([
                modArc(layer2,face,[2]),
                modArc(layer3,face,[3]),
                modArc(backhead,face,[4])
            ]).map(hairless);
        } else {
            linkArc([
                modArc(layer2,face,[2]),
                modArc(layer3,face,[3])
            ]).map(hairless);
            linkArc([layer3,backhead]).map(hairless);
            [1,-1].map(function(xf) {
                var l3 = df(layer3,xf),
                    hl = df(headloop,xf),
                    bh = df(backhead,xf);
                [ [l3(0),face(xf*3),hl(4)], [l3(0),hl(4),bh(0)] ].map(function(f) {
                    return new THREE.Face3(f[0],f[(xf==1)?1:2],f[(xf==1)?2:1]);
                }).map(hairless);
            });
        }
        break;
    case "Cover": // Hair Style: Cover Hair
        const hair = 0.2;
        var fh = drawCoverHair(hair,
            [
                [ 0  ,1,1  ],
                [-0.8,0.75,0.9],
                [-1.5,0.6 ,0.8],
                [-2.5,0.5 ,0.6]
            ],
            putv,putf);
        if (false) {
            var fhv = mid(1+hair,0.6),
                fhc = putv(fhv(fh(0),face(0)));
            [1,-1].map(function(xf) {
                var flip = (xf<0),
                    sp = face(xf),
                    pi = putv(fhv(fh(0),sp));
                [   [fh(0),fhc,pi],
                    [pi,fhc,face(0)],
                    [face(0),sp,pi],
                    [pi,fh(xf),fh(0)],
                    [sp,fh(xf),pi]
                ].map(function(f) {
                    return new THREE.Face3(f[0],
                        flip ? f[2] : f[1],
                        flip ? f[1] : f[2]);
                }).map(putf(HAIR));
            });
        //} else {
            var fhv = mid(1+hair,0.6), fhz = rad(1+hair),
                xmod = 0.5, ymod = 0;
            var mc = putv(fhv(fh(0),face(0))),
                mb = putv(fhz(new THREE.Vector3(xmod,ymod,0)));
            [1,-1].map(function(xf) {
                var flip = (xf<0),
                    sp = face(xf), ep = fh(xf), f0 = face(0), h0 = fh(0),
                    edge = g.vertices[ep],
                    p0 = putv(fhv(h0,sp)),
                    p1 = putv(fhz(new THREE.Vector3(edge.x,ymod,0)));
                [   [p0,f0,sp], [p0,sp,p1], [sp,ep,p1],
                    [p0,p1,ep], [p0,ep,h0],
                    [p0,mc,f0], [p0,h0,mc]
                    //[p0,h0,mc], [p0,mc,mb], [p0,mb,f0]
                ].map(function(f) {
                    return new THREE.Face3(f[0],
                        flip ? f[2] : f[1],
                        flip ? f[1] : f[2]);
                }).map(putf(HAIR));
            });
        }
        break;
    case "Ball": // Hair Style: Ball Hair
    default:
        break;
    }

    // Scale & Move
    g.vertices.map((function(radius,center) {
        const w = parseFloat(options["width"]) / 2,
            fh = parseFloat(options["forehead"]),
            fl = parseFloat(options["face"]) / 1.5,
            f = parseFloat(options["front"]),
            b = parseFloat(options["back"]);
        return function(v) {
            var hf = v.y > 0, fb = v.z > 0;
            v.multiply(new THREE.Vector3(w,hf?fh:fl,fb?f:b))
                .multiplyScalar(radius)
                .add(center);
        };
    })(1,new THREE.Vector3(0,0.5,0)));

    return g;
});

/*------------------------------------------------------------*\
 * Humanoid: Face
\*------------------------------------------------------------*/
function drawFace(g) {
    const eye_radius = 1 / 6,
        eot = 11 / 16,
        eup = -1/4 + eye_radius,
        edw = -1/4 - eye_radius,
        jaw = - 21 / 16;

    var index = g.vertices.length, face_line = [];
    var middle_line = [ [ 1/2,qr3],[ 0  ,1  ],[-3/8,qr3],[-1  ,3/4],[-3/2,1/2] ];
    middle_line.map(function(v) { g.vertices.push(new THREE.Vector3(0,v[0],v[1])); });

    var sides = [1,-1].map(function(xf) {
        var fi = g.vertices.length, flip = xf == -1,
            p1 = flip ? 2 : 1, p2 = flip ? 1 : 2;
        [ 
            [1/2, 3/4,1/2],[qr3, 1/2,1/6],[1  , 0  ,0  ],[qr3,-5/8,0  ],[1/2,-5/4,1/4],
            [1/4, 3/8,7/8],[5/8, 2/8,5/8],[eot,-1/4,1/2],[1/2,-5/6,2/3],[1/4,-9/8,5/8],
            [3/8, eup,3/4],[1/8,-1/4,5/6],[3/8, edw,3/4],[1/4,-7/8,5/6],[1/8, jaw,5/8]
        ].map(function(v) {
            g.vertices.push(new THREE.Vector3(v[0]*xf,v[1],v[2]));
        });
        [
            [-5,-4, 5],[-5, 5, 0],[ 0, 5, 6],[ 0, 6, 1],
            [ 1, 6, 2],[ 2, 6, 7],[ 2, 7, 3],[ 3, 7, 8],[ 3, 8, 4],
            [ 4, 8, 9],[ 4, 9,14],[-1, 4,14],
            [ 6,10, 7],[ 5,10, 6],[-4,10, 5],[-4,11,10],[-4,-3,11],
            [-3,12,11],[-3,13,12],[ 8,12,13],[ 7,12, 8],
            [ 8,13, 9],[-2, 9,13]
        ].map(function(f) {
            f = f.map(function(i) { return i + ((i<0)?index+middle_line.length:fi); });
            var face = new THREE.Face3(f[0],f[p1],f[p2]);
            face.color = new THREE.Color(SKIN);
            g.faces.push(face);
        });

        // Eye
        var eye = g.vertices.length,
            eye_center = new THREE.Vector3(3/8*xf,-1/4,2/3-1/12),
            eye_width = 0.75 * (1/2) / 2;
        [-xf,xf].map(function(exf) {
            var ei = g.vertices.length, pt = (exf==xf) ? 7 : 11;
            [   [eye_width,0,1/8],
                [eye_width/3,1/12,1/12],
                [eye_width/3,-1/12,1/12]
            ].map(function(v) {
                var v3 = new THREE.Vector3(v[0]*exf,v[1],v[2]*xf*-exf);
                v3.add(eye_center);
                g.vertices.push(v3);
            });
            [   [ei+0,ei+1,fi+pt],[ei+0,fi+pt,ei+2],
                [ei+1,fi+10,fi+pt],
                [ei+2,fi+pt,fi+12]
            ].map(function(f) {
                var face = new THREE.Face3(f[0],f[1],f[2]);
                g.faces.push(face);
            });
        });
        g.faces.push(new THREE.Face3(fi+10,eye+1,eye+4));
        g.faces.push(new THREE.Face3(fi+12,eye+5,eye+2));

        return fi;
    });
    // Mouth: jaw
    var jaw_face = new THREE.Face3(4,sides[0]+14,sides[1]+14);
    jaw_face.color = new THREE.Color(SKIN);
    g.faces.push(jaw_face);

    // Nose
    const nose_points = 4;
    var nose = g.vertices.length,
        sect = 1 / (2 * (nose_points+1)),
        half = (nose_points-1) / 2,
        zf = (half==0)
            ? function() { return 0; }
            : function(d) {
                var rd = half - Math.abs(d),
                    r = rd / half;
                return (r+5) / 6;
            };
    for(var i=0;i<nose_points;i++) {
        var p = (i==0) ? (sides[1]+13) : (nose+(i-1)),
            d = i - half;
        g.vertices.push(new THREE.Vector3(d*sect,-5/6,zf(d)));
        g.faces.push(new THREE.Face3(2,p,nose+i));
        g.faces.push(new THREE.Face3(3,nose+i,p));
    }
    g.faces.push(new THREE.Face3(2,nose+nose_points-1,sides[0]+13));
    g.faces.push(new THREE.Face3(3,sides[0]+13,nose+nose_points-1));

    var compose = function(array,indices) {
        var r = new THREE.Vector3(0,0,0);
        indices.map(function(i) {
            var v3 = g.vertices[array[i]];
            r.add(v3);
        });
        r.divideScalar(indices.length);
        return r;
    };
    // Mouth
    var mouth = g.vertices.length, mps = 3,
        outer = [ 3, sides[0]+9, sides[0]+14, sides[1]+14, sides[1]+9 ],
        mw = g.vertices[outer[1]].x - g.vertices[outer[4]].x,
        my = compose(outer,[1,4]).y,
        mz = compose(outer,[0,2,3]).z,
        upper = [], lower = [];
    for(var i=0;i<mps;i++) {
        var x = (i-1) * (mw/mps);
        g.vertices.push(new THREE.Vector3(x,my,mz));
        g.vertices.push(new THREE.Vector3(x,my,mz));
    }
    [
        [-1,-5, 0], [-1, 0, 2], [-1, 2, 4], [-1, 4,-2],
        [-5,-4, 1], [-4, 3, 1], [-4,-3, 3], [-3, 5, 3], [-3,-2, 5]
    ].map(function(f) {
        f = f.map(function(i) { return (i<0) ? outer[-i-1] : (mouth+i); });
        var face = new THREE.Face3(f[0],f[1],f[2]);
        g.faces.push(face);
    });

    return function(i) {
        if (i==0) { return index; }
        if (i==6) { return index+4; }
        if (Math.abs(i)>11) { throw "Error: Face has only 12 points."; }
        if (i>6) { i -= 12; } else if (i<-6) { i += 12; }
        if (i>0) { return sides[0] + (i-1); }
        else if (i<0) { return sides[1] + (-i-1); }
    };
}

/*------------------------------------------------------------*\
 * Humanoid: Hair Style 1
\*------------------------------------------------------------*/
function drawCoverHair(hair,layers,putv,putf) {
    const r = 1 + hair;
    var top = putv(0,r,0), forehair = [];
    // Layer1
    var layer1 = putArc(r*Math.cos(d30),2,4,r*Math.sin(d30)).map(putv);
    forehair.push([layer1[0]]);
    forehair.push([layer1[1],top,layer1[3]]);
    // Layer2
    var layer2 = putArc(r*Math.cos(d30*2),1.5,5,r*Math.sin(d30*2),true).map(putv);
    forehair[1].unshift(layer2[0]);
    forehair[1].push(layer2[5]);
    //indices.push(layer2);
    linkArc([[top],modArc(layer1,false),layer2],[0,1,1.5]).map(putf(HAIR));
    linkArc(forehair).map(putf(HAIR));

    // More layers
    //var indices = [], interlace = 2, arcs = [0,1];
    var indices = [layer2], arcs = [1.5];
    layers.map(function(l,i) {
        var y = l[0], arc = l[1], radius = r * l[2],
            layer = putArc(y,arc,4+(i%2),radius,true).map(putv);
        if (i==0) {
            if (arc<1) {
                indices[0] = modArc(layer2,1);
                arcs[0] = 1;
            }
        }
        indices.push(layer);
        arcs.push(arc);
    });
    /*function(layer,i) {
        arcs.push(a);
        indices.push(putArc(layer[0],0.8,s+(interlace%2),r*layer[1],true).map(putv));
        interlace++;
    });*/
    linkArc(indices,arcs).map(putf(HAIR));
    var fh_c = layer1[0],
        fh_p = layer2[0],
        fh_n = layer2[5];
    return function(i) {
        if (i==1) { return fh_p; }
        if (i==-1) { return fh_n; }
        return fh_c;
    };
}

/*------------------------------------------------------------*\
 * Humanoid: Ear
\*------------------------------------------------------------*/
function drawEar(znyp,znxp,length,arc,section,face,backhead,putv,putf) {
    const yr = znyp * RADIAN,
        xr = znxp * RADIAN,
        et = section > 1,
        a = arc * RADIAN / section,
        r = et ? Math.abs((length/2)/-Math.cos(yr)) : (length/2),
        fx = et ? (Math.sin(xr/3)*-r) : (Math.sin(xr)*r),
        l2 = 0.25;//length / 2;

    var headloop = backhead.map(function(e) { return e; });
    [1,-1].map(function(xf) {
        var flip = xf==-1,
            root = putv(Math.sqrt(7/8)*xf,-1/4,-1/4),
            cp = new THREE.Vector3(
                (1+Math.sin(xr)*l2)*xf,
                   Math.sin(yr)*r,
                  -Math.cos(yr)*r),
            c = putv(
                (1+Math.sin(xr/3)*l2)*xf,
                Math.abs(Math.sin(yr)*r)*-1,
                -Math.cos(xr/2)*l2),
            fs = [
                [root,face(4*xf),flip ? backhead[backhead.length-1] : backhead[0]],
                [c,face(3*xf),face(4*xf)]
            ], last = -1;
        for(var i=0;i<section;i++) {
            var pt = putv(cp.clone().add(new THREE.Vector3(
                (i==0) ? fx*xf : 0,
                Math.sin((i+1)*a-yr)*r,
                Math.cos((i+1)*a-yr)*r
            )));
            if (i==0) {
                fs.push([c,pt,face(3*xf)]);
                fs.push([root,face(3*xf),pt]);
            } else {
                fs.push([c,pt,last]);
                fs.push([root,last,pt]);
            }
            if (i==section-1) {
                fs.push([c,face(4*xf),pt]);
                fs.push([root,pt,face(4*xf)]);
            }
            last = pt;
        }
        
        fs.map(function (f) {
            return flip
                ? new THREE.Face3(f[0],f[2],f[1])
                : new THREE.Face3(f[0],f[1],f[2]);
        }).map(putf(SKIN));

        if (!flip) { headloop.unshift(root); } else { headloop.push(root); }
    });

    return modArc(headloop,face,[3,2,1,0]);
}


/*------------------------------------------------------------*\
 *
\*------------------------------------------------------------*/
window.kjGame3D = window.kjGame3D || {};

const HEAD = 5,
    NECK = 1,
    UPPER_TORSO = 9,
    LOWER_TORSO = 6,
    UPPER_ARM = 6,
    FRONT_ARM = 6,
    UPPER_LEG = 8,
    LOWER_LEG = 9,
    FOOT = 1;

const FACE = 4.8;
    SHOULDER = 10,
    CHEST = 8,
    WAIST = 6,
    HIP = 10,
    ARM = 2,
    LEG = 3;

window.kjGame3D.Humanoid = function(opt) {
    THREE.Geometry.call(this);

    if (opt==null) { opt = {}; }
    //this.vertices
    var scale = ("scale" in opt) ? parseFloat(opt["scale"]) : 1;

    // Head Parameter
    var head = 6 * scale, head_sphere = 5 * scale, face = 4 * scale;

    // Torso Parameter
    var upper_torso = 1.5 * head, lower_torso = 1 * head;
    if ("torso" in opt) {
        var torso = opt["torso"];
        switch(typeof torso) {
        case "number":
            upper_torso = 0.6 * torso * head;
            lower_torso = 0.4 * torso * head;
            break;
        case "object":
            // TODO: input methods
            /*if ("upper" in torso && "lower" in torso) {
                upper_torso = parseFloat(torso["upper"]) * head;
                lower_torso = parseFloat(torso["lower"]) * head;
            }*/
            break;
        }
    }
    var torso = upper_torso + lower_torso;

    // build Head & Torso
    
    //this.vertices.push(new THREE.Vector3(0,torso+head,0));

    var that = this;
    var _MakeRim = function(y,width,deep) {
        var w2 = width * scale / 2, d3 = deep * scale / 3;
        var pt = that.vertices.length;
        [
            [      0,y  ,-d3*1*0.75],
            [ w2*1/2,y+1,-d3*1],
            [ w2    ,y  , 0],
            [ w2*2/3,y+1, d3*2*0.75],
            [      0,y  , d3*2],
            [-w2*2/3,y+1, d3*2*0.75],
            [-w2    ,y  , 0],
            [-w2*1/2,y+1,-d3*1]
        ].map(function(v3) {
            var v = new THREE.Vector3(v3[0],v3[1],v3[2]);
            that.vertices.push(v);
        });
        return pt;
    };
    var _WeaveStrip = function(upper,lower,points) {
        for(c=0;c<points;c++) {
            var u = (c%2) ? lower : upper,
                o = (c%2) ? upper : lower,
                n = (c+1) % points,
                p = (c+points-1) % points;
            [ [o+p,o+c,u+c], [o+c,o+n,u+c] ].map(function(f3) {
                if (c%2) {
                    that.faces.push(new THREE.Face3(f3[0],f3[1],f3[2]));
                } else {
                    that.faces.push(new THREE.Face3(f3[2],f3[1],f3[0]));
                }
            });
        }
    };
    // Torso
    var upper_chest_rim_b0 = _MakeRim(lower_torso+upper_torso*7/9,SHOULDER,LEG+2);
    var lower_chest_rim_b0 = _MakeRim(lower_torso+upper_torso/3,CHEST,LEG+0.5);
    var waist_rim_b0 = _MakeRim(lower_torso,WAIST,LEG);
    _WeaveStrip(upper_chest_rim_b0,lower_chest_rim_b0,8);
    _WeaveStrip(lower_chest_rim_b0,waist_rim_b0,8);

    this.computeFaceNormals();
};

window.kjGame3D.Humanoid.prototype = Object.create(THREE.Geometry.prototype);
window.kjGame3D.Humanoid.prototype.constructor = window.kjGame3D.Humanoid;


})();