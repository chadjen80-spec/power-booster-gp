// Ranked: rank points (RP) per player and season, saved in Supabase. The game server (server.js) runs the queue,
// watches each race and decides the finishing order; this file turns that order into RP and serves the leaderboard.
const sb = require('./supabase');
const { json, userFrom } = require('./payments');

const SEASON = 1;
const TIERS = [
  { id: 'bronze', name: 'บรอนซ์', icon: '🥉', min: 0 },
  { id: 'silver', name: 'ซิลเวอร์', icon: '🥈', min: 300 },
  { id: 'gold', name: 'โกลด์', icon: '🥇', min: 700 },
  { id: 'platinum', name: 'แพลทินัม', icon: '💠', min: 1200 },
  { id: 'diamond', name: 'ไดมอนด์', icon: '💎', min: 1800 },
  { id: 'champion', name: 'แชมป์', icon: '👑', min: 2600 },
];
const tierOf = rp => TIERS.filter(t => rp >= t.min).pop();

// RP for finishing `place` (1 = best) among `humans` real players; bots don't count.
// The winner gets +30 and last place -15, scaled up a little with more players. Bronze never loses RP.
function rpDelta(place, humans, rp) {
  const score = (humans - place) / (humans - 1);
  let d = Math.round((-15 + 45 * score) * Math.min(1.5, 0.7 + 0.1 * humans));
  if (d < 0 && rp < TIERS[1].min) d = 0;
  return d;
}

async function rowOf(userId) {
  return (await sb.rows(`ranked?user_id=eq.${encodeURIComponent(userId)}&season=eq.${SEASON}&select=name,rp,wins,races`))[0] || null;
}
const publicRow = r => ({ name: r.name, rp: r.rp, wins: r.wins, races: r.races, tier: tierOf(r.rp).id });

// results: [{ userId, name, place, humans, reason }] for one race; returns { [userId]: { delta, rp, tier } }
async function saveRace(results) {
  const out = {};
  for (const x of results) {
    const row = (await rowOf(x.userId)) || { rp: 0, wins: 0, races: 0 };
    const delta = rpDelta(x.place, x.humans, row.rp);
    const rp = Math.max(0, row.rp + delta);
    await sb.rows('ranked?on_conflict=user_id,season', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: x.userId, season: SEASON, name: x.name, rp, wins: row.wins + (x.place === 1 ? 1 : 0),
        races: row.races + 1, updated_at: new Date().toISOString() }) });
    await sb.rows('ranked_results', { method: 'POST',
      body: JSON.stringify({ user_id: x.userId, season: SEASON, place: x.place, humans: x.humans, rp_delta: delta, reason: x.reason || null }) });
    out[x.userId] = { delta, rp, tier: tierOf(rp).id };
  }
  return out;
}

// the tier icon shown next to a player's name in ranked races
async function iconOf(userId) {
  const row = await rowOf(userId);
  return tierOf(row ? row.rp : 0).icon;
}

async function route(req, res, url) {
  if (!sb.enabled) return json(res, 503, { error: 'accounts are not set up on this server' });
  if (url === '/api/ranked/leaderboard' && req.method === 'GET') {
    const top = await sb.rows(`ranked?season=eq.${SEASON}&races=gt.0&select=name,rp,wins,races&order=rp.desc,wins.desc&limit=50`);
    return json(res, 200, { season: SEASON, tiers: TIERS, top: top.map(publicRow) });
  }
  if (url === '/api/ranked/me' && req.method === 'GET') {
    const user = await userFrom(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const row = await rowOf(user.id);
    return json(res, 200, { season: SEASON, me: row ? publicRow(row) : { name: null, rp: 0, wins: 0, races: 0, tier: 'bronze' } });
  }
  return json(res, 404, { error: 'not found' });
}

exports.handle = (req, res, url) => {
  route(req, res, url).catch(e => {
    console.error('[ranked]', e);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  });
};
Object.assign(exports, { enabled: sb.enabled, SEASON, TIERS, tierOf, rpDelta, saveRace, iconOf });
