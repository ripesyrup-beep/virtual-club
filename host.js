// Host mode (Bryan's laptop, Chrome, no server). Open the club with ?host or press H.
//  1. Helix on the LED wall: getDisplayMedia capture -> club.setVideoStream; its audio (or a chosen mic/loopback input) -> CueEngine beat/section detection.
//  2. Controller in: Web MIDI (default map: /workspace/helix-controller/midi-map.md) + MIDI Learn for any controller.
//  3. Small host panel (MIDI status, section, Hide UI).
//  4. LiveKit hooks (stubs only): club.net.broadcast(cue) / club.net.receive(cue).
//
// ---- Lights API (read by main.js and by Vision Pro Bot's realism.js/venue.js) ----
//   club.lights.get()            -> snapshot { energy, speed, palette, motion, rgbSplit, blendAmt, manualA, manualB, freeze, invert, blackout, blend, channel }
//   club.lights.set(key, value)  or  club.lights.set({ key: value, ... })
//   club.lights.on(fn)           -> fn(changedPartial, fullState) on every change; returns an unsubscribe fn
//   club.lights.state            -> the live object (read-only by convention)
// Ranges: energy 0..1.5 (1 = normal), speed 0..3 (1 = normal), palette 0..1 (hue rotation, 0 = none), motion 0..2 (1 = normal),
//   rgbSplit/blendAmt/manualA/manualB 0..1, freeze/invert/blackout booleans, blend int (blend-mode index), channel 1..9.

export const DEFAULT_MAP = {
  cc: { 20: 'energy', 21: 'speed', 22: 'palette', 23: 'rgbSplit', 24: 'motion', 25: 'blendAmt', 28: 'manualA', 29: 'manualB', 30: 'blend' },
  note: { 36: 'auto', 39: 'invert', 40: 'freeze', 41: 'clear', 42: 'tap', 44: 'nextBlend', 48: 'ch1', 49: 'ch2', 50: 'ch3', 51: 'ch4', 52: 'ch5', 53: 'ch6', 54: 'ch7', 55: 'ch8', 56: 'ch9' },
};
// CC value 0..127 -> lights value
const SCALE = { energy: v => v / 127 * 1.5, speed: v => v / 127 * 3, palette: v => v / 127, motion: v => v / 127 * 2, rgbSplit: v => v / 127, blendAmt: v => v / 127, manualA: v => v / 127, manualB: v => v / 127, blend: v => v };
const LEARNABLE = ['energy', 'speed', 'palette', 'motion', 'tap', 'freeze', 'invert', 'clear', 'auto'];
const LS_KEY = 'helixClub.midiMap.v1';

export function createLights() {
  const state = { energy: 1, speed: 1, palette: 0, motion: 1, rgbSplit: 0, blendAmt: 0, manualA: 0, manualB: 0, freeze: false, invert: false, blackout: false, blend: 0, channel: 1 };
  const subs = new Set();
  return {
    state,
    get: () => ({ ...state }),
    set(k, v) { const p = typeof k === 'object' ? k : { [k]: v }; const ch = {};
      for (const [key, val] of Object.entries(p)) if (key in state && state[key] !== val) { state[key] = val; ch[key] = val; }
      if (Object.keys(ch).length) subs.forEach(f => { try { f(ch, state); } catch (e) { console.warn('lights listener', e); } }); return this; },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ---- LiveKit hooks (not implemented yet). Host calls broadcast(); a guest's LiveKit data handler should call receive(). ----
export function createNet(club) {
  const net = {
    room: null, // future: livekit-client Room
    role: /[?&]host/.test(location.search) ? 'host' : 'guest',
    // future: room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(cue)), { reliable: cue.type !== 'lights' })
    broadcast(cue) { if (!net.room) return false; /* TODO LiveKit publishData */ return false; },
    // guest side: apply a cue that arrived over the data channel
    receive(cue) {
      if (!cue) return;
      if (cue.lights) club.lights.set(cue.lights);
      if (cue.section || cue.beat !== undefined || cue.bpm) club.cues.ingest({ ...(cue.section && { section: cue.section }), ...(cue.bpm && { bpm: cue.bpm }), ...(cue.beat !== undefined && { beatCount: cue.beat }) });
      if (cue.force) club.cues.force(cue.force);
      if (cue.tap) club.cues.tap();
    },
    async connect(url, token) { console.info('[host] LiveKit not implemented yet', url ? '(url given)' : ''); return null; },
  };
  return net;
}

export function initHost(club) {
  const { cues } = club;
  const lights = club.lights || (club.lights = createLights());
  const net = club.net || (club.net = createNet(club));
  lights.on(ch => net.broadcast({ type: 'lights', lights: ch }));

  // ---------- MIDI ----------
  let map = loadMap(); let access = null; let learnTarget = null; let lastMsg = '—'; let midiStatus = 'not connected';
  function loadMap() { try { const m = JSON.parse(localStorage.getItem(LS_KEY)); if (m?.cc && m?.note) return m; } catch {} return structuredClone(DEFAULT_MAP); }
  const saveMap = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch {} };
  function action(name, on, val) {
    if (SCALE[name]) { lights.set(name, SCALE[name](val)); return; }
    if (!on) return; // pads act on press only
    switch (name) {
      case 'tap': { const bpm = cues.tap(); net.broadcast({ type: 'tap', bpm }); break; }
      case 'freeze': lights.set('freeze', !lights.state.freeze); break;
      case 'invert': lights.set('invert', !lights.state.invert); break;
      case 'clear': lights.set('blackout', !lights.state.blackout); break;
      case 'auto': lights.set({ blackout: false, freeze: false, invert: false }); cues.force('auto'); net.broadcast({ type: 'force', force: 'auto' }); break;
      case 'nextBlend': break; // CC30 follows with the actual index
      default: if (/^ch\d$/.test(name)) lights.set('channel', +name.slice(2));
    }
  }
  function onMidi(e) {
    const [st, d1, d2 = 0] = e.data; const type = st & 0xf0;
    let kind = null, on = false;
    if (type === 0xb0) kind = 'cc'; else if (type === 0x90) { kind = 'note'; on = d2 > 0; } else if (type === 0x80) kind = 'note'; else return;
    lastMsg = `${kind === 'cc' ? 'CC' : 'Note'} ${d1} = ${d2}`;
    if (learnTarget && (kind === 'cc' || on)) { // MIDI Learn: bind this control to the armed function
      for (const k of ['cc', 'note']) for (const n in map[k]) if (map[k][n] === learnTarget) delete map[k][n];
      map[kind][d1] = learnTarget; saveMap(); lastMsg += ` → learned ${learnTarget}`; learnTarget = null; render(); return; }
    const name = map[kind][d1]; if (name) action(name, kind === 'cc' ? true : on, d2);
    render();
  }
  function bindInputs() { if (!access) return; const ins = [...access.inputs.values()];
    ins.forEach(i => i.onmidimessage = onMidi);
    midiStatus = ins.length ? 'connected: ' + ins.map(i => i.name).join(', ') : 'no MIDI inputs found'; render(); }
  async function startMidi() {
    if (!navigator.requestMIDIAccess) { midiStatus = 'Web MIDI unsupported (use Chrome/Edge)'; render(); return; }
    try { access = await navigator.requestMIDIAccess({ sysex: false }); access.onstatechange = bindInputs; bindInputs(); }
    catch (e) { midiStatus = 'MIDI blocked: ' + e.message; render(); }
  }

  // ---------- Helix capture ----------
  let capture = null, audioIn = null;
  async function shareHelix() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, selfBrowserSurface: 'exclude', systemAudio: 'include' });
      stopShare(false); capture = s; club.setVideoStream(new MediaStream(s.getVideoTracks()));
      s.getVideoTracks()[0]?.addEventListener('ended', () => stopShare());
      if (s.getAudioTracks().length && !audioIn) await useAudio(new MediaStream(s.getAudioTracks()), 'window/tab audio');
      else if (!audioIn) ui.note.textContent = 'No window audio offered: pick a mic/loopback input below.';
      render();
    } catch (e) { if (e.name !== 'NotAllowedError') console.warn('[host] share failed', e); ui.note.textContent = 'Share cancelled: ' + e.message; }
  }
  function stopShare(fallback = true) {
    capture?.getTracks().forEach(t => t.stop());
    if (audioIn?.label === 'window/tab audio') { audioIn = null; if (fallback) cues.setSource('sim'); }
    capture = null; if (fallback) club.clearVideo(); render();
  }
  async function useAudio(stream, label) {
    if (audioIn && audioIn.stream !== stream && audioIn.label !== 'window/tab audio') audioIn.stream.getTracks().forEach(t => t.stop());
    audioIn = { stream, label }; await cues.setStream(stream); render();
  }
  async function pickInput(deviceId) {
    if (!deviceId) return;
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      await useAudio(s, s.getAudioTracks()[0]?.label || 'input'); await listInputs(); }
    catch (e) { ui.note.textContent = 'Input failed: ' + e.message; }
  }
  async function listInputs() {
    let devs = []; try { devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch {}
    ui.inputs.innerHTML = '<option value="">Audio input (mic / Stereo Mix / VB-Cable)…</option>' + devs.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Input ' + (i + 1) + ' (grant mic to see names)')}</option>`).join('');
  }
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- panel UI (built here so index.html stays untouched) ----------
  const css = document.createElement('style'); css.textContent = `
#hostp{position:fixed;right:10px;top:10px;z-index:7;background:#000c;border:1px solid #a6ff0066;border-radius:8px;padding:8px 10px;font:12px ui-monospace,Menlo,monospace;color:#a6ff00;width:270px}
#hostp button,#hostp select{background:#111;color:#a6ff00;border:1px solid #a6ff00;border-radius:5px;margin:2px;padding:4px 7px;font:inherit;cursor:pointer;max-width:100%}
#hostp button.on{background:#a6ff00;color:#000}#hostp .sec{font-size:20px;letter-spacing:2px}#hostp .dim{opacity:.7}
#hostp .bars{display:grid;grid-template-columns:52px 1fr;gap:2px 6px;margin:4px 0}#hostp .bar{height:6px;background:#a6ff0033;align-self:center}#hostp .bar i{display:block;height:100%;background:#a6ff00}
#hostShow{position:fixed;right:10px;top:10px;z-index:7;opacity:.35;background:#000;color:#a6ff00;border:1px solid #a6ff00;border-radius:5px;font:11px monospace;display:none;cursor:pointer}
body.hostHidden #hud{display:none}`;
  document.head.appendChild(css);
  const p = document.createElement('div'); p.id = 'hostp'; p.hidden = true; p.innerHTML = `
<b>HOST MODE</b> <span class="sec" data-h="sec">OPEN</span> <span data-h="bpm" class="dim"></span><br>
<button data-h="share">Share Helix window</button><button data-h="stop">Stop</button><br>
<select data-h="inputs"></select><br>
<span class="dim">Audio: </span><span data-h="audio">none</span><br>
<span class="dim">MIDI: </span><span data-h="midi"></span><br><span class="dim">Last: </span><span data-h="last">—</span>
<div class="bars" data-h="bars"></div>
<div data-h="flags"></div>
<select data-h="learn"><option value="">MIDI Learn…</option>${LEARNABLE.map(n => `<option>${n}</option>`).join('')}</select><button data-h="reset">Reset map</button><br>
<button data-h="hide">Hide UI</button><span class="dim" data-h="note"></span>`;
  document.body.appendChild(p);
  const showBtn = document.createElement('button'); showBtn.id = 'hostShow'; showBtn.textContent = 'show UI (H)'; document.body.appendChild(showBtn);
  const ui = Object.fromEntries([...p.querySelectorAll('[data-h]')].map(e => [e.dataset.h, e]));
  ui.share.onclick = shareHelix; ui.stop.onclick = () => stopShare();
  ui.inputs.onchange = e => pickInput(e.target.value);
  ui.learn.onchange = e => { learnTarget = e.target.value || null; ui.note.textContent = learnTarget ? ` Move a knob / hit a pad for "${learnTarget}"` : ''; e.target.value = ''; };
  ui.reset.onclick = () => { map = structuredClone(DEFAULT_MAP); saveMap(); ui.note.textContent = ' Default Helix map restored'; };
  let hidden = false; const setHidden = h => { hidden = h; p.style.display = h ? 'none' : ''; showBtn.style.display = h ? 'block' : 'none'; document.body.classList.toggle('hostHidden', h); };
  ui.hide.onclick = () => setHidden(true); showBtn.onclick = () => setHidden(false);

  let active = false;
  function enable() { if (active) return; active = true; p.hidden = false; startMidi(); listInputs(); render(); }
  addEventListener('keydown', e => { if (e.code !== 'KeyH' || e.target.closest?.('input,select')) return; if (!active) enable(); else setHidden(!hidden); });
  const hud = document.getElementById('hud'); if (hud) { const b = document.createElement('button'); b.textContent = 'Host mode'; b.onclick = enable; hud.appendChild(b); }
  if (/[?&]host/.test(location.search)) enable();

  function render() { if (!active) return; const L = lights.state;
    ui.midi.textContent = midiStatus; ui.last.textContent = lastMsg; ui.audio.textContent = audioIn ? audioIn.label : (cues.source === 'host' ? 'host' : 'none (' + cues.source + ')');
    ui.share.classList.toggle('on', !!capture);
    ui.bars.innerHTML = [['energy', L.energy / 1.5], ['speed', L.speed / 3], ['palette', L.palette], ['motion', L.motion / 2]].map(([n, v]) => `<span>${n}</span><div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></div>`).join('');
    ui.flags.innerHTML = ['freeze', 'invert', 'blackout'].map(f => `<button class="${L[f] ? 'on' : ''}" data-flag="${f}">${f}</button>`).join('') + '<button data-flag="tap">tap</button><button data-flag="auto">auto</button>';
    ui.flags.querySelectorAll('[data-flag]').forEach(b => b.onclick = () => action(b.dataset.flag === 'blackout' ? 'clear' : b.dataset.flag, true));
  }
  lights.on(render);
  // section/bpm readout + cue broadcast, called from main.js each frame
  let lastSec = '', lastBeat = -1;
  function tick(st) {
    if (st.section !== lastSec) { lastSec = st.section; if (active) ui.sec.textContent = st.section.toUpperCase(); net.broadcast({ type: 'section', section: st.section }); }
    if (st.beatCount !== lastBeat) { lastBeat = st.beatCount; if (active) ui.bpm.textContent = Math.round(st.bpm) + ' bpm'; net.broadcast({ type: 'beat', beat: st.beatCount, bpm: st.bpm }); }
  }
  return { lights, net, tick, enable, shareHelix, stopShare, pickInput, onMidi, get map() { return map; } };
}
