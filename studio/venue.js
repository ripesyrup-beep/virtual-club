// "The Studio at The Bomb Factory"-inspired layout (Deep Ellum, Dallas). Sources + what is guessed: ../ref/bomb-studio/notes.md
// Black-box room, full-width raised stage with LED wall behind, rows of lighting truss with moving heads,
// flown line arrays either side of the stage, exposed black steel joists, one bar on the left of the stage.
import * as THREE from 'three';

export function applyVenue({ scene, booth, bar, balc, rigs, wallMat, W, D, H, LIME, metalMat }) {
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: .6, metalness: .2 });
  // ---- stage: full-width-ish deck ~1 m high (estimate from photos), black front, thin white nosing ----
  const ST_W = 16, ST_D = 5.4, ST_H = 1.0, ST_Z = -D / 2 + ST_D / 2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(ST_W, ST_H, ST_D), new THREE.MeshStandardMaterial({ color: 0x151517, roughness: .45, metalness: .1 }));
  deck.position.set(0, ST_H / 2, ST_Z); scene.add(deck);
  booth.position.y = ST_H; booth.position.z = ST_Z + .4;

  // ---- LED wall: 24' x 13' spec on BF Events' page is ~7.3 x 4 m; photos show it filling the upstage, so we use 11 x 6 m (guess) ----
  let wall, halo, bezel;
  scene.children.forEach(o => { if (!o.isMesh) return; const p = o.geometry.parameters || {};
    if (o.material === wallMat) wall = o;
    else if (p.width === 22 && p.height === 13) halo = o;
    else if (p.width === 14.5 && p.height === 7.5) bezel = o;
    else if (p.width === 14.4 && p.height === .12) o.visible = false; }); // drop the v0 lime trim bars
  const LW = 11, LH = 6, LY = ST_H + .5 + LH / 2;
  if (wall) { wall.scale.set(LW / 14, LH / 7, 1); wall.position.y = LY; }
  if (bezel) { bezel.scale.set((LW + .4) / 14.5, (LH + .4) / 7.5, 1); bezel.position.y = LY; }
  if (halo) { halo.scale.set(.8, .75, 1); halo.position.y = LY; halo.material.color.set(0x7090ff); }

  // ---- bar: reviewers place the one main bar to the left of the stage ----
  const bx = W / 2 - 2.2, bz = -7;
  bar.position.set(-bx, 0, bz); bar.rotation.y = Math.PI;
  scene.children.forEach(o => { if (!o.isSprite) return; const p = o.position;
    if (Math.abs(p.x - (W / 2 - .7)) < .01 && Math.abs(p.z - 4) < .01) { p.set(-(W / 2 - .7), 4, bz); o.userData.relabel = ['BAR', '#ffffff', 64]; } // BAR sign
    else if (Math.abs(p.x) < .01 && Math.abs(p.y - 2.9) < .01 && Math.abs(p.z + 3) < .01) o.userData.relabel = ['BOT NIGHT', '#c8d2ff', 40];
    else if (Math.abs(p.x - (W / 2 - 1.2)) < .01 && Math.abs(p.z - 4) < .01) { p.set(-(W / 2 - 1.2), 1.3, bz); o.material.color.set(0xffa040); } }); // bar glow

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  // ---- exposed steel joists + ducts on a black ceiling (1 + 1 draw) ----
  const blk = []; // [x,y,z, sx,sy,sz, rotX]
  const nJ = Math.floor(D / 1.6);
  for (let i = 0; i < nJ; i++) blk.push([0, H - .25, -D / 2 + .8 + i * 1.6, W, .45, .1, 0]);           // steel joists
  const LA = 8;
  for (let k = 0; k < LA * 2; k++) { const side = k < LA ? -1 : 1, i = k % LA;                            // flown line arrays
    blk.push([side * (ST_W / 2 + .6), H - 2.2 - i * .33, ST_Z + ST_D / 2 + .3 + i * i * .012, 1.1, .32, .7, -.03 * i * i * .25]); }
  [-7.2, -6, 6, 7.2].forEach(x => blk.push([x, .35, ST_Z + ST_D / 2 + .5, 1.2, .7, .8, 0]));               // subs
  const blackIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), black, blk.length);
  blk.forEach((b, i) => blackIM.setMatrixAt(i, m4.compose(v.set(b[0], b[1], b[2]), q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), b[6]), s.set(b[3], b[4], b[5]))));
  scene.add(blackIM);
  const ductGeo = new THREE.CylinderGeometry(.35, .35, D - 2, 12); ductGeo.rotateX(Math.PI / 2);
  const ducts = new THREE.InstancedMesh(ductGeo, new THREE.MeshStandardMaterial({ color: 0x1b1b1e, metalness: .8, roughness: .45 }), 2);
  ducts.setMatrixAt(0, m4.makeTranslation(-W / 2 + 2.5, H - .9, 0)); ducts.setMatrixAt(1, m4.makeTranslation(W / 2 - 2.5, H - .9, 0)); scene.add(ducts);

  // ---- balcony restyled as a raised VIP / FOH sound-booth riser: black deck, steel rail, subtle blue under-lip LED ----
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: .28 });
  balc.children.forEach(o => { if (!o.isMesh) return; const p = o.geometry.parameters || {};
    if (p.width === W && p.depth === 6) o.material = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: .5, metalness: .2 });
    else if (p.height === .06 && p.depth === .06) o.material = steel;                // top rail (was lime)
    else if (p.width === 1.2) o.material = black; });                               // support pillars
  const lip = new THREE.Mesh(new THREE.BoxGeometry(W, .03, .03), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a4dff).multiplyScalar(.9), toneMapped: false }));
  lip.position.set(0, -.32, -3.02); balc.add(lip);
  // FOH desk on the riser (mixing console silhouette) + a tiny lime Helix accent LED
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.2, .9, 1), black); desk.position.set(0, .45, -1.6); balc.add(desk);
  const deskLed = new THREE.Mesh(new THREE.BoxGeometry(3, .02, .02), new THREE.MeshBasicMaterial({ color: 0x6f9a10 })); deskLed.position.set(0, .91, -2.1); // (lime desk LED dropped to save a draw call; lime accent stays on the DJ booth)
  const relabel = (spr, text, css, px = 40) => { const cv = document.createElement('canvas'); const g = cv.getContext('2d'); g.font = `bold ${px}px monospace`; const w = Math.ceil(g.measureText(text).width) + 24; cv.width = w; cv.height = px + 20;
    g.font = `bold ${px}px monospace`; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 0, w, cv.height); g.fillStyle = css; g.textBaseline = 'middle'; g.fillText(text, 12, cv.height / 2);
    const asp = spr.scale.y; spr.material.map?.dispose(); spr.material.map = new THREE.CanvasTexture(cv); spr.material.needsUpdate = true; spr.scale.set(w / cv.height * asp, asp, 1); };
  balc.children.forEach(o => { if (o.isSprite) relabel(o, 'VIP · FOH RISER', '#c8d2ff', 28); });
  // stair nosings: lime -> cool white
  scene.children.forEach(o => { if (o.isInstancedMesh && o.count === 14 && o.material.isMeshBasicMaterial) o.material.color.set(0x8090b0); });

  // ---- moving heads on every truss row (bodies 1 draw, lenses 1 draw) ----
  const rows = [-D / 2 + 2.5, -D / 2 + 5.5, -D / 2 + 9.5, -2, 5], per = 7, NH = rows.length * per;
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .38, .3), metalMat, NH);
  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(.11, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }), NH);
  const hp = [];
  rows.forEach((z, r) => { for (let i = 0; i < per; i++) { const x = -8.4 + i * 2.8; hp.push([x, z]); heads.setMatrixAt(r * per + i, m4.makeTranslation(x, H - 2.05, z)); lens.setMatrixAt(r * per + i, m4.makeTranslation(x, H - 2.25, z)); } });
  lens.setColorAt(0, new THREE.Color()); scene.add(heads, lens);

  const PAL = [new THREE.Color(0x2a5cff), new THREE.Color(0xffffff), new THREE.Color(0xff2aa0)];
  let floor = null; scene.children.forEach(o => { if (o.isInstancedMesh && o.count === 80) floor = o; });
  // laser head housings: lime emissive -> dark steel
  scene.children.forEach(o => { if (o.isMesh && o.geometry.parameters?.width === .6 && o.geometry.parameters?.height === .3) { o.material.emissive.set(0x0a0f22); } });
  // any remaining lime emissive trims outside the DJ booth (stair rail, rail posts, laser heads) -> dim show blue
  const lime = new THREE.Color(LIME);
  scene.traverse(o => { if (!o.isMesh || !o.material.emissive) return; let x = o; while (x && x !== booth) x = x.parent; if (x === booth) return;
    if (o.material.emissive.equals(lime)) { o.material.emissive.set(0x2a4dff); o.material.emissiveIntensity = Math.min(o.material.emissiveIntensity, 1.2); } });
  bar.traverse(o => { if (o.isMesh && o.material.isMeshBasicMaterial && o.material.color.equals(lime)) o.material.color.set(0xffb060); }); // bar edge strip -> warm
  scene.children.forEach(o => { if (o.isSprite && Math.abs(o.position.y - 8.15) < .05 && Math.abs(Math.abs(o.position.x) - 7) < .05) o.material.color.set(0x5a7cff); }); // LED-wall corner glows
  scene.children.forEach(o => { if (o.isSprite && o.userData.relabel) relabel(o, ...o.userData.relabel); });
  const c = new THREE.Color();
  const update = function (t, st, beatPulse) {
    const sec = st.section;
    for (let i = 0; i < NH; i++) { const r = Math.floor(i / per), k = i % per;
      if (sec === 'open') c.set(0x2a4dff).multiplyScalar(.5 + .5 * Math.sin(t * 1.2 + k * .6 + r));
      else if (sec === 'build') c.set((k + st.beatCount) % 3 ? 0x2a4dff : 0xff2aa0).multiplyScalar(.2 + st.buildProgress * (((k + r + st.beatCount) & 1) ? 1.4 : .3));
      else c.set((i + st.beatCount) % 3 === 0 ? 0xffffff : (r & 1 ? 0x18b4ff : 0xff2aa0)).multiplyScalar(.4 + beatPulse * 1.6);
      lens.setColorAt(i, c); }
    lens.instanceColor.needsUpdate = true;
    // show palette override for v0's lime floor panels + lasers (main.js sets them each frame, we recolour after)
    if (floor) { for (let i = 0; i < floor.count; i++) { floor.getColorAt(i, c); const lv = c.g; // main writes LIME*v -> g == v
        const a = Math.floor(i / 10), b = i % 10; const pk = sec === 'open' ? 0 : sec === 'build' ? ((a + b) & 1 ? 0 : 2) : (a + b + st.beatCount) % 3;
        floor.setColorAt(i, c.copy(PAL[pk]).multiplyScalar(lv * (pk === 1 ? .8 : 1.1))); } floor.instanceColor.needsUpdate = true; }
    rigs.forEach((rg, r) => rg.beams.forEach((m, i) => { const pk = sec === 'open' ? 0 : sec === 'build' ? (i % 4 === 0 ? 1 : 0) : (r ? (i % 2 ? 2 : 1) : (i + Math.floor(st.beatCount / 2)) % 3);
      m.material.uniforms.color.value.copy(PAL[pk]); m.userData.cone.material.uniforms.color.value.copy(PAL[pk]); }));
    rigs.forEach(rg => rg.g.userData.glow.material.color.copy(PAL[sec === 'drop' ? 1 : 0]));
  };
  update.lens = lens;
  return update;
}
