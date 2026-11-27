// All mutable unit state is GPU resident. Separate dispatches establish ordering.
struct Config {
    width:u32, height:u32, capacity:u32, pointCount:u32,
    teamCount:u32, projectileCapacity:u32, tick:u32, targetScanTicks:u32,
    dt:f32, meleeRange:f32, rangeRange:f32, meleeSpeed:f32,
    rangeSpeed:f32, meleeInterval:f32, rangeInterval:f32, projectileSpeed:f32,
}
struct Unit {
    pos:vec2f, prev:vec2f, hp:f32, attack:f32, cooldown:f32, dir:f32,
    team:u32, kind:u32, dest:i32, garrison:i32, targetId:i32, gen:u32,
    targetGen:u32, anim:f32, maxhp:f32, state:u32,
    waypoint:i32, prevDir:f32, moveBlend:f32, prevBlend:f32,
    detour:i32, blockedTicks:u32, ignoredTarget:i32, ignoreUntil:u32,
}
struct Point {
    pos:vec2f, radius:f32, padding0:f32, owner:u32, kind:u32, targetId:i32, cap:u32,
    attack:f32, hp:f32, normal:u32, reserved:u32, cellStart:u32, cellCount:u32, gateCount:u32, padding1:u32,
}
struct Projectile {
    origin:vec2f, pos:vec2f, prev:vec2f, end:vec2f, t:f32, oldT:f32, duration:f32,
    attack:u32, team:u32, targetId:u32, gen:u32, isActive:u32,
}
struct Death {pos:vec2f, time:f32, dir:f32, team:u32, kind:u32,}
@group(0) @binding(0) var<uniform> cfg:Config;
@group(0) @binding(1) var<storage,read_write> units:array<Unit>;
@group(0) @binding(2) var<storage,read_write> nextUnits:array<Unit>;
@group(0) @binding(3) var<storage,read_write> grid:array<atomic<u32>>;
@group(0) @binding(4) var<storage,read> points:array<Point>;
@group(0) @binding(5) var<storage,read> mapData:array<u32>;
// [capacity*4 damage by team][capacity pending damage]
@group(0) @binding(6) var<storage,read_write> scratch:array<atomic<u32>>;
@group(0) @binding(7) var<storage,read_write> projectiles:array<Projectile>;
@group(0) @binding(8) var<storage,read_write> stats:array<atomic<u32>>;
@group(0) @binding(9) var<storage,read_write> deaths:array<Death>;
const TEAM_MAX:u32=4u;
const HEADER:u32=16u;
const STRIDE:u32=8u;
const PER_UNIT:u32=8u;
const INF:u32=0x3fffffffu;
const PI:f32=3.14159265;
const offsets=array<vec2i,8>(vec2i(1,0),vec2i(-1,0),vec2i(0,1),vec2i(0,-1),vec2i(1,1),vec2i(-1,1),vec2i(1,-1),vec2i(-1,-1));
fn ps(p:u32,k:u32)->u32{return HEADER+p*STRIDE+k;}
fn inside(c:vec2i)->bool{return c.x>=0&&c.y>=0&&c.x<i32(cfg.width)&&c.y<i32(cfg.height);}
fn index(c:vec2i)->u32{return u32(c.y)*cfg.width+u32(c.x);}
fn cell(p:vec2f)->vec2i{return vec2i(floor(p));}
fn center(c:vec2i)->vec2f{return vec2f(c)+vec2f(.5);}
fn passable(c:vec2i)->bool{if(!inside(c)){return false;}let v=mapData[index(c)];return v==0u||v==3u;}
fn safeNorm(v:vec2f)->vec2f{let n=length(v);if(n<.0001){return vec2f(0.);}return v/n;}
fn pending(i:u32)->u32{return atomicLoad(&scratch[cfg.capacity*TEAM_MAX+i]);}
fn addPending(i:u32,d:u32){atomicAdd(&scratch[cfg.capacity*TEAM_MAX+i],d);}
fn addDamage(i:u32,team:u32,d:u32){if(team>0u&&team<=TEAM_MAX){atomicAdd(&scratch[i*TEAM_MAX+team-1u],d);}}
fn flowAt(p:u32,c:vec2i)->u32{if(!inside(c)){return INF;}return mapData[cfg.width*cfg.height*(p+1u)+index(c)];}
fn rotate(v:vec2f,a:f32)->vec2f{return vec2f(v.x*cos(a)-v.y*sin(a),v.x*sin(a)+v.y*cos(a));}
// Five planes: immutable melee/range occupancy for this tick, two movement
// reservations, and a team claim preventing cross-team entry into empty cells.
fn plane(c:vec2i,layer:u32)->u32{return layer*cfg.width*cfg.height+index(c);}
fn occupant(c:vec2i,kind:u32)->u32{return atomicLoad(&grid[plane(c,kind)]);}
fn claimed(c:vec2i,kind:u32)->u32{return atomicLoad(&grid[plane(c,kind+2u)]);}
fn openFor(u:Unit,c:vec2i,id:u32)->bool{
    if(!passable(c)){return false;}
    let ownSlot=occupant(c,u.kind);
    if(ownSlot!=0u&&ownSlot!=id+1u){return false;}
    let reservation=claimed(c,u.kind);
    if(reservation!=0u&&reservation!=id+1u){return false;}
    let other=occupant(c,1u-u.kind);
    if(other!=0u){
        let v=units[other-1u];
        if(v.team!=u.team){return false;}
        // A friendly ranged soldier never blocks a melee soldier's advance.
        // Range still avoids melee when entering a new occupied cell.
        if(u.kind==1u&&any(c!=cell(u.pos))){return false;}
    }
    let owner=atomicLoad(&grid[plane(c,4u)]);
    return owner==0u||owner==u.team;
}
fn reserve(c:vec2i,id:u32,team:u32,kind:u32)->bool{
    let claimIndex=plane(c,4u);
    var hasClaim=false;
    for(var n=0u;n<8u;n++){
        let r=atomicCompareExchangeWeak(&grid[claimIndex],0u,team);
        if(r.exchanged||r.old_value==team){hasClaim=true;break;}
        if(r.old_value!=0u){return false;}
    }
    if(!hasClaim){return false;}
    let j=plane(c,kind+2u);
    for(var n=0u;n<8u;n++){
        let r=atomicCompareExchangeWeak(&grid[j],0u,id+1u);
        if(r.exchanged||r.old_value==id+1u){return true;}
        if(r.old_value!=0u){return false;}
    }
    return false;
}
@compute @workgroup_size(64) fn bin(@builtin(global_invocation_id) g:vec3u){
    let i=g.x;if(i>=cfg.capacity){return;}let u=units[i];
    if(u.team!=0u){let c=cell(u.pos);if(inside(c)){
        atomicStore(&grid[plane(c,u.kind)],i+1u);
        atomicStore(&grid[plane(c,4u)],u.team);
    }}
}
// A single ordered allocator guarantees no slot or spawn-cell race. Starts at a rotating point.
@compute @workgroup_size(1) fn spawn(@builtin(global_invocation_id) g:vec3u){
    if(g.x!=0u){return;}
    var freeCursor=0u;
    for(var a=0u;a<cfg.pointCount;a++){
        let pIndex=(a+cfg.tick)%cfg.pointCount;let p=points[pIndex];if(p.owner==0u){continue;}
        let total=p.normal;if(total==0u){continue;}
        var made=0u;var cursor=0u;var limit=p.cellCount;if(p.targetId>=0){limit=p.gateCount;}
        for(var n=0u;n<total;n++){
            while(freeCursor<cfg.capacity&&units[freeCursor].team!=0u){freeCursor++;}
            if(freeCursor>=cfg.capacity){return;}
            var chosen=0u;var found=false;
            while(cursor<limit){let c=mapData[p.cellStart+cursor];cursor++;if(atomicLoad(&grid[c])==0u&&atomicLoad(&grid[cfg.width*cfg.height+c])==0u){chosen=c;found=true;break;}}
            if(!found){break;}
            let id=freeCursor;freeCursor++;
            let pos=vec2f(f32(chosen%cfg.width)+.5,f32(chosen/cfg.width)+.5);
            var dest=i32(pIndex);var garrison=i32(pIndex);if(p.targetId>=0){dest=p.targetId;garrison=-1;}
            let gen=units[id].gen+1u;
            units[id]=Unit(pos,pos,p.hp,p.attack,f32((id*17u+cfg.tick)%7u)*.012,0.,p.owner,p.kind,dest,garrison,-1,gen,0u,0.,p.hp,0u,-1,0.,0.,0.,-1,0u,-1,0u);
            let chosenCell=cell(pos);
            atomicStore(&grid[plane(chosenCell,p.kind)],id+1u);
            atomicStore(&grid[plane(chosenCell,4u)],p.owner);
            atomicAdd(&stats[ps(pIndex,5u)],1u);
            made++;
        }
    }
}
@compute @workgroup_size(64) fn fly(@builtin(global_invocation_id) g:vec3u){
    let i=g.x;if(i>=cfg.projectileCapacity){return;}var p=projectiles[i];if(p.isActive==0u){return;}
    if(p.targetId>=cfg.capacity){p.isActive=0u;projectiles[i]=p;return;}
    let u=units[p.targetId];if(u.team==0u||u.gen!=p.gen||u.team==p.team){p.isActive=0u;projectiles[i]=p;return;}
    p.prev=p.pos;p.oldT=p.t;p.t=min(1.,p.t+cfg.dt/p.duration);p.end=u.pos;p.pos=mix(p.origin,p.end,p.t);
    if(p.t>=1.){addDamage(p.targetId,p.team,p.attack);p.isActive=0u;}else{addPending(p.targetId,p.attack);atomicAdd(&stats[12],1u);}
    projectiles[i]=p;
}
// Ordinary acquisition stays local. At a hostile objective, all defenders
// inside its capture circle are eligible; a distant defender cannot deadlock
// capture just because it is outside the ordinary acquisition radius.
fn objectiveFor(u:Unit)->i32{
    if(u.garrison>=0||u.dest<0||u32(u.dest)>=cfg.pointCount){return -1;}
    let p=points[u32(u.dest)];
    if(p.owner==u.team||distance(u.pos,p.pos)>p.radius){return -1;}
    return u.dest;
}
fn eligibleEnemy(u:Unit,j:u32,search:f32,objective:i32)->bool{
    let v=units[j];if(v.team==0u||v.team==u.team){return false;}
    let d=distance(u.pos,v.pos);
    let attackRange=select(cfg.meleeRange,cfg.rangeRange,u.kind==1u);
    if(i32(j)==u.ignoredTarget&&cfg.tick<u.ignoreUntil&&d>attackRange){return false;}
    if(d<=search){return true;}
    if(objective>=0){let p=points[u32(objective)];return distance(v.pos,p.pos)<=p.radius;}
    return false;
}
// Retain a living valid target; new acquisition is staggered at 5 Hz.
fn targetFor(u:Unit,search:f32,id:u32,objective:i32)->i32{
    if(u.targetId>=0&&u32(u.targetId)<cfg.capacity){
        let j=u32(u.targetId);let v=units[j];
        if(v.gen==u.targetGen&&eligibleEnemy(u,j,search,objective)){return u.targetId;}
    }
    if(cfg.tick!=0u&&(cfg.tick+id)%max(1u,cfg.targetScanTicks)!=0u){return -1;}
    // Search local targets first. Only scan the whole objective if none is found.
    for(var phase=0u;phase<2u;phase++){
        var base=cell(u.pos);var r=i32(ceil(search));
        if(phase==1u){if(objective<0){break;}let p=points[u32(objective)];base=cell(p.pos);r=i32(ceil(p.radius))+1;}
        var nearest=-1;var nd=1e9;var alt=-1;var ad=1e9;
        let lo=max(vec2i(0),base-vec2i(r));
        let hi=min(vec2i(i32(cfg.width)-1,i32(cfg.height)-1),base+vec2i(r));
        for(var z=lo.y;z<=hi.y;z++){for(var x=lo.x;x<=hi.x;x++){
            let c=vec2i(x,z);
            for(var kind=0u;kind<2u;kind++){
                let slot=occupant(c,kind);if(slot==0u){continue;}
                let j=slot-1u;let v=units[j];
                if(!eligibleEnemy(u,j,search,select(objective,-1,phase==0u))){continue;}
                let d=distance(u.pos,v.pos);
                if(d<nd||(d==nd&&(nearest<0||j<u32(nearest)))){nd=d;nearest=i32(j);}
                var expected=pending(j);for(var k=0u;k<TEAM_MAX;k++){expected+=atomicLoad(&scratch[j*TEAM_MAX+k]);}
                if(f32(expected)<v.hp&&(d<ad||(d==ad&&(alt<0||j<u32(alt))))){ad=d;alt=i32(j);}
            }
        }}
        if(alt>=0&&ad<=nd+1.15){return alt;}
        if(nearest>=0){return nearest;}
    }
    return -1;
}
fn lineClear(a:vec2f,b:vec2f)->bool{
    let c=cell(a);let d=cell(b);if(!passable(d)){return false;}
    if(c.x!=d.x&&c.y!=d.y){if(!passable(vec2i(c.x,d.y))||!passable(vec2i(d.x,c.y))){return false;}}
    return true;
}
fn movementClear(u:Unit,pos:vec2f,id:u32)->bool{
    if(!lineClear(u.pos,pos)){return false;}
    let c=cell(pos);let here=cell(u.pos);
    if(!openFor(u,c,id)){return false;}
    for(var dz=-1;dz<=1;dz++){for(var dx=-1;dx<=1;dx++){
        let k=c+vec2i(dx,dz);if(!inside(k)){continue;}
        for(var kind=0u;kind<2u;kind++){
            let n=occupant(k,kind);if(n==0u||n==id+1u){continue;}let v=units[n-1u];
            if(v.team==0u||v.team==u.team){continue;}
            let old=distance(u.pos,v.pos);let now=distance(pos,v.pos);
            if(now<.84+max(cfg.meleeSpeed,cfg.rangeSpeed)*cfg.dt&&now<old-.0001){return false;}
        }
    }}
    return true;
}
fn legalMove(u:Unit,pos:vec2f,id:u32)->bool{
    if(!movementClear(u,pos,id)){return false;}
    let c=cell(pos);
    if(any(c!=cell(u.pos))){return reserve(c,id,u.team,u.kind);}return true;
}
fn separation(u:Unit,id:u32)->vec2f{
    var push=vec2f(0.);let c=cell(u.pos);
    for(var dz=-1;dz<=1;dz++){for(var dx=-1;dx<=1;dx++){
        let k=c+vec2i(dx,dz);if(!inside(k)){continue;}
        for(var kind=0u;kind<2u;kind++){
            // Cross-kind friendly range must not exert a backward avoidance force on melee.
            if(u.kind==0u&&kind==1u){continue;}
            let n=occupant(k,kind);if(n==0u||n==id+1u){continue;}let v=units[n-1u];
            if(v.team!=u.team){continue;}let d=u.pos-v.pos;let l=length(d);
            if(l>0.0001&&l<.86){push+=d/l*(.86-l)*.95;}
        }
    }}
    return push;
}
// Normal movement follows the precomputed terrain flow field.
fn nextWaypoint(u:Unit,dest:u32,id:u32)->i32{
    let c=cell(u.pos);let here=flowAt(dest,c);if(here==INF||here==0u){return -1;}
    var best=-1;var score=1e9;let p=points[dest];let direct=safeNorm(p.pos-u.pos);
    let oldDist=distance(center(c),p.pos);
    for(var k=0u;k<8u;k++){
        let n=c+offsets[(k+id%8u)%8u];if(!openFor(u,n,id)){continue;}
        if(n.x!=c.x&&n.y!=c.y&&(!passable(vec2i(c.x,n.y))||!passable(vec2i(n.x,c.y)))){continue;}
        let d=flowAt(dest,n);if(d==INF||d>here){continue;}
        if(d==here&&distance(center(n),p.pos)>=oldDist-.001){continue;}
        let delta=center(n)-u.pos;let step=select(cfg.meleeSpeed,cfg.rangeSpeed,u.kind==1u)*cfg.dt;
        if(!movementClear(u,u.pos+safeNorm(delta)*min(step,length(delta)),id)){continue;}
        let v=safeNorm(delta);let value=f32(d)*3.5+(1.-dot(v,direct))*.5;
        if(value<score){score=value;best=i32(index(n));}
    }
    return best;
}
struct LocalRoute {first:i32,goal:i32,}
fn cellOf(i:i32)->vec2i{return vec2i(i%i32(cfg.width),i/i32(cfg.width));}
fn waypointValid(u:Unit,id:u32)->bool{
    if(u.waypoint<0||u32(u.waypoint)>=cfg.width*cfg.height){return false;}
    let n=cellOf(u.waypoint);
    return openFor(u,n,id)&&distance(u.pos,center(n))>.18;
}
// Search an 11 x 11 neighborhood using live occupancy. A detour is accepted
// only if it reaches a strictly better flow cell or an enemy approach cell.
// Intermediate steps may increase the static flow distance.
fn localRoute(u:Unit,id:u32,dest:i32,enemy:i32,goal:i32)->LocalRoute{
    let base=cell(u.pos);
    var first:array<i32,121>;var queue:array<vec2i,121>;
    for(var i=0u;i<121u;i++){first[i]=-2;}
    first[60]=-1;queue[0]=base;var head=0u;var tail=1u;
    var best=LocalRoute(-1,-1);var bestMetric=1e9;
    if(enemy>=0){bestMetric=distance(u.pos,units[u32(enemy)].pos);}
    else if(dest>=0){bestMetric=f32(flowAt(u32(dest),base));}
    let attackRange=select(cfg.meleeRange,cfg.rangeRange,u.kind==1u);
    let step=select(cfg.meleeSpeed,cfg.rangeSpeed,u.kind==1u)*cfg.dt;
    while(head<tail){
        let c=queue[head];head++;
        let ci=u32((c.y-base.y+5)*11+c.x-base.x+5);
        for(var k=0u;k<8u;k++){
            let n=c+offsets[(k+id%8u)%8u];let d=n-base;
            if(abs(d.x)>5||abs(d.y)>5){continue;}
            let ni=u32((d.y+5)*11+d.x+5);
            if(first[ni]!=-2||!openFor(u,n,id)){continue;}
            if(n.x!=c.x&&n.y!=c.y&&(!passable(vec2i(c.x,n.y))||!passable(vec2i(n.x,c.y)))){continue;}
            let next=i32(index(n));
            if(all(c==base)){
                let delta=center(n)-u.pos;
                if(!movementClear(u,u.pos+safeNorm(delta)*min(step,length(delta)),id)){continue;}
                first[ni]=next;
            }else{first[ni]=first[ci];}
            queue[tail]=n;tail++;
            if(goal>=0){if(next==goal){return LocalRoute(first[ni],next);}continue;}
            if(enemy>=0){
                let metric=distance(center(n),units[u32(enemy)].pos);
                if(metric<=attackRange){return LocalRoute(first[ni],next);}
                if(metric<bestMetric-.001){bestMetric=metric;best=LocalRoute(first[ni],next);}
            }else if(dest>=0){
                let flow=flowAt(u32(dest),n);
                if(flow!=INF&&f32(flow)<bestMetric){bestMetric=f32(flow);best=LocalRoute(first[ni],next);}
                if(flow==0u){return best;}
            }
        }
    }
    return best;
}
fn turnTowards(current:f32,wanted:f32)->f32{
    let delta=atan2(sin(wanted-current),cos(wanted-current));
    let a=current+clamp(delta,-12.*cfg.dt,12.*cfg.dt);
    return atan2(sin(a),cos(a));
}
// The stationed group, not the production capacity, defines the arrival boundary.
// A connected overflow guard can accept reinforcements at its outer edge.
fn reachedFriendlyPoint(u:Unit,dest:u32,id:u32)->bool{
    let p=points[dest];
    let c=cell(u.pos);
    let flow=flowAt(dest,c);
    if(flow==INF){return false;}
    if(distance(u.pos,p.pos)<=p.radius+1.25&&flow<=u32(ceil(p.radius+1.25))){return true;}
    for(var dz=-1;dz<=1;dz++){for(var dx=-1;dx<=1;dx++){
        let n=c+vec2i(dx,dz);
        if(!inside(n)||!passable(n)){continue;}
        for(var kind=0u;kind<2u;kind++){
            let slot=occupant(n,kind);if(slot==0u||slot==id+1u){continue;}
            let v=units[slot-1u];if(v.team!=u.team||v.garrison!=i32(dest)){continue;}
            if(!lineClear(u.pos,v.pos)){continue;}
            return true;
        }
    }}
    return false;
}
fn shoot(u:Unit,id:u32,j:u32)->bool{
    let v=units[j];let d=distance(u.pos,v.pos);let duration=max(cfg.dt,d/cfg.projectileSpeed);
    for(var k=0u;k<PER_UNIT;k++){
        let p=id*PER_UNIT+k;if(projectiles[p].isActive==0u){projectiles[p]=Projectile(u.pos,u.pos,u.pos,v.pos,0.,0.,duration,u32(u.attack),u.team,j,v.gen,1u);addPending(j,u32(u.attack));atomicAdd(&stats[12],1u);return true;}
    }
    atomicAdd(&stats[13],1u);return false;
}
@compute @workgroup_size(64) fn moveAttack(@builtin(global_invocation_id) g:vec3u){
    let id=g.x;if(id>=cfg.capacity){return;}var u=units[id];
    u.prev=u.pos;u.prevDir=u.dir;u.prevBlend=u.moveBlend;
    if(u.team==0u){nextUnits[id]=u;return;}
    u.cooldown=max(0.,u.cooldown-cfg.dt);u.state=0u;
    let oldDest=u.dest;let oldGarrison=u.garrison;
    if(u.garrison>=0){let p=points[u32(u.garrison)];if(p.owner!=u.team){u.dest=u.garrison;u.garrison=-1;}else if(p.targetId>=0){u.dest=p.targetId;u.garrison=-1;}}
    if(u.dest>=0&&u32(u.dest)<cfg.pointCount&&u.garrison<0){let p=points[u32(u.dest)];if(p.owner==u.team&&reachedFriendlyPoint(u,u32(u.dest),id)){if(p.targetId>=0){u.dest=p.targetId;}else{u.garrison=u.dest;}}}
    if(u.dest!=oldDest||u.garrison!=oldGarrison){u.waypoint=-1;u.detour=-1;u.blockedTicks=0u;}
    let attackRange=select(cfg.meleeRange,cfg.rangeRange,u.kind==1u);
    let search=select(cfg.meleeRange+1.65,cfg.rangeRange,u.kind==1u);
    let oldTarget=u.targetId;let objective=objectiveFor(u);
    var j=targetFor(u,search,id,objective);u.targetId=j;
    if(j!=oldTarget){u.waypoint=-1;u.detour=-1;u.blockedTicks=0u;}
    var desired=vec2f(0.);var fighting=false;var pursuing=false;
    let step=select(cfg.meleeSpeed,cfg.rangeSpeed,u.kind==1u)*cfg.dt;
    if(j>=0){
        let v=units[u32(j)];u.targetGen=v.gen;let delta=v.pos-u.pos;let d=length(delta);
        if(d<=attackRange){
            fighting=true;u.state=2u;u.waypoint=-1;u.detour=-1;u.blockedTicks=0u;
            u.dir=turnTowards(u.dir,atan2(delta.y,delta.x));
            if(u.cooldown<=.0001){
                var fired=true;if(u.kind==1u){fired=shoot(u,id,u32(j));}else{addDamage(u32(j),u.team,u32(u.attack));}
                if(fired){u.cooldown=select(cfg.meleeInterval,cfg.rangeInterval,u.kind==1u);u.anim=0.;u.state=3u;}
            }
        }else{
            // Range only approaches enemies beyond its firing distance while
            // clearing a hostile objective. It never retreats or kites.
            pursuing=true;desired=safeNorm(delta);
            if(u.detour>=0&&distance(u.pos,center(cellOf(u.detour)))<=.18){u.detour=-1;u.waypoint=-1;}
            if(u.detour>=0&&!waypointValid(u,id)){u.waypoint=-1;}
            if(u.blockedTicks>=6u||(u.detour>=0&&u.waypoint<0)){
                // Spread expensive replans over ticks. A newly reached waypoint
                // can immediately continue its current detour.
                if(u.detour>=0||((cfg.tick+id)%6u==0u)){
                    var route=LocalRoute(-1,-1);
                    if(u.detour>=0&&u.blockedTicks<6u){route=localRoute(u,id,-1,j,u.detour);}
                    if(route.first<0){route=localRoute(u,id,-1,j,-1);}
                    u.waypoint=route.first;u.detour=route.goal;
                    if(route.first<0){
                        // Do not keep staring at an enemy which cannot be reached.
                        u.ignoredTarget=j;u.ignoreUntil=cfg.tick+36u;u.targetId=-1;j=-1;
                        pursuing=false;desired=vec2f(0.);u.blockedTicks=0u;
                    }
                }
            }
            if(pursuing&&u.waypoint>=0){desired=safeNorm(center(cellOf(u.waypoint))-u.pos);}
        }
    }
    var march=false;
    if(!fighting&&!pursuing&&u.garrison<0&&u.dest>=0&&u32(u.dest)<cfg.pointCount){
        let here=flowAt(u32(u.dest),cell(u.pos));march=here!=0u&&here!=INF;
        if(!march){u.waypoint=-1;u.detour=-1;u.blockedTicks=0u;}
        else{
            if(u.detour>=0&&distance(u.pos,center(cellOf(u.detour)))<=.18){u.detour=-1;u.waypoint=-1;}
            if(!waypointValid(u,id)){u.waypoint=-1;}
            if(u.waypoint<0||u.blockedTicks>=6u){
                if(u.detour>=0||(u.blockedTicks>=6u&&((cfg.tick+id)%6u==0u))){
                    var route=LocalRoute(-1,-1);
                    if(u.detour>=0&&u.blockedTicks<6u){route=localRoute(u,id,u.dest,-1,u.detour);}
                    if(route.first<0){route=localRoute(u,id,u.dest,-1,-1);}
                    u.waypoint=route.first;u.detour=route.goal;
                }else if(u.detour<0){u.waypoint=nextWaypoint(u,u32(u.dest),id);}
            }
            if(u.waypoint>=0){desired=safeNorm(center(cellOf(u.waypoint))-u.pos);}
        }
    }
    if(!fighting){
        var moved=false;
        if(length(desired)>.001){
            if(u.waypoint>=0){
                let delta=center(cellOf(u.waypoint))-u.pos;
                let newPos=u.pos+safeNorm(delta)*min(step,length(delta));
                if(legalMove(u,newPos,id)){u.pos=newPos;u.dir=turnTowards(u.dir,atan2(delta.y,delta.x));moved=true;}
            }else if(pursuing){
                let steer=safeNorm(desired+separation(u,id)*.35);
                let angles=array<f32,5>(0.,.35,-.35,.7,-.7);
                for(var k=0u;k<5u;k++){
                    let a=angles[k];let v=rotate(steer,select(a,-a,id%2u==0u));
                    if(dot(v,desired)<.25){continue;}
                    let newPos=u.pos+v*step;
                    if(legalMove(u,newPos,id)){u.pos=newPos;u.dir=turnTowards(u.dir,atan2(v.y,v.x));moved=true;break;}
                }
            }
        }
        if(moved){u.state=1u;u.blockedTicks=0u;}
        else if(march||pursuing){u.blockedTicks=min(600u,u.blockedTicks+1u);}
        else{u.blockedTicks=0u;}
    }
    let walkGoal=select(0.,1.,u.state==1u);
    u.moveBlend+=clamp(walkGoal-u.moveBlend,-cfg.dt/.15,cfg.dt/.15);
    u.anim+=cfg.dt;nextUnits[id]=u;
}
@compute @workgroup_size(64) fn resolve(@builtin(global_invocation_id) g:vec3u){
    let id=g.x;if(id>=cfg.capacity){return;}var e=deaths[id];e.time=max(0.,e.time-cfg.dt);var u=nextUnits[id];if(u.team==0u){deaths[id]=e;return;}
    var damage=0u;var credit=0u;var high=0u;for(var t=0u;t<TEAM_MAX;t++){let d=atomicLoad(&scratch[id*TEAM_MAX+t]);damage+=d;if(d>high){high=d;credit=t+1u;}}
    u.hp-=f32(damage);
    if(u.hp<=0.){let t=u.team;atomicAdd(&stats[8u+t-1u],1u);if(credit!=0u&&credit!=t){atomicAdd(&stats[4u+credit-1u],1u);}e=Death(u.pos,.64,u.dir,u.team,u.kind);u.team=0u;u.hp=0.;u.garrison=-1;u.dest=-1;u.targetId=-1;nextUnits[id]=u;deaths[id]=e;return;}
    atomicAdd(&stats[u.team-1u],1u);
    for(var p=0u;p<cfg.pointCount;p++){let q=points[p];if(distance(q.pos,u.pos)<=q.radius){atomicAdd(&stats[ps(p,u.team-1u)],1u);}}
    if(u.garrison>=0&&u32(u.garrison)<cfg.pointCount&&points[u32(u.garrison)].owner==u.team){atomicAdd(&stats[ps(u32(u.garrison),4u)],1u);}else if(u.dest>=0&&u32(u.dest)<cfg.pointCount&&points[u32(u.dest)].owner==u.team){atomicAdd(&stats[ps(u32(u.dest),7u)],1u);}
    nextUnits[id]=u;deaths[id]=e;
}
