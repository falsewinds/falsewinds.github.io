
function buildBySelector(selector,parent) {
    return selector.split(" ").reduce((p,sel)=>{
        if (sel.length>0 && sel!=">") {
            let clss = sel.split("."),
                tag = clss.shift(), id = null;
            if (tag.indexOf("#")>0) {
                [tag,id] = tag.split("#");
            }
            if (tag.length==0) { tag = "div"; }
            let e = document.createElement(tag);
            if (id!=null) { e.id = id; }
            e.classList.add(clss);
            if (p!=null) { p.appendChild(e); }
            return e;
        }
        return p;
    },parent);
}

/*function buildSVGNode(node,properties) {
    let n = document.createElementNS("http://www.w3.org/2000/svg",node);
    if (typeof properties == "object") {
        for(let p in properties) {
            n.setAttributeNS(null,
                p.replace(/[A-Z]/g,(c)=>{ return "-"+c.toLowerCase(); }),
                properties[p]);
        }
    }
    return n;
}*/

function buildSVGNodeSequence() {
    let par = null, cur = null;
    for(let i=0;i<arguments.length;i++) {
        let arg = arguments[i];
        switch(typeof arg) {
        case "string":
            let tmp = document.createElementNS("http://www.w3.org/2000/svg",arg);
            if (cur!=null) { cur.appendChild(tmp); }
            cur = tmp;
            if (par==null) { par = cur; }
            break;
        case "object":
            if (cur==null) { break; }
            if (arg instanceof Array) {
                cur.appendChild(buildSVGNodeSequence.apply(null,arg));
                break;
            }
            for(let p in arg) {
                cur.setAttributeNS(null,p,arg[p]);
            }
            break;
        default:
            break;
        }
    }
    return par || cur;
}

function findNodesByTag(node,tag,reverse) {
    let nodes = [], queue = [node];
    while (queue.length>0) {
        let n = queue.shift();
        if (n.nodeName==tag) { nodes.push(n); }
        if (n.hasChildNodes) {
            let c = n.childNodes;
            for(let i=0;i<c.length;i++) {
                queue.push(c[i]);
            }
        }
    }
    return (reverse===true) ? nodes.reverse() : nodes;
 }

export {
    buildBySelector,
    buildSVGNodeSequence,
    findNodesByTag
};