// Power Booster GP — main game: menus, race loop, racers, AI, items, 3-stage booster
(function () {
  const PB = window.PB;
  const V3 = THREE.Vector3;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const audio = PB.audio;

  const LAPS = 3;
  const STAGE_TIME = 3;                          // seconds per booster stage
  const BOOST_MUL = [1, 1.25, 1.5, 1.8];         // top-speed multiplier per booster stage
  const BOOST_COLORS = [0, 0x22e6ff, 0xff3ad0, 0xffffff];
  const GAUGE_REGEN = 7;                         // gauge % per second
  const BOOST_MIN = 20;                          // gauge % needed for a short Lv.1-only boost
  const GRAVITY = 34;
  const DIFFICULTY = [{ skill: [0.78, 0.86], rubber: 0.06, item: 0.6 }, { skill: [0.86, 0.94], rubber: 0.09, item: 1 }, { skill: [0.93, 1.0], rubber: 0.12, item: 1.4 }];

  // Item-slot picture of the TNT crate, matching the red box with the yellow TNT label dropped on the track
  function tntIcon() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const face = (pts, fill) => { x.beginPath(); pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); x.fillStyle = fill; x.fill(); x.strokeStyle = '#5a1208'; x.lineWidth = 3; x.stroke(); };
    face([[22, 42], [64, 22], [106, 42], [64, 62]], '#f0583c');                       // top
    face([[22, 42], [64, 62], [64, 112], [22, 92]], '#d03a20');                       // front-left
    face([[64, 62], [106, 42], [106, 92], [64, 112]], '#9a2412');                     // front-right
    // yellow label with TNT on the left face, as on the 3D crate
    face([[27, 58], [59, 74], [59, 94], [27, 78]], '#ffd23a');
    x.save(); x.transform(1, 0.5, 0, 1, 27, 58);
    x.fillStyle = '#d03a20'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('TNT', 16, 10); x.restore();
    face([[69, 72], [101, 56], [101, 76], [69, 92]], '#e0b020');                      // label wraps round the corner
    return c.toDataURL();
  }

  const ITEMS = {
    missile: { icon: '🚀', name: 'มิสไซล์ติดตาม' },
    bomb: { icon: '💣', name: 'ระเบิดขว้าง' },
    mine: { icon: '🧨', img: tntIcon(), name: 'กับระเบิด TNT' },
    shield: { icon: '🛡️', name: 'โล่พลังงาน' },
    turbo: { icon: '🔥', name: 'เทอร์โบ' },
    emp: { icon: '⚡', name: 'EMP ช็อกทุกคันข้างหน้า' },
  };
  const ITEM_TABLE = [
    { mine: 4, shield: 3, bomb: 2, turbo: 1 },                         // 1st-2nd
    { missile: 3, bomb: 3, mine: 2, shield: 2, turbo: 2 },             // 3rd-5th
    { missile: 4, turbo: 3, emp: 2, shield: 1, bomb: 1 },              // 6th-8th
  ];
  function rollItem(place) {
    const t = ITEM_TABLE[place <= 2 ? 0 : place <= 5 ? 1 : 2];
    let sum = 0; for (const k in t) sum += t[k];
    let r = Math.random() * sum;
    for (const k in t) { r -= t[k]; if (r <= 0) return k; }
    return 'turbo';
  }

  // ---------------- renderer / cameras ----------------
  const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
  const Q = PB.quality;   // graphics preset (js/optimize.js)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 3000);
  renderer.setSize(window.innerWidth, window.innerHeight);
  const post = PB.fx.createComposer(renderer, new THREE.Scene(), camera, { msaa: Q.msaa, bloom: Q.bloom });
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  function renderScene(scene) {
    if (!window.innerWidth || !window.innerHeight) return;   // minimized / hidden: nothing to draw into
    post.setScene(scene); post.render();
  }

  // ---------------- input ----------------
  const keys = {};
  const pressed = new Set();
  window.addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed.add(e.code);
    keys[e.code] = true;
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  const down = (...codes) => codes.some(c => keys[c]);
  const hit = (...codes) => codes.some(c => pressed.has(c));
  // virtual input for touch controls (js/touch.js): held buttons map onto key codes, steering is analog
  const vin = { steer: null, autoGas: false };
  PB.input = {
    hold(code, on) { if (on && !keys[code]) pressed.add(code); keys[code] = on; },
    tap(code) { pressed.add(code); },
    setSteer(v) { vin.steer = v; },
    setAutoGas(on) { vin.autoGas = on; },
  };

  // ---------------- menu showroom ----------------
  const menu = { scene: new THREE.Scene(), model: null, t: 0 };
  (function buildShowroom() {
    const s = menu.scene;
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#120838'); g.addColorStop(0.6, '#3a1a7a'); g.addColorStop(1, '#ff3ad0');
    x.fillStyle = g; x.fillRect(0, 0, 2, 256);
    s.background = new THREE.CanvasTexture(c);
    s.add(new THREE.HemisphereLight(0xffffff, 0x6a4aaa, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(4, 8, 6); s.add(dl);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 0.6, 48), new THREE.MeshLambertMaterial({ color: 0x1a1240 }));
    plat.position.y = -0.6; s.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: 0x22f0ff }));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.28; s.add(ring);
    const grid = new THREE.GridHelper(200, 50, 0xff3ad0, 0x2a1a5a); grid.position.y = -0.9; s.add(grid);
  })();
  function setMenuModel(def) {
    if (menu.model) { menu.scene.remove(menu.model.root); PB.disposeTree(menu.model.root); }
    menu.model = PB.buildRacerModel(def);
    menu.model.rainbow = !!def.rainbow;
    menu.scene.add(menu.model.root);
  }

  // ---------------- game state ----------------
  const state = { screen: 'title', charIdx: 0, trackIdx: 0, diff: 1, mode: 'solo' };
  let race = null;

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    if (id) $(id).classList.add('show');
  }
  function goScreen(name) {
    audio.sfx('select');
    state.screen = name;
    if (name === 'title') { endRace(); show('scr-title'); setMenuModel(PB.shop.dress(PB.CHARACTERS[state.charIdx], PB.shop.skin)); }
    if (name === 'char') { endRace(); show('scr-char'); selectChar(state.charIdx); }
    if (name === 'track') { endRace(); show('scr-track'); }
    if (name === 'shop') { endRace(); show('scr-shop'); openShop(); }
    if (name === 'online') { endRace(); show('scr-online'); $('on-msg').textContent = ''; }
    if (name === 'lobby') { endRace(); show('scr-lobby'); renderLobby(); $('on-msg').textContent = ''; }
    $('hud').classList.toggle('hidden', !!(name !== 'race'));
  }
  function leaveOnline() { if (PB.net.room) PB.net.leave(); }
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => goScreen(b.dataset.go)));
  $('btn-start').addEventListener('click', () => { audio.init(); leaveOnline(); state.mode = 'solo'; goScreen('char'); });
  $('btn-online').addEventListener('click', () => { audio.init(); state.mode = 'online'; goScreen('char'); });
  $('btn-char-ok').addEventListener('click', () => {
    if (state.mode === 'solo') { goScreen('track'); return; }
    if (PB.net.room) { PB.net.send({ t: 'setChar', char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin }); goScreen('lobby'); }
    else goScreen('online');
  });
  $('btn-shop').addEventListener('click', () => { audio.init(); goScreen('shop'); });
  $('btn-race').addEventListener('click', () => startRace());
  $('btn-resume').addEventListener('click', () => togglePause(false));
  $('btn-restart').addEventListener('click', () => startRace());
  $('btn-quit').addEventListener('click', () => { leaveOnline(); goScreen('title'); });
  $('btn-again').addEventListener('click', () => {
    if (!race || !race.online) { startRace(); return; }
    if (PB.net.isHost()) PB.net.send({ t: 'end' });
    else goScreen('lobby');
  });
  $('btn-tracks').addEventListener('click', () => goScreen('track'));
  // graphics quality: renderer settings are fixed at startup, so switching reloads the page (only offered on the title screen)
  document.querySelectorAll('[data-q]').forEach(b => {
    b.classList.toggle('sel', b.dataset.q === Q.level);
    b.addEventListener('click', () => { if (b.dataset.q === Q.level) return; PB.optimize.setLevel(b.dataset.q); location.reload(); });
  });
  $('btn-menu').addEventListener('click', () => { leaveOnline(); goScreen('title'); });

  // ---------------- online lobby ----------------
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
  $('on-name').value = store.get('pb-name') || '';
  // the web version talks to the server it was loaded from; the Android app (served from its own files) uses PB.CONFIG.server
  const defaultServer = PB.isApp ? (PB.CONFIG.server || '') : location.protocol.startsWith('http') ? location.host : 'localhost:3000';
  $('on-server').value = store.get('pb-server') || defaultServer;
  $('on-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  async function connectAnd(msg) {
    const name = $('on-name').value.trim() || 'Player', server = $('on-server').value.trim();
    store.set('pb-name', name); store.set('pb-server', server);
    $('on-msg').textContent = 'กำลังเชื่อมต่อ...';
    try { await PB.net.connect(server); }
    catch (e) { $('on-msg').textContent = `เชื่อมต่อเซิร์ฟเวอร์ ${server} ไม่ได้ (เปิด server.js แล้วหรือยัง?)`; return; }
    PB.net.send(Object.assign({ name, char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin }, msg));
  }
  $('btn-create').addEventListener('click', () => connectAnd({ t: 'create' }));
  $('btn-join').addEventListener('click', () => {
    const code = $('on-code').value.trim();
    if (code.length !== 4) { $('on-msg').textContent = 'ใส่รหัสห้อง 4 ตัว'; return; }
    connectAnd({ t: 'join', code });
  });
  $('on-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
  PB.TRACKS.forEach((t, i) => $('lb-track').insertAdjacentHTML('beforeend', `<option value="${i}">${t.name} — ${t.th}</option>`));
  const sendSettings = () => PB.net.send({ t: 'settings', track: +$('lb-track').value, diff: +$('lb-diff').value });
  $('lb-track').addEventListener('change', sendSettings);
  $('lb-diff').addEventListener('change', sendSettings);
  $('lb-start').addEventListener('click', () => PB.net.send({ t: 'start' }));
  $('lb-char').addEventListener('click', () => goScreen('char'));
  $('lb-leave').addEventListener('click', () => { leaveOnline(); goScreen('online'); });

  function renderLobby() {
    const room = PB.net.room;
    if (!room) return;
    const host = PB.net.isHost();
    $('lb-code').textContent = room.code;
    // "localhost" only works on the host's own machine, so point friends at the server's LAN address instead
    const here = !PB.isApp && location.protocol.startsWith('http') ? location.host : $('on-server').value;
    const local = /^(localhost|127\.)/.test(here);
    $('lb-url').textContent = local && room.lan && room.lan.length ? room.lan.join(' หรือ ') : here;
    const slots = room.players.map(p => {
      const c = PB.CHARACTERS.find(x => x.id === p.char) || PB.CHARACTERS[0];
      return `<li class="${p.id === PB.net.id ? 'me' : ''}"><img src="${portraits[c.id] || ''}" alt="">` +
        `<div><div class="nm">${p.id === room.host ? '👑 ' : ''}${esc(p.name)}</div><div class="sub">${c.name}${p.id === PB.net.id ? ' • คุณ' : ''}</div></div></li>`;
    });
    for (let i = room.players.length; i < 8; i++) slots.push('<li class="empty">🤖 บอท AI</li>');
    $('lb-players').innerHTML = slots.join('');
    $('lb-track').value = room.track; $('lb-diff').value = room.diff;
    $('lb-track').disabled = $('lb-diff').disabled = !host;
    $('lb-start').classList.toggle('hidden', !host);
    $('lb-start').disabled = room.racing;
    $('lb-wait').textContent = room.racing ? 'ห้องนี้กำลังแข่งอยู่... รอหัวห้องพากลับล็อบบี้' : host ? 'คุณเป็นหัวห้อง เลือกด่านแล้วกดเริ่มแข่งได้เลย' : 'รอหัวห้องกดเริ่มแข่ง...';
  }

  const net = PB.net;
  net.on('room', () => {
    if (state.screen === 'online') goScreen('lobby');
    else if (state.screen === 'lobby') renderLobby();
  });
  net.on('error', m => { $('on-msg').textContent = m.msg; });
  net.on('start', m => {
    state.trackIdx = m.track; state.diff = m.diff;
    togglePause(false);
    $('scr-results').classList.remove('show');
    startRace(m.grid);
  });
  net.on('lobby', () => { if (state.mode === 'online') goScreen('lobby'); });
  net.on('state', m => {
    if (!race || !race.online) return;
    const now = performance.now();
    for (const pk of m.r || []) {
      const r = race.racers.find(q => q.netId === pk.id);
      if (r && !r.auth) { pk.at = now; r.net = pk; }
    }
  });
  net.on('event', m => {
    if (!race || !race.online) return;
    if (m.e === 'item') {
      const r = race.racers.find(q => q.netId === m.r);
      if (r && !r.auth) applyItem(r, m);
    } else if (m.e === 'boom') {
      const p = race.projectiles.find(q => q.id === m.pid);
      if (p) { p.pos.set(m.x, m.y, m.z); detonate(p); }
    } else if (m.e === 'mine') {
      const mn = race.mines.find(q => q.id === m.pid);
      if (mn && !mn.dead) { mn.dead = true; explode(mn.pos.clone(), 5, 0xff5020); }
    }
  });
  // a player who leaves mid-race keeps racing as a bot (driven by the host)
  net.on('left', m => {
    if (state.screen === 'lobby') renderLobby();
    if (!race || !race.online) return;
    const r = race.racers.find(q => q.netId === m.id);
    if (r && r.ctrl === 'remote') { r.ctrl = 'bot'; r.net = null; bigMsg(`${r.name} ออกจากเกม`, true); }
  });
  net.on('disconnect', () => {
    if (race && race.online) {
      // finish the race offline: everyone else becomes a local bot
      race.online = false;
      race.racers.forEach(r => { if (r.ctrl === 'remote') r.ctrl = 'bot'; });
      bigMsg('หลุดจากเซิร์ฟเวอร์', true);
    } else if (state.screen === 'lobby') {
      goScreen('online'); $('on-msg').textContent = 'หลุดจากเซิร์ฟเวอร์';
    }
  });

  // character grid
  let portraits = {};
  function buildCharGrid() {
    const grid = $('char-grid');
    grid.innerHTML = '';
    PB.CHARACTERS.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'char-card';
      d.innerHTML = `<img src="${portraits[c.id]}" alt=""><span>${c.name}</span>`;
      d.addEventListener('click', () => { audio.sfx('select'); selectChar(i); });
      grid.appendChild(d);
    });
  }
  function selectChar(i) {
    state.charIdx = i;
    const c = PB.CHARACTERS[i];
    document.querySelectorAll('.char-card').forEach((d, k) => d.classList.toggle('sel', k === i));
    $('char-name').textContent = c.name;
    $('char-title').textContent = c.title;
    $('st-speed').style.width = c.stats.speed * 20 + '%';
    $('st-accel').style.width = c.stats.accel * 20 + '%';
    $('st-handling').style.width = c.stats.handling * 20 + '%';
    setMenuModel(PB.shop.dress(c, PB.shop.skin));
  }

  // ---------------- shop ----------------
  // the showroom model wears whichever skin is picked in the grid, so it can be tried before buying
  const shopUI = { sel: PB.shop.skin };
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const showCoins = () => document.querySelectorAll('[data-coins]').forEach(e => { e.textContent = PB.shop.coins.toLocaleString(); });
  PB.shop.onChange(showCoins);
  showCoins();
  function buildShopGrid() {
    const grid = $('shop-grid'), def = PB.CHARACTERS[state.charIdx];
    grid.innerHTML = PB.SKINS.map(k => {
      const d = PB.shop.dress(def, k.id);
      const sw = k.rainbow ? 'linear-gradient(135deg,#ff3a3a,#ffd23a,#3aff7a,#22c0ff,#b03aff)'
        : `linear-gradient(135deg,${hex(d.board)} 55%,${hex(d.boardAccent)} 55% 75%,${hex(d.flame)} 75%)`;
      const tag = k.id === PB.shop.skin ? '✔ ใส่อยู่' : PB.shop.owns(k.id) ? 'มีแล้ว' : `🪙 ${k.price.toLocaleString()}`;
      return `<div class="shop-card r-${k.rarity}${k.id === shopUI.sel ? ' sel' : ''}" data-skin="${k.id}">` +
        `<div class="sw" style="background:${sw}"></div><div class="nm">${k.name}</div><div class="pr">${tag}</div></div>`;
    }).join('');
    grid.querySelectorAll('.shop-card').forEach(c => c.addEventListener('click', () => { audio.sfx('select'); pickSkin(c.dataset.skin); }));
  }
  function pickSkin(id) {
    shopUI.sel = id;
    const k = PB.shop.find(id);
    $('shop-name').textContent = k.name;
    $('shop-rarity').textContent = PB.RARITY[k.rarity];
    $('shop-rarity').className = 'shop-rarity r-' + k.rarity;
    $('shop-msg').textContent = '';
    const act = $('btn-shop-act');
    if (id === PB.shop.skin) { act.textContent = '✔ ใส่อยู่'; act.disabled = true; }
    else if (PB.shop.owns(id)) { act.textContent = 'ใส่สกินนี้'; act.disabled = false; }
    else { act.textContent = `ซื้อ 🪙 ${k.price.toLocaleString()}`; act.disabled = false; }
    buildShopGrid();
    setMenuModel(PB.shop.dress(PB.CHARACTERS[state.charIdx], id));
  }
  function openShop() { pickSkin(PB.shop.skin); }
  $('btn-shop-act').addEventListener('click', () => {
    const id = shopUI.sel, k = PB.shop.find(id);
    if (PB.shop.owns(id)) PB.shop.equip(id);
    else if (!PB.shop.buy(id)) {
      $('shop-msg').textContent = `เหรียญไม่พอ ขาดอีก 🪙 ${(k.price - PB.shop.coins).toLocaleString()} ลงแข่งเพื่อรับเหรียญ!`;
      return;
    }
    audio.sfx('finish');
    pickSkin(id);
    $('shop-msg').textContent = 'ใส่สกินแล้ว!';
    if (PB.net.room) PB.net.send({ t: 'setChar', char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin });
  });

  // track grid with minimap previews
  function buildTrackGrid() {
    const grid = $('track-grid');
    PB.TRACKS.forEach((t, i) => {
      const d = document.createElement('div');
      d.className = 'track-card' + (i === state.trackIdx ? ' sel' : '');
      const cv = document.createElement('canvas'); cv.width = 280; cv.height = 200;
      const pts = PB.trackPreview(t, 200);
      const ctx = cv.getContext('2d');
      const bg = { cove: ['#1aa3c9', '#7fe0ff'], neon: ['#0a0420', '#3a0f5a'], volcano: ['#40100a', '#ff8a40'],
        sky: ['#4aa0ff', '#ffe6f5'], snow: ['#061230', '#7ab0e0'] }[t.theme];
      const gr = ctx.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, bg[0]); gr.addColorStop(1, bg[1]);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 280, 200);
      drawPath(ctx, pts, 280, 200, 22, t.theme === 'neon' ? '#22f0ff' : '#ffffff', 7);
      d.appendChild(cv);
      d.insertAdjacentHTML('beforeend', `<h3>${t.name}</h3><div class="th">${t.th}</div><p>${t.desc}</p>`);
      d.addEventListener('click', () => {
        audio.sfx('select'); state.trackIdx = i;
        document.querySelectorAll('.track-card').forEach((e, k) => e.classList.toggle('sel', k === i));
      });
      grid.appendChild(d);
    });
    document.querySelectorAll('[data-diff]').forEach(b => {
      b.classList.toggle('sel', +b.dataset.diff === state.diff);
      b.addEventListener('click', () => {
        state.diff = +b.dataset.diff; audio.sfx('select');
        document.querySelectorAll('[data-diff]').forEach(e => e.classList.toggle('sel', e === b));
      });
    });
  }
  function mapFit(pts, w, h, pad) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
    const ox = (w - (maxX - minX) * s) / 2, oz = (h - (maxZ - minZ) * s) / 2;
    // x is mirrored so the map matches the rear-view camera's left/right
    return p => [w - (ox + (p.x - minX) * s), oz + (p.z - minZ) * s];
  }
  function drawPath(ctx, pts, w, h, pad, color, width) {
    const f = mapFit(pts, w, h, pad);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = width + 4;
    ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = f(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = f(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
    const [sx, sy] = f(pts[0]);
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(sx - 5, sy - 5, 10, 10);
    return f;
  }

  // ---------------- trails (booster ribbons) ----------------
  class Trail {
    constructor(scene, len) {
      this.len = len; this.pts = [];
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(len * 2 * 3);
      this.col = new Float32Array(len * 2 * 4); // RGBA: alpha fades the tail
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
      const idx = [];
      for (let i = 0; i < len - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      g.setIndex(idx);
      this.geo = g;
      this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true,
        depthWrite: false, side: THREE.DoubleSide }));
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
      this.c = new THREE.Color();
    }
    update(active, center, right, width, colorFn, time) {
      if (active) this.pts.push({ c: center.clone(), r: right.clone() });
      if (this.pts.length > this.len || (!active && this.pts.length)) this.pts.shift();
      if (!active && this.pts.length) this.pts.shift();
      const n = this.pts.length;
      for (let i = 0; i < n; i++) {
        const p = this.pts[i], a = (i + 1) / n, w = width * (0.3 + 0.7 * a);
        const k = i * 6;
        this.pos[k] = p.c.x + p.r.x * w; this.pos[k + 1] = p.c.y; this.pos[k + 2] = p.c.z + p.r.z * w;
        this.pos[k + 3] = p.c.x - p.r.x * w; this.pos[k + 4] = p.c.y; this.pos[k + 5] = p.c.z - p.r.z * w;
        colorFn(this.c, i / this.len, time);
        const q = i * 8, alpha = a * a * 0.6;
        this.col[q] = this.col[q + 4] = this.c.r;
        this.col[q + 1] = this.col[q + 5] = this.c.g;
        this.col[q + 2] = this.col[q + 6] = this.c.b;
        this.col[q + 3] = this.col[q + 7] = alpha;
      }
      this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  // ---------------- racer ----------------
  class Racer {
    // opts.ctrl: 'local' (this browser's human), 'remote' (another human online) or 'bot'
    constructor(def, isPlayer, track, idx, lat, scene, diff, opts) {
      opts = opts || {};
      this.def = def; this.isPlayer = isPlayer; this.name = opts.name || def.name;
      this.ctrl = opts.ctrl || (isPlayer ? 'local' : 'bot');
      this.netId = opts.netId;
      this.net = null;   // latest network state for racers simulated elsewhere
      this.model = PB.buildRacerModel(def);
      if (this.ctrl === 'remote') this.model.root.add(makeNameTag(this.name));
      scene.add(this.model.root);
      this.trail = new Trail(scene, 46);
      const s = track.samples[idx];
      this.pos = s.p.clone().addScaledVector(s.n, lat);
      this.heading = Math.atan2(s.flat.x, s.flat.z);
      this.speed = 0; this.idx = idx; this.lap = 0; this.progress = 0;
      this.finished = false; this.finishTime = 0; this.place = 8;
      this.item = null; this.rolling = 0; this.pendingItem = null;
      this.gauge = rand(40, 70); this.stage = 0; this.stageTimer = 0; this.stageDur = STAGE_TIME; this.boostMax = 3;
      this.turbo = 0; this.spin = 0; this.shield = 0; this.shock = 0;
      this.drifting = false; this.driftDir = 0; this.driftTime = 0;
      this.steerVis = 0; this.hop = 0; this.bob = Math.random() * 10; this.wallCd = 0;
      this.wrongTime = 0;
      // jumping / falling
      this.air = false; this.vy = 0; this.airTime = 0; this.onRamp = null;
      this.falling = false; this.fallT = 0; this.respawnT = 0; this.land = 0;
      this.moveHeading = this.heading;   // travel direction; lags the nose on slippery tracks
      const st = def.stats;
      this.maxSpeed = 70 + (st.speed - 3) * 2.6;
      this.accel = 32 + (st.accel - 3) * 5;
      this.turnRate = 1.75 + (st.handling - 3) * 0.12;
      // AI personality
      const d = DIFFICULTY[diff];
      this.skill = rand(d.skill[0], d.skill[1]);
      this.lane = rand(-0.5, 0.5) * track.W;
      this.laneTimer = rand(2, 6);
      this.aiItemTimer = 0;
      this.aiDrift = 0;
      this.input = { throttle: 0, brake: 0, steer: 0, drift: false };
    }

    get forward() { return new V3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

    // true when this browser simulates the racer: our own player, and the bots when we host (or play solo)
    get auth() { return this.ctrl === 'local' || (this.ctrl === 'bot' && (!race.online || PB.net.isHost())); }

    serialize() {
      const r2 = v => Math.round(v * 100) / 100;
      return { id: this.netId, x: r2(this.pos.x), y: r2(this.pos.y), z: r2(this.pos.z), h: r2(this.heading), s: r2(this.speed),
        st: this.stage, stt: r2(this.stageTimer), tu: r2(this.turbo), sp: r2(this.spin), sh: r2(this.shield), sk: r2(this.shock),
        dr: this.drifting ? this.driftDir : 0, dt: r2(this.driftTime), l: this.lap, i: this.idx, f: this.finished ? 1 : 0,
        ft: r2(this.finishTime), str: r2(this.input.steer), th: this.input.throttle, g: Math.round(this.gauge),
        a: this.falling ? 2 : this.air ? 1 : 0, vy: r2(this.vy), rt: r2(this.respawnT) };
    }

    // follow the latest network state: extrapolate along the reported velocity and ease toward it
    updateRemote(dt, track) {
      const n = this.net;
      if (n) {
        const age = Math.min(0.3, (performance.now() - n.at) / 1000);
        const tx = n.x + Math.sin(n.h) * n.s * age, tz = n.z + Math.cos(n.h) * n.s * age;
        const dx = tx - this.pos.x, dz = tz - this.pos.z;
        if (dx * dx + dz * dz > 400) this.pos.set(tx, n.y, tz);
        else { const k = Math.min(1, 12 * dt); this.pos.x += dx * k; this.pos.z += dz * k; }
        this.heading += wrapAngle(n.h - this.heading) * Math.min(1, 12 * dt);
        this.speed = n.s; this.stage = n.st; this.stageTimer = n.stt; this.turbo = n.tu; this.spin = n.sp;
        this.shield = n.sh; this.shock = n.sk; this.drifting = n.dr !== 0; this.driftDir = n.dr; this.driftTime = n.dt;
        this.lap = n.l; this.finished = !!n.f; this.finishTime = n.ft; this.gauge = n.g;
        this.input.steer = n.str; this.input.throttle = n.th;
        this.air = n.a === 1; this.falling = n.a === 2; this.vy = n.vy || 0; this.respawnT = n.rt || 0;
        this.model.body.rotation.x = this.falling ? this.model.body.rotation.x + dt * 7 : 0;
        this.progress = (this.lap - 1) * track.N + n.i;
      }
      this.idx = track.nearest(this.pos, this.idx);
      const gy = n ? n.y : track.heightAt(this.pos, this.idx);   // reported height, so jumps and falls show
      this.pos.y += (gy - this.pos.y) * Math.min(1, 14 * dt);
      this.updateModel(dt, track.samples[this.idx], this.input);
    }

    // Full gauge: Lv.1 -> Lv.2 -> Lv.3 with a 3s countdown each.
    // Partial gauge (>= BOOST_MIN): Lv.1 only, lasting a share of 3s that matches the gauge, and it empties the gauge.
    activateBooster() {
      if (this.stage > 0 || this.gauge < BOOST_MIN || this.spin > 0) return false;
      const full = this.gauge >= 100;
      this.stage = 1;
      this.boostMax = full ? 3 : 1;
      this.stageDur = full ? STAGE_TIME : Math.max(0.6, STAGE_TIME * this.gauge / 100);
      this.stageTimer = this.stageDur;
      this.gauge = full ? 100 : 0;
      if (this.isPlayer) { audio.sfx('boost1'); bigMsg(full ? 'BOOST Lv.1' : 'BOOST!', true); }
      return true;
    }

    takeHit(kind) {
      if (!this.auth) return;   // the browser that simulates a racer decides its hits
      if (this.respawnT > 0 || this.falling) return;
      if (this.finished && !this.isPlayer) return;
      if (this.shield > 0) {
        this.shield = 0;
        spawnBurst(this.pos.clone().add(new V3(0, 1.6, 0)), 0x44ccff, 3.5);
        if (this.isPlayer) audio.sfx('shield');
        return;
      }
      if (kind === 'shock') { this.shock = 2.5; this.speed *= 0.55; }
      else { this.spin = 1.4; this.speed *= 0.25; }
      if (this.stage > 0) { this.stage = 0; if (this.boostMax === 3) this.gauge = 30; }   // a full boost keeps a little charge
      this.drifting = false; this.turbo = 0;
      if (this.isPlayer) { audio.sfx('hit'); race.shake = 0.6; bigMsg(kind === 'shock' ? 'โดนช็อก!' : 'โดนโจมตี!', true); }
    }

    giveItemBox() {
      if (!this.auth) return;
      this.gauge = Math.min(100, this.gauge + 12);
      if (this.item || this.rolling > 0) return;
      this.pendingItem = rollItem(this.place);
      this.rolling = this.isPlayer ? 1.2 : 0.5;
      if (this.isPlayer) audio.sfx('pickup');
    }

    useItem() {
      const it = this.item;
      if (!it) return;
      this.item = null;
      const ev = { e: 'item', r: this.netId, it, x: this.pos.x, y: this.pos.y, z: this.pos.z, h: this.heading, s: this.speed,
        pid: `${race.online ? PB.net.id : 'L'}-${race.pidSeq++}` };
      if (it === 'missile') {
        const target = race.racers.filter(r => r !== this && !r.finished && r.place < this.place).sort((a, b) => b.place - a.place)[0];
        ev.tg = target ? target.netId : null;
      }
      applyItem(this, ev);
      netEvent(ev);
    }

    progressTotal() { return this.finished ? 1e9 - this.finishTime : this.progress; }

    think(dt, track) {
      const inp = this.input;
      const N = track.N;
      // occasionally change preferred lane
      this.laneTimer -= dt;
      if (this.laneTimer <= 0) { this.laneTimer = rand(2, 6); this.lane = clamp(this.lane + rand(-6, 6), -track.W * 0.65, track.W * 0.65); }
      const look = 6 + Math.floor(Math.abs(this.speed) * 0.12);
      const ti = (this.idx + look) % N;
      const s = track.samples[ti];
      // dodge mines ahead
      let lane = this.lane;
      for (const m of race.mines) {
        if (m.dead) continue;
        const d = (m.idx - this.idx + N) % N;
        if (d > 2 && d < 25 && Math.abs(m.lat - lane) < 4) lane = m.lat + (m.lat > 0 ? -6 : 6);
      }
      // steer around holes: nudge the lane just clear of each one, on whichever side it already is
      for (const h of track.holes) {
        const d = (h.idx - this.idx + N) % N, need = h.r + 2.5;
        if (d > 1 && d < 50 && Math.abs(lane - h.lat) < need) lane = h.lat + Math.sign(lane - h.lat || -h.lat) * need;
      }
      const tx = s.p.x + s.n.x * lane, tz = s.p.z + s.n.z * lane;
      const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      // steer by where we're actually travelling, so bots counter-steer their slides on ice
      const diff = wrapAngle(desired - this.moveHeading);
      inp.steer = clamp(diff * 3 + wrapAngle(this.moveHeading - this.heading) * 1.5, -1, 1);
      inp.throttle = 1;
      inp.brake = Math.abs(diff) > 1.2 && this.speed > 30 ? 1 : 0;
      // drift through sharp corners
      const curv = track.samples[(this.idx + look + 4) % N].curv;
      if (Math.abs(curv) > 0.3 && this.speed > 40) this.aiDrift = 0.9;
      this.aiDrift -= dt;
      inp.drift = this.aiDrift > 0;
      // booster: fire on straights
      if (this.stage === 0 && this.gauge >= 100 && Math.abs(curv) < 0.12 && Math.random() < dt * 0.6) this.activateBooster();
      // items
      if (this.item) {
        this.aiItemTimer -= dt * DIFFICULTY[state.diff].item;
        if (this.aiItemTimer <= 0) {
          const it = this.item;
          if (it === 'missile' && this.place === 1) { if (Math.random() < 0.5) this.useItem(); else this.aiItemTimer = 2; }
          else if (it === 'turbo' && Math.abs(curv) > 0.15) this.aiItemTimer = 0.5;
          else this.useItem();
        }
      }
    }

    update(dt, track, canControl) {
      if (!this.auth) { this.updateRemote(dt, track); return; }
      const inp = this.input;
      const N = track.N;
      // --- item roulette ---
      if (this.rolling > 0) {
        this.rolling -= dt;
        if (this.rolling <= 0) {
          this.item = this.pendingItem; this.pendingItem = null;
          this.aiItemTimer = rand(1, 4);
          if (this.isPlayer) audio.sfx('got');
        }
      }
      // --- control source ---
      if (this.isPlayer && !this.finished) {
        inp.brake = down('KeyS', 'ArrowDown') ? 1 : 0;
        inp.throttle = down('KeyW', 'ArrowUp') || (vin.autoGas && !inp.brake) ? 1 : 0;   // touch: gas is always on
        inp.steer = vin.steer !== null ? vin.steer : (down('KeyA', 'ArrowLeft') ? 1 : 0) - (down('KeyD', 'ArrowRight') ? 1 : 0);
        inp.drift = down('Space');
        if (canControl) {
          if (hit('ShiftLeft', 'ShiftRight', 'KeyK')) {
            if (!this.activateBooster() && this.stage === 0) bigMsg(`BOOSTER ${Math.floor(this.gauge)}% (ต้องมี ${BOOST_MIN}%)`, true);
          }
          if (hit('KeyE', 'KeyJ')) this.useItem();
        }
      } else if (canControl) {
        this.think(dt, track);
      }
      if (!canControl) { inp.steer = 0; inp.drift = false; if (!this.isPlayer) inp.throttle = 0; }

      // --- timers ---
      this.spin = Math.max(0, this.spin - dt);
      this.shock = Math.max(0, this.shock - dt);
      this.turbo = Math.max(0, this.turbo - dt);
      this.shield = Math.max(0, this.shield - dt);
      this.wallCd = Math.max(0, this.wallCd - dt);
      this.respawnT = Math.max(0, this.respawnT - dt);
      if (this.falling) { this.updateFall(dt, track); return; }

      // --- 3-stage booster ---
      if (this.stage > 0) {
        const before = Math.ceil(this.stageTimer);
        this.stageTimer -= dt;
        if (this.isPlayer && Math.ceil(this.stageTimer) !== before && this.stageTimer > 0) audio.sfx('tick');
        if (this.stageTimer <= 0) {
          if (this.stage < this.boostMax) {
            this.stage++; this.stageTimer = this.stageDur = STAGE_TIME;
            if (this.isPlayer) { audio.sfx('boost' + this.stage); bigMsg(this.stage === 3 ? 'MAX BOOST!!' : 'BOOST Lv.' + this.stage, true); race.shake = 0.3; }
          } else { this.stage = 0; this.gauge = 0; }
        }
      } else if (canControl) {
        this.gauge = Math.min(100, this.gauge + GAUGE_REGEN * dt);
      }

      // --- speed ---
      let top = this.maxSpeed * BOOST_MUL[this.stage] * (this.turbo > 0 ? 1.3 : 1) * (this.shock > 0 ? 0.6 : 1);
      if (!this.isPlayer || this.finished) top *= this.aiFactor();
      let throttle = inp.throttle, steer = inp.steer;
      if (this.spin > 0) { throttle = 0; steer = 0; }
      if (!canControl) throttle = 0;
      if (this.stage > 0 || this.turbo > 0) throttle = Math.max(throttle, 1);   // boosting always pushes forward
      else if (this.air) throttle = 0;                                          // no grip in the air: just coast
      if (throttle && !(inp.brake && this.stage === 0)) {
        const a = this.accel * (this.stage > 0 ? 1.4 + this.stage * 0.3 : 1) * (this.turbo > 0 ? 2 : 1);
        if (this.speed < top) this.speed = Math.min(top, this.speed + a * dt * (this.speed < 0 ? 3 : 1));
      } else if (inp.brake && canControl && this.spin <= 0) {
        this.speed -= (this.speed > 0 ? 75 : 22) * dt;
        this.speed = Math.max(this.speed, -18);
      } else {
        const drag = (this.air ? 3 : 14) * dt;
        this.speed = Math.abs(this.speed) < drag ? 0 : this.speed - Math.sign(this.speed) * drag;
      }
      if (this.speed > top) this.speed = Math.max(top, this.speed - 40 * dt);

      // --- steering + drift ---
      let eff = steer;
      if (inp.drift && !this.drifting && !this.air && Math.abs(steer) > 0.2 && this.speed > 30 && this.spin <= 0) {
        this.drifting = true; this.driftDir = Math.sign(steer); this.driftTime = 0; this.hop = 0.35;
      }
      if (this.drifting) {
        if (!inp.drift || this.speed < 18 || this.spin > 0) {
          if (this.driftTime > 0.9 && this.spin <= 0) {
            this.turbo = Math.max(this.turbo, this.driftTime > 2 ? 1.2 : 0.7);
            if (this.isPlayer) audio.sfx('turbo');
          }
          this.drifting = false;
        } else {
          this.driftTime += dt;
          eff = this.driftDir * 0.65 + steer * 0.55;
        }
      }
      const handling = this.turnRate * (1 - 0.1 * this.stage) * (this.drifting ? 1.3 : 1) * (this.air ? 0.45 : 1);
      const sf = clamp(Math.abs(this.speed) / 22, 0, 1);
      this.heading += eff * handling * sf * dt * Math.sign(this.speed || 1);
      if (this.spin > 0) this.speed *= Math.pow(0.4, dt);

      // --- move --- (on ice the travel direction catches up with the nose slowly, so the board slides)
      const grip = track.theme.grip || 30;
      if (!this.air) this.moveHeading += wrapAngle(this.heading - this.moveHeading) * Math.min(1, grip * dt * (this.drifting ? 0.7 : 1));
      this.pos.x += Math.sin(this.moveHeading) * this.speed * dt;
      this.pos.z += Math.cos(this.moveHeading) * this.speed * dt;

      // --- track constraint ---
      const prevIdx = this.idx;
      this.idx = track.nearest(this.pos, this.idx);
      const s = track.samples[this.idx];
      const lat = track.lateral(this.pos, this.idx);
      const lim = track.W - 1.1;
      if (Math.abs(lat) > lim) {
        const over = lat - Math.sign(lat) * lim;
        this.pos.x -= s.n.x * over; this.pos.z -= s.n.z * over;
        const th = Math.atan2(s.flat.x, s.flat.z);
        const toward = Math.abs(wrapAngle(th - this.heading)) < Math.PI / 2 ? th : th + Math.PI;
        this.heading += wrapAngle(toward - this.heading) * 0.15;
        this.moveHeading += wrapAngle(this.heading - this.moveHeading) * 0.5;
        if (this.wallCd <= 0) {
          this.speed *= this.stage > 0 ? 0.85 : 0.72;
          this.wallCd = 0.35;
          if (this.isPlayer) { audio.sfx('bump'); race.shake = Math.max(race.shake, 0.2); }
        }
        // scrape sparks against the barrier
        if (Math.abs(this.speed) > 20 && near(this)) {
          const wallPt = this.pos.clone().addScaledVector(s.n, Math.sign(lat) * 1.2).add(new V3(0, 0.8, 0));
          race.particles.emit(2, { pos: wallPt, vel: this.forward.multiplyScalar(-this.speed * 0.3).add(new V3(0, 6, 0)), spread: 6,
            color: 0xffd080, life: 0.35, size: [0.6, 0.1], grav: -30 });
        }
      }
      // --- ground: ramps launch, gaps and holes drop you ---
      const g = track.groundAt(this.pos, this.idx);
      if (this.air) {
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;
        this.airTime += dt;
        if (!g.hole && this.pos.y <= g.y) this.landed(g.y);
        else if (g.hole === 'gap' && this.pos.y < g.y - 1.2) this.startFall();
        else if (g.hole === 'pit' && this.pos.y < g.y + 0.2) this.startFall();
      } else if (g.hole === 'pit') {
        this.startFall();                                  // pits swallow you whatever your speed
      } else if (g.hole) {
        this.air = true; this.vy = 0; this.airTime = 0;   // rolled off the edge of a gap
      } else {
        if (g.ramp) this.pos.y = g.y;
        else this.pos.y += (g.y - this.pos.y) * Math.min(1, 14 * dt);
        if (this.onRamp && !g.ramp && this.speed > 12) this.launch();
        this.onRamp = g.ramp;
      }

      // --- lap counting ---
      if (prevIdx > N * 0.8 && this.idx < N * 0.2) this.onCrossLine();
      else if (prevIdx < N * 0.2 && this.idx > N * 0.8) this.lap--;
      this.progress = (this.lap - 1) * N + this.idx;

      // wrong-way (player)
      if (this.isPlayer) {
        const dot = Math.sin(this.heading) * s.flat.x + Math.cos(this.heading) * s.flat.z;
        this.wrongTime = dot < -0.3 && canControl ? this.wrongTime + dt : 0;
      }

      this.updateModel(dt, s, inp);
    }

    aiFactor() {
      if (this.isPlayer) return 0.95;
      const p = race.player;
      let f = this.skill;
      const lapsBehind = (p.progressTotal() - this.progressTotal()) / race.track.N;
      const rb = DIFFICULTY[state.diff].rubber;
      if (!p.finished) f += lapsBehind > 0 ? Math.min(rb, lapsBehind * 0.5) : Math.max(-rb, lapsBehind * 0.4);
      return f;
    }

    launch() {
      this.air = true; this.onRamp = null; this.airTime = 0; this.drifting = false;
      this.vy = 6 + this.speed * 0.2;
      if (this.isPlayer) audio.sfx('jump');
    }

    // hang time pays out a landing boost, like CTR
    landed(groundY) {
      this.air = false; this.pos.y = groundY; this.vy = 0; this.land = 0.25;
      const big = this.airTime > 0.6 && this.spin <= 0;
      if (big) this.turbo = Math.max(this.turbo, 0.5 + Math.min(this.airTime, 1.6) * 0.5);
      if (near(this)) race.particles.emit(18, { pos: this.pos.clone().add(new V3(0, 0.4, 0)), spread: 7, vel: new V3(0, 3, 0),
        color: 0xffffff, life: 0.5, size: [1.2, 0.3], drag: 3 });
      if (this.isPlayer) {
        audio.sfx('land');
        race.shake = Math.max(race.shake, 0.25);
        if (big && this.airTime > 1.0) bigMsg('AIR BOOST!', true);
      }
    }

    startFall() {
      this.falling = true; this.fallT = 0; this.stage = 0; this.turbo = 0; this.drifting = false;
      if (this.isPlayer) { audio.sfx('fall'); bigMsg('ตกหลุม!', true); }
    }

    updateFall(dt, track) {
      this.fallT += dt;
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      this.speed *= Math.pow(0.3, dt);
      this.pos.x += Math.sin(this.moveHeading) * this.speed * dt;
      this.pos.z += Math.cos(this.moveHeading) * this.speed * dt;
      this.model.body.rotation.x += dt * 7;   // tumble
      if (this.fallT > 1.3) this.respawn(track);
      this.updateModel(dt, track.samples[this.idx], this.input);
    }

    // put the racer back on the road a little before where it fell
    respawn(track) {
      const N = track.N, j = track.safeIdx(this.idx);
      if (this.idx < N * 0.2 && j > N * 0.8) this.lap--;   // stepped back over the start line
      const s = track.samples[j];
      this.idx = j;
      this.pos.copy(s.p);
      this.heading = this.moveHeading = Math.atan2(s.flat.x, s.flat.z);
      this.speed = 0; this.vy = 0;
      this.air = this.falling = false; this.onRamp = null;
      this.spin = 0; this.respawnT = 1.5; this.lane = 0;
      this.model.body.rotation.x = 0;
      this.progress = (this.lap - 1) * N + this.idx;
      if (near(this)) spawnBurst(this.pos.clone().add(new V3(0, 1.5, 0)), 0x88eeff, 3);
      if (this.isPlayer) race.camYaw = this.heading;
    }

    onCrossLine() {
      this.lap++;
      if (this.lap > LAPS && !this.finished) {
        this.finished = true;
        this.finishTime = race.time;
        if (this.isPlayer) onPlayerFinish();
      } else if (this.isPlayer && this.lap >= 2) {
        audio.sfx('lap');
        bigMsg(this.lap === LAPS ? 'FINAL LAP!' : `LAP ${this.lap}`, true);
      }
    }

    updateModel(dt, s, inp) {
      const m = this.model;
      this.bob += dt * 3;
      this.hop = Math.max(0, this.hop - dt * 1.4);
      const hopY = Math.sin((0.35 - this.hop) / 0.35 * Math.PI) * (this.hop > 0 ? 0.9 : 0);
      m.root.position.set(this.pos.x, this.pos.y + 0.35 + Math.sin(this.bob) * 0.12 + hopY, this.pos.z);
      // nose follows the road, or the flight arc while airborne
      const pitch = this.air ? -clamp(this.vy * 0.025, -0.4, 0.4) : -Math.asin(clamp(s.t.y, -0.9, 0.9));
      m.root.rotation.set(pitch - Math.min(this.speed, 140) * 0.0006 - this.stage * 0.02, this.heading, 0);
      // squash on landing
      this.land = Math.max(0, this.land - dt);
      const sq = Math.sin(this.land / 0.25 * Math.PI) * 0.18;
      m.body.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
      // blink while invulnerable after a respawn
      m.root.visible = !(this.respawnT > 0 && Math.floor(this.respawnT * 12) % 2 === 0);
      this.steerVis += ((this.spin > 0 ? 0 : inp.steer) - this.steerVis) * Math.min(1, 8 * dt);
      m.body.rotation.z = -this.steerVis * 0.2 - (this.drifting ? this.driftDir * 0.12 : 0);
      if (this.spin > 0) m.body.rotation.y = (1.4 - this.spin) * 11;
      else m.body.rotation.y += ((this.drifting ? this.driftDir * 0.5 : 0) - wrapAngle(m.body.rotation.y)) * Math.min(1, 10 * dt);
      // turning pose; while spun out by a hit the rider flails left and right
      const flail = this.spin > 0 || this.falling;
      PB.animateRider(m, { dt, steer: flail ? Math.sin(race.time * 18) : this.steerVis,
        drift: this.drifting ? this.driftDir : 0, stage: this.stage, speed: this.speed, time: race.time,
        air: this.air || this.falling ? 1 : 0 });
      m.shield.visible = this.shield > 0;
      if (m.shield.visible) m.shield.material.opacity = 0.2 + Math.sin(race.time * 10) * 0.06;
      // shock flicker
      m.rider.visible = !(this.shock > 0 && Math.floor(race.time * 20) % 2 === 0);

      // flames: size and color by state
      const power = Math.max(this.input.throttle * 0.6, 0.25) + this.stage * 0.45 + (this.turbo > 0 ? 0.6 : 0);
      let col = this.def.flame;
      if (this.stage > 0) col = BOOST_COLORS[this.stage];
      else if (this.turbo > 0) col = 0xff8a20;
      else if (this.drifting) col = this.driftTime > 2 ? 0xff5020 : this.driftTime > 0.9 ? 0xffe040 : 0x80c0ff;
      for (const f of m.flames) {
        const len = power * (0.9 + Math.random() * 0.25);
        f.outer.scale.set(1 + this.stage * 0.25, len, 1 + this.stage * 0.25);
        f.outer.position.z = -2.15 - 0.7 * len;
        f.core.scale.set(1, len * 0.9, 1);
        f.core.position.z = -2.15 - 0.45 * len * 0.9;
        if (this.stage === 3 || (this.def.rainbow && col === this.def.flame)) f.outer.material.color.setHSL((race.time * 2) % 1, 1, 0.6);
        else f.outer.material.color.setHex(col);
      }
      m.hover.material.opacity = 0.45 + this.stage * 0.15;

      // trail
      const active = this.stage > 0 || this.turbo > 0;
      const back = m.root.localToWorld(new V3(0, 0.5, -2.4));
      const right = new V3(Math.cos(this.heading), 0, -Math.sin(this.heading));
      const stage = this.stage, turbo = this.turbo;
      this.trail.update(active, back, right, stage === 3 ? 1.0 : 0.7, (c, a, t) => {
        if (stage === 3) c.setHSL((a * 4 + t * 1.5) % 1, 1, 0.55);
        else if (stage > 0) c.setHex(BOOST_COLORS[stage]);
        else if (turbo > 0) c.setHex(0xff8a20);
      }, race.time);

      if (m.root.position.distanceTo(camera.position) < 150) this.emitParticles(dt, col);
    }

    emitParticles(dt, flameCol) {
      const P = race.particles, m = this.model;
      const f = this.forward, back = f.clone().multiplyScalar(-1);
      // jet exhaust: sparks out of each engine, denser and longer while boosting
      const rate = 14 + Math.abs(this.speed) * 0.25 + this.stage * 40 + (this.turbo > 0 ? 30 : 0);
      this.fxAcc = (this.fxAcc || 0) + rate * dt;
      const n = Math.floor(this.fxAcc); this.fxAcc -= n;
      if (n > 0) {
        const stage = this.stage;
        const color = stage === 3 ? c => c.setHSL(Math.random(), 1, 0.6) : flameCol;
        for (const x of [-0.4, 0.4]) {
          const p = m.root.localToWorld(new V3(x, 0.5, -2.7));
          P.emit(Math.ceil(n / 2), { pos: p, vel: back.clone().multiplyScalar(8 + stage * 6).addScaledVector(f, this.speed * 0.85), spread: 2.5 + stage,
            color, life: 0.28 + stage * 0.08, size: [0.9 + stage * 0.35, 0.15], drag: 2, jitter: 0.3 });
        }
      }
      // drift sparks off the board rails, color shows the mini-turbo charge level
      if (this.drifting && this.speed > 25) {
        this.sparkAcc = (this.sparkAcc || 0) + 50 * dt;
        const k = Math.floor(this.sparkAcc); this.sparkAcc -= k;
        const col = this.driftTime > 2 ? 0xff6030 : this.driftTime > 0.9 ? 0xffe040 : 0x80d0ff;
        const side = new V3(Math.cos(this.heading), 0, -Math.sin(this.heading)).multiplyScalar(-this.driftDir);
        for (let i = 0; i < k; i++) {
          const p = m.root.localToWorld(new V3(-this.driftDir * 0.7, 0.3, -1.4));
          P.emit(1, { pos: p, vel: side.clone().multiplyScalar(6).addScaledVector(f, this.speed * 0.6).add(new V3(0, 7, 0)), spread: 4,
            color: col, life: 0.4, size: [0.55, 0.1], grav: -35 });
        }
      }
    }
  }

  function near(r) { return race.player && r.pos.distanceTo(race.player.pos) < 80; }

  // ---------------- projectiles, mines, effects ----------------
  const boxGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
  let boxMat = null;
  function itemBoxMaterial() {
    if (boxMat) return boxMat;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 128, 128);
    g.addColorStop(0, '#ff3ad0'); g.addColorStop(0.5, '#ffd23a'); g.addColorStop(1, '#22f0ff');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(8, 8, 112, 112);
    x.font = 'bold 92px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fff'; x.strokeStyle = '#5a1a8a'; x.lineWidth = 6;
    x.strokeText('?', 64, 70); x.fillText('?', 64, 70);
    boxMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.85 });
    return boxMat;
  }

  // Runs an item for racer r. ev carries everything needed so remote browsers replay the exact same shot.
  function applyItem(r, ev) {
    const f = new V3(Math.sin(ev.h), 0, Math.cos(ev.h));
    const pos = new V3(ev.x, ev.y, ev.z);
    const loud = r.isPlayer || near(r);
    if (ev.it === 'missile') {
      const target = race.racers.find(q => q.netId === ev.tg) || null;
      spawnProjectile('missile', r, pos.addScaledVector(f, 3).add(new V3(0, 1.3, 0)), Math.max(ev.s + 55, 115), target, ev.pid, ev.h);
      if (loud) audio.sfx('fire');
    } else if (ev.it === 'bomb') {
      spawnProjectile('bomb', r, pos.addScaledVector(f, 3).add(new V3(0, 1.5, 0)), Math.max(ev.s + 40, 90), null, ev.pid, ev.h);
      if (loud) audio.sfx('fire');
    } else if (ev.it === 'mine') {
      spawnMine(r, pos.addScaledVector(f, -3.5), ev.pid);
    } else if (ev.it === 'shield') {
      r.shield = 10; if (r.isPlayer) audio.sfx('shield');
    } else if (ev.it === 'turbo') {
      r.turbo = 1.8; if (r.isPlayer) audio.sfx('turbo');
    } else if (ev.it === 'emp') {
      race.racers.forEach(q => { if (q !== r && q.progressTotal() > r.progressTotal()) q.takeHit('shock'); });
      audio.sfx('boom');
      if (!r.isPlayer) bigMsg(`⚡ ${r.name} ใช้ EMP!`, true);
    }
  }

  function netEvent(ev) { if (race.online) PB.net.send(Object.assign({ t: 'event' }, ev)); }

  // Name label floating above remote players
  function makeNameTag(name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.font = '600 34px Kanit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(250, x.measureText(name).width + 30);
    x.fillStyle = 'rgba(10,8,40,0.7)'; x.beginPath(); x.roundRect ? x.roundRect(128 - w / 2, 8, w, 48, 22) : x.rect(128 - w / 2, 8, w, 48); x.fill();
    x.fillStyle = '#ffd23a'; x.fillText(name, 128, 33);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthWrite: false }));
    s.scale.set(4, 1, 1); s.position.y = 4.4;
    return s;
  }

  function spawnProjectile(type, owner, pos, speed, target, pid, heading) {
    const g = new THREE.Group();
    if (type === 'missile') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 10), PB.toon(0xeeeeee));
      body.rotation.x = Math.PI / 2; g.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), PB.toon(0xff2a3a));
      nose.rotation.x = Math.PI / 2; nose.position.z = 1.2; g.add(nose);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), PB.glow(0xffa020));
      fl.rotation.x = -Math.PI / 2; fl.position.z = -1.6; g.add(fl);
    } else {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), PB.toon(0x222233)); g.add(b);
      const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), PB.glow(0xffd23a)); fuse.position.y = 0.9; g.add(fuse);
    }
    g.position.copy(pos);
    race.scene.add(g);
    const idx = race.track.nearest(pos, owner.idx);
    race.projectiles.push({ id: pid, type, owner, pos: pos.clone(), heading, speed, target, mesh: g, life: type === 'missile' ? 7 : 2.6,
      age: 0, idx, lat: race.track.lateral(pos, idx), trail: new Trail(race.scene, 24) });
  }

  function spawnMine(owner, pos, pid) {
    const g = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), PB.toon(0xd03a20));
    crate.castShadow = true; g.add(crate);
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = '#ffd23a'; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#d03a20'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('TNT', 32, 26);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
    label.position.z = 0.91; g.add(label);
    const l2 = label.clone(); l2.rotation.y = Math.PI; l2.position.z = -0.91; g.add(l2);
    const idx = race.track.nearest(pos, owner.idx);
    pos.y = race.track.heightAt(pos, idx) + 0.9;
    g.position.copy(pos);
    race.scene.add(g);
    race.mines.push({ id: pid, owner, pos, mesh: g, immune: 1.0, idx, lat: race.track.lateral(pos, idx), life: 40 });
  }

  // projectile blows up: visuals everywhere, bomb splash hits whichever racers this browser simulates
  function detonate(p) {
    if (p.dead) return;
    p.dead = true;
    explode(p.pos.clone(), p.type === 'bomb' ? 9 : 4);
    if (p.type === 'bomb') race.racers.forEach(r => { if (r.pos.distanceTo(p.pos) < 9) r.takeHit('spin'); });
  }

  function explode(pos, radius, color) {
    spawnBurst(pos, color || 0xffa020, radius);
    // fireball + flying embers
    race.particles.emit(45, { pos, spread: radius * 2.2, vel: new V3(0, radius * 1.2, 0), color: c => c.setHSL(0.02 + Math.random() * 0.1, 1, 0.5 + Math.random() * 0.2),
      life: 0.7, size: [radius * 0.9, radius * 0.2], drag: 3, jitter: radius * 0.4 });
    race.particles.emit(25, { pos, spread: radius * 4, vel: new V3(0, radius * 2, 0), color: 0xffe080, life: 1.0, size: [0.5, 0.1], grav: -25, drag: 0.5 });
    if (race.player.pos.distanceTo(pos) < 120) { audio.sfx('boom'); race.shake = Math.max(race.shake, 0.4 * (1 - race.player.pos.distanceTo(pos) / 120)); }
  }

  function spawnBurst(pos, color, size) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), PB.glow(color, 0.9));
    m.position.copy(pos);
    race.scene.add(m);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 32), PB.glow(0xffffff, 0.9));
    ring.position.copy(pos); ring.rotation.x = Math.PI / 2;
    race.scene.add(ring);
    race.effects.push({ m, ring, t: 0, dur: 0.55, size });
  }

  function updateWorldObjects(dt) {
    const track = race.track, N = track.N;
    // item boxes
    for (const b of race.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) { b.active = true; b.mesh.visible = true; b.mesh.scale.setScalar(0.1); }
        continue;
      }
      b.mesh.rotation.y += dt * 1.5; b.mesh.rotation.x += dt * 0.7;
      b.mesh.position.y = b.baseY + Math.sin(race.time * 3 + b.phase) * 0.35;
      b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + dt * 3));
      for (const r of race.racers) {
        if (Math.abs(r.pos.x - b.mesh.position.x) < 2.8 && Math.abs(r.pos.z - b.mesh.position.z) < 2.8) {
          b.active = false; b.mesh.visible = false; b.timer = 2.5;
          r.giveItemBox();
          if (near(r)) {
            spawnBurst(b.mesh.position.clone(), 0xffd23a, 1.6);
            race.particles.emit(28, { pos: b.mesh.position, spread: 10, vel: new V3(0, 4, 0), color: c => c.setHSL(Math.random(), 1, 0.65),
              life: 0.7, size: [0.8, 0.1], drag: 2.5 });
          }
          break;
        }
      }
    }
    // boost pads
    for (const p of track.pads) {
      for (const r of race.racers) {
        if (!r.auth) continue;
        const d = (r.idx - p.idx + N) % N;
        if (d < 3 && Math.abs(track.lateral(r.pos, r.idx) - p.lat) < 2.8 && r.spin <= 0) {
          if (r.turbo < 0.5 && r.isPlayer) audio.sfx('turbo');
          r.turbo = Math.max(r.turbo, 1.0);
        }
      }
    }
    // projectiles
    for (const p of race.projectiles) {
      p.age += dt; p.life -= dt;
      p.idx = track.nearest(p.pos, p.idx);
      const s = track.samples[(p.idx + 8) % N];
      let aim;
      if (p.type === 'missile' && p.target && !p.target.finished && p.target.pos.distanceTo(p.pos) < 45) aim = p.target.pos;
      else {
        const lat = p.type === 'missile' && p.target ? clamp(track.lateral(p.target.pos, p.target.idx), -track.W, track.W) : p.lat;
        aim = s.p.clone().addScaledVector(s.n, lat);
      }
      const desired = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
      p.heading += clamp(wrapAngle(desired - p.heading), -3.5 * dt, 3.5 * dt);
      p.pos.x += Math.sin(p.heading) * p.speed * dt;
      p.pos.z += Math.cos(p.heading) * p.speed * dt;
      const gy = track.heightAt(p.pos, p.idx) + (p.type === 'missile' ? 1.4 : 1.0 + Math.abs(Math.sin(p.age * 7)) * 1.2);
      p.pos.y += (gy - p.pos.y) * Math.min(1, 15 * dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.heading;
      if (p.type === 'bomb') { p.mesh.rotation.x += dt * 8; p.speed = Math.max(40, p.speed - 25 * dt); }
      const back = p.pos.clone().add(new V3(-Math.sin(p.heading) * 1.6, 0, -Math.cos(p.heading) * 1.6));
      p.trail.update(true, back, new V3(Math.cos(p.heading), 0, -Math.sin(p.heading)), 0.35, c => c.setHex(0xff9a40), race.time);
      // collisions: only against racers this browser simulates; it then tells everyone where the shot blew up
      if (p.life <= 0 || Math.abs(track.lateral(p.pos, p.idx)) > track.W + 1) { detonate(p); continue; }
      for (const r of race.racers) {
        if (!r.auth || (r === p.owner && p.age < 0.6)) continue;
        if (r.pos.distanceTo(p.pos) < (p.type === 'missile' ? 3 : 4.2)) {
          if (p.type === 'missile') r.takeHit('spin');
          detonate(p);
          netEvent({ e: 'boom', pid: p.id, x: p.pos.x, y: p.pos.y, z: p.pos.z });
          break;
        }
      }
    }
    race.projectiles = race.projectiles.filter(p => {
      if (p.dead) { race.scene.remove(p.mesh); race.scene.remove(p.trail.mesh); PB.disposeTree(p.mesh); PB.disposeTree(p.trail.mesh); }
      return !p.dead;
    });
    // mines
    for (const m of race.mines) {
      m.immune -= dt; m.life -= dt;
      m.mesh.rotation.y += dt;
      for (const r of race.racers) {
        if (!r.auth || (r === m.owner && m.immune > 0)) continue;
        if (r.pos.distanceTo(m.pos) < 2.8) {
          r.takeHit('spin'); m.dead = true; explode(m.pos.clone(), 5, 0xff5020);
          netEvent({ e: 'mine', pid: m.id });
          break;
        }
      }
      if (m.life <= 0) m.dead = true;
    }
    race.mines = race.mines.filter(m => { if (m.dead) { race.scene.remove(m.mesh); PB.disposeTree(m.mesh); } return !m.dead; });
    // effects
    for (const e of race.effects) {
      e.t += dt;
      const k = e.t / e.dur;
      e.m.scale.setScalar(e.size * (0.3 + k));
      e.m.material.opacity = 0.9 * (1 - k);
      e.ring.scale.setScalar(e.size * (0.5 + k * 1.6));
      e.ring.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { e.dead = true; race.scene.remove(e.m); race.scene.remove(e.ring); PB.disposeTree(e.m); PB.disposeTree(e.ring); }
    }
    race.effects = race.effects.filter(e => !e.dead);

    // racer vs racer bumps
    const rs = race.racers;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 2.6 * 2.6 && d2 > 0.0001 && Math.abs(a.pos.y - b.pos.y) < 2) {
        const d = Math.sqrt(d2), push = (2.6 - d) / 2;
        const nx = dx / d, nz = dz / d;
        // only move racers simulated here; remote ones get corrected by their owner's next update
        const wa = !a.auth ? 0 : b.stage > a.stage ? 1.6 : 1, wb = !b.auth ? 0 : a.stage > b.stage ? 1.6 : 1;
        a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
        b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
        if ((a.isPlayer || b.isPlayer) && race.time - (race.lastBump || 0) > 0.3) { audio.sfx('bump'); race.lastBump = race.time; }
      }
    }
  }

  // ---------------- race lifecycle ----------------
  // grid: optional online starting grid from the server [{id, name, char, bot}], front row first
  function startRace(grid) {
    audio.init();
    endRace();
    show(null);
    if (document.activeElement) document.activeElement.blur(); // Space must not re-click the menu button
    $('hud').classList.remove('hidden');
    state.screen = 'race';
    const scene = new THREE.Scene();
    const tdef = PB.TRACKS[state.trackIdx];
    const track = PB.buildTrack(tdef, scene);
    race = { scene, track, racers: [], boxes: [], projectiles: [], mines: [], effects: [], time: 0, phase: 'countdown', cd: 4.2,
      shake: 0, flash: 0, paused: false, standingsT: 0, finishT: 0, camPos: null, camLook: null,
      online: !!grid && PB.net.connected(), pidSeq: 0, netT: 0 };
    race.particles = new PB.fx.Particles(scene, Q.particles);
    scene.add(camera);                       // speed lines ride on the camera
    race.lines = new PB.fx.SpeedLines(camera, Q.speedLines);
    const th = track.theme;
    post.bloom.strength = th.bloom[0]; post.bloom.radius = th.bloom[1]; post.bloom.threshold = th.bloom[2];
    post.u.uSat.value = th.grade.sat; post.u.uContrast.value = th.grade.contrast;

    // grid: 4 rows x 2. Solo: 7 random bots and the player starts at the back
    if (!grid) {
      const others = PB.CHARACTERS.filter((c, i) => i !== state.charIdx).sort(() => Math.random() - 0.5).slice(0, 7);
      grid = others.map((c, i) => ({ id: 'bot' + i, char: c.id, skin: PB.shop.botSkin(), bot: true }));
      grid.push({ id: 'me', char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin, bot: false, local: true });
    }
    const myId = race.online ? PB.net.id : 'me';
    grid.forEach((g, i) => {
      const def = PB.shop.dress(PB.CHARACTERS.find(c => c.id === g.char) || PB.CHARACTERS[0], g.skin);
      const row = Math.floor(i / 2), col = i % 2;
      const idx = track.N - 4 - row * 5;
      const lat = (col ? -1 : 1) * track.W * 0.4 + (row % 2 ? 1.5 : -1.5);
      const mine = g.id === myId;
      const r = new Racer(def, mine, track, idx, lat, scene, state.diff,
        { ctrl: mine ? 'local' : g.bot ? 'bot' : 'remote', netId: g.id, name: g.name || def.name });
      r.lap = 0;
      race.racers.push(r);
    });
    race.player = race.racers.find(r => r.isPlayer);
    race.player.gauge = 50;

    // item boxes
    const mat = itemBoxMaterial();
    for (const spot of track.boxSpots) {
      const s = track.samples[spot.idx];
      const m = new THREE.Mesh(boxGeo, mat);
      m.position.copy(s.p).addScaledVector(s.n, spot.lat);
      const baseY = s.p.y + 1.8; m.position.y = baseY;
      scene.add(m);
      race.boxes.push({ mesh: m, baseY, active: true, timer: 0, phase: Math.random() * 6 });
    }

    // minimap base image
    const mm = $('minimap');
    race.mapBase = document.createElement('canvas'); race.mapBase.width = mm.width; race.mapBase.height = mm.height;
    race.mapFn = drawPath(race.mapBase.getContext('2d'), track.samples.map(s => s.p), mm.width, mm.height, 16,
      'rgba(255,255,255,0.85)', 5);

    buildStandingsList();
    audio.startEngine();
    snapCamera();
    bigMsg('', false);
  }

  function endRace() {
    if (!race) return;
    audio.stopEngine();
    race.lines.dispose();
    race.scene.remove(camera);
    race.scene.traverse(o => { if (o.geometry && o.geometry !== boxGeo) o.geometry.dispose(); });
    post.u.uSpeed.value = 0; post.u.uFast.value = 0; post.u.uChroma.value = 0; post.u.uTintAmt.value = 0;
    PB.disposeTree(race.track.group);
    race = null;
  }

  // online races can't freeze: the menu just overlays while the race keeps running
  function togglePause(force) {
    if (!race || race.phase === 'done') return;
    race.paused = force == null ? !race.paused : force;
    $('scr-pause').classList.toggle('show', race.paused);
    $('btn-restart').classList.toggle('hidden', race.online);
    if (audio.ctx && !race.online) race.paused ? audio.ctx.suspend() : audio.ctx.resume();
  }

  function onPlayerFinish() {
    audio.sfx('finish');
    const p = race.player;
    p.place = race.racers.filter(r => r.finished).length;
    bigMsg(p.place === 1 ? 'WINNER! 🏆' : 'FINISH!', true);
    race.phase = 'finished';
    race.finishT = 3.5;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function showResults() {
    race.phase = 'done';
    const p = race.player;
    $('res-title').textContent = p.place === 1 ? '🏆 ชนะเลิศ! 🏆' : `จบอันดับที่ ${p.place}`;
    renderResults();
    const online = race.online;
    const coins = PB.shop.reward(p.place, state.diff, online);
    $('res-coins').innerHTML = `ได้รับ <b>🪙 +${coins}</b> <span>รวม ${PB.shop.coins.toLocaleString()}</span>`;
    $('btn-again').textContent = online ? (PB.net.isHost() ? 'กลับล็อบบี้ (ทุกคน)' : 'กลับล็อบบี้') : 'แข่งอีกครั้ง';
    $('btn-tracks').classList.toggle('hidden', online);
    $('scr-results').classList.add('show');
    audio.stopEngine();
  }
  // online the table keeps filling in as other players cross the line
  function renderResults() {
    $('res-body').innerHTML = sortedRacers().map((r, i) => `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td>` +
      `<td>${esc(r.name)}${r.isPlayer ? ' (คุณ)' : r.ctrl === 'remote' ? ' 🌐' : ''}</td>` +
      `<td>${r.finished ? fmtTime(r.finishTime) : '--:--.--'}</td></tr>`).join('');
  }

  function sortedRacers() {
    return race.racers.slice().sort((a, b) => b.progressTotal() - a.progressTotal());
  }

  // ---------------- HUD ----------------
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
  }
  const suffix = n => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
  let msgTimer = null;
  function bigMsg(text, pop) {
    const el = $('big-msg');
    el.textContent = text;
    el.classList.toggle('small', text.length > 10);
    el.classList.remove('pop');
    void el.offsetWidth;
    if (pop && text) el.classList.add('pop');
    clearTimeout(msgTimer);
  }
  function buildStandingsList() {
    $('hud-standings').innerHTML = race.racers.map(() => '<li><b></b><i></i><span></span></li>').join('');
  }
  let rollIconT = 0;
  // emoji for most items; the TNT crate uses its own drawn picture
  function showItemIcon(slot, key) {
    if (slot.dataset.item === (key || '')) return;
    slot.dataset.item = key || '';
    const it = key ? ITEMS[key] : null;
    slot.innerHTML = it ? (it.img ? `<img src="${it.img}" alt="">` : it.icon) : '';
  }
  function updateHUD(dt) {
    const p = race.player;
    setText('hud-pos', String(p.place));
    setText('hud-pos-suf', suffix(p.place));
    setText('hud-lap', String(clamp(p.lap, 1, LAPS)));
    setText('hud-time', fmtTime(race.time));
    setText('hud-speed', String(Math.round(Math.abs(p.speed) * 3.6)));

    // item slot
    const slot = $('hud-item');
    if (p.rolling > 0) {
      rollIconT -= dt;
      if (rollIconT <= 0) { rollIconT = 0.07; const ks = Object.keys(ITEMS); showItemIcon(slot, ks[(Math.random() * ks.length) | 0]); audio.sfx('item'); }
      slot.classList.add('rolling'); setText('hud-item-name', '???');
    } else {
      slot.classList.remove('rolling');
      const it = p.item ? ITEMS[p.item] : null;
      showItemIcon(slot, p.item);
      setText('hud-item-name', it ? it.name + (vin.autoGas ? '' : ' [E]') : '');
    }
    // the slot only appears while an item is rolling or in hand; the touch button dims when there's nothing to use
    const holding = p.rolling > 0 || !!p.item;
    if (holding !== hudCache.holding) {
      hudCache.holding = holding;
      document.querySelector('.hud-item').classList.toggle('empty', !holding);
      document.querySelector('.t-item').classList.toggle('empty', !holding);
    }

    // booster
    const panel = $('boost-panel');
    $('hud-gauge').style.width = (p.stage > 0 ? (p.stageTimer / p.stageDur) * 100 : p.gauge) + '%';
    panel.classList.toggle('ready', p.stage === 0 && p.gauge >= 100);
    // touch BOOST button says which boost a tap gives: full Lv.1->3, short Lv.1 only, or not yet
    const bstate = p.stage > 0 ? 'on' : p.gauge >= 100 ? 'full' : p.gauge >= BOOST_MIN ? 'part' : 'low';
    if (bstate !== hudCache.bstate) {
      hudCache.bstate = bstate;
      const tb = document.querySelector('.t-boost');
      tb.className = 't-btn t-boost ' + bstate;
      tb.innerHTML = { full: 'BOOST<small>Lv.1→3</small>', part: 'BOOST<small>Lv.1</small>', low: 'BOOST<small>ชาร์จ</small>', on: 'BOOST' }[bstate];
    }
    for (let i = 1; i <= 3; i++) panel.classList.toggle('lv' + i, p.stage === i);
    panel.querySelectorAll('.boost-lv i').forEach(e => e.classList.toggle('on', +e.dataset.lv <= p.stage));
    if (p.stage > 0) {
      setText('hud-boost-state', p.boostMax === 1 ? 'BOOST Lv.1' : p.stage < 3 ? `BOOST Lv.${p.stage} → Lv.${p.stage + 1}` : 'MAX BOOST!!');
      setText('hud-boost-count', String(Math.ceil(p.stageTimer)));
    } else {
      setText('hud-boost-state', p.gauge >= 100 ? (vin.autoGas ? 'พร้อมแล้ว! กด BOOST' : 'พร้อมแล้ว! กด SHIFT')
        : p.gauge >= BOOST_MIN ? `ชาร์จ ${Math.floor(p.gauge)}% • กดได้ (Lv.1)` : `ชาร์จพลัง ${Math.floor(p.gauge)}%`);
      setText('hud-boost-count', '');
    }

    $('wrong-way').classList.toggle('hidden', p.wrongTime < 1.2);

    // standings (throttled)
    race.standingsT -= dt;
    if (race.standingsT <= 0) {
      race.standingsT = 0.25;
      const lis = $('hud-standings').children;
      sortedRacers().forEach((r, i) => {
        const li = lis[i];
        li.className = r.isPlayer ? 'me' : '';
        li.children[0].textContent = i + 1;
        li.children[1].style.background = '#' + r.def.hair.toString(16).padStart(6, '0');
        li.children[2].textContent = r.name + (r.finished ? ' 🏁' : '');
      });
    }

    // minimap
    const mm = $('minimap'), ctx = mm.getContext('2d');
    ctx.clearRect(0, 0, mm.width, mm.height);
    ctx.drawImage(race.mapBase, 0, 0);
    for (const r of race.racers) {
      if (r.isPlayer) continue;
      const [x, y] = race.mapFn(r.pos);
      ctx.fillStyle = '#' + r.def.hair.toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    const [px, py] = race.mapFn(p.pos);
    ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // ---------------- camera ----------------
  // Rigidly attached to the player; only the yaw, distance and height are smoothed so the camera never lags at speed
  function camTargets() {
    const p = race.player;
    const f = new V3(Math.sin(race.camYaw), 0, Math.cos(race.camYaw));
    const pos = p.pos.clone().addScaledVector(f, -race.camDist).add(new V3(0, 5.2 + p.stage * 0.3, 0));
    const look = p.pos.clone().addScaledVector(f, 8).add(new V3(0, 2.0, 0));
    return { pos, look };
  }
  function snapCamera() {
    race.camYaw = race.player.heading; race.camDist = 10.5;
    const t = camTargets();
    race.camPos = t.pos; race.camLook = t.look;
    camera.position.copy(t.pos); camera.lookAt(t.look);
  }
  function updateCamera(dt) {
    const p = race.player;
    if (race.phase === 'finished' || race.phase === 'done') {
      // orbit the player after finishing
      race.orbit = (race.orbit || p.heading + Math.PI) + dt * 0.4;
      const pos = p.pos.clone().add(new V3(Math.sin(race.orbit) * 11, 4.5, Math.cos(race.orbit) * 11));
      race.camPos.lerp(pos, Math.min(1, 3 * dt));
      race.camLook.lerp(p.pos.clone().add(new V3(0, 1.8, 0)), Math.min(1, 6 * dt));
    } else {
      race.camYaw += wrapAngle(p.heading - race.camYaw) * (1 - Math.exp(-6 * dt));
      race.camDist += (10.5 + p.stage * 1.2 - race.camDist) * (1 - Math.exp(-3 * dt));
      const t = camTargets();
      const y = race.camPos.y + (t.pos.y - race.camPos.y) * (1 - Math.exp(-8 * dt));
      race.camPos.copy(t.pos); race.camPos.y = y;
      race.camLook.copy(t.look);
      // keep the camera above the road surface
      const gy = race.track.samples[race.track.nearest(race.camPos, p.idx)].p.y + 1.5;
      if (race.camPos.y < gy) race.camPos.y = gy;
    }
    camera.position.copy(race.camPos);
    if (race.shake > 0) {
      race.shake = Math.max(0, race.shake - dt);
      camera.position.x += rand(-1, 1) * race.shake; camera.position.y += rand(-1, 1) * race.shake * 0.6;
    }
    camera.lookAt(race.camLook);
    const fov = 70 + Math.min(Math.abs(p.speed), 160) * 0.06 + p.stage * 4 + (p.turbo > 0 ? 3 : 0);
    camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt);
    camera.updateProjectionMatrix();
    // shadow camera follows the player
    const sun = race.track.sun;
    sun.position.copy(p.pos).add(race.track.sunOffset);
    sun.target.position.copy(p.pos);
    race.track.sky.position.copy(camera.position);
  }

  // screen-space speed feel: zoom blur, chromatic split at max boost, booster-colored edge tint
  const tintCol = new THREE.Color();
  function updatePostFX(dt) {
    const p = race.player, u = post.u;
    const target = clamp((Math.abs(p.speed) - 55) / 80, 0, 1) * 0.55 + p.stage * 0.15 + (p.turbo > 0 ? 0.2 : 0);
    u.uSpeed.value += (target - u.uSpeed.value) * Math.min(1, 5 * dt);
    u.uChroma.value += ((p.stage === 3 ? 1 : p.stage === 2 ? 0.35 : 0) - u.uChroma.value) * Math.min(1, 5 * dt);
    // Fast Blur only at MAX BOOST: snaps in quickly, fades out a little slower when the boost ends
    const fast = p.stage === 3 ? 0.85 + Math.min(Math.abs(p.speed), 140) / 140 * 0.15 : 0;
    u.uFast.value += (fast - u.uFast.value) * Math.min(1, (fast > u.uFast.value ? 6 : 3) * dt);
    if (p.stage === 3) tintCol.setHSL((race.time * 0.8) % 1, 1, 0.55);
    else if (p.stage > 0) tintCol.setHex(BOOST_COLORS[p.stage]);
    else if (p.turbo > 0) tintCol.setHex(0xff8a20);
    if (p.stage > 0 || p.turbo > 0) u.uTint.value.lerp(tintCol, Math.min(1, 10 * dt));
    const amt = p.stage > 0 ? 0.12 + p.stage * 0.07 : p.turbo > 0 ? 0.12 : 0;
    u.uTintAmt.value += (amt - u.uTintAmt.value) * Math.min(1, 6 * dt);
    const lineCol = p.stage === 3 ? tintCol : p.stage > 0 ? BOOST_COLORS[p.stage] : 0xffffff;
    race.lines.update(dt, Math.max(p.speed, 0), clamp((Math.abs(p.speed) - 70) / 60, 0, 1) * 0.5 + p.stage * 0.15, lineCol);
  }

  // ---------------- main loop ----------------
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
  }
  PB.step = frame; // debug hook: advance the game manually
  function frame(dt) {
    PB.fx.time.value += dt;
    if (!race) {
      // menu showroom
      menu.t += dt;
      if (menu.model) {
        menu.model.root.rotation.y = menu.t * 0.6;
        menu.model.root.position.y = 0.3 + Math.sin(menu.t * 2) * 0.15;
        menu.model.flames.forEach(f => {
          const l = 0.6 + Math.random() * 0.2; f.outer.scale.set(1, l, 1); f.outer.position.z = -2.15 - 0.7 * l;
          if (menu.model.rainbow) f.outer.material.color.setHSL((menu.t * 0.8) % 1, 1, 0.6);
        });
        // showroom: carve gently left and right to show off the turning pose
        const steer = Math.sin(menu.t * 1.1) * 0.9;
        menu.model.body.rotation.z = -steer * 0.2;
        PB.animateRider(menu.model, { dt, steer, drift: 0, stage: 0, speed: 60, time: menu.t });
      }
      const onRight = state.screen === 'char' || state.screen === 'shop';
      camera.fov = 45; camera.updateProjectionMatrix();
      camera.position.set(0, 3.2, 10.5);
      camera.lookAt(onRight && window.innerWidth > 700 ? 3.2 : 0, 1.6, 0);
      post.bloom.strength = 0.7; post.bloom.radius = 0.5; post.bloom.threshold = 0.75;
      post.u.uSat.value = 1.12; post.u.uContrast.value = 1.05;
      renderScene(menu.scene);
      pressed.clear();
      return;
    }

    if (hit('Escape', 'KeyP')) togglePause();
    if (race.paused && !race.online) { pressed.clear(); renderScene(race.scene); return; }
    if (race.paused) pressed.clear();   // online: the race runs on behind the menu, but ignore race keys

    race.time += race.phase === 'countdown' ? 0 : dt;
    // countdown
    if (race.phase === 'countdown') {
      const before = Math.ceil(race.cd - 1);
      race.cd -= dt;
      const now2 = Math.ceil(race.cd - 1);
      if (now2 !== before && now2 >= 1 && now2 <= 3) { bigMsg(String(now2), true); audio.sfx('count'); }
      // start lights: one more red per count, all green on GO
      const reds = now2 <= 3 ? 4 - Math.max(now2, 1) : 0;
      race.track.startLights.forEach((l, k) => l.material.color.setHex(race.cd <= 1 ? 0x30ff50 : k < reds && k < 3 ? 0xff2a2a : 0x2a0808));
      // rocket start: hold throttle in the final half second
      if (race.cd < 1.5 && race.cd > 1.0 && down('KeyW', 'ArrowUp')) race.rocket = true;
      if (race.cd <= 1) {
        race.phase = 'race';
        bigMsg('GO!', true); audio.sfx('go');
        if (race.rocket) { race.player.turbo = 1.3; audio.sfx('turbo'); }
      }
    }
    const canControl = race.phase !== 'countdown';

    for (const r of race.racers) r.update(dt, race.track, canControl);
    sortedRacers().forEach((r, i) => { r.place = i + 1; });
    updateWorldObjects(dt);
    race.particles.update(dt);

    // theme animation
    const ud = race.track.group.userData;
    if (ud.embers) { ud.embers.position.y = (race.time * 4) % 30 - 15; }
    if (ud.tick) ud.tick(dt, race.time, race.player.pos);

    if (race.phase === 'finished') {
      race.finishT -= dt;
      if (race.finishT <= 0) showResults();
    }

    // online: share the racers we simulate ~15x per second
    if (race.online) {
      race.netT -= dt;
      if (race.netT <= 0) {
        race.netT = 1 / 15;
        PB.net.send({ t: 'state', r: race.racers.filter(r => r.auth).map(r => r.serialize()) });
        if (race.phase === 'done') renderResults();
      }
    }

    updateCamera(dt);
    updatePostFX(dt);
    updateHUD(dt);
    audio.setEngine(race.player.speed, race.player.stage);
    pressed.clear();
    renderScene(race.scene);
  }

  PB.getRace = () => race; // debug hooks
  PB.renderer = renderer;

  // ---------------- boot ----------------
  (async () => {
    await PB.loadModels();   // Blender models in models/, if any (js/chibi.js)
    try {
      portraits = PB.renderPortraits();
    } catch (e) { console.warn('portrait render failed', e); }
    buildCharGrid();
    buildTrackGrid();
    setMenuModel(PB.shop.dress(PB.CHARACTERS[0], PB.shop.skin));
    $('loading').classList.add('hidden');
    requestAnimationFrame(loop);
  })();
})();
