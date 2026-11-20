# Motion Auction

A Mogathon mini-game: a Gavel-style auction house for Motion's real creators.
Bid with coins against three AI rivals, win 5 creators to build your lineup,
then score your lineup on their real leaderboard moves.

**Fully off-chain** — no blockchain, no accounts, no sign-up, no backend.
Static HTML/CSS/JS; works from any static host (e.g. GitHub Pages).

## How to play

1. You start each season with **1,000 coins**.
2. Creators go up for auction one lot at a time (20 lots per season), drawn
   from the real Motion leaderboard. The opening price scales with rank:
   top 10 ≈ 150, ranks 11–30 ≈ 100, 31–60 ≈ 60, 61–79 ≈ 30.
3. Bid **+10 / +25 / +50** against three rivals — Mara (aggressive), Bram
   (cautious) and Pip (broke). Each lot runs on a 15-second timer; a bid in
   the last 5 seconds resets the clock to 5 seconds. Highest bid wins the
   creator into your lineup.
4. Fill your **5-creator lineup** (or run out of lots), then **pick a
   Captain** from your lineup — the Captain's points are doubled (×2).
5. **Call the climber** — pick ONE creator from the whole board you think
   will climb most by the NEXT hourly update. +100 if they climb, +200 if
   they are the biggest climber, 0 if they fall or stay flat. The Call
   resolves when a newer snapshot arrives on a later visit — never against
   the snapshot you made it on — and its points go into a separate
   lifetime Call bank.
6. Your lineup is scored on **momentum**: 10 points per rank spot moved
   across the snapshots the game has seen (oldest stored snapshot to now;
   with only one snapshot seen it scores on the latest moves and says so),
   plus a rank bonus (top 10: +20, top 30: +10). The biggest climber in
   your lineup earns a **+50 bonus**.
7. Your best score is saved on your device, and the last 5 seasons are
   listed on the results screen. Hit **Share my score on X** to post it
   and tag @callmogbot — that's the Mogathon entry.

## Data

- **Live:** the game fetches `https://leaderboard.motion.game/api/leaderboard`
  (Motion's public leaderboard API — no auth; the API sends
  `Access-Control-Allow-Origin: *`, so the browser can call it directly).
- **Fallback:** if the live fetch fails, the game uses the bundled snapshot
  `leaderboard.json` (captured 2026-11-20 16:00 UTC) and says so in the UI.
- **Momentum:** Motion's API exposes no history (probed 2026-11-20:
  `/api/leaderboard/history` is 404, `?hours=`/`?since=` are ignored, and
  the leaderboard page itself fetches only `/api/leaderboard`). So the
  game remembers the snapshots it has actually fetched on your device
  (last 4) and scores momentum across them. Until it has seen two
  snapshots it scores on the latest moves and says so. No history is
  ever invented.
- **The Call** is a prediction about a future snapshot: it only resolves
  when a strictly newer snapshot is fetched on a later visit.
- The data badge at the top always shows whether the data is live or a
  snapshot, and the snapshot time. Creator names, ranks and moves are
  never invented — they come from that data only.

## Photos

- Creator faces come from **Motion's own site**: the leaderboard serves a
  profile photo per creator at
  `https://leaderboard.motion.game/pfp/<creator-id>.jpg` (the same URLs
  the official leaderboard page itself uses). Checked 2026-11-20: 71 of
  the 79 creators have a photo there.
- The 8 without one — Clemente, David Senra, DogeDesigner, Murray Hill
  Guy, Sir Doge of the Coin, Roon, Andy, David Holz — show a monogram of
  their initials instead. A face is always the real photo of the named
  creator or the initials fallback, never a wrong person's photo.
- No X/Twitter avatars are used anywhere.

## Run locally

```sh
# any static server, e.g.
python3 -m http.server 8000
# then open http://localhost:8000/
```

Open `index.html` directly also works, except the live fetch needs a
server origin for the fallback file to load in some browsers.

## Files

- `index.html` — page structure
- `styles.css` — dark theme, Motion pink/magenta, mobile-first
- `app.js` — game logic (auction, AI rivals, scoring, sharing)
- `leaderboard.json` — bundled fallback snapshot (2026-11-20 16:00 UTC)
- `DESIGN.md` — the design this build follows
