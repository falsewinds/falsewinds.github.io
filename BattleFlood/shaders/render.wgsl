struct Camera {center:vec2f,tanX:f32,tanY:f32,sinP:f32,cosP:f32,alpha:f32,time:f32,farPlane:f32,padX:f32,padZ:f32,capacity:u32,width:f32,height:f32,pointCount:u32,distance:f32,yawCos:f32,yawSin:f32,groundMin:f32,groundMax:f32,groundHalfW:f32,nearPlane:f32,pad2:vec2f,}
struct Unit {pos:vec2f,prev:vec2f,hp:f32,attack:f32,cooldown:f32,dir:f32,team:u32,kind:u32,dest:i32,garrison:i32,targetId:i32,gen:u32,targetGen:u32,anim:f32,maxhp:f32,state:u32,waypoint:i32,prevDir:f32,moveBlend:f32,prevBlend:f32,detour:i32,blockedTicks:u32,ignoredTarget:i32,ignoreUntil:u32,}
struct Point {pos:vec2f,radius:f32,padding0:f32,owner:u32,kind:u32,targetId:i32,cap:u32,attack:f32,hp:f32,normal:u32,reserved:u32,cellStart:u32,cellCount:u32,gateCount:u32,padding1:u32,}
struct Projectile {origin:vec2f,pos:vec2f,prev:vec2f,end:vec2f,t:f32,oldT:f32,duration:f32,attack:u32,team:u32,targetId:u32,gen:u32,isActive:u32,}
struct Death {pos:vec2f,time:f32,dir:f32,team:u32,kind:u32,}
struct DrawMode {kind:u32,p0:u32,p1:u32,p2:u32,}
@group(0) @binding(0) var<uniform> cam:Camera;
@group(0) @binding(1) var<storage,read> units:array<Unit>;
@group(0) @binding(2) var<storage,read> points:array<Point>;
@group(0) @binding(3) var<storage,read> projectiles:array<Projectile>;
@group(0) @binding(4) var<storage,read> deaths:array<Death>;
@group(0) @binding(5) var<storage,read_write> visible:array<u32>;
@group(0) @binding(6) var<storage,read_write> args:array<atomic<u32>>;
@group(0) @binding(7) var<uniform> mode:DrawMode;
// Separate read-only alias for vertex-stage visibility (same buffer, never bound with 5 in a pass).
@group(0) @binding(8) var<storage,read> readVisible:array<u32>;
const PI:f32=3.14159265;
fn cameraPlane(p:vec2f)->vec2f{
    let d=p-cam.center;
    return vec2f(d.x*cam.yawCos+d.y*cam.yawSin,-d.x*cam.yawSin+d.y*cam.yawCos);
}
fn seen(p:vec2f,px:f32,pz:f32)->bool{
    let q=cameraPlane(p);
    return abs(q.x)<=cam.groundHalfW+px&&q.y>=cam.groundMin-pz&&q.y<=cam.groundMax+pz;
}
fn listOffset(k:u32)->u32{switch k{case 0u:{return 0u;}case 1u:{return cam.capacity;}case 2u:{return cam.capacity*2u;}case 3u:{return cam.capacity*10u;}default:{return cam.capacity*11u;}}}
fn addVisible(k:u32,id:u32){let i=atomicAdd(&args[k*4u+1u],1u);visible[listOffset(k)+i]=id;}
@compute @workgroup_size(64) fn cull(@builtin(global_invocation_id) g:vec3u){let i=g.x;if(i<cam.capacity){let u=units[i];if(u.team!=0u&&seen(u.pos,cam.padX,cam.padZ)){addVisible(u.kind,i);}let e=deaths[i];if(e.time>0.&&seen(e.pos,1.3,1.8)){addVisible(3u+e.kind,i);}}
    if(i<cam.capacity*8u){let p=projectiles[i];if(p.isActive!=0u&&seen(p.pos,1.3,3.0)){addVisible(2u,i);}}
}
struct Vertex { @location(0) pos:vec3f, @location(1) color:vec3f, @location(2) part:f32, @location(3) tint:f32,}
struct Out { @builtin(position) pos:vec4f, @location(0) color:vec3f, @location(1) fade:f32,}
fn teamColor(t:u32)->vec3f{switch t{case 1u:{return vec3f(.25,.61,.88);}case 2u:{return vec3f(.88,.32,.24);}case 3u:{return vec3f(.67,.48,.89);}case 4u:{return vec3f(.91,.71,.26);}default:{return vec3f(.61,.64,.59);}}}
fn transform(p:vec3f)->vec4f{
    let q=cameraPlane(p.xz);
    let y=p.y*cam.cosP-q.y*cam.sinP;
    let depth=cam.distance-q.y*cam.cosP-p.y*cam.sinP;
    // Standard perspective homogeneous clip coordinates, WebGPU z in [0,w].
    let clipZ=cam.farPlane/(cam.farPlane-cam.nearPlane)*(depth-cam.nearPlane);
    return vec4f(q.x/cam.tanX,y/cam.tanY,clipZ,depth);
}
fn rot(p:vec3f,a:f32)->vec3f{return vec3f(p.x*cos(a)-p.z*sin(a),p.y,p.x*sin(a)+p.z*cos(a));}
fn limb(p:vec3f,pivot:f32,a:f32)->vec3f{let x=p.x;let y=p.y-pivot;return vec3f(x*cos(a)-y*sin(a),pivot+x*sin(a)+y*cos(a),p.z);}
@vertex fn terrainVertex(v:Vertex)->Out{return Out(transform(v.pos),v.color,1.);}
@vertex fn pointVertex(v:Vertex,@builtin(instance_index) idx:u32)->Out{let p=points[idx];var a=v.pos;if(v.part==10.){a.x*=p.radius;a.z*=p.radius;}let color=mix(v.color,v.color*teamColor(p.owner),v.tint);return Out(transform(a+vec3f(p.pos.x,0.,p.pos.y)),color,1.);}
@vertex fn unitVertex(v:Vertex,@builtin(instance_index) idx:u32)->Out{
    let unitId=readVisible[listOffset(mode.kind)+idx];let u=units[unitId];
    let pos=mix(u.prev,u.pos,cam.alpha);
    let dir=u.prevDir+atan2(sin(u.dir-u.prevDir),cos(u.dir-u.prevDir))*cam.alpha;
    let blend=mix(u.prevBlend,u.moveBlend,cam.alpha);
    var a=v.pos;
    let time=max(0.,cam.time-(1.-cam.alpha)/30.);
    let walk=sin(time*12.+f32(u.gen%19u)*.37+f32(unitId%17u))*blend;
    if(v.part==1.){a=limb(a,.71,walk*.52);}
    if(v.part==2.){a=limb(a,.71,-walk*.52);}
    if(v.part==3.){a=limb(a,1.02,-walk*.38);}
    if(v.part==4.){
        if(u.state==2u||u.state==3u){
            let phase=clamp((u.anim+cam.alpha/30.)*6.,0.,1.);
            a=limb(a,1.02,sin(phase*PI)*select(-.85,-.48,u.kind==1u));
        }else{a=limb(a,1.02,walk*.38);}
    }
    if(v.part!=9.){a.y+=abs(walk)*.035;}
    let color=mix(v.color,v.color*teamColor(u.team),v.tint);
    return Out(transform(rot(a,dir)+vec3f(pos.x,0.,pos.y)),color,1.);
}
@vertex fn projectileVertex(v:Vertex,@builtin(instance_index) idx:u32)->Out{let p=projectiles[readVisible[listOffset(2u)+idx]];let pos=mix(p.prev,p.pos,cam.alpha);let t=mix(p.oldT,p.t,cam.alpha);let delta=p.end-p.origin;let dir=atan2(delta.y,delta.x);let height=.83+sin(t*PI)*min(2.1,length(delta)*.28);return Out(transform(rot(v.pos,dir)+vec3f(pos.x,height,pos.y)),v.color,1.);}
@vertex fn deathVertex(v:Vertex,@builtin(instance_index) idx:u32)->Out{let e=deaths[readVisible[listOffset(3u+mode.kind)+idx]];let color=mix(v.color,v.color*teamColor(e.team),v.tint);let fall=select(vec3f(v.pos.y,max(.03,.25-v.pos.x*.32),v.pos.z),v.pos,v.part==9.);return Out(transform(rot(fall,e.dir)+vec3f(e.pos.x,0.,e.pos.y)),color,clamp(e.time/.64,0.,1.));}
@fragment fn fragment(v:Out)->@location(0) vec4f{return vec4f(v.color,v.fade);}
