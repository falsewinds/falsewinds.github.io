import {PITCH,PAD_X,PAD_Z,viewFor,farViewFor,clamp} from './model.js?v=10';
import {checkedShader,buffer,group} from './gpu.js?v=10';
import {terrainMesh,pointRingMesh,arrowMesh} from './mesh.js?v=10';
import {loadVisualModels} from './assets.js?v=10';
export class Renderer{
    static async create(device,canvas,gpu){const r=new Renderer(device,canvas,gpu);await r.init();return r;}
    constructor(device,canvas,gpu){this.d=device;this.canvas=canvas;this.gpu=gpu;this.model=gpu.model;this.context=canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();this.resources=[];this.center={x:15,z:40};this.yaw=0;this.mode='medium';this.view=viewFor(1.6,500);this.depth=null;this.width=0;this.height=0;this.counts=[0,0,0,0];this.frame=0;this.readBusy=false;this.dead=false;}
    make(n,u,l,data){const b=buffer(this.d,n,u,l,data);this.resources.push(b);return b;}
    async init(){const d=this.d,C=this.model.capacity;this.context.configure({device:d,format:this.format,alphaMode:'opaque'});this.cam=this.make(96,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'camera');this.visible=this.make(C*12*4,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST,'GPU compact visible lists');this.args=this.make(80,GPUBufferUsage.STORAGE|GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,'indirect draw arguments');this.modeBuffers=[0,1].map(k=>this.make(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST,'draw kind',new Uint32Array([k,0,0,0])));this.read=this.make(80,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ,'visibility metrics');const modelData={terrain:terrainMesh(this.model.map),point_ring:pointRingMesh(),projectile:arrowMesh(),...await loadVisualModels(this.model.s.visualModels)};this.meshes={};for(const [k,v] of Object.entries(modelData))this.meshes[k]={count:v.length/8,buf:this.make(v.byteLength,GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,k+' mesh',v)};
        const args=new Uint32Array(20);['melee','range','projectile','melee','range'].forEach((k,i)=>args[i*4]=this.meshes[k].count);d.queue.writeBuffer(this.args,0,args);
        const sh=await checkedShader(d,'shaders/render.wgsl');this.cull=await d.createComputePipelineAsync({label:'GPU frustum compact',layout:'auto',compute:{module:sh,entryPoint:'cull'}});const layout={arrayStride:32,attributes:[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32'},{shaderLocation:3,offset:28,format:'float32'}]};this.pipes={};for(const [name,vertex] of Object.entries({terrain:'terrainVertex',point:'pointVertex',unit:'unitVertex',projectile:'projectileVertex',death:'deathVertex'})){const blend=name==='death'?{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}:undefined;this.pipes[name]=await d.createRenderPipelineAsync({label:name,layout:'auto',vertex:{module:sh,entryPoint:vertex,buffers:[layout]},fragment:{module:sh,entryPoint:'fragment',targets:[{format:this.format,blend}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:name!=='death',depthCompare:'less-equal'}});}
        this.groups=[0,1].map(i=>({cull:group(d,this.cull,[[0,this.cam],[1,this.gpu.units[i]],[3,this.gpu.projectiles],[4,this.gpu.deaths],[5,this.visible],[6,this.args]],'cull '+i),terrain:group(d,this.pipes.terrain,[[0,this.cam]],'terrain'),point:group(d,this.pipes.point,[[0,this.cam],[2,this.gpu.points]],'points'),unit:[0,1].map(k=>group(d,this.pipes.unit,[[0,this.cam],[1,this.gpu.units[i]],[7,this.modeBuffers[k]],[8,this.visible]],'unit '+i+' '+k)),projectile:group(d,this.pipes.projectile,[[0,this.cam],[3,this.gpu.projectiles],[8,this.visible]],'projectile'),death:[0,1].map(k=>group(d,this.pipes.death,[[0,this.cam],[4,this.gpu.deaths],[7,this.modeBuffers[k]],[8,this.visible]],'death '+k))}));this.resize();}
    resize(){const r=this.canvas.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;const ratio=Math.min(devicePixelRatio||1,1.6),w=Math.max(1,Math.floor(r.width*ratio)),h=Math.max(1,Math.floor(r.height*ratio));if(w!==this.width||h!==this.height){this.width=w;this.height=h;this.canvas.width=w;this.canvas.height=h;if(this.depth)this.depth.destroy();this.depth=this.d.createTexture({label:'depth buffer',size:[w,h],format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});}// CSS aspect, not integer backing-buffer aspect, is the picking reference.
        const aspect=r.width/r.height;
        if(this.viewAspect!==aspect||this.viewMode!==this.mode){
            this.view=this.mode==='far'?farViewFor(aspect):viewFor(aspect,500);
            this.viewAspect=aspect;this.viewMode=this.mode;
        }
        return true;}
    setMode(mode){this.mode=mode;this.resize();}
    rotate(delta){this.yaw=((this.yaw??0)+delta)%(2*Math.PI);}
    move(dx,dz){
        const c=Math.cos(this.yaw??0),s=Math.sin(this.yaw??0);
        this.center.x=clamp(this.center.x+dx*c-dz*s,0,this.model.map.w);
        this.center.z=clamp(this.center.z+dx*s+dz*c,0,this.model.map.h);
    }
    focus(p){this.center.x=p.x;this.center.z=p.z;}
    project(x,z,y=0){
        const r=this.canvas.getBoundingClientRect(),v=this.view,c=Math.cos(this.yaw??0),s=Math.sin(this.yaw??0);
        const dx=x-this.center.x,dz=z-this.center.z,rx=dx*c+dz*s,rz=-dx*s+dz*c;
        const depth=v.distance-rz*Math.cos(PITCH)-y*Math.sin(PITCH);
        if(depth<=.1)return {x:NaN,y:NaN,depth};
        return {x:(.5+rx/(2*v.tanX*depth))*r.width,
            y:(.5+(rz*Math.sin(PITCH)-y*Math.cos(PITCH))/(2*v.tanY*depth))*r.height,depth};
    }
    ground(px,py){
        const r=this.canvas.getBoundingClientRect(),v=this.view,c=Math.cos(this.yaw??0),s=Math.sin(this.yaw??0);
        const k=(2*py/r.height-1)*v.tanY,den=Math.sin(PITCH)+k*Math.cos(PITCH);
        if(den<=0)return {x:NaN,z:NaN};
        const dz=v.distance*k/den,depth=v.distance-dz*Math.cos(PITCH);
        const dx=(2*px/r.width-1)*v.tanX*depth;
        return {x:this.center.x+dx*c-dz*s,z:this.center.z+dx*s+dz*c};
    }
    panPixels(fromX,fromY,toX,toY){
        const r=this.canvas.getBoundingClientRect();
        const a=this.ground(clamp(fromX,0,r.width),clamp(fromY,0,r.height));
        const b=this.ground(clamp(toX,0,r.width),clamp(toY,0,r.height));
        if(!Number.isFinite(a.x+b.x+a.z+b.z))return;
        this.center.x=clamp(this.center.x+a.x-b.x,0,this.model.map.w);
        this.center.z=clamp(this.center.z+a.z-b.z,0,this.model.map.h);
    }
    cameraData(alpha,time){
        const b=new ArrayBuffer(96),f=new Float32Array(b),u=new Uint32Array(b),m=this.model,v=this.view;
        f.set([this.center.x,this.center.z,v.tanX,v.tanY,Math.sin(PITCH),Math.cos(PITCH),alpha,time,
            v.distance+Math.hypot(m.map.w,m.map.h)+20,PAD_X,PAD_Z]);
        u[11]=m.capacity;f[12]=m.map.w;f[13]=m.map.h;u[14]=m.points.length;
        f[15]=v.distance;f[16]=Math.cos(this.yaw??0);f[17]=Math.sin(this.yaw??0);
        f[18]=v.groundMin;f[19]=v.groundMax;f[20]=v.groundHalfW;f[21]=.1;return b;
    }
    render(alpha,time){if(this.dead||!this.resize())return;const d=this.d,g=this.groups[this.gpu.index];d.queue.writeBuffer(this.cam,0,this.cameraData(alpha,time));const enc=d.createCommandEncoder({label:'render frame'});for(let i=0;i<5;i++)enc.clearBuffer(this.args,i*16+4,4);const c=enc.beginComputePass();c.setPipeline(this.cull);c.setBindGroup(0,g.cull);c.dispatchWorkgroups(Math.ceil(this.model.capacity*8/64));c.end();const pass=enc.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.18,g:.26,b:.22,a:1},loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
        const direct=(k,p,grp,instances,firstInstance=0)=>{pass.setPipeline(this.pipes[p]);pass.setBindGroup(0,grp);pass.setVertexBuffer(0,this.meshes[k].buf);pass.draw(this.meshes[k].count,instances,0,firstInstance);};const indirect=(k,p,grp,i)=>{pass.setPipeline(this.pipes[p]);pass.setBindGroup(0,grp);pass.setVertexBuffer(0,this.meshes[k].buf);pass.drawIndirect(this.args,i*16);};direct('terrain','terrain',g.terrain,1);direct('point_ring','point',g.point,this.model.points.length);for(const p of this.model.points)direct('point_'+p.kind,'point',g.point,1,p.i);indirect('melee','unit',g.unit[0],0);indirect('range','unit',g.unit[1],1);indirect('projectile','projectile',g.projectile,2);indirect('melee','death',g.death[0],3);indirect('range','death',g.death[1],4);pass.end();let read=false;if(++this.frame%30===1&&!this.readBusy){enc.copyBufferToBuffer(this.args,0,this.read,0,80);this.readBusy=true;read=true;}d.queue.submit([enc.finish()]);if(read)this.read.mapAsync(GPUMapMode.READ).then(()=>{const a=new Uint32Array(this.read.getMappedRange());this.counts=[a[1],a[5],a[9],a[13]+a[17]];this.read.unmap();this.readBusy=false;}).catch(()=>{this.readBusy=false;});}
    destroy(){this.dead=true;this.depth?.destroy();for(const b of this.resources)b.destroy();this.context.unconfigure();}
}
