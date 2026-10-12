import * as THREE from 'three';
import { VRButton } from './vendor/webxr/VRButton.js';
import { CueEngine } from './cues.js';
import { applyRealism } from './realism.js';
import { initHost } from './host.js';

const LIME = 0xa6ff00;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setFoveation?.(1);
renderer.xr.setFramebufferScaleFactor?.(1);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020203);
scene.fog = new THREE.FogExp2(0x05060a, 0.016);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig);
rig.position.set(0, 0, 9); camera.position.y = 1.65;

const hemi = new THREE.HemisphereLight(0x6070a0, 0x101010, 0.25); scene.add(hemi);
const wash = new THREE.PointLight(LIME, 20, 30, 1.6); wash.position.set(0, 6, -8); scene.add(wash);

// ---------- room ----------
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.15, 'rgba(255,255,255,.55)'); gr.addColorStop(.45, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const W = 22, D = 34, H = 9;
const mat = (c, e = 0, ei = 1) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, metalness: .1, emissive: e, emissiveIntensity: ei });
const box = (w, h, d, m, x, y, z, p = scene) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); p.add(b); return b; };
function canvasTex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; }
// acoustic foam panels with thin lime seams
const wallTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#121218'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 18 + ((x + y) % 2) * 8 + Math.random() * 6; const gr = g.createLinearGradient(x * 64, y * 64, x * 64 + 64, y * 64 + 64);
    gr.addColorStop(0, `rgb(${v + 6},${v + 6},${v + 14})`); gr.addColorStop(1, `rgb(${v - 6},${v - 6},${v})`); g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    g.strokeStyle = 'rgba(0,0,0,.35)'; for (let k = 8; k < 64; k += 8) { g.beginPath(); if ((x + y) % 2) { g.moveTo(x * 64 + k, y * 64 + 2); g.lineTo(x * 64 + k, y * 64 + 62); } else { g.moveTo(x * 64 + 2, y * 64 + k); g.lineTo(x * 64 + 62, y * 64 + k); } g.stroke(); } }
  g.fillStyle = 'rgba(166,255,0,.35)'; g.fillRect(0, 127, w, 2); }, 8, 3);
const floorTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#0c0c0f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { const v = 10 + Math.random() * 30; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = '#1d1d24'; g.lineWidth = 2; for (let k = 0; k <= w; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); } }, 10, 16);
const roomMats = [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, side: THREE.BackSide,
  map: i === 3 ? floorTex : i === 2 ? null : (() => { const t = wallTex.clone(); if (i === 0 || i === 1) t.repeat.set(12, 3); return t; })(), color: i === 2 ? 0x07070a : 0xffffff }));
const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), roomMats);
room.position.y = H / 2; scene.add(room);

// floor panels (instanced, pulse on beat)
const PN = 8, PM = 10, ps = 1.2;
const floorPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(ps * .95, .05, ps * .95), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN * PM);
{ const m = new THREE.Matrix4(); let i = 0;
  for (let a = 0; a < PN; a++) for (let b = 0; b < PM; b++) { m.makeTranslation((a - PN / 2 + .5) * ps, .03, (b - PM / 2 + .5) * ps - 3); floorPanels.setMatrixAt(i, m); floorPanels.setColorAt(i++, new THREE.Color(0x111111)); } }
scene.add(floorPanels);

// LED wall with canvas texture + video hook
const wallCanvas = document.createElement('canvas'); wallCanvas.width = 768; wallCanvas.height = 384;
const wctx = wallCanvas.getContext('2d');
const ledTex = new THREE.CanvasTexture(wallCanvas); ledTex.colorSpace = THREE.SRGBColorSpace;
const wallMat = new THREE.MeshBasicMaterial({ map: ledTex, toneMapped: false, fog: false, color: new THREE.Color(1.6, 1.6, 1.6) });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), wallMat); wall.position.set(0, 4.6, -D / 2 + .05); scene.add(wall);
box(14.4, .12, .2, mat(0x111111, LIME, 2), 0, 8.15, -D / 2 + .1); box(14.4, .12, .2, mat(0x111111, LIME, 2), 0, 1.05, -D / 2 + .1);
let videoEl = null;
function setVideoStream(src) { // MediaStream (WebRTC/WHEP) or URL
  videoEl = document.createElement('video'); videoEl.muted = true; videoEl.playsInline = true; videoEl.loop = true;
  if (src instanceof MediaStream) videoEl.srcObject = src; else videoEl.src = src;
  videoEl.play(); const vt = new THREE.VideoTexture(videoEl); vt.colorSpace = THREE.SRGBColorSpace; wallMat.map = vt; wallMat.needsUpdate = true;
}
function clearVideo() { videoEl?.pause(); videoEl = null; wallMat.map = ledTex; wallMat.needsUpdate = true; }

// DJ booth
const booth = new THREE.Group(); booth.position.set(0, 0, -D / 2 + 4); scene.add(booth);
box(5, .6, 2.2, mat(0x15151a), 0, .3, 0, booth); box(4.4, 1.0, 1.6, mat(0x0d0d0f), 0, 1.1, 0, booth);
box(4.5, .06, 1.7, mat(0x111111, LIME, 1.5), 0, 1.63, 0, booth);
box(4.42, .05, .05, mat(0, LIME, 3), 0, .6, .81, booth);
for (const x of [-1.2, 1.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .05, 24), mat(0x222222, 0x223300)); p.position.set(x, 1.68, 0); booth.add(p); }
const boothBtns = []; for (let i = 0; i < 8; i++) boothBtns.push(box(.14, .04, .14, mat(0x111111, [0xff3366, 0xffaa00, 0x33ccff, LIME][i % 4], 1), -.5 + (i % 4) * .33, 1.68, -.25 + Math.floor(i / 4) * .3, booth));

// Bar (right wall)
const bar = new THREE.Group(); bar.position.set(W / 2 - 2.2, 0, 4); scene.add(bar);
box(1.2, 1.1, 8, mat(0x18181d), 0, .55, 0, bar); box(1.3, .06, 8.1, mat(0x222, LIME, .8), 0, 1.13, 0, bar);
box(.4, 3, 8, mat(0x101014), 1.6, 1.8, 0, bar);
for (let i = 0; i < 14; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .4, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random(), .9, .55), transparent: true, opacity: .85 })); c.position.set(1.35, 1.6 + (i % 2) * .8, -3.5 + Math.floor(i / 2) * 1.1); bar.add(c); }
for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .8, 12), mat(0x222228)); s.position.set(-1.1, .4, -3 + i * 2); bar.add(s); }
glow(LIME, 4, new THREE.Vector3(W / 2 - 1.2, 1.3, 4), scene, .25);
const barSign = makeLabel('BAR', '#a6ff00', 64); barSign.position.set(W / 2 - .7, 4, 4); barSign.scale.multiplyScalar(2); scene.add(barSign);

// Balcony (back, raised)
const BALC_Y = 3.6;
const balc = new THREE.Group(); balc.position.set(0, BALC_Y, D / 2 - 3); scene.add(balc);
box(W, .3, 6, mat(0x141418), 0, -.15, 0, balc);
box(W - 2.2, .06, .06, mat(0, LIME, 3), 1.1, 1.05, -3, balc);
for (let x = -W / 2 + 2.6; x < W / 2; x += 1.5) box(.05, 1.05, .05, mat(0x333333), x, .52, -3, balc);
box(1.2, BALC_Y, 1.2, mat(0x101012), -W / 2 + 1.5, -BALC_Y / 2, -2.5, balc); box(1.2, BALC_Y, 1.2, mat(0x101012), W / 2 - 1.5, -BALC_Y / 2, -2.5, balc);
const bl = makeLabel('SPECTATOR BALCONY · humans only on bot night', '#a6ff00', 28); bl.position.set(0, 2.2, 2.9); bl.rotation.y = Math.PI; bl.scale.multiplyScalar(3); balc.add(bl);

// stairs to the balcony along the left wall (instanced steps)
const ST_X0 = -W / 2 + .2, ST_X1 = -W / 2 + 2, ST_ZTOP = D / 2 - 6, ST_N = 14, ST_RUN = .45, ST_ZBOT = ST_ZTOP - ST_N * ST_RUN;
{ const stepGeo = new THREE.BoxGeometry(ST_X1 - ST_X0, 1, ST_RUN); const steps = new THREE.InstancedMesh(stepGeo, mat(0x1a1a20), ST_N); const m4 = new THREE.Matrix4();
  for (let i = 0; i < ST_N; i++) { const hgt = (i + 1) * BALC_Y / ST_N; m4.makeScale(1, hgt, 1).setPosition((ST_X0 + ST_X1) / 2, hgt / 2, ST_ZBOT + (i + .5) * ST_RUN); steps.setMatrixAt(i, m4); } scene.add(steps);
  const nose = new THREE.InstancedMesh(new THREE.BoxGeometry(ST_X1 - ST_X0, .025, .04), new THREE.MeshBasicMaterial({ color: LIME }), ST_N);
  for (let i = 0; i < ST_N; i++) { m4.makeTranslation((ST_X0 + ST_X1) / 2, (i + 1) * BALC_Y / ST_N + .013, ST_ZBOT + i * ST_RUN + .02); nose.setMatrixAt(i, m4); } scene.add(nose);
  const len = Math.hypot(ST_N * ST_RUN, BALC_Y); const rail = box(.05, .05, len, mat(0, LIME, 3), ST_X1, BALC_Y / 2 + 1, (ST_ZBOT + ST_ZTOP) / 2); rail.rotation.x = -Math.atan2(BALC_Y, ST_N * ST_RUN); }
function stairY(x, z) { return (x > ST_X0 - .2 && x < ST_X1 + .3 && z >= ST_ZBOT && z <= ST_ZTOP + .3) ? THREE.MathUtils.clamp((z - ST_ZBOT) / (ST_ZTOP - ST_ZBOT), 0, 1) * BALC_Y : null; }

// ---------- haze ----------
function hazeTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
const hTex = hazeTex(); const haze = [];
// fake bloom: additive gradient billboards (no postprocessing in XR)

function glow(color, size, pos, parent = scene, op = .8) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size); s.position.copy(pos); parent.add(s); return s; }
// LED wall halo: a big soft additive quad behind/around the wall so it reads through fog
const halo = new THREE.Mesh(new THREE.PlaneGeometry(22, 13), new THREE.MeshBasicMaterial({ map: glowTex, color: LIME, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
halo.position.set(0, 4.6, -D / 2 + .02); scene.add(halo);
const trimGlows = [glow(LIME, 3, new THREE.Vector3(-7, 8.15, -D / 2 + .3), scene, .4), glow(LIME, 3, new THREE.Vector3(7, 8.15, -D / 2 + .3), scene, .4), glow(LIME, 2.5, new THREE.Vector3(0, 1.8, -D / 2 + 4.9), scene, .35)];
for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: hTex, color: 0x8899aa, transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.position.set((Math.random() - .5) * W, 1 + Math.random() * 5, (Math.random() - .5) * D * .8); s.scale.setScalar(8 + Math.random() * 6); s.userData.v = (Math.random() - .5) * .2; scene.add(s); haze.push(s); }

// ---------- lasers ----------
const beamGeo = new THREE.CylinderGeometry(.02, .12, 1, 10, 1, true);
const coneGeo = new THREE.CylinderGeometry(.03, .9, 1, 12, 1, true); coneGeo.translate(0, -.5, 0); coneGeo.rotateX(-Math.PI / 2); beamGeo.translate(0, -.5, 0); beamGeo.rotateX(-Math.PI / 2); // points along -z... we use lookAt
const beamShader = { uniforms: { color: { value: new THREE.Color(LIME) }, op: { value: .5 }, soft: { value: 2. } },
  // soft falloff across the beam: brightest where the surface faces the eye (centre line), fading at the silhouette
  vertexShader: 'varying float vL; varying float vF; void main(){ vL = position.z; vec4 mv = modelViewMatrix*vec4(position,1.); vec3 n = normalize(normalMatrix*normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'uniform vec3 color; uniform float op; uniform float soft; varying float vL; varying float vF; void main(){ float along = (1.-vL)*(.35+.65*smoothstep(0.,.05,vL)); float across = pow(vF, soft); vec3 c = mix(color, vec3(1.), across*across*.35*step(soft,3.)); gl_FragColor = vec4(c*op*along*across, 1.); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
function makeRig(n, origin) { const g = new THREE.Group(); g.position.copy(origin); scene.add(g); const beams = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial(beamShader)); m.material.uniforms = THREE.UniformsUtils.clone(beamShader.uniforms); m.scale.set(1, 1, 26); m.frustumCulled = false; g.add(m); beams.push(m);
    const cone = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial(beamShader)); cone.material.uniforms = THREE.UniformsUtils.clone(beamShader.uniforms); cone.material.uniforms.soft.value = 4.; cone.frustumCulled = false; m.add(cone); m.userData.cone = cone; }
  g.userData.glow = glow(LIME, 1.6, new THREE.Vector3(), g, .9);
  return { g, beams }; }
const fanRig = makeRig(16, new THREE.Vector3(0, 7.8, -D / 2 + 2.5));
const gridL = makeRig(10, new THREE.Vector3(-W / 2 + .3, 6.5, -D / 2 + 3));
const gridR = makeRig(10, new THREE.Vector3(W / 2 - .3, 6.5, -D / 2 + 3));
const laserHeads = [fanRig.g.position, gridL.g.position, gridR.g.position].map(p => box(.6, .3, .4, mat(0x111, LIME, 1), p.x, p.y + .2, p.z));

// strobes
const strobes = []; for (let i = 0; i < 6; i++) { const s = box(1.2, .25, .25, new THREE.MeshBasicMaterial({ color: 0x222222 }), -7.5 + i * 3, H - .4, -D / 2 + 6); s.userData.glow = glow(0xffffff, 3.5, new THREE.Vector3(0, -.2, 0), s, 0); strobes.push(s); }
const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
flash.position.z = -.2; flash.renderOrder = 999; camera.add(flash);

// ---------- bots ----------
function makeLabel(text, color = '#fff', px = 40) { const c = document.createElement('canvas'); const g = c.getContext('2d'); g.font = `bold ${px}px monospace`;
  const w = Math.ceil(g.measureText(text).width) + 24; c.width = w; c.height = px + 20; g.font = `bold ${px}px monospace`;
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, w, c.height); g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 12, c.height / 2);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, fog: false })); s.scale.set(w / c.height * .3, .3, 1); return s; }
const BOTS = [ { name: 'PBM', color: 0x33ccff, style: 'bob', pos: [-2, -4] }, { name: 'edge lab', color: LIME, style: 'spin', pos: [1.5, -5] },
  { name: 'tech loom', color: 0xff44cc, style: 'robot', pos: [-.5, -1.5] }, { name: 'Ledger Lorraine', color: 0xffaa22, style: 'sway', pos: [2.5, -2] } ];
const bots = BOTS.map((b, i) => { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: .8, roughness: .4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .6, 4, 10), m); body.position.y = .75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), m); head.position.y = 1.45; g.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x000000 }); for (const x of [-.08, .08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.04, 6, 6), eyeM); e.position.set(x, 1.5, .19); g.add(e); }
  const arms = [-1, 1].map(s => { const a = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .45, 2, 6), m); a.geometry.translate(0, -.25, 0); a.position.set(s * .36, 1.15, 0); g.add(a); return a; });
  const tag = makeLabel(b.name, '#' + b.color.toString(16).padStart(6, '0'), 40); tag.position.y = 2.0; g.add(tag);
  const aura = glow(b.color, 1.8, new THREE.Vector3(0, 1, 0), g, .3); const eyeGlow = [-.08, .08].map(x => glow(0xffffff, .14, new THREE.Vector3(x, 1.5, .23), g, .9));
  const pivot = new THREE.Group(); while (g.children.length) pivot.add(g.children[0]); g.add(pivot); tag.removeFromParent(); g.add(tag);
  g.position.set(b.pos[0], 0, b.pos[1]); scene.add(g);
  return { ...b, g, pivot, body, head, arms, aura, eyeGlow, seed: i * 1.7, phase: Math.random() * 6.28, lag: .03 + Math.random() * .09, face: 0, glowE: 0 }; });
const bn = makeLabel('BOT NIGHT PREVIEW', '#a6ff00', 40); bn.position.set(0, 2.9, -3); bn.scale.multiplyScalar(1.6); scene.add(bn);

// ---------- cues ----------
const cues = new CueEngine();
const realism = applyRealism({ hemi, wash, bots, rigs: [fanRig, gridL, gridR], camera, hazeMap: hTex, scene, renderer, roomMats, bar, booth, balc, wallMat, W, D, H, LIME });
window.club = { cues, setVideoStream, clearVideo, scene, renderer, rig };
const host = initHost(window.club); const L = window.club.lights.state; // host mode: ?host or H key; club.lights.set/get/on, club.net hooks (host.js)

// ---------- controls ----------
const keys = {}; let yaw = 0, pitch = 0; const joy = { x: 0, y: 0 };
addEventListener('keydown', e => { keys[e.code] = true; if ('1230'.includes(e.key)) cues.force(['auto', 'open', 'build', 'drop'][+e.key]); if (e.code === 'KeyB') toBalcony(); });
addEventListener('keyup', e => keys[e.code] = false);
renderer.domElement.addEventListener('click', () => { if (!isTouch && !renderer.xr.isPresenting) renderer.domElement.requestPointerLock?.(); });
addEventListener('mousemove', e => { if (document.pointerLockElement) { yaw -= e.movementX * .0025; pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0025, -1.3, 1.3); } });
const isTouch = 'ontouchstart' in window; const joyEl = document.getElementById('joy'), knob = document.getElementById('knob');
if (isTouch) { joyEl.style.display = 'block';
  let jid = null, lid = null, lx = 0, ly = 0;
  addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (t.target.closest('#hud')) continue; if (t.clientX < innerWidth / 2 && jid === null) jid = t.identifier; else if (lid === null) { lid = t.identifier; lx = t.clientX; ly = t.clientY; } } }, { passive: true });
  addEventListener('touchmove', e => { for (const t of e.changedTouches) { if (t.identifier === jid) { const r = joyEl.getBoundingClientRect(); let x = (t.clientX - r.left - 55) / 55, y = (t.clientY - r.top - 55) / 55; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 35}px,${y * 35}px)`; }
    if (t.identifier === lid) { yaw -= (t.clientX - lx) * .005; pitch = THREE.MathUtils.clamp(pitch - (t.clientY - ly) * .005, -1.3, 1.3); lx = t.clientX; ly = t.clientY; } } }, { passive: true });
  addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === jid) { jid = null; joy.x = joy.y = 0; knob.style.transform = ''; } if (t.identifier === lid) lid = null; } });
}
function toBalcony() { rig.position.set(0, BALC_Y, D / 2 - 2); yaw = 0; }
function toFloor() { rig.position.set(0, 0, 9); }
let snapReady = true;
function move(dt) {
  let f = 0, s = 0, turn = 0;
  if (keys.KeyW || keys.ArrowUp) f++; if (keys.KeyS || keys.ArrowDown) f--; if (keys.KeyA || keys.ArrowLeft) s--; if (keys.KeyD || keys.ArrowRight) s++;
  f -= joy.y; s += joy.x;
  if (renderer.xr.isPresenting) { const sess = renderer.xr.getSession();
    for (const src of sess.inputSources) { const a = src.gamepad?.axes; if (!a) continue; const ax = a.length >= 4 ? a[2] : a[0], ay = a.length >= 4 ? a[3] : a[1];
      if (src.handedness === 'left') { s += ax; f -= ay; } else if (src.handedness === 'right') turn = ax; } 
    if (Math.abs(turn) > .7 && snapReady) { yaw -= Math.sign(turn) * Math.PI / 6; snapReady = false; } if (Math.abs(turn) < .3) snapReady = true;
    rig.rotation.y = yaw;
  } else { rig.rotation.y = yaw; camera.rotation.set(pitch, 0, 0); }
  if (!f && !s) return;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); const right = new THREE.Vector3(-dir.z, 0, dir.x);
  rig.position.addScaledVector(dir, f * 3.2 * dt).addScaledVector(right, s * 3.2 * dt);
  const p = rig.position; p.x = THREE.MathUtils.clamp(p.x, -W / 2 + .4, W / 2 - .6);
  const sy = stairY(p.x, p.z), wasHigh = p.y > BALC_Y - .5;
  if (sy !== null && (Math.abs(sy - p.y) < 1 || p.z > ST_ZTOP)) { p.y = sy; if (p.z > ST_ZTOP) p.y = BALC_Y; }
  else if (wasHigh) { p.z = THREE.MathUtils.clamp(p.z, D / 2 - 5.7, D / 2 - .6); p.y = BALC_Y; }
  else { p.z = THREE.MathUtils.clamp(p.z, -D / 2 + 5.6, D / 2 - .6); p.y = p.y > 1 && sy === null ? p.y : 0; if (sy === null) p.y = 0; }
}

// ---------- hand tracking ----------
const handTips = []; const hands = [0, 1].map(i => { const h = renderer.xr.getHand(i); rig.add(h); h.userData.tipGlow = glow(LIME, .06, new THREE.Vector3(), h, 0); h.userData.pinch = false; return h; });
function updateHands(dt) { handTips.length = 0; if (!renderer.xr.isPresenting) return;
  const sess = renderer.xr.getSession(); let moveF = 0;
  for (const src of sess.inputSources) { if (!src.hand) continue; const h = hands.find(x => x.userData.src === src) || hands[src.handedness === 'left' ? 0 : 1]; h.userData.src = src;
    const it = h.joints['index-finger-tip'], tt = h.joints['thumb-tip']; if (!it || !tt) continue;
    const ip = it.getWorldPosition(new THREE.Vector3()), tp = tt.getWorldPosition(new THREE.Vector3()); handTips.push(ip);
    h.userData.tipGlow.position.copy(it.position); h.userData.tipGlow.material.opacity = .8;
    const pinch = ip.distanceTo(tp) < .025;
    if (src.handedness === 'left' && pinch) moveF = 1;
    if (src.handedness === 'right' && pinch && !h.userData.pinch) yaw -= Math.PI / 6;
    h.userData.pinch = pinch; }
  if (moveF) { const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize(); rig.position.addScaledVector(dir, 2 * dt); } }

// ---------- HUD ----------
const $ = q => document.querySelector(q);
document.querySelectorAll('[data-src]').forEach(b => b.onclick = async () => { await cues.setSource(b.dataset.src); syncBtns(); });
document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => cues.force(b.dataset.f));
$('#filebtn').onclick = () => $('#file').click();
$('#file').onchange = async e => { if (e.target.files[0]) { await cues.setSource('file', e.target.files[0]); syncBtns(); } };
$('#balc').onclick = toBalcony; $('#floor').onclick = toFloor; $('#hide').onclick = () => { $('#help').hidden = !$('#help').hidden; };
addEventListener('dragover', e => { e.preventDefault(); $('#drop').style.display = 'flex'; });
addEventListener('dragleave', () => $('#drop').style.display = 'none');
addEventListener('drop', async e => { e.preventDefault(); $('#drop').style.display = 'none'; const f = e.dataTransfer.files[0]; if (f) { await cues.setSource('file', f); syncBtns(); } });
function syncBtns() { document.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === cues.source || (cues.source === 'file' && b.dataset.src === 'demo' && false))); }

// ---------- render loop ----------
const clock = new THREE.Clock(); const tmpC = new THREE.Color(); const target = new THREE.Vector3();
let lastSec = '', lt = 0, flashV = 0, lastBeat = -1, beatPulse = 0, strobeT = 0, strobeOn = false;
function drawWall(t, st) { const g = wctx, w = wallCanvas.width, h = wallCanvas.height, S = w / 512; const e = st.intensity;
  g.globalCompositeOperation = 'source-over'; g.fillStyle = `rgba(0,0,0,${st.section === 'drop' ? .35 : .15})`; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter'; const n = st.section === 'open' ? 6 : st.section === 'build' ? 6 + Math.floor(st.buildProgress * 18) : 24;
  for (let i = 0; i < n; i++) { const a = t * (.3 + e) + i / n * Math.PI * 2; const r = (40 + 80 * e + 20 * Math.sin(t * 2 + i) + beatPulse * 30) * S;
    g.strokeStyle = i % 3 ? `hsla(${(80 + i * 12 + t * 20) % 360},100%,55%,.8)` : '#a6ff00'; g.lineWidth = (3 + beatPulse * 4) * S;
    g.beginPath(); for (let k = 0; k <= 6; k++) { const b = a + k / 6 * Math.PI * 2; const x = w / 2 + Math.cos(b) * r, y = h / 2 + Math.sin(b) * r * .9; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  if (st.section === 'drop' && Math.random() < .3) { const y = Math.random() * h; g.drawImage(wallCanvas, 0, y, w, 12, (Math.random() - .5) * 60, y, w, 12); }
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1); // LED scanlines
  g.globalCompositeOperation = 'source-over'; g.font = `bold ${30 * S}px monospace`; g.lineWidth = 6 * S; g.strokeStyle = '#000'; const lbl = 'HELIX // ' + st.section.toUpperCase(); g.strokeText(lbl, 18 * S, 40 * S); g.fillStyle = '#d4ff6a'; g.fillText(lbl, 18 * S, 40 * S);
  ledTex.needsUpdate = true; }

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime; const st = cues.update(dt);
  lt += L.freeze ? 0 : dt * L.speed; host.tick(st); // laser clock: K2 speed, P5 freeze
  updateHands(dt); move(dt);
  if (st.section !== lastSec) { lastSec = st.section; $('#sec').textContent = st.section.toUpperCase(); if (st.section === 'drop') flashV = .45; }
  $('#bpm').textContent = `${Math.round(st.bpm)} bpm · ${cues.source}`;
  if (st.beatCount !== lastBeat) { lastBeat = st.beatCount; beatPulse = 1; if (st.section === 'drop' && st.beatCount % 2 === 0) flashV = Math.max(flashV, .18); }
  beatPulse *= Math.pow(.02, dt); const beatPh = st.beatPhase;
  // lasers: fan
  const sec = st.section; const fanN = sec === 'open' ? 2 : sec === 'build' ? [2, 4, 8, 16][Math.min(3, Math.floor(st.buildProgress * 4))] : 16;
  fanRig.beams.forEach((m, i) => { m.visible = i < fanN; if (!m.visible) return;
    const spread = sec === 'open' ? .8 : sec === 'build' ? .7 : 1.3; const k = fanN === 1 ? 0 : i / (fanN - 1) - .5;
    const sweep = L.motion * (sec === 'open' ? Math.sin(lt * .35) * .5 : sec === 'build' ? Math.sin(lt * (1 + st.buildProgress * 3)) * .35 : Math.sin(lt * 4 + i) * .2);
    const ang = k * spread * 2 + sweep; target.set(fanRig.g.position.x + Math.sin(ang) * 20, sec === 'drop' ? (i % 2 ? .3 : 3) : 1.2 + Math.sin(lt * .5 + i) * .8 * L.motion, fanRig.g.position.z + Math.cos(ang) * 20);
    m.lookAt(target); m.material.uniforms.op.value = (sec === 'open' ? .35 + .2 * Math.sin(t * 1.2) : sec === 'build' ? .5 : .9) * (1 + beatPulse * .6);
    m.material.uniforms.color.value.setHSL(sec === 'drop' ? (i % 3 === 0 ? .23 : (t * .1 + i * .07) % 1) : .23, 1, sec === 'drop' && i % 4 === 0 ? .8 : .5); });
  [gridL, gridR].forEach((rg, side) => rg.beams.forEach((m, i) => { m.visible = sec === 'drop' || (sec === 'build' && st.buildProgress > .75 && i % 3 === 0);
    if (!m.visible) return; const sx = side ? -1 : 1; target.set(sx * W * .9, .4 + (i % 5) * 1.3 + Math.sin(lt * 6 + i) * .2 * L.motion, -D / 2 + 3 + Math.floor(i / 5) * 14 + (i % 5) * 2.5);
    m.lookAt(target); m.material.uniforms.op.value = .7 + beatPulse * .3; m.material.uniforms.color.value.setHex(i % 2 ? LIME : 0xff2266); }));
  // strobes
  const rate = sec === 'open' ? 0 : sec === 'build' ? 1 + st.buildProgress * 14 : 10; strobeT += dt * rate;
  if (strobeT >= 1) { strobeT = 0; strobeOn = true; } else if (strobeT > .25) strobeOn = false;
  strobes.forEach((s, i) => s.material.color.setHex(strobeOn && (sec === 'drop' || i % 2 === st.beatCount % 2) ? 0xffffff : 0x1a1a1a));
  if (sec === 'drop' && strobeOn) flashV = Math.max(flashV, .08);
  strobes.forEach(s => { const on = s.material.color.r > .5; s.userData.glow.material.opacity = on ? .9 : 0; });
  halo.material.opacity = .22 + st.intensity * .25 + beatPulse * .15; trimGlows.forEach(gw => gw.material.opacity = .25 + beatPulse * .35);
  [fanRig, gridL, gridR].forEach((rg, k) => rg.g.userData.glow.material.opacity = k ? (sec === 'drop' ? .9 : .15) : .5 + beatPulse * .5);
  [fanRig, gridL, gridR].forEach(rg => rg.beams.forEach(m => { const c = m.userData.cone.material.uniforms; c.color.value.copy(m.material.uniforms.color.value); c.op.value = m.material.uniforms.op.value * (sec === 'drop' ? .035 : .07); }));
  flash.material.opacity = flashV * .6; flashV *= Math.pow(.0005, dt);
  hemi.intensity = sec === 'open' ? .2 + .08 * Math.sin(t * 1.3) : .25 + (strobeOn ? 1.5 : 0) + beatPulse * .3;
  wash.intensity = (sec === 'open' ? 10 + 8 * Math.sin(t * .8) : sec === 'build' ? 15 + 25 * st.buildProgress : 45) * (1 + beatPulse);
  // floor
  for (let i = 0; i < PN * PM; i++) { const a = Math.floor(i / PM), b = i % PM; let v;
    if (sec === 'open') v = .08 + .08 * Math.sin(t * .8 + a * .5 + b * .3);
    else if (sec === 'build') v = ((a + b + lastBeat) % 4 === 0 ? .6 : .05) * (.4 + st.buildProgress);
    else v = ((a ^ b ^ lastBeat) & 1 ? 1 : .15) * (.4 + beatPulse * .6);
    tmpC.setHex(LIME).multiplyScalar(v); floorPanels.setColorAt(i, tmpC); } floorPanels.instanceColor.needsUpdate = true;
  haze.forEach(h => { h.position.x += h.userData.v * dt; if (Math.abs(h.position.x) > W / 2) h.userData.v *= -1; h.material.opacity = sec === 'drop' ? .1 : .06; });
  boothBtns.forEach((b, i) => b.material.emissiveIntensity = (i === lastBeat % 8 ? 3 : .4));
  // bots
  const amp = sec === 'open' ? .4 : sec === 'build' ? .6 + st.buildProgress * .4 : 1.2; const phBase = (st.beatCount + beatPh) * Math.PI;
  const camW = camera.getWorldPosition(new THREE.Vector3());
  bots.forEach(b => { // look at nearest viewer (outer group), dance on inner pivot with per-bot beat lag + idle bob
    const viewers = [camW, ...handTips]; let best = camW, bd = 1e9; for (const v of viewers) { const d = v.distanceToSquared(b.g.position); if (d < bd) { bd = d; best = v; } }
    const want = Math.atan2(best.x - b.g.position.x, best.z - b.g.position.z); let dA = want - b.face; dA = Math.atan2(Math.sin(dA), Math.cos(dA)); b.face += dA * Math.min(1, dt * 2.5); b.g.rotation.y = b.face;
    const g = b.pivot; g.rotation.set(0, 0, 0); let armA = 0; const ph = phBase - b.lag * st.bpm / 60 * Math.PI;
    g.position.y = .04 * Math.sin(t * 1.6 + b.phase);
    b.head.rotation.set(Math.sin(t * .9 + b.phase) * .08, Math.sin(t * .5 + b.phase) * .25, 0);
    switch (b.style) {
      case 'bob': g.position.y += Math.abs(Math.sin(ph)) * .18 * amp; armA = Math.sin(ph * 2) * amp; break;
      case 'spin': g.rotation.y = t * (sec === 'drop' ? 6 : 1.2); g.position.y += sec === 'drop' ? Math.abs(Math.sin(ph)) * .5 : 0; armA = 1.4 * amp; break;
      case 'robot': g.rotation.y = Math.round(Math.sin(ph / 2)) * .6 * amp; armA = (lastBeat % 2 ? 1.5 : -.2) * amp; break;
      case 'sway': g.rotation.z = Math.sin(ph / 2) * .2 * amp; armA = sec === 'drop' ? 2.8 : Math.sin(ph / 2) * .5; break; }
    b.arms[0].rotation.z = -armA; b.arms[1].rotation.z = armA * (b.style === 'robot' ? -1 : 1);
    const e = st.intensity * (.6 + .4 * beatPulse); b.glowE += (e - b.glowE) * Math.min(1, dt * 6);
    b.body.material.emissiveIntensity = .35 + b.glowE * 1.6; b.aura.material.opacity = .12 + b.glowE * .55; b.aura.scale.setScalar(1.4 + b.glowE * 1.2);
    b.eyeGlow.forEach(s => s.material.opacity = .5 + b.glowE * .5); });
  drawWall(t, st); realism(t, st, beatPulse); applyLights();
  renderer.render(scene, camera);
});
// host lights post-pass (after realism so Vision Pro Bot's colours are the base): K1 energy, K3 palette, P4 invert, P6 clear = blackout
const hsl = {}, wallBase = wallMat.color.clone();
function applyLights() { const e = L.blackout ? 0 : L.energy, hue = (L.palette + (L.invert ? .5 : 0)) % 1;
  [fanRig, gridL, gridR].forEach(rg => { rg.g.userData.glow.material.opacity *= e; rg.beams.forEach(m => { if (!m.visible) return; if (L.blackout) { m.visible = false; return; }
    for (const u of [m.material.uniforms, m.userData.cone.material.uniforms]) { u.op.value *= e; if (hue) { u.color.value.getHSL(hsl); u.color.value.setHSL((hsl.h + hue) % 1, hsl.s, hsl.l); } } }); });
  if (e !== 1) { hemi.intensity *= e; wash.intensity *= e; strobes.forEach(s => s.userData.glow.material.opacity *= e); halo.material.opacity *= e; flash.material.opacity *= Math.min(1, e); }
  wallMat.color.copy(wallBase).multiplyScalar(L.blackout ? .02 : 1);
  if (L.blackout || L.invert) { for (let i = 0; i < PN * PM; i++) { floorPanels.getColorAt(i, tmpC); if (L.blackout) tmpC.setRGB(0, 0, 0); else tmpC.setRGB(1 - tmpC.r, 1 - tmpC.g, 1 - tmpC.b).multiplyScalar(.5); floorPanels.setColorAt(i, tmpC); } floorPanels.instanceColor.needsUpdate = true; } }
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
