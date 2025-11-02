"use strict";


// ========= 常數 =========
let SR = 48000;
let BPM = 80;

// ========= 全域 AudioContext =========
let ctx = null;
async function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_) {} }
    SR = ctx.sampleRate;
    return ctx;
}


// ========= 工具 =========
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(x, a, b){ return Math.min(b, Math.max(a, x)); }

function _rms(x){ let s=0; for (let i=0;i<x.length;i++) s += x[i]*x[i]; return Math.sqrt(s/Math.max(1,x.length)); }

function db2a(db){ return Math.pow(10, db/20); }

function cents2ratio(c){ return Math.pow(2, c/1200); }

// 產生「很慢、很平滑」的 cents 漫步：rateHz=變化速度、depthCents=幅度
function makeCentsNoiseLFO(rateHz = 1.0, depthCents = 6) {
    // 一階低通白噪聲：每個樣本輸出一個「平滑的 cents」
    let y = 0;
    const a = Math.exp(-2 * Math.PI * rateHz / SR); // SR 請用你的全域取樣率
    return function nextCents() {
        const n = (Math.random() * 2 - 1) * depthCents;
        y = a * y + (1 - a) * n;
        return y;
    };
}

function makeFormantDrifter(baseHz, depthCents = 8, rateHz = 1.0) {
    const lfo = makeCentsNoiseLFO(rateHz, depthCents);
    return function nextHz() {
        return baseHz * cents2ratio(lfo());
    };
}


// ========= Biquad 設計 =========
function norm(b0,b1,b2,a0,a1,a2){ return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0}; }
function biquadBP(f0,Q){ const w=2*Math.PI*f0/SR, a=Math.sin(w)/(2*Q); const b0=a,b1=0,b2=-a,a0=1+a,a1=-2*Math.cos(w),a2=1-a; return norm(b0,b1,b2,a0,a1,a2); }
function biquadHP(f0,Q){ const w=2*Math.PI*f0/SR, a=Math.sin(w)/(2*Q); const b0=(1+Math.cos(w))/2,b1=-(1+Math.cos(w)),b2=(1+Math.cos(w))/2,a0=1+a,a1=-2*Math.cos(w),a2=1-a; return norm(b0,b1,b2,a0,a1,a2); }
function biquadLP(f0,Q){ const w=2*Math.PI*f0/SR, a=Math.sin(w)/(2*Q); const b0=(1-Math.cos(w))/2,b1=1-Math.cos(w),b2=(1-Math.cos(w))/2,a0=1+a,a1=-2*Math.cos(w),a2=1-a; return norm(b0,b1,b2,a0,a1,a2); }
function biquadNotch(f0,Q){ const w=2*Math.PI*f0/SR, a=Math.sin(w)/(2*Q); const b0=1,b1=-2*Math.cos(w),b2=1,a0=1+a,a1=-2*Math.cos(w),a2=1-a; return norm(b0,b1,b2,a0,a1,a2); }

// ========= 串流 biquad（狀態持續）=========
function makeBiquadStream() {
    let x1=0,x2=0,y1=0,y2=0;
    let c = {b0:1,b1:0,b2:0,a1:0,a2:0};
    return {
        setCoeffs(newc){ c = newc; },
        reset(){ x1=0;x2=0;y1=0;y2=0; },
        process(buf){
            for (let i=0;i<buf.length;i++){
                const x = buf[i];
                const y = c.b0*x + c.b1*x1 + c.b2*x2 - c.a1*y1 - c.a2*y2;
                x2=x1; x1=x; y2=y1; y1=y;
                buf[i]=y;
            }
            return buf;
        }
    };
}

// === 就地處理：把濾波套到同一個 Float32Array ===
function biquadProcessInPlace(buf, c) {
    // c 需包含: {b0,b1,b2,a1,a2}（a0 已在 _norm 裡除掉）
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        buf[i] = y;
    }
    return buf;
}


// ========= 簡化的固定 formant（每個 preset 固定三峰）=========
const FORMANTS = {
    "a":[730,1090,2440],
    "i":[270,2290,3010],
    "u":[300, 870,2240],
    "e":[530,1840,2480],
    "o":[450, 900,2600],
    "啊":[730,1090,2440],
    "嗯":[330,1100,2550],
    "哼":[540,1500,2500]
};

// 說話者風格（不硬性代表性別，只是聲學「模板」）
const SPEAKER_STYLE = {
    "adult_male": {
        vtScale: 1.00,       // vocal-tract scale（共振峰倍數）
        rd: 1.45,            // RD-LF 參數（小=緊亮；大=鬆氣）
        brightnessBias: -0.10, // 對 UI 亮度的加減（-0.1 更暗）
        bwMul: 0.90,         // 帶寬倍數（<1 窄、>1 寬）
        formantMix: [0.45, 0.35, 0.20], // F1..F3 權重
        subglottal: { f: 520, Q: 2.0, gainDb: +3 },
        aspHP: 700,          // 氣音上色：高通起點
        aspGain: 0.9
    },
    "adult_female": {
        vtScale: 1.15,
        rd: 1.85,
        brightnessBias: +0.12,
        bwMul: 1.15,
        formantMix: [0.30, 0.35, 0.35],
        subglottal: { f: 650, Q: 2.0, gainDb: 0 },
        aspHP: 1300,
        aspGain: 1.2
    },
    "child": {
        vtScale: 1.30,
        rd: 2.05,
        brightnessBias: +0.18,
        bwMul: 1.25,
        formantMix: [0.25, 0.35, 0.40],
        subglottal: { f: 750, Q: 2.0, gainDb: -2 },
        aspHP: 1800,
        aspGain: 1.3
    }
};

// ========= 說話者縮放 =========
const SPEAKERS = {
    "adult_male":   {scale:1.00, f0:146},
    "adult_female": {scale:1.15, f0:200},
    "child":        {scale:1.30, f0:280},
    "teen_male_post":{scale:1.00, f0:150},
    "teen_female":  {scale:1.08, f0:210}
};




// ========= 聲門（LF-like）+ 開口期噪聲 =========
function lf_like(num, f0, vibHz, vibCents, breathiness){
    const y = new Float32Array(num);
    const Oq = 0.58, Cq = 0.35;
    let phase = 0, prev_g = 0;
    const vibDepth = Math.pow(2, vibCents/1200)-1;
    for (let n=0;n<num;n++){
        const f = f0 * (1 + vibDepth * Math.sin(2*Math.PI*vibHz*(n/SR)));
        const inc = f/SR;
        phase += inc; if (phase>=1) phase -= 1;

        let g=0;
        if (phase < Oq){
            const x = phase/Oq; g = Math.sin(Math.PI*x*0.5);
        } else {
            const x = (phase-Oq)/(1-Oq); g = Math.pow(1-x, 1.0/Cq);
        }
        const openMask = (phase < Oq) ? 1.0 : 0.2;
        const noise = (Math.random()*2-1) * 0.12 * breathiness * openMask;
        const glot = (g - prev_g) + noise; prev_g = g;
        y[n] = glot;
    }
    return y;
}

// ========= 聲門（RD-LF-like）+ 開口期噪聲 =========
function rdToParams(Rd){
    // 實務上 Rd ≈ 0.3..2.7；下面是好調的近似映射
    Rd = clamp(Rd, 0.3, 2.7);
    const Oq = clamp(0.52 + 0.12*(Rd - 1.6), 0.35, 0.85);  // 開口比
    const Cq = clamp(0.27 - 0.10*(Rd - 1.6), 0.08, 0.50);  // 關閉比
    const Rp = clamp(0.10 + 0.25*(2.0 - Rd), 0.00, 0.40);  // 返流（閉合後的微負脈衝）
    return { Oq, Cq, Rp };
}

// 取代原本的 lf_like(...)：同樣回傳 Float32Array
function rdlf_like(num, f0, Rd, vibHz, vibCents, breathiness){
    const y = new Float32Array(num);
    const { Oq, Cq, Rp } = rdToParams(Rd);

    //const vibDepth = cents2ratio(vibCents) - 1;
    // 在迴圈外先建 LFO（放在 rdlf_like(...) 的開頭，n 迴圈之前）
    const driftLFO = makeCentsNoiseLFO( /* rateHz */ 0.6, /* depthCents */ 5 );

    let phase = 0, prev_g = 0;
    for (let n = 0; n < num; n++){
        //const f = Math.max(30, f0) * (1 + vibDepth * Math.sin(2*Math.PI*vibHz*(n/48000)));
        // 迴圈內把顫音與微漂移都用「cents」相加再轉倍數
        const centsVib = vibCents * Math.sin(2 * Math.PI * vibHz * (n / SR));
        const centsAll = centsVib + driftLFO();     // ← 慢慢飄的幾個 cents
        const f = Math.max(30, f0) * cents2ratio(centsAll);
        phase += f/48000; if (phase >= 1) phase -= 1;

        let g;
        if (phase < Oq){                         // 開口期
            const x = phase / Oq;
            g = Math.sin(Math.PI * x * 0.5);
        } else {                                  // 關閉 + 返流
            const x = (phase - Oq) / (1 - Oq);
            g = Math.pow(1 - x, 1.0 / Cq);
            g -= Rp * x * (1 - x);               // 輕微負脈衝，減金屬感
        }

        const openMask = (phase < Oq) ? 1.0 : 0.2; // 僅開口期多一點噪聲
        const noise = (Math.random()*2 - 1) * 0.12 * breathiness * openMask;
        const glot = (g - prev_g) + noise;
        prev_g = g;

        y[n] = glot;
    }
    return y;
}

function buildRdSeries(n, Rd0 = 1.6, envSeries = null, k = -0.6) {
    // envSeries：0..1 的能量/強度（沒有就定值），k<0 表示越大聲 Rd 越小（更緊）
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const e = envSeries ? envSeries[i] : 0.6;
        out[i] = Math.min(2.7, Math.max(0.3, Rd0 + k * e));
    }
    return out;
}

// 原：rdlf_from_f0_series(n, f0Series, Rd, aspirSeries)
// 改：多一個 rdSeries，若沒給就用常數 Rd
function rdlf_from_f0_series(n, f0Series, RdOrSeries, aspirSeries, hp70=true){
    const y = new Float32Array(n);
    let phase = 0, prev_g = 0;
    for (let i=0;i<n;i++){
        const Rd = (RdOrSeries instanceof Float32Array) ? RdOrSeries[i] : RdOrSeries;
        const { Oq, Cq, Rp } = rdToParams(Rd);
        const f = Math.max(30, f0Series[n] || 0);
        phase += f / SR; if (phase >= 1) phase -= 1;
        let g;
        if (phase < Oq){ const x = phase / Oq; g = Math.sin(Math.PI * x * 0.5); }
        else { const x = (phase - Oq) / (1 - Oq); g = Math.pow(1 - x, 1.0 / Cq) - Rp * x * (1 - x); }
        const openMask = (phase < Oq) ? 1.0 : 0.2;
        const noise = (Math.random()*2 - 1) * 0.25 * (aspirSeries[n] || 0) * openMask;
        const glot = (g - prev_g) + noise; prev_g = g;
        y[n] = glot;
    }
    if (hp70) biquadProcessInPlace(y, biquadHP(70, 0.707));
    return y;
}



function addRandomWalkRd(rdSeries, depth=0.15, rateHz=4){
    // 每 ~SR/rateHz 個樣本更新一次目標，做輕微隨機漫步
    const step = Math.max(1, Math.floor(SR / Math.max(0.5, rateHz)));
    let tgt = 0, curr = 0;
    for (let i=0;i<rdSeries.length;i++){
        if (i % step === 0) tgt = (Math.random()*2 - 1) * depth;
        curr += (tgt - curr) * 0.1;
        rdSeries[i] = Math.min(2.7, Math.max(0.3, rdSeries[i] + curr));
    }
}

function applyF1F0CouplingInCents(f0CentsSeries, f0BaseHz, F1SeriesOrHz, strength=35, widthHz=120){
    // 當 f0 靠近 F1，往外推/拉（strength: 最大偏移 cents）
    for (let i=0;i<f0CentsSeries.length;i++){
        const F1 = (F1SeriesOrHz instanceof Float32Array) ? F1SeriesOrHz[i] : F1SeriesOrHz;
        const f0 = f0BaseHz * Math.pow(2, f0CentsSeries[i]/1200);
        const d = (F1 - f0);
        const w = Math.exp(- (d*d) / (2*widthHz*widthHz));
        const sign = (d>0 ? -1 : +1); // 在 F1 下方→拉高；上方→拉低
        f0CentsSeries[i] += sign * strength * w;
    }
}

// 1) 輸出前做防混疊低通（把頭頂留一點安全距）
function applyAntiAliasLP(buf) {
    const cut = Math.max(4000, 0.45 * SR); // SR=44100 → ~19.8k；SR=48000 → ~21.6k
    biquadProcessInPlace(buf, biquadLP(cut, 0.707));
}

// 2) 氣音「上色 + 門控」：只在開口期 & 有能量時出現，且高通以免低頻轟
function addBreathColoredInPlace(buf, gateSrc, hpHz = 1200, amount = 0.10) {
    if (amount <= 1e-4) return;
    const n = new Float32Array(buf.length);
    for (let i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1);
    biquadProcessInPlace(n, biquadHP(hpHz, 0.707));   // 氣音不要帶低頻
    // 3ms AR 門控（整流+低通），用聲門或輸出當 gate
    const gate = new Float32Array(buf.length);
    let env = 0, a = Math.exp(-1.0 / (SR * 0.003));
    for (let i = 0; i < buf.length; i++) {
        const x = Math.abs(gateSrc ? gateSrc[i] : buf[i]);
        env = a * env + (1 - a) * x;
        buf[i] += amount * 0.12 * env * n[i];
    }
}

// 3) 係數平滑（把上一幀與這一幀的濾波結果做 6–10ms crossfade，消除 zipper）
function crossfadeFilterSliceInPlace(slice, coeffPrev, coeffNext) {
    const a = new Float32Array(slice), b = new Float32Array(slice);
    biquadProcessInPlace(a, coeffPrev);
    biquadProcessInPlace(b, coeffNext);
    const L = slice.length, K = Math.min(L, Math.floor(SR * 0.010));
    // 前 K 個樣本從 prev 漸轉 next，其餘直接用 next
    for (let i = 0; i < K; i++) {
        const w = i / Math.max(1, K - 1);
        slice[i] = a[i] * (1 - w) + b[i] * w;
    }
    for (let i = K; i < L; i++) slice[i] = b[i];
}

function applySubglottal(buf, fHz, Q=2.0, gainDb=0){
    if (!isFinite(fHz) || fHz <= 0) return;
    const g = db2a(gainDb || 0);
    const tmp = new Float32Array(buf);
    biquadProcessInPlace(tmp, biquadBP(fHz, Q));
    for (let i=0;i<buf.length;i++) buf[i] += g * tmp[i];
}

// 在 src（聲門）上額外疊一層「開口期氣音」並做高通，讓女性/兒童更「空氣」
function addAspColoredToSrc(src, gateSrc, hpHz=1200, amount=0.10){
    if (amount <= 1e-4) return;
    const n = new Float32Array(src.length);
    for (let i=0;i<n.length;i++) n[i] = (Math.random()*2 - 1);
    biquadProcessInPlace(n, biquadHP(hpHz, 0.707));
    // 簡單門控：用 gateSrc 的包絡（若沒有就用 src 本身）
    const gsrc = gateSrc || src;
    let env = 0, a = Math.exp(-1.0/(48000*0.003));
    for (let i=0;i<src.length;i++){
        env = a*env + (1-a)*Math.abs(gsrc[i]);
        src[i] += amount * env * 0.12 * n[i];
    }
}



// ========= 傾斜（亮度）=========
const tiltHP = makeBiquadStream();
const tiltLP = makeBiquadStream();
const nasalBP = makeBiquadStream();
function apply_tilt_inplace(buf, brightness){
    // brightness: 0(暗, 強LP) ~ 1(亮, 強HP)
    const hp = new Float32Array(buf);
    const lp = new Float32Array(buf);
    tiltHP.setCoeffs(biquadHP(800, 0.707));
    tiltLP.setCoeffs(biquadLP(8000, 0.707));
    tiltHP.process(hp);
    tiltLP.process(lp);
    for (let i=0;i<buf.length;i++){
        buf[i] = brightness*hp[i] + (1-brightness)*lp[i];
    }
}


// ========= 鼻化處理（持續狀態）=========
const nasalNotch = makeBiquadStream();
function apply_nasal_inplace(buf, nasality, speakerScale, isM){
    if (nasality <= 0.0001) return;
    nasalBP.setCoeffs(biquadBP(300*speakerScale, 3.0));
    nasalBP.process(buf);
    if (isM){
        nasalNotch.setCoeffs(biquadNotch(800*speakerScale, 4.0));
    } else {
        nasalNotch.setCoeffs(biquadNotch(3000*speakerScale, 5.0));
    }
    // notch 可疊兩次加深
    nasalNotch.process(buf);
    if (nasality > 0.5) nasalNotch.process(buf);
}

function applyOralNasalMixInPlace(oral, mix01, speakerScale){
    // mix01: 0=純口腔；1=純鼻腔。建議給 (nasality^0.6)*0.9
    const mix = clamp(mix01, 0, 1);
    if (mix <= 0.0001) return;

    const nasal = new Float32Array(oral);

    // 鼻腔主峰（~250–300 Hz）+ 帶寬偏寬
    const Np = 300 * speakerScale;
    biquadProcessInPlace(nasal, biquadBP(Np, Math.max(2.0, Np/120)));

    // 經典反共振：~800 Hz 與 ~2.7–3 kHz
    biquadProcessInPlace(nasal, biquadNotch(800 * speakerScale, 6.0));
    biquadProcessInPlace(nasal, biquadNotch(2800 * speakerScale, 5.0));

    // 鼻音偏暗一點
    biquadProcessInPlace(nasal, biquadLP(5000, 0.707));

    // 能量對齊，避免一混就忽大忽小
    const r_oral = _rms(oral) || 1e-6;
    const r_nasal = _rms(nasal) || 1e-6;
    const g = r_oral / r_nasal;
    for (let i=0;i<nasal.length;i++) nasal[i] *= g;

    // 交叉淡入
    for (let i=0;i<oral.length;i++) {
        oral[i] = (1 - mix)*oral[i] + mix*nasal[i];
    }
}

// 多頻帶非週期性（把「太乾淨」的嗡鳴打散）
function addAperiodicNoiseBands(buf, gateSrc, ap=[0.05,0.12,0.20,0.28]){
    // ap：四段噪聲權重，約對應 ~0.8k、2.2k、4.5k、6k+ 以上
    if (!ap || ap.length === 0) return;

    // 做個簡單能量門控（整流 + 3ms 低通）
    const gate = new Float32Array(buf.length);
    let prev = 0;
    const alpha = Math.exp(-1.0/(48000 * 0.003));
    for (let i=0;i<buf.length;i++){
        const x = Math.abs(gateSrc[i] || 0);
        prev = alpha*prev + (1-alpha)*x;
        gate[i] = prev;
    }

    const bands = [
        { kind:"bp", f: 800,  Q:1.1, a: ap[0] || 0 },
        { kind:"bp", f: 2200, Q:1.2, a: ap[1] || 0 },
        { kind:"bp", f: 4500, Q:1.2, a: ap[2] || 0 },
        { kind:"hp", f: 6000, Q:0.707, a: ap[3] || 0 }
    ];

    for (const b of bands){
        if (b.a <= 1e-4) continue;
        const n = new Float32Array(buf.length);
        for (let i=0;i<n.length;i++) n[i] = (Math.random()*2 - 1);
        if (b.kind === "bp") biquadProcessInPlace(n, biquadBP(b.f, b.Q));
        else                 biquadProcessInPlace(n, biquadHP(b.f, b.Q));
        for (let i=0;i<buf.length;i++){
            buf[i] += b.a * gate[i] * 0.08 * n[i];
        }
    }
}

// 斷音修正: 尾端淡出（cosine 窗）
function applyTailFade(buf, tailMs = 30) {
    const m = Math.min(buf.length, Math.floor(SR * tailMs / 1000));
    if (m <= 1) return;
    for (let i = 0; i < m; i++) {
        // 由 1 漸變到 0 的半餘弦窗
        const w = 0.5 * (1 + Math.cos(Math.PI * i / (m - 1)));
        buf[buf.length - m + i] *= w;
    }
}

// 斷音修正: 最少 N 週期的釋放（避免停在半週期）
function ensureMinReleaseCycles(buf, f0, baseTailMs = 30, minCycles = 4) {
    const tailByMs = Math.floor(SR * baseTailMs / 1000);
    const spc = Math.max(1, Math.floor(SR / Math.max(30, f0))); // samples per cycle
    const tailByCycles = spc * minCycles;
    const tailSamples = Math.max(tailByMs, tailByCycles);
    applyTailFade(buf, 1000 * tailSamples / SR);
}

// 斷音修正: 尾端對齊最近的過零點（可選，加在 1/2 之後）
function snapEndToZeroCross(buf, searchMs = 12) {
    const L = buf.length;
    const K = Math.min(L - 2, Math.floor(SR * searchMs / 1000));
    let pos = -1;
    for (let i = L - 2; i >= L - 1 - K; i--) {
        const a = buf[i], b = buf[i + 1];
        if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) { pos = i + 1; break; }
    }
    if (pos >= 0) {
        const R = Math.min(L - pos, Math.floor(SR * 0.005)); // 5ms 小淡出
        for (let j = 0; j < R; j++) {
            const w = 1 - j / Math.max(1, R - 1);
            buf[pos + j] *= w;
        }
        for (let j = pos + R; j < L; j++) buf[j] = 0;
    }
}


// ========= 主流程：產生並播放 =========
function renderSegmentHz(f0, dur, settings) {
    const name = settings.preset;
    const style = SPEAKER_STYLE[settings.speaker] || SPEAKER_STYLE["adult_male"];
    const intensity = settings.intensity;
    const brightness = settings.brightness;
    const brightnessEff = Math.min(1, Math.max(0, brightness + style.brightnessBias));
    const breathiness = settings.breathiness;
    const nasality = settings.nasality;
    const vibHz = settings.vibHz || 5.5;
    const vibCents = settings.vibCents || 20;

    const n = Math.floor(SR*dur);

    // 1) 聲源
    let src;
    if (settings.source=="RDLF") {
        src = rdlf_like(n, f0, style.rd, vibHz, vibCents, breathiness);
    } else {
        src = lf_like(n, f0, vibHz, vibCents, breathiness);
    }
    // 1.1) 追加「氣音上色」（男女差在這裡就會立刻聽到）
    addAspColoredToSrc(src, src, style.aspHP, (style.aspGain||1.0) * (0.08 + 0.18*breathiness));

    // 2) 三個 formant（並聯求和，避免級聯過窄）
    //const F = (FORMANTS[name] || FORMANTS["a"]).map(v => v*sp.scale);
    const Fraw = (FORMANTS[name] || FORMANTS["a"]);
    const F = [Fraw[0]*style.vtScale, Fraw[1]*style.vtScale, Fraw[2]*style.vtScale];
    // 帶寬隨強度放寬（越大聲越亮越寬）
    const B1 = 100 + 40*intensity, B2 = 140 + 50*intensity, B3 = 220 + 70*intensity;
    // 帶寬：Q 乘以 1/style.bwMul（bwMul>1 → Q 變小、更寬）
    const Q1 = Math.max(2.5, (F[0]/Math.max(60,B1)) / style.bwMul);
    const Q2 = Math.max(3.0, (F[1]/Math.max(80,B2)) / style.bwMul);
    const Q3 = Math.max(3.5, (F[2]/Math.max(120,B3)) / style.bwMul);

    const f1 = new Float32Array(src); const f2 = new Float32Array(src); const f3 = new Float32Array(src);
    const frame = Math.floor(SR * 0.02); // 每 20ms 更新一次
    const Fbase = (FORMANTS[name] || FORMANTS["a"]).map(v => v * style.vtScale);

    // 為三個 formant 建立 drifter（不同幅度更自然）
    const F1d = makeFormantDrifter(Fbase[0], /*depth*/ 6,  /*rate*/ 0.8);
    const F2d = makeFormantDrifter(Fbase[1], /*depth*/ 10, /*rate*/ 0.9);
    const F3d = makeFormantDrifter(Fbase[2], /*depth*/ 16, /*rate*/ 1.0);

    const bp1 = makeBiquadStream(), bp2 = makeBiquadStream(), bp3 = makeBiquadStream();
    for (let s = 0; s < n; s += frame) {
        const e = Math.min(n, s + frame);

        // 這裡只更新係數，不重置狀態
        const F1 = F1d(), F2 = F2d(), F3 = F3d();
        const Q1 = Math.max(2.5, F1 / Math.max(60, B1)) / style.bwMul;
        const Q2 = Math.max(3.0, F2 / Math.max(80, B2)) / style.bwMul;
        const Q3 = Math.max(3.5, F3 / Math.max(120, B3)) / style.bwMul;

        bp1.setCoeffs(biquadBP(F1, Q1));
        bp2.setCoeffs(biquadBP(F2, Q2));
        bp3.setCoeffs(biquadBP(F3, Q3));

        // 各自處理該段，最後再混合
        bp1.process(f1.subarray(s, e));
        bp2.process(f2.subarray(s, e));
        bp3.process(f3.subarray(s, e));
    }


    const y = new Float32Array(n);
    //for (let i=0;i<n;i++) y[i] = (f1[i] + f2[i] + f3[i]) / 3;
    // 並聯濾波後用「風格化權重」混合（男性偏 F1、女性/兒童偏 F3）
    const w = style.formantMix || [1/3,1/3,1/3];
    for (let i=0;i<n;i++) y[i] = w[0]*f1[i] + w[1]*f2[i] + w[2]*f3[i];

    // 3) 鼻化與亮度：鼻化請用你前面做的「平行鼻腔混合」版；亮度用偏置後值
    //apply_nasal_inplace(y, nasality, sp.scale, (name==="嗯"));
    const nasalMix = Math.pow(nasality, 0.6) * 0.9; // 比直線更有感
    applyOralNasalMixInPlace(y, nasalMix, style.vtScale);
    apply_tilt_inplace(y, brightnessEff);

    // 4) 加上「次聲道共振」：男性 520Hz、女性 650Hz、兒童 750Hz
    applySubglottal(y, style.subglottal.f, style.subglottal.Q, style.subglottal.gainDb);

    // 5) 包絡（避免咔嗒）
    const atk = 0.012, rel = 0.16;
    const a = Math.floor(SR*atk), r = Math.floor(SR*rel);
    for (let i=0;i<a && i<n;i++) y[i] *= i/Math.max(1,a);
    for (let i=0;i<r && i<n;i++) y[n-1-i] *= 1 - i/Math.max(1,r);

    // 6) 音量（強度影響總增益）
    let sum=0; for (let i=0;i<n;i++) sum += y[i]*y[i];
    const rms = Math.sqrt(sum/Math.max(1,n));
    const target = 0.20 + 0.25*intensity; // 0.2..0.45
    const g = (rms>0? target/rms : 1.0);
    for (let i=0;i<n;i++) y[i] = Math.tanh(y[i]*g*1.5);

    // 7)
    addAperiodicNoiseBands(y, src, [
        0.04 + 0.10*breathiness,   // ~0.8k
        0.10 + 0.15*breathiness,   // ~2.2k
        0.16 + 0.18*breathiness,   // ~4.5k
        0.20 + 0.22*breathiness    // >6k
    ]);

    // 8) 修掉結尾中斷感
    ensureMinReleaseCycles(y, f0, 50, 4);  // 至少 4 個基頻週期 + 30ms 淡出，誰長用誰
    snapEndToZeroCross(y, 12);             // 可選：往回 12ms 找最近零交再補 5ms 淡出

    // 9) 在 Nyquist 以下留一點安全距
    const antiAliasCut = Math.max(4000, 0.45 * SR); // SR=44100 → ~19.8k；SR=48000 → ~21.6k
    biquadProcessInPlace(y, biquadLP(antiAliasCut, 0.707));

    return y;
}

async function playOnce(settings){
    await ensureCtx();
    const sp = SPEAKERS[settings.speaker];
    const dur = Math.max(0.05, settings.duration || 1.2);
    const f0 = Math.max(30, settings.f0 || sp.f0);

    const name = settings.preset;
    const style = SPEAKER_STYLE[settings.speaker] || SPEAKER_STYLE["adult_male"];
    const intensity = settings.intensity;
    const brightness = settings.brightness;
    const brightnessEff = Math.min(1, Math.max(0, brightness + style.brightnessBias));
    const breathiness = settings.breathiness;
    const nasality = settings.nasality;
    const vibHz = settings.vibHz || 5.5;
    const vibCents = settings.vibCents || 20;

    const n = Math.floor(SR*dur);

    // 1) 聲源
    let src;
    if (settings.source=="RDLF") {
        src = rdlf_like(n, f0, style.rd, vibHz, vibCents, breathiness);
    } else {
        src = lf_like(n, f0, vibHz, vibCents, breathiness);
    }
    // 1.1) 追加「氣音上色」（男女差在這裡就會立刻聽到）
    addAspColoredToSrc(src, src, style.aspHP, (style.aspGain||1.0) * (0.08 + 0.18*breathiness));

    // 2) 三個 formant（並聯求和，避免級聯過窄）
    const Fraw = (FORMANTS[name] || FORMANTS["a"]);
    const F = [Fraw[0]*style.vtScale, Fraw[1]*style.vtScale, Fraw[2]*style.vtScale];
    // 帶寬隨強度放寬（越大聲越亮越寬）
    const B1 = 100 + 40*intensity, B2 = 140 + 50*intensity, B3 = 220 + 70*intensity;
    // 帶寬：Q 乘以 1/style.bwMul（bwMul>1 → Q 變小、更寬）
    const Q1 = Math.max(2.5, (F[0]/Math.max(60,B1)) / style.bwMul);
    const Q2 = Math.max(3.0, (F[1]/Math.max(80,B2)) / style.bwMul);
    const Q3 = Math.max(3.5, (F[2]/Math.max(120,B3)) / style.bwMul);

    const f1 = new Float32Array(src); const f2 = new Float32Array(src); const f3 = new Float32Array(src);
    const frame = Math.floor(SR * 0.02); // 每 20ms 更新一次
    const Fbase = (FORMANTS[name] || FORMANTS["a"]).map(v => v * style.vtScale);

    // 為三個 formant 建立 drifter（不同幅度更自然）
    const F1d = makeFormantDrifter(Fbase[0],  6, 0.8);
    const F2d = makeFormantDrifter(Fbase[1], 10, 0.9);
    const F3d = makeFormantDrifter(Fbase[2], 16, 1.0);

    const bp1 = makeBiquadStream(), bp2 = makeBiquadStream(), bp3 = makeBiquadStream();
    for (let s = 0; s < n; s += frame) {
        const e = Math.min(n, s + frame);

        // 這裡只更新係數，不重置狀態
        const F1 = F1d(), F2 = F2d(), F3 = F3d();
        const Q1 = Math.max(2.5, F1 / Math.max(60, B1)) / style.bwMul;
        const Q2 = Math.max(3.0, F2 / Math.max(80, B2)) / style.bwMul;
        const Q3 = Math.max(3.5, F3 / Math.max(120, B3)) / style.bwMul;

        bp1.setCoeffs(biquadBP(F1, Q1));
        bp2.setCoeffs(biquadBP(F2, Q2));
        bp3.setCoeffs(biquadBP(F3, Q3));

        // 各自處理該段，最後再混合
        bp1.process(f1.subarray(s, e));
        bp2.process(f2.subarray(s, e));
        bp3.process(f3.subarray(s, e));
    }


    const y = new Float32Array(n);
    //for (let i=0;i<n;i++) y[i] = (f1[i] + f2[i] + f3[i]) / 3;
    // 並聯濾波後用「風格化權重」混合（男性偏 F1、女性/兒童偏 F3）
    const w = style.formantMix || [1/3,1/3,1/3];
    for (let i=0;i<n;i++) y[i] = w[0]*f1[i] + w[1]*f2[i] + w[2]*f3[i];

    // 3) 鼻化與亮度：鼻化請用你前面做的「平行鼻腔混合」版；亮度用偏置後值
    //apply_nasal_inplace(y, nasality, sp.scale, (name==="嗯"));
    const nasalMix = Math.pow(nasality, 0.6) * 0.9; // 比直線更有感
    applyOralNasalMixInPlace(y, nasalMix, style.vtScale);
    apply_tilt_inplace(y, brightnessEff);

    // 4) 加上「次聲道共振」：男性 520Hz、女性 650Hz、兒童 750Hz
    applySubglottal(y, style.subglottal.f, style.subglottal.Q, style.subglottal.gainDb);

    // 5) 包絡（避免咔嗒）
    const atk = 0.012, rel = 0.16;
    const a = Math.floor(SR*atk), r = Math.floor(SR*rel);
    for (let i=0;i<a && i<n;i++) y[i] *= i/Math.max(1,a);
    for (let i=0;i<r && i<n;i++) y[n-1-i] *= 1 - i/Math.max(1,r);

    // 6) 音量（強度影響總增益）
    let sum=0; for (let i=0;i<n;i++) sum += y[i]*y[i];
    const rms = Math.sqrt(sum/Math.max(1,n));
    const target = 0.20 + 0.25*intensity; // 0.2..0.45
    const g = (rms>0? target/rms : 1.0);
    for (let i=0;i<n;i++) y[i] = Math.tanh(y[i]*g*1.5);

    // 7)
    addAperiodicNoiseBands(y, src, [
        0.04 + 0.10*breathiness,   // ~0.8k
        0.10 + 0.15*breathiness,   // ~2.2k
        0.16 + 0.18*breathiness,   // ~4.5k
        0.20 + 0.22*breathiness    // >6k
    ]);

    // 8) 修掉結尾中斷感
    ensureMinReleaseCycles(y, f0, 50, 4);  // 至少 4 個基頻週期 + 30ms 淡出，誰長用誰
    snapEndToZeroCross(y, 12);             // 可選：往回 12ms 找最近零交再補 5ms 淡出

    // 9) 在 Nyquist 以下留一點安全距
    //const antiAliasCut = Math.max(4000, 0.45 * SR); // SR=44100 → ~19.8k；SR=48000 → ~21.6k
    //biquadProcessInPlace(y, biquadLP(antiAliasCut, 0.707));
    applyAntiAliasLP(y);

    // 10) 播放（由瀏覽器負責 SRC）
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    buf.getChannelData(0).set(y);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    node.connect(gain).connect(ctx.destination);
    node.start();
}

// ========= Test Beep =========
async function testBeep(){
    await ensureCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain(); g.gain.value = 0.2;
    osc.type = "sine"; osc.frequency.value = 880;
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
    document.getElementById("log").textContent = `Beep OK · sampleRate=${ctx.sampleRate}`;
}

// 12-TET（A4=440）。可改 a4 變調（例如 442）。
const A4 = 220;
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

function f0ToMidi(f0, a4 = A4) {
    return 69 + 12 * Math.log2(f0 / a4);
}
function midiToFreq(midi, a4 = A4) {
    return a4 * Math.pow(2, (midi - 69) / 12);
}
function freqToNoteName(f0, a4 = A4) {
    if (!isFinite(f0) || f0 <= 0) return { note: "—", cents: 0, midi: NaN };
    const m = f0ToMidi(f0, a4);
    const mRound = Math.round(m);
    const name = NOTE_NAMES[(mRound % 12 + 12) % 12];
    const octave = Math.floor(mRound / 12) - 1;
    const cents = Math.round((m - mRound) * 100);
    return { note: `${name}${octave}`, cents, midi: m };
}


// 解析 "C#4" / "Db3" / "A4" → Hz；也可直接給數字（Hz）
const _IDX = {C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
function noteToFreq(note, a4 = A4) {
    if (typeof note === "number") return note;
    const m = note.match(/^([A-Ga-g])([#b]?)(-?\d{1,2})$/);
    if (!m) throw new Error(`Bad note: ${note}`);
    const name = (m[1].toUpperCase() + m[2]);
    const oct = parseInt(m[3], 10);
    const idx = _IDX[name];
    const midi = 12 * (oct + 1) + idx; // C4=60
    return midiToFreq(midi, a4);
}

// 連續哼唱：melody = [ ["C4",0.4], ["D4",0.4], ... ] 或 [ [261.63,0.4], ... ]
async function playMelody(melody, settings) {
    await ensureCtx();

    // 逐段渲染並用 8ms 交疊拼接
    const overlapMs = 10, OL = Math.floor(SR * overlapMs / 1000);
    let out = new Float32Array(0);

    for (const [note, dur] of melody) {
        const f0 = noteToFreq(note);
        const seg = renderSegmentHz(f0, dur, settings);

        const merged = new Float32Array(out.length + seg.length - (out.length ? OL : 0));
        if (out.length === 0) {
            merged.set(seg, 0);
        } else {
            merged.set(out.slice(0, out.length - OL), 0);
            // 線性交疊
            for (let i=0;i<OL;i++) {
                const w = i / Math.max(1, OL-1);
                const a = out[out.length - OL + i] * (1 - w);
                const b = seg[i] * w;
                merged[out.length - OL + i] = a + b;
            }
            merged.set(seg.slice(OL), out.length);
        }
        out = merged;
    }

    // 頭尾淡入/出（避免整條的硬邊）
    const head = Math.floor(SR * 0.012), tail = Math.floor(SR * 0.050);
    for (let i=0;i<head && i<out.length;i++) out[i] *= i/Math.max(1,head);
    for (let i=0;i<tail && i<out.length;i++) out[out.length-1-i] *= 1 - i/Math.max(1,tail);

    // 播放
    const buf = ctx.createBuffer(1, out.length, ctx.sampleRate);
    buf.getChannelData(0).set(out);
    const node = ctx.createBufferSource();
    const gain = ctx.createGain(); gain.gain.value = 1.0;
    node.buffer = buf; node.connect(gain).connect(ctx.destination);
    node.start();

    // 顯示第一個音名稱供確認
    const firstF0 = noteToFreq(melody[0][0]);
    const pitch = freqToNoteName(firstF0);
    /*document.getElementById("log").textContent =
        `Melody: ${melody.length} notes · first≈${pitch.note} (${pitch.cents>=0?"+":""}${pitch.cents}c) · overlap=${overlapMs}ms`;*/
}


// Export
export { playOnce, testBeep, playMelody };