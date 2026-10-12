// Laser path tracing: the fan lasers aim at what Helix draws. Helix exposes no path/geometry data
// (only clock/flow/knobs on /api/clock and a JPEG of the frame), so we read the picture itself:
// the LED wall texture (Helix video share, or the canvas fallback) is downsampled each frame, the brightest
// separated spots are found, and each visible fan beam follows one spot, projected onto the room like a
// laser projector tracing the image. Freeze (host) holds the targets; motion scales how far beams travel.
import * as THREE from 'three';
const GW = 48, GH = 27;

export function createTracer({ fan, wallMat, W, D, H }) {
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH; const g = cv.getContext('2d', { willReadFrequently: true });
  const targets = fan.beams.map((_, i) => new THREE.Vector3((i / 15 - .5) * W, 2, D / 2));
  const want = targets.map(v => v.clone()); const tmp = new THREE.Vector3(); let frame = 0, ok = true;
  const tracer = { enabled: !/[?&]notrace/.test(location.search), spots: [],
    update(L, dt) {
      if (!tracer.enabled || !ok) return;
      const img = wallMat.map?.image; if (!img || (img.readyState !== undefined && img.readyState < 2)) return;
      if (!(L?.freeze) && (frame++ & 1) === 0) {
        try { g.drawImage(img, 0, 0, GW, GH); } catch (e) { ok = false; console.info('[trace] frame not readable', e.message); return; }
        const d = g.getImageData(0, 0, GW, GH).data; const lum = new Float32Array(GW * GH);
        for (let i = 0; i < GW * GH; i++) lum[i] = d[i * 4] * .3 + d[i * 4 + 1] * .55 + d[i * 4 + 2] * .15;
        // local maxima, brightest first, at least 4 cells apart
        const cand = [];
        for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const v = lum[y * GW + x]; if (v < 60) continue;
          if (v >= lum[y * GW + x - 1] && v >= lum[y * GW + x + 1] && v >= lum[(y - 1) * GW + x] && v >= lum[(y + 1) * GW + x]) cand.push([v, x, y]); }
        cand.sort((a, b) => b[0] - a[0]); const spots = [];
        for (const c of cand) { if (spots.every(s => Math.hypot(s[1] - c[1], s[2] - c[2]) > 4)) spots.push(c); if (spots.length >= 16) break; }
        tracer.spots = spots;
        // assign: each visible beam takes the nearest unused spot to its current target (keeps paths continuous)
        const vis = fan.beams.filter(b => b.visible); const used = new Set(); const m = L?.motion ?? 1;
        vis.forEach((b, i) => { const k = fan.beams.indexOf(b); let best = -1, bd = 1e9;
          spots.forEach((s, j) => { if (used.has(j)) return; const px = (s[1] / GW - .5) * W * 1.1, py = (1 - s[2] / GH) * H * .95;
            const dd = Math.hypot(px - want[k].x, py - want[k].y); if (dd < bd) { bd = dd; best = j; } });
          if (best < 0) return; used.add(best); const s = spots[best];
          const px = (s[1] / GW - .5) * W * 1.1, py = (1 - s[2] / GH) * H * .95;
          want[k].set(fan.g.position.x + (px - fan.g.position.x) * m, Math.max(.2, fan.g.position.y + (py - fan.g.position.y) * m), D / 2); });
      }
      const a = Math.min(1, dt * 14);
      fan.beams.forEach((b, k) => { if (!b.visible) return; targets[k].lerp(want[k], a); b.lookAt(targets[k]); });
    } };
  return tracer;
}
