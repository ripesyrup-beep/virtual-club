// Realism layer for Helix Club (Quest-friendly): CC0 PBR textures, precomputed env map,
// canvas-baked lightmaps, instanced truss, fake glossy-floor reflection, haze spot cones.
// No post-processing, no shadows, no new dynamic lights.
import * as THREE from 'three';
import { batchScene } from './batch.js';
import { applyVenue } from './venue.js';

const loader = new THREE.TextureLoader();
function pbr(name, rx, ry, aniso) {
  const t = k => { const x = loader.load(`./tex/${name}_${k}.jpg`); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.set(rx, ry); x.anisotropy = aniso; if (k === 'col') x.colorSpace = THREE.SRGBColorSpace; return x; };
  return { map: t('col'), normalMap: t('nrm'), roughnessMap: t('rgh') };
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function applyRealism(c) {
  const { hemi, wash, bots, rigs, camera, hazeMap, scene, renderer, roomMats, bar, booth, balc, wallMat, W, D, H, LIME } = c;
  const aniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;

  // ---- precomputed environment (one-time PMREM of a tiny emissive "club" scene) ----
  const env = new THREE.Scene(); env.background = new THREE.Color(0x010102);
  const em = (col, w, h, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); };
  em(new THREE.Color(0x6a8cff).multiplyScalar(2.2), 11, 6, 0, 4.3, -D / 2);          // LED wall
  em(new THREE.Color(0xff2266).multiplyScalar(1.2), 6, .3, -W / 2, 6, -4, Math.PI / 2);
  em(new THREE.Color(0x33ccff).multiplyScalar(1.2), 6, .3, W / 2, 6, -4, Math.PI / 2);
  for (let i = 0; i < 2; i++) em(new THREE.Color(0x9ab0ff).multiplyScalar(.8), .25, D * .6, -6 + i * 3, H - .1, 0, 0, Math.PI / 2); // ceiling strips
  em(new THREE.Color(0xffb060).multiplyScalar(2), .4, 8, W / 2 - 1, 1.3, 4, Math.PI / 2, 0);   // bar back-light
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03, 0.1, 100).texture; pm.dispose();
  env.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

  // ---- baked-style lightmaps (canvas, generated once) ----
  const floorLM = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#1a1a1e'; g.fillRect(0, 0, w, h);
    const pool = (x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    g.globalCompositeOperation = 'lighter'; pool(w / 2, h * .98, w * .7, 'rgba(40,70,210,.9)'); pool(w * .92, h * .4, w * .3, 'rgba(160,100,40,.7)'); pool(w / 2, h * .55, w * .35, 'rgba(70,70,90,.6)');
    g.globalCompositeOperation = 'multiply'; const v = g.createRadialGradient(w / 2, h / 2, w * .3, w / 2, h / 2, w * .75); v.addColorStop(0, '#fff'); v.addColorStop(1, '#333'); g.fillStyle = v; g.fillRect(0, 0, w, h); });
  const wallLM = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#202024'); gr.addColorStop(.6, '#55555e'); gr.addColorStop(.92, '#8a8a90'); gr.addColorStop(1, '#303034'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

  // room: 0 +x wall, 1 -x wall, 2 ceiling, 3 floor, 4 +z wall, 5 -z (behind LED)
  const brickSide = pbr('brick', D / 2.4, H / 2.4, aniso), brickEnd = pbr('brick', W / 2.4, H / 2.4, aniso);
  const set = (i, p) => { const m = roomMats[i]; m.map?.dispose?.(); Object.assign(m, p); m.color.set(0xffffff); m.needsUpdate = true; };
  set(0, { ...brickSide, roughness: 1, metalness: 0, lightMap: wallLM, lightMapIntensity: 2.2, envMapIntensity: .5 });
  set(1, { ...brickSide, roughness: 1, metalness: 0, lightMap: wallLM, lightMapIntensity: 2.2, envMapIntensity: .5 });
  set(4, { ...brickEnd, roughness: 1, metalness: 0, lightMap: wallLM, lightMapIntensity: 2.2, envMapIntensity: .5 });
  [0, 1, 4].forEach(i => roomMats[i].color.set(0x4a4a52)); // brick painted dark (venue walls read near-black in photos)
  set(5, { ...pbr('foam', W / 1.2, H / 1.2, aniso), roughness: 1, metalness: 0, lightMap: wallLM, lightMapIntensity: 1.2, envMapIntensity: .3 });
  set(2, { ...pbr('concrete', W / 4, D / 4, aniso), roughness: 1, metalness: 0, envMapIntensity: .15 }); roomMats[2].color.set(0x0c0c0e);
  // glossy polished concrete: low roughness + env map does the reflective look, no extra render pass
  const fl = pbr('concrete', W / 2, D / 2, aniso);
  set(3, { ...fl, roughness: .32, metalness: .0, lightMap: floorLM, lightMapIntensity: 1.6, envMapIntensity: 1.6, normalScale: new THREE.Vector2(.22, .22) });
  roomMats[3].color.set(0x8a8a8e);

  // ---- fake LED-wall reflection on the floor (one additive quad, samples the live wall texture/video) ----
  const reflMat = new THREE.ShaderMaterial({ uniforms: { map: { value: wallMat.map }, nrm: { value: fl.normalMap }, op: { value: .5 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform sampler2D map; uniform sampler2D nrm; uniform float op; varying vec2 vUv; void main(){ vec2 n = texture2D(nrm, vUv*vec2(4.,3.)).xy-.5; vec2 uv = vec2(vUv.x + n.x*.03, 1.-vUv.y*.9 + n.y*.04); vec3 c = texture2D(map, uv, 2.5).rgb; float fade = pow(1.-vUv.y, 2.2) * smoothstep(0.,.12,vUv.x) * smoothstep(1.,.88,vUv.x); gl_FragColor = vec4(c*fade*op, 1.); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(15, 12), reflMat); refl.rotation.x = -Math.PI / 2; refl.position.set(0, .012, -D / 2 + 6); refl.renderOrder = 1; scene.add(refl);
  // flip so vUv.y=0 is at the wall
  refl.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = 1 - v; }); refl.geometry.attributes.uv.needsUpdate = true;

  // ---- instanced metal truss (one draw call) ----
  const metal = pbr('metal', 1, 6, aniso);
  const trussMat = new THREE.MeshStandardMaterial({ ...metal, color: 0x9a9aa2, metalness: 1, roughness: .55, envMapIntensity: 1.2 });
  const tube = new THREE.CylinderGeometry(.025, .025, 1, 6, 1);
  const parts = []; const S = .3, segL = 1;
  const addRun = (ax, ay, az, dir, len) => { // box truss along dir ('x'|'z')
    const n = Math.round(len / segL);
    for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push({ a: [ax, ay, az], dir, u: u * S / 2, v: v * S / 2, len, chord: true });
    for (let i = 0; i < n; i++) for (const [u, v, u2, v2] of [[-1, -1, -1, 1], [1, -1, 1, 1], [-1, 1, 1, 1], [-1, -1, 1, -1]]) parts.push({ a: [ax, ay, az], dir, i, u: u * S / 2, v: v * S / 2, u2: u2 * S / 2, v2: v2 * S / 2, len });
  };
  // Studio-style: rows of truss running across the room over stage + floor (from show photos)
  for (const z of [-D / 2 + 2.5, -D / 2 + 5.5, -D / 2 + 9.5, -2, 5]) addRun(0, H - 1.6, z, 'x', W - 3);
  const truss = new THREE.InstancedMesh(tube, trussMat, parts.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const P = (p, s, u, v) => p.dir === 'z' ? new THREE.Vector3(p.a[0] + u, p.a[1] + v, p.a[2] - p.len / 2 + s) : new THREE.Vector3(p.a[0] - p.len / 2 + s, p.a[1] + v, p.a[2] + u);
  parts.forEach((p, k) => { let A, B; if (p.chord) { A = P(p, 0, p.u, p.v); B = P(p, p.len, p.u, p.v); } else { A = P(p, p.i * segL, p.u, p.v); B = P(p, (p.i + 1) * segL, p.u2, p.v2); }
    const d = B.clone().sub(A), L = d.length(); q.setFromUnitVectors(up, d.normalize()); m4.compose(A.clone().lerp(B, .5).add(d.multiplyScalar(0)), q, new THREE.Vector3(1, L, 1)); m4.setPosition(A.clone().add(B).multiplyScalar(.5)); truss.setMatrixAt(k, m4); });
  scene.add(truss);

  // ---- bar: wood, metal, instanced glass bottles ----
  const wood = pbr('wood', 1, 4, aniso), woodTop = pbr('wood', .5, 4, aniso);
  const kids = bar.children.filter(o => o.isMesh);
  const [barBody, barTop, barBack] = kids;
  barBody.material = new THREE.MeshStandardMaterial({ ...wood, color: 0x6a4a36, roughness: .8, envMapIntensity: .6 });
  barTop.material = new THREE.MeshStandardMaterial({ ...woodTop, color: 0x8a5a3a, roughness: .25, envMapIntensity: 1.4 });
  barBack.material = new THREE.MeshStandardMaterial({ ...pbr('metal', 2, 2, aniso), color: 0x303034, metalness: .9, roughness: .45 });
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.03, .03, 8.1), new THREE.MeshBasicMaterial({ color: LIME })); edge.position.set(-.66, 1.08, 0); bar.add(edge);
  const bottlesOld = kids.filter(o => o.geometry.type === 'CylinderGeometry' && o.material.isMeshBasicMaterial);
  const stools = kids.filter(o => o.geometry.type === 'CylinderGeometry' && !o.material.isMeshBasicMaterial);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .04, metalness: 0, transparent: true, opacity: .55, envMapIntensity: 3, emissive: 0x111111, depthWrite: false });
  const bottleGeo = new THREE.LatheGeometry([[0, 0], [.08, 0], [.085, .02], [.085, .26], [.07, .31], [.028, .36], [.028, .46], [.032, .47], [0, .47]].map(p => new THREE.Vector2(p[0], p[1])), 10);
  const NB = 30; const bottles = new THREE.InstancedMesh(bottleGeo, glassMat, NB); const col = new THREE.Color();
  for (let i = 0; i < NB; i++) { m4.makeTranslation(1.25 + (i % 2) * .08, 1.4 + Math.floor(i / 15) * .8 - .2, -3.6 + (i % 15) * .5); bottles.setMatrixAt(i, m4); bottles.setColorAt(i, col.setHSL([.08, .3, .55, .95, .12][i % 5], .7, .45)); }
  bottlesOld.forEach(o => o.removeFromParent()); bar.add(bottles);
  for (const y of [1.15, 1.95]) { const sh = new THREE.Mesh(new THREE.BoxGeometry(.35, .03, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .05, transparent: true, opacity: .3, envMapIntensity: 3 })); sh.position.set(1.3, y, 0); bar.add(sh); }
  const stoolMat = new THREE.MeshStandardMaterial({ ...metal, color: 0xb0b0b8, metalness: 1, roughness: .3 }); stools.forEach(s => s.material = stoolMat);
  // backlit shelf glow (baked-looking, additive)
  const blm = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.4), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  blm.rotation.y = -Math.PI / 2; blm.position.set(1.39, 1.8, 0); bar.add(blm);

  // ---- booth + balcony get metal / concrete ----
  const boothMetal = new THREE.MeshStandardMaterial({ ...pbr('metal', 2, 1, aniso), color: 0x55555c, metalness: .9, roughness: .4 });
  booth.children.slice(0, 2).forEach(o => o.material = boothMetal);
  const balcMat = new THREE.MeshStandardMaterial({ ...pbr('concrete', 6, 2, aniso), color: 0x55555a, roughness: .7 });
  if (balc.children[0]) balc.children[0].material = balcMat;
  balc.children.filter(o => o.isMesh && o.geometry.parameters?.width === .05).forEach(o => o.material = stoolMat);

  // ---- haze spot cones from the truss: instanced (cones 1 draw, cans 1, floor pools 1) ----
  const HL = H - 1.6, NS = 12;
  const coneGeo = new THREE.ConeGeometry(1.6, HL, 20, 1, true); coneGeo.translate(0, -HL / 2, 0);
  const sCol = new THREE.InstancedBufferAttribute(new Float32Array(NS * 3), 3); sCol.setUsage(THREE.DynamicDrawUsage); coneGeo.setAttribute('iColor', sCol);
  const coneMat = new THREE.ShaderMaterial({
    vertexShader: 'attribute vec3 iColor; varying vec3 vC; varying float vY; varying float vF; void main(){ vC = iColor; vY = position.y; mat4 mvm = modelViewMatrix*instanceMatrix; vec4 mv = mvm*vec4(position,1.); vF = abs(dot(normalize(mat3(mvm)*normal), normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }',
    fragmentShader: `varying vec3 vC; varying float vY; varying float vF; void main(){ float a = smoothstep(${(-HL).toFixed(2)}, 0., vY); gl_FragColor = vec4(vC*pow(vF,1.5)*(.25+a*a*(1.4-a)), 1.); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const spotIM = new THREE.InstancedMesh(coneGeo, coneMat, NS); spotIM.frustumCulled = false; scene.add(spotIM);
  const canIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .18, .35, 10), boothMetal, NS); scene.add(canIM);
  const poolTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.6, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const poolGeo = new THREE.PlaneGeometry(3.4, 3.4); poolGeo.rotateX(-Math.PI / 2);
  const poolIM = new THREE.InstancedMesh(poolGeo, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), NS); poolIM.frustumCulled = false; scene.add(poolIM);
  const sCols = [0x2a4dff, 0xffffff, 0x18b4ff, 0xff2aa0, 0xffffff, 0x2a4dff, 0x2a4dff, 0xffffff, 0x18b4ff, 0xff2aa0, 0xffffff, 0x2a4dff].map(c => new THREE.Color(c));
  const spots = sCols.map((base, i) => { const o = new THREE.Object3D(); o.position.set(-7.5 + (i % 6) * 3, H - 1.8, i < 6 ? -D / 2 + 5.5 : -D / 2 + 9.5); o.updateMatrix(); m4.copy(o.matrix); m4.elements[13] += .1; canIM.setMatrixAt(i, m4); return { o, base }; });
  poolIM.setColorAt(0, new THREE.Color());

  // ---- static batching: balcony posts share one material ----
  const posts = balc.children.filter(o => o.isMesh && o.material === stoolMat);

  // ---- LED wall: pixel-grid / sub-pixel look + bezel (keeps wallMat so the Helix video hook still works) ----
  wallMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 px = vMapUv*vec2(224.,112.); vec2 f = fract(px)-.5; float dotm = smoothstep(.5,.28,max(abs(f.x),abs(f.y)));
        float seam = step(.015, fract(vMapUv.x*4.)) * step(.02, fract(vMapUv.y*2.));
        diffuseColor.rgb = diffuseColor.rgb*(.25+1.15*dotm)*mix(.35,1.,seam) + vec3(.004,.006,.004); }`); };
  wallMat.needsUpdate = true;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(14.5, 7.5, .25), new THREE.MeshStandardMaterial({ color: 0x0b0b0d, metalness: .8, roughness: .5 })); bezel.position.set(0, 4.6, -D / 2 + .02 - .13); scene.add(bezel);

  // ---- bot avatars: glossy shells + glowing visor + floor halo ring ----
  const ringTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 14, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.55, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const ringGeo = new THREE.PlaneGeometry(1.4, 1.4); ringGeo.rotateX(-Math.PI / 2);
  const ringIM = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), bots.length); ringIM.frustumCulled = false; scene.add(ringIM);
  const visorGeo = new THREE.SphereGeometry(.225, 16, 6, -.9, 1.8, 1.25, .5);
  bots.forEach(b => { const m = b.body.material; m.roughness = .22; m.metalness = .35; m.envMapIntensity = 1.6;
    const v = new THREE.Mesh(visorGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); v.position.copy(b.head.position); b.pivot.add(v); b.visor = v;
    b.head.children.length; });

  // ---- FPS / draw-call HUD (F key or button; ?fps in URL). Also shows in VR on a camera-attached panel. ----
  const fpsC = document.createElement('canvas'); fpsC.width = 256; fpsC.height = 64; const fctx = fpsC.getContext('2d');
  const fpsTex = new THREE.CanvasTexture(fpsC);
  const fpsPanel = new THREE.Mesh(new THREE.PlaneGeometry(.16, .04), new THREE.MeshBasicMaterial({ map: fpsTex, transparent: true, depthTest: false, toneMapped: false, fog: false }));
  fpsPanel.position.set(-.06, -.07, -.3); fpsPanel.renderOrder = 1000; camera.add(fpsPanel);
  const fpsDiv = document.createElement('div'); fpsDiv.style.cssText = 'position:fixed;right:10px;top:10px;z-index:7;background:#000b;color:#a6ff00;font:12px ui-monospace,monospace;padding:6px 8px;border:1px solid #a6ff0055;border-radius:6px;white-space:pre';
  document.body.appendChild(fpsDiv);
  let fpsOn = /[?&]fps/.test(location.search); const showFps = () => { fpsDiv.style.display = fpsPanel.visible = fpsOn ? '' : 'none'; fpsPanel.visible = fpsOn; }; showFps();
  const btn = document.createElement('button'); btn.textContent = 'FPS'; btn.onclick = () => { fpsOn = !fpsOn; showFps(); btn.classList.toggle('on', fpsOn); };
  document.getElementById('hud')?.appendChild(btn);
  addEventListener('keydown', e => { if (e.code === 'KeyF') btn.onclick(); });
  // in VR: press left controller's X button (gamepad button 4) to toggle
  let xPrev = false; const pollX = () => { const s = renderer.xr.getSession?.(); if (!s) return; for (const src of s.inputSources) if (src.handedness === 'left' && src.gamepad) { const p = !!src.gamepad.buttons[4]?.pressed; if (p && !xPrev) btn.onclick(); xPrev = p; } };
  let frames = 0, acc = 0, fps = 0, lastT = performance.now();
  const info = renderer.info.render;

  const venue = applyVenue({ ...c, metalMat: boothMetal });
  const batch = batchScene({ scene, rigs, staticGroups: [[posts, stoolMat]] });
  const hazeBatch = batch.sprites.find(m => m.material.uniforms.map.value === hazeMap);

  const tmp = new THREE.Color(), dn = new THREE.Vector3(), hz = new THREE.Color(), LIMEc = new THREE.Color(LIME);
  return function update(t, st, beatPulse) {
    const sec = st.section, e = st.intensity;
    // drop/build tuning: less flat green wash, colour that moves with the song
    hemi.intensity *= sec === 'drop' ? .35 : .55;
    wash.intensity *= sec === 'drop' ? .35 : .6;
    if (sec === 'drop') wash.color.setHSL([.63, .0, .9, .55][Math.floor(st.beatCount / 4) % 4], Math.floor(st.beatCount / 4) % 4 === 1 ? 0 : 1, .55); else if (sec === 'build') wash.color.set(0x2040ff).lerp(tmp.set(0xff2aa0), st.buildProgress * .6); else wash.color.set(0x2040ff);
    if (hazeBatch) { if (sec === 'drop') hz.setHSL((t * .05 + .6) % 1, .5, .5).multiplyScalar(.6); else if (sec === 'build') hz.set(0x8866aa).multiplyScalar(.8 + st.buildProgress * .5); else hz.set(0x4a66cc); hazeBatch.material.uniforms.tint.value.copy(hz); }
    reflMat.uniforms.map.value = wallMat.map; // follows the canvas or Helix video
    reflMat.uniforms.op.value = .35 + e * .4 + beatPulse * .25;
    roomMats[3].lightMapIntensity = 1.2 + e * .6 + beatPulse * .5;
    roomMats[3].envMapIntensity = sec === 'drop' ? 1.8 + beatPulse : 1.4;
    roomMats[2].color.set(0x0c0c0e);
    spots.forEach(({ o, base }, i) => { const sp = sec === 'open' ? .25 : sec === 'build' ? .6 + st.buildProgress * 1.4 : 3;
      o.rotation.set(Math.cos(t * sp * .8 + i) * .3, 0, Math.sin(t * sp + i * 1.3) * (sec === 'drop' ? .55 : .35)); o.updateMatrix(); spotIM.setMatrixAt(i, o.matrix);
      const on = sec === 'drop' ? ((st.beatCount + i) % 2 === 0 ? 1 : .3) : sec === 'build' ? (i < 2 + st.buildProgress * 4 ? 1 : .15) : .6;
      const c = sec === 'open' ? tmp.set(0x2a4dff).lerp(base, .25) : tmp.copy(base);
      const k = (.05 + .07 * on) * (1 + beatPulse * .8); sCol.setXYZ(i, c.r * k, c.g * k, c.b * k);
      dn.set(0, -1, 0).applyEuler(o.rotation); const d = -o.position.y / dn.y; m4.makeTranslation(o.position.x + dn.x * d, .015, o.position.z + dn.z * d); poolIM.setMatrixAt(i, m4);
      poolIM.setColorAt(i, c.multiplyScalar(.35 * on * (1 + beatPulse))); });
    spotIM.instanceMatrix.needsUpdate = sCol.needsUpdate = poolIM.instanceMatrix.needsUpdate = poolIM.instanceColor.needsUpdate = true;
    // bots: breathing idle + beat squash/stretch on top of main.js dance; visor + floor ring pulse
    bots.forEach((b, i) => { const br = 1 + Math.sin(t * 1.9 + b.phase) * .025; const sq = beatPulse * (sec === 'open' ? .03 : sec === 'build' ? .06 : .12);
      b.pivot.scale.set(br + sq * .5, br - sq, br + sq * .5);
      b.visor.material.color.setRGB(1, 1, 1).lerp(tmp.set(b.color), .4).multiplyScalar(.6 + b.glowE * 1.2 + (sec === 'drop' && (st.beatCount + i) % 4 === 0 ? 1 : 0));
      m4.makeScale(1 + b.glowE * .8, 1, 1 + b.glowE * .8).setPosition(b.g.position.x, .02, b.g.position.z); ringIM.setMatrixAt(i, m4);
      ringIM.setColorAt(i, tmp.set(b.color).multiplyScalar(.25 + b.glowE * .9)); });
    ringIM.instanceMatrix.needsUpdate = ringIM.instanceColor.needsUpdate = true;
    venue(t, st, beatPulse);
    batch.sync();
    // fps hud
    pollX(); const now = performance.now(); acc += now - lastT; lastT = now; frames++;
    if (acc > 500) { fps = frames * 1000 / acc; frames = 0; acc = 0; if (fpsOn) { const txt = `${fps.toFixed(0)} fps  ${info.calls} calls  ${(info.triangles / 1000).toFixed(1)}k tris`;
        fpsDiv.textContent = txt; fctx.clearRect(0, 0, 256, 64); fctx.fillStyle = 'rgba(0,0,0,.6)'; fctx.fillRect(0, 0, 256, 64); fctx.fillStyle = fps < 70 ? '#ff4466' : '#a6ff00'; fctx.font = 'bold 22px monospace'; fctx.fillText(txt.replace('  ', ' ').slice(0, 22), 8, 26); fctx.font = '18px monospace'; fctx.fillText(sec.toUpperCase(), 8, 52); fpsTex.needsUpdate = true; } }
  };
}
