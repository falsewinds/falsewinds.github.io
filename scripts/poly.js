(function() {

if (THREE==null) {
    console.log("Three.js not loaded.");
    return;
}

window.kjGame3D = window.kjGame3D || {};

window.kjGame3D.Polyhedron = function(g) {
    if (!(g instanceof THREE.Geometry)) { throw "Not a Geometry."; }
    const epsilon = 0.001;
    this.vertices = g.vertices;
    this.polygons = [];
    var self = this;

    // Convert Face to Polygon
    g.computeFaceNormals();
    g.computeVertexNormals();
    var facesByNormal = [];
    g.faces.map(function(face) {
        var n = face.normal, joined = false;
        if (n.length()==0) { return; }
        for(var i=0;i<facesByNormal.length;i++) {
            var fs = facesByNormal[i];
            if (fs.normal.angleTo(n)<epsilon) {
                fs.faces.push(face);
                joined = true;
                break;
            }
        }
        if (!joined) {
            facesByNormal.push({
                "normal": n,
                "faces": [face]
            });
        }
    });
    facesByNormal.map(function(fs) {
        var polygon = [], faces = fs.faces;
        while(faces.length>0) {
            var f = faces.shift();
            if (polygon.length==0) {
                polygon.push(f.a);
                polygon.push(f.b);
                polygon.push(f.c);
                continue;
            }
            var indice = [ f.a, f.b, f.c ],
                index = indice.map(function(i) { return polygon.indexOf(i); }),
                found = index.map(function(i) { return (i<0)?"F":"T" }).join("");
            switch(found) {
            case "TTT":
                break;
            case "FTT":
            case "TFT":
            case "TTF":
                var m = found.indexOf("F"),
                    p = index[(m+2)%3], n = index[(m+1)%3];
                if ((n-p)==1) {
                    polygon.splice(n,0,indice[m]);
                } else if (p==(polygon.length-1)) {
                    polygon.push(indice[m]);
                } else {
                    console.log(indice,index);
                }
                break;
            default:
                console.log(found);
                faces.push(f);
                break;
            }
        }
        self.polygons.push(polygon);
    });
};
window.kjGame3D.Polyhedron.prototype.cut = function(p) {
    if (!(p instanceof THREE.Plane) ) { return; }
    var self = this;

    var newVertices = [], newPolygons = [],
        abandoned = [], map = {};        
    for(var i in this.vertices) {
        var pt = this.vertices[i],
            d = p.distanceToPoint(pt);
        if (d>=0) {
            map["PT"+i] = newVertices.length;
            newVertices.push(pt);
        } else { abandoned.push(parseInt(i)); }
    }
    if(newVertices.length==0) { return; }

    var newVertex = function(i1,i2) {
        var k = "I" + Math.min(i1,i2) + Math.max(i1,i2);
        if (!(k in map)) {
            var line = new THREE.Line3(self.vertices[i1],self.vertices[i2]),
                pt = new THREE.Vector3();
            if (p.intersectLine(line,pt)==null) {
                console.log("Error!!!");
                return 0;
            }
            map[k] = newVertices.length;
            newVertices.push(pt);
        }
        return map[k];
    };

    var newLines = [];
    this.polygons.map(function(polygon) {
        var outsides = polygon.map(function(i) {
                return (abandoned.indexOf(i)<0) ? "1" : "0";
            }).join("");
        if (outsides.indexOf("1")<0) { return; }
        if (outsides.indexOf("0")<0) {
            newPolygons.push(polygon.map(function(i) {
                return map["PT"+i];
            }));
            return;
        }
        var newPolygon = [], start = outsides.indexOf("0");
        if (start==0) { start = (outsides.lastIndexOf("1")+1) % polygon.length; }

        var newLine = [];
        for(var i=0;i<polygon.length;i++) {
            var c = (start+i) % polygon.length,
                p = ((c-1)+polygon.length) % polygon.length;
            if (outsides.charAt(c)=="1") {
                if (outsides.charAt(p)=="0") {
                    var index = newVertex(polygon[p],polygon[c]);
                    newLine.push(index);
                    newPolygon.push(index);
                }
                var k = "PT" + polygon[c];
                newPolygon.push(map[k]);
                continue;
            }
            if (outsides.charAt(p)=="1") {
                var index = newVertex(polygon[p],polygon[c]);
                newLine.push(index);
                newPolygon.push(index);
            }
        }
        newLines.push(newLine.reverse());
        newPolygons.push(newPolygon);
    });
    var cutPolygon = [];
    while(newLines.length>0) {
        var line = newLines.shift();
        if (cutPolygon.length<=0) {
            cutPolygon.push(line[0]);
            cutPolygon.push(line[1]);
            continue;
        }
        var index = [];
        line.map(function(i) {
            var idx = cutPolygon.indexOf(i);
            if (idx>=0) { index.push(idx); }
        });
        switch(index.length) {
        case 0:
            newLines.push(line);
            break;
        case 1:
            var idx = index[0],
                c = line.indexOf(cutPolygon[idx]);
            if (c==0) {
                cutPolygon.splice(idx+1,0,line[1]);
            } else {
                cutPolygon.splice(idx,0,line[0]);
            }
            break;
        case 2:
            break;
        }
    }
    if (cutPolygon.length>=3) { newPolygons.push(cutPolygon); }

    this.vertices = newVertices;
    this.polygons = newPolygons;
};
window.kjGame3D.Polyhedron.prototype.toGeometry = function() {
    var geometry = new THREE.Geometry();
    geometry.vertices = this.vertices;
    this.polygons.map(function(polygon) {
        for(var i=1;i<polygon.length-1;i++) {
            var face = new THREE.Face3(
                polygon[0],
                polygon[i],
                polygon[i+1]
            );
            geometry.faces.push(face);
        }
    });
    return geometry;
};

})();