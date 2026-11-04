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
  const BOOST_MUL = [1, 1.25, 1.5, 1.8, 1.8];    // top-speed multiplier per booster stage (Lv.4 keeps Lv.3 speed)
  const BOOST_COLORS = [0, 0x22e6ff, 0xff3ad0, 0xffffff, 0xffffff];
  // Lv.4 ultimates (character def.ult). Each gets the same budget: 2.5s, no extra speed, power comes from the effect.
  // Lv.4 follows Lv.3 by itself only when the separate ultimate meter is full; the meter fills faster further back.
  const ULT_TIME = 2.5;
  const ULTS = {
    flame: { name: 'ทางไฟ', desc: 'ทิ้งไฟไว้ข้างหลัง ใครวิ่งทับจะช้าลง (โล่กันได้)', color: 0xff5a10 },
    glide: { name: 'ร่อนลม', desc: 'กระโดดลอยร่อนข้ามช่องว่างและสิ่งกีดขวาง', color: 0x5aff8a },
    veil: { name: 'ล่องหน', desc: 'ล่องหน ไม่โดนโจมตี มิสไซล์ล็อกเป้าไม่ได้', color: 0x9a6aff },
    thruster: { name: 'ไฟไอพ่นยักษ์', desc: 'ไฟไอพ่นลูกใหญ่ ใครโดนชนจะกระเด็นและช้าลง (โล่กันได้)', color: 0x66ffee },
    ice: { name: 'ถนนน้ำแข็ง', desc: 'ทิ้งน้ำแข็งไว้ข้างหลัง ใครวิ่งทับจะลื่นไถล', color: 0x9ae8ff },
    storm: { name: 'ลมพายุ', desc: 'พายุหมุนรอบตัว ผลักคนใกล้ๆ ให้กระเด็นออกด้านข้าง', color: 0xd8f6ff },
    lightning: { name: 'สายฟ้า', desc: 'ฟ้าผ่าคนที่อยู่ใกล้ที่สุด 1 คนให้ช็อต (โล่กันได้)', color: 0xffe14a },
    radiant: { name: 'พลังแสง', desc: 'ล้างสถานะไม่ดี กันการชนและสิ่งกีดขวาง และกันการโจมตีได้ 1 ครั้ง', color: 0xffd23a },
  };
  // status effects from other racers' ultimates don't touch Shadow Veil or Radiant
  const unstoppable = r => r.stage === 4 && (r.def.ult === 'veil' || r.def.ult === 'radiant');
  const veiled = r => r.stage === 4 && r.def.ult === 'veil';
  const CORK_TURNS = 3, CORK_PIVOT = 1.6;   // Wind Glide roll: full turns, and pivot height (mid-rider) above the board
  const GAUGE_REGEN = 7;                         // gauge % per second
  const BOOST_MIN = 20;                          // gauge % needed for a short Lv.1-only boost
  const GRAVITY = 34;
  const MINE_SIZE = 2.7, MINE_HIT = 3.5;   // TNT crate edge and pick-up radius
  const BOUNCE_T = 0.6;
  const SHIELD_CHARGE = 4;   // ultimate charge for a hit the shield blocked (a real hit gives 6-15)   // seconds a hit pops the racer up into the air (visual only)
  const START_EARLY = 0.12, START_LATE = 0.25;   // perfect-start window around GO, in seconds before / after
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
  // counts a player action for the daily missions (js/pass.js)
  function stat(r, k) { if (r.isPlayer && race && race.stats) race.stats[k] = (race.stats[k] || 0) + 1; }

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
  const gasHit = () => hit('KeyW', 'ArrowUp') || (vin.touch && hit('Space'));   // a fresh press of the throttle (touch DRIFT also runs)
  // virtual input for touch controls (js/touch.js): held buttons map onto key codes, steering is analog
  const vin = { steer: null, touch: false };   // touch: on-screen controls are in use
  PB.input = {
    hold(code, on) { if (on && !keys[code]) pressed.add(code); keys[code] = on; },
    tap(code) { pressed.add(code); },
    setSteer(v) { vin.steer = v; },
    setTouchMode(on) { vin.touch = on; },
  };

  // ---------------- menu showroom ----------------
  const menu = { scene: new THREE.Scene(), model: null, t: 0, yaw: 0.45, spin: 0, drag: null };   // yaw: showroom turntable angle, spin: its fling speed
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
  // showroom turntable: drag (mouse or finger) anywhere off the panels to turn the racer 360 degrees, flick to spin it
  (function showroomDrag() {
    const ui = '.panel, button, a, input, select, .t-top, .t-menu, .t-corner, .t-pop, .char-grid';
    let lastX = 0, lastT = 0;
    ['scr-title', 'scr-char', 'scr-shop'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => {
        if (e.button > 0 || e.target.closest(ui)) return;
        menu.drag = e.pointerId; lastX = e.clientX; lastT = performance.now(); menu.spin = 0;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* still get moves while over the screen */ }
        el.classList.add('turning');
      });
      el.addEventListener('pointermove', e => {
        if (e.pointerId !== menu.drag) return;
        const now = performance.now(), d = (e.clientX - lastX) * 0.012;
        menu.yaw += d;
        menu.spin = d / Math.max(0.008, (now - lastT) / 1000) * 0.5 + menu.spin * 0.5;   // smoothed fling speed (rad/s)
        lastX = e.clientX; lastT = now;
      });
      const end = e => {
        if (e.pointerId !== menu.drag) return;
        menu.drag = null; el.classList.remove('turning');
        if (performance.now() - lastT > 80) menu.spin = 0;   // held still before letting go: no fling
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });
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
    if (name !== 'ranked' && rk.queued) leaveQueue();   // leaving the Ranked screen gives up the queue spot
    state.screen = name;
    if (name === 'title') { endRace(); show('scr-title'); setMenuModel(PB.shop.dress(PB.CHARACTERS[state.charIdx], PB.shop.skin)); updatePassBadge(); }
    if (name === 'char') { endRace(); show('scr-char'); selectChar(state.charIdx); }
    if (name === 'track') { endRace(); show('scr-track'); }
    if (name === 'shop') { endRace(); show('scr-shop'); openShop(); }
    if (name === 'pass') { endRace(); show('scr-pass'); openPass(); }
    if (name === 'offer') { endRace(); show('scr-offer'); $('offer-msg').textContent = ''; renderOffer(); }
    if (name === 'ranked') { endRace(); show('scr-ranked'); $('rk-msg').textContent = ''; openRanked(); }
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
    if (state.mode === 'ranked') { goScreen('ranked'); return; }
    if (PB.net.room) { PB.net.send({ t: 'setChar', char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin }); goScreen('lobby'); }
    else goScreen('online');
  });
  $('btn-shop').addEventListener('click', () => { audio.init(); goScreen('shop'); });
  $('btn-race').addEventListener('click', () => startRace());
  $('btn-resume').addEventListener('click', () => togglePause(false));
  $('btn-restart').addEventListener('click', () => startRace());
  $('btn-quit').addEventListener('click', () => { leaveOnline(); goScreen('title'); });
  $('btn-again').addEventListener('click', () => {
    if (race && race.ranked) { leaveOnline(); goScreen('ranked'); return; }   // a ranked room is for one race
    if (!race || !race.online) { startRace(); return; }
    if (PB.net.isHost()) PB.net.send({ t: 'end' });
    else goScreen('lobby');
  });
  $('btn-tracks').addEventListener('click', () => goScreen('track'));
  $('btn-chars').addEventListener('click', () => { state.mode = 'solo'; goScreen('char'); });   // pick a racer, then a track
  // title extras (How to play / Settings): small panels that open on demand and close on a tap elsewhere
  const closePops = () => document.querySelectorAll('.t-pop').forEach(p => p.classList.add('hidden')) ||
    document.querySelectorAll('[data-pop]').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('[data-pop]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const pop = $(b.dataset.pop), open = pop.classList.contains('hidden');
    closePops();
    if (open) { pop.classList.remove('hidden'); b.classList.add('on'); audio.sfx('select'); }
  }));
  document.querySelectorAll('.t-pop').forEach(p => p.addEventListener('click', e => e.stopPropagation()));
  $('scr-title').addEventListener('click', closePops);
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

  // ---------------- invite links ----------------
  // ?room=CODE in the address joins that room straight away (read now, before anything rewrites the address)
  const inviteCode = (() => {
    const q = new URLSearchParams(location.search), code = (q.get('room') || '').toUpperCase();
    if (!q.has('room')) return null;
    q.delete('room');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    return /^[A-Z0-9]{4}$/.test(code) ? code : null;
  })();
  function inviteUrl(code) {
    const room = PB.net.room;
    let base;
    if (PB.isApp || !location.protocol.startsWith('http')) base = 'https://' + $('on-server').value.trim().replace(/^\w+:\/\//, '').replace(/\/+$/, '');
    else base = /^(localhost|127\.)/.test(location.host) && room && room.lan && room.lan.length ? `http://${room.lan[0]}` : location.origin;
    return `${base}/?room=${code}`;
  }
  $('lb-share').addEventListener('click', async () => {
    const code = PB.net.room.code, url = inviteUrl(code), text = `มาแข่งเจ็ทเซิร์ฟกันใน Power Booster GP! ห้อง ${code}`;
    // phones: the share sheet (LINE, Messenger, ...); elsewhere: copy the link
    if (navigator.share) {
      try { await navigator.share({ title: 'Power Booster GP', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); $('lb-share-msg').textContent = 'คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย'; }
    catch (e) { $('lb-share-msg').textContent = url; }
  });
  $('lb-line').addEventListener('click', () => {
    window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(inviteUrl(PB.net.room.code)), '_blank', 'noopener');
  });

  // ---------------- Ranked ----------------
  const acc = PB.account;
  const rk = { tiers: [], top: [], me: null, season: 1, queued: false, result: null };
  const tierInfo = id => rk.tiers.find(t => t.id === id) || { name: '', icon: '', min: 0 };
  async function openRanked() {
    renderRanked();
    await acc.ready;
    if (!acc.enabled) { renderRanked(); return; }
    try {
      const lb = await acc.api('/api/ranked/leaderboard');
      Object.assign(rk, { tiers: lb.tiers, top: lb.top, season: lb.season });
      rk.me = acc.user ? (await acc.api('/api/ranked/me')).me : null;
    } catch (e) { $('rk-msg').textContent = 'โหลดข้อมูล Ranked ไม่สำเร็จ ลองใหม่อีกครั้ง'; }
    renderRanked();
  }
  function renderRanked() {
    const on = acc.enabled, signed = on && !!acc.user;
    $('rk-season').textContent = `ซีซัน ${rk.season}`;
    $('rk-off').classList.toggle('hidden', on);
    $('rk-off').textContent = PB.isApp ? 'Ranked เล่นได้บนเว็บไซต์ของเกม' : 'Ranked ยังไม่เปิดบนเซิร์ฟเวอร์นี้ (ต้องตั้งค่า Supabase ก่อน ดู docs/PAYMENTS.md)';
    $('rk-login').classList.toggle('hidden', !on || signed);
    $('rk-me').classList.toggle('hidden', !signed);
    $('rk-charname').textContent = PB.CHARACTERS[state.charIdx].name;
    if (!$('rk-name').value) $('rk-name').value = $('on-name').value;
    if (rk.me && rk.tiers.length) {
      const t = tierInfo(rk.me.tier), next = rk.tiers[rk.tiers.indexOf(t) + 1];
      $('rk-icon').textContent = t.icon;
      $('rk-tier').textContent = t.name;
      $('rk-rp').textContent = `${rk.me.rp.toLocaleString()} RP`;
      $('rk-bar').style.width = (next ? (rk.me.rp - t.min) / (next.min - t.min) : 1) * 100 + '%';
      $('rk-next').textContent = next ? `อีก ${next.min - rk.me.rp} RP ถึง ${next.icon} ${next.name}` : 'ระดับสูงสุดแล้ว!';
      $('rk-stats').textContent = `แข่ง ${rk.me.races} • ชนะ ${rk.me.wins}`;
    }
    $('rk-find').classList.toggle('hidden', rk.queued);
    $('rk-char').disabled = $('rk-name').disabled = rk.queued;
    $('rk-queue').classList.toggle('hidden', !rk.queued);
    $('rk-board').innerHTML = rk.top.length ? rk.top.map((r, i) => {
      const t = tierInfo(r.tier), me = rk.me && r.name === rk.me.name && r.rp === rk.me.rp;
      return `<tr class="${me ? 'me' : ''}"><td>${i + 1}</td><td>${t.icon} ${esc(r.name)}</td><td>${r.wins}/${r.races}</td><td>${r.rp.toLocaleString()} RP</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="rk-empty">${on ? 'ยังไม่มีใครแข่ง Ranked ซีซันนี้ เป็นคนแรกเลย!' : ''}</td></tr>`;
  }
  acc.onChange(() => { if (state.screen === 'ranked') openRanked(); });
  function leaveQueue() { rk.queued = false; PB.net.send({ t: 'leaveQueue' }); }
  $('btn-ranked').addEventListener('click', () => { audio.init(); goScreen('ranked'); });
  $('rk-char').addEventListener('click', () => { state.mode = 'ranked'; goScreen('char'); });
  $('rk-logout').addEventListener('click', () => { rk.me = null; acc.logout(); });
  $('rk-send').addEventListener('click', async () => {
    const email = $('rk-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('rk-msg').textContent = 'ใส่อีเมลให้ถูกต้อง'; return; }
    $('rk-send').disabled = true; $('rk-msg').textContent = 'กำลังส่ง...';
    try { await acc.login(email); $('rk-msg').textContent = `ส่งลิงก์ไปที่ ${email} แล้ว เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์เพื่อเข้าสู่ระบบ`; }
    catch (e) { $('rk-msg').textContent = 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง (' + e.message + ')'; }
    $('rk-send').disabled = false;
  });
  $('rk-find').addEventListener('click', async () => {
    audio.init();
    const name = $('rk-name').value.trim();
    if (!name) { $('rk-msg').textContent = 'ตั้งชื่อที่จะแสดงในตารางอันดับก่อน'; return; }
    store.set('pb-name', name); $('on-name').value = name;
    $('rk-msg').textContent = 'กำลังเชื่อมต่อ...';
    leaveOnline();
    try { await PB.net.connect($('on-server').value.trim() || defaultServer); }
    catch (e) { $('rk-msg').textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'; return; }
    const token = await acc.token();
    if (!token) { $('rk-msg').textContent = 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง'; return; }
    state.mode = 'ranked';
    PB.net.send({ t: 'rankedQueue', token, name, char: PB.CHARACTERS[state.charIdx].id, skin: PB.shop.skin });
    rk.queued = true;
    $('rk-msg').textContent = ''; $('rk-qtext').textContent = 'กำลังเข้าคิว...';
    renderRanked();
  });
  $('rk-cancel').addEventListener('click', () => { leaveQueue(); renderRanked(); });
  PB.net.on('queue', m => {
    if (m.replaced) { rk.queued = false; $('rk-msg').textContent = 'บัญชีนี้เข้าคิวจากหน้าจออื่นแล้ว'; renderRanked(); return; }
    if (!rk.queued) return;
    $('rk-qtext').textContent = m.n < 2 ? `กำลังหาผู้เล่นจริงอีกอย่างน้อย 1 คน... (ในคิว ${m.n} คน)` : `พบผู้เล่น ${m.n} คน! เริ่มแข่งใน ${m.wait} วินาที`;
  });
  // the server's verdict on a ranked race; it can arrive before or after this player's results screen
  PB.net.on('rankedResult', m => { rk.result = m; renderRankedResult(); });
  function renderRankedResult() {
    const el = $('res-ranked'), m = rk.result;
    el.classList.toggle('hidden', !(race && race.ranked));
    if (!m) { el.textContent = 'กำลังรอผลการแข่งของทุกคนเพื่อคำนวณแต้ม Ranked...'; return; }
    if (m.error) { el.textContent = 'บันทึกผล Ranked ไม่สำเร็จ'; return; }
    const why = { invalid: ' (ข้อมูลการแข่งผิดปกติ นับเป็นอันดับท้าย)', left: ' (ออกกลางคัน)', timeout: ' (หมดเวลา)' }[m.out] || '';
    const t = tierInfo(m.tier);
    el.innerHTML = `🏆 Ranked: อันดับ <b>${m.place}/${m.humans}</b> ในผู้เล่นจริง${why} • ` +
      `<b class="${m.delta >= 0 ? 'up' : 'down'}">${m.delta >= 0 ? '+' : ''}${m.delta} RP</b> → ${t.icon} ${t.name} ${m.rp.toLocaleString()} RP`;
    if (rk.me) Object.assign(rk.me, { rp: m.rp, tier: m.tier });
  }

  const net = PB.net;
  net.on('room', () => {
    if (state.screen === 'online') goScreen('lobby');
    else if (state.screen === 'lobby') renderLobby();
  });
  net.on('error', m => {
    if (state.screen === 'ranked') { rk.queued = false; $('rk-msg').textContent = m.msg; renderRanked(); }
    else $('on-msg').textContent = m.msg;
  });
  net.on('start', m => {
    state.trackIdx = m.track; state.diff = m.diff;
    togglePause(false);
    $('scr-results').classList.remove('show');
    rk.queued = false; rk.result = null;
    startRace(m.grid);
    race.ranked = !!m.ranked;
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
    } else if (m.e === 'ult') {
      const r = race.racers.find(q => q.netId === m.r), tg = race.racers.find(q => q.netId === m.tg) || null;
      if (r && !r.auth) lightningStrike(r, tg);
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
    if (rk.queued) { rk.queued = false; $('rk-msg').textContent = 'หลุดจากเซิร์ฟเวอร์'; renderRanked(); }
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
    const u = c.ult && ULTS[c.ult];
    $('char-ult').innerHTML = u ? `★ ท่าไม้ตาย Lv.4: <b>${u.name}</b> — ${u.desc}` : 'ท่าไม้ตาย Lv.4: ยังไม่มี (เร็วๆ นี้)';
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
  // color chip for a skin: board / stripe / flame on the current character
  function swatch(id) {
    const k = PB.shop.find(id), d = PB.shop.dress(PB.CHARACTERS[state.charIdx], id);
    return k.rainbow ? 'linear-gradient(135deg,#ff3a3a,#ffd23a,#3aff7a,#22c0ff,#b03aff)'
      : `linear-gradient(135deg,${hex(d.board)} 55%,${hex(d.boardAccent)} 55% 75%,${hex(d.flame)} 75%)`;
  }
  function buildShopGrid() {
    const grid = $('shop-grid');
    grid.innerHTML = PB.shop.shown().map(k => {
      const sw = swatch(k.id);
      const tag = k.id === PB.shop.skin ? '✔ ใส่อยู่' : PB.shop.owns(k.id) ? (k.pass ? '🎟️ Pass' : k.pack ? '🎁 Pack' : 'มีแล้ว') : `🪙 ${k.price.toLocaleString()}`;
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

  // ---------------- daily missions + season pass ----------------
  const pass = PB.pass;
  function rewardHTML(rw) {
    if (!rw) return '';
    if (rw.coins) return `<span class="rw-ico">🪙</span><b>${rw.coins}</b>`;
    const k = PB.shop.find(rw.skin);
    return `<span class="rw-sw" style="background:${swatch(k.id)}"></span><b class="r-${k.rarity}">${k.name}</b>`;
  }
  function updatePassBadge() { $('pass-dot').classList.toggle('hidden', !pass.pending()); }
  function renderPass() {
    const tier = pass.tier, pr = pass.progress();
    $('ps-season').textContent = `ซีซัน ${pass.SEASON.id} • ${pass.SEASON.name}`;
    $('ps-tier').textContent = tier;
    $('ps-xpbar').style.width = (pr ? pr.into / pr.need : 1) * 100 + '%';
    $('ps-xptext').textContent = pr ? `${pr.into.toLocaleString()} / ${pr.need.toLocaleString()} XP ถึง TIER ${tier + 1}` : 'ครบทุกขั้นแล้ว!';
    $('ps-days').textContent = `เหลือ ${pass.daysLeft()} วัน`;
    $('ms-reset').textContent = `ภารกิจใหม่ใน ${pass.resetIn()} ชม.`;
    const ms = pass.missions();
    $('ms-list').innerHTML = ms.map(m => `<li class="${m.done ? 'done' : ''}"><div class="ms-text">${m.done ? '✅ ' : ''}${m.text}` +
      `<div class="bar"><i style="width:${(m.prog / m.target) * 100}%"></i></div></div>` +
      `<div class="ms-prog">${m.prog}/${m.target}</div><div class="ms-rw">+${m.xp} XP<br>🪙 ${m.coins}</div></li>`).join('') +
      `<li class="bonus ${pass.bonusDone ? 'done' : ''}"><div class="ms-text">${pass.bonusDone ? '✅ ' : '⭐ '}ทำครบทั้ง 3 ภารกิจ</div>` +
      `<div class="ms-prog">${ms.filter(m => m.done).length}/3</div><div class="ms-rw">+${pass.ALL_DONE.xp} XP<br>🪙 ${pass.ALL_DONE.coins}</div></li>`;
    const cell = (t, prem) => {
      const rw = pass.tierReward(t, prem);
      if (!rw) return '<div class="ps-cell empty"></div>';
      const st = pass.isClaimed(t, prem) ? 'claimed' : pass.claimable(t, prem) ? 'ready' : 'locked';
      const lock = prem && !pass.premium ? '<i class="lock">🔒</i>' : '';
      return `<div class="ps-cell ${prem ? 'prem ' : ''}${st}" data-tier="${t}" data-prem="${prem ? 1 : 0}">${rewardHTML(rw)}${lock}` +
        `${st === 'claimed' ? '<i class="ok">✔</i>' : ''}</div>`;
    };
    let cols = '';
    for (let t = 1; t <= pass.TIERS; t++) {
      cols += `<div class="ps-col${t <= tier ? ' reached' : ''}${t === tier + 1 ? ' next' : ''}"><div class="ps-num">${t}</div>${cell(t, false)}${cell(t, true)}</div>`;
    }
    $('ps-track').innerHTML = cols;
    $('ps-track').querySelectorAll('.ps-cell.ready').forEach(c => c.addEventListener('click', () => {
      const rw = pass.claim(+c.dataset.tier, c.dataset.prem === '1');
      if (rw) claimed([rw]);
    }));
    $('ps-claim').disabled = !pass.pending();
    const price = PB.pay.priceText(pass.PREMIUM_PRODUCT);
    $('ps-buy').textContent = pass.premium ? '✔ พรีเมียมแล้ว' : price ? `ปลดล็อก ${price}` : 'ปลดล็อกพรีเมียม';
    $('ps-buy').disabled = pass.premium;
    $('ps-login').classList.toggle('hidden', pass.premium || !PB.pay.enabled || !!PB.account.user || !$('ps-login').dataset.asked);
    updatePassBadge();
  }
  function claimed(list) {
    audio.sfx('finish');
    const coins = list.reduce((a, r) => a + (r.coins || 0), 0), skins = list.filter(r => r.skin).map(r => PB.shop.find(r.skin).name);
    $('ps-msg').textContent = 'ได้รับ ' + [coins ? `🪙 ${coins}` : '', ...skins.map(s => `สกิน ${s} (ใส่ได้ที่ร้านค้า)`)].filter(Boolean).join(' + ');
    renderPass();
  }
  function openPass() {
    $('ps-msg').textContent = '';
    renderPass();
    // scroll the reward track to the next tier to reach
    const next = $('ps-track').querySelector('.ps-col.next') || $('ps-track').lastElementChild;
    $('ps-track').scrollLeft = Math.max(0, next.offsetLeft - $('ps-track').clientWidth / 2);
  }
  $('btn-pass').addEventListener('click', () => { audio.init(); goScreen('pass'); });
  $('ps-claim').addEventListener('click', () => { const got = pass.claimAll(); if (got.length) claimed(got); });
  // premium Pass: real money through Stripe (js/pay.js); a signed-in account keeps it across devices
  $('ps-buy').addEventListener('click', async () => {
    const pay = PB.pay;
    if (!pay.enabled) {
      $('ps-msg').textContent = PB.isApp ? 'ซื้อพรีเมียมได้บนเว็บไซต์ของเกม แล้วเข้าสู่ระบบบัญชีเดียวกัน'
        : 'ระบบชำระเงินยังไม่เปิดบนเซิร์ฟเวอร์นี้ ระหว่างนี้เก็บ XP ไว้ก่อนได้ รางวัลพรีเมียมย้อนรับได้ทั้งหมด';
      return;
    }
    if (!PB.account.user) {
      $('ps-login').dataset.asked = '1';
      $('ps-msg').textContent = 'ใส่อีเมลเพื่อเข้าสู่ระบบก่อน แล้วกดปลดล็อกอีกครั้ง';
      renderPass();
      return;
    }
    $('ps-buy').disabled = true; $('ps-msg').textContent = 'กำลังไปหน้าชำระเงิน...';
    try { await pay.buy(pass.PREMIUM_PRODUCT); }
    catch (e) {
      $('ps-msg').textContent = e.status === 409 ? 'บัญชีนี้ซื้อพรีเมียมซีซันนี้ไปแล้ว กำลังกู้คืน...' : 'เปิดหน้าชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง';
      if (e.status === 409) pay.sync().then(renderPass).catch(() => {});
      renderPass();
    }
  });
  $('ps-send').addEventListener('click', async () => {
    const email = $('ps-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('ps-msg').textContent = 'ใส่อีเมลให้ถูกต้อง'; return; }
    $('ps-send').disabled = true; $('ps-msg').textContent = 'กำลังส่ง...';
    try { await PB.account.login(email); $('ps-msg').textContent = `ส่งลิงก์ไปที่ ${email} แล้ว เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์เพื่อเข้าสู่ระบบ`; }
    catch (e) { $('ps-msg').textContent = 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง (' + e.message + ')'; }
    $('ps-send').disabled = false;
  });
  updatePassBadge();

  // ---------------- Starter Pack (real money, js/pay.js) ----------------
  const pay = PB.pay;
  const fmtLeft = ms => { const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60; return `${h}:${String(m).padStart(2, '0')} ชม.`; };
  function renderOffer() {
    const open = pay.offerOpen(), left = fmtLeft(pay.offerLeft()), price = pay.priceText('starter');
    $('offer-banner').classList.toggle('hidden', !open);
    $('offer-price').textContent = price;
    $('offer-time').textContent = `เหลือ ${left}`;
    if (state.screen !== 'offer') return;
    $('offer-time2').textContent = left;
    $('offer-sw').style.background = swatch('starter_ace');
    $('offer-login').classList.toggle('hidden', !!pay.user);
    $('offer-account').classList.toggle('hidden', !pay.user);
    if (pay.user) $('offer-user').textContent = pay.user.email || 'ผู้เล่น';
    const bought = pay.bought.has('starter');
    $('offer-buy').textContent = bought ? '✔ ซื้อแล้ว ของอยู่ในร้านค้า' : `ซื้อ ${price}`;
    $('offer-buy').disabled = bought || !open;
  }
  pay.onChange = () => { renderOffer(); if (state.screen === 'pass') renderPass(); };
  setInterval(renderOffer, 30000);   // countdown
  $('offer-banner').addEventListener('click', () => { audio.init(); goScreen('offer'); });
  $('offer-send').addEventListener('click', async () => {
    const email = $('offer-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('offer-msg').textContent = 'ใส่อีเมลให้ถูกต้อง'; return; }
    $('offer-send').disabled = true; $('offer-msg').textContent = 'กำลังส่ง...';
    try { await pay.login(email); $('offer-msg').textContent = `ส่งลิงก์ไปที่ ${email} แล้ว เปิดอีเมลบนเครื่องนี้แล้วกดลิงก์เพื่อเข้าสู่ระบบ`; }
    catch (e) { $('offer-msg').textContent = 'ส่งลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง (' + e.message + ')'; }
    $('offer-send').disabled = false;
  });
  $('offer-logout').addEventListener('click', () => pay.logout());
  $('offer-buy').addEventListener('click', async () => {
    $('offer-buy').disabled = true; $('offer-msg').textContent = 'กำลังไปหน้าชำระเงิน...';
    try { await pay.buy('starter'); }
    catch (e) {
      $('offer-msg').textContent = e.status === 409 ? 'บัญชีนี้ซื้อ Starter Pack ไปแล้ว' : 'เปิดหน้าชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง';
      if (e.status === 409) pay.sync().catch(() => {});
      renderOffer();
    }
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
      this.ult = rand(0, 30);   // ultimate meter (only used when def.ult is set)
      this.burn = 0; this.glided = false; this.fireAcc = 0; this.veilShown = false;
      this.icy = 0; this.knockT = 0;   // Ice Road slide / Mega Thruster knock cooldown
      this.turbo = 0; this.spin = 0; this.shield = 0; this.shock = 0;
      this.drifting = false; this.driftDir = 0; this.driftTime = 0;
      this.steerVis = 0; this.hop = 0; this.bob = Math.random() * 10; this.wallCd = 0;
      this.bounceT = 0; this.bounceH = 0; this.pSpin = 0; this.pShock = 0; this.pBurn = 0;
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

    // perfect start: one stage of Booster Lv.2 straight off the line; it does not use or empty the gauge
    startBoost() {
      this.stage = 2; this.boostMax = 2; this.stageTimer = this.stageDur = STAGE_TIME;
      if (this.isPlayer) { audio.sfx('boost2'); bigMsg('PERFECT START! BOOST Lv.2', true); race.shake = 0.3; stat(this, 'perfectstart'); }
    }

    // ultimate meter: fills from driving well (drifts, air time, items) and faster for racers further back
    chargeUlt(amount) {
      if (!this.def.ult || this.stage === 4) return;
      this.ult = Math.min(100, this.ult + amount * (1 + (this.place - 1) * 0.12));
    }

    startUltimate() {
      const u = ULTS[this.def.ult];
      this.stage = 4; this.stageTimer = this.stageDur = ULT_TIME; this.ult = 0;
      stat(this, 'ultimate');
      if (this.def.ult === 'glide' && !this.falling) {   // leap up and float
        this.air = true; this.vy = Math.max(this.vy, 11); this.airTime = 0; this.onRamp = null; this.drifting = false;
      }
      this.glided = this.def.ult === 'glide';
      if (this.def.ult === 'radiant') {   // shake everything off and keep a one-hit guard for the duration
        this.spin = 0; this.shock = 0; this.burn = 0; this.icy = 0;
        this.shield = Math.max(this.shield, ULT_TIME);
      }
      if (this.def.ult === 'lightning') {   // strike the nearest racer (ahead first) within range
        const cands = race.racers.filter(r => r !== this && !r.finished && !veiled(r) && r.pos.distanceTo(this.pos) < 60);
        cands.sort((a, b) => (a.place < this.place ? 0 : 30) + a.pos.distanceTo(this.pos) - ((b.place < this.place ? 0 : 30) + b.pos.distanceTo(this.pos)));
        const tgt = cands[0] || null;
        lightningStrike(this, tgt);
        netEvent({ e: 'ult', r: this.netId, tg: tgt ? tgt.netId : null });
      }
      if (this.isPlayer) { audio.sfx('boost3'); bigMsg(`★ ${u.name}! ★`, true); race.shake = 0.4; }
      else if (near(this)) bigMsg(`${this.name}: ${u.name}!`, true);
    }

    // Flame Road: slower top speed for a second; a shield soaks it, a veiled racer passes through
    applyBurn() {
      if (!this.auth || this.burn > 0 || unstoppable(this) || this.respawnT > 0) return;
      if (this.shield > 0) { this.shield = 0; spawnBurst(this.pos.clone().add(new V3(0, 1.6, 0)), 0x44ccff, 3.5); this.hurtCharge(SHIELD_CHARGE); return; }
      this.burn = 1.0; this.speed *= 0.85; this.hurtCharge(8);
      if (this.isPlayer) { audio.sfx('hit'); bigMsg('ไฟลวก!', true); }
    }

    // Ice Road: the board slides for a moment (terrain, so a shield doesn't help)
    applyIce() {
      if (!this.auth || this.icy > 0 || unstoppable(this) || this.respawnT > 0) return;
      this.icy = 1.1;
      if (this.isPlayer) bigMsg('ลื่น!', true);
    }

    // Mega Thruster / Storm Wind: shoved sideways away from `from`, losing some speed; a shield soaks one knock
    knock(from, strength) {
      if (!this.auth || this.knockT > 0 || unstoppable(this) || this.respawnT > 0 || this.falling) return;
      this.knockT = 0.8;
      if (this.shield > 0) { this.shield = 0; spawnBurst(this.pos.clone().add(new V3(0, 1.6, 0)), 0x44ccff, 3.5); this.hurtCharge(SHIELD_CHARGE); return; }
      const dx = this.pos.x - from.pos.x, dz = this.pos.z - from.pos.z, d = Math.hypot(dx, dz) || 1;
      this.pos.x += dx / d * strength; this.pos.z += dz / d * strength;
      this.speed *= strength > 3 ? 0.5 : 0.8;
      this.hop = 0.35; this.hurtCharge(strength > 3 ? 10 : 6);
      if (this.isPlayer) { audio.sfx('bump'); race.shake = Math.max(race.shake, 0.4); }
    }

    // taking damage builds the ultimate meter (on top of the usual catch-up boost for racers further back)
    hurtCharge(amount) {
      this.chargeUlt(amount);
      if (this.isPlayer) { const row = document.getElementById('ult-row'); row.classList.remove('charged'); void row.offsetWidth; row.classList.add('charged'); }
    }

    takeHit(kind) {
      if (!this.auth) return;   // the browser that simulates a racer decides its hits
      if (this.respawnT > 0 || this.falling || veiled(this)) return;
      if (this.finished && !this.isPlayer) return;
      if (this.shield > 0) {
        this.shield = 0;
        spawnBurst(this.pos.clone().add(new V3(0, 1.6, 0)), 0x44ccff, 3.5);
        if (this.isPlayer) audio.sfx('shield');
        this.hurtCharge(SHIELD_CHARGE);   // blocked, but still a little charge
        return;
      }
      if (kind === 'shock') { this.shock = 2.5; this.speed *= 0.55; this.hurtCharge(12); }
      else { this.spin = 1.4; this.speed *= 0.25; this.hurtCharge(15); }
      if (this.stage > 0) { this.stage = 0; if (this.boostMax === 3) this.gauge = 30; }   // a full boost keeps a little charge
      this.drifting = false; this.turbo = 0;
      if (this.isPlayer) { audio.sfx('hit'); race.shake = 0.6; bigMsg(kind === 'shock' ? 'โดนช็อก!' : 'โดนโจมตี!', true); }
    }

    giveItemBox() {
      if (!this.auth) return;
      this.gauge = Math.min(100, this.gauge + 12);
      stat(this, 'boxes');
      if (this.item || this.rolling > 0) return;
      this.pendingItem = rollItem(this.place);
      this.rolling = this.isPlayer ? 1.2 : 0.5;
      if (this.isPlayer) audio.sfx('pickup');
    }

    useItem() {
      const it = this.item;
      if (!it) return;
      this.item = null;
      stat(this, 'items');
      const ev = { e: 'item', r: this.netId, it, x: this.pos.x, y: this.pos.y, z: this.pos.z, h: this.heading, s: this.speed,
        pid: `${race.online ? PB.net.id : 'L'}-${race.pidSeq++}` };
      if (it === 'missile') {
        const target = race.racers.filter(r => r !== this && !r.finished && !veiled(r) && r.place < this.place).sort((a, b) => b.place - a.place)[0];
        ev.tg = target ? target.netId : null;
      }
      applyItem(this, ev);
      this.chargeUlt(6);
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
        if (d > 2 && d < 28 && Math.abs(m.lat - lane) < 5) lane = m.lat + (m.lat > 0 ? -7 : 7);
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
        // touch: hold GO to run; holding DRIFT runs too, so one thumb can drift without also holding GO
        inp.throttle = down('KeyW', 'ArrowUp') || (vin.touch && down('Space')) ? 1 : 0;
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
            if (this.stage === 3) stat(this, 'maxboost');
            if (this.isPlayer) { audio.sfx('boost' + this.stage); bigMsg(this.stage === 3 ? 'MAX BOOST!!' : 'BOOST Lv.' + this.stage, true); race.shake = 0.3; }
          } else if (this.stage === 3 && this.boostMax === 3 && this.def.ult && this.ult >= 100) {
            this.startUltimate();
          } else { this.stage = 0; if (this.boostMax !== 2) this.gauge = 0; }   // the start boost keeps the gauge
        }
      } else if (canControl) {
        this.gauge = Math.min(100, this.gauge + GAUGE_REGEN * dt);
      }
      if (canControl && this.stage < 4) this.chargeUlt(0.6 * dt);
      this.burn = Math.max(0, this.burn - dt);
      this.icy = Math.max(0, this.icy - dt);
      this.knockT = Math.max(0, this.knockT - dt);

      // --- speed ---
      let top = this.maxSpeed * BOOST_MUL[this.stage] * (this.turbo > 0 ? 1.3 : 1) * (this.shock > 0 ? 0.6 : 1) * (this.burn > 0 ? 0.7 : 1);
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
            this.chargeUlt(this.driftTime > 2 ? 18 : 10);
            this.turbo = Math.max(this.turbo, this.driftTime > 2 ? 1.2 : 0.7);
            stat(this, 'drift');
            if (this.isPlayer) audio.sfx('turbo');
          }
          this.drifting = false;
        } else {
          this.driftTime += dt;
          eff = this.driftDir * 0.65 + steer * 0.55;
        }
      }
      const handling = this.turnRate * (1 - 0.1 * this.stage) * (this.drifting ? 1.3 : 1) * (this.air ? (this.glided ? 0.8 : 0.45) : 1);
      const sf = clamp(Math.abs(this.speed) / 22, 0, 1);
      this.heading += eff * handling * sf * dt * Math.sign(this.speed || 1);
      if (this.spin > 0) this.speed *= Math.pow(0.4, dt);

      // --- move --- (on ice the travel direction catches up with the nose slowly, so the board slides)
      const grip = Math.min(track.theme.grip || 30, this.icy > 0 ? 2.5 : 99);   // Ice Road: the board slides
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
        this.vy -= GRAVITY * (this.glided && this.stage === 4 ? 0.25 : 1) * dt;   // Wind Glide floats
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
      const big = this.airTime > 0.6 && this.spin <= 0 && !this.glided;
      if (big) this.chargeUlt(Math.min(this.airTime, 2) * 8);
      this.glided = false;
      if (big) { this.turbo = Math.max(this.turbo, 0.5 + Math.min(this.airTime, 1.6) * 0.5); stat(this, 'air'); }
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
      // hit bounce: popped up into the air when hit. Read from the hit state (spin/shock are synced), so remote racers bounce too.
      const pop = this.spin > this.pSpin + 0.3 ? 2.4 : this.shock > this.pShock + 0.3 ? 1.6 : this.burn > this.pBurn + 0.3 ? 1.1 : 0;
      this.pSpin = this.spin; this.pShock = this.shock; this.pBurn = this.burn;
      if (pop) { this.bounceT = BOUNCE_T; this.bounceH = pop; }
      if (this.bounceT > 0) { this.bounceT = Math.max(0, this.bounceT - dt); if (this.bounceT === 0) this.land = 0.25; }   // squash on touchdown
      const bounceY = this.bounceT > 0 ? Math.sin((1 - this.bounceT / BOUNCE_T) * Math.PI) * this.bounceH : 0;
      m.root.position.set(this.pos.x, this.pos.y + 0.35 + Math.sin(this.bob) * 0.12 + hopY + bounceY, this.pos.z);
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
      // Wind Glide: corkscrew roll around the direction of travel, pivoting at the rider's middle;
      // eased 3 full turns, so it ends upright exactly when the ultimate does
      const roll = this.stage === 4 && this.def.ult === 'glide' ? this.corkscrewAngle() : 0;
      if (roll) {
        m.body.rotation.z = roll;
        m.body.position.set(CORK_PIVOT * Math.sin(roll), CORK_PIVOT * (1 - Math.cos(roll)), 0);
      } else if (m.body.position.x || m.body.position.y) m.body.position.set(0, 0, 0);
      if (this.spin > 0) m.body.rotation.y = (1.4 - this.spin) * 11;
      else m.body.rotation.y += ((this.drifting ? this.driftDir * 0.5 : 0) - wrapAngle(m.body.rotation.y)) * Math.min(1, 10 * dt);
      // turning pose; while spun out by a hit the rider flails left and right
      const flail = this.spin > 0 || this.falling;
      PB.animateRider(m, { dt, steer: flail ? Math.sin(race.time * 18) : this.steerVis,
        drift: this.drifting ? this.driftDir : 0, stage: this.stage, speed: this.speed, time: race.time,
        air: this.air || this.falling || this.bounceT > 0 ? 1 : 0 });
      m.shield.visible = this.shield > 0;
      m.shield.material.color.setHex(this.stage === 4 && this.def.ult === 'radiant' ? 0xffd23a : 0x44ccff);
      if (m.shield.visible) m.shield.material.opacity = 0.2 + Math.sin(race.time * 10) * 0.06;
      // shock flicker
      m.rider.visible = !(this.shock > 0 && Math.floor(race.time * 20) % 2 === 0);
      if (this.shock > 0) crackle(this);
      this.ultimateEffects(dt);

      // flames: size and color by state
      const power = Math.max(this.input.throttle * 0.6, 0.25) + this.stage * 0.45 + (this.turbo > 0 ? 0.6 : 0);
      let col = this.def.flame;
      if (this.stage === 4) col = ULTS[this.def.ult].color;
      else if (this.stage > 0) col = BOOST_COLORS[this.stage];
      else if (this.turbo > 0) col = 0xff8a20;
      else if (this.drifting) col = this.driftTime > 2 ? 0xff5020 : this.driftTime > 0.9 ? 0xffe040 : 0x80c0ff;
      const mega = this.stage === 4 && this.def.ult === 'thruster' ? 2.4 : 1;   // Mega Thruster: much bigger jets
      for (const f of m.flames) {
        const len = power * (0.9 + Math.random() * 0.25) * mega;
        f.outer.scale.set((1 + this.stage * 0.25) * mega, len, (1 + this.stage * 0.25) * mega);
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
      const ultCol = stage === 4 ? ULTS[this.def.ult].color : 0;
      this.trail.update(active, back, right, stage >= 3 ? (stage === 4 ? 1.3 : 1.0) : 0.7, (c, a, t) => {
        if (stage === 4) c.setHex(ultCol);
        else if (stage === 3) c.setHSL((a * 4 + t * 1.5) % 1, 1, 0.55);
        else if (stage > 0) c.setHex(BOOST_COLORS[stage]);
        else if (turbo > 0) c.setHex(0xff8a20);
      }, race.time);

      if (m.root.position.distanceTo(camera.position) < 150) this.emitParticles(dt, col);
    }

    // Lv.4 visuals (and Flame Road's fire). Runs for every racer on every browser, so remote players see it too.
    ultimateEffects(dt) {
      const m = this.model, ult = this.stage === 4 ? this.def.ult : null;
      // Shadow Veil: fade the whole racer out (less for your own, so you can still steer)
      const veil = ult === 'veil';
      if (veil !== this.veilShown) {
        this.veilShown = veil;
        m.root.traverse(o => {
          if (o.isSprite) o.visible = !veil;   // name tag
          if (!o.isMesh || !o.material) return;
          for (const mt of Array.isArray(o.material) ? o.material : [o.material]) {
            if (veil) { mt.userData.veil = { t: mt.transparent, o: mt.opacity, dw: mt.depthWrite }; mt.transparent = true; mt.depthWrite = false; }
            else if (mt.userData.veil) { Object.assign(mt, { transparent: mt.userData.veil.t, opacity: mt.userData.veil.o, depthWrite: mt.userData.veil.dw }); delete mt.userData.veil; }
            mt.needsUpdate = true;
          }
        });
      }
      if (veil) {
        const a = (this.isPlayer ? 0.35 : 0.12) + Math.sin(race.time * 14) * 0.05;
        m.root.traverse(o => { if (o.isMesh && o.material && o.material.userData.veil) o.material.opacity = o.material.userData.veil.o * a; });
      }
      if (ult === 'flame' || ult === 'ice') {   // drop a fire / ice patch behind the board every 0.12s
        this.fireAcc += dt;
        while (this.fireAcc > 0.12) { this.fireAcc -= 0.12; spawnFire(this, m.root.localToWorld(new V3(0, 0, -2.8)), ult === 'ice' ? 'ice' : 'fire'); }
      }
      const close = ult && m.root.position.distanceTo(camera.position) < 150;
      if (close && ult === 'storm') {   // ring of wind streaks spinning around the racer
        for (let k = 0; k < 6; k++) {
          const a = race.time * 9 + k * Math.PI / 3, rr = 5 + Math.random() * 6;
          const p = m.root.position.clone().add(new V3(Math.cos(a) * rr, 0.5 + Math.random() * 4, Math.sin(a) * rr));
          race.particles.emit(1, { pos: p, vel: new V3(-Math.sin(a) * 18, 1, Math.cos(a) * 18), color: 0xe8fbff, life: 0.4, size: [0.8, 0.2], drag: 2 });
        }
      }
      if (close && ult === 'lightning') {   // crackling sparks round the rider
        race.particles.emit(3, { pos: m.root.position.clone().add(new V3(0, 1.8, 0)), spread: 10, color: c => c.setHSL(0.14, 1, 0.6 + Math.random() * 0.3),
          life: 0.2, size: [0.6, 0.1], jitter: 3 });
      }
      if (close && ult === 'radiant') {   // golden sparkles drifting up
        race.particles.emit(2, { pos: m.root.position.clone().add(new V3(0, 1.5, 0)), spread: 2, vel: new V3(0, 4, 0), color: 0xfff0a0,
          life: 0.8, size: [0.7, 0.1], drag: 1, jitter: 4 });
      }
      if (close && ult === 'ice') {
        race.particles.emit(2, { pos: m.root.localToWorld(new V3(0, 0.4, -2.4)), spread: 3, vel: new V3(0, 2, 0), color: 0xeaffff, life: 0.5, size: [0.6, 0.1], drag: 2 });
      }
      if (ult === 'glide' && m.root.position.distanceTo(camera.position) < 150) {
        // two strands of leaves spiralling around the roll, left hanging in the air so they draw a corkscrew trail
        const a = this.corkscrewAngle();
        for (const off of [0, Math.PI]) {
          const p = m.root.localToWorld(new V3(Math.cos(a + off) * 2.3, CORK_PIVOT + Math.sin(a + off) * 2.3, -0.8));
          race.particles.emit(2, { pos: p, spread: 0.6, vel: new V3(0, 0, 0), color: c => c.setHSL(0.27 + Math.random() * 0.12, 0.95, 0.55),
            life: 0.7, size: [0.9, 0.25], drag: 4, jitter: 0.4 });
        }
      }
    }

    // roll angle through Wind Glide: smooth start and finish, 3 turns in total
    corkscrewAngle() {
      const t = 1 - Math.max(0, this.stageTimer) / ULT_TIME;
      const e = t * t * (3 - 2 * t);
      return e * Math.PI * 2 * CORK_TURNS;
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
        const color = stage === 3 ? c => c.setHSL(Math.random(), 1, 0.6) : flameCol;   // Lv.4: flameCol is the ultimate's colour
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
      spawnProjectile('bomb', r, pos.addScaledVector(f, 3).add(new V3(0, 1.5, 0)), Math.max(ev.s + 80, 160), null, ev.pid, ev.h);   // well ahead of even a boosting thrower
      if (loud) audio.sfx('fire');
    } else if (ev.it === 'mine') {
      spawnMine(r, pos.addScaledVector(f, -4.5), ev.pid);
    } else if (ev.it === 'shield') {
      r.shield = 10; if (r.isPlayer) audio.sfx('shield');
    } else if (ev.it === 'turbo') {
      r.turbo = 1.8; if (r.isPlayer) audio.sfx('turbo');
    } else if (ev.it === 'emp') {
      race.racers.forEach(q => {
        if (q === r || q.progressTotal() <= r.progressTotal()) return;
        if (!veiled(q)) empStrike(q);   // everyone sees the bolt; the hit itself lands on q's own browser
        q.takeHit('shock');
      });
      race.flash = Math.max(race.flash, 0.3);
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

  // Lightning ultimate: a jagged bolt from src to tgt (or into the sky), shocking tgt on the browser that simulates it
  // A jagged lightning bolt from a to b: a hot core inside a soft glow, with a few side forks. Fades out over `life` seconds.
  const BOLT_GEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), UP = new V3(0, 1, 0);
  function makeBolt(a, b, o) {
    o = Object.assign({ core: 0.18, glow: 0.7, jitter: 1.6, segs: 12, forks: 3, color: 0xfff6a0, glowColor: 0x8ad8ff, life: 0.4 }, o);
    const g = new THREE.Group();
    const core = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const halo = new THREE.MeshBasicMaterial({ color: o.glowColor, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const seg = (p, q, k) => {   // one straight piece, as a core rod plus a fatter glow rod
      const d = q.clone().sub(p), len = d.length(); if (len < 0.01) return;
      const rot = new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len));
      for (const [mat, r] of [[core, o.core * k], [halo, o.glow * k]]) {
        const m = new THREE.Mesh(BOLT_GEO, mat);
        m.position.copy(p).lerp(q, 0.5); m.quaternion.copy(rot); m.scale.set(r, len, r);
        g.add(m);
      }
    };
    const path = (p0, p1, n, jit, k) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const p = p0.clone().lerp(p1, i / n);
        if (i > 0 && i < n) p.add(new V3(rand(-jit, jit), rand(-jit, jit) * 0.6, rand(-jit, jit)));
        pts.push(p);
      }
      for (let i = 0; i < n; i++) seg(pts[i], pts[i + 1], k);
      return pts;
    };
    const main = path(a, b, o.segs, o.jitter, 1);
    for (let f = 0; f < o.forks; f++) {   // side forks branching off the main channel
      const from = main[1 + Math.floor(Math.random() * (o.segs - 2))];
      const to = from.clone().add(new V3(rand(-1, 1), rand(-1, -0.3), rand(-1, 1)).multiplyScalar(a.distanceTo(b) * rand(0.12, 0.25)));
      path(from, to, 4, o.jitter * 0.6, 0.55);
    }
    race.scene.add(g);
    race.bolts.push({ obj: g, mats: [core, halo], t: 0, life: o.life });
    return g;
  }

  function lightningStrike(src, tgt) {
    const a = src.pos.clone().add(new V3(0, 3, 0));
    const b = tgt ? tgt.pos.clone().add(new V3(0, 1.5, 0)) : a.clone().add(new V3(0, 30, 0));
    makeBolt(a, b, { forks: 2 });
    race.flash = 0.25;
    if (tgt) {
      spawnBurst(b, 0xffe14a, 4);
      tgt.takeHit('shock');   // only acts on the target's own browser; a shield or Shadow Veil stops it
    }
    if (near(src) || (tgt && near(tgt))) audio.sfx('boom');
  }

  // EMP: a bolt from the sky onto the racer, a flash of sparks, and the rider keeps crackling while shocked (see crackle())
  function empStrike(q) {
    const top = q.pos.clone().add(new V3(rand(-6, 6), 45, rand(-6, 6))), hitPt = q.pos.clone().add(new V3(0, 1.4, 0));
    makeBolt(top, hitPt, { core: 0.22, glow: 0.8, jitter: 2.4, segs: 14, forks: 4, life: 0.5, glowColor: 0x4a9aff });
    makeBolt(top, hitPt, { core: 0.12, glow: 0.5, jitter: 3, segs: 14, forks: 1, life: 0.3 });   // a second, fainter channel
    spawnBurst(hitPt, 0x5ab8ff, 2.2);
    if (q.pos.distanceTo(camera.position) < 150) {
      race.particles.emit(26, { pos: hitPt, spread: 2, vel: new V3(0, 6, 0), color: c => c.setHSL(0.15 + Math.random() * 0.4, 1, 0.75),
        life: 0.5, size: [0.7, 0.1], drag: 2, jitter: 14 });
    }
  }
  // small arcs and sparks around a shocked rider
  function crackle(q) {
    if (q.pos.distanceTo(camera.position) > 120 || Math.random() > 0.35) return;
    const c = q.pos.clone().add(new V3(0, 1.4, 0));
    const a = c.clone().add(new V3(rand(-1.4, 1.4), rand(-1, 1.2), rand(-1.4, 1.4)));
    const b = c.clone().add(new V3(rand(-1.4, 1.4), rand(-1, 1.2), rand(-1.4, 1.4)));
    makeBolt(a, b, { core: 0.07, glow: 0.25, jitter: 0.5, segs: 4, forks: 0, life: 0.12 });
    race.particles.emit(2, { pos: c, spread: 1.6, vel: new V3(0, 2, 0), color: 0xbfefff, life: 0.25, size: [0.4, 0.05], drag: 2, jitter: 6 });
  }

  // Flame Road / Ice Road patch: a glowing disc on the road that lasts 3s
  function spawnFire(owner, pos, kind) {
    if (!race.fireGeo) {
      race.fireGeo = new THREE.CircleGeometry(3.2, 20);
      race.fireMat = PB.glow(0xff6a10, 0.75);
      race.iceMat = PB.glow(0x8adfff, 0.55);
    }
    kind = kind || 'fire';
    const idx = race.track.nearest(pos, owner.idx);
    pos.y = race.track.heightAt(pos, idx) + 0.12;
    const mesh = new THREE.Mesh(race.fireGeo, kind === 'ice' ? race.iceMat : race.fireMat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(pos);
    race.scene.add(mesh);
    race.fires.push({ owner, pos, mesh, life: 3, kind });
  }

  function mesh0(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
  function spawnMine(owner, pos, pid) {
    const g = new THREE.Group();
    const S = MINE_SIZE;
    // crate glows red in pulses (see the mine loop) so it reads as a bomb from far off
    const crateMat = PB.toon(0xd03a20, { emissive: new THREE.Color(0xff2000), emissiveIntensity: 0 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), crateMat);
    crate.castShadow = true; g.add(crate);
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = '#ffd23a'; x.fillRect(0, 0, 64, 32);
    x.fillStyle = '#d03a20'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('TNT', 32, 26);
    const labelMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) });
    for (let k = 0; k < 4; k++) {   // label on all four sides
      const label = new THREE.Mesh(new THREE.PlaneGeometry(S * 0.82, S * 0.41), labelMat);
      label.rotation.y = k * Math.PI / 2;
      label.position.set(Math.sin(k * Math.PI / 2) * (S / 2 + 0.01), 0, Math.cos(k * Math.PI / 2) * (S / 2 + 0.01));
      g.add(label);
    }
    // warning beacon on top and a pulsing red ring on the road
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), PB.glow(0xff3020, 1));
    beacon.position.y = S / 2 + 0.3; g.add(beacon);
    mesh0(new THREE.CylinderGeometry(0.2, 0.26, 0.24, 10), PB.toon(0x333333), 0, S / 2 + 0.06, 0, g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(S * 0.75, S * 0.95, 32), PB.glow(0xff2a10, 0.8));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -S / 2 + 0.06; g.add(ring);
    const idx = race.track.nearest(pos, owner.idx);
    pos.y = race.track.heightAt(pos, idx) + S / 2;
    g.position.copy(pos);
    race.scene.add(g);
    race.mines.push({ id: pid, owner, pos, mesh: g, crateMat, beacon, ring, immune: 1.0, idx, lat: race.track.lateral(pos, idx), life: 40, t: Math.random() });
  }

  // projectile blows up: visuals everywhere, bomb splash hits whichever racers this browser simulates
  function detonate(p) {
    if (p.dead) return;
    p.dead = true;
    explode(p.pos.clone(), p.type === 'bomb' ? 9 : 4);
    if (p.type === 'bomb') race.racers.forEach(r => { if (r !== p.owner && r.pos.distanceTo(p.pos) < 9) r.takeHit('spin'); });   // the thrower is spared
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
      if (p.target && veiled(p.target)) p.target = null;   // lock lost: fly on down the track
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
      if (p.type === 'bomb') { p.mesh.rotation.x += dt * 12; p.speed = Math.max(130, p.speed - 10 * dt); }
      const back = p.pos.clone().add(new V3(-Math.sin(p.heading) * 1.6, 0, -Math.cos(p.heading) * 1.6));
      p.trail.update(true, back, new V3(Math.cos(p.heading), 0, -Math.sin(p.heading)), 0.35, c => c.setHex(0xff9a40), race.time);
      // collisions: only against racers this browser simulates; it then tells everyone where the shot blew up
      if (p.life <= 0 || Math.abs(track.lateral(p.pos, p.idx)) > track.W + 1) { detonate(p); continue; }
      for (const r of race.racers) {
        if (!r.auth || r === p.owner) continue;   // your own shots never hit you
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
    // Flame/Ice Road patches: flicker, then shrink away; affect grounded racers (not the owner) that this browser simulates
    for (const f of race.fires) {
      f.life -= dt;
      const ice = f.kind === 'ice';
      f.mesh.scale.setScalar(Math.min(1, f.life / 0.5) * (ice ? 1 : 0.9 + Math.sin(race.time * 20 + f.pos.x) * 0.1));
      if (ice && f.mesh.position.distanceTo(camera.position) < 120 && Math.random() < 0.3) {
        race.particles.emit(1, { pos: f.pos, spread: 1, vel: new V3(0, 2, 0), color: 0xeaffff, life: 0.6, size: [0.6, 0.1], drag: 1, jitter: 5 });
      } else if (!ice && f.mesh.position.distanceTo(camera.position) < 120 && Math.random() < 0.5) {
        race.particles.emit(1, { pos: f.pos, spread: 1.5, vel: new V3(0, 6, 0), color: c => c.setHSL(0.03 + Math.random() * 0.08, 1, 0.55),
          life: 0.5, size: [1.6, 0.3], drag: 1, jitter: 4 });
      }
      for (const r of race.racers) {
        if (!r.auth || r === f.owner || r.air) continue;
        const dx = r.pos.x - f.pos.x, dz = r.pos.z - f.pos.z;
        if (dx * dx + dz * dz < 3.2 * 3.2 && Math.abs(r.pos.y - f.pos.y) < 2) { if (ice) r.applyIce(); else r.applyBurn(); }
      }
      if (f.life <= 0) { f.dead = true; race.scene.remove(f.mesh); }
    }
    race.fires = race.fires.filter(f => !f.dead);
    // Storm Wind shoves everyone close by; Mega Thruster knocks aside whoever it touches
    for (const o of race.racers) {
      if (o.stage !== 4 || (o.def.ult !== 'storm' && o.def.ult !== 'thruster')) continue;
      for (const r of race.racers) {
        if (r === o || !r.auth) continue;
        const d = r.pos.distanceTo(o.pos);
        if (o.def.ult === 'storm' && d < 12) r.knock(o, 2.2);
        else if (o.def.ult === 'thruster' && d < 3.6) r.knock(o, 5);
      }
    }
    for (const b of race.bolts) {
      b.t += dt;
      const f = Math.max(0, 1 - b.t / b.life) * (Math.random() < 0.3 ? 0.35 : 1);   // fade with a flicker
      b.mats[0].opacity = f; b.mats[1].opacity = f * 0.45;
      if (b.t > b.life) { b.dead = true; race.scene.remove(b.obj); b.mats.forEach(m => m.dispose()); }
    }
    race.bolts = race.bolts.filter(b => !b.dead);
    // mines
    for (const m of race.mines) {
      m.immune -= dt; m.life -= dt; m.t += dt;
      m.mesh.rotation.y += dt;
      // warning blink: beacon flashes, crate glows red and the ring pulses out, about twice a second
      const on = (m.t * 2.2) % 1 < 0.5, f = (m.t * 2.2) % 1;
      m.beacon.visible = on;
      m.crateMat.emissiveIntensity = on ? 0.55 : 0;
      m.ring.scale.setScalar(1 + f * 0.5); m.ring.material.opacity = 0.8 * (1 - f);
      for (const r of race.racers) {
        if (!r.auth || (r === m.owner && m.immune > 0) || veiled(r)) continue;
        if (r.pos.distanceTo(m.pos) < MINE_HIT) {
          r.takeHit('spin'); m.dead = true; explode(m.pos.clone(), 6, 0xff5020);
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
    race = { scene, track, racers: [], boxes: [], projectiles: [], mines: [], effects: [], fires: [], bolts: [], time: 0, phase: 'countdown', cd: 4.2, stats: {},
      shake: 0, flash: 0, paused: false, standingsT: 0, finishT: 0, camPos: null, camLook: null,
      online: !!grid && PB.net.connected(), pidSeq: 0, netT: 0, start: { state: 'wait' } };
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
        { ctrl: mine ? 'local' : g.bot ? 'bot' : 'remote', netId: g.id, name: (g.tier ? g.tier + ' ' : '') + (g.name || def.name) });
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
    const ps = PB.pass.recordRace({ place: p.place, online, stats: race.stats });
    $('res-coins').innerHTML = `ได้รับ <b>🪙 +${coins + ps.coins}</b> <b class="xp">+${ps.xp} XP</b> <span>รวม 🪙 ${PB.shop.coins.toLocaleString()}</span>`;
    $('res-pass').innerHTML = (ps.tierAfter > ps.tierBefore ? `<div class="tier-up">🎟️ Season Pass ขึ้น TIER ${ps.tierAfter}!${PB.pass.pending() ? ' ไปรับรางวัลได้เลย' : ''}</div>` : '') +
      ps.completed.map(t => `<div>✅ ภารกิจสำเร็จ: ${t}</div>`).join('');
    updatePassBadge();
    $('btn-again').textContent = race.ranked ? 'Ranked อีกรอบ' : online ? (PB.net.isHost() ? 'กลับล็อบบี้ (ทุกคน)' : 'กลับล็อบบี้') : 'แข่งอีกครั้ง';
    $('btn-tracks').classList.toggle('hidden', online || !!race.ranked);
    $('btn-chars').classList.toggle('hidden', online || !!race.ranked);
    renderRankedResult();
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
      setText('hud-item-name', it ? it.name + (vin.touch ? '' : ' [E]') : '');
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
    const bstate = p.stage > 0 ? 'on' : p.gauge >= 100 ? (p.def.ult && p.ult >= 100 ? 'full ult' : 'full') : p.gauge >= BOOST_MIN ? 'part' : 'low';
    if (bstate !== hudCache.bstate) {
      hudCache.bstate = bstate;
      const tb = document.querySelector('.t-boost');
      tb.className = 't-btn t-boost ' + bstate;
      tb.innerHTML = { 'full ult': 'BOOST<small>Lv.1→4 ★</small>', full: 'BOOST<small>Lv.1→3</small>', part: 'BOOST<small>Lv.1</small>', low: 'BOOST<small>ชาร์จ</small>', on: 'BOOST' }[bstate];
    }
    for (let i = 1; i <= 4; i++) panel.classList.toggle('lv' + i, p.stage === i);
    // ultimate meter (only for characters that have a Lv.4)
    const ult = p.def.ult && ULTS[p.def.ult];
    panel.classList.toggle('has-ult', !!ult);
    if (ult) {
      $('hud-ult').style.width = (p.stage === 4 ? (p.stageTimer / ULT_TIME) * 100 : p.ult) + '%';
      $('hud-ult').style.background = '#' + new THREE.Color(ult.color).getHexString();
      panel.classList.toggle('ult-ready', p.ult >= 100 && p.stage < 4);
      setText('hud-ult-name', p.ult >= 100 && p.stage < 4 ? `★ ${ult.name} พร้อม` : `★ ${ult.name}`);
    }
    panel.querySelectorAll('.boost-lv i').forEach(e => e.classList.toggle('on', +e.dataset.lv <= p.stage));
    if (p.stage > 0) {
      setText('hud-boost-state', p.stage === 4 ? `★ ULTIMATE: ${ult.name}!` : p.boostMax === 1 ? 'BOOST Lv.1' : p.stage < 3 ? `BOOST Lv.${p.stage} → Lv.${p.stage + 1}`
        : ult && p.ult >= 100 ? 'MAX BOOST!! → ★ Lv.4' : 'MAX BOOST!!');
      setText('hud-boost-count', String(Math.ceil(p.stageTimer)));
    } else {
      setText('hud-boost-state', p.gauge >= 100 ? (vin.touch ? 'พร้อมแล้ว! กด BOOST' : 'พร้อมแล้ว! กด SHIFT')
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
    u.uChroma.value += ((p.stage >= 3 ? 1 : p.stage === 2 ? 0.35 : 0) - u.uChroma.value) * Math.min(1, 5 * dt);
    // Fast Blur only at MAX BOOST: snaps in quickly, fades out a little slower when the boost ends
    const fast = p.stage >= 3 ? 0.85 + Math.min(Math.abs(p.speed), 140) / 140 * 0.15 : 0;
    u.uFast.value += (fast - u.uFast.value) * Math.min(1, (fast > u.uFast.value ? 6 : 3) * dt);
    if (p.stage === 4) tintCol.setHex(ULTS[p.def.ult].color);
    else if (p.stage === 3) tintCol.setHSL((race.time * 0.8) % 1, 1, 0.55);
    else if (p.stage > 0) tintCol.setHex(BOOST_COLORS[p.stage]);
    else if (p.turbo > 0) tintCol.setHex(0xff8a20);
    if (p.stage > 0 || p.turbo > 0) u.uTint.value.lerp(tintCol, Math.min(1, 10 * dt));
    const amt = p.stage > 0 ? 0.12 + p.stage * 0.07 : p.turbo > 0 ? 0.12 : 0;
    u.uTintAmt.value += (amt - u.uTintAmt.value) * Math.min(1, 6 * dt);
    const lineCol = p.stage >= 3 ? tintCol : p.stage > 0 ? BOOST_COLORS[p.stage] : 0xffffff;
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
        if (menu.drag == null) { menu.yaw += menu.spin * dt; menu.spin *= Math.exp(-2.5 * dt); }   // fling coasts to a stop
        menu.model.root.rotation.y = menu.yaw;
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
      const onLeft = state.screen === 'title';   // title menu sits on the left, so the racer stands on the right
      camera.fov = 45; camera.updateProjectionMatrix();
      camera.position.set(0, 3.2, 10.5);
      camera.lookAt(window.innerWidth > 560 ? (onRight ? 3.2 : onLeft ? -2.8 : 0) : 0, 1.6, 0);
      post.bloom.strength = 0.6; post.bloom.radius = 0.5; post.bloom.threshold = 0.93;
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
      // perfect start: press GO right as "GO!" shows (a press earlier in the countdown is a false start)
      if (gasHit() && race.start.state === 'wait') {
        race.start.state = race.cd > 1 + START_EARLY ? 'early' : 'hit';
        if (race.start.state === 'early') bigMsg('เร็วไป!', true);
      }
      if (race.cd <= 1) {
        race.phase = 'race';
        bigMsg('GO!', true); audio.sfx('go');
        if (race.start.state === 'hit') { race.start.state = 'done'; race.player.startBoost(); }
        // bots get a perfect start now and then (more often on harder difficulties)
        for (const r of race.racers) if (r.ctrl === 'bot' && r.auth && Math.random() < 0.15 + state.diff * 0.1) r.startBoost();
      }
    } else if (race.start.state === 'wait' && race.time <= START_LATE) {
      if (gasHit()) { race.start.state = 'done'; race.player.startBoost(); }
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
    if (inviteCode) { state.mode = 'online'; goScreen('online'); $('on-code').value = inviteCode; connectAnd({ t: 'join', code: inviteCode }); }
  })();
})();
