// Model assets are a presentation concern only. GPU-ready vertices: xyz, rgb, part, teamTint.
import {unitMesh, pointMesh} from './mesh.js?v=10';
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const partNames={body:0,leftLeg:1,rightLeg:2,leftArm:3,rightArm:4};
const defaults={units:{melee:{},range:{}},points:{melee:{},range:{}}};
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
function check(ok,msg){if(!ok)throw Error('Model asset: '+msg);}
async function get(url,kind='arrayBuffer'){
    const r=await fetch(url,{cache:'no-store'});check(r.ok,`${url} HTTP ${r.status}`);return r[kind]();
}
function multiply(a,b){const out=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
function trs(n){if(n.matrix)return n.matrix;const [x,y,z,w]=n.rotation??[0,0,0,1],[a,b,c]=n.scale??[1,1,1],[tx,ty,tz]=n.translation??[0,0,0];return [(1-2*y*y-2*z*z)*a,2*(x*y+z*w)*a,2*(x*z-y*w)*a,0,2*(x*y-z*w)*b,(1-2*x*x-2*z*z)*b,2*(y*z+x*w)*b,0,2*(x*z+y*w)*c,2*(y*z-x*w)*c,(1-2*x*x-2*y*y)*c,0,tx,ty,tz,1];}
function transform(m,p){const [x,y,z]=p;return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];}
function accessor(doc,buffers,i){const a=doc.accessors?.[i],v=doc.bufferViews?.[a?.bufferView];check(a&&v&&!a.sparse,'missing or sparse accessor '+i);const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},types={5120:[1,'getInt8',127],5121:[1,'getUint8',255],5122:[2,'getInt16',32767],5123:[2,'getUint16',65535],5125:[4,'getUint32',4294967295],5126:[4,'getFloat32',1]};const n=sizes[a.type],t=types[a.componentType];check(n&&t&&Number.isInteger(a.count)&&a.count>=0,'unsupported accessor '+i);const [size,method,max]=t,step=v.byteStride??n*size,offset=(v.byteOffset??0)+(a.byteOffset??0),dv=new DataView(buffers[v.buffer]);check(a.count===0||offset+(a.count-1)*step+n*size<=dv.byteLength,'accessor out of bounds');return {count:a.count,n,read(j){check(j>=0&&j<a.count,'index out of bounds');return Array.from({length:n},(_,k)=>{let value=dv[method](offset+j*step+k*size,true);if(a.normalized&&a.componentType!==5126)value=Math.max(-1,value/max);return value;});}};}
function material(doc,p){const m=doc.materials?.[p.material]??{},q=m.pbrMetallicRoughness??{};check(!q.baseColorTexture&&!m.normalTexture&&!m.emissiveTexture&&!m.occlusionTexture&&!q.metallicRoughnessTexture,'textures not supported; export solid material colors or COLOR_0');check(!m.alphaMode||m.alphaMode==='OPAQUE','transparent materials not supported');return {color:(q.baseColorFactor??[1,1,1,1]).slice(0,3),name:m.name??''};}
export async function readGltf(url){
    const ab=await get(url),v=new DataView(ab);let doc,bin;
    if(ab.byteLength>=12&&v.getUint32(0,true)===0x46546c67){check(v.getUint32(4,true)===2&&v.getUint32(8,true)===ab.byteLength,'invalid GLB header');let p=12;while(p<ab.byteLength){check(p+8<=ab.byteLength,'invalid GLB chunk');const n=v.getUint32(p,true),t=v.getUint32(p+4,true);p+=8;check(p+n<=ab.byteLength,'invalid GLB chunk length');if(t===0x4e4f534a)doc=JSON.parse(new TextDecoder().decode(ab.slice(p,p+n)).replace(/\0+$/,''));else if(t===0x004e4942)bin=ab.slice(p,p+n);p+=n;}}
    else doc=JSON.parse(new TextDecoder().decode(ab));
    check(doc?.asset?.version?.startsWith('2.'),'only glTF 2.0');check(!doc.extensionsRequired?.length,'required glTF extensions are unsupported: '+doc.extensionsRequired?.join(', '));
    check(!doc.skins?.length&&!doc.animations?.length,'export a static mesh or rigid named parts, not skeletal/clip animation');
    const buffers=await Promise.all((doc.buffers??[]).map(async b=>{const data=b.uri?await get(new URL(b.uri,url)):bin;check(data&&data.byteLength>=b.byteLength,'missing glTF buffer');return data;}));
    const triangles=[];const scene=doc.scenes?.[doc.scene??0];check(scene&&Array.isArray(scene.nodes),'missing scene');
    function walk(i,parent,stack){check(!stack.has(i),'cyclic scene graph');const n=doc.nodes?.[i];check(n,'missing node '+i);const m=multiply(parent,trs(n));const trail=new Set(stack).add(i);if(n.mesh!==undefined){const mesh=doc.meshes?.[n.mesh];check(mesh,'missing mesh');for(const p of mesh.primitives){check((p.mode??4)===4&&!p.targets?.length&&!p.extensions,'only uncompressed triangle lists');const pos=accessor(doc,buffers,p.attributes.POSITION),col=p.attributes.COLOR_0===undefined?null:accessor(doc,buffers,p.attributes.COLOR_0),ids=p.indices===undefined?null:accessor(doc,buffers,p.indices);check(pos.n===3&&(!col||col.count===pos.count&&col.n>=3)&&(!ids||ids.n===1),'invalid vertex format');const mat=material(doc,p),count=ids?.count??pos.count;check(count%3===0,'triangle index count');for(let j=0;j<count;j+=3){const vertices=[];for(let k=0;k<3;k++){const id=ids?ids.read(j+k)[0]:j+k,vc=col?col.read(id):[1,1,1];vertices.push({p:transform(m,pos.read(id)),c:mat.color.map((x,a)=>x*vc[a])});}triangles.push({vertices,name:n.name??mesh.name??'',material:mat.name});}}}for(const c of n.children??[])walk(c,m,trail);}
    for(const i of scene.nodes)walk(i,ID,new Set());check(triangles.length,'empty glTF scene');return triangles;
}
export function readObj(text){
    const points=[],colors=[],triangles=[];let name='',material='';
    for(const raw of text.split(/\r?\n/)){const [tag,...a]=raw.trim().split(/\s+/);if(tag==='v'){const p=a.slice(0,3).map(Number);check(p.length===3&&p.every(finite),'invalid OBJ vertex');points.push(p);colors.push(a.length>=6?a.slice(3,6).map(Number):[1,1,1]);}else if(tag==='o'||tag==='g')name=a.join(' ');else if(tag==='usemtl')material=a.join(' ');else if(tag==='f'){check(a.length>=3,'invalid OBJ face');const ids=a.map(t=>{let i=Number(t.split('/')[0]);check(Number.isInteger(i)&&i!==0,'invalid OBJ index');i=i>0?i-1:points.length+i;check(points[i],'OBJ index out of range');return i;});for(let k=1;k+1<ids.length;k++)triangles.push({name,material,vertices:[ids[0],ids[k],ids[k+1]].map(i=>({p:points[i],c:colors[i]}))});}}
    check(triangles.length,'empty OBJ mesh');return triangles;
}
export function packModel(triangles,config,kind){
    const isUnit=kind==='units';const maxTriangles=config.maxTriangles??(isUnit?3000:6000);check(Number.isInteger(maxTriangles)&&maxTriangles>0&&triangles.length<=maxTriangles,`triangle budget exceeded (${triangles.length}/${maxTriangles})`);
    const angle=(config.yawDegrees??0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),turn=p=>[p[0]*cos-p[2]*sin,p[1],p[0]*sin+p[2]*cos];
    const verts=triangles.flatMap(t=>t.vertices.map(v=>turn(v.p)));check(verts.every(p=>p.every(finite)),'non-finite model positions');let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of verts)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[j]);hi[j]=Math.max(hi[j],p[j]);}const origin=[(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2],height=hi[1]-lo[1];let radius=0;for(const p of verts)radius=Math.max(radius,Math.hypot(p[0]-origin[0],p[2]-origin[2]));const targetH=config.height??(isUnit?1.4:2.6),targetR=config.radius??(isUnit?.64:1.38);check(finite(targetH)&&targetH>0&&targetH<=(isUnit?1.55:3.0)&&finite(targetR)&&targetR>0&&targetR<=(isUnit?.68:1.4),'height/radius outside collision and culling envelope');const scale=Math.min(height>0?targetH/height:Infinity,radius>0?targetR/radius:Infinity);check(finite(scale)&&scale>0,'degenerate mesh');const out=new Float32Array(triangles.length*24);let v=0;
    for(const t of triangles){const p=t.vertices.map(q=>turn(q.p).map((x,j)=>(x-origin[j])*scale));const a=p[1].map((x,j)=>x-p[0][j]),b=p[2].map((x,j)=>x-p[0][j]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n)||1,light=.66+.34*Math.max(0,(-.35*n[0]+.85*n[1]+.39*n[2])/l);const part=isUnit?(partNames[config.parts?.[t.name]]??0):0;const tint=config.teamMaterials?Number(config.teamMaterials.includes(t.material)):(config.teamTint??.75);check(finite(tint)&&tint>=0&&tint<=1,'teamTint must be 0–1');for(let k=0;k<3;k++){const c=t.vertices[k].c.map((x,j)=>x*(config.color?.[j]??1)*light);check(c.every(finite),'invalid color');out.set([...p[k],...c,part,tint],v);v+=8;}}
    return out;
}
export async function loadModel(config,kind,variant,base){
    if(!config?.url)return kind==='units'?unitMesh(variant):pointMesh(variant);
    const url=new URL(config.url,base),path=url.pathname.toLowerCase();let triangles;if(path.endsWith('.obj'))triangles=readObj(await get(url,'text'));else if(path.endsWith('.glb')||path.endsWith('.gltf'))triangles=await readGltf(url);else throw Error('不支援模型格式：'+url.pathname);return packModel(triangles,config,kind);
}
export async function loadVisualModels(overrides={},configUrl=new URL('../data/models.json',import.meta.url)){
    const config=await get(configUrl,'json'),result={};
    for(const category of ['units','points'])for(const variant of ['melee','range']){const spec={...defaults[category][variant],...config[category]?.[variant],...overrides[category]?.[variant]};const key=category==='units'?variant:'point_'+variant;result[key]=await loadModel(spec,category,variant,configUrl);}
    return result;
}
