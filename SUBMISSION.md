# Motion Auction — Mogathon submission

## How to submit

1. Deploy the game to a public URL (GitHub Pages from the public repo).
   Replace `https://YOUR-GAME-URL` in `app.js` (the `GAME_URL` constant)
   with the real URL before deploying.
2. Play a season, then hit **Share my score on X** in the game — or post
   manually with the text below.
3. The post must tag **@callmogbot** so the Motion team finds it.

## Suggested post (copy-paste, link filled in at deploy time)

> I built Motion Auction for the Mogathon — bid on real @motiongame_
> creators against AI rivals, draft a 5-creator lineup, and score on
> their real leaderboard moves. My best score: [SCORE] pts.
> Play it here: [GAME URL]
> @callmogbot #Mogathon

The in-game Share button generates the same post automatically, with the
player's actual score and lineup names filled in.

## What it is

- Gavel-style auction house, fully off-chain: coins, AI rival bidders
  (Mara / Bram / Pip), 5-slot lineups, season scoring.
- Uses Motion's real public leaderboard (79 creators, live API with a
  bundled snapshot fallback) — the lots and the scoring are the real data.
- Static site, mobile-first, no accounts, no blockchain.
