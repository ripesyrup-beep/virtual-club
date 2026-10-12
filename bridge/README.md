# Helix cue bridge
Run on the laptop (Node 18+), with Helix 4 and/or Helix 1 open: `node helix-bridge.js`, then open the club with `?helix=http://127.0.0.1:27183`.
Options: `--h4 http://127.0.0.1:PORT` (skip auto-discovery), `--udp` (also read Helix 1 UDP 27182 directly; see the note in the script), `--port N`.
It's read-only. Helix isn't modified. Only the laptop's own browser can reach it, so guests on Quest need the cue relayed (LiveKit, later).
