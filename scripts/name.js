(function() {

function _rollf(arr) {
    if (typeof arr == "string") { arr = arr.split(""); }
    var copy = arr.slice(),
        max = arr.length;
    return function(exclude) {
        var i = Math.floor(Math.random()*max),
            r = copy[i];
        if (exclude===true) {
            copy.splice(i,1);
            max--;
            if (max==0) {
                copy = arr.slice();
                max = arr.length;
            }
        }
        return r;
    };
}

function _roll(arr) {
    if (typeof arr == "string") { arr = arr.split(""); }
    var i = Math.floor(Math.random()*arr.length);
    return arr[i];
}

/*------------------------------------------------------------*\
 * en to zh-TW
\*------------------------------------------------------------*/
var dictionary = {
"_": {
    "a":    [ "阿", "雅", "亞" ],
    "an":   [ "安" ],
    "ang":  [ "昂" ],
    "ai":   [ "愛", "艾" ],
    "o":    [ "歐", "奧" ],
    "u":    [ "烏", "武", "兀" ]
},
"b": {
    "a":    [ "巴", "峇", "芭" ],
    "e":    [ "北", "貝", "蓓" ],
    "i":    [ "畢" ],
    "in":   [ "賓" ],
    "o":    [ "波", "包" ],
    "u":    [ "布", "不" ]
},
"c": {
    "a":    "ka",
    "e":    "se",
    "i":    "shi",
    "o":    "ko",
    "u":    "ku"
},
"ch": {
    "a":    "ja",
    "e":    [ "切" ],
    "i":    [ "其", "奇", "齊", "琪" ],
    "o":    [ "丘", "秋" ],
    "u":    "cho"
},
"d": {
    "a":    [ "達", "妲" ],
    "an":   [ "丹" ],
    "ang":  [ "當" ],
    "ai":   [ "戴" ],
    "e":    [ "德", "得" ],
    "i":    [ "迪", "蒂" ],
    "o":    [ "多", "都" ],
    "u":    [ "都" ]
},
"f": {
    "a":    [ "法" ],
    "ai":   [ "伐" ],
    "an":   [ "凡" ],
    "ang":  [ "方" ],
    "e":    [ "非", "菲", "妃", "費" ],
    "i":    "fe",
    "o":    [ "佛" ],
    "u":    [ "弗", "芙" ]
},
"g": {
    "a":    [ "嘎" ],
    "i":    [ "基", "姬", "積" ],
    "o":    [ "苟" ],
    "u":    [ "古", "姑" ]
},
"h": {
    "a":    [ "哈" ],
    "an":   [ "韓" ],
    "e":    [ "黑" ],
    "i":    "shi",
    "o":    [ "霍", "賀" ],
    "u":    [ "乎", "忽" ]
},
"j": {
    "a":    [ "加", "佳", "迦", "甲" ],
    "an":   [ "珍" ],
    "am":   [ "詹" ],
    "e":    [ "杰", "傑", "結" ],
    "i":    [ "吉", "基", "姬", "積" ],
    "o":    [ "喬" ],
    "on":   [ "瓊" ],
    "u":    [ "朱" ]
},
"k": {
    "a":    [ "卡" ],
    "e":    [ "凱", "克" ],
    "i":    "chi",
    "o":    [ "寇", "蔻" ],
    "u":    [ "庫", "古" ]
},
"l": {
    "a":    [ "拉", "菈" ],
    "an":   [ "蘭" ],
    "e":    [ "樂", "勒", "列" ],
    "i":    [ "利", "里", "麗", "莉" ],
    "o":    [ "羅", "蘿" ],
    "u":    [ "露" ]
},
"m": {
    "a":    [ "馬", "瑪" ],
    "an":   [ "門" ],
    "e":    [ "梅" ],
    "i":    [ "米", "密", "蜜" ],
    "o":    [ "莫", "墨", "末" ],
    "u":    [ "木", "目", "穆" ]
},
"n": {
    "a":    [ "那", "娜", "納" ],
    "e":    [ "內" ],
    "i":    [ "尼", "妮", "倪", "婗" ],
    "o":    [ "諾" ],
    "u":    [ "奴" ]
},
"p": {
    "a":    [ "帕" ],
    "e":    [ "佩" ],
    "i":    [ "皮" ],
    "o":    [ "波" ],
    "u":    [ "普" ]
},
"q": {
    "a":    [ "夸" ],
    "e":    [ "葵" ],
    "i":    "chi"
},
"s": {
    "a":    [ "薩", "沙", "撒" ],
    "ai":   [ "賽" ],
    "e":    "sai",
    "i":    "shi",
    "o":    "su",
    "u":    [ "蘇" ]
},
"sh": {
    "a":    [ "夏", "薩" ],
    "en":   [ "生" ],
    "i":    [ "希", "西" ],
    "o":    [ "修", "休" ],
    "u":    "sho"
},
"t": {
    "a":    [ "它" ],
    "ai":   [ "太", "台" ],
    "e":    [ "天" ],
    "i":    [ "提", "緹" ],
    "o":    [ "透", "湯" ],
    "u":    [ "圖" ]
},
"th": "t",
"v": {
    "a":    [ "伐", "瓦", "沃" ],
    "e":    [ "薇" ],
    "i":    [ "溫", "威" ],
    "o":    "_u",
    "u":    "_u"
},
"w": "v",
"x": {
    "a":    "sha",
    "e":    [ "偕" ],
    "i":    [ "辛", "希", "西", "系", "細" ],
    "o":    "sho",
    "u":    "sho"
},
"y": {
    "a":    "_a",
    "e":    [ "耶" ],
    "i":    [ "因", "茵", "倚" ],
    "o":    [ "猶" ],
    "u":    "yo"
},
"z": "s"
};

var flat_dict = (function flatten(o) {
    var flat = {};
    for(var k in o) {
        var d = o[k];
        switch (typeof d) {
        case "string":
            d = o[d];
        case "object":
            if (k=="_") { k = ""; }
            for(var s in d) {
                flat[(k+s)] = d[s];
            }
            break;
        }
    }
    return flat;
})(dictionary);

var suffix = {
"-b":   [ "伯" ],
"-d":   [ "德" ],
"-f":   [ "夫" ],
"-k":   [ "克" ],
"-l":   [ "爾" ],
"-land":[ "蘭德" ],
"-le":  "-l",
"-les": [ "爾斯" ],
"-liam":[ "廉" ],
"-ll":  "-l",
"-m":   [ "姆" ],
"-nn":  [ "尼" ],
"-ny":  "-nn",
"-p":   [ "浦" ],
"-r":   "-l",
"-s":   [ "史", "斯" ],
"-son": [ "森" ],
"-t":   [ "特" ],
"-tt":  "-t",
"-th":  [ "斯" ],
"-ver": [ "弗" ],
"-z":   "-th",
"-zz":  "-th"
};

var suffix_rgxp = Object.keys(suffix).map(function(f) {
    return new RegExp("(.*)("+f.substring(1)+")$");
});
const vowel_rgxp = new RegExp("^(.*)([aeiou])(.*)","ig");

function tr(en) {
    en = en.toLowerCase();
    var pre = en, suf = "";
    suffix_rgxp.map(function(rgxp) {
        var r = rgxp.exec(en);
        if (r!=null) {
            if (r[2].length>suf) {
                suf = suffix["-"+r[2]];
                while (typeof suf == "string" && suf.charAt(0)=="-") {
                    suf = suffix[suf];
                }
                if (suf instanceof Array) {
                    suf = suf[0];
                }
                pre = r[1];
            }
        }
    });
    console.log(pre,suf);
    var cur = 0, zh = [], ens = [];
    while(cur<pre.length) {
        var c = pre.charAt(cur);
        if (c in dictionary) { cur++; }
        else { c = "_"; }

        var d = dictionary[c], len = 0;
        while (typeof d != "object") { d = dictionary[d]; }
        for(var v in d) {
            var con = pre.substring(cur,cur+v.length);
            if (v.length>len && con==v) {
                ens.push(c+con);
                zh.push(d[v][0]);
                len = v.length;
            }
        }
        if (len>0) { cur += len - 1; }
        cur++;
    }
    //console.log(ens,zh.join("")+suf);
    return zh.join("") + suf;
};

function en2zh(name_arr) {
    const vowel_rgxp = new RegExp("^(.*)([aeiou])(.*)","ig");
    return name_arr.map(function(seq) {
        seq = seq.toLowerCase();
        var pre = seq, suf = "", last_suf = "";
        suffix_rgxp.map(function(rgxp) {
            r = rgxp.exec(seq);
            if (r==null) { return; }
            if (r[2].length>last_suf.length) {
                last_suf = r[2];
                pre = r[1];
                suf = suffix["-"+r[2]];
                while (typeof suf == "string" && suf.charAt(0)=="-") {
                    suf = suffix[suf];
                }
                if (suf instanceof Array) { suf = _roll(suf); }
            }
        });
        var m = vowel_rgxp.exec(pre);
        if (m==null) {
            console.log(pre,suf);
            return suf;
        }
        var c = m[1], v = m[2], more = m[3];
        if (c=="") { c = "_"; }
        var cv = [c,v].join("");
        if (more.length>0) {
            if ((cv+more) in flat_dict) {
                var w = flat_dict[(cv+more)];
                while (typeof w == "string") { w = flat_dict[w]; }
                pre = _roll(w);
            } else if (cv in flat_dict) {
                var w = flat_dict[cv];
                while (typeof w == "string") { w = flat_dict[w]; }
                pre = _roll(w);
                pre += more;
            } else {
                console.log(pre,m);
                pre = "";
            }
        } else if (cv in flat_dict) {
            var w = flat_dict[cv];
            while (typeof w == "string") { w = flat_dict[w]; }
            pre = _roll(w);
        } else {
            console.log(pre,m);
            pre = "";
        }
        return pre + suf;
    });
};

/*------------------------------------------------------------*\
 * Random Name Generator
 - Fake English Name
\*------------------------------------------------------------*/
const en_vowels = "aaaeeeiiioo",
    en_prefix = "_bdfghklmnpstv",
    en_suffix = "________bdlmnrst";
const en_modifiers = {
    "_0": [""],
    "_2": [""],
    "o1": ["o","o","u"],
    "f0": ["f","ph"],
    "g0": ["g","g","g","g","j","j","y"],
    "h0": ["h","h","h","th","sh","ch"],
    "h2": ["h","h","h","th","sh"],
    "k1": ["k","k","c"],
    "s0": ["s","s","s","s","c","x","z","st","sh"],
    "s2": ["s","s","s","s","x","z","z","ss","sh"],
    "t2": ["t","t","t","t","tt","th"]
};
function en_modify(c,i) {
    var k = [c,i].join("");
    if (k in en_modifiers) { return _roll(en_modifiers[k]); }
    return c;
};

function en_generate() {
    var vowel = _rollf(en_vowels),
        pref = _rollf(en_prefix),
        suf1 = _rollf(en_suffix.replace(/_/g,"")),
        suff = _rollf(en_suffix);
    var count = parseInt(_roll("111222233334")),
        sections = [],
        vowelused = {"a":0,"e":0,"i":0,"o":0,"u":0};
    for(var i=0;i<count;i++) {
        var v = vowel(true);
        while (vowelused[v]>=3) { v = vowel(true); }
        vowelused[v]++;
        var f = pref(), s = (count==1) ? suf1() : suff();
        sections.push([f,v,s].map(en_modify).join(""));
    }
    return sections;
};

function capitalize(name) {
    return name.charAt(0).toUpperCase()
        + name.substring(1).toLowerCase();
};

/*------------------------------------------------------------*\
 * Random Name Generator
\*------------------------------------------------------------*/
window.kjName = {

"generator": function(lang,trans = false) {
    var ret = null;
    switch(lang.toLowerCase()) {
    case "en":
    default:
        ret = trans ?
            function() {
                var n = en_generate();
                console.log(n);
                return en2zh(n).join("");
            } :
            function() {
                var n = en_generate();
                return capitalize(n.join(""));
            };
        break;
    }
    return ret;
},

"generate": function(lang,trans = false) {
    if (lang==null) { lang = "en"; }
    var name = "";
    switch(lang.toLowerCase()) {
    case "en":
    default:
        name = en_generate();
        if (trans) { name = en2zh(name).join(""); }
        else { name = capitalize(name.join("")); }
        break;
    }
    return name;
}

};

})();