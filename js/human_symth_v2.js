"use strict";

/**
 * human_symth.js
 * 高擬真非語言/母音人聲合成（WebAudio · ES Module）
 * - RD-LF++ 聲源（能量相依/隨機漫步 Rd、連續 vibrato、微漂移）
 * - 平行鼻腔混音、次聲道共振、傾斜（亮度）、多頻帶非週期性、Nyquist 防護
 * - Formant 漫步（10–20ms 更新）+ 係數 crossfade（消除 zipper noise）
 * - Voice Profile + humanize（同為成年女性也可區分多把音色）
 * - PRESETS（a/i/u/e/o/m 及 欸/咦/啊！/喔！/嗯/哼/尖叫/呻吟/嘆氣）
 * - playOnce / playMelody / testBeep
 */

// ============================== 全域與環境 ==============================

/** 取樣率（建立/恢復 AudioContext 後會同步為 ctx.sampleRate） */
let SR = 48000;
/** 全域 AudioContext 實例 */
let ctx = null;
/** 全域 vibrato 相位（確保跨音連續，不會換音就重置） */
let __vibPhase = 0;

/**
 * 確保有 AudioContext，並同步 SR（sampleRate）
 */
export async function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch (_) {}
    }
    SR = ctx.sampleRate;
    return ctx;
}

// ============================== 小工具 ==============================

/** 限制 x 範圍在 [a,b] */
function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
/** 線性插值 */
function lerp(a, b, t) { return a + (b - a) * t; }
/** dB → 振幅 */
function db2a(db) { return Math.pow(10, db / 20); }
/** 12-TET：cents → 倍率 */
function cents2ratio(c) { return Math.pow(2, c / 1200); }
/** 簡易 RNG（可重現） */
function makeRng(seed = 1) { let s = (seed >>> 0) || 1; return () => (s = (1664525 * s + 1013904223) >>> 0, (s & 0xffff) / 65536); }
/** 陣列 RMS */
function rms(buf) { let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / Math.max(1, buf.length)); }

/**
 * piecewise 線性曲線取值（可處理 y 值為標量或固定長度陣列）
 * curve: [ [t0,val0], [t1,val1], ... ]；t 為 0..1
 */
function linAt(t, curve) {
    if (!curve || !curve.length) return 0;
    if (t <= curve[0][0]) return curve[0][1];
    if (t >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
    for (let i = 0; i < curve.length - 1; i++) {
        const [t0, v0] = curve[i], [t1, v1] = curve[i + 1];
        if (t0 <= t && t <= t1) {
            const u = (t - t0) / (t1 - t0);
            if (Array.isArray(v0)) return v0.map((_, k) => v0[k] + (v1[k] - v0[k]) * u);
            return v0 + (v1 - v0) * u;
        }
    }
    return curve[curve.length - 1][1];
}

/** 依曲線產生每樣本值（長度 n、t=0..1） */
function buildSeries(n, curve) {
    const a = new Float32Array(n);
    const denom = Math.max(1, n - 1);
    for (let i = 0; i < n; i++) a[i] = linAt(i / denom, curve);
    return a;
}

/** 臨界阻尼式的 ease（比線性滑音更像人） */
function easeCrit(t) {
    const k = 3.0;
    return 1 - (1 + k * t) * Math.exp(-k * t);
}

// ============================== 音高工具 ==============================

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** f0(Hz) → MIDI（A4=440） */
export function f0ToMidi(f0, a4 = 440) { return 69 + 12 * Math.log2(f0 / a4); }
/** MIDI → f0(Hz)（A4=440） */
export function midiToFreq(midi, a4 = 440) { return a4 * Math.pow(2, (midi - 69) / 12); }
/** f0(Hz) → 最接近音名與 cents 誤差 */
export function freqToNoteName(f0, a4 = 440) {
    if (!isFinite(f0) || f0 <= 0) return { note: "—", cents: 0, midi: NaN };
    const m = f0ToMidi(f0, a4);
    const mr = Math.round(m);
    const name = NOTE_NAMES[(mr % 12 + 12) % 12];
    const octave = Math.floor(mr / 12) - 1;
    const cents = Math.round((m - mr) * 100);
    return { note: `${name}${octave}`, cents, midi: m };
}

/** "C#4" / "Db3" / "A4" 或 直接 Hz 數字 → f0(Hz) */
export function noteToFreq(note, a4 = 440) {
    if (typeof note === "number") return note;
    const IDX = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
    const m = note.match(/^([A-Ga-g])([#b]?)(-?\d{1,2})$/);
    if (!m) throw new Error(`Bad note: ${note}`);
    const name = (m[1].toUpperCase() + m[2]);
    const oct = parseInt(m[3], 10);
    const idx = IDX[name];
    const midi = 12 * (oct + 1) + idx; // C4=60
    return midiToFreq(midi, a4);
}

// ============================== Biquad 濾波器 ==============================

/** 把 a0 歸一，回傳 {b0,b1,b2,a1,a2} 係數物件 */
function _norm(b0, b1, b2, a0, a1, a2) { return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }; }

/** RBJ 公式：低通 */
function biquadLP(f0, Q) {
    const w0 = 2 * Math.PI * f0 / SR, cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Q);
    const b0 = (1 - cos) / 2, b1 = 1 - cos, b2 = (1 - cos) / 2, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    return _norm(b0, b1, b2, a0, a1, a2);
}
/** RBJ 公式：高通 */
function biquadHP(f0, Q) {
    const w0 = 2 * Math.PI * f0 / SR, cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Q);
    const b0 = (1 + cos) / 2, b1 = -(1 + cos), b2 = (1 + cos) / 2, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    return _norm(b0, b1, b2, a0, a1, a2);
}
/** RBJ 公式：帶通（常態化峰值） */
function biquadBP(f0, Q) {
    const w0 = 2 * Math.PI * f0 / SR, cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Q);
    const b0 = alpha, b1 = 0, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    return _norm(b0, b1, b2, a0, a1, a2);
}
/** RBJ 公式：Notch */
function biquadNotch(f0, Q) {
    const w0 = 2 * Math.PI * f0 / SR, cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * Q);
    const b0 = 1, b1 = -2 * cos, b2 = 1, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    return _norm(b0, b1, b2, a0, a1, a2);
}

/**
 * 就地 biquad 處理（Direct Form I）
 * 注意：一次性處理整段，不保留狀態。
 */
function biquadProcessInPlace(buf, c) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < buf.length; i++) {
        const x = buf[i];
        const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        buf[i] = y;
    }
    return buf;
}

/**
 * 串流 biquad（保留狀態、每幀只更新係數）
 * 用於 10–20ms 的分段處理，避免每幀重置造成「斷續/重啟」感。
 */
function makeBiquadStream(initialCoeffs) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    let c = initialCoeffs || { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    return {
        setCoeffs(newc) { c = newc; },
        reset() { x1 = x2 = y1 = y2 = 0; },
        process(buf) {
            for (let i = 0; i < buf.length; i++) {
                const x = buf[i];
                const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
                x2 = x1; x1 = x; y2 = y1; y1 = y;
                buf[i] = y;
            }
            return buf;
        },
        c
    };
}

/**
 * 係數過渡 crossfade：把 slice 同時用「前一幀係數」與「下一幀係數」各跑一次，再前 6–10ms 漸變
 * 這能消除 zipper noise
 */
function crossfadeFilterSliceInPlace(slice, coeffPrev, coeffNext, xfadeMs = 10) {
    const a = new Float32Array(slice), b = new Float32Array(slice);
    biquadProcessInPlace(a, coeffPrev);
    biquadProcessInPlace(b, coeffNext);
    const L = slice.length, K = Math.min(L, Math.floor(SR * xfadeMs / 1000));
    for (let i = 0; i < K; i++) {
        const w = i / Math.max(1, K - 1);
        slice[i] = a[i] * (1 - w) + b[i] * w;
    }
    for (let i = K; i < L; i++) slice[i] = b[i];
}

/** Nyquist 保護：輸出前做低通，cut ≈ 0.45 * SR */
function applyAntiAliasLP(buf) {
    const cut = Math.max(4000, 0.45 * SR);
    biquadProcessInPlace(buf, biquadLP(cut, 0.707));
}

// ============================== 聲源：RD-LF++ ==============================

/** Rd → Oq/Cq/Rp 近似映射（可依據文獻調整參數範圍） */
function rdToParams(Rd) {
    Rd = clamp(Rd, 0.3, 2.7);
    const Oq = clamp(0.52 + 0.12 * (Rd - 1.6), 0.35, 0.85); // 開口比
    const Cq = clamp(0.27 - 0.10 * (Rd - 1.6), 0.08, 0.50); // 關閉比
    const Rp = clamp(0.10 + 0.25 * (2.0 - Rd), 0.00, 0.40); // 返流
    return { Oq, Cq, Rp };
}

/**
 * 產生「能量相依 + 隨機漫步」的 Rd 時序
 * envSeries：0..1 的能量（若無則定值 0.6）
 * k < 0 表示越大聲 Rd 越小（更緊/更亮）
 */
function buildRdSeries(n, Rd0 = 1.6, envSeries = null, k = -0.6, rwDepth = 0.12, rwRateHz = 3) {
    const out = new Float32Array(n);
    // 隨機漫步目標每 step 更新，內插平滑
    const step = Math.max(1, Math.floor(SR / Math.max(0.5, rwRateHz)));
    let tgt = 0, curr = 0;
    for (let i = 0; i < n; i++) {
        const e = envSeries ? envSeries[i] : 0.6;
        let rd = clamp(Rd0 + k * e, 0.3, 2.7);
        if (i % step === 0) tgt = (Math.random() * 2 - 1) * rwDepth;
        curr += (tgt - curr) * 0.1;
        out[i] = clamp(rd + curr, 0.3, 2.7);
    }
    return out;
}

/**
 * 連續 vibrato（以 cents 回傳，每次呼叫延續全域相位）
 */
function vibratoCents(nSamples, vibHz, vibCents) {
    const out = new Float32Array(nSamples);
    const inc = 2 * Math.PI * vibHz / SR;
    for (let i = 0; i < nSamples; i++) {
        out[i] = vibCents * Math.sin(__vibPhase);
        __vibPhase += inc;
        if (__vibPhase > 1e9) __vibPhase -= 1e9;
    }
    return out;
}

/**
 * 慢速微漂移（低通白噪），輸出「cents」序列
 */
function makeCentsNoiseLFO(rateHz = 0.6, depthCents = 6) {
    let y = 0;
    const a = Math.exp(-2 * Math.PI * rateHz / SR);
    return () => { y = a * y + (1 - a) * ((Math.random() * 2 - 1) * depthCents); return y; };
}

/**
 * f0 cents 曲線：把 f0 曲線（cents）套到 baseF0 上（含 vibrato 與微漂移）
 */
function buildF0Series(n, baseF0, centsCurve, vibHz, vibCents, driftRate = 0.6, driftDepth = 5) {
    const vib = vibratoCents(n, vibHz, vibCents);
    const driftLFO = makeCentsNoiseLFO(driftRate, driftDepth);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const cents = (centsCurve ? centsCurve[i] : 0) + vib[i] + driftLFO();
        out[i] = baseF0 * cents2ratio(cents);
    }
    return out;
}

/**
 * 輕量 F1↔f0 耦合：當 f0 靠近 F1 時，f0 受到推/拉（更像真嗓）
 * strength：最大偏移（cents），widthHz：影響寬度
 */
function applyF1F0CouplingInCents(f0CentsSeries, f0BaseHz, F1SeriesOrHz, strength = 35, widthHz = 120) {
    for (let i = 0; i < f0CentsSeries.length; i++) {
        const F1 = (F1SeriesOrHz instanceof Float32Array) ? F1SeriesOrHz[i] : F1SeriesOrHz;
        const f0 = f0BaseHz * Math.pow(2, f0CentsSeries[i] / 1200);
        const d = F1 - f0;
        const w = Math.exp(-(d * d) / (2 * widthHz * widthHz));
        const sign = (d > 0 ? -1 : +1);
        f0CentsSeries[i] += sign * strength * w;
    }
}

/**
 * RD-LF 聲源（吃 f0Series、RdSeries、aspirationSeries）
 * - 以 glottal flow 的微分做輻射近似（g - prev_g）
 * - 只在開口期加較多氣音（openMask）
 * - 可選 70 Hz HP，去除 DC 與超低頻漂移
 */
function rdlf_from_series(n, f0Series, RdOrSeries, aspirSeries, hp70 = true) {
    const y = new Float32Array(n);
    let phase = 0, prev_g = 0;
    for (let i = 0; i < n; i++) {
        const f = Math.max(30, f0Series[i] || 0);
        const Rd = (RdOrSeries instanceof Float32Array) ? RdOrSeries[i] : RdOrSeries;
        const { Oq, Cq, Rp } = rdToParams(Rd);
        phase += f / SR; if (phase >= 1) phase -= 1;

        let g;
        if (phase < Oq) {
            const x = phase / Oq;
            g = Math.sin(Math.PI * x * 0.5);
        } else {
            const x = (phase - Oq) / (1 - Oq);
            g = Math.pow(1 - x, 1.0 / Cq) - Rp * x * (1 - x);
        }
        const openMask = (phase < Oq) ? 1.0 : 0.2;
        const asp = aspirSeries ? aspirSeries[i] : 0;
        const noise = (Math.random() * 2 - 1) * 0.25 * asp * openMask;

        const glot = (g - prev_g) + noise;
        prev_g = g;
        y[i] = glot;
    }
    if (hp70) biquadProcessInPlace(y, biquadHP(70, 0.707));
    return y;
}

// ============================== 聲道/上色處理 ==============================

/**
 * 多頻帶非週期性（0.8k / 2.2k / 4.5k / >6k）
 * gateSrc：用聲門或輸出作 3ms 整流低通包絡，門控噪聲
 */
function addAperiodicNoiseBands(buf, gateSrc, ap = [0.05, 0.12, 0.20, 0.28]) {
    if (!ap || !ap.length) return;
    const gate = new Float32Array(buf.length);
    let env = 0, a = Math.exp(-1.0 / (SR * 0.003));
    for (let i = 0; i < buf.length; i++) { env = a * env + (1 - a) * Math.abs(gateSrc[i] || 0); gate[i] = env; }

    const bands = [
        { kind: "bp", f: 800, Q: 1.1, a: ap[0] || 0 },
        { kind: "bp", f: 2200, Q: 1.2, a: ap[1] || 0 },
        { kind: "bp", f: 4500, Q: 1.2, a: ap[2] || 0 },
        { kind: "hp", f: 6000, Q: 0.707, a: ap[3] || 0 }
    ];
    for (const b of bands) {
        if (b.a <= 1e-4) continue;
        const n = new Float32Array(buf.length);
        for (let i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1);
        if (b.kind === "bp") biquadProcessInPlace(n, biquadBP(b.f, b.Q));
        else biquadProcessInPlace(n, biquadHP(b.f, b.Q));
        //for (let i = 0; i < buf.length; i++) buf[i] += b.a * gate[i] * 0.08 * n[i];
        for (let i = 0; i < buf.length; i++) buf[i] += b.a * gate[i] * 0.06 * n[i];
    }
}

/**
 * 氣音上色（高通 + 門控）：只在有能量時出現的「有色空氣」
 */
function addAspColoredToSrc(src, gateSrc, hpHz = 1200, amount = 0.10) {
    if (amount <= 1e-4) return;
    const n = new Float32Array(src.length);
    for (let i = 0; i < n.length; i++) n[i] = (Math.random() * 2 - 1);
    biquadProcessInPlace(n, biquadHP(hpHz, 0.707));
    let env = 0, a = Math.exp(-1.0 / (SR * 0.003));
    for (let i = 0; i < src.length; i++) {
        env = a * env + (1 - a) * Math.abs((gateSrc || src)[i]);
        src[i] += amount * 0.12 * env * n[i];
    }
}

/**
 * 平行鼻腔混音（比單一路徑 notch 更像人）
 * mix01：0..1，speakerScale：共振峰縮放
 */
function applyOralNasalMixInPlace(oral, mix01, speakerScale) {
    const mix = clamp(mix01 || 0, 0, 1);
    if (mix <= 1e-4) return;
    const nasal = new Float32Array(oral);

    const Np = 300 * speakerScale;
    biquadProcessInPlace(nasal, biquadBP(Np, Math.max(2.0, Np / 120)));
    biquadProcessInPlace(nasal, biquadNotch(800 * speakerScale, 6.0));
    biquadProcessInPlace(nasal, biquadNotch(2800 * speakerScale, 5.0));
    biquadProcessInPlace(nasal, biquadLP(5000, 0.707));

    const g = (rms(oral) || 1e-6) / (rms(nasal) || 1e-6);
    for (let i = 0; i < nasal.length; i++) nasal[i] *= g;

    for (let i = 0; i < oral.length; i++) oral[i] = (1 - mix) * oral[i] + mix * nasal[i];
}

/*function applyOralNasalMixSeries(buf, mixSeries, speakerScale) {
    // 先做一次鼻腔路徑（對 oral 的拷貝作濾波）
    const nasal = new Float32Array(buf);
    const Np = 300 * speakerScale;
    biquadProcessInPlace(nasal, biquadBP(Np, Math.max(2.0, Np / 120)));
    biquadProcessInPlace(nasal, biquadNotch(800 * speakerScale, 6.0));
    biquadProcessInPlace(nasal, biquadNotch(2800 * speakerScale, 5.0));
    biquadProcessInPlace(nasal, biquadLP(5000, 0.707));

    // 粗略能量對齊
    const rBuf = rms(buf) || 1e-6, rNas = rms(nasal) || 1e-6;
    const g = rBuf / rNas; for (let i = 0; i < nasal.length; i++) nasal[i] *= g;

    // 逐樣本依 mixSeries 混音（0..1）
    for (let i = 0; i < buf.length; i++) {
        const m = clamp(mixSeries[i] || 0, 0, 1);
        buf[i] = (1 - m) * buf[i] + m * nasal[i];
    }
}*/
function applyOralNasalMixSeries(buf, mixSeries, speakerScale) {
    // 1) 先建立鼻腔路徑（基於 oral 的拷貝）
    const nasal = new Float32Array(buf);
    const Np = 300 * speakerScale;                         // 鼻腔主共振
    biquadProcessInPlace(nasal, biquadBP(Np, Math.max(2.0, Np / 120)));
    biquadProcessInPlace(nasal, biquadNotch(800 * speakerScale, 6.0));   // 反共振
    biquadProcessInPlace(nasal, biquadNotch(2800 * speakerScale, 5.0));  // 反共振
    biquadProcessInPlace(nasal, biquadLP(5000, 0.707));

    // 2) 能量對齊（避免鼻路徑忽大忽小）
    let sO=0, sN=0;
    for (let i=0;i<buf.length;i++){ sO+=buf[i]*buf[i]; sN+=nasal[i]*nasal[i]; }
    const rO = Math.sqrt(sO/Math.max(1,buf.length)) || 1e-6;
    const rN = Math.sqrt(sN/Math.max(1,buf.length)) || 1e-6;
    const g = rO / rN;
    for (let i=0;i<nasal.length;i++) nasal[i] *= g;

    // 3) 逐樣本混音（mixSeries：0..1）
    for (let i = 0; i < buf.length; i++) {
        const m = clamp(mixSeries[i] || 0, 0, 1);
        buf[i] = (1 - m) * buf[i] + m * nasal[i];
    }
}



/** 傾斜（亮度）：在 800Hz/8kHz 之間做簡單 cross shelf */
function apply_tilt_inplace(buf, brightness) {
    const hp = new Float32Array(buf), lp = new Float32Array(buf);
    biquadProcessInPlace(hp, biquadHP(800, 0.707));
    biquadProcessInPlace(lp, biquadLP(8000, 0.707));
    const b = clamp(brightness, 0, 1); // 0=暗(低頻多), 1=亮(高頻多)
    for (let i = 0; i < buf.length; i++) buf[i] = b * hp[i] + (1 - b) * lp[i];
}

/** 次聲道共振（胸腔感） */
function applySubglottal(buf, fHz, Q = 2.0, gainDb = 0) {
    if (!isFinite(fHz) || fHz <= 0) return;
    const g = db2a(gainDb || 0);
    const tmp = new Float32Array(buf);
    biquadProcessInPlace(tmp, biquadBP(fHz, Q));
    for (let i = 0; i < buf.length; i++) buf[i] += g * tmp[i];
}

// ============================== 說話者模板 / Voice Profiles ==============================

/** 基本說話者樣板（可視作“體型/共鳴腔”大方向） */
const SPEAKER_STYLE = {
    "adult_male":   { vtScale: 1.00, rd: 1.45, brightnessBias: -0.10, bwMul: 0.90, formantMix: [0.45, 0.35, 0.20], subglottal: { f: 520, Q: 2.0, gainDb: +3 }, aspHP: 700,  aspGain: 0.9 },
    "adult_female": { vtScale: 1.15, rd: 1.85, brightnessBias: +0.12, bwMul: 1.15, formantMix: [0.30, 0.35, 0.35], subglottal: { f: 650, Q: 2.0, gainDb: 0  }, aspHP: 1300, aspGain: 1.2 },
    "child":        { vtScale: 1.30, rd: 2.05, brightnessBias: +0.18, bwMul: 1.25, formantMix: [0.25, 0.35, 0.40], subglottal: { f: 750, Q: 2.0, gainDb: -2 }, aspHP: 1800, aspGain: 1.3 }
};

/** 更細的聲音身份（同為成年女性也能區分） */
const VOICES = {
    "female_bright_pop": { vtScale: 1.18, rd: 1.90, bwMul: 1.18, formantMix: [0.28, 0.34, 0.38], brightnessBias: +0.14, subglottal: { f: 650, Q: 2.0, gainDb: 0 },   aspHP: 1400, aspGain: 1.25, apBands: [0.06,0.14,0.22,0.28], vibHz: 5.8, vibCents: 18, nasalBoost: 0.10 },
    "female_warm_alto":  { vtScale: 1.12, rd: 1.70, bwMul: 1.05, formantMix: [0.36, 0.34, 0.30], brightnessBias: -0.02, subglottal: { f: 600, Q: 2.0, gainDb: +2 }, aspHP: 1100, aspGain: 1.00, apBands: [0.04,0.10,0.16,0.20], vibHz: 5.2, vibCents: 14, nasalBoost: 0.05 },
    "female_airy_head":  { vtScale: 1.20, rd: 2.10, bwMul: 1.25, formantMix: [0.24, 0.33, 0.43], brightnessBias: +0.18, subglottal: { f: 700, Q: 1.8, gainDb: -2 }, aspHP: 1600, aspGain: 1.35, apBands: [0.08,0.16,0.24,0.30], vibHz: 6.2, vibCents: 22, nasalBoost: 0.12 },
    "male_tenor_bright": { vtScale: 1.05, rd: 1.60, bwMul: 1.05, formantMix: [0.35, 0.33, 0.32], brightnessBias: +0.05, subglottal: { f: 560, Q: 2.0, gainDb: +1 }, aspHP: 1100, aspGain: 1.10, apBands: [0.04,0.10,0.18,0.22], vibHz: 5.6, vibCents: 14, nasalBoost: 0.06 }
};

/** 人性化：對 voice 參數做小幅隨機偏移（可重現） */
function humanizeVoice(v, amt = 0.3, seed = 1234) {
    const R = makeRng(seed), J = (x, p) => x * (1 + (R() * 2 - 1) * p * amt);
    return {
        vtScale: J(v.vtScale ?? 1.0, 0.03),
        rd: J(v.rd ?? 1.6, 0.08),
        bwMul: J(v.bwMul ?? 1.0, 0.10),
        formantMix: (v.formantMix ?? [1 / 3, 1 / 3, 1 / 3]).map(w => Math.max(0.1, J(w, 0.15))),
        brightnessBias: (v.brightnessBias ?? 0) + (R() * 2 - 1) * 0.05 * amt,
        subglottal: { f: J(v.subglottal?.f ?? 600, 0.05), Q: J(v.subglottal?.Q ?? 2.0, 0.10), gainDb: J(v.subglottal?.gainDb ?? 0, 0.20) },
        aspHP: J(v.aspHP ?? 1200, 0.10),
        aspGain: Math.max(0, (v.aspGain ?? 0.12) + (R() * 2 - 1) * 0.10 * amt),
        apBands: (v.apBands ?? [0.04, 0.10, 0.16, 0.22]).map(b => Math.max(0, b + (R() * 2 - 1) * 0.05 * amt)),
        vibHz: J(v.vibHz ?? 5.5, 0.05),
        vibCents: J(v.vibCents ?? 14, 0.20),
        nasalBoost: Math.max(0, (v.nasalBoost ?? 0) + (R() * 2 - 1) * 0.10 * amt)
    };
}

/**
 * 綜合出最終 style（說話者模板 + voice profile + humanize + 使用者覆蓋）
 * settings 可含：voiceKey/humanize/seed、rd/bwMul/formantMix/aspHP/aspGain/apBands/nasalBoost
 */
function resolveVoice(speakerKey, settings) {
    let merged = JSON.parse(JSON.stringify(SPEAKER_STYLE[speakerKey] || SPEAKER_STYLE["adult_male"]));
    const v0 = VOICES[settings.voiceKey];
    if (v0) merged = { ...merged, ...v0, subglottal: v0.subglottal || merged.subglottal };
    if ((settings.humanize || 0) > 0) merged = { ...merged, ...humanizeVoice(merged, settings.humanize, settings.seed || 1234) };

    // 使用者覆蓋
    if (settings.rd != null) merged.rd = settings.rd;
    if (settings.bwMul != null) merged.bwMul = settings.bwMul;
    if (Array.isArray(settings.formantMix)) merged.formantMix = settings.formantMix;
    if (settings.aspHP != null) merged.aspHP = settings.aspHP;
    if (settings.aspGain != null) merged.aspGain = settings.aspGain;
    if (Array.isArray(settings.apBands)) merged.apBands = settings.apBands;
    if (settings.nasalBoost) merged.nasalBoost = (merged.nasalBoost || 0) + settings.nasalBoost;

    return merged;
}

// ============================== PRESETS（你的版本，已接回） ==============================

const PRESETS = {
    "a": { dur: 1.0, F: [[0, [730, 1090, 2440]], [1, [730, 1090, 2440]]], notches: [], f0c: [[0, 0], [1, 0]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.06], [1, 0.06]], nas: [[0, 0], [1, 0]], env: { a: 12, h: 200, r: 160 } },
    "i": { dur: 1.0, F: [[0, [270, 2290, 3010]], [1, [270, 2290, 3010]]], notches: [], f0c: [[0, 0], [1, 0]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.05], [1, 0.05]], nas: [[0, 0], [1, 0]], env: { a: 12, h: 200, r: 160 } },
    "u": { dur: 1.0, F: [[0, [300, 870, 2240]], [1, [300, 870, 2240]]], notches: [], f0c: [[0, 0], [1, 0]], tilt: [[0, -13], [1, -13]], asp: [[0, 0.06], [1, 0.06]], nas: [[0, 0], [1, 0]], env: { a: 12, h: 200, r: 160 } },
    "e": { dur: 1.0, F: [[0, [530, 1840, 2480]], [1, [530, 1840, 2480]]], notches: [], f0c: [[0, 0], [1, 0]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.06], [1, 0.06]], nas: [[0, 0], [1, 0]], env: { a: 12, h: 200, r: 160 } },
    "o": { dur: 1.0, F: [[0, [450, 900, 2600]], [1, [420, 800, 2600]]], notches: [], f0c: [[0, -20], [1, -80]], tilt: [[0, -13], [1, -13]], asp: [[0, 0.06], [1, 0.06]], nas: [[0, 0], [1, 0]], env: { a: 16, h: 240, r: 200 } },
    "m_vowel": { dur: 1.0, F: [[0, [330, 1100, 2550]], [1, [330, 1100, 2550]]], notches: [{ f: 800, Q: 4, depthDb: 10 }], f0c: [[0, 0], [1, 0]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.08], [1, 0.08]], nas: [[0, 1], [1, 1]], env: { a: 15, h: 220, r: 200 } },

    "欸": { dur: 0.18, F: [[0, [530, 1840, 2500]], [1, [300, 2300, 3000]]], notches: [], f0c: [[0, +40], [0.05, 0], [0.80, +20], [1, 0]], tilt: [[0, -12], [1, -10]], asp: [[0, 0.10], [0.06, 0.06], [1, 0.04]], nas: [[0, 0], [1, 0]], env: { a: 12, h: 30, r: 120 } },
    "咦": { dur: 0.20, F: [[0, [270, 2290, 3010]], [1, [270, 2290, 3010]]], notches: [], f0c: [[0, 0], [1, +280]], tilt: [[0, -11], [1, -11]], asp: [[0, 0.05], [1, 0.05]], nas: [[0, 0], [1, 0]], env: { a: 15, h: 40, r: 120 } },
    "啊！": { dur: 0.35, F: [[0, [730, 1090, 2440]], [1, [730, 1090, 2440]]], notches: [], f0c: [[0, -50], [0.03, 0], [0.70, +30], [1, 0]], tilt: [[0, -9], [1, -9]], asp: [[0, 0.05], [1, 0.05]], nas: [[0, 0], [1, 0]], env: { a: 8, h: 60, r: 150 } },
    "喔！": { dur: 0.40, F: [[0, [450, 900, 2600]], [1, [420, 800, 2600]]], notches: [], f0c: [[0, 0], [1, -90]], tilt: [[0, -13], [1, -13]], asp: [[0, 0.06], [1, 0.06]], nas: [[0, 0], [1, 0]], env: { a: 20, h: 80, r: 180 } },
    "嗯": { dur: 0.35, F: [[0, [330, 1100, 2550]], [1, [330, 1100, 2550]]], notches: [{ f: 800, Q: 4, depthDb: 10 }], f0c: [[0, 0], [1, +30]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.10], [1, 0.08]], nas: [[0, 1], [1, 1]], env: { a: 15, h: 120, r: 120 }, lp: 8000 },
    "哼": { dur: 0.35, preNoiseMs: 90, F: [[0, [540, 1500, 2500]], [1, [540, 1500, 2500]]], notches: [{ f: 3000, Q: 5, depthDb: 8 }], f0c: [[0, -40], [0.08, 0], [1, 0]], tilt: [[0, -12], [1, -12]], asp: [[0, 0.10], [1, 0.10]], nas: [[0, 0.8], [1, 0.8]], env: { a: 20, h: 120, r: 120 }, lp: 8000 },
    "尖叫": { dur: 0.5, F: [[0, [350, 2500, 3200]], [1, [350, 2600, 3300]]], notches: [], f0c: [[0, 0], [1, +900]], tilt: [[0, -8], [1, -6]], asp: [[0, 0.10], [1, 0.12]], nas: [[0, 0], [1, 0]], env: { a: 5, h: 120, r: 200 }, hp: 90 },
    "呻吟": { dur: 0.6, F: [[0, [500, 1200, 2400]], [1, [400, 1000, 2400]]], notches: [], f0c: [[0, 0], [0.4, +150], [0.8, -150], [1, 0]], tilt: [[0, -14], [1, -14]], asp: [[0, 0.10], [1, 0.10]], nas: [[0, 0.2], [1, 0.2]], env: { a: 40, h: 300, r: 250 } },
    "嘆氣": { dur: 0.9, preNoiseMs: 300, F: [[0, [500, 1200, 2400]], [1, [500, 1200, 2400]]], notches: [], f0c: [[0, -200], [1, -500]], tilt: [[0, -18], [1, -20]], asp: [[0, 0.16], [1, 0.18]], nas: [[0, 0], [1, 0]], env: { a: 30, h: 400, r: 600 } }
};

// ============================== 片段渲染（單音） ==============================

/**
 * 渲染單段音（以 Hz 指定 f0；settings 介面與你現有 get_settings 相容）
 * - 讀取 speaker + voice profile，整合為 style
 * - 依 PRESETS 的曲線建 f0/tilt/asp/nas 序列，並加入 vibrato/微漂移
 * - RD-LF 產生聲門 → 三個 formant 並聯（含 20ms 更新 + crossfade）→ 鼻腔平行混音 → 傾斜/HP/LP
 * - 次聲道共振、非週期性、氣音上色、防混疊、包絡、正規化
 */
export function renderSegmentHz(f0Hz, durSec, settings) {
    const n = Math.max(1, Math.floor(SR * durSec));
    const name = settings.preset || "a";
    const P = PRESETS[name] || PRESETS["a"];

    // 1) 解析 speaker / style（含 voiceKey/humanize/覆蓋）
    const style = resolveVoice(settings.speaker || "adult_male", settings);
    const brightnessEff = clamp((settings.brightness ?? 0.5) + (style.brightnessBias || 0), 0, 1);

    // 2) 建立曲線序列
    const centsCurve = buildSeries(n, P.f0c || [[0, 0], [1, 0]]);
    const tiltSeries = buildSeries(n, P.tilt || [[0, -12], [1, -12]]);
    const aspSeries = buildSeries(n, P.asp || [[0, 0.08], [1, 0.08]]);
    const nasSeries = buildSeries(n, P.nas || [[0, 0], [1, 0]]);

    // 3) f0 系列（含 vibrato 和微漂移）+ 輕量 F1↔f0 耦合
    const vibHz = (style.vibHz != null) ? style.vibHz : (settings.vibHz || 5.5);
    const vibCents = (style.vibCents != null) ? style.vibCents : (settings.vibCents || 20);
    // （選擇性）F1↔f0 輕量耦合：只在你開設定時才套
    if (settings.coupleF1F0) {
        const Ffirst = (P.F && P.F.length) ? P.F[0][1] : [500, 1200, 2400];
        const F1mid = (Ffirst[0] || 500) * (style.vtScale || 1.0);
        applyF1F0CouplingInCents(centsCurve, f0Hz, F1mid, 28, 100);
    }
    /*const f0Series = buildF0Series(n, f0Hz, centsCurve, vibHz, vibCents,
        style.f0Drift?.rateHz || 0.6, style.f0Drift?.depthCents || 5);*/

    // 顫音（全域相位保持連續）
    if (typeof window.__vibPhase !== "number") window.__vibPhase = 0;
    const inc = 2 * Math.PI * vibHz / SR;

    // 微漂移 LFO（低通白噪，rate/depth 可用 style 或預設）
    const driftRate = style.f0Drift?.rateHz || 0.6;
    const driftDepth = style.f0Drift?.depthCents || 5;
    const aDrift = Math.exp(-2 * Math.PI * driftRate / SR);
    let drift = 0;

    // 最終 f0Series
    const f0Series = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const vib = vibCents * Math.sin(window.__vibPhase); window.__vibPhase += inc;
        drift = aDrift*drift + (1 - aDrift)*((Math.random()*2 - 1)*driftDepth);
        const centsAll = centsCurve[i] + vib + drift;     // ← 一定有用到 cents2ratio
        f0Series[i] = f0Hz * Math.pow(2, centsAll / 1200);
    }


    // 4) 聲源（RD-LF++）
    // 以包絡近似作能量：attack/hold/release 轉 0..1（粗略）
    const env = P.env || { a: 12, h: 200, r: 160 };
    const aS = Math.floor(SR * (env.a || 12) / 1000);
    const rS = Math.floor(SR * (env.r || 160) / 1000);
    const envSeries = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let g = 1;
        if (i < aS) g = i / Math.max(1, aS);
        if (i > n - 1 - rS) g = (n - 1 - i) / Math.max(1, rS);
        envSeries[i] = g;
    }
    const rdSeries = buildRdSeries(n, style.rd || 1.6, envSeries, -0.6, 0.12, 3);
    const aspGate = Float32Array.from(aspSeries, v => v * ((style.aspGain || 1.0) * (0.08 + 0.18 * (settings.breathiness ?? 0))));
    const src = rdlf_from_series(n, f0Series, rdSeries, aspGate);

    // 5) Formant 並聯（每 20ms 更新係數 + crossfade）
    const frame = Math.floor(SR * 0.02);
    // 取出時間中點的 F 值（並套說話者縮放）
    const vtScale = style.vtScale || 1.0;

    // 錄三路
    const f1buf = new Float32Array(src);
    const f2buf = new Float32Array(src);
    const f3buf = new Float32Array(src);

    const B1base = 100 + 40 * (settings.intensity ?? 0.8);
    const B2base = 140 + 50 * (settings.intensity ?? 0.8);
    const B3base = 220 + 70 * (settings.intensity ?? 0.8);

    // 建立串流處理器（仍保留你原本的作法）
    const proc1 = makeBiquadStream();
    const proc2 = makeBiquadStream();
    const proc3 = makeBiquadStream();

    const rampMs = 8;                               // 係數緩變 8ms
    const rampN  = Math.max(1, Math.floor(SR * rampMs / 1000));
    const stepN  = 32;                              // 以 32-sample 小步插值係數（不重跑兩遍）

    let d1=0, d2=0, d3=0;
    const aF = Math.exp(-2 * Math.PI * 0.8 / (SR));     // 0.8Hz 的低通
    const dep1=6, dep2=10, dep3=16;                      // 各峰 cents 幅度

    for (let s = 0; s < n; s += frame) {
        const e = Math.min(n, s + frame);
        const tmid = ((s + e) * 0.5) / Math.max(1, n - 1);
        const [F1t, F2t, F3t] = linAt(tmid, P.F) || [500, 1200, 2400];

        d1 = aF*d1 + (1-aF)*((Math.random()*2-1)*dep1);
        d2 = aF*d2 + (1-aF)*((Math.random()*2-1)*dep2);
        d3 = aF*d3 + (1-aF)*((Math.random()*2-1)*dep3);
        const F1 = F1t * vtScale * cents2ratio(d1);
        const F2 = F2t * vtScale * cents2ratio(d2);
        const F3 = F3t * vtScale * cents2ratio(d3);
        const Q1 = Math.max(2.5, F1 / Math.max(60, B1base)) / (style.bwMul || 1);
        const Q2 = Math.max(3.0, F2 / Math.max(80, B2base)) / (style.bwMul || 1);
        const Q3 = Math.max(3.5, F3 / Math.max(120, B3base)) / (style.bwMul || 1);

        // 下一幀係數
        const c1next = biquadBP(F1, Q1), c2next = biquadBP(F2, Q2), c3next = biquadBP(F3, Q3);

        // ——前 rampN 樣本做係數緩變（以係數線性插值，多次 setCoeffs，仍是 streaming）
        const seg = [f1buf.subarray(s, e), f2buf.subarray(s, e), f3buf.subarray(s, e)];
        const procs = [proc1, proc2, proc3];
        const nexts = [c1next, c2next, c3next];

        // 把前 rampN 分為若干小步，逐步 setCoeffs → process 子片段
        const K = Math.min(seg[0].length, rampN);
        let pos = 0;
        while (pos < K) {
            const run = Math.min(stepN, K - pos);
            const w = (pos + run) / Math.max(1, K); // 0..1
            // 係數插值（inline；不額外開函式）
            const c1i = { b0: proc1.c?.b0 + (c1next.b0 - (proc1.c?.b0||1))*w,
                        b1: proc1.c?.b1 + (c1next.b1 - (proc1.c?.b1||0))*w,
                        b2: proc1.c?.b2 + (c1next.b2 - (proc1.c?.b2||0))*w,
                        a1: proc1.c?.a1 + (c1next.a1 - (proc1.c?.a1||0))*w,
                        a2: proc1.c?.a2 + (c1next.a2 - (proc1.c?.a2||0))*w };
            const c2i = { b0: proc2.c?.b0 + (c2next.b0 - (proc2.c?.b0||1))*w,
                        b1: proc2.c?.b1 + (c2next.b1 - (proc2.c?.b1||0))*w,
                        b2: proc2.c?.b2 + (c2next.b2 - (proc2.c?.b2||0))*w,
                        a1: proc2.c?.a1 + (c2next.a1 - (proc2.c?.a1||0))*w,
                        a2: proc2.c?.a2 + (c2next.a2 - (proc2.c?.a2||0))*w };
            const c3i = { b0: proc3.c?.b0 + (c3next.b0 - (proc3.c?.b0||1))*w,
                        b1: proc3.c?.b1 + (c3next.b1 - (proc3.c?.b1||0))*w,
                        b2: proc3.c?.b2 + (c3next.b2 - (proc3.c?.b2||0))*w,
                        a1: proc3.c?.a1 + (c3next.a1 - (proc3.c?.a1||0))*w,
                        a2: proc3.c?.a2 + (c3next.a2 - (proc3.c?.a2||0))*w };

            procs[0].setCoeffs(c1i); procs[0].process(seg[0].subarray(pos, pos + run));
            procs[1].setCoeffs(c2i); procs[1].process(seg[1].subarray(pos, pos + run));
            procs[2].setCoeffs(c3i); procs[2].process(seg[2].subarray(pos, pos + run));
            pos += run;
        }
        // ——剩下樣本直接用 next 係數跑到底（狀態連續）
        if (K < seg[0].length) {
            procs[0].setCoeffs(c1next); procs[0].process(seg[0].subarray(K));
            procs[1].setCoeffs(c2next); procs[1].process(seg[1].subarray(K));
            procs[2].setCoeffs(c3next); procs[2].process(seg[2].subarray(K));
        }

        // 可選：notches（如 preset 有）
        if (P.notches && P.notches.length){
            for (const nt of P.notches){
                const nc = biquadNotch((nt.f || 800) * vtScale, nt.Q || 4);
                biquadProcessInPlace(f1buf.subarray(s, e), nc);
                biquadProcessInPlace(f2buf.subarray(s, e), nc);
                biquadProcessInPlace(f3buf.subarray(s, e), nc);
            }
        }
        // 把「當前係數」記回 proc 供下一幀插值用
        proc1.c = c1next; proc2.c = c2next; proc3.c = c3next;
    }

    // 並聯權重（F1/F2/F3）— 正規化避免總增益過大
    let w = style.formantMix || [1/3, 1/3, 1/3];
    const sw = w[0] + w[1] + w[2];
    if (sw > 0) w = [w[0]/sw, w[1]/sw, w[2]/sw];

    const y = new Float32Array(n);
    const headroom = 1; // 再留一點點頭房，避免峰值堆疊
    for (let i = 0; i < n; i++) {
        y[i] = headroom * (w[0]*f1buf[i] + w[1]*f2buf[i] + w[2]*f3buf[i]);
    }

    // 6) 鼻腔平行混音（時間變化的 nas）
    /*const nasalMix = clamp(Math.pow((settings.nasality ?? 0), 0.6) * 0.9 + (style.nasalBoost || 0), 0, 1);
    applyOralNasalMixInPlace(y, nasalMix, vtScale);*/
    // 6) 鼻腔平行混音（吃 nasSeries 作時間序列）——修正漏用問題
    const nasBase  = clamp(settings.nasality ?? 0, 0, 1);    // 使用者整體鼻化量
    const nasBoost = clamp(style.nasalBoost || 0, 0, 1);     // 說話者/voice 增益
    // 最終序列：preset 的 nasSeries 作時間形狀，乘上使用者量，再加上 voice boost
    const nasMixSeries = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        nasMixSeries[i] = clamp(nasBase + nasSeries[i] * (1 - nasBase) + nasBoost, 0, 1);
    }
    // 用序列版的鼻化混音
    applyOralNasalMixSeries(y, nasMixSeries, vtScale);


    // 7) 亮度/傾斜 + 可選 HP/LP
    for (let s = 0; s < n; s += frame) {
        const e = Math.min(n, s + frame);
        const tiltDb = tiltSeries[Math.min(s, n - 1)];
        const tiltAdj = tiltDb + (brightnessEff - 0.5) * 12;
        const slice = y.subarray(s, e);
        // 轉 0..1 權重
        const b = clamp(1 - ((-tiltAdj - 6) / 12), 0, 1);
        const hp = new Float32Array(slice); biquadProcessInPlace(hp, biquadHP(800, 0.707));
        const lp = new Float32Array(slice); biquadProcessInPlace(lp, biquadLP(8000, 0.707));
        for (let i = 0; i < slice.length; i++) slice[i] = b * hp[i] + (1 - b) * lp[i];

        if (P.hp) biquadProcessInPlace(slice, biquadHP(P.hp, 0.707));
        if (P.lp) biquadProcessInPlace(slice, biquadLP(P.lp, 0.707));
    }

    // 8) 次聲道共振（胸腔/頭腔）
    if (style.subglottal) applySubglottal(y, style.subglottal.f, style.subglottal.Q, style.subglottal.gainDb);

    // 9) 非週期性 + 氣音上色（對 src 與 y）
    addAperiodicNoiseBands(y, src, style.apBands || null);
    addAspColoredToSrc(y, src, style.aspHP || 1300, (style.aspGain || 1.0) * (0.08 + 0.18 * (settings.breathiness ?? 0)));

    // 10) 包絡（避免 click）
    const atk = aS, rel = rS;
    for (let i = 0; i < atk && i < n; i++) y[i] *= i / Math.max(1, atk);
    for (let i = 0; i < rel && i < n; i++) y[n - 1 - i] *= 1 - i / Math.max(1, rel);

    // 11) 音量正規化（維持原本 loudness）
    const targetRms = 0.22 + 0.26 * (settings.intensity ?? 0.8);
    let sum = 0; for (let i = 0; i < n; i++) sum += y[i]*y[i];
    const curR = Math.sqrt(sum / Math.max(1, n)) || 1e-9;
    const scale = targetRms / curR;
    for (let i = 0; i < n; i++) y[i] *= scale;

    // 11.1) 超輕軟限制器（不開新函式的寫法；ceiling=0.985, knee=0.06）
    const ceiling = 0.985, knee = 0.06, th1 = ceiling - knee, th2 = ceiling + knee;
    for (let i = 0; i < n; i++) {
        const x = y[i], ax = Math.abs(x), s = Math.sign(x);
        if (ax <= th1) { /* pass */ }
        else if (ax >= th2) y[i] = s * ceiling;
        else { const u = (ax - th1) / (2 * knee); y[i] = s * (th1 + (2*knee)*(u - u*u)); }
    }

    // 12) 防混疊
    applyAntiAliasLP(y);

    return y;
}

// ============================== 播放單音 / 測試 / 哼唱 ==============================

/**
 * 讀取設定：若頁面上有 get_settings() 就用它，否則用傳入或預設
 */
function _getSettings(settings) {
    if (settings) return settings;
    if (typeof window !== "undefined" && typeof window.get_settings === "function") return window.get_settings();
    return {
        source: "rdlf", preset: "a", speaker: "adult_female",
        duration: 1.2, f0: 200, intensity: 0.8, brightness: 0.5, breathiness: 0.08, nasality: 0.0,
        vibHz: 5.5, vibCents: 18, voiceKey: "", humanize: 0, seed: 1234
    };
}

/**
 * 播放單音：自動讀取 get_settings() 或使用傳入 settings
 */
export async function playOnce(settings = null) {
    await ensureCtx();
    const S = _getSettings(settings);
    const dur = Math.max(0.05, S.duration || 1.0);
    const f0 = Math.max(30, S.f0 || 150);

    // 預備 preNoise（像「哼/嘆氣/驚呼」的前置氣音）
    const P = PRESETS[S.preset] || PRESETS["a"];
    const nVoiced = Math.max(1, Math.floor(SR * dur));
    const nPre = Math.floor(SR * ((P.preNoiseMs || 0) / 1000));
    const y = renderSegmentHz(f0, dur, S);
    const out = new Float32Array(nPre + y.length);

    if (nPre > 0) {
        const pre = new Float32Array(nPre);
        for (let i = 0; i < nPre; i++) pre[i] = (Math.random() * 2 - 1) * 0.12 * (0.6 + (S.breathiness || 0) * 0.8);
        biquadProcessInPlace(pre, biquadHP(600, 0.707));
        biquadProcessInPlace(pre, biquadLP(8000, 0.707));
        out.set(pre, 0);
    }
    out.set(y, nPre);

    const buf = ctx.createBuffer(1, out.length, ctx.sampleRate);
    buf.getChannelData(0).set(out);
    const node = ctx.createBufferSource();
    const gain = ctx.createGain(); gain.gain.value = 1.0;
    node.buffer = buf; node.connect(gain).connect(ctx.destination);
    node.start();
}

/** 簡單嗶聲（確認瀏覽器能發聲） */
export async function testBeep() {
    await ensureCtx();
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = 880; g.gain.value = 0.2;
    osc.connect(g).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
}

/**
 * 連續哼唱：melody = [ ["C4",0.4], ["D4",0.4], ... ] 或 [ [Hz, dur], ... ]
 * - 8~12 ms 交疊 crossfade，顫音相位全域連續
 */
export async function playMelody(melody, settings = null) {
    await ensureCtx();
    const S = _getSettings(settings);
    const overlapMs = 10, OL = Math.floor(SR * overlapMs / 1000);
    let out = new Float32Array(0);

    for (const [note, dur] of melody) {
        const f0 = noteToFreq(note);
        const seg = renderSegmentHz(f0, dur, S);
        const merged = new Float32Array(out.length + seg.length - (out.length ? OL : 0));
        if (out.length === 0) {
            merged.set(seg, 0);
        } else {
            merged.set(out.slice(0, out.length - OL), 0);
            for (let i = 0; i < OL; i++) {
                const w = i / Math.max(1, OL - 1);
                const a = out[out.length - OL + i] * (1 - w);
                const b = seg[i] * w;
                merged[out.length - OL + i] = a + b;
            }
            merged.set(seg.slice(OL), out.length);
        }
        out = merged;
    }

    // 頭尾淡入/出
    const head = Math.floor(SR * 0.012), tail = Math.floor(SR * 0.050);
    for (let i = 0; i < head && i < out.length; i++) out[i] *= i / Math.max(1, head);
    for (let i = 0; i < tail && i < out.length; i++) out[out.length - 1 - i] *= 1 - i / Math.max(1, tail);

    const buf = ctx.createBuffer(1, out.length, ctx.sampleRate);
    buf.getChannelData(0).set(out);
    const node = ctx.createBufferSource();
    const gain = ctx.createGain(); gain.gain.value = 1.0;
    node.buffer = buf; node.connect(gain).connect(ctx.destination);
    node.start();
}

// ============================== 導出（若需整包） ==============================

export default {
    ensureCtx,
    playOnce,
    playMelody,
    testBeep,
    // 工具（可選用）
    freqToNoteName,
    noteToFreq,
    f0ToMidi,
    midiToFreq
};
