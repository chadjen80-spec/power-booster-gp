// Power Booster GP — game server: serves the static files and runs multiplayer rooms over WebSocket.
// Clients simulate their own racer and relay state; the room host also simulates the AI bots.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

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
    players: room.players.map(p => ({ id: p.id, name: p.name, char: p.char })) };
}
function cleanName(n) { return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 14) || 'Player'; }
function cleanChar(c) { return CHAR_IDS.includes(c) ? c : CHAR_IDS[0]; }

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.players = room.players.filter(p => p.ws !== ws);
  if (!room.players.length) { rooms.delete(room.code); return; }
  if (room.host === ws.id) room.host = room.players[0].id;   // host migration
  broadcast(room, { t: 'left', id: ws.id, host: room.host });
  broadcast(room, roomInfo(room));
}

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
        leave(ws);
        const r = { code: makeCode(), host: ws.id, players: [], racing: false, track: 0, diff: 1 };
        rooms.set(r.code, r);
        r.players.push({ id: ws.id, ws, name: cleanName(m.name), char: cleanChar(m.char) });
        ws.room = r;
        send(ws, { t: 'welcome', you: ws.id });
        send(ws, roomInfo(r));
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r) { send(ws, { t: 'error', msg: 'ไม่พบห้องนี้' }); return; }
        if (r.players.length >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'ห้องเต็มแล้ว (8 คน)' }); return; }
        if (r.racing) { send(ws, { t: 'error', msg: 'ห้องนี้กำลังแข่งอยู่ รอจบรอบก่อน' }); return; }
        leave(ws);
        r.players.push({ id: ws.id, ws, name: cleanName(m.name), char: cleanChar(m.char) });
        ws.room = r;
        send(ws, { t: 'welcome', you: ws.id });
        broadcast(r, roomInfo(r));
        break;
      }
      case 'setChar': {
        if (!room) return;
        const p = room.players.find(q => q.ws === ws);
        p.char = cleanChar(m.char);
        broadcast(room, roomInfo(room));
        break;
      }
      case 'settings': {
        if (!room || room.host !== ws.id) return;
        room.track = Math.max(0, Math.min(MAX_TRACK, m.track | 0));
        room.diff = Math.max(0, Math.min(2, m.diff | 0));
        broadcast(room, roomInfo(room));
        break;
      }
      case 'start': {
        if (!room || room.host !== ws.id || room.racing) return;
        room.racing = true;
        // humans + bots up to 8, shuffled starting grid; bots take characters nobody picked first
        const grid = room.players.map(p => ({ id: p.id, name: p.name, char: p.char, bot: false }));
        const free = CHAR_IDS.filter(c => !grid.some(g => g.char === c));
        let b = 0;
        while (grid.length < MAX_PLAYERS) {
          const c = free.length ? free.splice(Math.floor(Math.random() * free.length), 1)[0] : CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)];
          grid.push({ id: 'bot' + b++, name: null, char: c, bot: true });
        }
        for (let i = grid.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [grid[i], grid[j]] = [grid[j], grid[i]]; }
        broadcast(room, { t: 'start', track: room.track, diff: room.diff, grid, host: room.host });
        broadcast(room, roomInfo(room));
        break;
      }
      case 'end': {   // host returns everyone to the lobby
        if (!room || room.host !== ws.id) return;
        room.racing = false;
        broadcast(room, { t: 'lobby' });
        broadcast(room, roomInfo(room));
        break;
      }
      case 'state':
      case 'event':
        if (room) { m.from = ws.id; broadcast(room, m, ws); }
        break;
      case 'leave':
        leave(ws);
        break;
    }
  });
  ws.on('close', () => leave(ws));
});

server.listen(PORT, () => {
  console.log(`Power Booster GP server running`);
  console.log(`  This computer:  http://localhost:${PORT}`);
  for (const a of LAN) console.log(`  Same Wi-Fi/LAN: http://${a}`);
});
