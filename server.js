// Power Booster GP — game server: serves the static files and runs multiplayer rooms over WebSocket.
// Clients simulate their own racer and relay state; the room host also simulates the AI bots.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

// local secrets for development: KEY=value lines in .env (never committed). Render sets them in its dashboard instead.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) { /* no .env file */ }
const payments = require('./payments');
const supabase = require('./supabase');
const ranked = require('./ranked');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const MAX_PLAYERS = 8;
const MAX_TRACK = 4;   // highest index in PB.TRACKS (js/track.js)
const CHAR_IDS = ['nova', 'blaze', 'frost', 'leaf', 'ruby', 'dusk', 'sky', 'sunny'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.glb': 'model/gltf-binary' };
const PUBLIC = new Set(['index.html', 'css', 'js', 'icons', 'models', 'manifest.webmanifest', 'sw.js']);

// ---------- static files ----------
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url.startsWith('/api/ranked/')) { ranked.handle(req, res, url); return; }
  if (url.startsWith('/api/')) { payments.handle(req, res, url); return; }
  const rel = path.normalize(url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !PUBLIC.has(rel.split(path.sep)[0])) { res.writeHead(404); res.end('Not found'); return; }
  // list of Blender character models, so the game only requests files that exist
  if (rel === path.join('models', 'index.json')) {
    fs.readdir(path.join(ROOT, 'models'), (err, names) => {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify((names || []).filter(n => n.endsWith('.glb'))));
    });
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();   // code -> room
let nextId = 1;

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
function broadcast(room, msg, except) {
  const s = JSON.stringify(msg);
  for (const p of room.players) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s);
}
// addresses friends on the same Wi-Fi/LAN can open
const LAN = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `${a.address}:${PORT}`);

function roomInfo(room) {
  return { t: 'room', code: room.code, host: room.host, racing: room.racing, track: room.track, diff: room.diff, lan: LAN,
    players: room.players.map(p => ({ id: p.id, name: p.name, char: p.char, skin: p.skin })) };
}
function cleanName(n) { return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Player'; }
function cleanChar(c) { return CHAR_IDS.includes(c) ? c : CHAR_IDS[0]; }
// shop skin id; the client falls back to the character's own colors for ids it doesn't know
function cleanSkin(s) { return /^[a-z0-9_]{1,24}$/.test(s) ? s : 'default'; }

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter(p => p.ws !== ws);
  if (room.ranked && room.ranked.players[ws.id]) {   // leaving a ranked race counts as not finishing
    const p = room.ranked.players[ws.id];
    if (!p.finished && !p.out) p.out = 'left';
    checkRanked(room);
  }
  if (!room.players.length) { rooms.delete(room.code); return; }
  if (room.host === ws.id) room.host = room.players[0].id;   // host migration
  broadcast(room, { t: 'left', id: ws.id, host: room.host });
  broadcast(room, roomInfo(room));
}

// humans + bots up to 8, shuffled starting grid; bots take characters nobody picked first
function startRace(room) {
  room.racing = true;
  const grid = room.players.map(p => ({ id: p.id, name: p.name, char: p.char, skin: p.skin, tier: p.tier, bot: false }));
  const free = CHAR_IDS.filter(c => !grid.some(g => g.char === c));
  let b = 0;
  while (grid.length < MAX_PLAYERS) {
    const c = free.length ? free.splice(Math.floor(Math.random() * free.length), 1)[0] : CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)];
    grid.push({ id: 'bot' + b++, name: null, char: c, bot: true });
  }
  for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
  broadcast(room, { t: 'start', track: room.track, diff: room.diff, grid, host: room.host, ranked: !!room.ranked });
  broadcast(room, roomInfo(room));
}

// ---------- ranked ----------
// Signed-in players queue; once two or more have waited QUEUE_WAIT_MS (or the grid is full) they race, bots fill
// the rest. The server watches each player's own laps and decides the finishing order; ranked.js turns it into RP.
const LAPS = 3;                  // as in js/game.js
const COUNTDOWN_MS = 4200;       // race.cd in js/game.js
const MIN_LAP_MS = 15000;        // no real lap is faster than this
const QUEUE_WAIT_MS = 20000;
const FINISH_GRACE_MS = 90000;   // after the first player finishes, the rest have this long
const RACE_MAX_MS = 8 * 60000;
const queue = [];                // { ws, user, icon, name, char, skin, since }

function sendQueue() {
  const wait = queue.length ? Math.max(0, Math.ceil((queue[0].since + QUEUE_WAIT_MS - Date.now()) / 1000)) : 0;
  for (const q of queue) send(q.ws, { t: 'queue', n: queue.length, wait });
}
function unqueue(ws) {
  const i = queue.findIndex(q => q.ws === ws);
  if (i >= 0) { queue.splice(i, 1); sendQueue(); }
}
const inRankedRace = userId => [...rooms.values()].some(r => r.ranked && !r.ranked.done &&
  Object.values(r.ranked.players).some(p => p.userId === userId && !p.finished && !p.out));

function startRanked(entries) {
  const room = { code: makeCode(), host: entries[0].ws.id, players: [], racing: false, diff: 1,
    track: Math.floor(Math.random() * (MAX_TRACK + 1)), ranked: null };
  rooms.set(room.code, room);
  for (const q of entries) {
    room.players.push({ id: q.ws.id, ws: q.ws, name: q.name, char: q.char, skin: q.skin, tier: q.icon });
    q.ws.room = room;
    send(q.ws, { t: 'welcome', you: q.ws.id });
  }
  room.ranked = { start: Date.now() + COUNTDOWN_MS, firstFinish: 0, done: false, humans: entries.length,
    players: Object.fromEntries(entries.map(q => [q.ws.id, { ws: q.ws, userId: q.user.id, name: q.name, lap: 0, lapAt: 0, finished: false, out: null }])) };
  broadcast(room, roomInfo(room));
  startRace(room);
}

// a player's own racer state (relayed ~15x a second): laps must come one at a time and take a believable time
function watchRanked(room, ws, m) {
  const rk = room.ranked, p = rk.players[ws.id];
  if (rk.done || !p || p.finished || p.out) return;
  const me = (m.r || []).find(r => r && r.id === ws.id);
  if (!me) return;
  const now = Date.now(), lap = me.l | 0;
  if (lap > p.lap) {
    const tooSoon = p.lap >= 1 ? now - p.lapAt < MIN_LAP_MS : now < rk.start - 1000;
    if (lap !== p.lap + 1 || tooSoon) {
      p.out = 'invalid';
      console.warn(`[ranked] ${room.code}: ${p.name} reported lap ${lap} after lap ${p.lap} (${now - p.lapAt} ms): not counted`);
      checkRanked(room);
      return;
    }
    p.lap = lap; p.lapAt = now;
  }
  if (me.f && p.lap > LAPS) {
    p.finished = true; p.at = now;
    if (!rk.firstFinish) rk.firstFinish = now;
    checkRanked(room);
  }
}

// once nobody is still racing: finishers in finishing order, then the rest by laps done; save RP and tell everyone
function checkRanked(room) {
  const rk = room.ranked;
  if (!rk || rk.done) return;
  const now = Date.now(), ps = Object.values(rk.players);
  if ((rk.firstFinish && now - rk.firstFinish > FINISH_GRACE_MS) || now - rk.start > RACE_MAX_MS) {
    ps.forEach(p => { if (!p.finished && !p.out) p.out = 'timeout'; });
  }
  if (ps.some(p => !p.finished && !p.out)) return;
  rk.done = true;
  const order = ps.filter(p => p.finished).sort((a, b) => a.at - b.at)
    .concat(ps.filter(p => !p.finished).sort((a, b) => b.lap - a.lap || a.lapAt - b.lapAt));
  const results = order.map((p, i) => ({ userId: p.userId, name: p.name, place: i + 1, humans: rk.humans, reason: p.out }));
  ranked.saveRace(results).then(out => {
    order.forEach((p, i) => { if (p.ws.room === room) send(p.ws, Object.assign({ t: 'rankedResult', place: i + 1, humans: rk.humans, out: p.out }, out[p.userId])); });
  }).catch(e => {
    console.error('[ranked] save', e);
    for (const p of ps) if (p.ws.room === room) send(p.ws, { t: 'rankedResult', error: true });
  });
}

setInterval(() => {
  for (const room of rooms.values()) if (room.ranked) checkRanked(room);
  if (queue.length >= 2 && (queue.length >= MAX_PLAYERS || Date.now() - queue[0].since >= QUEUE_WAIT_MS)) startRanked(queue.splice(0, MAX_PLAYERS));
  sendQueue();
}, 1000);

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  ws.id = 'p' + nextId++;
  ws.room = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const room = ws.room;
    switch (m.t) {
      case 'create': {
        unqueue(ws);
        leave(ws);
        const r = { code: makeCode(), host: ws.id, players: [], racing: false, track: 0, diff: 1 };
        rooms.set(r.code, r);
        r.players.push({ id: ws.id, ws, name: cleanName(m.name), char: cleanChar(m.char), skin: cleanSkin(m.skin) });
        ws.room = r;
        send(ws, { t: 'welcome', you: ws.id });
        send(ws, roomInfo(r));
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r || r.ranked) { send(ws, { t: 'error', msg: 'ไม่พบห้องนี้' }); return; }
        if (r.players.length >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'ห้องเต็มแล้ว (8 คน)' }); return; }
        if (r.racing) { send(ws, { t: 'error', msg: 'ห้องนี้กำลังแข่งอยู่ รอจบรอบก่อน' }); return; }
        unqueue(ws);
        leave(ws);
        r.players.push({ id: ws.id, ws, name: cleanName(m.name), char: cleanChar(m.char), skin: cleanSkin(m.skin) });
        ws.room = r;
        send(ws, { t: 'welcome', you: ws.id });
        broadcast(r, roomInfo(r));
        break;
      }
      case 'setChar': {
        if (!room || room.ranked) return;
        const p = room.players.find(q => q.ws === ws);
        p.char = cleanChar(m.char);
        p.skin = cleanSkin(m.skin);
        broadcast(room, roomInfo(room));
        break;
      }
      case 'settings': {
        if (!room || room.ranked || room.host !== ws.id) return;
        room.track = Math.max(0, Math.min(MAX_TRACK, m.track | 0));
        room.diff = Math.max(0, Math.min(2, m.diff | 0));
        broadcast(room, roomInfo(room));
        break;
      }
      case 'start': {
        if (!room || room.ranked || room.host !== ws.id || room.racing) return;
        startRace(room);
        break;
      }
      case 'end': {   // host returns everyone to the lobby
        if (!room || room.ranked || room.host !== ws.id) return;
        room.racing = false;
        broadcast(room, { t: 'lobby' });
        broadcast(room, roomInfo(room));
        break;
      }
      case 'state':
        if (!room) return;
        if (room.ranked) {
          // in ranked races each player may only send their own racer (and the host the bots)
          m.r = (Array.isArray(m.r) ? m.r : []).filter(r => r && (r.id === ws.id || (room.host === ws.id && /^bot\d+$/.test(r.id))));
          watchRanked(room, ws, m);
        }
        m.from = ws.id; broadcast(room, m, ws);
        break;
      case 'event':
        if (room) { m.from = ws.id; broadcast(room, m, ws); }
        break;
      case 'rankedQueue': {
        if (!ranked.enabled) { send(ws, { t: 'error', msg: 'Ranked ยังไม่เปิดบนเซิร์ฟเวอร์นี้' }); return; }
        const req = ws.queueReq = (ws.queueReq || 0) + 1;   // a later leaveQueue cancels this request
        supabase.userFromToken(String(m.token || '')).then(async user => {
          if (req !== ws.queueReq || ws.readyState !== 1) return;
          if (!user) { send(ws, { t: 'error', msg: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' }); return; }
          if (inRankedRace(user.id)) { send(ws, { t: 'error', msg: 'บัญชีนี้กำลังแข่ง Ranked อยู่ในอีกหน้าจอ' }); return; }
          const icon = await ranked.iconOf(user.id);
          if (req !== ws.queueReq || ws.readyState !== 1) return;
          leave(ws);
          // one queue spot per account: a second tab takes over from the first
          for (const q of queue.filter(q => q.user.id === user.id && q.ws !== ws)) { unqueue(q.ws); send(q.ws, { t: 'queue', n: 0, replaced: true }); }
          unqueue(ws);
          queue.push({ ws, user, icon, name: cleanName(m.name), char: cleanChar(m.char), skin: cleanSkin(m.skin), since: Date.now() });
          sendQueue();
        }).catch(e => { console.error('[ranked] queue', e); send(ws, { t: 'error', msg: 'เข้าคิวไม่สำเร็จ ลองใหม่อีกครั้ง' }); });
        break;
      }
      case 'leaveQueue':
        ws.queueReq = (ws.queueReq || 0) + 1;
        unqueue(ws);
        break;
      case 'leave':
        leave(ws);
        break;
    }
  });
  ws.on('close', () => { unqueue(ws); leave(ws); });
});

server.listen(PORT, () => {
  console.log(`Power Booster GP server running (accounts/Ranked ${supabase.enabled ? 'on' : 'off'}, payments ${payments.enabled ? 'on' : 'off'}: see docs/PAYMENTS.md)`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const a of LAN) console.log(`  Same Wi-Fi/LAN: http://${a}`);
});
