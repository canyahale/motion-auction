# Motion Auction — design (draft, for the Mogathon)

## Concept
A Gavel-style auction house for Motion's real creators — fully off-chain, no
blockchain, no accounts, no backend. Static HTML/CSS/JS, mobile-first.

## The loop
1. You start with 1,000 coins.
2. Creators go up for auction one lot at a time, drawn from the real 79 on
   the Motion leaderboard (live API, bundled snapshot as fallback).
3. You bid against 3 rule-based AI rivals with personalities (aggressive /
   cautious / broke — same archetypes as Gavel's Mara, Bram, Pip, but plain
   JS, no external AI).
4. Win 5 creators to fill your lineup. Highest bid wins the lot; losers keep
   their coins.
5. **Pick a Captain** from your lineup — the Captain's points are doubled.
6. **Call the climber** — pick ONE creator from the whole 79-creator board
   you think will climb most by the NEXT hourly snapshot. +100 if they
   climb, +200 if they are the biggest climber, 0 otherwise. The Call
   resolves when a newer snapshot is fetched on a later visit — never
   against the snapshot it was made from.
7. Your lineup is scored on **momentum** (see Scoring v2 below). Best
   lineup saved locally, last 5 seasons listed on the results screen.
   Share button posts your score to X and tags @callmogbot (the Mogathon
   submission).

## Scoring v2 (2026-11-20)
- **Momentum window:** Motion's API exposes NO history (GET
  /api/leaderboard/history is 404; ?hours=/?since= are ignored; the
  leaderboard page JS fetches only /api/leaderboard). So the game builds
  its own window from snapshots it has actually fetched, stored on the
  device (last 4, keyed by asOf). Momentum = a creator's rank change from
  the oldest stored snapshot to the current one. With fewer than 2 stored
  snapshots, momentum falls back to the API's own delta (the move vs its
  ~4h baseline) and the UI says so honestly ("no momentum window yet").
  Nothing is ever invented.
- Each creator earns **10 points per momentum spot** (climb positive, fall
  negative) plus a rank bonus (top 10: +20, top 30: +10).
- **Captain:** the Captain's points (momentum + rank bonus) are doubled.
- **Biggest climber:** the lineup creator with the largest positive
  momentum earns a **+50 bonus** (not doubled).
- **Call (prediction):** +100 if the called creator climbed by the next
  snapshot, +200 if they were that snapshot's biggest climber (by delta),
  0 if they fell, stayed flat, or left the board. Call points go into a
  separate lifetime Call bank, not into the season score — they are a
  prediction from a different season's draft.
- **Season history:** the last 5 season scores (score, date, lineup,
  Captain) are kept on the device and shown on the results screen.

## Prices
Starting price scales with rank: top 10 ≈ 150 coins, 11–30 ≈ 100,
31–60 ≈ 60, 61–79 ≈ 30. Player and rivals have the same 1,000-coin purse
per season; a season ends when your lineup is full (5 wins) or the lots run
out. Coins reset each season; best score persists.

## Data
- Live: https://leaderboard.motion.game/api/leaderboard (public JSON, no
  auth; fields id, name, position, delta, isNew; hourly snapshots).
- **No history endpoint exists** (probed 2026-11-20: /api/leaderboard/history
  is 404; ?hours=/?since= are ignored; the leaderboard page JS fetches
  only /api/leaderboard). The game therefore builds its momentum window
  from snapshots it has actually fetched, stored on the device (last 4);
  with fewer than 2 stored snapshots it scores on the API's own delta
  and says so in the UI.
- Fallback: bundled snapshot (captured 2026-11-20 16:00Z) at
  ~/workspace/mogathon-api.json — copy into the project.
- The game must show the data's asOf time honestly and never invent
  creator data. CORS on the API is VERIFIED (Access-Control-Allow-Origin:
  *), so the browser fetches live data directly.

## Presentation
- Dark background, Motion pink/magenta accents, readable on a 390px phone.
- Lot card shows creator name, live rank, rank change (delta), starting
  price, current bid and who leads.
- Stat bar: coins left, lineup slots filled, best score.
- Tap to bid (+10 / +25 / +50 buttons), timer per lot.

## Faces (Isaiah, 2026-11-20 ~17:31 WAT)
Lot cards and lineup cards show the creators' REAL faces. Sourcing, in
order: (1) Motion's own site assets (the avatar URLs
leaderboard.motion.game already serves); (2) public sources (e.g.
Wikimedia/Wikipedia photos) with credit in the README; (3) initials/
monogram fallback for any creator with no usable photo. Never hotlink X
avatars (blocked/unstable), never invent faces, never use a wrong person's
photo.

## Submission
The player posts from the game: X intent link with their score and
@callmogbot. Live at https://motion-auction.vercel.app/ (repo
canyahale/motion-auction).

## Scope guard
One polished game, not two thin ones. If time runs short, cut Pack Wars /
second modes — ship the auction loop complete: bid, win, fill lineup,
score, share.
