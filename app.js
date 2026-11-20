/* Motion Auction — a Mogathon mini-game.
   Bid on real Motion leaderboard creators against AI rivals, build a
   5-creator lineup, score on their real rank moves. Fully off-chain:
   no blockchain, no accounts, no backend. Data: Motion's public
   leaderboard API, with a bundled snapshot as fallback. */

'use strict';

const API_URL = 'https://leaderboard.motion.game/api/leaderboard';
const FALLBACK_URL = 'leaderboard.json';
const PFP_BASE = 'https://leaderboard.motion.game/pfp/'; // Motion's own profile photos, one per creator id
const GAME_URL = 'https://motion-auction.vercel.app/'; // live Vercel URL

const START_COINS = 1000;
const LINEUP_SIZE = 5;
const LOTS_PER_SEASON = 20;
const LOT_SECONDS = 15;
const BEST_KEY = 'motion-auction-best';
const CALL_KEY = 'motion-auction-call';         // one pending/resolved Call
const CALL_BANK_KEY = 'motion-auction-call-bank'; // lifetime points from resolved Calls
const SEASONS_KEY = 'motion-auction-seasons';   // last 5 season scores
const SNAPS_KEY = 'motion-auction-snapshots';   // last 4 fetched snapshots (momentum window)
const MAX_SNAPS = 4;
const MAX_SEASONS = 5;

const RIVAL_DEFS = [
  { id: 'mara', name: 'Mara', style: 'Aggressive', color: '#ff5c8a', purse: 1000, maxFactor: 1.0,  bidProb: 0.60 },
  { id: 'bram', name: 'Bram', style: 'Cautious',  color: '#7cc7ff', purse: 1000, maxFactor: 0.70, bidProb: 0.40 },
  { id: 'pip',  name: 'Pip',  style: 'Broke',     color: '#ffd166', purse: 600,  maxFactor: 0.55, bidProb: 0.30 },
];

const $ = (id) => document.getElementById(id);

const state = {
  creators: [],      // full leaderboard rows, sorted by position
  asOf: null,
  live: false,
  phase: 'loading',  // loading | auction | resolving | scoring
  coins: START_COINS,
  lineup: [],        // won creator rows
  rivals: [],        // {…def, purseLeft, lineup: [], status, nextAct, passed}
  deck: [],          // shuffled lot order for this season
  lotIndex: 0,
  lot: null,         // current creator row
  startPrice: 0,
  currentBid: 0,
  leader: null,      // 'you' | rival id | 'opening'
  timeLeft: LOT_SECONDS,
  timer: null,
  score: null,
  best: null,
  captainId: null,   // lineup creator id whose points are doubled
  callPick: null,    // creator id picked on the Call screen this season
  call: null,        // stored Call object (pending or resolved)
  callBank: 0,       // lifetime points from resolved Calls
  callResolvedThisBoot: null,
  seasons: [],       // last 5 season scores
};

/* ---------------- data ---------------- */

async function loadData() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(API_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if (!Array.isArray(d.rows) || !d.rows.length) throw new Error('empty rows');
    return { rows: d.rows, asOf: d.asOf || null, live: true };
  } catch (e) {
    const res = await fetch(FALLBACK_URL);
    const d = await res.json();
    return { rows: d.rows, asOf: d.asOf || null, live: false };
  }
}

function fmtAsOf(iso) {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  return d.toUTCString().replace('GMT', 'UTC');
}

/* ---------------- momentum window ---------------- */

// The API exposes no history (GET /api/leaderboard/history is 404, and
// ?hours=/?since= are ignored). So the game builds its own window from
// snapshots it has actually fetched, stored in localStorage. Momentum is
// the creator's rank change from the OLDEST stored snapshot to the current
// one. With fewer than 2 stored snapshots, momentum falls back to the
// API's own delta (the move vs its ~4h baseline). Nothing is ever
// invented: if we have not seen it, we do not score it.
function loadSnaps() {
  try { return JSON.parse(localStorage.getItem(SNAPS_KEY)) || []; }
  catch (e) { return []; }
}

function storeSnapshot(rows, asOf) {
  if (!asOf) return loadSnaps();
  const snaps = loadSnaps();
  if (snaps.some((s) => s.asOf === asOf)) return snaps; // already stored
  const pos = {};
  for (const r of rows) pos[r.id] = r.position;
  snaps.push({ asOf, pos });
  while (snaps.length > MAX_SNAPS) snaps.shift();
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify(snaps)); } catch (e) { /* private mode */ }
  return snaps;
}

function oldestSnap(snaps) {
  let oldest = null;
  for (const s of snaps) if (!oldest || s.asOf < oldest.asOf) oldest = s;
  return oldest;
}

function momentumFor(c, snaps) {
  if (snaps.length >= 2) {
    const oldest = oldestSnap(snaps);
    if (oldest && oldest.pos[c.id] != null) return oldest.pos[c.id] - c.position;
  }
  return c.delta || 0;
}

/* ---------------- the Call (prediction) ---------------- */

function loadCall() {
  try { const raw = localStorage.getItem(CALL_KEY); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

function saveCall(call) {
  try { localStorage.setItem(CALL_KEY, JSON.stringify(call)); } catch (e) { /* private mode */ }
}

function loadCallBank() {
  try { return parseInt(localStorage.getItem(CALL_BANK_KEY) || '0', 10) || 0; }
  catch (e) { return 0; }
}

function addCallBank(pts) {
  const v = loadCallBank() + pts;
  try { localStorage.setItem(CALL_BANK_KEY, String(v)); } catch (e) { /* private mode */ }
  return v;
}

// Resolve a pending Call against a NEWER snapshot. Returns null when the
// snapshot is not newer than the one the Call was made against — a Call is
// a prediction about the future, never scored against its own snapshot.
function resolveCall(call, rows, asOf) {
  if (!call || call.resolved) return null;
  if (!asOf || asOf <= call.asOf) return null;
  const row = rows.find((r) => r.id === call.creatorId);
  if (!row) return { resolved: true, pts: 0, note: `${call.name} left the board — no points.` };
  const climb = call.positionAtCall - row.position;
  let biggest = null;
  for (const r of rows) {
    const d = r.delta || 0;
    if (d > 0 && (!biggest || d > biggest.delta)) biggest = r;
  }
  if (biggest && biggest.id === call.creatorId) {
    return { resolved: true, pts: 200, note: `${call.name} was the biggest climber (+${biggest.delta}) — +200!` };
  }
  if (climb > 0) return { resolved: true, pts: 100, note: `${call.name} climbed ${climb} spot${climb === 1 ? '' : 's'} — +100.` };
  return { resolved: true, pts: 0, note: `${call.name} did not climb — no points.` };
}

/* ---------------- season history ---------------- */

function loadSeasons() {
  try { return JSON.parse(localStorage.getItem(SEASONS_KEY)) || []; }
  catch (e) { return []; }
}

function saveSeason(entry) {
  const list = loadSeasons();
  list.unshift(entry);
  while (list.length > MAX_SEASONS) list.pop();
  try { localStorage.setItem(SEASONS_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
  return list;
}

/* ---------------- pricing ---------------- */

function startPriceFor(pos) {
  if (pos <= 10) return 150;
  if (pos <= 30) return 100;
  if (pos <= 60) return 60;
  return 30;
}

// What a creator is "worth" to a rival: rank value + a premium for climbers.
function valueFor(c) {
  const base = startPriceFor(c.position);
  const climb = Math.max(0, c.delta || 0);
  return base * (1.5 + 0.12 * climb + (c.isNew ? 0.2 : 0));
}

function rankBonus(pos) {
  if (pos <= 10) return 20;
  if (pos <= 30) return 10;
  return 0;
}

/* ---------------- helpers ---------------- */

function fmt(n) { return n.toLocaleString('en-US'); }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function initialsFor(name) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Creator face: Motion's own photo for this creator id; if Motion has none
// (8 of the 79 return 404), the img removes itself and the monogram shows.
function avatarHtml(c, sizeClass) {
  const url = PFP_BASE + encodeURIComponent(c.id) + '.jpg';
  return `<span class="avatar ${sizeClass || ''}"><span class="avatar-initials">${initialsFor(c.name)}</span>` +
    `<img src="${url}" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

function deltaLabel(c) {
  if (c.isNew) return '🆕 New on the board';
  const d = c.delta || 0;
  if (d > 0) return `▲ Climbed ${d} spot${d === 1 ? '' : 's'} since last snapshot`;
  if (d < 0) return `▼ Fell ${-d} spot${d === -1 ? '' : 's'} since last snapshot`;
  return '— No move since last snapshot';
}
function log(msg) {
  const li = document.createElement('li');
  li.innerHTML = msg;
  const list = $('logList');
  list.prepend(li);
  while (list.children.length > 8) list.removeChild(list.lastChild);
}

/* ---------------- season flow ---------------- */

function newSeason() {
  state.coins = START_COINS;
  state.lineup = [];
  state.rivals = RIVAL_DEFS.map((d) => ({
    ...d, purseLeft: d.purse, lineup: [], status: 'waiting', nextAct: 0, passed: false,
  }));
  state.deck = shuffle(state.creators.slice()).slice(0, LOTS_PER_SEASON);
  state.lotIndex = 0;
  state.score = null;
  state.captainId = null;
  state.callPick = null;
  state.callResolvedThisBoot = null;
  $('logList').innerHTML = '';
  log('<b>New season.</b> 1,000 coins, 20 lots, fill your 5-creator lineup.');
  showScreen('screenAuction');
  state.phase = 'auction';
  startLot();
}

function startLot() {
  if (state.lotIndex >= state.deck.length || state.lineup.length >= LINEUP_SIZE) {
    endSeason();
    return;
  }
  state.lot = state.deck[state.lotIndex];
  state.startPrice = startPriceFor(state.lot.position);
  state.currentBid = state.startPrice;
  state.leader = 'opening';
  state.timeLeft = LOT_SECONDS;
  state.rivals.forEach((r) => {
    r.status = 'waiting';
    r.passed = false;
    r.nextAct = Date.now() + 1200 + Math.random() * 2500;
  });
  renderAll();
  $('bidHint').textContent = '';
  $('bidHint').className = 'bid-hint';
  clearInterval(state.timer);
  state.timer = setInterval(tick, 100);
}

function tick() {
  state.timeLeft = Math.max(0, state.timeLeft - 0.1);
  const now = Date.now();
  for (const r of state.rivals) {
    if (r.passed || state.phase !== 'auction') continue;
    if (now < r.nextAct) continue;
    rivalAct(r, now);
  }
  renderTimer();
  if (state.timeLeft <= 0) resolveLot();
}

function rivalAct(r, now) {
  const maxWilling = Math.min(valueFor(state.lot) * r.maxFactor, r.purseLeft);
  const nextBid = state.currentBid + (Math.random() < 0.5 ? 10 : 25);
  if (state.leader === r.id) { r.nextAct = now + 1500 + Math.random() * 2500; return; }
  if (nextBid > maxWilling || Math.random() > r.bidProb) {
    r.passed = true;
    r.status = 'passed';
    r.nextAct = Infinity;
    renderRivals();
    return;
  }
  placeBid(r.id, nextBid);
  r.nextAct = now + 1500 + Math.random() * 2500;
}

function placeBid(who, amount) {
  state.currentBid = amount;
  state.leader = who;
  if (state.timeLeft < 5) state.timeLeft = 5; // anti-snipe: a late bid resets the clock to 5s
  const name = who === 'you' ? '<b>You</b>' : `<b>${rivalById(who).name}</b>`;
  log(`${name} bid ${fmt(amount)} on ${state.lot.name}.`);
  renderAll();
}

function rivalById(id) { return state.rivals.find((r) => r.id === id); }

function playerBid(inc) {
  if (state.phase !== 'auction') return;
  if (state.leader === 'you') return;
  const amount = state.currentBid + inc;
  if (amount > state.coins) {
    $('bidHint').textContent = `You only have ${fmt(state.coins)} coins — that bid is too rich.`;
    return;
  }
  placeBid('you', amount);
}

function skipLot() {
  if (state.phase !== 'auction') return;
  log(`You passed on ${state.lot.name}.`);
  resolveLot();
}

function resolveLot() {
  clearInterval(state.timer);
  state.phase = 'resolving';
  const lot = state.lot;
  const bid = state.currentBid;
  if (state.leader === 'you') {
    state.coins -= bid;
    state.lineup.push(lot);
    log(`<b>You won ${lot.name} for ${fmt(bid)}!</b> Lineup ${state.lineup.length}/${LINEUP_SIZE}.`);
  } else if (state.leader && state.leader !== 'opening') {
    const r = rivalById(state.leader);
    r.purseLeft -= bid;
    r.lineup.push(lot);
    r.status = 'won';
    log(`<b>${r.name}</b> won ${lot.name} for ${fmt(bid)}.`);
  } else {
    log(`${lot.name} went unsold — no bids above the opening price.`);
  }
  renderAll();
  state.lotIndex += 1;
  setTimeout(() => {
    if (state.lineup.length >= LINEUP_SIZE || state.lotIndex >= state.deck.length) endSeason();
    else { state.phase = 'auction'; startLot(); }
  }, 1600);
}

function endSeason() {
  clearInterval(state.timer);
  if (!state.lineup.length) {
    // Empty lineup: nothing to captain or call — score it as-is.
    state.captainId = null;
    state.callPick = null;
    doScore();
    return;
  }
  state.phase = 'captain';
  state.captainId = state.lineup[0].id; // preselected; the player can change it
  renderCaptain();
  showScreen('screenCaptain');
}

/* ---------------- captain pick ---------------- */

function renderCaptain() {
  const wrap = $('captainList');
  wrap.innerHTML = '';
  for (const c of state.lineup) {
    const btn = document.createElement('button');
    const selected = state.captainId === c.id;
    btn.className = 'pick-row' + (selected ? ' selected' : '');
    btn.innerHTML = avatarHtml(c, 'avatar-sm') +
      `<span class="pick-name">${c.name}</span>` +
      `<span class="pick-meta">#${c.position} · ${deltaLabel(c)}</span>` +
      (selected ? '<span class="pick-tag">CAPTAIN ×2</span>' : '');
    btn.addEventListener('click', () => { state.captainId = c.id; renderCaptain(); });
    wrap.appendChild(btn);
  }
}

function confirmCaptain() {
  if (state.phase !== 'captain') return;
  state.phase = 'call';
  state.callPick = null;
  renderCall();
  showScreen('screenCall');
}

/* ---------------- call the climber ---------------- */

function renderCall() {
  const pending = state.call && !state.call.resolved ? state.call : null;
  $('callNote').textContent = pending
    ? `Pending Call: ${pending.name} (made ${fmtAsOf(pending.asOf)}). Pick another creator to replace it, or confirm to keep it.`
    : 'Pick ONE creator from the whole board you think will climb most by the next hourly update. +100 if they climb, +200 if they are the biggest climber.';
  const wrap = $('callList');
  wrap.innerHTML = '';
  const q = ($('callFilter').value || '').trim().toLowerCase();
  const rows = state.creators.filter((c) => !q || c.name.toLowerCase().includes(q));
  for (const c of rows) {
    const selected = state.callPick === c.id || (!state.callPick && pending && pending.creatorId === c.id);
    const btn = document.createElement('button');
    btn.className = 'pick-row' + (selected ? ' selected' : '');
    btn.innerHTML = avatarHtml(c, 'avatar-sm') +
      `<span class="pick-name">${c.name}</span>` +
      `<span class="pick-meta">#${c.position} · ${deltaLabel(c)}</span>` +
      (selected ? '<span class="pick-tag">YOUR CALL</span>' : '');
    btn.addEventListener('click', () => { state.callPick = c.id; renderCall(); });
    wrap.appendChild(btn);
  }
  $('callConfirm').disabled = !state.callPick && !pending;
}

function confirmCall() {
  if (state.phase !== 'call') return;
  if (state.callPick) {
    const c = state.creators.find((x) => x.id === state.callPick);
    if (c) {
      state.call = {
        creatorId: c.id, name: c.name, positionAtCall: c.position,
        asOf: state.asOf, resolved: false, pts: 0, note: '',
      };
      saveCall(state.call);
    }
  }
  // No new pick: an existing pending Call stays as it is.
  doScore();
}

/* ---------------- scoring v2 ---------------- */

function doScore() {
  state.phase = 'scoring';
  const snaps = loadSnaps();
  const scored = state.lineup.map((c) => {
    const momentum = momentumFor(c, snaps);
    const movePts = momentum * 10;
    const rankPts = rankBonus(c.position);
    const base = movePts + rankPts;
    const isCaptain = c.id === state.captainId;
    return { creator: c, momentum, movePts, rankPts, base, isCaptain, pts: isCaptain ? base * 2 : base, bonus: 0 };
  });
  // Biggest momentum climber in the lineup earns a +50 bonus.
  let bestClimber = null;
  for (const s of scored) {
    if (s.momentum > 0 && (!bestClimber || s.momentum > bestClimber.momentum)) bestClimber = s;
  }
  if (bestClimber) bestClimber.bonus = 50;
  const total = scored.reduce((sum, s) => sum + s.pts + s.bonus, 0);
  state.score = { rows: scored, total, momentumCount: snaps.length, momentumFrom: snaps.length >= 2 ? oldestSnap(snaps).asOf : null };

  // Best score persists in localStorage.
  const prev = loadBest();
  if (!prev || total > prev.score) {
    state.best = { score: total, names: state.lineup.map((c) => c.name), date: new Date().toISOString() };
    try { localStorage.setItem(BEST_KEY, JSON.stringify(state.best)); } catch (e) { /* private mode */ }
  } else {
    state.best = prev;
  }

  // Season history: last 5 seasons, newest first.
  const captain = state.lineup.find((c) => c.id === state.captainId);
  state.seasons = saveSeason({
    score: total, date: new Date().toISOString(),
    names: state.lineup.map((c) => c.name), captain: captain ? captain.name : null,
  });

  renderScoring();
  showScreen('screenScoring');
}

/* ---------------- scoring / share ---------------- */

function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function renderScoring() {
  const { rows, total } = state.score;
  const tbody = $('scoreRows');
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">No creators won this season — your lineup was empty, so there is nothing to score. Play again and win a lot!</td></tr>';
  }
  for (const s of rows) {
    const c = s.creator;
    const tr = document.createElement('tr');
    const moveTxt = c.isNew ? 'new' : (s.momentum > 0 ? `+${s.momentum}` : `${s.momentum}`);
    const pts = s.pts + s.bonus;
    tr.innerHTML = `<td><span class="cell-creator">${s.isCaptain ? '👑 ' : ''}${avatarHtml(c, 'avatar-sm')}${c.name}${s.bonus ? ' ⭐' : ''}</span></td><td>#${c.position}</td>` +
      `<td class="${s.momentum > 0 ? 'pos' : s.momentum < 0 ? 'neg' : ''}">${moveTxt}</td>` +
      `<td class="${pts > 0 ? 'pos' : pts < 0 ? 'neg' : ''}">${pts > 0 ? '+' : ''}${pts}${s.isCaptain ? ' ×2' : ''}</td>`;
    tbody.appendChild(tr);
  }
  $('scoreTotal').textContent = (total > 0 ? '+' : '') + total;
  const mc = state.score.momentumCount;
  $('scoringNote').textContent = mc >= 2
    ? `Scored on momentum across ${mc} snapshots (${fmtAsOf(state.score.momentumFrom)} → ${fmtAsOf(state.asOf)}), ${state.live ? 'live data' : 'bundled snapshot'}.`
    : `Scored on the latest moves (${fmtAsOf(state.asOf)}, ${state.live ? 'live data' : 'bundled snapshot'}) — no momentum window yet. Play again after a newer snapshot and the game scores on movement across snapshots.`;

  // The Call: resolved this visit, pending, or just locked in.
  const callBlock = $('callBlock');
  if (state.callResolvedThisBoot) {
    const cb = state.callResolvedThisBoot;
    callBlock.innerHTML = `<b>Your Call resolved: ${cb.note}</b><br>Call bank: ${fmt(state.callBank)} pts from resolved Calls.`;
  } else if (state.call && !state.call.resolved) {
    const madeThisSeason = state.call.asOf === state.asOf;
    callBlock.innerHTML = `<b>Your Call: ${state.call.name}</b> — ` +
      (madeThisSeason
        ? 'locked in this season. It resolves against the NEXT hourly snapshot, not this one — check back after the next update.'
        : `pending the next hourly update (made ${fmtAsOf(state.call.asOf)}). Check back after a newer snapshot.`);
  } else {
    callBlock.innerHTML = 'No Call this season.';
  }

  // Season history: last 5 seasons, newest first.
  const hist = $('seasonHistory');
  if (state.seasons.length) {
    hist.innerHTML = '<h3>Past seasons</h3><ul>' + state.seasons.map((s) => {
      const d = new Date(s.date).toUTCString().slice(5, 16);
      const names = s.names.length ? s.names.join(', ') : 'empty lineup';
      return `<li><b>${s.score > 0 ? '+' : ''}${s.score}</b> · ${d} · ${names}${s.captain ? ` · Captain: ${s.captain}` : ''}</li>`;
    }).join('') + '</ul>';
  } else {
    hist.innerHTML = '';
  }

  const isNewBest = state.best && state.best.score === total && total > 0;
  $('bestLine').textContent = isNewBest
    ? `🏆 New best score: ${fmt(total)}!`
    : (state.best ? `Best score: ${fmt(state.best.score)}` : '');
}

function shareText() {
  const names = state.lineup.map((c) => c.name).join(', ') || 'no creators';
  const total = state.score ? state.score.total : 0;
  return `I scored ${total} pts in Motion Auction — my lineup: ${names}. ` +
    `Bid on real @motiongame_ creators and beat my draft! ${GAME_URL} @callmogbot #Mogathon`;
}

function share() {
  const url = 'https://x.com/intent/tweet?text=' + encodeURIComponent(shareText());
  window.open(url, '_blank', 'noopener');
}

/* ---------------- rendering ---------------- */

function showScreen(id) {
  for (const s of ['screenLoading', 'screenAuction', 'screenCaptain', 'screenCall', 'screenScoring']) $(s).classList.add('hidden');
  $(id).classList.remove('hidden');
}

function renderTimer() {
  const pct = (state.timeLeft / LOT_SECONDS) * 100;
  const bar = $('timerBar');
  bar.style.width = pct + '%';
  bar.classList.toggle('low', state.timeLeft <= 5);
  $('timerText').textContent = Math.ceil(state.timeLeft) + 's';
}

function renderAll() {
  renderTimer();
  // stats
  $('statCoins').textContent = fmt(state.coins);
  $('statLineup').textContent = `${state.lineup.length}/${LINEUP_SIZE}`;
  $('statBest').textContent = state.best ? fmt(state.best.score) : '—';
  $('statLot').textContent = `${Math.min(state.lotIndex + 1, LOTS_PER_SEASON)}/${LOTS_PER_SEASON}`;
  // lot card
  const lot = state.lot;
  $('lotAvatar').innerHTML = avatarHtml(lot, 'avatar-lg');
  $('lotRank').textContent = '#' + lot.position;
  $('lotName').textContent = lot.name;
  const dEl = $('lotDelta');
  dEl.textContent = deltaLabel(lot);
  dEl.className = 'lot-delta' + ((lot.delta || 0) > 0 ? ' up' : (lot.delta || 0) < 0 ? ' down' : '');
  $('lotStart').textContent = fmt(state.startPrice);
  $('lotBid').textContent = fmt(state.currentBid);
  const leaderEl = $('lotLeader');
  if (state.leader === 'you') { leaderEl.textContent = 'You'; leaderEl.classList.add('leading-you'); }
  else if (state.leader === 'opening') { leaderEl.textContent = '—'; leaderEl.classList.remove('leading-you'); }
  else { leaderEl.textContent = rivalById(state.leader).name; leaderEl.classList.remove('leading-you'); }
  // bid buttons
  const youLead = state.leader === 'you';
  const hint = $('bidHint');
  for (const [id, inc] of [['bid10', 10], ['bid25', 25], ['bid50', 50]]) {
    $(id).disabled = state.phase !== 'auction' || youLead || state.currentBid + inc > state.coins;
  }
  if (youLead) { hint.textContent = 'You are leading this lot.'; hint.className = 'bid-hint you'; }
  else if (state.phase === 'auction') { hint.textContent = ''; hint.className = 'bid-hint'; }
  renderRivals();
  renderLineup();
}

function renderRivals() {
  const wrap = $('rivals');
  wrap.innerHTML = '';
  for (const r of state.rivals) {
    const div = document.createElement('div');
    div.className = 'rival';
    const statusTxt = state.phase === 'auction'
      ? (r.passed ? 'Passed' : r.status === 'won' ? 'Won last lot' : 'Watching…')
      : `${r.lineup.length} won`;
    div.innerHTML = `<div class="rival-name" style="color:${r.color}">${r.name}</div>` +
      `<div class="rival-style">${r.style}</div>` +
      `<div class="rival-purse">${fmt(r.purseLeft)} coins left</div>` +
      `<div class="rival-status ${r.passed ? '' : 'bidding'}">${statusTxt}</div>`;
    wrap.appendChild(div);
  }
}

function renderLineup() {
  const wrap = $('lineupSlots');
  wrap.innerHTML = '';
  for (let i = 0; i < LINEUP_SIZE; i++) {
    const div = document.createElement('div');
    const c = state.lineup[i];
    if (c) {
      div.className = 'slot filled';
      div.innerHTML = avatarHtml(c, 'avatar-sm') + `<span>${c.name}</span>`;
    }
    else { div.className = 'slot'; div.textContent = 'Empty slot'; }
    wrap.appendChild(div);
  }
}

/* ---------------- boot ---------------- */

async function boot() {
  state.best = loadBest();
  state.call = loadCall();
  state.callBank = loadCallBank();
  state.seasons = loadSeasons();
  const data = await loadData();
  state.creators = data.rows.slice().sort((a, b) => a.position - b.position);
  state.asOf = data.asOf;
  state.live = data.live;
  // Remember this snapshot for the momentum window.
  storeSnapshot(state.creators, state.asOf);
  // Resolve any pending Call against this newer snapshot (never against
  // the snapshot it was made from — resolveCall enforces that).
  if (state.call && !state.call.resolved && state.asOf) {
    const res = resolveCall(state.call, state.creators, state.asOf);
    if (res) {
      state.call = { ...state.call, resolved: true, pts: res.pts, note: res.note, resolvedAsOf: state.asOf };
      saveCall(state.call);
      state.callBank = addCallBank(res.pts);
      state.callResolvedThisBoot = state.call;
    }
  }
  const badge = $('dataBadge');
  badge.textContent = (data.live ? '● Live data' : '● Snapshot data') + ' · leaderboard as of ' + fmtAsOf(data.asOf);
  badge.classList.add(data.live ? 'live' : 'snapshot');
  newSeason();
}

$('bid10').addEventListener('click', () => playerBid(10));
$('bid25').addEventListener('click', () => playerBid(25));
$('bid50').addEventListener('click', () => playerBid(50));
$('skipBtn').addEventListener('click', skipLot);
$('shareBtn').addEventListener('click', share);
$('againBtn').addEventListener('click', newSeason);
$('captainConfirm').addEventListener('click', confirmCaptain);
$('callConfirm').addEventListener('click', confirmCall);
$('callFilter').addEventListener('input', () => { if (state.phase === 'call') renderCall(); });

boot();

/* Debug hook for automated verification: lets a headless run play a full
   season without waiting on timers. Not part of the game UI. */
window.__game = {
  state,
  avatarHtml,
  playerBid,
  skipLot,
  resolveNow: () => { if (state.phase === 'auction') resolveLot(); },
  // Win the current lot for the player instantly, then advance.
  winLotNow: () => {
    if (state.phase !== 'auction') return;
    state.currentBid = state.startPrice;
    state.leader = 'you';
    resolveLot();
  },
  // Captain / Call flow, same handlers the buttons use.
  pickCaptain: (id) => { if (state.phase === 'captain') { state.captainId = id; renderCaptain(); } },
  confirmCaptain,
  pickCall: (id) => { if (state.phase === 'call') { state.callPick = id; renderCall(); } },
  confirmCall,
  // Test-only: run the production Call-resolution path against supplied
  // snapshot rows. Returns {resolved:false} when the snapshot is not newer
  // than the Call's own snapshot. Persists the result like a real boot.
  resolveCallForTest: (rows, asOf) => {
    const call = loadCall();
    if (!call) return null;
    const res = resolveCall(call, rows, asOf);
    if (!res) return { resolved: false };
    const updated = { ...call, resolved: true, pts: res.pts, note: res.note, resolvedAsOf: asOf };
    saveCall(updated);
    state.call = updated;
    state.callBank = addCallBank(res.pts);
    return { resolved: true, pts: res.pts, note: res.note };
  },
  callState: () => ({ call: loadCall(), bank: loadCallBank(), seasons: loadSeasons(), snaps: loadSnaps() }),
  momentumFor: (id) => {
    const c = state.creators.find((x) => x.id === id);
    return c ? momentumFor(c, loadSnaps()) : null;
  },
};
