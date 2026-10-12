// Helix link: use Helix 4's own song flow as the source of truth (no flow detection of ours when it is live).
// Helix 4 publishes its clock on its local server: GET http://127.0.0.1:<port>/api/clock  (port is random per launch).
// Fields used (from helix4-src/ui/desk.js): section ("silence"|"breakdown"|"build"|"drop"), energy 0..100, beat (int),
// frac (0..1 into the beat), bpm, h4.flow { mode, breathe, build, drop, ramp }, sig { kick, snare, hat, bar } pulses.
// Transports: 1) ?helix=http://127.0.0.1:PORT (needs CORS on Helix 4's server, which it does not send today), or
//             2) a cue bridge / LiveKit calling club.helix.ingest(clockJson) (recommended for guests anyway).
const MAP = { silence: 'open', breakdown: 'open', intro: 'open', outro: 'open', body: 'build', build: 'build', drop: 'drop' };

export function initHelixLink(club) {
  const link = { live: false, last: null, at: 0, url: null, error: '',
    ingest(c) { if (!c || typeof c !== 'object') return; link.last = c; link.at = performance.now(); link.live = true;
      const f = c.h4?.flow || {};
      const section = MAP[f.mode] || MAP[c.section] || MAP[c.phase] || 'open';   // Helix 4 flow mode first, then its section, then Helix 1 phase
      const e = c.energy != null ? (c.energy > 1.5 ? c.energy / 100 : c.energy) : null; // H4 0..100, H1 0..1
      const cue = { section, buildProgress: section === 'build' ? Math.max(0, Math.min(1, f.build ?? f.ramp ?? 0)) : 0 };
      if (e != null) cue.intensity = Math.max(.15, Math.min(1.2, section === 'drop' ? Math.max(e, .8) : e));
      if (c.bpm) cue.bpm = c.bpm;
      if (c.beat != null) { cue.beatCount = c.beat; cue.beatPhase = c.frac || 0; }
      club.cues.ingest(cue); },
  };
  const q = new URLSearchParams(location.search).get('helix');
  if (q) { link.url = q.replace(/\/$/, '');
    const poll = () => fetch(link.url + '/api/clock', { cache: 'no-store' }).then(r => r.json()).then(j => { link.error = ''; link.ingest(j); })
      .catch(e => { if (!link.error) console.info('[helix-link] cannot read', link.url, '(Helix 4 sends no CORS headers; use a cue bridge):', e.message); link.error = e.message; })
      .finally(() => setTimeout(poll, 100));
    poll(); }
  club.helix = link; return link;
}
