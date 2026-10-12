// Draw-call batching for Quest. main.js keeps animating its original objects (they act as
// data sources); here they are moved to a hidden layer and mirrored into a few InstancedMeshes.
import * as THREE from 'three';
const HIDDEN = 5;
const visibleChain = o => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };

// ---- lasers: 36 beams + 36 cones -> 2 draw calls ----
const laserVS = `attribute vec3 iColor; attribute float iOp; attribute float iSoft; varying vec3 vC; varying float vO; varying float vS; varying float vL; varying float vF;
void main(){ vC = iColor; vO = iOp; vS = iSoft; vL = position.z; mat4 mvm = modelViewMatrix*instanceMatrix; vec4 mv = mvm*vec4(position,1.);
  vec3 n = normalize(mat3(mvm)*normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix*mv; }`;
const laserFS = `varying vec3 vC; varying float vO; varying float vS; varying float vL; varying float vF;
void main(){ float along = (1.-vL)*(.35+.65*smoothstep(0.,.05,vL)); float across = pow(vF, vS); vec3 c = mix(vC, vec3(1.), across*across*.35*step(vS,3.)); gl_FragColor = vec4(c*vO*along*across, 1.); }`;
function laserBatch(srcMeshes, geo) {
  const n = srcMeshes.length; const g = geo.clone();
  const mat = new THREE.ShaderMaterial({ vertexShader: laserVS, fragmentShader: laserFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(g, mat, n); im.frustumCulled = false;
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), op = new THREE.InstancedBufferAttribute(new Float32Array(n), 1), soft = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  [col, op, soft].forEach(a => a.setUsage(THREE.DynamicDrawUsage)); g.setAttribute('iColor', col); g.setAttribute('iOp', op); g.setAttribute('iSoft', soft);
  srcMeshes.forEach(m => m.layers.set(HIDDEN));
  im.sync = () => { let k = 0; for (const m of srcMeshes) { if (!visibleChain(m)) continue; const u = m.material.uniforms;
      im.setMatrixAt(k, m.matrixWorld); col.setXYZ(k, u.color.value.r, u.color.value.g, u.color.value.b); op.setX(k, u.op.value); soft.setX(k, u.soft.value); k++; }
    im.count = k; im.instanceMatrix.needsUpdate = col.needsUpdate = op.needsUpdate = soft.needsUpdate = true; };
  return im;
}

// ---- additive glow sprites -> one instanced billboard per texture ----
const bbVS = `attribute vec4 iCol; attribute vec3 iPos; attribute float iScale; varying vec2 vUv; varying vec4 vC;
void main(){ vUv = uv; vC = iCol; vec4 mv = viewMatrix*vec4(iPos,1.); mv.xy += position.xy*iScale; gl_Position = projectionMatrix*mv; }`;
const bbFS = `uniform sampler2D map; uniform vec3 tint; varying vec2 vUv; varying vec4 vC; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb*vC.rgb*tint*t.a*vC.a, 1.); }`;
function spriteBatch(sprites, map) {
  const n = sprites.length; const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); g.instanceCount = 0;
  const col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), pos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), sc = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  [col, pos, sc].forEach(a => a.setUsage(THREE.DynamicDrawUsage)); g.setAttribute('iCol', col); g.setAttribute('iPos', pos); g.setAttribute('iScale', sc);
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: map }, tint: { value: new THREE.Color(1, 1, 1) } }, vertexShader: bbVS, fragmentShader: bbFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
  sprites.forEach(s => s.layers.set(HIDDEN));
  const v = new THREE.Vector3(), s3 = new THREE.Vector3(), q = new THREE.Quaternion();
  mesh.sync = () => { let k = 0; for (const s of sprites) { if (!visibleChain(s) || s.material.opacity <= .003) continue;
      s.matrixWorld.decompose(v, q, s3); const c = s.material.color; col.setXYZW(k, c.r, c.g, c.b, s.material.opacity); pos.setXYZ(k, v.x, v.y, v.z); sc.setX(k, s3.x); k++; }
    g.instanceCount = k; col.needsUpdate = pos.needsUpdate = sc.needsUpdate = true; mesh.visible = k > 0; };
  return mesh;
}

// ---- static meshes sharing a material -> InstancedMesh ----
function staticBatch(scene, meshes, material) {
  if (!meshes.length) return null; scene.updateMatrixWorld(true);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, meshes.length); const m4 = new THREE.Matrix4();
  meshes.forEach((o, i) => { const p = o.geometry.parameters; m4.makeScale(p.width, p.height, p.depth).premultiply(o.matrixWorld); im.setMatrixAt(i, m4); o.removeFromParent(); });
  scene.add(im); return im;
}

export function batchScene({ scene, rigs, staticGroups = [] }) {
  scene.updateMatrixWorld(true);
  const beams = rigs.flatMap(r => r.beams), cones = beams.map(b => b.userData.cone);
  const lb = laserBatch(beams, beams[0].geometry), lc = laserBatch(cones, cones[0].geometry); scene.add(lb, lc);
  const byTex = new Map();
  scene.traverse(o => { if (o.isSprite && o.material.blending === THREE.AdditiveBlending && o.material.map) { const k = o.material.map; if (!byTex.has(k)) byTex.set(k, []); byTex.get(k).push(o); } });
  const sb = [...byTex].map(([map, list]) => { const m = spriteBatch(list, map); scene.add(m); return m; });
  staticGroups.forEach(([meshes, mat]) => staticBatch(scene, meshes, mat));
  return { sprites: sb, sync() { scene.updateMatrixWorld(); lb.sync(); lc.sync(); sb.forEach(m => m.sync()); } };
}
