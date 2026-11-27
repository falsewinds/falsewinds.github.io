export const TEAM_MAX = 4;
export const HEADER = 16;
export const POINT_STATS = 8;
export const UNIT_WORDS = 26;
export const GRID_LAYERS = 5; // old melee/range, reserved melee/range, team claim
export const CELL_UNIT_LIMIT = 2;
export const POINT_WORDS = 16;
export const PROJECTILE_WORDS = 16;
export const DEATH_WORDS = 6;
export const PROJECTILES_PER_UNIT = 8;
export const DT = 1 / 30;
export const INF = 0x3fffffff;
export const PITCH = Math.PI / 3;
export const PAD_X = 1.7, PAD_Z = 3.2;
export const TEAM_COLORS = ['#b5baae','#6bb6e8','#ed8274','#b6a0ef','#e3c16b'];
export const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const pstat=(i,k)=>HEADER+i*POINT_STATS+k;
export const isMobile=()=>matchMedia('(pointer:coarse)').matches || innerWidth<=800;
export function assert(ok,msg){if(!ok)throw Error(msg);}
// Perspective camera: 45 degree vertical FOV, capped at 70 degrees horizontally.
// Keep all ground rays below the horizon even on wide/tall screens.
export function lensFor(aspect){
    const tanY=Math.min(Math.tan(Math.PI/8),Math.tan(35*Math.PI/180)/aspect);
    return {tanX:tanY*aspect,tanY};
}
export function perspectiveAt(aspect,distance){
    const {tanX,tanY}=lensFor(aspect),s=Math.sin(PITCH),c=Math.cos(PITCH);
    const groundMin=-distance*tanY/(s-c*tanY),groundMax=distance*tanY/(s+c*tanY);
    const groundHalfW=tanX*(distance-groundMin*c);
    const width=2*groundHalfW+2*PAD_X+2*Math.SQRT2;
    const height=groundMax-groundMin+2*PAD_Z+2*Math.SQRT2;
    return {distance,tanX,tanY,halfW:distance*tanX,halfH:distance*tanY,
        groundMin,groundMax,groundHalfW,groundH:distance*tanY/s,
        bound:CELL_UNIT_LIMIT*Math.ceil(width*height)};
}
export function viewFor(aspect,limit){
    let lo=0,hi=200;
    for(let i=0;i<50;i++){
        const d=(lo+hi)/2;
        if(perspectiveAt(aspect,d).bound<=limit)lo=d;else hi=d;
    }
    return perspectiveAt(aspect,lo*.999999);
}
// Old v9 far view defines the scale at the point of focus. Move the new
// perspective camera to twice the equivalent distance, not twice its FOV.
export function farViewFor(aspect){
    let lo=0,hi=100;
    for(let i=0;i<50;i++){
        const w=(lo+hi)/2,h=w/aspect/Math.sin(PITCH);
        const bound=CELL_UNIT_LIMIT*Math.ceil((w+2*PAD_X+2*Math.SQRT2)*(h+2*PAD_Z+2*Math.SQRT2));
        if(bound<=2000)lo=w;else hi=w;
    }
    return perspectiveAt(aspect,lo*.999999/aspect/lensFor(aspect).tanY);
}
export function validateScenario(s){
    assert(s&&s.battlefield&&s.spawnPoints&&s.factions&&s.unitTypes&&s.objectives,'戰局 JSON 缺少必要欄位');
    const scan=s.combat?.targetSearchInterval??.2;
    assert(Number.isFinite(scan)&&scan>=DT&&scan<=1,'目標搜尋間隔須介於 1/30 秒至 1 秒');
    const {width:w,height:h}=s.battlefield;
    assert(Number.isInteger(w)&&Number.isInteger(h)&&w>=20&&h>=20&&w*h<=65536,'戰場尺寸不合法');
    assert(s.factions.length>=2&&s.factions.length<=TEAM_MAX,'陣營須為 2–4 個');
    assert(s.factions.every((f,i)=>f.id===i+1),'陣營 ID 必須從 1 連續編號');
    assert(s.factions.some(f=>f.id===1&&f.control==='player'),'陣營 1 必須由玩家控制');
    for(const f of s.factions)if(f.control!=='player'){
        for(const [key,fallback] of [['aiStartDelay',5],['aiActionInterval',1.5],['aiInterval',2.1],['aiReactionDelay',.75]]){
            const value=f[key]??fallback;
            assert(Number.isFinite(value)&&value>=DT,`NPC ${key} 必須為正數秒數`);
        }
    }
    assert(s.spawnPoints.length>1&&s.spawnPoints.length<=64,'據點數量不合法');
    const ids=new Set();let sum=0;
    for(const p of s.spawnPoints){
        assert(!ids.has(p.id),'據點 ID 重複');ids.add(p.id);
        assert(p.x>=0&&p.z>=0&&p.x<w&&p.z<h,'據點超出戰場');
        assert(['melee','range'].includes(p.kind),'據點兵種錯誤');
        assert(Number.isInteger(p.capacity)&&p.capacity>0,'據點容量錯誤');sum+=p.capacity;
        assert(Number.isFinite(p.radius)&&p.radius>=2,'據點半徑錯誤');
        assert(Number.isInteger(p.owner)&&p.owner>=0&&p.owner<=s.factions.length,'據點陣營錯誤');assert(Number.isInteger(p.initialUnits??0)&&(p.initialUnits??0)>=0,'初始駐軍數量不合法');
        const path=s.upgradePaths[p.upgradePath];assert(Array.isArray(path)&&path.length,'缺少升級路線');
        assert(p.level>=1&&p.level<=path.length,'據點初始等級錯誤');
        for(const l of path)assert(l.productionInterval>=DT&&Number.isInteger(l.productionCount)&&l.productionCount>0&&Number.isInteger(l.attack)&&l.attack>0&&Number.isInteger(l.maxHP)&&l.maxHP>0&&l.cost>=0,'升級參數錯誤');
    }
    assert(s.economy&&['kill','loss','time','control'].every(k=>Number.isFinite(s.economy[k])&&s.economy[k]>=0),'資源設定錯誤');assert(s.capture&&s.capture.rate>0&&s.capture.scale>0,'佔領速度不合法');
    assert(sum<=2000&&Number.isInteger(s.buffer)&&s.buffer>=0&&s.buffer<=500,'容量須符合 2000 + 500 規格');
    for(const k of ['melee','range']){const u=s.unitTypes[k];assert(u&&u.speed>0&&u.speed*DT<0.24&&u.attackRange>0&&u.attackInterval>=DT,'兵種參數不合法');}
    const r=s.unitTypes.range;assert(r.projectileSpeed>0&&Math.ceil(r.attackRange/r.projectileSpeed/r.attackInterval)+2<=PROJECTILES_PER_UNIT,'投射物容量不足');
    for(const p of s.spawnPoints)assert(p.target==null||ids.has(p.target),'派遣目標不存在');
    assert(s.objectives.win&&s.objectives.lose,'戰局須有勝負條件');
    const validObjectives=new Set(['all','any','conquest','annihilation','capture','hold','survive','kills','army','production','arrivals','points','deadline','lostAll','never']);
    function objective(o){assert(validObjectives.has(o.type),'未知目標：'+o.type);if(o.conditions)o.conditions.forEach(objective);if(o.point)assert(ids.has(o.point),'目標據點不存在');}
    objective(s.objectives.win);objective(s.objectives.lose);
    return sum+s.buffer;
}
function insideShape(x,z,r){return r.shape==='circle'?Math.hypot(x+.5-r.x,z+.5-r.z)<=r.radius:x+.5>=r.x&&x+.5<r.x+r.width&&z+.5>=r.z&&z+.5<r.z+r.height;}
export function buildMap(s){
    const {width:w,height:h,terrain=[]}=s.battlefield,N=w*h;
    const cells=new Uint32Array(N);
    for(const r of terrain){const type={water:1,rock:2,bridge:3,forest:4,grass:0}[r.type];assert(type!==undefined,'未知地形');for(let z=0;z<h;z++)for(let x=0;x<w;x++)if(insideShape(x,z,r))cells[z*w+x]=type;}
    const pass=i=>i>=0&&i<N&&(cells[i]===0||cells[i]===3);
    // Buildings are physical obstacles; their surrounding rings remain traversable.
    for(const p of s.spawnPoints){for(let z=Math.max(0,Math.floor(p.z-1));z<Math.min(h,Math.ceil(p.z+1));z++)for(let x=Math.max(0,Math.floor(p.x-1));x<Math.min(w,Math.ceil(p.x+1));x++)if(pass(z*w+x))cells[z*w+x]=5;}
    const flow=[], candidates=[];
    for(const p of s.spawnPoints){
        const c=[];
        for(let i=0;i<N;i++)if(pass(i)){const x=i%w+.5,z=Math.floor(i/w)+.5,d=Math.hypot(x-p.x,z-p.z);if(d<=p.radius-.08)c.push([i,d]);}
        c.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
        assert(c.length>=p.capacity,`據點 ${p.id} 可用格 ${c.length} 少於容量 ${p.capacity}`);
        const gate=c.filter(v=>v[1]<=Math.min(3.2,p.radius)).length;assert(gate>0,'據點沒有生產出口');
        candidates.push({cells:c.map(v=>v[0]),gate});
        const d=new Uint32Array(N).fill(INF),q=new Uint32Array(N);let head=0,tail=0;
        for(const [i,dist] of c)if(dist<=2.6){d[i]=0;q[tail++]=i;}
        if(!tail){d[c[0][0]]=0;q[tail++]=c[0][0];}
        while(head<tail){const i=q[head++],x=i%w,z=Math.floor(i/w);for(const [dx,dz] of DIRS){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=w||nz>=h)continue;const ni=nz*w+nx;if(!pass(ni)||d[ni]!==INF)continue;if(dx&&dz&&(!pass(z*w+nx)||!pass(nz*w+x)))continue;d[ni]=d[i]+1;q[tail++]=ni;}}
        flow.push(d);
    }
    let total=N*(1+flow.length);for(const c of candidates)total+=c.cells.length;
    const packed=new Uint32Array(total);packed.set(cells);flow.forEach((d,i)=>packed.set(d,N*(i+1)));let off=N*(1+flow.length);for(const c of candidates){c.offset=off;packed.set(c.cells,off);off+=c.cells.length;}
    for(let i=0;i<flow.length;i++)for(let j=0;j<flow.length;j++)assert(flow[i][candidates[j].cells[0]]!==INF,`據點 ${s.spawnPoints[i].id} 無法抵達 ${s.spawnPoints[j].id}`);
    return {w,h,N,cells,flow,candidates,packed,pass};
}
export class BattleModel{
    constructor(s,map){this.s=s;this.map=map;this.capacity=validateScenario(s);this.points=s.spawnPoints.map((p,i)=>({...p,i,target:-1,timer:0,progress:0,claimer:0,captureMisses:0,garrison:0,incoming:0,count:[0,0,0,0],normal:0,hold:{}}));this.byId=new Map(this.points.map(p=>[p.id,p.i]));for(const p of this.points)p.target=s.spawnPoints[p.i].target==null?-1:this.byId.get(s.spawnPoints[p.i].target);this.factions=[null,...s.factions.map(f=>({...f,money:f.resource??0,alive:0,kills:0,losses:0,arrivals:0,nextThink:f.aiStartDelay??5,nextCommand:f.aiStartDelay??5,pendingOrder:null}))];this.time=0;this.tick=0;this.alive=0;this.events=[];this.result=null;this.scriptDone=new Set();this.scriptAssignments=new Set();this.scriptUpgrades=new Set();this.hold=new Map();this.stats=new Uint32Array(HEADER+this.points.length*POINT_STATS);this.aiEnabled=true;this.lastSpawn=0;}
    level(p){return this.s.upgradePaths[p.upgradePath][p.level-1];}
    next(p){return this.s.upgradePaths[p.upgradePath][p.level];}
    emit(msg){this.events.push({time:this.time,msg});if(this.events.length>80)this.events.shift();}
    assign(i,j,team=1){const p=this.points[i],d=this.points[j];if(!p||p.owner!==team||i===j||j< -1||j>=this.points.length)return false;if(j>=0&&d.owner===team){let n=j;const seen=new Set([i]);while(n>=0&&this.points[n].owner===team){if(seen.has(n))return false;seen.add(n);n=this.points[n].target;}}p.target=j;return true;}
    upgrade(i,team=1){const p=this.points[i];if(!p||p.owner!==team)return false;const l=this.next(p),f=this.factions[team];if(!l||f.money<l.cost)return false;f.money-=l.cost;p.level++;p.timer=Math.min(p.timer,this.level(p).productionInterval);this.emit(`${p.name} 升級至 Lv.${p.level}`);return true;}
    commandReady(f){return f.control==='player'||this.time+1e-9>=f.nextCommand;}
    commandUsed(f){
        if(f.control==='player')return;
        f.nextCommand=this.time+(f.aiActionInterval??1.5);
        // A scripted action invalidates a plan based on the previous command state.
        f.pendingOrder=null;
    }
    executeAIOrder(f,order){
        const p=this.points[order.point];
        if(!p||p.owner!==f.id)return false;
        switch(order.action){
            case 'assign':
                if(p.target===order.target||p.target!==order.previous)return false;
                return this.assign(p.i,order.target,f.id);
            case 'upgrade':return p.level===order.level&&this.upgrade(p.i,f.id);
        }
        return false;
    }
    runScripts(){
        for(const [i,e] of (this.s.scripts??[]).entries()){
            if(this.scriptDone.has(i))continue;
            const t=e.team??2,f=this.factions[t];
            const ready=this.time+1e-9>=(e.time??0)&&(!e.when||this.evalObjective(e.when,t));
            if(!ready)continue;
            const isOrder=['assign','upgrade'].includes(e.action);
            if(isOrder&&!this.commandReady(f))continue;
            let ok=true;const p=this.byId.get(e.point);
            switch(e.action){
                case 'assign':ok=this.assign(p,e.target==null?-1:this.byId.get(e.target),t);break;
                case 'upgrade':ok=this.upgrade(p,t);break;
                case 'resource':f.money+=e.amount;break;
                case 'message':this.emit(e.message);break;
                default:throw Error('未知腳本動作 '+e.action);
            }
            if(ok&&isOrder)this.commandUsed(f);
            if(ok&&e.action==='assign')this.scriptAssignments.add(p);
            if(ok&&e.action==='upgrade')this.scriptUpgrades.add(t);
            if(ok||e.retry===false){this.scriptDone.add(i);if(ok&&e.message&&e.action!=='message')this.emit(e.message);}
        }
    }
    ai(){
        if(!this.aiEnabled)return;
        for(const f of this.factions.slice(1)){
            if(!['ai','hybrid'].includes(f.control))continue;
            if(f.pendingOrder){
                if(this.time+1e-9>=f.pendingOrder.executeAt&&this.commandReady(f)){
                    const order=f.pendingOrder;f.pendingOrder=null;
                    if(this.executeAIOrder(f,order))this.commandUsed(f);
                }
                continue;
            }
            if(!this.commandReady(f)||this.time+1e-9<f.nextThink)continue;
            f.nextThink=this.time+(f.aiInterval??2.1);
            const own=this.points.filter(p=>p.owner===f.id),hostile=this.points.filter(p=>p.owner!==f.id);
            if(!own.length)continue;
            // Do not spend the action budget on a point with an imminent scripted order.
            const eligible=own.filter(p=>!this.scriptAssignments.has(p.i)&&!this.s.scripts?.some((e,i)=>!this.scriptDone.has(i)&&e.action==='assign'&&e.point===p.id&&(e.time??0)<=this.time+3));
            const threatened=p=>p.count.reduce((sum,n,k)=>sum+(k+1===f.id?0:n),0)>p.count[f.id-1]+8&&p.garrison<30;
            const score=(p,q)=>this.map.flow[q.i][this.map.candidates[p.i].cells[0]]+q.garrison*.13+(q.owner===0?-12:0)-q.level*1.8;
            const bestTarget=p=>hostile.reduce((best,q)=>!best||score(p,q)<score(p,best)?q:best,null);
            const assignOrder=(p,target)=>({action:'assign',point:p.i,target,previous:p.target});
            let order=null;
            // One decision per faction, not one per owned point.
            const defense=eligible.find(p=>p.target>=0&&threatened(p));
            if(defense)order=assignOrder(defense,-1);
            if(!order){
                const idle=eligible.filter(p=>p.target<0&&!threatened(p)).map(p=>({p,q:bestTarget(p)})).filter(v=>v.q).sort((a,b)=>score(a.p,a.q)-score(b.p,b.q)||a.p.i-b.p.i);
                if(idle.length)order=assignOrder(idle[0].p,idle[0].q.i);
            }
            if(!order){
                const upgrades=own.filter(p=>this.next(p)&&f.money>=this.next(p).cost).sort((a,b)=>this.next(a).cost-this.next(b).cost||b.garrison-a.garrison);
                if(upgrades.length)order={action:'upgrade',point:upgrades[0].i,level:upgrades[0].level};
            }
            if(!order){
                // Change an active route only if the new target is substantially better.
                const alternatives=eligible.filter(p=>p.target>=0&&!threatened(p)).map(p=>({p,q:bestTarget(p)})).filter(({p,q})=>q&&q.i!==p.target&&score(p,q)+8<score(p,this.points[p.target]));
                if(alternatives.length)order=assignOrder(alternatives[0].p,alternatives[0].q.i);
            }
            // A decision is made from the current snapshot, not applied instantaneously.
            if(order)f.pendingOrder={...order,executeAt:this.time+(f.aiReactionDelay??.75)};
        }
    }
    prepare(){this.scriptAssignments.clear();this.scriptUpgrades.clear();this.runScripts();this.ai();for(const p of this.points){p.normal=0;if(!p.owner)continue;const l=this.level(p);p.timer=Math.min(l.productionInterval,p.timer+DT);const room=p.target>=0?this.capacity:Math.max(0,p.capacity-p.garrison);if(room&&p.timer+1e-6>=l.productionInterval&&this.alive<this.capacity){p.normal=Math.min(l.productionCount,room);p.timer=0;}}}
    pointData(){const ab=new ArrayBuffer(this.points.length*POINT_WORDS*4),f=new Float32Array(ab),u=new Uint32Array(ab),i32=new Int32Array(ab);for(const p of this.points){const i=p.i*POINT_WORDS,l=this.level(p),c=this.map.candidates[p.i];f[i]=p.x;f[i+1]=p.z;f[i+2]=p.radius;u[i+4]=p.owner;u[i+5]=p.kind==='range'?1:0;i32[i+6]=p.target;u[i+7]=p.capacity;f[i+8]=l.attack;f[i+9]=l.maxHP;u[i+10]=p.normal;u[i+12]=c.offset;u[i+13]=c.cells.length;u[i+14]=c.gate;}return ab;}
    configData(){const ab=new ArrayBuffer(64),u=new Uint32Array(ab),f=new Float32Array(ab),m=this.s.unitTypes.melee,r=this.s.unitTypes.range;u.set([this.map.w,this.map.h,this.capacity,this.points.length,this.factions.length-1,this.capacity*PROJECTILES_PER_UNIT,this.tick,Math.max(1,Math.round((this.s.combat?.targetSearchInterval??.2)/DT))]);f.set([DT,m.attackRange,r.attackRange,m.speed,r.speed,m.attackInterval,r.attackInterval,r.projectileSpeed],8);return ab;}
    capture(p) {
        // Ownership and garrison membership are not presence: only living units
        // physically inside the guard radius contribute to p.count.
        let soleTeam = 0;
        let soldiers = 0;
        for (let team = 1; team < this.factions.length; team++) {
            const count = p.count[team - 1];
            if (!count) continue;
            if (soleTeam !== 0) {
                soleTeam = 0;
                break;
            }
            soleTeam = team;
            soldiers = count;
        }
        const step = DT * this.s.capture.rate;
        const advancing = soleTeam !== 0 && soleTeam !== p.owner &&
            (p.claimer === 0 || p.claimer === soleTeam);
        if (!advancing) {
            if (p.progress <= 0) {
                p.progress = 0;
                p.claimer = 0;
                p.captureMisses = 0;
                return;
            }
            // First consecutive missed calculation: hold. From the second
            // onwards, decay on every missed calculation, even if nobody remains.
            p.captureMisses = Math.min(2, p.captureMisses + 1);
            if (p.captureMisses === 2) {
                p.progress = p.progress <= step + 1e-12 ? 0 : p.progress - step;
                if (p.progress === 0) {
                    p.claimer = 0;
                    p.captureMisses = 0;
                }
            }
            return;
        }
        p.captureMisses = 0;
        p.claimer = soleTeam;
        p.progress = Math.min(1, p.progress + step * Math.min(1, soldiers / this.s.capture.scale));
        if (p.progress < 1) return;
        p.owner = soleTeam;
        p.progress = 0;
        p.claimer = 0;
        p.target = -1;
        p.timer = this.level(p).productionInterval;
        p.garrison = 0;
        this.emit(`${p.name} 被 ${this.factions[p.owner].name} 佔領（Lv.${p.level}）`);
    }
    consume(data){this.stats=data;this.time+=DT;this.tick++;this.alive=0;this.lastSpawn=0;const ec=this.s.economy;for(const f of this.factions.slice(1)){const k=data[4+f.id-1],l=data[8+f.id-1];f.alive=data[f.id-1];f.kills+=k;f.losses+=l;f.money+=k*ec.kill+l*ec.loss+DT*(ec.time+ec.control*this.points.filter(p=>p.owner===f.id).length);this.alive+=f.alive;}
        for(const p of this.points){p.count=Array.from(data.slice(pstat(p.i,0),pstat(p.i,0)+TEAM_MAX));p.garrison=data[pstat(p.i,4)];p.incoming=data[pstat(p.i,7)];const normal=data[pstat(p.i,5)];this.lastSpawn+=normal;if(p.normal>0&&!normal)p.timer=this.level(p).productionInterval;this.capture(p);for(let t=1;t<this.factions.length;t++){const key=`${p.i}:${t}`;this.hold.set(key,p.owner===t?(this.hold.get(key)??0)+DT:0);}}
        if(!this.s.stress&&!this.result){const won=this.evalObjective(this.s.objectives.win,1),lost=this.evalObjective(this.s.objectives.lose,1);if(won||lost){this.result=won&&!lost?'win':lost&&!won?'lose':'draw';this.emit(this.result==='win'?'戰局勝利':this.result==='lose'?'戰局失敗':'戰局平手');}}
    }
    evalObjective(o,team=1){const f=this.factions[team],own=this.points.filter(p=>p.owner===team),p=this.points[this.byId.get(o.point)];switch(o.type){case 'all':return o.conditions.every(c=>this.evalObjective(c,team));case 'any':return o.conditions.some(c=>this.evalObjective(c,team));case 'conquest':return !this.points.some(p=>p.owner!==0&&p.owner!==team);case 'annihilation':return !this.points.some(p=>p.owner!==0&&p.owner!==team)&&this.factions.slice(1).every(q=>q.id===team||q.alive===0);case 'capture':return p?.owner===team;case 'hold':return (this.hold.get(`${p?.i}:${team}`)??0)>=o.seconds;case 'survive':return this.time>=o.seconds&&own.length>0;case 'kills':return f.kills>=o.count;case 'army':return f.alive>=o.count;case 'production':return own.reduce((n,p)=>n+this.level(p).productionCount/this.level(p).productionInterval,0)>=o.rate;case 'arrivals':return p&&p.owner===team&&p.garrison>=o.count;case 'points':return own.length>=o.count;case 'deadline':return this.time>=o.seconds;case 'lostAll':return !own.length;case 'never':return false;default:return false;}}
    initialUnits(){for(const f of this.factions.slice(1))f.alive=0;for(const p of this.points)p.garrison=0;const ab=new ArrayBuffer(this.capacity*UNIT_WORDS*4),f=new Float32Array(ab),u=new Uint32Array(ab),i32=new Int32Array(ab);for(let n=0;n<this.capacity;n++){const i=n*UNIT_WORDS;i32[i+10]=i32[i+11]=i32[i+12]=i32[i+18]=i32[i+22]=i32[i+24]=-1;}
        const occupied=new Set();let n=0;const spawn=(cell,team,kind,p,level,dest,garrison)=>{if(n>=this.capacity||occupied.has(cell)||!this.map.pass(cell))return false;occupied.add(cell);const i=n++*UNIT_WORDS,x=cell%this.map.w+.5,z=Math.floor(cell/this.map.w)+.5;f[i]=f[i+2]=x;f[i+1]=f[i+3]=z;f[i+4]=f[i+16]=level.maxHP;f[i+5]=level.attack;f[i+6]=(n%13)*.012;f[i+7]=f[i+19]=team===1?0:Math.PI;u[i+8]=team;u[i+9]=kind==='range'?1:0;i32[i+10]=dest;i32[i+11]=garrison;i32[i+12]=-1;u[i+13]=1;return true;};
        // Initial stationed troops are not constrained by the production quota.
        // Seed each inner ring first, then place overflow on reachable free terrain.
        const overflow=[];
        for(const p of this.points){
            if(!p.owner)continue;
            let left=p.initialUnits??0;
            for(const c of this.map.candidates[p.i].cells){
                if(!left)break;
                if(spawn(c,p.owner,p.kind,p,this.level(p),p.target>=0?p.target:p.i,p.target>=0?-1:p.i))left--;
            }
            if(left)overflow.push({p,left});
        }
        for(const group of this.s.initialGroups??[]){const p=this.points[this.byId.get(group.target)],ref=this.points[this.byId.get(group.source)]??p;const l=this.s.upgradePaths[ref.upgradePath][(group.level??ref.level)-1];let left=group.count;const possible=[];for(let z=group.z;z<group.z+group.height;z++)for(let x=group.x;x<group.x+group.width;x++){if(x<0||z<0||x>=this.map.w||z>=this.map.h)continue;possible.push(z*this.map.w+x);}for(const c of possible){if(!left)break;if(spawn(c,group.team,group.kind??ref.kind,ref,l,p.i,-1))left--;}assert(!left,`初始軍團 ${group.source} 空間不足 ${left}`);}
        for(const item of overflow){
            const {p}=item;let left=item.left;
            const flow=this.map.flow[p.i],candidates=[];
            for(let c=0;c<this.map.N;c++)if(this.map.pass(c)&&flow[c]!==INF&&!occupied.has(c))candidates.push(c);
            const distance=c=>Math.hypot(c%this.map.w+.5-p.x,Math.floor(c/this.map.w)+.5-p.z);
            candidates.sort((a,b)=>flow[a]-flow[b]||distance(a)-distance(b)||a-b);
            for(const c of candidates){
                if(!left)break;
                if(spawn(c,p.owner,p.kind,p,this.level(p),p.target>=0?p.target:p.i,p.target>=0?-1:p.i))left--;
            }
            assert(!left,`據點 ${p.id} 初始士兵空間不足 ${left}`);
        }
        this.alive=n;for(let j=0;j<n;j++){const i=j*UNIT_WORDS,t=u[i+8];this.factions[t].alive++;const g=i32[i+11];if(g>=0)this.points[g].garrison++;}return ab;}
}
