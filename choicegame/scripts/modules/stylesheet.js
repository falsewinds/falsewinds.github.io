let counter = 0;
function to_css_text(dict) {
    let list = [];
    for(let k in dict) {
        list.push(k+":"+dict[k]);
    }
    return "{" + list.join(";") + "}";
}

class StyleSheet {
    constructor(title) {
        if (title==null) {
            title = "_stylesheet" + counter;
            counter++;
        }
        this.stylesheet = null;
        if (document.styleSheets) {
            for(const s of document.styleSheets) {
                if (s.title==title) {
                    this.stylesheet = s;
                    break;
                }
            }
        }
        if (this.stylesheet==null) {
            let element = document.createElement("style");
            element.setAttribute("title",title);
            document.body.appendChild(element);
            if (document.styleSheets) {
                let last = document.styleSheets.length - 1;
                this.stylesheet = document.styleSheets[last];
            } else {
                let that = this.stylesheet;
                this.stylesheet = {
                    "cssRules": [],
                    "insertRule": function(rule,index) {
                        let selector = rule.substring(0,rule.indexOf("{")).trim();
                        let cssrule = {
                            "selectorText": selector,
                            "cssText": rule
                        };
                        that.cssRules.splice(index,0,cssrule);
                        element.innerHTML = that.cssRules.map((c)=>{
                            return c.cssText;
                        }).join("\n");
                    },
                    "deleteRule": function(index) {
                        that.cssRules.splice(index,1);
                        element.innerHTML = that.cssRules.map((c)=>{
                            return c.cssText;
                        }).join("\n");
                    }
                };
            }
        }
    }

    find(selector) {
        let rules = this.stylesheet.cssRules;
        for(let i=0;i<rules.length;i++) {
            if (rules[i].selectorText==selector) {
                return i;
            }
        }
        return -1;
    }

    insert(selector,styles) {
        let index = this.find(selector);
        if (index>=0) { this.stylesheet.deleteRule(index); }
        else { index = this.stylesheet.cssRules.length; }
        this.stylesheet.insertRule(selector+" "+to_css_text(styles),index);
    }

    remove(selector) {
        let index = this.find(selector);
        if (index<0) { return; }
        this.stylesheet.deleteRule(index);
    }
}

export { StyleSheet };