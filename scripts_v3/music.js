const canvas = document.getElementById("playground");
const panel = document.getElementById("balls");
const ctx = canvas.getContext("2d");
let cx, cy, radius;

//const waveTypes = ["sine", "square", "triangle", "sawtooth"];*/

/*------------------------------------------------------------*\
 * Input : drag
\*------------------------------------------------------------*/
function createBallPanel(ball,index) {
    let li = document.createElement("li");

    let title = document.createElement("div");
    title.textContent = `Ball#${index}: ${ball.waveType}`;
    li.appendChild(title);

    let btn_pause = document.createElement("button");
    btn_pause.textContent = ball.paused ? "Resume" : "Pause";
    btn_pause.addEventListener("click",()=>{
        ball.paused = !ball.paused;
        btn_pause.textContent = ball.paused ? "Resume" : "Pause";
    });
    li.appendChild(btn_pause);

    let btn_remove = document.createElement("button");
    btn_remove.textContent = "Remove";
    btn_remove.addEventListener("click",()=>{
        balls = balls.filter((b)=>{ return b!=ball; });
        panel.removeChild(li);
    });
    li.appendChild(btn_remove);

    panel.appendChild(li);
}

/*------------------------------------------------------------*\
 * Input : drag
\*------------------------------------------------------------*/
let balls = [], currentWaveType = "sine";
let dragStart = null, mouseX = 0, mouseY = 0;

canvas.addEventListener("mousemove", (e) => {
    mouseX = e.offsetX;
    mouseY = e.offsetY;
});

canvas.addEventListener("mousedown", (e) => {
    dragStart = { x: e.offsetX, y: e.offsetY };
});

canvas.addEventListener("mouseup", (e) => {
    if (!dragStart) return;
    const dx = e.offsetX - dragStart.x;
    const dy = e.offsetY - dragStart.y;
    let ball = {
        "x": dragStart.x, "y": dragStart.y,
        "vx": dx * 0.1, "vy": dy * 0.1,
        "waveType": currentWaveType,
        "history": [],
        "paused": false
    };
    console.log(ball);
    createBallPanel(ball,balls.length);
    balls.push(ball);
    dragStart = null;
});

document.addEventListener("keydown", (e) => {
    if (e.key === "q") { currentWaveType = "sine"; }
    if (e.key === "w") { currentWaveType = "square"; }
    if (e.key === "e") { currentWaveType = "triangle"; }
    if (e.key === "r") { currentWaveType = "sawtooth"; }
    if (e.key === " ") {
        balls = [];
        panel.innerHTML = "";
    }
});

/*------------------------------------------------------------*\
 * Setup Notes
\*------------------------------------------------------------*/
let notes = [], angles = [], segmentFlashTimers = [], segmentTextTimers = [];

function setup(inputNotes) {
    notes = inputNotes;
    angles = [0];
    for (let i=1;i<notes.length;i++) {
        angles.push(angles[i-1] + (notes[i-1].angle || 1));
    }
    const total = angles[angles.length-1] + (notes[notes.length-1].angle || 1);
    angles = angles.map(a => a / total * Math.PI * 2);
    segmentFlashTimers = new Array(notes.length).fill(0);
    segmentTextTimers = new Array(notes.length).fill(0);
}

const DEFAULT_NOTES = [
    { mark: "C",  freq: 261.63, color: "#f00" },
    { mark: "C#", freq: 277.18, color: "#f80" },
    { mark: "D",  freq: 293.66, color: "#fa0" },
    { mark: "D#", freq: 311.13, color: "#ff0" },
    { mark: "E",  freq: 329.63, color: "#8f0" },
    { mark: "F",  freq: 349.23, color: "#0f0" },
    { mark: "F#", freq: 369.99, color: "#0f8" },
    { mark: "G",  freq: 392.00, color: "#0ff" },
    { mark: "G#", freq: 415.30, color: "#08f" },
    { mark: "A",  freq: 440.00, color: "#00f" },
    { mark: "A#", freq: 466.16, color: "#80f" },
    { mark: "B",  freq: 493.88, color: "#f0f" }
];

setup(DEFAULT_NOTES);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playNote(freq, velocity = 1, waveType = "sine") {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const duration = 0.4;

    gain.gain.setValueAtTime(velocity * 0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

    osc.frequency.value = freq;
    osc.type = waveType;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function angleToNoteIndex(angle) {
    let a = angle;
    if (a < 0) a += Math.PI * 2;
    for (let i = 0; i < notes.length; i++) {
        const start = angles[i];
        const end = angles[i + 1] || Math.PI * 2;
        if (a >= start && a < end) return i;
    }
    return 0;
}

/*------------------------------------------------------------*\
 * Update
\*------------------------------------------------------------*/
function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let i=0; i < notes.length; i++) {
        const startAngle = angles[i];
        const endAngle = angles[i + 1] || Math.PI * 2;
        const color = notes[i].color;

        if (segmentFlashTimers[i] > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.lineWidth = 10;
            ctx.strokeStyle = color;
            ctx.shadowBlur = 20;
            ctx.shadowColor = color;
            ctx.stroke();
            ctx.shadowBlur = 0;
            segmentFlashTimers[i]--;
        }

        const midAngle = (startAngle + endAngle) / 2;
        const tx = cx + Math.cos(midAngle) * (radius + 40);
        const ty = cy + Math.sin(midAngle) * (radius + 40);
        ctx.fillStyle = "white";
        ctx.font = "bold 18px sans-serif";
        if (segmentTextTimers[i] > 0) {
            ctx.fillStyle = color;
            ctx.font = "bold 24px sans-serif";
            segmentTextTimers[i]--;
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(notes[i].mark, tx, ty);
    }

    for (let ball of balls) {
        ball.history.push({ x: ball.x, y: ball.y });
        if (ball.history.length > 25) ball.history.shift();

        for (let i = 1; i < ball.history.length; i++) {
            const p1 = ball.history[i - 1];
            const p2 = ball.history[i];
            const alpha = i / ball.history.length * 0.5;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        const br = 8; // ball.r

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, br, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();

        if (!ball.paused) {
            ball.x += ball.vx;
            ball.y += ball.vy;
        }

        const dx = ball.x - cx, dy = ball.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist + br >= radius) {
            const normX = dx / dist, normY = dy / dist;
            const dot = ball.vx * normX + ball.vy * normY;
            ball.vx -= 2 * dot * normX;
            ball.vy -= 2 * dot * normY;

            ball.x = cx + normX * (radius - br);
            ball.y = cy + normY * (radius - br);

            const index = angleToNoteIndex(Math.atan2(normY, normX));
            const velocity = Math.sqrt(ball.vx ** 2 + ball.vy ** 2) / 5;
            playNote(notes[index].freq, velocity, ball.waveType);

            segmentFlashTimers[index] = 8;
            segmentTextTimers[index] = 15;
        }
    }

    if (dragStart) {
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(mouseX, mouseY);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();

        const dx = mouseX - dragStart.x;
        const dy = mouseY - dragStart.y;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(mouseX, mouseY);
        ctx.lineTo(
            mouseX - 10 * Math.cos(angle - 0.3),
            mouseY - 10 * Math.sin(angle - 0.3)
        );
        ctx.moveTo(mouseX, mouseY);
        ctx.lineTo(
            mouseX - 10 * Math.cos(angle + 0.3),
            mouseY - 10 * Math.sin(angle + 0.3)
        );
        ctx.stroke();
    }

    requestAnimationFrame(update);
}

/*------------------------------------------------------------*\
 * Update
\*------------------------------------------------------------*/
function initialize() {
    canvas.width = canvas.parentNode.offsetWidth;
    canvas.height = canvas.parentNode.offsetHeight;

    cx = canvas.width / 2;
    cy = canvas.height / 2;
    radius = Math.min(cx, cy) * 0.8;

    update();
}

initialize();
