import {
    buildSVGNodeSequence as svg_node,
    findNodesByTag as find_node
} from "./dom.js";

/*------------------------------------------------------------*\
 * Mouse Event Handler
\*------------------------------------------------------------*/
let ctrl = null, mx, my, moved = false;
function dragStart(e) {
    if (ctrl!=null) { return; }
    moved = false;
    ctrl = e.target;
    mx = e.clientX;
    my = e.clientY;
    ctrl.controller.mask(true);
}
function dragMove(e) {
    if (ctrl==null) { return; }
    moved = true;
    let dx = e.clientX - mx,
        dy = e.clientY - my;
    ctrl.ondrag(dx,dy,e.shiftKey);
    ctrl.controller.dragging();
    mx = e.clientX;
    my = e.clientY;
}
function dragEnd(e) {
    if (ctrl==null) { return; }
    if (moved) {
        let dx = e.clientX - mx,
        dy = e.clientY - my;
        ctrl.ondrag(dx,dy,e.shiftKey);
        ctrl.controller.dragged();
    }
    ctrl.controller.mask(false);
    ctrl = null;
}

function hide_call(e) { e.style.visibility = "hidden"; }
function show_call(e) {
    e.style.visibility = "visible";
    e.onlocate();
}
function locate_call(e) { e.onlocate(); }

/*------------------------------------------------------------*\
 * Controller
\*------------------------------------------------------------*/
const CTRL_PAD = 10;
const CURSORS = [
    "nwse-resize", "ns-resize", "nesw-resize",
    "ew-resize",   "move",      "ew-resize",
    "nesw-resize", "ns-resize", "nwse-resize"
];

class Controller {
    constructor(parent) {
        const color = "black";
        this.svg = svg_node("svg",
            [
                "defs",
                "marker",{
                    "id": "arrow",
                    "viewBox": "0 0 10 10",
                    "refX": 10, "refY": 5,
                    "markerWidth": 6,
                    "markerHeight": 6,
                    "fill": color,
                    "orient": "auto-start-reverse"
                },
                "path",{ "d": "M 0,0 L 10,5 L 0,10 z" }
            ],
            [
                "rect", {
                    "class": "outline",
                    "stroke": color,
                    "stroke-width": 1,
                    "fill": "transparent"
                }
            ],
            "rect",{
                "class": "border",
                "stroke": "black",
                "stroke-width": 1,
                "stroke-dasharray": "6,6",
                "fill": "transparent",
                "pointer-events": "auto"
            });
        this.svg.style.position = "absolute";
        this.outline = this.svg.querySelector("rect.outline");
        this.border = this.svg.querySelector("rect.border");
        this.border.controller = this;
        this.border.ondrag = (dx,dy)=>{ this.resize(dx,dy,0,0); };
        this.border.addEventListener("mousedown",dragStart);
        this.border.addEventListener("dblclick",(e)=>{
            dragEnd(e);
            this.editing();
        });

        /* members
         * .scalar  : scalar of value display
         * .parent  : parent
         * .bounds  : x, y, w, h for block parent bounds
         * .rect    : x, y, w, h for update controllers
         */
        this.scalar = 1;
        this.parent = parent;
        this.bounds = { "x": 0, "y": 0, "w": 0, "h": 0 };;
        this.rect = { "x": 0, "y": 0, "w": 0, "h": 0 };

        // cover & coverClip
        this.cover = svg_node("svg",{
                "x": 0, "y": 0,
                "width": "100%",
                "height": "100%",
            },
            [
                "defs",
                "mask", {"id":"clip"},
                [   "rect",{
                    "x": 0, "y": 0,
                    "width": "100%",
                    "height": "100%",
                    "fill":"white"
                }],
                "rect", {
                    "class": "clip",
                    "fill":"black"
                }
            ],
            "rect",{
                "x": 0, "y": 0,
                "width": "100%",
                "height": "100%",
                "fill": "rgba(255,255,255,0.5)",
                "mask": "url(#clip)"
            });
        this.cover.style.visibility = "hidden";
        this.cover.style.zIndex = 90;
        this.coverClip = this.cover.querySelector("rect.clip");

        // appendChild & set Event Handler
        parent.appendChild(this.cover);
        parent.appendChild(this.svg);
        parent.addEventListener("mousemove",dragMove);
        parent.addEventListener("mouseup",dragEnd);

        // rulers
        for(let i=0;i<4;i++) {
            let ruler = svg_node("line",{
                "class": "arrow",
                "marker-end": "url(#arrow)",
                "stroke": color,
                "strokeWidth": 1
            }), fb = (i>=2) ? 1 : 0;
            ruler.onlocate = (i%2)
                ? ((s)=>{
                    return ()=>{
                        let x = this.rect.x + this.rect.w/2;
                        ruler.setAttributeNS(null,"x1",x+CTRL_PAD);
                        ruler.setAttributeNS(null,"x2",x+CTRL_PAD);
                        ruler.setAttributeNS(null,"y1",
                            this.rect.y+s*this.rect.h+CTRL_PAD);
                        ruler.setAttributeNS(null,"y2",
                            s*this.bounds.h+CTRL_PAD);
                    };
                })(fb)
                : ((s)=>{
                    return ()=>{
                        let y = this.rect.y + this.rect.h/2;
                        ruler.setAttributeNS(null,"y1",y+CTRL_PAD);
                        ruler.setAttributeNS(null,"y2",y+CTRL_PAD);
                        ruler.setAttributeNS(null,"x1",
                            this.rect.x+s*this.rect.w+CTRL_PAD);
                        ruler.setAttributeNS(null,"x2",
                            s*this.bounds.w+CTRL_PAD);
                    };
                })(fb);
            this.svg.appendChild(ruler);
        }
        this.rulers = [...this.svg.querySelectorAll("line.arrow")];
        // controller
        let pad = CTRL_PAD / 2 + 1;
        for(let i=0;i<9;i++) {
            let x = i % 3, y = (i-x) / 3;
            if (i==4) { continue; }
            // resize control dot
            let ctrl = svg_node("rect",{
                "class": "control-dot",
                "width": CTRL_PAD-2, "height": CTRL_PAD-2,
                "stroke": "black", "strokeWidth": 1,
                "fill": "white",
                "pointer-events": "painted"
            });
            ctrl.style.cursor = CURSORS[i];
            ctrl.addEventListener("mousedown",dragStart);
            ctrl.controller = this;
            ctrl.ondrag = ((mod)=>{
                return (dx,dy)=>{
                    this.resize([dx,dy,dx,dy].map((v,i)=>{
                        return mod[i] * v;
                    }));
                };
            })([
                (x==0) ? 1 : 0,
                (y==0) ? 1 : 0,
                (x==0) ? -1 : ((x==1)?0:1),
                (y==0) ? -1 : ((y==1)?0:1)
            ]);
            ctrl.onlocate = ((rx,ry)=>{
                return ()=>{
                    ctrl.setAttributeNS(null,"x",
                        rx*this.rect.w+this.rect.x+pad);
                    ctrl.setAttributeNS(null,"y",
                        ry*this.rect.h+this.rect.y+pad);
                };
            })(x/2,y/2);
            this.svg.appendChild(ctrl);
            // clip control marker
        }
        this.dots = [...this.svg.querySelectorAll("rect.control-dot")];

        this.hide();
    }

    set(key,value) {
        if (typeof key != "string") { return; }
        key = key.toLowerCase();
        switch(key) {
        case "color":
            this.svg.querySelector("defs > marker")
                .setAttributeNS(null,"fill",value);
            this.rulers.forEach((r)=>{
                r.setAttributeNS(null,"stroke",value);
            });
            this.outline.setAttributeNS(null,"stroke",value);
            break;
        case "opacity":
            value = Math.min(1,Math.max(0,value));
            this.cover.querySelector("svg > rect")
                .setAttributeNS(null,"fill","rgba(255,255,255,"+value+")");
            break;
        case "scalar":
            this.scalar = value;
            break;
        default:
            break;
        }
    }

    mask(enabled) {
        this.cover.style.pointerEvents = enabled ? "painted" : "none";
    }
    dragging() {
        let rect = ["x","y","w","h"].reduce((dict,k)=>{
            dict[k] = this.rect[k] * this.scalar;
            return dict;
        },{});
        this.parent.dispatchEvent(new CustomEvent("sizeChange",{
            "detail": {
                "rect": rect
            }
        }));
    }
    dragged() {
        let rect = ["x","y","w","h"].reduce((dict,k)=>{
            dict[k] = this.rect[k] * this.scalar;
            return dict;
        },{});
        this.parent.dispatchEvent(new CustomEvent("sizeChanged",{
            "detail": {
                "rect": rect
            }
        }));
    }
    editing() {
        this.parent.dispatchEvent(new CustomEvent("contentEdit",{
            "detail": {}
        }));
    }

    locate(rect,outer,bounds) {
        this.bounds.x = outer.x - bounds.x;
        this.bounds.y = outer.y - bounds.y;
        this.bounds.w = outer.width;
        this.bounds.h = outer.height;
        // Border
        this.svg.style.left = (this.bounds.x-CTRL_PAD) + "px";
        this.svg.style.top = (this.bounds.y-CTRL_PAD) + "px";
        this.svg.setAttributeNS(null,"width",this.bounds.w+2*CTRL_PAD);
        this.svg.setAttributeNS(null,"height",this.bounds.h+2*CTRL_PAD);
        this.outline.setAttributeNS(null,"x",CTRL_PAD);
        this.outline.setAttributeNS(null,"y",CTRL_PAD);
        this.outline.setAttributeNS(null,"width",this.bounds.w);
        this.outline.setAttributeNS(null,"height",this.bounds.h);
        this.rect.x = rect.x - outer.x;
        this.rect.y = rect.y - outer.y;
        this.rect.w = rect.width;
        this.rect.h = rect.height;
        this.border.setAttributeNS(null,"x",this.rect.x+CTRL_PAD);
        this.border.setAttributeNS(null,"y",this.rect.y+CTRL_PAD);
        this.border.setAttributeNS(null,"width",this.rect.w);
        this.border.setAttributeNS(null,"height",this.rect.h);
    }
    resize(dx,dy,dw,dh) {
        if (dx instanceof Array) { [dx,dy,dw,dh] = dx; }
        this.rect.x += dx;
        this.rect.y += dy;
        this.rect.w += dw;
        this.rect.h += dh;
        this.coverClip.setAttributeNS(null,"x",this.rect.x+this.bounds.x);
        this.coverClip.setAttributeNS(null,"y",this.rect.y+this.bounds.y);
        this.coverClip.setAttributeNS(null,"width",this.rect.w);
        this.coverClip.setAttributeNS(null,"height",this.rect.h);
        this.border.setAttributeNS(null,"x",this.rect.x+CTRL_PAD);
        this.border.setAttributeNS(null,"y",this.rect.y+CTRL_PAD);
        this.border.setAttributeNS(null,"width",this.rect.w);
        this.border.setAttributeNS(null,"height",this.rect.h);
        this.rulers.forEach(locate_call);
        this.dots.forEach(locate_call);
    }

    remove() {
        this.parent.removeEventListener("mousemove",dragMove);
        this.parent.removeEventListener("mouseup",dragEnd);
        this.parent.removeChild(this.svg);
        this.parent.removeChild(this.cover);
    }

    hide() {
        this.rulers.forEach(hide_call);
        this.dots.forEach(hide_call);
        this.outline.style.visibility = "hidden";
        this.svg.style.visibility = "hidden";
        this.cover.style.visibility = "hidden";
    }
    show(e,p) {
        let bounds = this.parent.getBoundingClientRect(),
            rect = e.getBoundingClientRect();
        // Clip & Mask
        this.coverClip.setAttributeNS(null,"x",rect.x-bounds.x);
        this.coverClip.setAttributeNS(null,"y",rect.y-bounds.y);
        this.coverClip.setAttributeNS(null,"width",rect.width);
        this.coverClip.setAttributeNS(null,"height",rect.height);
        this.cover.style.visibility = "visible";
        this.mask(false);
        // Top-level Block
        if (p==null) {
            this.locate(rect,rect,bounds);
            this.rulers.forEach(hide_call);
            this.dots.forEach(hide_call);
            this.outline.style.visibility = "hidden";
            this.svg.style.visibility = "visible";
            this.border.setAttributeNS(null,"pointer-events","none");
            return;
        }
        // Normal Block
        let outer = p.getBoundingClientRect();
        this.locate(rect,outer,bounds);
        this.rulers.forEach(show_call);
        this.dots.forEach(show_call);
        this.outline.style.visibility = "visible";
        this.svg.style.visibility = "visible";
        this.border.setAttributeNS(null,"pointer-events","auto");
    }
}

/*------------------------------------------------------------*\
 * Parent & Position
\*------------------------------------------------------------*/
let box = null;
function create(parent,options) {
    if (!(parent instanceof HTMLElement)) {
        throw "Error: need a HTMLElement parent.";
    }
    if (options==null) { options = {}; }
    if (box!=null) { box.remove(); }
    box = new Controller(parent);
    for(let k in options) {
        box.set(k,options[k]);
    }
    return box;
}


/*------------------------------------------------------------*\
 * Export
\*------------------------------------------------------------*/
export { create };