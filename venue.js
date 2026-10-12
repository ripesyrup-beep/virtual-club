// "The Studio at The Bomb Factory"-inspired layout (Deep Ellum, Dallas). Sources + what is guessed: ../ref/bomb-studio/notes.md
// Black-box room, full-width raised stage with LED wall behind, rows of lighting truss with moving heads,
// flown line arrays either side of the stage, exposed black steel joists, one bar on the left of the stage.
import * as THREE from 'three';

export function applyVenue({ scene, booth, bar, wallMat, W, D, H, metalMat }) {
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
    if (Math.abs(p.x - (W / 2 - .7)) < .01 && Math.abs(p.z - 4) < .01) p.set(-(W / 2 - .7), 4, bz);       // BAR sign
    else if (Math.abs(p.x - (W / 2 - 1.2)) < .01 && Math.abs(p.z - 4) < .01) p.set(-(W / 2 - 1.2), 1.3, bz); }); // bar glow

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  // ---- exposed steel joists + ducts on a black ceiling (1 + 1 draw) ----
  const nJ = Math.floor(D / 1.6);
  const joists = new THREE.InstancedMesh(new THREE.BoxGeometry(W, .45, .1), black, nJ);
  for (let i = 0; i < nJ; i++) joists.setMatrixAt(i, m4.makeTranslation(0, H - .25, -D / 2 + .8 + i * 1.6)); scene.add(joists);
  const ductGeo = new THREE.CylinderGeometry(.35, .35, D - 2, 12); ductGeo.rotateX(Math.PI / 2);
  const ducts = new THREE.InstancedMesh(ductGeo, new THREE.MeshStandardMaterial({ color: 0x1b1b1e, metalness: .8, roughness: .45 }), 2);
  ducts.setMatrixAt(0, m4.makeTranslation(-W / 2 + 2.5, H - .9, 0)); ducts.setMatrixAt(1, m4.makeTranslation(W / 2 - 2.5, H - .9, 0)); scene.add(ducts);

  // ---- flown line arrays left/right of the stage (1 draw) ----
  const LA = 8, la = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, .32, .7), black, LA * 2);
  for (let k = 0; k < LA * 2; k++) { const side = k < LA ? -1 : 1, i = k % LA; q.setFromAxisAngle(v.set(1, 0, 0), -.03 * i * i * .25);
    la.setMatrixAt(k, m4.compose(v.set(side * (ST_W / 2 + .6), H - 2.2 - i * .33, ST_Z + ST_D / 2 + .3 + i * i * .012), q, s.set(1, 1, 1))); } scene.add(la);
  // stage-front subs / wedges (1 draw)
  const subs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, .7, .8), black, 6);
  [-7.2, -6, 6, 7.2, -1, 1].forEach((x, i) => subs.setMatrixAt(i, m4.makeTranslation(x, i < 4 ? .35 : ST_H + .2, i < 4 ? ST_Z + ST_D / 2 + .5 : ST_Z + ST_D / 2 - .5))); subs.count = 4; scene.add(subs);

  // ---- moving heads on every truss row (bodies 1 draw, lenses 1 draw) ----
  const rows = [-D / 2 + 2.5, -D / 2 + 5.5, -D / 2 + 9.5, -2, 5], per = 7, NH = rows.length * per;
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(.32, .38, .3), metalMat, NH);
  const lens = new THREE.InstancedMesh(new THREE.CircleGeometry(.11, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }), NH);
  const hp = [];
  rows.forEach((z, r) => { for (let i = 0; i < per; i++) { const x = -8.4 + i * 2.8; hp.push([x, z]); heads.setMatrixAt(r * per + i, m4.makeTranslation(x, H - 2.05, z)); lens.setMatrixAt(r * per + i, m4.makeTranslation(x, H - 2.25, z)); } });
  lens.setColorAt(0, new THREE.Color()); scene.add(heads, lens);

  const c = new THREE.Color();
  return function update(t, st, beatPulse) {
    const sec = st.section;
    for (let i = 0; i < NH; i++) { const r = Math.floor(i / per), k = i % per;
      if (sec === 'open') c.set(0x2a4dff).multiplyScalar(.5 + .5 * Math.sin(t * 1.2 + k * .6 + r));
      else if (sec === 'build') c.set((k + st.beatCount) % 3 ? 0x2a4dff : 0xff2aa0).multiplyScalar(.2 + st.buildProgress * (((k + r + st.beatCount) & 1) ? 1.4 : .3));
      else c.set((i + st.beatCount) % 3 === 0 ? 0xffffff : (r & 1 ? 0x18b4ff : 0xff2aa0)).multiplyScalar(.4 + beatPulse * 1.6);
      lens.setColorAt(i, c); }
    lens.instanceColor.needsUpdate = true;
  };
}
