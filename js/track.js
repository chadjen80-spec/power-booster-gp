// Track definitions + procedural track/scenery builder
(function () {
  const PB = window.PB = window.PB || {};
  const V3 = THREE.Vector3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const D = n => Math.max(1, Math.round(n * PB.quality.density));   // scenery amount for the chosen graphics quality

  PB.TRACKS = [
    { id: 'cove', name: 'Coral Cove', th: 'อ่าวปะการัง', desc: 'เกาะทรายริมทะเลเขตร้อน โค้งกว้าง เหมาะกับมือใหม่', theme: 'cove', width: 20, scale: 1.6,
      pts: [[0, 0, 0], [150, 0, -20], [260, 4, -120], [280, 10, -260], [200, 12, -360], [60, 6, -340], [-20, 2, -240], [-120, 0, -200],
        [-240, 5, -260], [-330, 9, -160], [-300, 4, -20], [-200, 0, 60], [-80, 0, 40]] },
    { id: 'neon', name: 'Neon Highway', th: 'ทางด่วนนีออน', desc: 'เมืองไซเบอร์ยามค่ำคืน ทางยกระดับ และทางตรงยาวสำหรับ Booster', theme: 'neon', width: 20, scale: 1.6,
      pts: [[0,0,0],[230,0,0],[340,6,-50],[360,16,-180],[300,24,-260],[180,26,-250],[100,22,-320],[-20,16,-390],[-160,12,-380],
        [-220,18,-290],[-160,24,-200],[-60,20,-210],[-20,12,-140],[-100,6,-80],[-250,4,-120],[-360,6,-60],[-330,0,40],[-180,0,40]] },
    { id: 'volcano', name: 'Volcano Rush', th: 'ภูเขาไฟเดือด', desc: 'หุบเขาลาวาร้อนระอุ ขึ้นลงเนินและโค้งหักศอก', theme: 'volcano', width: 19, scale: 1.6,
      pts: [[0,0,0],[170,6,20],[280,14,-30],[290,24,-140],[200,30,-180],[150,34,-260],[240,40,-340],[350,44,-330],[400,38,-430],
        [300,32,-520],[150,30,-480],[40,26,-400],[-60,22,-460],[-190,16,-440],[-240,12,-330],[-160,8,-250],[-260,6,-160],[-370,4,-120],
        [-380,2,-10],[-260,0,50],[-120,0,40]] },
    { id: 'sky', name: 'Cloud Kingdom', th: 'อาณาจักรเมฆ', desc: 'ถนนลอยฟ้าเหนือทะเลเมฆ กระโดดข้ามช่องว่างระหว่างเกาะลอยฟ้า', theme: 'sky', width: 19, scale: 1.6,
      pts: [[0,40,0],[180,44,-10],[300,52,-90],[310,62,-220],[220,66,-290],[260,60,-400],[380,54,-470],[340,48,-590],[200,44,-600],
        [100,50,-520],[0,58,-560],[-120,64,-620],[-250,60,-560],[-240,52,-440],[-130,46,-400],[-110,42,-300],[-210,48,-240],
        [-350,54,-260],[-430,50,-150],[-380,44,-30],[-250,40,40],[-110,40,40]] },
    { id: 'snow', name: 'Frost Peak', th: 'ยอดเขาน้ำแข็ง', desc: 'ภูเขาหิมะใต้แสงออโรร่า ถนนน้ำแข็งลื่น ระวังรอยแยก', theme: 'snow', width: 20, scale: 1.8,
      pts: [[0,0,0],[160,4,10],[260,10,-40],[280,16,-140],[200,20,-200],[220,24,-300],[330,20,-330],[420,14,-420],[380,10,-540],
        [250,8,-580],[150,12,-500],[60,18,-560],[-40,24,-640],[-170,26,-620],[-200,22,-520],[-110,18,-460],[-150,14,-370],
        [-270,10,-400],[-370,8,-330],[-360,6,-220],[-250,4,-170],[-300,2,-70],[-260,0,30],[-120,0,40]] },
  ];

  // Ramps, gaps and holes, placed by lap fraction (kept clear of item boxes at .1/.35/.6/.85 and boost pads at .27/.52/.76).
  // jump: ramp across the road, then a gap of `gap` units (0 = just air time). hole: round pit at lateral `lat` (fraction of width).
  const FEATURES = {
    cove: [{ type: 'jump', at: 0.19, gap: 22 }, { type: 'jump', at: 0.68, gap: 0 }],
    neon: [{ type: 'jump', at: 0.165, gap: 28 }, { type: 'jump', at: 0.43, gap: 0 }, { type: 'jump', at: 0.70, gap: 24 }],
    volcano: [{ type: 'jump', at: 0.065, gap: 24 }, { type: 'jump', at: 0.425, gap: 22 }, { type: 'jump', at: 0.57, gap: 0 }, { type: 'jump', at: 0.722, gap: 26 }],
    sky: [{ type: 'jump', at: 0.118, gap: 26 }, { type: 'jump', at: 0.36, gap: 26 }, { type: 'jump', at: 0.44, gap: 0 }, { type: 'jump', at: 0.69, gap: 24 },
      { type: 'jump', at: 0.79, gap: 0 }, { type: 'jump', at: 0.93, gap: 22 }],
    snow: [{ type: 'jump', at: 0.055, gap: 0 }, { type: 'jump', at: 0.335, gap: 20 }, { type: 'jump', at: 0.44, gap: 22 }, { type: 'jump', at: 0.71, gap: 20 }, { type: 'jump', at: 0.93, gap: 0 }],
  };
  const RAMP_LEN = 4, RAMP_H = 2;   // ramp length in samples (2.5u each) and lip height

  const THEMES = {
    cove: { fog: 0xcdeeff, fogNear: 220, fogFar: 1300, hemi: [0xdff4ff, 0xc8a870, 0.75], sun: [0xfff4dd, 0.9],
      dome: { top: 0x2f7fe0, horizon: 0xcdeeff, bottom: 0x1a8ab0, sunDir: [0.35, 0.55, -0.75], sunColor: 0xfff0c0, cloud: 1, cloudColor: 0xffffff },
      bloom: [0.35, 0.5, 0.86], grade: { sat: 1.15, contrast: 1.05 },
      road: { base: '#a98a64', edge: '#ffffff', curbA: '#ff4a4a', curbB: '#ffffff', dash: '#ffffff', glow: 0, pattern: 'pavers' }, rail: 0xff6a8a, ground: -3,
      wall: { base: '#efe0c0', trim: '#ff6a8a', light: 0x5ad8ff }, lamp: { pole: 0x8a5a30, head: 0xffa030 },
      tunnel: { at: 0.5, len: 60, shell: '#6a5040', ring: 0xff8a50 } },
    neon: { fog: 0x2a0a48, fogNear: 140, fogFar: 1000, hemi: [0x8a7aff, 0x201040, 0.6], sun: [0xc0a0ff, 0.5],
      dome: { top: 0x04010f, horizon: 0x5a1a80, bottom: 0x0a0418, sunDir: [0, 0.1, -1], sunColor: 0xff3ad0, stars: 1, retro: 1 },
      bloom: [1.0, 0.6, 0.7], grade: { sat: 1.2, contrast: 1.1 },
      road: { base: '#16122c', edge: '#22f0ff', curbA: '#ff3ad0', curbB: '#16122c', dash: '#ff3ad0', glow: 1, pattern: 'grid' }, rail: 0x22f0ff, ground: -0.6,
      wall: { base: '#2a1a4a', trim: '#ff3ad0', light: 0x22f0ff }, lamp: { pole: 0x2a2440, head: 0xff3ad0 },
      tunnel: { at: 0.37, len: 70, shell: '#1a1036', ring: 0x22f0ff } },
    volcano: { fog: 0xd0603a, fogNear: 150, fogFar: 1000, hemi: [0xffb080, 0x401010, 0.65], sun: [0xffc090, 0.85],
      dome: { top: 0x2a0818, horizon: 0xff7a3a, bottom: 0x3a0c08, sunDir: [-0.5, 0.1, -0.85], sunColor: 0xffa050, sunSize: 300, cloud: 0.7, cloudColor: 0x4a2020 },
      bloom: [0.8, 0.55, 0.75], grade: { sat: 1.15, contrast: 1.08 },
      road: { base: '#3a302c', edge: '#ff8a20', curbA: '#ffd23a', curbB: '#2a2020', dash: '#ffb040', glow: 0.9, pattern: 'basalt' }, rail: 0xff6a10, ground: -0.6,
      wall: { base: '#3a2a26', trim: '#ff6a10', light: 0xff5a10 }, lamp: { pole: 0x2a1a16, head: 0xff6a10 },
      tunnel: { at: 0.47, len: 60, shell: '#2a1a16', ring: 0xff5a10 },
      hole: ['#ffe060', '#ff6010', '#801000'] },
    sky: { fog: 0xffe6f5, fogNear: 250, fogFar: 1400, hemi: [0xeaf2ff, 0x8aa0d0, 0.62], sun: [0xfff6e0, 0.7], floating: true,
      dome: { top: 0x4aa0ff, horizon: 0xffe6f5, bottom: 0xffffff, sunDir: [0.4, 0.45, -0.8], sunColor: 0xfff0d0, cloud: 0.9, cloudColor: 0xffffff },
      bloom: [0.15, 0.4, 0.97], grade: { sat: 1.15, contrast: 1.08 },
      road: { base: '#8e8478', edge: '#ffd23a', curbA: '#ffd23a', curbB: '#ffffff', dash: '#ffffff', glow: 0, pattern: 'marble' }, rail: 0xffd23a, ground: -60,
      wall: { base: '#e8e2d8', trim: '#ffd23a', light: 0x9ad8ff }, lamp: { pole: 0xd4a830, head: 0xbfe8ff },
      tunnel: { at: 0.55, len: 50, shell: '#f4efe6', ring: 0xffd23a, open: true },
      hole: ['#ffffff', '#bfe4ff', '#7ab8ff'] },
    snow: { fog: 0x9cc4e8, fogNear: 180, fogFar: 1100, hemi: [0xdfefff, 0x8090b0, 0.8], sun: [0xe8f4ff, 0.7], grip: 7,
      dome: { top: 0x061230, horizon: 0x7ab0e0, bottom: 0xdfefff, sunDir: [-0.3, 0.25, -0.9], sunColor: 0xcfe8ff, sunSize: 500, stars: 0.8, aurora: 1 },
      bloom: [0.3, 0.5, 0.9], grade: { sat: 1.1, contrast: 1.06 },
      road: { base: '#7a8ca4', edge: '#ffffff', curbA: '#22aaff', curbB: '#ffffff', dash: '#e0f0ff', glow: 0.6, pattern: 'ice' }, rail: 0x6adcff, ground: -0.6,
      wall: { base: '#cfe4f4', trim: '#6adcff', light: 0x6adcff }, lamp: { pole: 0x8aa0c0, head: 0x9ae8ff },
      tunnel: { at: 0.39, len: 60, shell: '#9ac8e8', ring: 0x6adcff },
      hole: ['#0a1a40', '#1a4a8a', '#6adcff'] },
  };
  // hole look per theme: [center, middle, rim] (default: dark pit)
  const HOLE_DEFAULT = ['#000000', '#100820', '#3a2a5a'];

  function makeCurve(def) {
    const pts = def.pts.map(p => new V3(p[0] * def.scale, p[1], p[2] * def.scale));
    return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  }

  // Points for menu minimap previews
  PB.trackPreview = function (def, n) {
    return makeCurve(def).getSpacedPoints(n || 200);
  };

  // Road surface: a color map plus a separate glow map (black = no glow) so only markings light up.
  // The 512px tile spans the full road width (~43u) across and 26u along, so shapes are drawn ~1.65x taller than wide.
  function roadTexture(r) {
    const S = 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = document.createElement('canvas'); g.width = g.height = S;
    const x = c.getContext('2d'), gx = g.getContext('2d');
    gx.fillStyle = '#000'; gx.fillRect(0, 0, S, S);
    x.fillStyle = r.base; x.fillRect(0, 0, S, S);
    const shade = (a) => `rgba(${a > 0 ? '255,255,255' : '0,0,0'},${Math.abs(a)})`;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const L = 26, R = S - 26;   // inside the curbs

    if (r.pattern === 'pavers') {          // sandstone pavers with grout
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
        const w = (R - L) / 6, h = S / 4, ox = row % 2 ? w / 2 : 0;
        const px = L + col * w + ox - (row % 2 && col === 5 ? w : 0);
        x.fillStyle = shade(rnd(-0.1, 0.08)); x.fillRect(px + 2, row * h + 2, w - 4, h - 4);
        x.strokeStyle = 'rgba(60,40,20,0.45)'; x.lineWidth = 3; x.strokeRect(px + 1, row * h + 1, w - 2, h - 2);
      }
    } else if (r.pattern === 'grid') {     // dark metal panels with a glowing circuit grid
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
        const w = (R - L) / 4, h = S / 4;
        x.fillStyle = shade(rnd(0.02, 0.07)); x.fillRect(L + col * w + 4, row * h + 4, w - 8, h - 8);
      }
      gx.strokeStyle = 'rgba(34,240,255,0.35)'; gx.lineWidth = 2;
      for (let k = L; k <= R; k += 30) { gx.beginPath(); gx.moveTo(k, 0); gx.lineTo(k, S); gx.stroke(); }
      for (let k = 0; k < S; k += 48) { gx.beginPath(); gx.moveTo(L, k); gx.lineTo(R, k); gx.stroke(); }
      gx.strokeStyle = r.dash; gx.lineWidth = 8;   // chevrons down the middle
      for (let k = 0; k < 2; k++) { const y = 90 + k * 256; gx.beginPath(); gx.moveTo(S / 2 - 50, y + 60); gx.lineTo(S / 2, y); gx.lineTo(S / 2 + 50, y + 60); gx.stroke(); }
    } else if (r.pattern === 'basalt') {   // dark stone slabs with glowing lava cracks
      for (let k = 0; k < 2200; k++) { x.fillStyle = shade(rnd(-0.12, 0.06)); x.fillRect(rnd(0, S), rnd(0, S), rnd(2, 6), rnd(2, 6)); }
      gx.strokeStyle = 'rgba(255,110,20,0.9)'; gx.lineCap = 'round';
      for (let k = 0; k < 9; k++) {
        let px = rnd(L, R), py = rnd(0, S);
        gx.lineWidth = rnd(2, 5); gx.beginPath(); gx.moveTo(px, py);
        for (let s = 0; s < 6; s++) { px += rnd(-30, 30); py += rnd(15, 45); gx.lineTo(px, py); }
        gx.stroke();
      }
      x.globalCompositeOperation = 'lighter'; x.drawImage(g, 0, 0); x.globalCompositeOperation = 'source-over';   // add the glow lines on top
    } else if (r.pattern === 'marble') {   // marble slabs with veins and gold inlay
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
        const w = (R - L) / 3, h = S / 2;
        x.fillStyle = shade(rnd(-0.04, 0.08)); x.fillRect(L + col * w, row * h, w, h);
      }
      x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 2;
      for (let k = 0; k < 14; k++) { x.beginPath(); x.moveTo(rnd(L, R), rnd(0, S)); x.bezierCurveTo(rnd(L, R), rnd(0, S), rnd(L, R), rnd(0, S), rnd(L, R), rnd(0, S)); x.stroke(); }
      x.strokeStyle = '#d4a830'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(R - 40, S / 2); x.lineTo(S / 2, S); x.lineTo(L + 40, S / 2); x.closePath(); x.stroke();
      for (let k = 1; k < 3; k++) { x.beginPath(); x.moveTo(L + k * (R - L) / 3, 0); x.lineTo(L + k * (R - L) / 3, S); x.stroke(); }
    } else if (r.pattern === 'ice') {      // packed ice with frost patches and faint glowing cracks
      for (let k = 0; k < 40; k++) {
        const gr = x.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.save(); x.translate(rnd(0, S), rnd(0, S)); x.scale(rnd(20, 60), rnd(30, 90)); x.fillStyle = gr; x.fillRect(-1, -1, 2, 2); x.restore();
      }
      gx.strokeStyle = 'rgba(120,220,255,0.5)'; gx.lineWidth = 2;
      for (let k = 0; k < 10; k++) {
        let px = rnd(L, R), py = rnd(0, S); gx.beginPath(); gx.moveTo(px, py);
        for (let s = 0; s < 4; s++) { px += rnd(-40, 40); py += rnd(-40, 40); gx.lineTo(px, py); }
        gx.stroke();
      }
      x.globalCompositeOperation = 'lighter'; x.drawImage(g, 0, 0); x.globalCompositeOperation = 'source-over';   // add the glow lines on top
    }
    // fine grain on everything
    for (let k = 0; k < 3000; k++) { x.fillStyle = shade(rnd(-0.05, 0.05)); x.fillRect(rnd(0, S), rnd(0, S), 2, 2); }

    // rumble curbs, edge lines and lane dashes (glowing on night tracks)
    for (let k = 0; k < 8; k++) {
      x.fillStyle = k % 2 ? r.curbA : r.curbB;
      x.fillRect(0, k * 64, 20, 64); x.fillRect(S - 20, k * 64, 20, 64);
    }
    for (const ctx of r.glow ? [x, gx] : [x]) {
      ctx.fillStyle = r.edge; ctx.fillRect(22, 0, 6, S); ctx.fillRect(S - 28, 0, 6, S);
      ctx.fillStyle = r.dash;
      for (const lx of [L + (R - L) / 3, L + 2 * (R - L) / 3]) { ctx.fillRect(lx - 3, 0, 6, 200); ctx.fillRect(lx - 3, 256, 6, 200); }
    }
    const tex = t => { const tt = new THREE.CanvasTexture(t); tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.anisotropy = 8; return tt; };
    return { map: tex(c), glow: tex(g) };
  }

  // Wall surface: panels with seams and bolts, u across the wall profile, v along the track
  function wallTexture(w) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = w.base; x.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 800; k++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.06})`; x.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 128, 4); x.fillRect(0, 128, 128, 4);   // panel seams
    x.fillStyle = w.trim; x.fillRect(52, 0, 24, 256);                                        // trim band along the rounded top
    x.fillStyle = 'rgba(0,0,0,0.3)';
    for (const by of [20, 108, 148, 236]) for (const bx of [12, 38]) { x.beginPath(); x.arc(bx, by, 3, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  }

  function textTexture(text, bg, fg, w, h) {
    const c = document.createElement('canvas'); c.width = w || 1024; c.height = h || 128;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.font = `italic 900 ${c.height * 0.62}px Orbitron, Kanit, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = fg; x.shadowBlur = 16;
    x.fillStyle = fg; x.fillText(text, c.width / 2, c.height / 2 + 4);
    return new THREE.CanvasTexture(c);
  }

  // Ribbon along the track at a lateral offset; used for road and walls
  // skip(i): leave out the segment between samples i and i+1 (gaps in the road)
  function ribbon(samples, N, fnA, fnB, vScale, skip) {
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i <= N; i++) {
      const s = samples[i % N];
      if (i > 0) dist += samples[i % N].p.distanceTo(samples[(i - 1) % N].p);
      const a = fnA(s), b = fnB(s);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uv.push(0, dist / vScale, 1, dist / vScale);
      if (i < N && !(skip && skip(i))) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Sweep a cross-section along consecutive samples. profile(s) returns the section's points (same count every time).
  function sweep(samples, N, indices, profile, vScale, skip) {
    const pos = [], uv = [], idx = [];
    let P = 0, dist = 0;
    indices.forEach((i, r) => {
      const s = samples[i % N];
      if (r > 0) dist += s.p.distanceTo(samples[indices[r - 1] % N].p);
      const pts = profile(s);
      P = pts.length;
      let len = 0;
      const lens = pts.map((p, k) => (k ? (len += p.distanceTo(pts[k - 1])) : 0));
      pts.forEach((p, k) => { pos.push(p.x, p.y, p.z); uv.push(lens[k] / (len || 1), dist / vScale); });
      if (r < indices.length - 1 && !(skip && skip(i))) {
        for (let k = 0; k < P - 1; k++) {
          const a = r * P + k, b = a + 1, c = a + P, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  PB.buildTrack = function (def, scene) {
    const th = THEMES[def.theme];
    const W = def.width;
    const curve = makeCurve(def);
    const length = curve.getLength();
    const N = Math.floor(length / 2.5);
    const samples = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const flat = new V3(t.x, 0, t.z).normalize();
      samples.push({ p, t, flat, n: new V3(flat.z, 0, -flat.x), curv: 0 });
    }
    for (let i = 0; i < N; i++) {
      const a = samples[i].flat, b = samples[(i + 8) % N].flat;
      samples[i].curv = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z); // signed heading change over ~20u
    }

    // --- jumps, gaps and holes ---
    const gaps = [], ramps = [], holes = [];
    for (const f of FEATURES[def.theme] || []) {
      const i0 = Math.floor(f.at * N);
      if (f.type === 'jump') {
        ramps.push({ i0, i1: i0 + RAMP_LEN });
        if (f.gap > 0) { const g0 = i0 + RAMP_LEN + 2; gaps.push({ i0: g0, i1: g0 + Math.ceil(f.gap / 2.5) }); }
      } else {
        const s = samples[i0];
        holes.push({ idx: i0, lat: f.lat * W, r: f.r, pos: s.p.clone().addScaledVector(s.n, f.lat * W) });
      }
    }
    const inGap = i => gaps.some(g => i >= g.i0 && i < g.i1);   // segment i..i+1 has no road

    const group = new THREE.Group();
    scene.add(group);

    // --- environment ---
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    const sky = PB.fx.makeSky(th.dome);
    sky.userData.keep = true;   // follows the camera every frame
    group.add(sky);
    // shadow light comes from the sky's sun, kept high enough for readable shadows
    const sd = th.dome.sunDir;
    const sunOffset = new V3(sd[0], Math.max(sd[1], 0.6), sd[2]).normalize().multiplyScalar(110);
    const hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]);
    group.add(hemi);
    const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
    sun.castShadow = PB.quality.shadows;
    sun.shadow.mapSize.set(PB.quality.shadowSize, PB.quality.shadowSize);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0005;
    group.add(sun); group.add(sun.target);

    // --- road ---
    const tex = roadTexture(th.road);
    const roadMat = new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.8, metalness: 0.1 });
    if (th.road.glow) { roadMat.emissive = new THREE.Color(0xffffff); roadMat.emissiveMap = tex.glow; roadMat.emissiveIntensity = th.road.glow; }
    const road = new THREE.Mesh(ribbon(samples, N,
      s => s.p.clone().addScaledVector(s.n, W + 1.5).add(new V3(0, 0.02, 0)),
      s => s.p.clone().addScaledVector(s.n, -W - 1.5).add(new V3(0, 0.02, 0)), 26, inGap), roadMat);
    road.receiveShadow = true;
    group.add(road);
    // underside so elevated roads look solid
    const under = new THREE.Mesh(ribbon(samples, N,
      s => s.p.clone().addScaledVector(s.n, -W - 1.5).add(new V3(0, -0.8, 0)),
      s => s.p.clone().addScaledVector(s.n, W + 1.5).add(new V3(0, -0.8, 0)), 26, inGap),
      new THREE.MeshLambertMaterial({ color: 0x2a2a38 }));
    group.add(under);

    // walls: chunky rounded barriers swept along the track, with a glowing light strip on the road side
    const wt = wallTexture(th.wall);
    const wallMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6, metalness: 0.15, side: THREE.DoubleSide });
    const stripMat = new THREE.MeshBasicMaterial({ color: th.wall.light, side: THREE.DoubleSide });
    const WALL = [[0, 0], [0, 1.5], [0.25, 2.05], [0.8, 2.3], [1.4, 2.05], [1.7, 1.5], [1.7, -0.8]];   // [outward, up] from the road edge
    const allIdx = Array.from({ length: N + 1 }, (_, i) => i);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(sweep(samples, N, allIdx,
        s => WALL.map(([o, y]) => s.p.clone().addScaledVector(s.n, side * (W + 1.5 + o)).add(new V3(0, y, 0))), 16, inGap), wallMat);
      wall.receiveShadow = true;
      group.add(wall);
      group.add(new THREE.Mesh(ribbon(samples, N,
        s => s.p.clone().addScaledVector(s.n, side * (W + 1.47)).add(new V3(0, 0.55, 0)),
        s => s.p.clone().addScaledVector(s.n, side * (W + 1.47)).add(new V3(0, 0.85, 0)), 10, inGap), stripMat));
    }

    // tunnel: arched shell with rings of light (Cloud Kingdom just gets golden arches)
    const tun = th.tunnel;
    const tunnel = { i0: Math.floor(tun.at * N), i1: Math.floor(tun.at * N) + tun.len };
    const inTunnel = i => i >= tunnel.i0 - 2 && i <= tunnel.i1 + 2;
    const TR = W + 3.2, TH = 12;
    if (!tun.open) {
      const shellTex = (() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 64;
        const x = c.getContext('2d');
        x.fillStyle = tun.shell; x.fillRect(0, 0, 256, 64);
        x.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 256; k += 32) x.fillRect(k, 0, 3, 64);
        x.fillStyle = '#' + new THREE.Color(tun.ring).getHexString();
        for (const k of [40, 128, 216]) x.fillRect(k - 3, 0, 6, 64);   // light strips running along the tunnel
        const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })();
      const shellMat = new THREE.MeshStandardMaterial({ map: shellTex, emissive: 0xffffff, emissiveMap: shellTex, emissiveIntensity: 0.25,
        roughness: 0.7, side: THREE.DoubleSide });
      const tIdx = []; for (let i = tunnel.i0; i <= tunnel.i1; i++) tIdx.push(i % N);
      const ARCH = Array.from({ length: 15 }, (_, k) => Math.PI * k / 14);
      group.add(new THREE.Mesh(sweep(samples, N, tIdx,
        s => ARCH.map(a => s.p.clone().addScaledVector(s.n, Math.cos(a) * TR).add(new V3(0, 2.2 + Math.sin(a) * TH, 0))), 12), shellMat));
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: tun.ring });
    const ringGeo = new THREE.TorusGeometry(1, 0.03, 6, 48, Math.PI);
    for (let i = tunnel.i0; i <= tunnel.i1; i += tun.open ? 10 : 5) {
      const s = samples[i % N];
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.scale.set(TR - 0.4, TH - 0.4, tun.open ? 40 : 18);
      ring.position.copy(s.p).add(new V3(0, 2.2, 0));
      ring.rotation.y = Math.atan2(s.flat.x, s.flat.z);
      group.add(ring);
    }

    // turn-warning chevron signs on the outside of sharp corners
    const signTex = dir => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 96;
      const x = c.getContext('2d');
      x.fillStyle = '#14101e'; x.fillRect(0, 0, 256, 96);
      x.fillStyle = '#' + new THREE.Color(th.rail).getHexString();
      for (let k = 0; k < 3; k++) {
        const bx = 40 + k * 70;
        x.beginPath();
        if (dir > 0) { x.moveTo(bx, 14); x.lineTo(bx + 34, 48); x.lineTo(bx, 82); x.lineTo(bx + 20, 82); x.lineTo(bx + 54, 48); x.lineTo(bx + 20, 14); }
        else { x.moveTo(bx + 54, 14); x.lineTo(bx + 20, 48); x.lineTo(bx + 54, 82); x.lineTo(bx + 34, 82); x.lineTo(bx, 48); x.lineTo(bx + 34, 14); }
        x.fill();
      }
      return new THREE.CanvasTexture(c);
    };
    const signMats = { '1': new THREE.MeshBasicMaterial({ map: signTex(1) }), '-1': new THREE.MeshBasicMaterial({ map: signTex(-1) }) };
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2a38 });
    const blocked = i => inGap(i) || inTunnel(i) || ramps.some(r => i >= r.i0 - 6 && i <= r.i1 + 12);
    for (let i = 10; i < N - 10; i += 3) {
      const s = samples[i];
      if (Math.abs(s.curv) < 0.22 || blocked(i)) continue;
      const ahead = samples[(i + 12) % N].p;
      const bend = Math.sign((ahead.x - s.p.x) * s.n.x + (ahead.z - s.p.z) * s.n.z);   // +1: road bends toward +n (left)
      const sign = new THREE.Group();
      sign.position.copy(s.p).addScaledVector(s.n, -bend * (W + 2.3)).add(new V3(0, 2.3, 0));
      // the board faces racers coming toward the corner; arrows point the way the road turns (+X on the board is the viewer's right)
      const board = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.6), signMats[bend > 0 ? '-1' : '1']);
      board.position.y = 2.6; sign.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(7.4, 3, 0.3), postMat); back.position.set(0, 2.6, -0.2); sign.add(back);
      for (const px of [-2.6, 2.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6), postMat); post.position.set(px, 0.6, -0.2); sign.add(post); }
      sign.lookAt(s.p.clone().addScaledVector(s.flat, -30).addScaledVector(s.n, bend * 6).add(new V3(0, 2.3, 0)));
      group.add(sign);
      i += 40;   // one sign per corner
    }

    // lamps along the top of both walls (instanced)
    const lampSpots = [];
    for (let i = 4; i < N; i += 16) if (!blocked(i)) for (const side of [-1, 1]) lampSpots.push({ s: samples[i], side });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.28, 5, 6), headGeo = new THREE.SphereGeometry(0.75, 12, 8);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: th.lamp.pole }), lampSpots.length);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: th.lamp.head }), lampSpots.length);
    const mtx = new THREE.Matrix4();
    lampSpots.forEach(({ s, side }, k) => {
      const base = s.p.clone().addScaledVector(s.n, side * (W + 2.3));
      poles.setMatrixAt(k, mtx.makeTranslation(base.x, base.y + 2.3 + 2.5, base.z));
      heads.setMatrixAt(k, mtx.makeTranslation(base.x, base.y + 2.3 + 5.3, base.z));
    });
    group.add(poles); group.add(heads);

    // pillars under elevated sections
    const pillarMat = new THREE.MeshLambertMaterial({ color: def.theme === 'neon' ? 0x2a2440 : 0x8a8478 });
    for (let i = 0; i < N; i += 14) {
      const s = samples[i];
      const h = s.p.y - th.ground;
      if (s.p.y < 3 || th.floating || inGap(i) || inGap(i - 1)) continue;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, h, 10), pillarMat);
      pil.position.set(s.p.x, th.ground + h / 2 - 0.8, s.p.z);
      group.add(pil);
    }

    // start / finish line + gate
    const s0 = samples[0];
    const startYaw = Math.atan2(s0.flat.x, s0.flat.z);
    const ck = document.createElement('canvas'); ck.width = 256; ck.height = 32;
    const cx = ck.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { cx.fillStyle = (i + j) % 2 ? '#fff' : '#111'; cx.fillRect(i * 8, j * 8, 8, 8); }
    const line = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 3, 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ck) }));
    line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, startYaw, 0);
    line.position.copy(s0.p).add(new V3(0, 0.05, 0));
    group.add(line);
    const gate = new THREE.Group();
    gate.position.copy(s0.p); gate.rotation.y = startYaw;
    const gateMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
    for (const sd of [-1, 1]) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 11, 1.4), gateMat);
      pl.position.set(sd * (W + 2.5), 5.5, 0); gate.add(pl);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 6.5, 2.6, 1.2), [gateMat, gateMat, gateMat, gateMat,
      new THREE.MeshBasicMaterial({ map: textTexture('POWER BOOSTER GP', '#120a30', '#22f0ff') }),
      new THREE.MeshBasicMaterial({ map: textTexture('POWER BOOSTER GP', '#120a30', '#ff3ad0') })]);
    banner.position.y = 10.2; gate.add(banner);
    // countdown lights hanging under the banner, facing the starting grid
    const housing = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 0.8), gateMat);
    housing.position.set(0, 7.6, -0.4); gate.add(housing);
    const startLights = [];
    for (let k = 0; k < 4; k++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2a0808 }));
      l.position.set(-3.6 + k * 2.4, 7.6, -0.9); l.userData.keep = true; gate.add(l);   // recolored during the countdown
      startLights.push(l);
    }
    group.add(gate);

    // boost pads
    const padCanvas = document.createElement('canvas'); padCanvas.width = 64; padCanvas.height = 128;
    const pc = padCanvas.getContext('2d');
    pc.fillStyle = '#ff8a00'; pc.fillRect(0, 0, 64, 128);
    pc.fillStyle = '#fff6a0';
    // arrows drawn pointing down: the plane's +V ends up facing backwards along the track
    for (let k = 0; k < 3; k++) { const y = 16 + k * 36; pc.beginPath(); pc.moveTo(8, y); pc.lineTo(32, y + 24); pc.lineTo(56, y); pc.lineTo(56, y + 12); pc.lineTo(32, y + 36); pc.lineTo(8, y + 12); pc.fill(); }
    const padTex = new THREE.CanvasTexture(padCanvas);
    const pads = [];
    for (const f of [0.27, 0.52, 0.76]) {
      const i = Math.floor(f * N), s = samples[i];
      for (const lat of [-W * 0.4, W * 0.4]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 9), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, opacity: 0.95 }));
        m.rotation.order = 'YXZ';
        m.rotation.set(-Math.PI / 2 + Math.asin(s.t.y), Math.atan2(s.flat.x, s.flat.z), 0);
        m.position.copy(s.p).addScaledVector(s.n, lat).add(new V3(0, 0.08, 0));
        group.add(m);
        pads.push({ idx: i, lat, mesh: m });
      }
    }

    // ramps: chevron-striped wedges across the road that follow its curve
    const chev = document.createElement('canvas'); chev.width = 128; chev.height = 128;
    const cx2 = chev.getContext('2d');
    cx2.fillStyle = '#1a1a24'; cx2.fillRect(0, 0, 128, 128);
    cx2.strokeStyle = '#ffd23a'; cx2.lineWidth = 14;
    for (let k = -1; k < 3; k++) { cx2.beginPath(); cx2.moveTo(0, 40 + k * 48); cx2.lineTo(64, 8 + k * 48); cx2.lineTo(128, 40 + k * 48); cx2.stroke(); }
    const chevTex = new THREE.CanvasTexture(chev);
    chevTex.wrapS = chevTex.wrapT = THREE.RepeatWrapping;
    const rampTopMat = new THREE.MeshStandardMaterial({ map: chevTex, emissive: 0xffffff, emissiveMap: chevTex, emissiveIntensity: 0.5, roughness: 0.6 });
    const rampSideMat = new THREE.MeshLambertMaterial({ color: 0x2a2a38, side: THREE.DoubleSide });
    for (const r of ramps) {
      const top = [], tuv = [], side = [];
      const pt = (k, lat, up) => { const s = samples[(r.i0 + k) % N]; return s.p.clone().addScaledVector(s.n, lat).add(new V3(0, up, 0)); };
      const hgt = k => RAMP_H * k / RAMP_LEN + 0.06;
      const quad = (arr, a, b, c, d) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
      const Wr = W + 1.4;
      for (let k = 0; k < RAMP_LEN; k++) {
        quad(top, pt(k, Wr, hgt(k)), pt(k, -Wr, hgt(k)), pt(k + 1, Wr, hgt(k + 1)), pt(k + 1, -Wr, hgt(k + 1)));
        const v0 = k / RAMP_LEN, v1 = (k + 1) / RAMP_LEN, u = Wr / 6;
        tuv.push(0, v0, u, v0, 0, v1, u, v0, u, v1, 0, v1);
        for (const sd of [Wr, -Wr]) quad(side, pt(k, sd, 0), pt(k, sd, hgt(k)), pt(k + 1, sd, 0), pt(k + 1, sd, hgt(k + 1)));
      }
      quad(side, pt(RAMP_LEN, Wr, 0), pt(RAMP_LEN, Wr, hgt(RAMP_LEN)), pt(RAMP_LEN, -Wr, 0), pt(RAMP_LEN, -Wr, hgt(RAMP_LEN)));
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
      tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
      tg.computeVertexNormals();
      const topMesh = new THREE.Mesh(tg, rampTopMat); topMesh.receiveShadow = true; group.add(topMesh);
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
      sg.computeVertexNormals();
      group.add(new THREE.Mesh(sg, rampSideMat));
    }
    // glowing warning edges at both ends of each gap
    const edgeMat = new THREE.MeshBasicMaterial({ color: th.rail });
    for (const g of gaps) {
      for (const i of [g.i0, g.i1]) {
        const s = samples[i % N];
        const e = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 3, 0.25, 0.7), edgeMat);
        e.position.copy(s.p).add(new V3(0, 0.05, 0)); e.rotation.y = Math.atan2(s.flat.x, s.flat.z);
        group.add(e);
      }
      if (def.theme === 'volcano') {   // a lava lake waits below
        const mid = samples[Math.floor((g.i0 + g.i1) / 2) % N];
        const lava = new THREE.Mesh(new THREE.CircleGeometry(40, 32), PB.fx.makeLavaMaterial());
        lava.rotation.x = -Math.PI / 2; lava.position.set(mid.p.x, -0.45, mid.p.z); group.add(lava);
      }
    }
    // holes: radial-gradient disc that reads as a deep pit, with a glowing rim
    const hc = th.hole || HOLE_DEFAULT;
    const hcv = document.createElement('canvas'); hcv.width = hcv.height = 128;
    const hx = hcv.getContext('2d');
    const hg = hx.createRadialGradient(64, 64, 0, 64, 64, 64);
    hg.addColorStop(0, hc[0]); hg.addColorStop(0.65, hc[1]); hg.addColorStop(0.92, hc[2]); hg.addColorStop(1, 'rgba(0,0,0,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 128, 128);
    const holeMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hcv), transparent: true, depthWrite: false });
    for (const h of holes) {
      const y = h.pos.y + 0.06;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(h.r + 0.6, 40), holeMat);
      disc.rotation.x = -Math.PI / 2; disc.position.set(h.pos.x, y, h.pos.z); group.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(h.r + 0.4, 0.16, 6, 40), edgeMat);
      rim.rotation.x = Math.PI / 2; rim.position.set(h.pos.x, y + 0.05, h.pos.z); group.add(rim);
    }

    // item box rows
    const boxSpots = [];
    for (const f of [0.1, 0.35, 0.6, 0.85]) {
      const i = Math.floor(f * N);
      for (const k of [-0.64, -0.32, 0, 0.32, 0.64]) boxSpots.push({ idx: i, lat: k * W });
    }

    // --- scenery ---
    const nearTrack = (x, z, minD) => {
      for (let i = 0; i < N; i += 3) {
        const p = samples[i].p, dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < minD * minD) return true;
      }
      return false;
    };
    const spot = (minOff, maxOff) => {
      for (let tries = 0; tries < 20; tries++) {
        const s = samples[Math.floor(Math.random() * N)];
        const off = (Math.random() < 0.5 ? -1 : 1) * (W + rand(minOff, maxOff));
        const x = s.p.x + s.n.x * off, z = s.p.z + s.n.z * off;
        if (!nearTrack(x, z, W + minOff * 0.8)) return { x, z, s };
      }
      return null;
    };
    buildScenery[def.theme](group, samples, N, W, spot, th, nearTrack);
    buildStructures(group, { samples, N, W, th, theme: def.theme, name: def.name, nearTrack, blocked, ramps });
    group.traverse(o => { if (o.material && o.material.uniforms && o.material.uniforms.fogColor) PB.fx.syncFog(o.material, scene.fog); });
    // thousands of static pieces -> a few hundred draw calls, chunked so off-screen parts are still culled
    const merge = PB.optimize.mergeStatic(group, 220);
    group.userData.mergeStats = merge;

    // --- query helpers ---
    function nearest(pos, hint) {
      let best = -1, bd = Infinity;
      if (hint == null || hint < 0) {
        for (let i = 0; i < N; i++) {
          const p = samples[i].p, d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + ((p.y - pos.y) * 2) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      }
      for (let k = -30; k <= 30; k++) {
        const i = ((hint + k) % N + N) % N;
        const p = samples[i].p, d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    const lateral = (pos, i) => { const s = samples[i]; return (pos.x - s.p.x) * s.n.x + (pos.z - s.p.z) * s.n.z; };
    // interpolated road height at pos near sample i
    function heightAt(pos, i) {
      const s = samples[i], nx = samples[(i + 1) % N], pv = samples[(i - 1 + N) % N];
      const along = (pos.x - s.p.x) * s.flat.x + (pos.z - s.p.z) * s.flat.z;
      const o = along >= 0 ? nx : pv;
      const f = Math.min(1, Math.abs(along) / 2.5);
      return s.p.y + (o.p.y - s.p.y) * f;
    }
    // what a racer stands on: road height (plus ramp slope), or nothing over a gap/hole
    function groundAt(pos, i) {
      let y = heightAt(pos, i), hole = false, ramp = null;
      for (const g of gaps) if (i > g.i0 && i < g.i1) hole = 'gap';
      for (const h of holes) {
        const dx = pos.x - h.pos.x, dz = pos.z - h.pos.z, r = h.r - 0.6;   // edge is a little forgiving
        if (dx * dx + dz * dz < r * r) hole = 'pit';
      }
      for (const r of ramps) {
        if (i < r.i0 - 1 || i > r.i1 + 1) continue;
        const s0 = samples[r.i0];
        const t = ((pos.x - s0.p.x) * s0.flat.x + (pos.z - s0.p.z) * s0.flat.z) / (RAMP_LEN * 2.5);
        if (t >= 0 && t <= 1) { y += RAMP_H * t; ramp = r; }
      }
      return { y, hole, ramp };
    }
    // closest sample at or behind i that is safe to respawn on
    function safeIdx(i) {
      let j = (i - 6 + N) % N;
      for (let n = 0; n < 60; n++) {
        const bad = gaps.some(g => j >= g.i0 - RAMP_LEN - 4 && j <= g.i1) || ramps.some(r => j >= r.i0 - 1 && j <= r.i1 + 1)
          || holes.some(h => h.idx - j > -4 && h.idx - j < 24);   // room to steer around before the next hole
        if (!bad) break;
        j = (j - 1 + N) % N;
      }
      return j;
    }

    // minimap bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    samples.forEach(s => { minX = Math.min(minX, s.p.x); maxX = Math.max(maxX, s.p.x); minZ = Math.min(minZ, s.p.z); maxZ = Math.max(maxZ, s.p.z); });

    return { def, samples, N, W, length, group, sun, sunOffset, sky, pads, boxSpots, nearest, lateral, heightAt, groundAt, safeIdx,
      gaps, ramps, holes, startLights,
      bounds: { minX, maxX, minZ, maxZ }, theme: th };
  };

  // ---------- trackside structures: gantries over the road, billboards, and themed buildings close to the walls ----------
  function buildStructures(group, c) {
    const { samples, N, W, th, nearTrack, blocked, ramps } = c;
    const yaw = s => Math.atan2(s.flat.x, s.flat.z);
    const hex = v => '#' + new THREE.Color(v).getHexString();
    const glowCol = th.wall.light, trimCol = new THREE.Color(th.wall.trim).getHex();
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(th.wall.base).multiplyScalar(0.55), roughness: 0.6, metalness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: trimCol, roughness: 0.5 });
    const lightMat = new THREE.MeshBasicMaterial({ color: glowCol });
    const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    const nearJump = i => ramps.some(r => { const d = (i - r.i0 + N) % N; return d > -8 && d < 45; });

    // overhead gantries with a glowing sign on both faces
    const signs = ['POWER BOOSTER GP', c.name.toUpperCase(), 'BOOST!', 'GO GO GO!'];
    [0.07, 0.31, 0.58, 0.82].forEach((f, k) => {
      let i = Math.floor(f * N);
      for (let t = 0; t < 60 && (blocked(i) || nearJump(i)); t++) i = (i + 3) % N;
      const s = samples[i], gt = new THREE.Group();
      gt.position.copy(s.p); gt.rotation.y = yaw(s);
      for (const sd of [-1, 1]) {
        box(1.8, 13, 1.8, darkMat, sd * (W + 4.5), 6.5 - 0.8, 0, gt);
        box(2.2, 0.5, 2.2, trimMat, sd * (W + 4.5), 12.3, 0, gt);
      }
      box(W * 2 + 11, 2.2, 1.6, darkMat, 0, 12.2, 0, gt);
      for (const z of [-0.85, 0.85]) box(W * 2 + 11, 0.25, 0.1, lightMat, 0, 11.15, z, gt);
      const sm = new THREE.MeshBasicMaterial({ map: textTex(signs[k % signs.length], hex(glowCol)) });
      for (const z of [-0.82, 0.82]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 2.6), sm);
        sign.position.set(0, 14.4, z); if (z < 0) sign.rotation.y = Math.PI; gt.add(sign);
        box(23, 3, 0.6, darkMat, 0, 14.4, z * 0.4, gt);
      }
      group.add(gt);
    });

    // roadside billboards on the straights, angled toward oncoming racers
    const bbTexts = ['POWER BOOSTER GP', 'JET SURF', 'BOOST x3', 'NITRO!', c.name.toUpperCase()];
    let placed = 0;
    for (let i = 30; i < N - 30 && placed < 8; i += 7) {
      const s = samples[i];
      if (Math.abs(s.curv) > 0.08 || blocked(i)) continue;
      const side = placed % 2 ? 1 : -1;
      const pos = s.p.clone().addScaledVector(s.n, side * (W + 8));
      if (nearTrack(pos.x, pos.z, W + 5)) continue;
      const bb = new THREE.Group();
      bb.position.set(pos.x, th.floating ? s.p.y - 1 : Math.max(th.ground, -1.5), pos.z);
      const baseY = (th.floating ? 0 : s.p.y - bb.position.y) + 5;
      for (const px of [-5, 5]) box(0.6, baseY + 3, 0.6, darkMat, px, (baseY + 3) / 2, -0.4, bb);
      box(17, 7, 0.8, darkMat, 0, baseY + 4, -0.5, bb);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: textTex(bbTexts[placed % bbTexts.length], hex(glowCol), hex(th.wall.trim)) }));
      face.position.set(0, baseY + 4, 0); bb.add(face);
      box(17, 0.3, 0.3, lightMat, 0, baseY + 7.6, 0, bb);
      bb.lookAt(s.p.clone().addScaledVector(s.flat, -50).setY(bb.position.y));
      group.add(bb);
      placed++; i += 50;
    }

    // themed buildings packed along both sides
    const kit = KITS[c.theme];
    for (let i = 0; i < N; i += 7) {
      if (blocked(i) || (c.theme === 'cove' && samples[i].p.y > 4)) continue;   // cove: only where there's an island to stand on
      for (const side of [-1, 1]) {
        if (Math.random() > 0.65 * PB.quality.density) continue;
        const s = samples[i], off = W + 3.5 + rand(4, 22);
        const x = s.p.x + s.n.x * side * off, z = s.p.z + s.n.z * side * off;
        if (nearTrack(x, z, off - 0.5)) continue;   // keep clear of other parts of the track
        const o = new THREE.Group();
        o.position.set(x, th.floating ? s.p.y - rand(1, 6) : th.ground === -3 ? -1.4 : th.ground, z);
        o.rotation.y = yaw(s) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);   // local +Z faces the road
        kit(o, { s, side, darkMat, trimMat, lightMat, box, roadY: s.p.y });
        group.add(o);
      }
    }
  }

  // box whose UVs repeat the texture (instead of a per-box texture.repeat), so boxes can share one material
  function tiledBox(w, h, d, ru, rv) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    return g;
  }

  function textTex(text, color, bg) {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384;
    const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 384);
    g.addColorStop(0, '#120a2a'); g.addColorStop(1, bg || '#2a0a3a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 384);
    x.strokeStyle = color; x.lineWidth = 12; x.strokeRect(14, 14, 996, 356);
    x.font = 'italic 900 120px Orbitron, Kanit, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 120; while (x.measureText(text).width > 920 && size > 50) { size -= 8; x.font = `italic 900 ${size}px Orbitron, Kanit, sans-serif`; }
    x.shadowColor = color; x.shadowBlur = 24; x.fillStyle = '#ffffff'; x.fillText(text, 512, 200);
    x.shadowBlur = 0; x.fillStyle = color; x.fillText(text, 512, 196);
    return new THREE.CanvasTexture(cv);
  }

  // One builder per theme. o: group placed beside the road, local +Z faces the road; y = 0 at the ground.
  const KITS = {
    neon(o, k) {   // dark towers with window lights and neon edge strips
      const w = rand(8, 16), d = rand(8, 16), h = rand(28, 85);
      const win = KITS._win || (KITS._win = (() => {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
        const x = cv.getContext('2d'); x.fillStyle = '#0a0818'; x.fillRect(0, 0, 64, 128);
        const cols = ['#22f0ff', '#ff3ad0', '#ffd23a', '#8a7aff'];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) if (Math.random() < 0.5) { x.fillStyle = cols[(Math.random() * 4) | 0]; x.globalAlpha = rand(0.4, 1); x.fillRect(i * 8 + 2, j * 8 + 2, 4, 4); }
        const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
      })());
      const towerMat = KITS._winMat || (KITS._winMat = new THREE.MeshLambertMaterial({ color: 0x1a1430, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.8 }));
      const t = new THREE.Mesh(tiledBox(w, h, d, w / 10, h / 20), towerMat);   // shared material so towers can be merged
      t.position.y = h / 2; o.add(t);
      const neon = new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? 0x22f0ff : 0xff3ad0 });
      for (const [sx, sz] of [[-1, 1], [1, 1]]) k.box(0.4, h, 0.4, neon, sx * w / 2, h / 2, sz * d / 2, o);
      k.box(w + 0.6, 0.6, d + 0.6, neon, 0, h * rand(0.5, 1), 0, o);
      if (Math.random() < 0.4) {   // hologram ring on the roof
        const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.45, 0.25, 6, 32), neon);
        ring.rotation.x = Math.PI / 2; ring.position.y = h + 3; o.add(ring);
      }
    },
    cove(o, k) {   // beach huts, lifeguard towers and umbrellas
      const r = Math.random();
      if (r < 0.45) {
        const wood = new THREE.MeshLambertMaterial({ color: 0xd8b080 }), thatch = new THREE.MeshLambertMaterial({ color: 0xc89a4a });
        k.box(7, 4.5, 6, wood, 0, 2.25, 0, o);
        k.box(1.6, 2.6, 0.2, k.darkMat, 0, 1.3, 3.05, o);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(6, 3.5, 4), thatch); roof.rotation.y = Math.PI / 4; roof.position.y = 6.2; roof.castShadow = true; o.add(roof);
      } else if (r < 0.7) {
        const white = new THREE.MeshLambertMaterial({ color: 0xffffff }), red = new THREE.MeshLambertMaterial({ color: 0xe03a3a });
        for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) k.box(0.3, 6, 0.3, white, x, 3, z, o);
        k.box(4, 2.6, 4, white, 0, 7.3, 0, o);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.8, 4), red); roof.rotation.y = Math.PI / 4; roof.position.y = 9.5; o.add(roof);
      } else {
        const cols = [0xff5a7a, 0x3ac8ff, 0xffd23a, 0x5ad65a];
        for (let u = 0; u < 3; u++) {
          const g = new THREE.Group(); g.position.set(rand(-5, 5), 0, rand(-3, 3)); o.add(g);
          k.box(0.15, 3.6, 0.15, new THREE.MeshLambertMaterial({ color: 0xffffff }), 0, 1.8, 0, g);
          const top = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.1, 8), new THREE.MeshLambertMaterial({ color: cols[(Math.random() * 4) | 0] }));
          top.position.y = 3.8; top.castShadow = true; g.add(top);
        }
      }
    },
    volcano(o, k) {   // canyon rock walls, with the odd glowing mining rig
      if (Math.random() < 0.7) {
        const rock = new THREE.MeshLambertMaterial({ color: 0x4a2e26 });
        for (let u = 0; u < 3; u++) {
          const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(4, 9)), rock);
          b.scale.y = rand(1.2, 2.6); b.position.set(rand(-6, 6), rand(2, 8), rand(-4, 2)); b.rotation.set(rand(0, 3), rand(0, 3), 0);
          b.castShadow = true; o.add(b);
        }
      } else {
        const metal = new THREE.MeshLambertMaterial({ color: 0x3a3030 });
        for (const x of [-3, 3]) for (const z of [-3, 3]) k.box(0.5, 16, 0.5, metal, x, 8, z, o);
        for (const y of [5, 10, 15]) k.box(6.6, 0.4, 6.6, metal, 0, y, 0, o);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 18, 10), k.lightMat); pipe.position.set(0, 9, 0); o.add(pipe);
      }
    },
    sky(o, k) {   // marble columns and little domed pavilions on floating slabs
      const marble = new THREE.MeshLambertMaterial({ color: 0xf2eee6 }), gold = new THREE.MeshLambertMaterial({ color: 0xe0b440 });
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(7, 4, 3, 10), new THREE.MeshLambertMaterial({ color: 0x9a8270 }));
      slab.position.y = -1.5; o.add(slab);
      if (Math.random() < 0.5) {
        for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 12), marble); col.position.set(x, 4.5, z); col.castShadow = true; o.add(col);
        }
        k.box(10, 0.8, 10, marble, 0, 9.4, 0, o);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.y = 9.8; o.add(dome);
      } else {
        const h = rand(8, 20);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, h, 14), marble); col.position.y = h / 2; col.castShadow = true; o.add(col);
        k.box(2.8, 0.8, 2.8, gold, 0, h + 0.4, 0, o);
      }
    },
    snow(o, k) {   // log cabins with snowy roofs, or clusters of ice spires
      if (Math.random() < 0.55) {
        const wood = new THREE.MeshLambertMaterial({ color: 0x7a4e2e }), snow = new THREE.MeshLambertMaterial({ color: 0xffffff });
        k.box(8, 4.5, 6, wood, 0, 2.25, 0, o);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 9, 3, 1), snow);
        roof.rotation.z = Math.PI / 2; roof.position.y = 5.6; roof.scale.y = 1; roof.castShadow = true; o.add(roof);
        k.box(0.9, 3, 0.9, new THREE.MeshLambertMaterial({ color: 0x5a4a4a }), 2.4, 7.5, -1, o);
        k.box(1.6, 1.4, 0.2, new THREE.MeshBasicMaterial({ color: 0xffd080 }), -2, 2.4, 3.05, o);   // lit window
      } else {
        const ice = new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x2a8aff, emissiveIntensity: 0.5, transparent: true, opacity: 0.85, roughness: 0.1 });
        for (let u = 0; u < 4; u++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(rand(1, 2.5), rand(6, 16), 6), ice);
          sp.position.set(rand(-5, 5), 0, rand(-4, 4)); sp.position.y = sp.geometry.parameters.height / 2; sp.rotation.z = rand(-0.2, 0.2);
          o.add(sp);
        }
      }
    },
  };

  // ---------- theme scenery ----------
  // A big backdrop piece (mountain, volcano, island) of base radius r: start at distance d from (cx, cz) in direction a,
  // then slide outward until the whole base is clear of the road, so long tracks never run through it.
  function clearSpot(nearTrack, W, cx, cz, a, d, r) {
    for (let k = 0; k < 40 && nearTrack(cx + Math.cos(a) * d, cz + Math.sin(a) * d, r + W + 40); k++) d += 40;
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  }

  const buildScenery = {
    cove(group, samples, N, W, spot, th, nearTrack) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
        PB.fx.makeWaterMaterial({ deep: 0x0a5a8a, shallow: 0x2ad0dc, sky: 0xcdeeff, sunDir: [0.35, 0.55, -0.75] }));
      water.rotation.x = -Math.PI / 2; water.position.y = -3;
      group.add(water);
      const foamMat = PB.fx.makeFoamMaterial();
      // sand islands following the track
      const sandMat = new THREE.MeshLambertMaterial({ color: 0xf2dca0 });
      for (let i = 0; i < N; i += 9) {
        const s = samples[i];
        if (s.p.y > 4) continue;
        const r = W + rand(18, 30);
        const isl = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 8, 3, 18), sandMat);
        isl.position.set(s.p.x, -2.6 + Math.min(s.p.y, 2) - 0.5, s.p.z);
        isl.receiveShadow = true;
        group.add(isl);
        // surf foam ring around the shore; uv.x = 0 at the shore, 1 at the outer edge
        const inner = r + 7.5, outer = r + 16;
        const fg = new THREE.RingGeometry(inner, outer, 36, 1);
        const pa = fg.attributes.position, ua = fg.attributes.uv;
        for (let k = 0; k < pa.count; k++) ua.setX(k, (Math.hypot(pa.getX(k), pa.getY(k)) - inner) / (outer - inner));
        const foam = new THREE.Mesh(fg, foamMat);
        foam.rotation.x = -Math.PI / 2;
        foam.position.set(s.p.x, -2.9, s.p.z);
        group.add(foam);
      }
      // palms
      const trunkMat = PB.toon(0x8a5a30), leafMat = PB.toon(0x2fae4a);
      for (let k = 0; k < D(110); k++) {
        const sp = spot(6, 22); if (!sp) continue;
        if (sp.s.p.y > 4) continue;
        const palm = new THREE.Group();
        const h = rand(7, 12);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, h, 8), trunkMat);
        trunk.position.y = h / 2; trunk.castShadow = true; palm.add(trunk);
        for (let l = 0; l < 6; l++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 4), leafMat);
          const a = (l / 6) * Math.PI * 2;
          leaf.position.set(Math.cos(a) * 2, h - 0.3, Math.sin(a) * 2);
          leaf.rotation.set(Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9);
          leaf.castShadow = true; palm.add(leaf);
        }
        palm.position.set(sp.x, -1, sp.z);
        palm.rotation.set(rand(-0.15, 0.15), rand(0, 6), rand(-0.15, 0.15));
        group.add(palm);
      }
      // rocks & distant green islands
      const rockMat = PB.toon(0x9a9088);
      for (let k = 0; k < D(40); k++) {
        const sp = spot(5, 40); if (!sp) continue;
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.5, 4)), rockMat);
        r.position.set(sp.x, -1.5, sp.z); r.rotation.set(rand(0, 3), rand(0, 3), 0); group.add(r);
      }
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2, d = rand(750, 1000);
        // rounded jungle hill on a sand base, half sunk into the sea
        const r = rand(80, 160), [x, z] = clearSpot(nearTrack, W, -100, -250, a, d, r);
        const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), PB.toon(0x4cae3a));
        hill.scale.set(r, rand(50, 120), r * rand(0.7, 1)); hill.position.set(x, -6, z); hill.rotation.y = a;
        group.add(hill);
        const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.2, 4, 28), sandMat);
        beach.position.set(x, -2.5, z); group.add(beach);
      }
    },

    neon(group, samples, N, W, spot) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: 0x0c0820 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; group.add(ground);
      const grid = new THREE.GridHelper(4000, 160, 0xff3ad0, 0x3a1a7a);
      grid.position.y = -0.55; group.add(grid);
      // window texture
      const wc = document.createElement('canvas'); wc.width = 64; wc.height = 128;
      const x = wc.getContext('2d');
      x.fillStyle = '#0a0818'; x.fillRect(0, 0, 64, 128);
      const cols = ['#22f0ff', '#ff3ad0', '#ffd23a', '#8a7aff'];
      for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) {
        if (Math.random() < 0.45) { x.fillStyle = cols[(Math.random() * 4) | 0]; x.globalAlpha = rand(0.4, 1); x.fillRect(i * 8 + 2, j * 8 + 2, 4, 4); }
      }
      const winTex = new THREE.CanvasTexture(wc);
      winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
      const buildingMat = new THREE.MeshLambertMaterial({ color: 0x1a1430, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
      for (let k = 0; k < D(170); k++) {
        const sp = spot(14, 140); if (!sp) continue;
        const w = rand(14, 34), h = rand(25, 150), d = rand(14, 34);
        const b = new THREE.Mesh(tiledBox(w, h, d, w / 16, h / 30), buildingMat);
        b.position.set(sp.x, h / 2 - 0.6, sp.z); b.rotation.y = rand(0, 3);
        group.add(b);
        const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.8, d + 0.6), new THREE.MeshBasicMaterial({ color: cols[(Math.random() * 4) | 0] }));
        top.position.set(sp.x, h - 0.6, sp.z); top.rotation.y = b.rotation.y; group.add(top);
      }
      // neon ring arches over the road
      const ringMats = [new THREE.MeshBasicMaterial({ color: 0x22f0ff }), new THREE.MeshBasicMaterial({ color: 0xff3ad0 })];
      for (let i = 20, k = 0; i < N; i += Math.floor(N / 14), k++) {
        const s = samples[i];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(W + 4, 0.45, 8, 40, Math.PI), ringMats[k % 2]);
        ring.position.copy(s.p);
        ring.rotation.y = Math.atan2(s.flat.x, s.flat.z);
        group.add(ring);
      }
    },

    volcano(group, samples, N, W, spot, th, nearTrack) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: 0x3a2018 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; group.add(ground);
      const lavaMat = PB.fx.makeLavaMaterial();
      // lava pools
      for (let k = 0; k < D(26); k++) {
        const sp = spot(12, 90); if (!sp) continue;
        const p = new THREE.Mesh(new THREE.CircleGeometry(rand(8, 22), 20), lavaMat);
        p.rotation.x = -Math.PI / 2; p.position.set(sp.x, -0.5, sp.z); group.add(p);
      }
      // rock spires
      const rockMat = PB.toon(0x5a3a30);
      for (let k = 0; k < D(120); k++) {
        const sp = spot(5, 80); if (!sp) continue;
        const h = rand(6, 40);
        const r = new THREE.Mesh(new THREE.ConeGeometry(rand(2, 7), h, 6), rockMat);
        r.position.set(sp.x, h / 2 - 0.6, sp.z); r.rotation.y = rand(0, 3); r.castShadow = true; group.add(r);
      }
      // big volcanoes
      const vMat = PB.toon(0x4a2a22);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3, d = rand(650, 850);
        const h = rand(180, 280), r = rand(160, 230);
        const v = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r, h, 14), vMat);
        const [vx, vz] = clearSpot(nearTrack, W, -50, -250, a, d, r);
        v.position.set(vx, h / 2 - 1, vz); group.add(v);
        const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.17, 14), lavaMat);
        top.rotation.x = -Math.PI / 2; top.position.set(v.position.x, h - 0.5, v.position.z); group.add(top);
      }
      // floating embers
      const n = D(900), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(-700, 700); pos[i * 3 + 1] = rand(0, 120); pos[i * 3 + 2] = rand(-900, 500); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const embers = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffa040, size: 1.6, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      group.add(embers);
      group.userData.embers = embers;
    },

    sky(group, samples, N, W, spot) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), PB.fx.makeCloudSeaMaterial());
      sea.rotation.x = -Math.PI / 2; sea.position.y = -10; group.add(sea);
      // floating islands: rocky underside, grassy top, a few round trees
      const rockMat = PB.toon(0x9a8270), grassMat = PB.toon(0x7ad65a);
      const leafMats = [PB.toon(0xffa8d8), PB.toon(0x5ac85a), PB.toon(0xfff07a)], trunkMat = PB.toon(0x8a5a3a);
      for (let k = 0; k < D(45); k++) {
        const sp = spot(30, 260); if (!sp) continue;
        const r = rand(10, 34), y = sp.s.p.y + rand(-45, 10);
        const isl = new THREE.Group(); isl.position.set(sp.x, y, sp.z); isl.rotation.y = rand(0, 6);
        const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.7, 9), rockMat);
        rock.rotation.x = Math.PI; rock.position.y = -r * 0.85; isl.add(rock);
        const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 2.4, 14), grassMat);
        top.receiveShadow = true; isl.add(top);
        for (let t = 0, n = Math.floor(rand(0, 4)); t < n; t++) {
          const a = rand(0, 6), d = rand(0, r * 0.6);
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 6), trunkMat);
          trunk.position.set(Math.cos(a) * d, 3.5, Math.sin(a) * d); isl.add(trunk);
          const crown = new THREE.Mesh(new THREE.SphereGeometry(rand(2.5, 4), 12, 10), leafMats[(Math.random() * 3) | 0]);
          crown.position.set(trunk.position.x, 7, trunk.position.z); isl.add(crown);
        }
        group.add(isl);
      }
      // puffy clouds drifting beside the road
      const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8c0 });
      for (let k = 0; k < D(60); k++) {
        const sp = spot(25, 320); if (!sp) continue;
        const c = new THREE.Group(); c.position.set(sp.x, sp.s.p.y + rand(-35, 45), sp.z);
        for (let b = 0; b < 5; b++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(5, 11), 14, 10), cloudMat);
          puff.position.set(rand(-14, 14), rand(-2, 4), rand(-8, 8)); puff.scale.y = 0.7; c.add(puff);
        }
        group.add(c);
      }
      // big rainbow on the horizon
      ['#ff4a4a', '#ff9a3a', '#ffe14a', '#5ad65a', '#4aa8ff', '#9a6aff'].forEach((col, i) => {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(520 - i * 12, 6, 6, 80, Math.PI),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, fog: false, depthWrite: false }));
        arc.position.set(-150, -40, -1300); group.add(arc);
      });
    },

    snow(group, samples, N, W, spot, th, nearTrack) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: 0xeef4ff }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; ground.receiveShadow = true; group.add(ground);
      // snowy pines
      const pineMat = PB.toon(0x1f5a46), snowMat = PB.toon(0xffffff), trunkMat = PB.toon(0x6a4a30);
      for (let k = 0; k < D(150); k++) {
        const sp = spot(6, 90); if (!sp) continue;
        const t = new THREE.Group(), s = rand(0.8, 1.5);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 6), trunkMat); trunk.position.y = 1; t.add(trunk);
        for (let l = 0; l < 3; l++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4 - l * 0.9, 3.6, 8), pineMat);
          cone.position.y = 3 + l * 2.2; cone.castShadow = true; t.add(cone);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5 - l * 0.35, 1.4, 8), snowMat);
          cap.position.y = 4.3 + l * 2.2; t.add(cap);
        }
        t.scale.setScalar(s); t.position.set(sp.x, -0.6, sp.z); group.add(t);
      }
      // snow drifts
      for (let k = 0; k < D(50); k++) {
        const sp = spot(4, 70); if (!sp) continue;
        const m = new THREE.Mesh(new THREE.SphereGeometry(rand(3, 8), 14, 10), snowMat);
        m.scale.y = 0.35; m.position.set(sp.x, -0.6, sp.z); group.add(m);
      }
      // glowing ice crystals
      const iceMat = new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x2a8aff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, roughness: 0.1 });
      for (let k = 0; k < D(40); k++) {
        const sp = spot(5, 60); if (!sp) continue;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(rand(1.5, 4.5)), iceMat);
        c.scale.y = rand(1.6, 2.6); c.position.set(sp.x, rand(1, 4), sp.z); c.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
        group.add(c);
      }
      // distant snowy mountains
      const rockMat = PB.toon(0x6a7488);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, d = rand(800, 1050), r = rand(160, 260), h = rand(220, 380);
        const [x, z] = clearSpot(nearTrack, W, -60, -120, a, d, r);
        const base = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat); base.position.set(x, h / 2 - 1, z); group.add(base);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, h * 0.45, 7), snowMat); cap.position.set(x, h * 0.775, z); group.add(cap);
      }
      // falling snow, recycled above the camera's area
      const n = D(1600), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = rand(-160, 160); pos[i * 3 + 1] = rand(-10, 90); pos[i * 3 + 2] = rand(-160, 160); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.9, depthWrite: false }));
      flakes.frustumCulled = false;
      group.add(flakes);
      group.userData.tick = (dt, t, center) => {
        flakes.position.set(center.x, center.y, center.z);
        for (let i = 0; i < n; i++) {
          pos[i * 3 + 1] -= dt * (6 + (i % 5));
          pos[i * 3] += Math.sin(t + i) * dt * 1.5;
          if (pos[i * 3 + 1] < -10) pos[i * 3 + 1] += 100;
        }
        g.attributes.position.needsUpdate = true;
      };
    },
  };
})();
