// Cue engine: open/build/drop + beat. Sources: sim (fake cue generator), demo (procedural track), mic, file.
// Later: a LiveKit data-channel source can call engine.ingest({section, beat, bpm}) from the cue bridge.
export class CueEngine {
  constructor() {
    this.source = 'sim'; this.forced = null; this.bpm = 128; this.t = 0;
    this.st = { section: 'open', buildProgress: 0, intensity: .3, beatCount: 0, beatPhase: 0, bpm: 128 };
    this.ctx = null; this.analyser = null; this.node = null; this.stream = null;
    this.ext = null; this.energyFast = 0; this.energySlow = 0; this.peak = 1e-4; this.lastBeatT = 0; this.beatIntervals = []; this.buildStart = 0;
  }
  force(s) { this.forced = s === 'auto' ? null : s; if (s === 'build') this.buildStart = this.t; }
  ingest(cue) { this.ext = { ...cue, at: this.t }; } // external cue hook
  async ensureCtx() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state !== 'running') await this.ctx.resume(); }
  // Host-mode helpers. A 'host' stream is owned by host.js, so stopAudio() never stops its tracks.
  async setStream(stream) { await this.setSource('host', stream); }
  tap() { const now = performance.now() / 1000; const ts = (this.taps || []).filter(x => now - x < 2); ts.push(now); this.taps = ts.slice(-5);
    if (this.taps.length >= 2) { const iv = (this.taps.at(-1) - this.taps[0]) / (this.taps.length - 1); this.bpm = Math.max(60, Math.min(200, 60 / iv)); this.st.bpm = this.bpm;
      if (this.analyser) { this.beatIntervals = [iv]; this.lastBeatT = this.t; } } return this.bpm; }
  stopAudio() { try { this.node?.stop?.(); } catch {} this.node?.disconnect(); this.node = null; if (this.source !== 'host') this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.el?.pause(); }
  attach(node, toSpeakers = true) { this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 1024; this.analyser.smoothingTimeConstant = .3;
    node.connect(this.analyser); if (toSpeakers) this.analyser.connect(this.ctx.destination); this.freq = new Uint8Array(this.analyser.frequencyBinCount); this.peak = 1e-4; this.prevBass = 0; }
  async setSource(src, file) {
    this.stopAudio(); this.source = src; this.forced = null; this.t = 0; this.buildStart = 0; this.st.beatCount = 0;
    if (src === 'sim') { this.analyser = null; return; }
    await this.ensureCtx();
    if (src === 'demo') { const buf = this.demoBuf || (this.demoBuf = await renderDemo(this.ctx.sampleRate)); const n = this.ctx.createBufferSource(); n.buffer = buf; n.loop = true; this.attach(n); n.start(); this.node = n; }
    if (src === 'mic') { try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } }); const n = this.ctx.createMediaStreamSource(this.stream); this.attach(n, false); this.node = n; }
      catch (e) { alert('Mic unavailable: ' + e.message); this.source = 'sim'; } }
    if (src === 'host') { // host mode: a captured MediaStream (Helix window audio, mic or loopback). Analysed only, never sent to speakers (no echo).
      this.stream = file; const n = this.ctx.createMediaStreamSource(file); this.attach(n, false); this.node = n; }
    if (src === 'file') { const buf = await this.ctx.decodeAudioData(await file.arrayBuffer()); const n = this.ctx.createBufferSource(); n.buffer = buf; n.loop = true; this.attach(n); n.start(); this.node = n; }
  }
  update(dt) {
    this.t += dt; const st = this.st;
    const helixLive = this.ext && this.t - this.ext.at < 2;
    if (this.analyser && !helixLive) this.analyse(dt);
    else { // sim: 128bpm, 8 bars open, 8 bars build, 8 bars drop (~45 s loop)
      const beatLen = 60 / this.bpm; const beats = this.t / beatLen; const nb = Math.floor(beats);
      st.beatPhase = beats - nb; st.beatCount = nb; st.bpm = this.bpm;
      const bar = Math.floor(nb / 4) % 24; const sec = bar < 8 ? 'open' : bar < 16 ? 'build' : 'drop';
      st.section = sec; st.buildProgress = sec === 'build' ? ((nb / 4) % 24 - 8) / 8 : 0;
    }
    if (this.ext && this.t - this.ext.at < 2) Object.assign(st, this.ext);
    if (this.forced) { if (this.forced === 'build' && st.section !== 'build') this.buildStart = this.buildStart || this.t;
      st.section = this.forced; st.buildProgress = this.forced === 'build' ? Math.min(1, (this.t - this.buildStart) / 15) : 0;
      if (!this.analyser) { /* keep sim beat */ } }
    st.intensity = st.section === 'open' ? .3 : st.section === 'build' ? .4 + .5 * st.buildProgress : 1;
    if (this.ext && this.t - this.ext.at < 2) { if (this.ext.intensity != null) st.intensity = this.ext.intensity; if (this.ext.buildProgress != null && !this.forced) st.buildProgress = this.ext.buildProgress; } // Helix is the source of truth
    return st;
  }
  analyse(dt) { // energy + bass onset beat detection; section from energy relative to recent peak and trend
    const st = this.st; this.analyser.getByteFrequencyData(this.freq); const f = this.freq; let bass = 0, all = 0;
    for (let i = 1; i < 10; i++) bass += f[i]; for (let i = 1; i < 200; i++) all += f[i]; bass /= 9 * 255; all /= 199 * 255;
    this.energyFast += (all - this.energyFast) * Math.min(1, dt * 4); this.energySlow += (all - this.energySlow) * Math.min(1, dt * .25);
    this.peak = Math.max(this.peak * (1 - dt * .01), this.energyFast);
    const flux = bass - this.prevBass; this.prevBass = bass;
    const minGap = 60 / 200;
    if (flux > .06 && bass > .35 && this.t - this.lastBeatT > minGap) { const iv = this.t - this.lastBeatT; this.lastBeatT = this.t; st.beatCount++;
      if (iv < 1.2) { this.beatIntervals.push(iv); if (this.beatIntervals.length > 16) this.beatIntervals.shift(); const s = [...this.beatIntervals].sort((a, b) => a - b); st.bpm = 60 / s[s.length >> 1]; } }
    st.beatPhase = Math.min(1, (this.t - this.lastBeatT) * st.bpm / 60);
    const rel = this.energyFast / this.peak, trend = this.energyFast - this.energySlow;
    let sec = st.section;
    if (rel > .78 && bass > .45) sec = 'drop'; else if (trend > .015 || (rel > .5 && sec !== 'drop')) sec = 'build'; else if (rel < .45) sec = 'open';
    if (sec !== st.section) { this.pending = this.pending === sec ? sec : sec; this.pendT = (this.pendSec === sec ? this.pendT : 0) + dt; this.pendSec = sec;
      if (this.pendT > .8) { if (sec === 'build') this.buildStart = this.t; st.section = sec; this.pendT = 0; } } else this.pendT = 0;
    st.buildProgress = st.section === 'build' ? Math.min(1, (this.t - this.buildStart) / 15) : 0;
  }
}

// Procedural demo track: 128 bpm, 8 bars open (pad), 8 bars build (snare roll + riser), 8 bars drop (kick + bass + stab)
async function renderDemo(sr) {
  const bpm = 128, beat = 60 / bpm, bars = 24, len = bars * 4 * beat; const ctx = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
  const out = ctx.createGain(); out.gain.value = .7; out.connect(ctx.destination);
  const noise = ctx.createBuffer(1, sr, sr); const nd = noise.getChannelData(0); for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; const hz = m => 440 * 2 ** ((m - 69) / 12);
  const pad = (t0, d, notes, v) => notes.forEach(n => { const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = hz(n); lp.frequency.value = 900;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + d * .3); g.gain.linearRampToValueAtTime(0, t0 + d); o.connect(lp).connect(g).connect(out); o.start(t0); o.stop(t0 + d); });
  const kick = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + .12); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(.001, t + .35); o.connect(g).connect(out); o.start(t); o.stop(t + .4); };
  const snare = (t, v) => { const s = ctx.createBufferSource(), g = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; s.buffer = noise; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); s.connect(hp).connect(g).connect(out); s.start(t); s.stop(t + .15); };
  const bass = (t, n) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = hz(n - 24); g.gain.setValueAtTime(.25, t); g.gain.exponentialRampToValueAtTime(.001, t + beat * .45); o.connect(g).connect(out); o.start(t); o.stop(t + beat * .5); };
  for (let b = 0; b < bars; b++) { const t = b * 4 * beat, ch = chords[b % 4];
    if (b < 8) pad(t, 4 * beat, ch, .05);
    else if (b < 16) { pad(t, 4 * beat, ch, .06); const p = (b - 8) / 8; const div = p < .25 ? 1 : p < .5 ? 2 : p < .75 ? 4 : 8; for (let i = 0; i < 4 * div; i++) snare(t + i * beat / div, .15 + .5 * p);
      if (b < 15 || true) kick(t); }
    else { for (let i = 0; i < 4; i++) { kick(t + i * beat); bass(t + i * beat + beat / 2, ch[0]); if (i % 2) snare(t + i * beat, .4); } pad(t, 4 * beat, ch.map(n => n + 12), .07); }
  }
  // riser over build
  const r = ctx.createBufferSource(), rg = ctx.createGain(), bp = ctx.createBiquadFilter(); r.buffer = noise; r.loop = true; bp.type = 'bandpass'; const t8 = 32 * beat, t16 = 64 * beat;
  bp.frequency.setValueAtTime(300, t8); bp.frequency.exponentialRampToValueAtTime(6000, t16); rg.gain.setValueAtTime(0, t8); rg.gain.linearRampToValueAtTime(.3, t16 - .01); rg.gain.setValueAtTime(0, t16);
  r.connect(bp).connect(rg).connect(out); r.start(t8); r.stop(t16);
  return ctx.startRendering();
}
