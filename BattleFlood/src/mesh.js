// Procedural, non-pixel, low-poly models. Every vertex has position, baked light/color, part and team tint.
class Mesh {
    constructor(){this.v=[];}
    tri(a,b,c,color,part=0,tint=0,light=true){const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;const sh=light?.66+.34*Math.max(0,(n[0]*-.35+n[1]*.85+n[2]*.39)/l):1;const col=color.map(x=>x*sh);for(const p of [a,b,c])this.v.push(...p,...col,part,tint);}
    quad(a,b,c,d,color,part=0,tint=0,light=true){this.tri(a,b,c,color,part,tint,light);this.tri(a,c,d,color,part,tint,light);}
    box(x,y,z,sx,sy,sz,c,p=0,t=0){const a=[x-sx/2,y-sy/2,z-sz/2],b=[x+sx/2,y-sy/2,z-sz/2],d=[x-sx/2,y-sy/2,z+sz/2],e=[x-sx/2,y+sy/2,z-sz/2],f=[x+sx/2,y+sy/2,z-sz/2],g=[x+sx/2,y+sy/2,z+sz/2],h=[x-sx/2,y+sy/2,z+sz/2],q=[x+sx/2,y-sy/2,z+sz/2];this.quad(e,h,g,f,c,p,t);this.quad(a,e,f,b,c,p,t);this.quad(b,f,g,q,c,p,t);this.quad(q,g,h,d,c,p,t);this.quad(d,h,e,a,c,p,t);this.quad(a,b,q,d,c,p,t);}
    cylinder(x,y,z,r0,r1,h,c,n=8,p=0,t=0){for(let i=0;i<n;i++){const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;const a0=[x+Math.cos(a)*r0,y,z+Math.sin(a)*r0],b0=[x+Math.cos(b)*r0,y,z+Math.sin(b)*r0],a1=[x+Math.cos(a)*r1,y+h,z+Math.sin(a)*r1],b1=[x+Math.cos(b)*r1,y+h,z+Math.sin(b)*r1];this.quad(a0,a1,b1,b0,c,p,t);this.tri([x,y+h,z],b1,a1,c,p,t);}}
    ring(radius,width,y,c,n=48,p=0,t=0){for(let i=0;i<n;i++){const a=i*2*Math.PI/n,b=(i+1)*2*Math.PI/n;this.quad([Math.cos(a)*(radius-width),y,Math.sin(a)*(radius-width)],[Math.cos(a)*radius,y,Math.sin(a)*radius],[Math.cos(b)*radius,y,Math.sin(b)*radius],[Math.cos(b)*(radius-width),y,Math.sin(b)*(radius-width)],c,p,t,false);}}
    finish(){return new Float32Array(this.v);}
}
const leather=[.46,.36,.25],metal=[.72,.76,.76],skin=[.88,.72,.53],white=[.94,.96,.96],wood=[.54,.38,.23],dark=[.24,.28,.27];
export function unitMesh(kind){const m=new Mesh();m.cylinder(0,.012,0,.45,.45,.012,[.27,.29,.24],10,9,0); // flattened contact shadow
    m.box(0,.53,-.125,.23,.49,.18,leather,1,0);m.box(0,.53,.125,.23,.49,.18,leather,2,0);m.box(.055,.24,-.125,.32,.16,.20,dark,1,0);m.box(.055,.24,.125,.32,.16,.20,dark,2,0);
    m.cylinder(0,.68,0,.245,.275,.40,white,7,0,1);m.box(0,.71,0,.43,.12,.49,leather,0,0);m.cylinder(0,1.08,0,.17,.17,.23,skin,8);m.cylinder(0,1.26,0,.23,.11,.15,kind==='melee'?metal:white,8,0,kind==='range'?1:0);
    m.box(.025,.88,-.32,.20,.33,.18,white,3,1);m.box(.025,.88,.32,.20,.33,.18,white,4,1);
    if(kind==='melee'){m.box(.29,.93,.33,.48,.08,.08,metal,4,0);m.box(.49,.93,.33,.08,.17,.16,metal,4,0);m.cylinder(.14,.68,-.36,.22,.22,.05,white,8,3,1);m.box(.16,.92,-.37,.10,.34,.28,metal,3,0);}else{m.box(-.20,.88,.13,.16,.55,.18,wood);m.box(.25,.95,.27,.12,.65,.075,wood,4);m.box(.38,.95,.27,.035,.54,.035,metal,4);m.box(.36,.95,.27,.39,.035,.035,metal,4);}
    return m.finish();}
export function pointRingMesh(){const m=new Mesh();m.ring(1,.025,.045,white,96,10,1);return m.finish();}
export function pointMesh(kind='melee'){const m=new Mesh();m.box(0,.14,0,1.95,.27,1.95,[.46,.48,.43]);m.box(0,.72,0,1.72,1.16,1.72,[.63,.66,.58]);m.box(.89,.60,0,.08,.75,.53,dark);m.box(0,1.39,0,2.0,.24,2.0,white,0,1);if(kind==='melee')m.cylinder(0,1.49,0,1.15,.05,.55,white,4,0,1);else{m.cylinder(0,1.49,0,.97,.72,.68,white,8,0,1);m.cylinder(0,2.17,0,.81,.05,.36,metal,8);}m.box(0,2.22,0,.06,.86,.06,metal);m.box(.29,2.46,0,.58,.28,.06,white,0,1);return m.finish();}
export function arrowMesh(){const m=new Mesh();m.box(0,0,0,.75,.045,.045,wood);m.box(.28,0,0,.16,.09,.09,metal);m.box(-.30,0,0,.15,.15,.025,[.95,.86,.55]);return m.finish();}
export function deathMesh(){const m=new Mesh();m.box(0,.12,0,.74,.17,.35,white,0,1);m.cylinder(.48,.05,0,.13,.13,.19,skin,6);m.ring(.59,.045,.025,[.86,.79,.54],12);return m.finish();}
function rand(x,z){let n=Math.imul(x+47,73856093)^Math.imul(z+7,19349663);n^=n>>>13;return (n>>>0)/4294967295;}
export function terrainMesh(map){const m=new Mesh();for(let z=0;z<map.h;z++)for(let x=0;x<map.w;x++){const t=map.cells[z*map.w+x],n=rand(x,z);let col=t===1?[.25,.46,.55]:t===3?[.59,.48,.33]:t===2?[.45,.46,.39]:t===4?[.34,.48,.30]:[.46+n*.045,.58+n*.045,.40+n*.04];let y=t===1?-.13:t===3?.025:0;m.quad([x,y,z],[x,y,z+1],[x+1,y,z+1],[x+1,y,z],col,0,0,false);if(t===2&&n>.42)m.cylinder(x+.5,.02,z+.5,.38+n*.13,.15+n*.16,.45+n*.68,[.47,.49,.44],5);if(t===4&&n>.30){m.cylinder(x+.5,0,z+.5,.085,.065,.46,wood,5);m.cylinder(x+.5,.4,z+.5,.42,.055,.85+n*.6,[.28,.43,.29],6);}
    if(t===3&&z%2===0)m.box(x+.5,.04,z+.96,.99,.045,.045,[.42,.35,.24]);}
    return m.finish();}
