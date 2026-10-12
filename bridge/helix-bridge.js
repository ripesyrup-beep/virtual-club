#!/usr/bin/env node
// Helix cue bridge (laptop). Reads Helix 4's clock and Helix 1's UDP clock and serves them with CORS on
// http://127.0.0.1:27183/api/clock so the club page (?helix=http://127.0.0.1:27183) can follow Helix's flow.
// Does not modify Helix. No npm installs needed (Node 18+).
//
//   node helix-bridge.js                     auto-find Helix 4's random localhost port, Helix 1 via Helix 4
//   node helix-bridge.js --h4 http://127.0.0.1:PORT    use this Helix 4 address
//   node helix-bridge.js --udp               also listen to Helix 1 UDP 127.0.0.1:27182 directly
//
// Note on --udp: Helix 4 already listens on 27182. On Windows a unicast datagram reaches only ONE of the sockets
// sharing the port, so --udp can starve Helix 4 of Helix 1's clock. Default: UDP only when Helix 4 is not running;
// with Helix 4 running, Helix 1's clock is read from Helix 4's own GET /api/helix instead.
const http = require('http'), dgram = require('dgram'), { execSync } = require('child_process');
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : (process.argv[i + 1] || true); };
const PORT = Number(arg('--port')) || 27183;
let h4 = typeof arg('--h4') === 'string' ? arg('--h4').replace(/\/$/, '') : null;
const forceUdp = !!arg('--udp');
const state = { h4: null, h4At: 0, h1: null, h1At: 0, h1Source: '' };

async function getJson(url, ms = 400) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } }

function listeningPorts() { // localhost TCP listeners (Windows netstat / Linux ss)
  let out = ''; try { out = execSync(process.platform === 'win32' ? 'netstat -ano -p TCP' : 'ss -ltnH', { encoding: 'utf8' }); } catch { return []; }
  const ports = new Set(); for (const line of out.split(/\r?\n/)) { if (process.platform === 'win32' && !/LISTENING/.test(line)) continue;
    const m = line.match(/127\.0\.0\.1:(\d+)/); if (m && +m[1] !== PORT) ports.add(+m[1]); } return [...ports]; }
async function findH4() { for (const p of listeningPorts()) { const j = await getJson(`http://127.0.0.1:${p}/api/clock`, 250);
    if (j && typeof j === 'object' && ('beat' in j || 'bpm' in j || 'section' in j)) return `http://127.0.0.1:${p}`; } return null; }

let udp = null;
function startUdp() { if (udp) return; udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', b => { try { state.h1 = JSON.parse(b.toString()); state.h1At = Date.now(); state.h1Source = 'udp'; } catch {} });
  udp.on('error', e => { console.log('[bridge] UDP 27182:', e.message); udp = null; });
  udp.bind(27182, '127.0.0.1', () => console.log('[bridge] listening for Helix 1 on UDP 127.0.0.1:27182')); }

async function loop() {
  if (!h4) { h4 = await findH4(); if (h4) console.log('[bridge] Helix 4 found at', h4); }
  if (h4) { const c = await getJson(h4 + '/api/clock'); if (c) { state.h4 = c; state.h4At = Date.now(); }
    else if (Date.now() - state.h4At > 5000 && !arg('--h4')) { h4 = null; }
    if (!forceUdp) { const s = await getJson(h4 + '/api/helix'); if (s?.clock) { state.h1 = s.clock; state.h1At = Date.now() - (s.ageMs || 0); state.h1Source = 'helix4:' + (s.source || ''); } } }
  if (forceUdp || (!h4 && Date.now() - state.h4At > 3000)) startUdp();
  setTimeout(loop, h4 ? 50 : 1000);
}

function merged() { const now = Date.now(); const h4Live = state.h4 && now - state.h4At < 2000, h1Live = state.h1 && now - state.h1At < 2000;
  if (h4Live) return { ...state.h4, helix1: h1Live ? state.h1 : null, bridge: { source: 'helix4', h1: h1Live ? state.h1Source : '' } };
  if (h1Live) { const c = state.h1; const beats = c.bpm && c.audioTime != null && c.originAudio != null ? (c.audioTime - c.originAudio) * c.bpm / 60 : null;
    return { ...c, beat: beats == null ? undefined : Math.floor(beats), frac: beats == null ? undefined : beats % 1, bridge: { source: 'helix1:' + state.h1Source } }; }
  return { bridge: { source: 'none' } }; }

http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Private-Network': 'true', 'Cache-Control': 'no-store' }; // PNA header lets an https page (GitHub Pages) read localhost in Chrome
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  if (req.url.startsWith('/api/clock')) { res.writeHead(200, { ...h, 'Content-Type': 'application/json' }); return res.end(JSON.stringify(merged())); }
  res.writeHead(200, { ...h, 'Content-Type': 'text/plain' }); res.end('helix bridge: GET /api/clock\n');
}).listen(PORT, '127.0.0.1', () => console.log(`[bridge] serving http://127.0.0.1:${PORT}/api/clock  (open the club with ?helix=http://127.0.0.1:${PORT})`));
loop();
