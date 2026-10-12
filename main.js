// Helix Void: a near-black space, lasers + lights all around and overhead, Helix drives the flow (helix-link.js)
// and the fan lasers trace Helix's picture (trace.js). One curved surround screen shows the Helix frame.
import * as THREE from 'three';
import { VRButton } from './vendor/webxr/VRButton.js';
import { CueEngine } from './cues.js';
import { initHelixLink } from './helix-link.js';
import { createTracer } from './trace.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true; renderer.xr.setFoveation?.(1);
document.body.appendChild(renderer.domElement); document.body.appendChild(VRButton.createButton(renderer));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000001);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, .05, 200);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig); camera.position.y = 1.65;
const PAL = [new THREE.Color(0x2a5cff), new THREE.Color(0xffffff), new THREE.Color(0xff2aa0)];
const R = 11, TOP = 11;

// ---- floor: near-black, slightly glossy so beams read on it (1 draw) ----
const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050508, roughness: .35, metalness: .6 }));
scene.add(floor); const fl = new THREE.PointLight(0x2a5cff, 30, 30, 1.5); fl.position.set(0, 6, 0); scene.add(fl); scene.add(new THREE.HemisphereLight(0x101830, 0, .3));

// ---- surround screen: 200° arc of the Helix frame (canvas fallback until a Helix share/video arrives) (1 draw) ----
const sc = document.createElement('canvas'); sc.width = 768; sc.height = 256; const sg = sc.getContext('2d');
const scTex = new THREE.CanvasTexture(sc); scTex.colorSpace = THREE.SRGBColorSpace;
const screenMat = new THREE.MeshBasicMaterial({ map: scTex, side: THREE.BackSide, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const arc = Math.PI * 200 / 180;
const screen = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 7, 48, 1, true, Math.PI - arc / 2, arc), screenMat); screen.position.y = 4.5; scene.add(screen);
function setVideoStream(src) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.loop = true; if (src instanceof MediaStream) v.srcObject = src; else v.src = src; v.play();
  const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; screenMat.map = vt; screenMat.needsUpdate = true; }
function clearVideo() { screenMat.map = scTex; screenMat.needsUpdate = true; }
function drawFallback(t, st) { const w = sc.width, h = sc.height; sg.globalCompositeOperation = 'source-over'; sg.fillStyle = 'rgba(0,0,0,.2)'; sg.fillRect(0, 0, w, h);
  sg.globalCompositeOperation = 'lighter'; const n = st.section === 'drop' ? 9 : st.section === 'build' ? 5 : 3;
  for (let i = 0; i < n; i++) { const x = w * (.5 + .42 * Math.sin(t * (.4 + i * .13) + i * 2.1)), y = h * (.5 + .38 * Math.sin(t * (.7 + i * .09) + i));
    const gr = sg.createRadialGradient(x, y, 0, x, y, 26); gr.addColorStop(0, '#' + PAL[i % 3].getHexString()); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(x - 26, y - 26, 52, 52); }
  scTex.needsUpdate = true; }

// ---- lasers: proxies (Object3D) mirrored into ONE instanced beam mesh + ONE instanced haze-cone mesh ----
const beamGeo = new THREE.CylinderGeometry(.015, .1, 1, 8, 1, true).translate(0, -.5, 0).rotateX(-Math.PI / 2);
const coneGeo = new THREE.CylinderGeometry(.03, .8, 1, 10, 1, true).translate(0, -.5, 0).rotateX(-Math.PI / 2);
const VS = `attribute vec3 iColor; attribute float iOp; varying vec3 vC; varying float vO; varying float vL; varying float vF;
void main(){ vC = iColor; vO = iOp; vL = position.z; mat4 mvm = modelViewMatrix*instanceMatrix; vec4 mv = mvm*vec4(position,1.); vF = abs(dot(normalize(mat3(mvm)*normal), normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`;
const FS = p => `varying vec3 vC; varying float vO; varying float vL; varying float vF; void main(){ float along = (1.-vL)*(.35+.65*smoothstep(0.,.05,vL)); float a = pow(vF, ${p}); gl_FragColor = vec4(mix(vC, vec3(1.), a*a*.3)*vO*along*a, 1.); }`;
const mkIM = (geo, p, n) => { const g = geo.clone(); const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), op = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  g.setAttribute('iColor', col); g.setAttribute('iOp', op); const im = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(p), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), n);
  im.frustumCulled = false; im.col = col; im.op = op; scene.add(im); return im; };
const proxyRoot = new THREE.Group(); // never rendered
const rigs = [];
function mkRig(n, pos) { const g = new THREE.Group(); g.position.copy(pos); proxyRoot.add(g); const beams = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Object3D(); m.scale.set(1, 1, 40); m.visible = true; m.userData.op = 0; m.userData.col = new THREE.Color(); m.userData.cone = true; g.add(m); beams.push(m); }
  const r = { g, beams }; rigs.push(r); return r; }
const fan = mkRig(16, new THREE.Vector3(0, 7, -R)); // traces Helix's picture
const ring = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ring.push(mkRig(4, new THREE.Vector3(Math.sin(a) * R, .3, Math.cos(a) * R))); } // 360 around the viewer
const over = mkRig(12, new THREE.Vector3(0, TOP, 0)); // overhead
const NB = rigs.reduce((s, r) => s + r.beams.length, 0);
const beamIM = mkIM(beamGeo, '2.', NB), coneIM = mkIM(coneGeo, '4.', NB);

// emitter glows (1 draw): instanced camera-facing quads
const gc = document.createElement('canvas'); gc.width = gc.height = 64; { const g = gc.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(.25, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
const glowGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); const NG = rigs.length + 8;
const gPos = new THREE.InstancedBufferAttribute(new Float32Array(NG * 3), 3), gCol = new THREE.InstancedBufferAttribute(new Float32Array(NG * 4), 4); glowGeo.setAttribute('iPos', gPos); glowGeo.setAttribute('iCol', gCol); glowGeo.instanceCount = NG;
const glows = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({ uniforms: { map: { value: new THREE.CanvasTexture(gc) } },
  vertexShader: 'attribute vec3 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec4 vC; void main(){ vUv = uv; vC = iCol; vec4 mv = viewMatrix*vec4(iPos,1.); mv.xy += position.xy*iCol.a*2.5; gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'uniform sampler2D map; varying vec2 vUv; varying vec4 vC; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb*vC.rgb*t.a, 1.); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glows.frustumCulled = false; scene.add(glows);
// overhead strobe ring positions (part of the glow batch, last 8 instances)
const strobePos = [...Array(8)].map((_, k) => { const a = k / 8 * Math.PI * 2 + .39; return new THREE.Vector3(Math.sin(a) * 6, TOP - .5, Math.cos(a) * 6); });

// ---- cues: Helix is the source of truth when linked; sim otherwise ----
const cues = new CueEngine();
const club = window.club = { cues, scene, renderer, rig, camera, setVideoStream, clearVideo };
initHelixLink(club);
const tracer = createTracer({ fan, wallMat: screenMat, W: 22, D: 2 * R, H: TOP }); club.tracer = tracer;

// ---- controls: drag to look (desktop), VR head look; club.look(yaw, pitch) for scripts ----
let yaw = 0, pitch = 0, drag = null;
renderer.domElement.addEventListener('pointerdown', e => drag = [e.clientX, e.clientY]); addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag[0]) * .004; pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag[1]) * .004, -1.5, 1.5); drag = [e.clientX, e.clientY]; });
club.look = (y, p) => { yaw = y; pitch = p; };
addEventListener('keydown', e => { if ('1230'.includes(e.key)) cues.force(['auto', 'open', 'build', 'drop'][+e.key]); if (e.code === 'KeyF') fpsOn = !fpsOn; });
document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => cues.force(b.dataset.f));
document.getElementById('hide').onclick = () => document.getElementById('hud').style.display = 'none';

// ---- loop ----
const clock = new THREE.Clock(); const tgt = new THREE.Vector3(); let lastBeat = -1, pulse = 0, lastStrobe = -1, strobeV = 0, fpsOn = /[?&]fps/.test(location.search), frames = 0, acc = 0;
const MAX_STROBE_HZ = 3; // photosensitivity cap: at most 3 flashes per second, and flash brightness capped
const secEl = document.getElementById('sec'), infoEl = document.getElementById('info');
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime; const st = cues.update(dt), sec = st.section;
  if (!renderer.xr.isPresenting) { rig.rotation.y = yaw; camera.rotation.set(pitch, 0, 0); }
  if (st.beatCount !== lastBeat) { lastBeat = st.beatCount; pulse = 1; } pulse *= Math.pow(.02, dt);
  const I = st.intensity, bp = st.buildProgress;
  // fan (trace.js aims it at Helix's bright spots; this sets visibility, colour, brightness)
  const fanN = sec === 'open' ? 4 : sec === 'build' ? [4, 8, 12, 16][Math.min(3, Math.floor(bp * 4))] : 16;
  fan.beams.forEach((m, i) => { m.visible = i < fanN; m.userData.col.copy(PAL[sec === 'drop' ? (i + (lastBeat >> 1)) % 3 : sec === 'build' ? (i % 4 ? 0 : 1) : 0]); m.userData.op = (.25 + .6 * I) * (1 + pulse * .5); });
  // ring around the viewer: slow wide fans in open, multiplying in build, all + fast in drop
  const ringOn = sec === 'open' ? 1 : sec === 'build' ? 1 + Math.floor(bp * 3.99) : 4, sp = sec === 'open' ? .3 : sec === 'build' ? .6 + bp * 2 : 2.4;
  ring.forEach((r, k) => { const out = Math.atan2(r.g.position.x, r.g.position.z) + Math.PI; // facing inward over the viewer
    r.beams.forEach((m, i) => { m.visible = i < ringOn; if (!m.visible) return; const a = out + (i - 1.5) * .35 + Math.sin(t * sp + k) * .5;
      tgt.set(r.g.position.x + Math.sin(a) * 20, 1.5 + 4 * (.5 + .5 * Math.sin(t * sp * .7 + i + k)), r.g.position.z + Math.cos(a) * 20); m.lookAt(tgt);
      m.userData.col.copy(PAL[sec === 'drop' ? (k + i) % 3 : sec === 'build' ? (k & 1 ? 2 : 0) : 0]); m.userData.op = (.2 + .55 * I) * (1 + pulse * .6); }); });
  // overhead: a slowly turning crown pointing down/outward, tightening on build, spinning in drop
  over.beams.forEach((m, i) => { const on = sec !== 'open' || i % 3 === 0; m.visible = on; if (!on) return; const a = i / 12 * Math.PI * 2 + t * (sec === 'drop' ? 1.2 : .15);
    const rad = sec === 'build' ? 9 - bp * 6 : sec === 'drop' ? 4 + 4 * Math.abs(Math.sin(t * 2 + i)) : 10; tgt.set(Math.sin(a) * rad, 0, Math.cos(a) * rad); m.lookAt(tgt);
    m.userData.col.copy(PAL[sec === 'drop' ? 1 + (i & 1) : 0]); m.userData.op = (.15 + .5 * I) * (1 + pulse * .4); });
  proxyRoot.updateMatrixWorld(true);
  tracer.update(null, dt); proxyRoot.updateMatrixWorld(true);
  // mirror proxies into the two instanced meshes
  let k = 0; for (const r of rigs) for (const m of r.beams) { if (!m.visible) continue; beamIM.setMatrixAt(k, m.matrixWorld); coneIM.setMatrixAt(k, m.matrixWorld);
    const c = m.userData.col, o = m.userData.op; beamIM.col.setXYZ(k, c.r, c.g, c.b); coneIM.col.setXYZ(k, c.r, c.g, c.b); beamIM.op.setX(k, o); coneIM.op.setX(k, o * .06); k++; }
  beamIM.count = coneIM.count = k; for (const im of [beamIM, coneIM]) im.instanceMatrix.needsUpdate = im.col.needsUpdate = im.op.needsUpdate = true;
  // capped strobes: rate from the section, never above MAX_STROBE_HZ
  const hz = Math.min(MAX_STROBE_HZ, sec === 'drop' ? 3 : sec === 'build' ? bp * 2.5 : 0); const slot = hz ? Math.floor(t * hz) : -1;
  if (slot !== lastStrobe) { lastStrobe = slot; if (hz) strobeV = .85; } strobeV *= Math.pow(.0002, dt);
  rigs.forEach((r, i) => { gPos.setXYZ(i, r.g.position.x, r.g.position.y, r.g.position.z); const c = r === fan ? PAL[1] : PAL[sec === 'drop' ? i % 3 : 0]; const a = (.3 + .5 * I) * (1 + pulse * .5); gCol.setXYZW(i, c.r * a, c.g * a, c.b * a, r === over ? 1.6 : .9); });
  strobePos.forEach((p, j) => { const i = rigs.length + j; gPos.setXYZ(i, p.x, p.y, p.z); const v = (sec === 'drop' || j % 2 === (lastStrobe & 1)) ? strobeV : 0; gCol.setXYZW(i, v, v, v, 1.4); });
  gPos.needsUpdate = gCol.needsUpdate = true;
  fl.color.copy(PAL[sec === 'drop' ? lastBeat % 3 : 0]); fl.intensity = (8 + 30 * I) * (1 + pulse) + strobeV * 40;
  screenMat.opacity = .3 + .35 * I + pulse * .1;
  if (screenMat.map === scTex) drawFallback(t, st);
  renderer.render(scene, camera);
  secEl.textContent = sec.toUpperCase(); acc += dt; frames++;
  if (acc > .5) { infoEl.textContent = `${Math.round(st.bpm)} bpm · ${club.helix.live && performance.now() - club.helix.at < 2000 ? 'HELIX' : cues.source}` + (fpsOn ? ` · ${(frames / acc).toFixed(0)} fps · ${renderer.info.render.calls} calls` : ''); acc = 0; frames = 0; }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
