import { StyleSheet } from "./stylesheet.js";

/*------------------------------------------------------------*\
 * Very Simple UUID
\*------------------------------------------------------------*/
let counter = 0;
function uuid(prefix) {
    counter++;
    return prefix + counter;
}

/*------------------------------------------------------------*\
 * Style Functions
\*------------------------------------------------------------*/
function to_length(val) {
    if (typeof val == "string") { return val; }
    if (typeof val == "number") { return parseFloat(val) + "px"; }
    throw "Error: unknown length value!";
}
function stylize(v) {
    if (v instanceof Array) { return v.map(to_length).join(" "); }
    return to_length(v);
}

function rectangle(data) {
    let ret = {"width":"auto","height":"auto"},
        pad = ("spacing" in data) ? data.spacing : 0;
    if ("columns" in data) {
        let cols = data.columns;
        ret.width = to_float2(100,cols) + "%";
        if (pad>0) {
            let m = to_float2(pad*cols,cols+1);
            ret.width = "calc(" + ret.width + " - " + m*2 + "px)";
            ret.margin = m;
        }
    }
    if ("rows" in data) {
        let rows = data.columns;
        ret.height = to_float2(100,rows) + "%";
        if (pad>0) {
            let m = to_float2(pad*rows,rows+1);
            ret.height = "calc(" + ret.height + " - " + m*2 + "px)";
            ret.margin = m;
        }
    }
    return ret;
}

function to_float(str,related) {
    if (typeof str == "number") { return str; }
    if (typeof str != "string") { "Error: unknown length string!"; }
    let val = parseFloat(str);
    if (str.charAt(str.length-1)=='%' && related) {
        val = val * related / 100;
    }
    return val;
}

function to_float2(num,div) {
    return parseInt(Math.floor(num*100/div)) / 100;
}

function transit(src,src_key,dest,dest_key,filter) {
    if (src_key in src) {
        if (dest_key==null) { dest_key = src_key; }
        let val = src[src_key];
        if (typeof filter == "function") { val = filter(val); }
        dest[dest_key] = val;
    }
}

function to_css(data,origin) {
    if (origin==null || typeof origin != "object") {
        origin = {};
    }
    [   "position", "top", "left", "right", "bottom", "z-index",
        "display", "box-sizing",
        "width", "height", "margin", "padding",
        "background", "background-color",
        "font-size", "font-family", "line-height", "text-align", "color",
        "cursor"
    ].map((k)=>{
        if (!(k in data)) { return; }
        if (["top","left","right","bottom"].indexOf(k)>=0
         && !("position" in data)) {
            origin["position"] = "absolute";
        }
        let v = data[k];
        if (typeof v =="string" && v.charAt(0)=='@') { return; }
        try { origin[k] = stylize(v); } catch(e) {}
    });
    // position
    if (!("position" in origin)) {
        origin["position"] = "relative";
    }
    if (!("display" in origin)) { origin["display"] = "block"; }
    if (!("box-sizing" in origin)) { origin["box-sizing"] = "border-box"; }
    if ("position" in data) {
        let pos = data["position"];
        if (typeof pos == "object") {
            ["top","left","right","bottom"].map((k)=>{
                if (k in pos) {
                    origin[k] = to_length(pos[k]);
                    origin["position"] = "absolute";
                }
            });
            ["width","height","margin"].map((k)=>{
                if (k in pos) {
                    origin[k] = to_length(pos[k]);
                }
            });
        } else if (typeof pos == "string") {
            origin["position"] = pos;
        }
    }
    // border
    if ("border" in data) {
        let border = data["border"];
        if (typeof border == "object") {
            if (border instanceof Array) {
                origin["border"] = stylize(border);
            } else {
                ["width","style","color"].map((k)=>{
                    transit(border,k,origin,"border-"+k,stylize);
                });
                transit(border,"corner",origin,"border-radius",stylize);
            }
        } else if (typeof border == "string") {
            origin["border"] = border;
        } else if (typeof border == "number") {
            origin["border-width"] = to_length(border);
        }
    }
    // font
    if ("font" in data) {
        let font = data["font"];
        if (typeof font == "object") {
            if (font instanceof Array) {
                origin["font"] = stylize(font);
            } else {
                transit(font,"family",origin,"font-family");
                transit(font,"size",origin,"font-size",to_length);
                transit(font,"line",origin,"line-height",to_length);
                transit(font,"align",origin,"text-align");
                transit(font,"color",origin);
            }
        } else if (typeof font == "string") {
            origin["font"] = border;
        } else if (typeof font == "number") {
            origin["font-size"] = to_length(border);
        }
    } else {
        transit(data,"size",origin,"font-size",to_length);
        transit(data,"align",origin,"text-align");
        transit(data,"color",origin);
    }
    return origin;
}

function parse_image(img) {
    if (typeof img !="object") {
        if (typeof img == "string") { return img; }
        return "";
    }
    if (!("uri" in img)) { return ""; }
    let bg_style = [ "url("+img.uri+")" ],
        w = 0, h = 0;
    if ("clip" in img) {
        let clip = (img.clip instanceof Array) ? img.clip : [img.clip];
        for(let i=1;i<4;i++) {
            if (i<clip.length) { continue; }
            if (i==1) { clip.push(clip[0]); }
            if (i==2) { clip.push(clip[0]); }
            if (i==3) { clip.push(clip[1]); }
        }
        let pos = img.clip.map((c,i)=>{
            if (i%2) { w += c; }
            else { h += c; }
            return (c==0) ? 0 : -c;
        }).map(to_length).slice(0,2);
        bg_style.push(pos.join(" "));
    } else { bg_style.push("center"); }
    let w_fill = "100%", h_fill = "100%";
    if (w!=0) { w_fill = "calc(100% "+(w<0?"-":"+")+" "+Math.abs(w)+"px)"; }
    if (h!=0) { h_fill = "calc(100% "+(h<0?"-":"+")+" "+Math.abs(h)+"px)"; }
    if ("repeat" in img) {
        switch (img.repeat) {
        case "repeat":
            bg_style.push("/ auto");
            bg_style.push("repeat");
            break;
        case "repeat-x":
            bg_style.push("/ auto "+h_fill);
            bg_style.push("repeat-x no-repeat");
            break;
        case "repeat-y":
            bg_style.push("/ "+w_fill+" auto");
            bg_style.push("no-repeat repeat-y");
            break;
        case "fill":
            bg_style.push("/ "+w_fill+" "+h_fill);
            bg_style.push("no-repeat");
            break;
        case "contain":
            bg_style.pop();
            bg_style.push("center / contain");
            bg_style.push("no-repeat");
            break;
        case "auto":
            bg_style.push("/ auto");
            bg_style.push("no-repeat");
            break;
        }
    }
    return bg_style.join(" ");
}

function to_ratio(ratio) { return isNaN(ratio) ? 1 : ratio; }

/*------------------------------------------------------------*\
 * Block
\*------------------------------------------------------------*/
class Block {
    constructor(json,layout) {
        if (json==null || typeof json != "object") {
            throw "Error: invalid Block data.";
        }
        this.key = ("key" in json) ? json.key : uuid("_block");
        this.type = ("type" in json) ? json.type : "block";
        this.styles = to_css(json,{});
        if("styles" in json) { this.styles = to_css(json.styles,this.styles); }
        if (this.type=="container") {
            this.styles["display"] = "flex";
            this.styles["justify-content"] = "center";
            this.styles["flex-wrap"] = "wrap";
            this.direction = json.direction;
            switch (this.direction) {
            case "LRTB":
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "row";
                break;
            /*case "LRBT":
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "row-reverse";
                break;*/
            case "RLTB":
                this.styles["direction"] = "rtl";
                this.styles["flex-direction"] = "row";
                break;
            /*case "RLBT":
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "row-reverse";
                break;*/
            case "TBLR":
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "column";
                break;
            case "TBRL":
                this.styles["direction"] = "rtl";
                this.styles["flex-direction"] = "column";
                break;
            case "BTLR":
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "column-reverse";
                break;
            case "BTRL":
                this.styles["direction"] = "rtl";
                this.styles["flex-direction"] = "column-reverse";
                break;
            default:
                this.styles["direction"] = "ltr";
                this.styles["flex-direction"] = "row";
                this.direction = "LRTB";
                break;
            }
        }
        this.listener = {};
        if ("listener" in json) {
            ["hover","click"].map((e)=>{
                if (e in json.listener) {
                    this.listener[e] = json.listener[e];
                }
            });
        }
        this.element = document.createElement(this.type=="image"?"img":"div");
        this.element.classList.add(this.key);
        //this.element.choiceGameBlock = this;
        this.element.setAttribute("choicegame-block-type",this.type);

        this.layout = layout;
        this.parent = null;
        this.children = [];
    }

    set(property,value) {
        let dict = {};
        dict[property] = value;
        this.styles = to_css(dict,this.styles);
    }

    locate(x,y,z) {
        this.styles["top"] = to_length(y);
        this.styles["left"] = to_length(x);
        this.styles["z-index"] = to_length(z);
    }

    resize(w,h) {
        this.styles["width"] = to_length(w);
        this.styles["height"] = to_length(h);
    }

    anchor(side,value) {
        if (["top","left","right","bottom"].indexOf(side)<0) { return; }
        this.styles[side] = to_length(value);
    }

    move(dx,dy) {
        let x = ("left" in this.styles)
                ? to_float(this.styles["left"],this.element.offsetWidth) : 0,
            y = ("top" in this.styles)
                ? to_float(this.styles["top"],this.element.offsetHeight) : 0;
        this.styles["top"] = to_length(y+dy);
        this.styles["left"] = to_length(x+dx);
    }

    moveup() {}
    movedown() {}

    remove() {
        this.layout.updated = false;
        if (this.parent==null) {
            this.element.parentNode.removeChild(this.element);
            return;
        }
        let index = this.parent.children.indexOf(this);
        if (index<0) { throw ""; }
        this.parent.children.slice(index,1);
        this.parent.element.removeChild(this.element);
        this.parent = null;
    }

    insert(type,styles,content) {
        this.layout.updated = false;
        if (type instanceof Block) {
            type.parent = this;
            this.children.push(type);
            this.element.appendChild(type.element);
            return;
        }
        if (typeof type == "string") {
            type = {
                "type": type,
                "styles": styles,
                "content": content==null ? [] : content
            };
        }
        if (typeof type == "object") {
            let block = new Block(type,this.layout);
            block.parent = this;
            this.childrean.push(block);
            this.element.appendChild(block.element);
        }
    }

    clone(newkey) {}
    content(content) {}

    toJSON(stringify) {
        let ret = {
            "type": this.type,
            "styles": this.styles,
            "content": ("reference" in this) ? this.reference : []
        };
        if (this.key.charAt(0)!='_') { ret["key"] = this.key; }
        if (this.type=="options") {
            ret["template"] = this.template.toJSON();
            ret["direction"] = this.direction;
        }
        return (stringify===true) ? JSON.stringify(ret) : ret;
    }

}

/*------------------------------------------------------------*\
 * Layout
\*------------------------------------------------------------*/
const SHEETNAME = "customLayoutSheet";
let css = new StyleSheet(SHEETNAME);

class Layout {
    constructor(json) {
        this.key = ("key" in json) ? json.key : uuid("_layout");
        this.type = ("type" in json) ? json.type.toLowerCase() : "component";
        this.width = ("width" in json) ? parseInt(json.width) : 1024;
        this.height = ("height" in json) ? parseInt(json.height) : 768;
        this.aspect = this.width / this.height;
        this.attributes = {};
        transit(json,"rows",this);
        transit(json,"columns",this);
        transit(json,"spacing",this);
        let block = {
            "key": this.key,
            "type": "block"
        };
        switch (this.type) {
        case "component":
            if (!("position" in json)) {
                block.position = {
                    "width": "auto",
                    "height": "auto"
                };
            } else {
                transit(json,"position",block);
            }
            break;
        }
        transit(json,"styles",block);
        transit(json,"border",block);
        transit(json,"font",block);
        transit(json,"background",block);
        if ("content" in json) { block.content = json.content; }
        let queue = [{
            "data": block,
            "prefix": "",
            "parent": this
        }];
        while (queue.length>0) {
            let q = queue.shift(),
                b = new Block(q.data,this);
            if ("background" in q.data) {
                let bg = q.data.background;
                if (typeof bg == "string") {
                    if (bg.charAt(0)=='@') {
                        let bgkey = bg.substring(1);
                        this.attributes[bgkey] = {
                            "type": "background",
                            "block": b
                        };
                    } else {
                        b.set("background-color",bg);
                    }
                } else if (typeof bg == "object") {
                    let bg_style = parse_image(bg);
                    b.set("background",bg_style);
                }
            }
            if (b.type=="container"
                && "template" in q.data
                && "group" in q.data) {
                let template = q.data.template;
                template.position = rectangle(q.data);
                b.template = new Layout(template);
                this.attributes[q.data.group+"."+b.key] = b;
            }
            if (q.parent instanceof Layout) {
                q.parent.root = b;
            } else if (q.parent instanceof Block ) {
                q.parent.insert(b);
            } else { throw "Invalid parent!"; }
            if ("content" in q.data) {
                let content = q.data.content;
                if (!(content instanceof Array)) { content = [content]; }
                let htmls = content.reduce((a,c)=>{
                    switch (typeof c) {
                    case "object":
                        queue.push({
                            "data": c,
                            "prefix": q.prefix,
                            "parent": b
                        });
                        break;
                    case "string":
                        if (c.charAt(0)=='@') {
                            let attr = q.prefix + c.substring(1);
                            this.attributes[attr] = b;
                            b.reference = c;
                            break;
                        }
                    default:
                        a.push(to_html(c));
                        break;
                    }
                    return a;
                },[]);
                //console.log(htmls);
            }
        }
        this.updated = false;
    }

    render(data) {
        this.update();
        let attributes = this.attributes;
        for(let k in attributes) {
            let block = attributes[k],
                content = k.split(".").reduce((obj,attr)=>{
                    if (obj==null) { return null; }
                    if (attr in obj) { return obj[attr]; }
                    return null;
                },data);
            switch(block.type) {
            case "text":
                if (content instanceof Array) { content = content.join("<br/>"); }
                block.element.innerHTML = content;
                break;
            case "image":
                let img = content || "";
                if (typeof img == "object") { img = img.uri; }
                if (typeof img != "string") { img = ""; }
                block.element.setAttribute("src",img);
                break;
            case "background":
                block.block.element.style.setProperty(
                    "background",
                    parse_image(content)
                )
                break;
            case "container":
                block.element.innerHTML = "";
                content.map((c)=>{
                    block.template.render(c);
                    let opt = block.template.fill(block.element,true);
                    if ("option_id" in c) {
                        opt.setAttribute("choicegame-option",c.option_id);
                    }
                });
                break;
            }
        }
    }

    fill(wrapper,options) {
        if (!(wrapper instanceof HTMLElement)) {
            throw "Invalid HTMLElement";
        }
        let clone = false;
        if (typeof options != "object") {
            if (typeof options == "boolean") { clone = options; }
            options = {};
        } else {
            clone = ("clone" in options) ? (options.clone===true) : false;
        }
        let e = (clone===true)
            ? this.root.element.cloneNode(true)
            : this.root.element;
        if (this.type=="scene") {
            e.style.width = to_length(this.width);
            e.style.height = to_length(this.height);
            let stick = ("stick" in options) ? options.stick : "none",
                scale;
            switch (stick.toLowerCase()) {
            case "width":
            case "horizontal":
            case "horz":
                // check if the layout is stick to vertical
                scale = (w,h)=>{
                    wrapper.style.height = to_length(w/this.aspect);
                    return w / this.width;
                };
                break;
            case "height":
            case "vertical":
            case "vert":
                // check if the layout is stick to horizontal
                scale = (w,h)=>{
                    wrapper.style.width = to_length(h/this.aspect);
                    return h / this.height;
                };
                break;
            case "none":
            default:
                stick = "none";
                if (wrapper.parentNode!=document.body) {
                    scale = (w,h)=>{
                        let sw = w ? (w/this.width) : 1,
                            sh = h ? (h/this.height) : 1;
                        if (sw<sh) {
                            wrapper.style.height = to_length(w/this.aspect);
                            return sw;
                        }
                        wrapper.style.width = to_length(h/this.aspect);
                        return sh;
                    };
                } else {
                    scale = (w,h)=>{
                        return Math.min(w/this.width,h/this.height);
                    };
                }
                break;
            }
            wrapper.onresize = ()=>{
                let s = scale(wrapper.clientWidth,wrapper.clientHeight);
                let w = wrapper.clientWidth, h = wrapper.clientHeight;
                e.style.margin = [h-this.height,w-this.width].map((px)=>{
                    return to_length(Math.floor(px/2));
                }).join(" ");
                s = (s>1) ? 1 : ((Math.floor(s*10000)+5) / 10000);
                e.style.transform = (s<1) ? "scale("+s+")" : "";
                e.style.transformOrigin = "center";
                e.style.overflow = "hidden";
                e.setAttribute("choicegame-layout-scalar",(s*100)+"%");
            };
            wrapper.onresize();
        }
        wrapper.innerHTML = "";
        wrapper.appendChild(e); 
        return e;
    }

    update() {
        if (this.updated) { return; }
        let queue = [{
            "block": this.root,
            "upper": ""
        }];
        while (queue.length>0) {
            let q = queue.shift(),
                selector = q.upper;
            if (selector.length>0) { selector += " > "; }
            selector += "." + q.block.key;
            css.insert(selector,q.block.styles);
            for(let mod in q.block.listener) {
                css.insert(selector+":"+mod,q.block.listener[mod]);
            }
            q.block.children.map((b)=>{
                queue.push({
                    "block": b,
                    "upper": selector
                });
            });
        }
        this.updated = false;
    }

    insert(type,styles,content) { this.root.insert(type,styles,content); }
    remove(block) { block.remove(); }

    toJSON(stringify) {
        let ret = {
            "type": this.type,
            "styles": this.root.styles,
            "content": []
        };
        if (this.key.charAt(0)!='_') { ret["key"] = this.key; }
        transit(this,"width",ret);
        transit(this,"height",ret);
        transit(this,"rows",ret);
        transit(this,"columns",ret);
        transit(this,"spacing",ret);
        let queue = [{
            "list": this.root.children,
            "parent": ret
        }];
        while(queue.length>0) {
            let q = queue.shift();
            q.list.map((b)=>{
                let json = b.toJSON();
                q.parent.content.push(json);
                if (b.children.length>0) {
                    queue.push({
                        "list": b.children,
                        "parent": json
                    });
                }
            });
        }
        return (stringify===true) ? JSON.stringify(ret) : ret;
    }
}

/*------------------------------------------------------------*\
 * Export
\*------------------------------------------------------------*/
export { Block, Layout };