import {BattleModel,buildMap,validateScenario,TEAM_COLORS,isMobile,DT,clamp} from './model.js?v=10';
import {getGPU,BattleGPU} from './gpu.js?v=10';
import {Renderer} from './renderer.js?v=10';
import {drawSelected,drawLog,drawMarkers as renderMarkers} from './ui.js?v=10';
const $=id=>document.getElementById(id);
const fmtTime=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let device,adapter,model,gpu,renderer,scenarioName='conquest',primaryScenario='conquest',selected=-1,assigning=false,mode='medium',paused=false,changing=false,stop=false,raf=0,acc=0,last=0,lastTick=0,lastUI=0,fps=0,simHz=0,frameCounter=0,stepCounter=0,perfStart=performance.now(),audio=null,sound=false,lastKills=0,lastLog='',messageUntil=0,drag=null,epoch=0;
const touches=new Map();
const params=new URLSearchParams(location.search),testMode=params.has('test');
function msg(s){$('status').textContent=s;$('status').classList.add('show');messageUntil=performance.now()+3500;}
function error(e){console.error(e);stop=true;$('loading').hidden=false;$('loadmsg').textContent=e?.message??String(e);$('retry').hidden=false;}
function tone(freq=320,volume=.028,duration=.07){if(!sound||!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(70,freq*.5),audio.currentTime+duration);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration+.01);}
async function loadScenario(name){if(changing)return;changing=true;const run=++epoch;stop=true;cancelAnimationFrame(raf);$('loading').hidden=false;$('retry').hidden=true;$('loadmsg').textContent='載入戰局與編譯 GPU 管線…';try{if(gpu){while(gpu.busy)await new Promise(r=>setTimeout(r,10));await device.queue.onSubmittedWorkDone();renderer?.destroy();gpu.destroy();}const res=await fetch('data/'+name+'.json',{cache:'no-store'});if(!res.ok)throw Error('讀取戰局失敗');const data=await res.json();validateScenario(data);model=new BattleModel(data,buildMap(data));gpu=await BattleGPU.create(device,model);renderer=await Renderer.create(device,$('battle'),gpu);scenarioName=name;if(name!=='stress')primaryScenario=name;document.body.classList.toggle('stress-mode',!!data.stress);selected=model.points.find(p=>p.owner===1)?.i??-1;assigning=false;drag=null;mapPress=null;touches.clear();paused=false;mode='medium';stop=false;acc=0;last=performance.now();lastTick=last;lastUI=0;perfStart=last;frameCounter=stepCounter=0;fps=simHz=0;lastKills=0;lastLog='';$('end').hidden=true;$('pause').textContent='暫停';$('scenario').textContent=name==='stress'?'正式戰局':'壓力測試';$('objective').textContent=`${data.name} · ${data.description}`;$('far').hidden=isMobile();setMode('medium');if(selected>=0)renderer.focus(model.points[selected]);model.emit(data.stress?'壓力測試：2,500 名士兵已載入':'戰局開始，選取己方據點指定目標');await gpu.step();refresh(true);$('loading').hidden=true;changing=false;if(!testMode)raf=requestAnimationFrame(loop);window.BattleFlood={get model(){return model;},get gpu(){return gpu;},get renderer(){return renderer;},get mode(){return mode;},step:async(n=1)=>{for(let i=0;i<n;i++)await gpu.step();refresh(true);},render:()=>renderer.render(1,model.time),inspect:()=>gpu.inspect(),select:choosePoint,setMode,load:loadScenario,stop:()=>{stop=true;cancelAnimationFrame(raf);},get epoch(){return run;}};}catch(e){changing=false;error(e);}}
function setMode(m){if(m==='far'&&isMobile())m='medium';if((mode==='strategy')!==(m==='strategy')){assigning=false;mapPress=null;drag=null;touches.clear();}mode=m;$('strategic').hidden=m!=='strategy';$('battle').classList.toggle('covered',m==='strategy');$('markers').hidden=m==='strategy';for(const k of ['medium','far','strategy'])$(k).classList.toggle('active',k===m);if(renderer&&m!=='strategy')renderer.setMode(m);refresh(true);}
// Battlefield taps and strategic-map drags share only the assignment operation.
function clearOrder(){assigning=false;refresh(true);}
function dispatchOrder(source,destination){
    const from=model?.points[source],point=model?.points[destination];
    if(!from||from.owner!==1||model.result||!model.assign(source,destination)){
        msg('無法指派：可能形成己方循環路線或失去據點。');
        return false;
    }
    if(destination>=0){model.emit(`${from.name} → ${point.name}`);tone(530);msg('派遣目標已更新');}
    else{model.emit(`${from.name} 改為駐守`);tone(280);msg('已設定為駐守');}
    return true;
}
function choosePoint(i){
    const point=model?.points[i];
    if(!point)return;
    if(assigning&&(model.points[selected]?.owner!==1||model.result))assigning=false;
    if(assigning){
        if(dispatchOrder(selected,i===selected?-1:i))assigning=false;
        refresh(true);
        return;
    }
    selected=i;
    assigning=point.owner===1&&!model.result;
    refresh(true);
}
function refresh(force=false){if(!model||!renderer)return;const f=model.factions[1],p=model.points[selected];if(assigning&&(p?.owner!==1||model.result))assigning=false;$('hint').textContent=mode==='strategy'?'從己方據點拖曳至目標派遣・拖回來源駐守':assigning?'點擊其他據點派遣・再點來源駐守・空白處取消選取':(isMobile()?'單指拖曳・雙指旋轉・點據點派遣':'左鍵拖曳平移・右鍵拖曳旋轉・滾輪縮放・Space 切換己方據點');$('resource').textContent=Math.floor(f.money).toLocaleString();$('army').textContent=`${f.alive.toLocaleString()} / ${model.factions.slice(2).reduce((a,x)=>a+x.alive,0).toLocaleString()}`;$('capacity').textContent=`${model.points.filter(q=>q.owner===1).length}/${model.points.length} · ${model.alive}/${model.capacity}`;$('clock').textContent=fmtTime(model.time);$('perf').textContent=`${mode==='strategy'?'—':fps.toFixed(0)} / ${simHz.toFixed(0)}`;$('visible').textContent=mode==='strategy'?'—':`${renderer.counts[0]+renderer.counts[1]} / ${mode==='far'?model.capacity:500}`;
    drawSelected(model,p);
    if(p){const n=model.next(p),own=p.owner===1&&!model.result;$('upgrade').disabled=!own||!n||f.money<n.cost;$('upgrade').textContent=n?`升級 · ${n.cost}`:'已達最高級';$('focus').disabled=false;}else{for(const k of ['upgrade','focus'])$(k).disabled=true;}
    const log=JSON.stringify(model.events.slice(-18));if(lastLog!==log){drawLog(model.events);lastLog=log;}
    if(mode==='strategy')drawMap();else drawMarkers(force);
    const kills=model.factions.slice(1).reduce((a,x)=>a+x.kills,0);if(kills>lastKills){tone(110+Math.min(12,kills-lastKills)*8,.014,.095);lastKills=kills;}
    if(model.result&&!paused){paused=true;$('pause').textContent='繼續';$('end').hidden=false;$('end-title').textContent=model.result==='win'?'戰局勝利':model.result==='lose'?'戰局失敗':'戰局平手';$('end-summary').textContent=`戰鬥時間 ${fmtTime(model.time)}　擊殺 ${f.kills}　戰損 ${f.losses}　控制據點 ${model.points.filter(q=>q.owner===1).length}`;}
}
function drawMarkers(){if(mode!=='strategy')renderMarkers(model,renderer,selected,assigning);}
function drawMap(){const m=model.map,p=model.points,svg=$('map');svg.setAttribute('viewBox',`-2 -2 ${m.w+4} ${m.h+4}`);const svgScale=.85;let h='<defs>';for(let i=0;i<TEAM_COLORS.length;i++)h+=`<marker id="arr${i}" markerWidth="3" markerHeight="3" refX="2.7" refY="1.5" orient="auto"><path d="M0 0L3 1.5L0 3Z" fill="${TEAM_COLORS[i]}"/></marker>`;h+='</defs><rect width="'+m.w+'" height="'+m.h+'" fill="#384d3d"/>';for(const t of model.s.battlefield.terrain??[]){const color={water:'#416c80',bridge:'#95825e',forest:'#243e2d',rock:'#62685a',grass:'#384d3d'}[t.type];h+=t.shape==='circle'?`<circle cx="${t.x}" cy="${t.z}" r="${t.radius}" fill="${color}"/>`:`<rect x="${t.x}" y="${t.z}" width="${t.width}" height="${t.height}" fill="${color}"/>`;}
    for(const a of p){if(a.target<0||!a.owner)continue;const b=p[a.target],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,s=4.4;h+=`<path d="M${a.x+dx/l*s} ${a.z+dz/l*s} Q${(a.x+b.x)/2-dz/l*1.8} ${(a.z+b.z)/2+dx/l*1.8} ${b.x-dx/l*s} ${b.z-dz/l*s}" fill="none" stroke="${TEAM_COLORS[a.owner]}" stroke-width=".62" ${a.owner===1?'':'stroke-dasharray="1.2 .7"'} marker-end="url(#arr${a.owner})" opacity=".92"/>`;}
    for(const a of p){const c=TEAM_COLORS[a.owner],l=model.level(a),sel=a.i===selected;h+=`<g data-point="${a.i}" style="cursor:pointer"><circle cx="${a.x}" cy="${a.z}" r="${a.radius}" fill="${c}" opacity=".08" stroke="${c}" stroke-width=".3"/>${sel?`<circle cx="${a.x}" cy="${a.z}" r="5.6" fill="none" stroke="${assigning?'#fff1a3':'#f3d890'}" stroke-width="${assigning?1.1:.7}"/>`:''}${a.kind==='melee'?`<rect x="${a.x-3.9}" y="${a.z-3.4}" width="7.8" height="6.8" rx=".9" fill="${c}"/>`:`<circle cx="${a.x}" cy="${a.z}" r="3.9" fill="${c}"/>`}<text x="${a.x}" y="${a.z+.9}" text-anchor="middle" font-size="2.7" font-weight="bold" fill="#14201d">${a.id} ${a.kind==='melee'?'M':'R'}</text><text x="${a.x}" y="${a.z+6.1}" text-anchor="middle" font-size="2.25" fill="#f0f3e9">L${a.level} · ${a.garrison}/${a.capacity}</text><text x="${a.x}" y="${a.z+8.8}" text-anchor="middle" font-size="1.9" fill="#cbd8c9">${a.owner?(l.productionCount/l.productionInterval).toFixed(1)+'/s':'—'}${a.target>=0?' → '+p[a.target].id:''}</text>${a.progress>0?`<path d="M${a.x-4} ${a.z-5}h${8*a.progress}" stroke="#f2c76b" stroke-width=".9"/>`:''}<circle cx="${a.x}" cy="${a.z}" r="8.5" fill="transparent"/></g>`;}
    svg.innerHTML=h;drawMapDrag();}
function loop(now){if(stop||changing)return;const elapsed=Math.min(.12,(now-last)/1000);last=now;if(!paused&&!model.result){acc=Math.min(.2,acc+elapsed);if(acc>=DT&&!gpu.busy){acc-=DT;lastTick=now;gpu.step().then(ok=>{if(ok)stepCounter++;}).catch(error);}}
    if(mode!=='strategy'){renderer.render(paused?1:clamp((now-lastTick)/1000/DT,0,1),model.time);drawMarkers();}frameCounter++;if(now-perfStart>=1000){const seconds=(now-perfStart)/1000;fps=frameCounter/seconds;simHz=stepCounter/seconds;perfStart=now;frameCounter=stepCounter=0;}
    if(now-lastUI>150){refresh();lastUI=now;}if(messageUntil&&now>messageUntil){$('status').classList.remove('show');messageUntil=0;}raf=requestAnimationFrame(loop);}
$('medium').onclick=()=>setMode('medium');$('far').onclick=()=>setMode('far');$('strategy').onclick=()=>setMode('strategy');$('pause').onclick=()=>{if(!model||model.result)return;paused=!paused;$('pause').textContent=paused?'繼續':'暫停';acc=0;};$('restart').onclick=()=>loadScenario(scenarioName);$('scenario').onclick=()=>loadScenario(scenarioName==='stress'?primaryScenario:'stress');$('end-restart').onclick=()=>loadScenario(scenarioName);$('end-close').onclick=()=>$('end').hidden=true;
$('upgrade').onclick=()=>{if(model.upgrade(selected)){tone(700);refresh(true);}};$('focus').onclick=()=>{const p=model.points[selected];if(p){if(mode==='strategy')setMode('medium');renderer.focus(p);refresh(true);}};
const mapSvg = $('map');
let mapPress = null;
function mapCoordinates(e) {
    const transform = mapSvg.getScreenCTM();
    if (!transform) return null;
    const p = mapSvg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(transform.inverse());
}
function hitMap(e) {
    // Pointer capture targets the stable SVG, not the child beneath the pointer.
    // Coordinates therefore remain valid across all live SVG redraws.
    const hit = mapCoordinates(e);
    if (!hit) return -1;
    let best = -1, distance = Infinity;
    for (const q of model.points) {
        const d = Math.hypot(hit.x - q.x, hit.y - q.z);
        if (d <= 8.5 && d < distance) { best = q.i; distance = d; }
    }
    return best;
}
function drawMapDrag() {
    // Temporary drag feedback only. Permanent SVG route curves are unchanged.
    let line = mapSvg.querySelector('#drag-preview');
    const press = mapPress;
    const source = press && model.points[press.point];
    if (!press?.moved || !press.cursor || !source || source.owner !== 1 || model.result) {
        line?.remove();
        return;
    }
    if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.id = 'drag-preview';
        line.setAttribute('fill', 'none');
        line.setAttribute('stroke', '#ffe3a3');
        line.setAttribute('stroke-width', '.8');
        line.setAttribute('stroke-dasharray', '1.2 .7');
        line.setAttribute('pointer-events', 'none');
        line.setAttribute('marker-end', 'url(#arr1)');
        mapSvg.append(line);
    }
    line.setAttribute('d', `M${source.x} ${source.z} L${press.cursor.x} ${press.cursor.y}`);
}
mapSvg.addEventListener('pointerdown', e => {
    if (!model || changing || mode !== 'strategy' || mapPress || (e.button ?? 0) !== 0) return;
    const point = hitMap(e);
    mapPress = {id: e.pointerId, x: e.clientX, y: e.clientY, point, moved: false, cursor: null};
    assigning = false;
    if (point >= 0) selected = point;
    e.preventDefault?.();
    mapSvg.setPointerCapture(e.pointerId);
    refresh(true);
});
mapSvg.addEventListener('pointermove', e => {
    if (!mapPress || e.pointerId !== mapPress.id) return;
    if (Math.hypot(e.clientX - mapPress.x, e.clientY - mapPress.y) > 5) mapPress.moved = true;
    mapPress.cursor = mapCoordinates(e);
    drawMapDrag();
});
mapSvg.addEventListener('pointerup', e => {
    if (!mapPress || e.pointerId !== mapPress.id) return;
    const press = mapPress;
    mapPress = null;
    const moved = press.moved || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5;
    const destination = hitMap(e);
    if (mode === 'strategy' && moved && press.point >= 0 && destination >= 0 && model.points[press.point].owner === 1) {
        dispatchOrder(press.point, destination === press.point ? -1 : destination);
    }
    // A tap only selects, and releasing on empty space leaves the old route intact.
    refresh(true);
});
function cancelMapPress(e) {
    if (mapPress?.id === e.pointerId) {
        mapPress = null;
        drawMapDrag();
    }
}
mapSvg.addEventListener('pointercancel', cancelMapPress);
mapSvg.addEventListener('lostpointercapture', cancelMapPress);
$('sound').onclick=async()=>{sound=!sound;if(sound){audio??=new AudioContext();await audio.resume();tone(430);}$('sound').textContent='聲音：'+(sound?'開':'關');};
const canvas=$('battle');
function newDrag(e,button,moved=false){
    const marker = e.target?.closest?.('.marker[data-point]');
    return {id:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY,button,moved,point:marker?Number(marker.dataset.point):-1};
}
function tapBattle(x,y){
    const r=canvas.getBoundingClientRect(),p=renderer.ground(x-r.left,y-r.top);
    let best=-1,d=Infinity;
    for(const q of model.points){
        const k=Math.hypot(p.x-q.x,p.z-q.z);
        if(k<d&&k<q.radius){d=k;best=q.i;}
    }
    if(best>=0)choosePoint(best);else clearOrder();
}
function moveDrag(e){
    if(!drag||drag.id!==e.pointerId)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)<=5)return;
    drag.moved=true;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.button===2)renderer.rotate(dx*.008);
    else{
        const r=canvas.getBoundingClientRect();
        if(r.width>0&&r.height>0)renderer.panPixels(drag.x-r.left,drag.y-r.top,e.clientX-r.left,e.clientY-r.top);
    }
    drag.x=e.clientX;drag.y=e.clientY;
}
function angleOfTouches(){
    const [a,b]=touches.values();
    return Math.atan2(b.clientY-a.clientY,b.clientX-a.clientX);
}
function beginPointer(e){
    if(!renderer||!model||changing||mode==='strategy')return;
    const touch=e.pointerType==='touch',button=e.button??0;
    if(!touch&&button!==0&&button!==2)return;
    if(!touch&&(drag||touches.size))return;
    e.preventDefault?.();canvas.setPointerCapture(e.pointerId);
    if(touch){
        touches.set(e.pointerId,{pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY});
        drag=touches.size===1?newDrag(e,0):null;
    }else drag=newDrag(e,button);
}
canvas.addEventListener('pointerdown',beginPointer);
$('markers').addEventListener('pointerdown',beginPointer);
$('markers').addEventListener('contextmenu',e=>e.preventDefault());
$('markers').addEventListener('wheel',e=>wheelCamera(e),{passive:false});
canvas.addEventListener('pointermove',e=>{
    if(touches.has(e.pointerId)){
        if(touches.size>=2){
            const old=angleOfTouches();
            touches.set(e.pointerId,{pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY});
            const delta=angleOfTouches()-old;
            renderer.rotate(-Math.atan2(Math.sin(delta),Math.cos(delta)));
            return;
        }
        touches.set(e.pointerId,{pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY});
    }
    moveDrag(e);
});
function endPointer(e,cancelled=false){
    if(touches.has(e.pointerId)){
        const multi=touches.size>1;
        touches.delete(e.pointerId);
        if(multi){
            drag=touches.size===1?newDrag(touches.values().next().value,0,true):null;
            return;
        }
    }
    if(!drag||drag.id!==e.pointerId)return;
    const tap=!cancelled&&!drag.moved&&drag.button===0&&Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)<=5;
    const point=drag.point;
    drag=null;
    if(tap){
        if(point>=0)choosePoint(point);
        else tapBattle(e.clientX,e.clientY);
    }
}
canvas.addEventListener('pointerup',e=>endPointer(e));
canvas.addEventListener('pointercancel',e=>endPointer(e,true));
canvas.addEventListener('lostpointercapture',e=>endPointer(e,true));
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function wheelCamera(e){
    e.preventDefault();
    if(!renderer||isMobile()||mode==='strategy'||!e.deltaY)return;
    const target=e.deltaY>0?'far':'medium';
    if(mode!==target)setMode(target);
}
canvas.addEventListener('wheel',wheelCamera,{passive:false});
// Space is the only game keyboard shortcut. Cycling never sends troops.
window.addEventListener('keydown',e=>{
    if(e.code!=='Space'&&e.key!==' ')return;
    if(!renderer||!model||changing)return;
    e.preventDefault();
    if(e.repeat)return;
    const own=model.points.filter(p=>p.owner===1);
    if(!own.length)return;
    const index=own.findIndex(p=>p.i===selected);
    const next=own[(index+1)%own.length];
    selected=next.i;assigning=false;
    if(mode==='strategy')setMode('medium');
    renderer.focus(next);refresh(true);
});
window.addEventListener('blur',()=>{drag=null;mapPress=null;touches.clear();drawMapDrag();});
window.addEventListener('resize',()=>{
    if(!renderer)return;
    $('far').hidden=isMobile();
    if(isMobile()&&mode==='far')setMode('medium');
    renderer.resize();refresh(true);
});
(async()=>{try{({adapter,device}=await getGPU());device.addEventListener('uncapturederror',e=>{e.preventDefault();error(e.error);});device.lost.then(i=>error(new Error('GPU Device 已遺失：'+i.message)));$('device').textContent='WebGPU · '+(adapter.info?.description||adapter.info?.device||adapter.info?.architecture||'GPU 運算');const requested=params.get('scenario')??'conquest';if(!/^[a-zA-Z0-9_-]+$/.test(requested))throw Error('無效戰局名稱');await loadScenario(requested);}catch(e){error(e);}})();
