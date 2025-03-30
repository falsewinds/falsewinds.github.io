import { Point2D, intersect_ray_circle, reflect_ray } from "./geometry.js";

let canvas, ctx, cp = new Point2D(0,0), radius;
let panel, balls = [];
let dragStart = null, mouse = new Point2D(0,0);
let currentBallRadius = 8, currentWaveType = "sine";

const PI2 = Math.PI * 2;

/*------------------------------------------------------------*\
 * NoteArc
\*------------------------------------------------------------*/
let notes = [];
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function getColorForFreq(freq) {
    // 12 半音對應 hue
    const baseFreq = 261.63; // C4
    //const semitoneRatio = Math.pow(2, 1 / 12);
    
    // 計算距離 C4 幾個半音
    const semitones = Math.round(Math.log2(freq / baseFreq) * 12);
    
    const hue = ((semitones % 12 + 12) % 12) * 30; // 每個半音間隔 30 度 (360/12)
    const octave = Math.floor(semitones / 12);
    
    const lightness = 60 + octave * 5;  // 八度越高越亮（可調整）
    return `hsl(${hue}, 100%, ${Math.min(lightness, 90)}%)`;
}

class NoteArc {
    constructor(name, freqency, angleStart, angleEnd) {
        this.name = name;
        this.freqency = freqency;
        this.color = getColorForFreq(freqency);
        this.flashTimer = 0;
        this.textTimer = 0;
        this.angleStart = angleStart;
        this.angleEnd = angleEnd;
        let middle = (angleStart + angleEnd) / 2;
        this.textCenter = cp.clone().add(
            Math.cos(middle) * (radius + 40),
            Math.sin(middle) * (radius + 40)
        );
        notes.push(this);
    }

    play(ball) {
        const volumn = ball.radius / 8 * ball.speed / 5,
            velocity = ball.radius / 8 * ball.speed / 5;
        const baseDuration = Math.max(0.4, 1.5 - velocity * 0.8);
        for (let i=0;i<5;i++) {
            const osc = audioCtx.createOscillator(),
                gain = audioCtx.createGain();
            const delay = i * 0.07,
                decay = Math.pow(0.5, i),
                startTime = audioCtx.currentTime + delay,
                endTime = startTime + baseDuration;
            osc.frequency.value = this.freqency;
            osc.type = ball.waveType;
            gain.gain.setValueAtTime(volumn * 0.2 * decay, startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(startTime);
            osc.stop(endTime);
        }
    }

    draw() {
        // Draw Arc
        if (this.flashTimer>0) {
            ctx.beginPath();
            ctx.arc(cp.x, cp.y, radius, this.angleStart, this.angleEnd);
            ctx.lineWidth = 10;
            ctx.strokeStyle = this.color;
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
            this.flashTimer--;
        }
        // Draw Name
        ctx.fillStyle = this.textTimer > 0 ? this.color : "white";
        ctx.font = this.textTimer > 0 ? "bold 24px sans-serif" : "bold 18px sans-serif";
        this.textTimer--;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.name, this.textCenter.x, this.textCenter.y);
    }

    static PlayByHit(hit,ball) {
        let angle = Math.atan2(hit.y-cp.y,hit.x-cp.x);
        if (angle<0) { angle += PI2; }
        let note = notes.find((it)=>{
            return (it.angleStart<angle) && (it.angleEnd>angle);
        });
        if (note!=null) {
            note.play(ball);
            note.flashTimer = 8;
            note.textTimer = 15;
        }
    }

    static Setup(inputs) {
        let last = 0, div = PI2 / inputs.length;
        inputs.forEach((it)=>{
            let next = last + div;
            new NoteArc(it.mark, it.freq, last, next);
            last = next;
        });
    }
}

const NOTES_12 = [
    { mark: "F#", freq: 369.99 },
    { mark: "E",  freq: 329.63 },
    { mark: "G#", freq: 415.30 },
    { mark: "D",  freq: 293.66 },
    { mark: "A",  freq: 440.00 },
    { mark: "C",  freq: 261.63 },
    { mark: "A#", freq: 466.16 },
    { mark: "C#", freq: 277.18 },
    { mark: "B",  freq: 493.88 },
    { mark: "D#", freq: 311.13 },
    { mark: "G",  freq: 392.00 },
    { mark: "F",  freq: 349.23 }
];

const NOTES_7 = [
    { mark: "F",  freq: 349.23 },
    { mark: "D",  freq: 293.66 },
    { mark: "G",  freq: 392.00 },
    { mark: "E",  freq: 329.63 },
    { mark: "A",  freq: 440.00 },
    { mark: "C",  freq: 261.63 },
    { mark: "B",  freq: 493.88 }
];

const NOTES_SP = [
    { mark: "C",  freq: 261.63 },
    { mark: "E",  freq: 329.63 },
    { mark: "G#", freq: 415.30 },
    { mark: "C",  freq: 523.25 },
    { mark: "A#", freq: 466.16 },
    { mark: "F#", freq: 369.99 },
    { mark: "D",  freq: 293.66 }
];

/*------------------------------------------------------------*\
 * MusicBall
\*------------------------------------------------------------*/
function predictTrajectory(pt,v,r,limit=20) {
    v.normalized();
    const hitRadius = radius - r;
    let hits = [],
        t = intersect_ray_circle(pt,v,cp,hitRadius),
        first = pt.clone().add(v.mul(t)),
        last = first;
    if (t<0) { return []; }
    for(let i=0;i<limit;i++) {
        hits.push(last);
        let n = last.clone().sub(cp).normalized();
        v = reflect_ray(v,n).normalized();
        t = intersect_ray_circle(last,v,cp,hitRadius);
        let next = last.clone().add(v.mul(t));
        if (next.distance2(first)<0.0001) {
            hits.push(first);
            break;
        }
        last = next;
    }
    return hits;
}

class MusicBall {
    constructor(pos,vel,args) {
        args = args || {};

        this.position = Point2D.Create(pos).clone();
        vel = Point2D.Create(vel);
        this.velocity = vel.clone();
        this.speed = vel.length();
        this.radius = currentBallRadius
        this.waveType = currentWaveType;
        this.tracks = [];

        balls.push(this);
        this.name = `Ball#${balls.length}`;
        if (panel!=null) { this.createPanel(); }
    }

    createPanel() {
        let li = document.createElement("li");
        
        let title = document.createElement("div");
        title.textContent = `${this.name}: ${this.waveType}`;
        li.appendChild(title);
    
        let btn_pause = document.createElement("button");
        btn_pause.setAttribute("data-key","pause");
        btn_pause.textContent = "Pause";
        btn_pause.addEventListener("click", () => {
            this.toggle();
        });
        li.appendChild(btn_pause);
    
        let btn_remove = document.createElement("button");
        btn_remove.textContent = "Remove";
        btn_remove.addEventListener("click", () => { this.remove(); });
        li.appendChild(btn_remove);
    
        panel.appendChild(li);
        this.panel = li;
    }

    toggle() {
        let btn_pause = this.panel.querySelector("button[data-key=\"pause\"]");
        if (this.speed==0) {
            btn_pause.textContent = "Pause";
            this.speed = this.saved_speed;
        } else {
            this.saved_speed = this.speed;
            this.speed = 0;
            btn_pause.textContent = "Resume";
        }
    }

    remove() {
        balls = balls.filter((b) => b !== this);
        panel.removeChild(this.panel);
    }

    track(pt) {
        this.tracks.push(pt.clone());
        if (this.tracks.length > 25) { this.tracks.shift(); }
    }

    move() {
        if (this.speed==0) { return; }
        this.track(this.position);
        const hitRadius = radius - this.radius, hr2 = hitRadius * hitRadius;
        let t = intersect_ray_circle(this.position,this.velocity,cp,hitRadius);
        if (t<=0) {
            // TODO: remove ball?
            console.error("hit error!",last,next,cp,hitRadius);
            throw this;
            return;
        }
        if (t<1) {
            let hit = this.position.clone().add(this.velocity.mul(t)),
                norm = hit.clone().sub(cp).normalized(),
                left = this.speed * (1-t),
                new_v = reflect_ray(this.velocity,norm).normalized();
            this.track(hit);
            NoteArc.PlayByHit(hit,this);
            this.velocity.copy(new_v).mul(this.speed);
            this.position = hit.add(new_v.mul(left));
        } else {
            this.position.add(this.velocity);
        }
    }

    draw() {
        if (this.speed==0) {
            // Draw Ball
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.radius, 0, PI2);
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 2;
            ctx.stroke();
            return;
        }
        // Draw tracking
        let last = this.position;
        const tracks = this.tracks.length;
        this.tracks.forEach((p,i)=>{
            const alpha = i / tracks * 0.5;
            ctx.beginPath();
            ctx.moveTo(last.x,last.y);
            ctx.lineTo(p.x,p.y)
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            last = p;
        });
        // Draw Ball
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, PI2);
        ctx.fillStyle = "#fff";
        ctx.fill();
    }
}

/*------------------------------------------------------------*\
 * initialize
\*------------------------------------------------------------*/
function find(e,t) {
    if (e instanceof t) { return c; }
    if (typeof e == "string") { return document.body.querySelector(e); }
    return null;
}

function initialize(c, p) {
    canvas = find(c,HTMLCanvasElement);
    if (canvas==null) {
        console.error("No canvas assigned!",c);
        return;
    }
    ctx = canvas.getContext("2d");
    canvas.width = canvas.parentNode.offsetWidth;
    canvas.height = canvas.parentNode.offsetHeight;
    cp.set(canvas.width/2,canvas.height/2);
    radius = Math.min(cp.x, cp.y) * 0.8;
    let r2 = (radius-10) ** 2;

    canvas.addEventListener("mousedown", (e)=>{
        if (dragStart!=null) { return; }
        mouse.set(e.offsetX,e.offsetY);
        if (cp.distance2(mouse)>r2) { return; }
        dragStart = mouse.clone();
    });
    canvas.addEventListener("mousemove", (e)=>{
        if (dragStart==null) { return; }
        mouse.set(e.offsetX,e.offsetY);
    });
    canvas.addEventListener("mouseup", (e)=>{
        if (dragStart==null) { return; }
        mouse.set(e.offsetX,e.offsetY);
        const v = mouse.clone().sub(dragStart).mul(0.1);
        new MusicBall(dragStart,v);
        dragStart = null;
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "q") currentWaveType = "sine";
        if (e.key === "w") currentWaveType = "square";
        if (e.key === "e") currentWaveType = "triangle";
        if (e.key === "r") currentWaveType = "sawtooth";
        if (e.key === " ") {
            balls = [];
            panel.innerHTML = "";
        }
        if (e.key === "1") currentBallRadius = 4;
        if (e.key === "2") currentBallRadius = 8;
        if (e.key === "3") currentBallRadius = 12;
        if (e.key === "4") currentBallRadius = 16;
    });

    panel = find(p,HTMLUListElement);

    NoteArc.Setup(NOTES_7);
    update();
}

/*------------------------------------------------------------*\
 * update
\*------------------------------------------------------------*/
function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw Music Circle
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, radius, 0, PI2);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Draw Note Arc (s)
    notes.forEach((it)=>{ it.draw(); });
    // Draw Music Ball (s)
    balls.forEach((it)=>{
        it.move();
        it.draw();
    });
    // Draw Helper
    if (dragStart) {
        // Arrow line
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Arrow head
        const d = mouse.clone().sub(dragStart);
        const angle = Math.atan2(d.y, d.x);
        ctx.beginPath();
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(mouse.x - 10 * Math.cos(angle - 0.3), mouse.y - 10 * Math.sin(angle - 0.3));
        ctx.moveTo(mouse.x, mouse.y);
        ctx.lineTo(mouse.x - 10 * Math.cos(angle + 0.3), mouse.y - 10 * Math.sin(angle + 0.3));
        ctx.stroke();
        // prediction
        const prediction = predictTrajectory(dragStart,d,currentBallRadius);
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        prediction.forEach((p) => { ctx.lineTo(p.x, p.y); });
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    requestAnimationFrame(update);
}


export { MusicBall, NoteArc, initialize };