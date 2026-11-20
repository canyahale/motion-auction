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
5. Your lineup is scored on the real leaderboard's latest moves: each
   creator's rank delta turns into points (climb = points, fall = lost
   points, biggest climber in your lineup = bonus).
6. Best lineup saved locally. Share button posts your score to X and tags
   @callmogbot (the Mogathon submission).

## Prices
Starting price scales with rank: top 10 ≈ 150 coins, 11–30 ≈ 100,
31–60 ≈ 60, 61–79 ≈ 30. Player and rivals have the same 1,000-coin purse
per season; a season ends when your lineup is full (5 wins) or the lots run
out. Coins reset each season; best score persists.

## Data
- Live: https://leaderboard.motion.game/api/leaderboard (public JSON, no
  auth; fields id, name, position, delta, isNew; hourly snapshots).
- Fallback: bundled snapshot (captured 2026-11-20 16:00Z) at
  ~/workspace/mogathon-api.json — copy into the project.
- The game must show the data's asOf time honestly and never invent
  creator data. CORS on the API is still to be verified by the builder
  (curl with an Origin header); if the browser fetch is blocked, use the
  bundled snapshot and say so in the UI.

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
@callmogbot. The game link itself goes in the post once deployed (GitHub
Pages from the public repo — no Vercel needed).

## Scope guard
One polished game, not two thin ones. If time runs short, cut Pack Wars /
second modes — ship the auction loop complete: bid, win, fill lineup,
score, share.
