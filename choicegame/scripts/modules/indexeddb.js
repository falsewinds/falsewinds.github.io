let iDB = self.indexedDB
    || self.mozIndexedDB
    || self.webkitIndexedDB
    || self.msIndexedDB;
/*self.IDBTransaction = self.IDBTransaction
    || self.webkitIDBTransaction
    || self.msIDBTransaction;
self.IDBKeyRange = self.IDBKeyRange
    || self.webkitIDBKeyRange
    || self.msIDBKeyRange;*/

class Database {
    constructor() {
        this.db = null;
        this.tables = [];
    };

    select(table,query) {
        return new Promise((res,rej)=>{
            let t = this.db.transaction(table,"readonly"),
                store = t.objectStore(table);
            let req = (query==null) ? store.getAll() : store.get(query);
            req.onerror = rej;
            req.onsuccess = (e)=>{ res(req.result); };
        });
    };
    upsert(table,data) {
        if (!(data instanceof Array)) { data =[data]; }
        return new Promise((res,rej)=>{
            let t = this.db.transaction(table,"readwrite"),
                store = t.objectStore(table);
            t.oncomplete = res;
            t.onerror = rej;
            data.map((d)=>{ store.put(d); });
        });
    };
    delete(table,key) {
        if (key==null) { return new Promise((res)=>{ res(); }); }
        return new Promise((res,rej)=>{
            let t = this.db.transaction(table,"readwrite");
            t.oncomplete = res;
            t.onerror = rej;
            t.objectStore(table).delete(key);
        });
    };
}

async function CreateDatabase(dbname,version,tables) {
    let newdb = new Database();
    if (typeof tables != "object") { tables = {}; }
    newdb.tables = Object.keys(tables);
    return new Promise((res,rej)=>{
        let req = iDB.open(dbname,version);
        req.onupgradeneeded = (e)=>{
            let db = e.target.result;
            for(let tn in tables) {
                let def = {}, t = tables[tn];
                if ("key" in t) { def["keyPath"] = t["key"]; }
                else { def["autoIncrement"] = true; }
                let store = db.createObjectStore(tn,def);
                store.onerror = (se)=>{
                    console.log(error);
                };
            }
        };
        req.onsuccess = (e)=>{
            newdb.db = req.result;
            res(newdb);
            /*for(let tn in tables) {
                this.tables = new Table(tn,);
            }*/
        };
        req.onerror = rej
    }).then((db)=>{ return db; }).catch((e)=>{
        throw {
            "type": "error",
            "message": "IndexedDB open fail.",
            "data": e
        };
    });
};



export { CreateDatabase };