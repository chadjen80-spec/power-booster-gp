// Chibi 3D riders (anime figure style: big glossy hair, large painted anime eyes, slim 2.5-head body, soft shading) on jet surfboards
(function () {
  const PB = window.PB = window.PB || {};
  const V3 = THREE.Vector3;

  // lashes: winged upper lashes (girls); mark: cheek sticker
  PB.CHARACTERS = [
    { id: 'nova', bangs: 'blunt', ult: 'thruster', name: 'Nova', title: 'ไอดอลไซเบอร์', skin: 0xffeee6, hair: 0x9cd2ff, hairTip: 0xd8b8ff, eyes: 0x8a4dff, lashes: true,
      style: 'twintails', acc: 'catears', shirt: 0xe0207a, pants: 0x2a1730, shoes: 0xe6ecf5, accent: 0x22ffd2,
      board: 0x1b2730, boardAccent: 0x22ffcc, flame: 0x66ffee, stats: { speed: 4, accel: 3, handling: 4 } },
    { id: 'blaze', bangs: 'spiky', ult: 'flame', name: 'Blaze', title: 'นักซิ่งเปลวไฟ', skin: 0xffeadc, hair: 0xff6a1a, eyes: 0x2f7dff,
      style: 'spiky', acc: 'none', shirt: 0xffffff, pants: 0x2b3f8c, shoes: 0x222222, accent: 0xe02020,
      board: 0xd23a2a, boardAccent: 0xffd23a, flame: 0xff9a2a, stats: { speed: 5, accel: 3, handling: 2 } },
    { id: 'frost', bangs: 'parted', ult: 'ice', name: 'Frost', title: 'อัศวินน้ำแข็ง', skin: 0xfff0e6, hair: 0xe8eef5, eyes: 0x3aa0ff,
      style: 'short', acc: 'none', shirt: 0xfff2a8, pants: 0xf5f5f5, shoes: 0x3aa0ff, accent: 0xffd23a,
      board: 0xbfe8ff, boardAccent: 0x3aa0ff, flame: 0x9ad8ff, stats: { speed: 3, accel: 4, handling: 4 } },
    { id: 'leaf', bangs: 'side', ult: 'glide', name: 'Leaf', title: 'ภูตแห่งป่า', skin: 0xffeee2, hair: 0x8fd14f, eyes: 0x3fbf5a, lashes: true,
      style: 'long', acc: 'none', skirt: true, shirt: 0xf2e3b0, pants: 0x5c7a3a, shoes: 0x8a6a3a, accent: 0xd6ff5a,
      board: 0x2f8f4f, boardAccent: 0xd6ff5a, flame: 0xb8ff6a, stats: { speed: 3, accel: 5, handling: 3 } },
    { id: 'ruby', bangs: 'soft', ult: 'lightning', name: 'Ruby', title: 'จอมเวทแดง', skin: 0xffeadc, hair: 0xd92a2a, eyes: 0x2aa04a, lashes: true,
      style: 'ponytail', acc: 'none', skirt: true, shirt: 0xa01818, pants: 0x5a1010, shoes: 0x3a1a10, accent: 0xffc04a,
      board: 0x8a1a2a, boardAccent: 0xffc04a, flame: 0xff5a3a, stats: { speed: 4, accel: 4, handling: 3 } },
    { id: 'dusk', bangs: 'swept', ult: 'veil', name: 'Dusk', title: 'ปีศาจรัตติกาล', skin: 0xb07a55, hair: 0x1a1a24, eyes: 0xffb020,
      style: 'spiky', acc: 'horns', wings: true, shirt: 0x1c1f3a, pants: 0x111322, shoes: 0x2a2a3a, accent: 0x4a9aff,
      board: 0x14141c, boardAccent: 0x4a9aff, flame: 0x6a8aff, stats: { speed: 5, accel: 2, handling: 3 } },
    { id: 'sky', bangs: 'wispy', ult: 'storm', name: 'Sky', title: 'ดีเจสายลม', skin: 0xfff4f0, hair: 0x6fe0f2, eyes: 0x2a7aff, lashes: true, mark: 'heart',
      style: 'lowtails', acc: 'headphones', skirt: true, shirt: 0xf26a8a, pants: 0xf26a8a, shoes: 0x2a4aaa, accent: 0xffffff,
      board: 0x2a4aaa, boardAccent: 0x6fe0f2, flame: 0x6affff, stats: { speed: 3, accel: 3, handling: 5 } },
    { id: 'sunny', bangs: 'sweptL', ult: 'radiant', name: 'Sunny', title: 'เด็กหนุ่มสดใส', skin: 0xffeadc, hair: 0xffd66a, eyes: 0x9a4aff,
      style: 'short', acc: 'ahoge', shirt: 0xf0f0f0, pants: 0x6a4a2a, shoes: 0x3a2a1a, accent: 0x3a8aff,
      board: 0xffa83a, boardAccent: 0xffffff, flame: 0xffe06a, stats: { speed: 4, accel: 4, handling: 3 } },
  ];

  let gradMap = null;
  function grad() {
    if (!gradMap) {
      gradMap = new THREE.DataTexture(new Uint8Array([110, 180, 235, 255]), 4, 1, THREE.RedFormat);
      gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;
      gradMap.needsUpdate = true;
    }
    return gradMap;
  }
  const toon = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad() }, extra || {}));
  const basic = (color, extra) => new THREE.MeshBasicMaterial(Object.assign({ color }, extra || {}));
  const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity == null ? 0.9 : opacity,
    blending: THREE.AdditiveBlending, depthWrite: false });
  PB.toon = toon; PB.glow = glow;
  // riders: smooth, slightly glossy shading (like a painted vinyl figure); a little self-light keeps them readable at night
  const soft = (color, rough, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough == null ? 0.6 : rough, metalness: 0,
    emissive: new THREE.Color(color).multiplyScalar(0.07) }, extra || {}));

  function mesh(geo, mat, x, y, z, parent, shadow) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 20, h || 14);
  const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);
  // point a mesh's +Y axis along dir
  function aim(m, dir) { m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize()); }

  // Teardrop hair strand: round top, pointed tip at -Y (fresh geometry each call so disposal stays simple)
  const strandGeo = () => new THREE.LatheGeometry([
    new THREE.Vector2(0, -1), new THREE.Vector2(0.28, -0.55), new THREE.Vector2(0.48, -0.1),
    new THREE.Vector2(0.52, 0.3), new THREE.Vector2(0.38, 0.7), new THREE.Vector2(0, 0.9)], 14);

  // Hair shell: a thick, rounded slab (outer surface, inner surface and a rim joining them) cut along a curved hairline.
  // Polar reach by direction: ~2.4 rad at the back (nape), ~1.7 over the ears, 1.0 at the front, with a soft wave along
  // the back and sides so the edge reads as locks rather than the rim of a bowl. Unit size; the mesh scale sets the radii.
  function hairShellGeo() {
    const W = 72, H = 22, THICK = 0.1;
    const pos = [], idx = [];
    const dir = (t, az) => [Math.sin(t) * Math.sin(az), Math.cos(t), -Math.sin(t) * Math.cos(az)];
    for (const inner of [false, true]) {          // outer then inner surface
      for (let r = 0; r <= H; r++) for (let a = 0; a < W; a++) {
        const az = -Math.PI + (a / W) * Math.PI * 2;   // 0 at the back, +-PI at the front
        const c = Math.cos(Math.abs(az) / 2), back = c * c;
        const k = inner ? 1 - THICK * (0.2 + 0.8 * back) : 1;   // thick at the back and sides, thin at the front so no brim shows over the fringe
        const reach = 1.0 + 1.42 * back + 0.09 * Math.sin(az * 11) * back;
        const t = (r / H) * reach * (k < 1 ? 0.985 : 1);   // inner edge tucks in a hair above the outer one
        const d = dir(t, az);
        pos.push(d[0] * k, d[1] * k, d[2] * k);
      }
    }
    const O = 0, I = (H + 1) * W, v = (base, r, a) => base + r * W + ((a + W) % W);
    for (let r = 0; r < H; r++) for (let a = 0; a < W; a++) {
      idx.push(v(O, r, a), v(O, r + 1, a), v(O, r, a + 1), v(O, r, a + 1), v(O, r + 1, a), v(O, r + 1, a + 1));   // outer, facing out
      idx.push(v(I, r, a), v(I, r, a + 1), v(I, r + 1, a), v(I, r, a + 1), v(I, r + 1, a + 1), v(I, r + 1, a));   // inner, facing in
    }
    for (let a = 0; a < W; a++) {   // rim along the hairline: this is what shows the hair's thickness
      idx.push(v(O, H, a), v(I, H, a), v(O, H, a + 1), v(O, H, a + 1), v(I, H, a), v(I, H, a + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;   // the crown is W copies of one point: give them the straight-up normal
    for (let a = 0; a < W; a++) { n.setXYZ(a, 0, 1, 0); n.setXYZ(I + a, 0, -1, 0); }
    return g;
  }

  // ---------- painted face (eyes, lashes, blush, mouth) on a sphere patch over the head ----------
  const FACE = { phiStart: Math.PI / 2 - 1.05, phiLen: 2.1, thetaStart: 1.0, thetaLen: 1.05 };
  function ellipse(x, cx, cy, rx, ry) { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
  // closed: the blink frame (lids shut as a soft downward curve with the lashes along it)
  function faceTexture(def, closed) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const ec = new THREE.Color(def.eyes);
    const hex = col => '#' + col.getHexString();
    const deep = hex(ec.clone().multiplyScalar(0.35)), mid = hex(ec), light = hex(ec.clone().lerp(new THREE.Color(1, 1, 1), 0.5));
    for (const s of [-1, 1]) {
      const cx = 256 + s * 100, cy = 148, w = 50, h = 68;
      if (closed) {
        x.strokeStyle = '#1c1024'; x.lineCap = 'round';
        x.lineWidth = def.lashes ? 11 : 9;
        x.beginPath(); x.ellipse(cx, cy + 14, w, 20, 0, Math.PI * 0.08, Math.PI * 0.92); x.stroke();
        if (def.lashes) {   // outer lash flick
          const ox = cx + s * (w - 4), oy = cy + 22;
          x.lineWidth = 6;
          x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + s * 15, oy - 6); x.stroke();
        }
        x.strokeStyle = hex(new THREE.Color(def.hair).multiplyScalar(0.55)); x.lineWidth = 5;
        x.beginPath(); x.ellipse(cx, cy - 54, 26, 9, 0, Math.PI * 1.15, Math.PI * 1.85); x.stroke();   // brow dips a touch
        continue;
      }
      // eye white, used as clip for the iris
      x.save();
      x.fillStyle = '#ffffff'; ellipse(x, cx, cy + 4, w, h - 4); x.fill();
      x.clip();
      const g = x.createLinearGradient(0, cy - h, 0, cy + h);
      g.addColorStop(0, deep); g.addColorStop(0.45, mid); g.addColorStop(1, light);
      x.fillStyle = g; ellipse(x, cx - s * 3, cy + 10, w * 0.88, h * 0.92); x.fill();
      x.fillStyle = deep; ellipse(x, cx - s * 3, cy + 6, w * 0.4, h * 0.5); x.fill();
      // iris ring
      x.strokeStyle = deep; x.lineWidth = 4; ellipse(x, cx - s * 3, cy + 10, w * 0.88, h * 0.92); x.stroke();
      x.restore();
      // sparkles
      x.fillStyle = '#ffffff';
      ellipse(x, cx - 16, cy - 20, 15, 20); x.fill();
      ellipse(x, cx + 17, cy + 32, 7, 7); x.fill();
      ellipse(x, cx + 6, cy - 36, 5, 5); x.fill();
      // thick upper lash
      x.strokeStyle = '#1c1024'; x.lineCap = 'round';
      x.lineWidth = def.lashes ? 13 : 10;
      x.beginPath(); x.ellipse(cx, cy + 6, w + 4, h, 0, Math.PI * 1.08, Math.PI * 1.92); x.stroke();
      if (def.lashes) {
        // outer wing
        const ox = cx + s * (w - 2), oy = cy - 26;
        x.lineWidth = 7;
        x.beginPath(); x.moveTo(ox, oy); x.lineTo(ox + s * 16, oy - 12); x.stroke();
        x.beginPath(); x.moveTo(ox - s * 4, oy - 8); x.lineTo(ox + s * 8, oy - 22); x.stroke();
      }
      // lower lash
      x.lineWidth = 3;
      x.beginPath(); x.ellipse(cx, cy + 2, w - 4, h - 2, 0, Math.PI * 0.32, Math.PI * 0.68); x.stroke();
      // brow
      x.strokeStyle = hex(new THREE.Color(def.hair).multiplyScalar(0.55)); x.lineWidth = 5;
      x.beginPath(); x.ellipse(cx, cy - 58, 26, 9, 0, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    }
    // blush
    x.fillStyle = 'rgba(255,110,140,0.4)';
    for (const s of [-1, 1]) { ellipse(x, 256 + s * 158, 214, 30, 12); x.fill(); }
    if (def.mark === 'heart') {
      x.fillStyle = '#e8304a';
      const hx = 256 + 156, hy = 210;
      x.beginPath(); x.moveTo(hx, hy + 12);
      x.bezierCurveTo(hx - 16, hy, hx - 10, hy - 12, hx, hy - 4);
      x.bezierCurveTo(hx + 10, hy - 12, hx + 16, hy, hx, hy + 12); x.fill();
    }
    // tiny mouth
    x.fillStyle = 'rgba(200,120,120,0.45)'; ellipse(x, 256, 206, 3, 2); x.fill();   // a hint of a nose
    x.strokeStyle = '#8a2a3a'; x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.arc(256, 228, 7, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ---------- head ----------
  const HEAD_R = 0.9;
  // Fringe cuts. shell: [from, to, edge] = fringe pieces across the face (radians either side of front) and how low they reach;
  // locks: [angle, length, width, tip tilt, elevation?]. Edge ~1.2 sits on the brows, ~1.28 is a heavy straight cut.
  const BANGS = {
    soft: { shell: [[-1.2, 1.2, 1.2]],   // a few broad rounded locks
      locks: [[-0.95, 0.24, 0.44, 0.2], [-0.48, 0.27, 0.44, 0.08], [0, 0.22, 0.44, 0], [0.48, 0.27, 0.44, -0.08], [0.95, 0.24, 0.44, -0.2]] },
    blunt: { shell: [[-1.25, 1.25, 1.27]],   // straight "hime" cut
      locks: [[-1.05, 0.34, 0.36, 0.05], [1.05, 0.34, 0.36, -0.05]] },
    parted: { shell: [[-1.2, -0.32, 0.98], [0.32, 1.2, 0.98]],   // centre parting: forehead shows, curtains swept out to the sides
      locks: [[-0.42, 0.34, 0.4, 0.6, 0.5], [-0.85, 0.36, 0.42, 0.35, 0.45], [0.42, 0.34, 0.4, -0.6, 0.5], [0.85, 0.36, 0.42, -0.35, 0.45]] },
    side: { shell: [[-1.2, -0.15, 0.92], [-0.15, 1.2, 1.26]],   // long fringe over the left eye, short on the right
      locks: [[0.5, 0.44, 0.62, -0.4], [-0.15, 0.36, 0.5, -0.65, 0.5], [-0.6, 0.26, 0.4, -0.5, 0.55], [-1.0, 0.22, 0.36, -0.2]] },
    swept: { shell: [[-1.2, 1.2, 0.95]],   // long locks combed hard toward the character's right
      locks: [[-0.95, 0.3, 0.4, 0.75, 0.5], [-0.45, 0.38, 0.42, 0.7, 0.5], [0.05, 0.4, 0.42, 0.65, 0.5], [0.55, 0.36, 0.4, 0.6, 0.5], [1.0, 0.28, 0.36, 0.45, 0.5]] },
    sweptL: { shell: [[-1.2, 1.2, 0.92]],   // short fluffy fringe flicked toward the character's left
      locks: [[0.9, 0.22, 0.4, -0.7, 0.55], [0.4, 0.25, 0.42, -0.65, 0.58], [-0.1, 0.25, 0.42, -0.6, 0.58], [-0.6, 0.22, 0.4, -0.55, 0.58], [-1.0, 0.18, 0.36, -0.4, 0.55]] },
    spiky: { shell: [[-1.2, 1.2, 0.95]],   // messy pointed locks of mixed length
      locks: [[-1.0, 0.3, 0.22, 0.35, 0.5], [-0.7, 0.4, 0.22, 0.15, 0.5], [-0.38, 0.3, 0.22, 0.3, 0.5], [-0.08, 0.42, 0.22, -0.05, 0.5],
        [0.22, 0.3, 0.22, -0.25, 0.5], [0.52, 0.4, 0.22, -0.1, 0.5], [0.82, 0.28, 0.22, -0.35, 0.5], [1.05, 0.32, 0.22, -0.15, 0.5]] },
    wispy: { shell: [[-1.2, 1.2, 1.16]],   // fine see-through strands
      locks: [[-0.9, 0.24, 0.18, 0.1], [-0.6, 0.28, 0.18, 0.05], [-0.3, 0.26, 0.18, 0.08], [0, 0.3, 0.18, 0], [0.3, 0.26, 0.18, -0.08],
        [0.6, 0.28, 0.18, -0.05], [0.9, 0.24, 0.18, -0.1]] },
  };
  function buildHead(def) {
    const head = new THREE.Group();
    const skinM = soft(def.skin, 0.75), hairM = soft(def.hair, 0.32);
    mesh(sphere(HEAD_R, 32, 24), skinM, 0, 0, 0, head);
    const sway = head.userData.sway = [];   // hair groups that swing with turns and wind
    const swing = (g, side, w) => { g.name = 'Hair' + (side < 0 ? 'R' : side > 0 ? 'L' : 'Back') + sway.length; sway.push({ g, side, w, z: g.rotation.z, x: g.rotation.x }); };
    const open = faceTexture(def), shut = faceTexture(def, true);
    const faceMat = new THREE.MeshBasicMaterial({ map: open, transparent: true, depthWrite: false });
    faceMat.userData.maps = [open, shut];   // both get disposed with the model
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD_R + 0.006, 40, 20, FACE.phiStart, FACE.phiLen, FACE.thetaStart, FACE.thetaLen), faceMat);
    head.add(face);
    head.userData.face = { mat: faceMat, open, shut };   // animateRider swaps the map to blink
    // little ears
    for (const s of [-1, 1]) { const e = mesh(sphere(1, 12, 10), skinM, s * 0.88, -0.05, 0.02, head); e.scale.set(0.1, 0.17, 0.12); }

    // hair: cap tilted back so the big eyes stay clear, plus a rounded back volume
    // big puffy hair: a cap over the top and a rounded back volume, a little larger than the skull
    // Hair: one shell hugging the skull. Its hairline curves: low at the nape, up over the ears, high at the front
    // (where the fringe takes over), so it follows the head down to the neck instead of ending in a helmet rim.
    const shell = mesh(hairShellGeo(), hairM, 0, 0.05, -0.06, head);
    shell.scale.set(HEAD_R + 0.12, HEAD_R + 0.1, HEAD_R + 0.15);   // close to the skull so the hair sits on the head, not over it
    // bangs: a smooth fringe shell over the forehead (edge at polar angle `edge`), plus locks along its edge.
    // Each racer has its own cut (def.bangs): see BANGS.
    hairM.side = THREE.DoubleSide;
    const fringe = (phi0, phi1, edge) => mesh(new THREE.SphereGeometry(HEAD_R + 0.11, 36, 14, Math.PI / 2 + phi0, phi1 - phi0, 0, edge), hairM, 0, 0, 0, head);
    const lock = (a, len, w, tilt, e) => {   // a: angle round the face (+ = character's left), tilt: lean of the tip
      e = e == null ? 0.42 : e;
      const r = HEAD_R + 0.11, dir = new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      const b = mesh(strandGeo(), hairM, dir.x * r, dir.y * r, dir.z * r, head);
      b.scale.set(w, len, 0.14);
      b.rotation.order = 'YXZ';
      b.rotation.set(-e - 0.15, a, tilt);   // lies along the forehead, tip over the brow
    };
    const cut = BANGS[def.bangs] || BANGS.soft;
    cut.shell.forEach(([p0, p1, edge]) => fringe(p0, p1, edge));
    cut.locks.forEach(l => lock(...l));
    // long side locks framing the face, down past the chin; they start up inside the hair so they read as part of it
    for (const s of [-1, 1]) {
      const l = mesh(strandGeo(), hairM, s * 0.86, -0.12, 0.3, head);
      l.scale.set(0.3, 0.82, 0.28);
      l.rotation.set(0.16, s * 0.3, s * 0.05);
    }

    const tipM = soft(def.hairTip || def.hair, 0.32);
    switch (def.style) {
      case 'spiky':
        [[0, 1, -0.2], [0.5, 0.8, -0.3], [-0.5, 0.8, -0.3], [0.3, 0.6, -0.8], [-0.3, 0.6, -0.8], [0, 0.2, -1], [0.75, 0.4, -0.5], [-0.75, 0.4, -0.5], [0.2, 0.9, 0.3], [-0.25, 0.85, 0.25]]
          .forEach(d => {
            const dir = new V3(...d).normalize();
            const c = mesh(new THREE.ConeGeometry(0.27, 0.8, 10), hairM, dir.x * 1.02, dir.y * 1.02 + 0.04, dir.z * 1.02 - 0.04, head);   // just out of the hair shell
            aim(c, dir);
          });
        break;
      case 'twintails':
        for (const s of [-1, 1]) {
          const g = new THREE.Group(); g.position.set(s * 0.86, 0.3, -0.3); g.rotation.z = s * 0.18; head.add(g); swing(g, s, 0.8);
          mesh(sphere(0.15), soft(def.accent, 0.4), 0, 0, 0, g);
          const t1 = mesh(strandGeo(), hairM, s * 0.04, -0.62, -0.02, g); t1.scale.set(0.46, 0.66, 0.44);
          const t2 = mesh(strandGeo(), tipM, s * 0.02, -1.22, -0.04, g); t2.scale.set(0.3, 0.4, 0.3); t2.rotation.z = s * -0.15;
        }
        break;
      case 'lowtails': // big low twin tails hanging behind the ears (like the reference)
        for (const s of [-1, 1]) {
          const g = new THREE.Group(); g.position.set(s * 0.7, -0.12, -0.42); g.rotation.z = s * 0.12; head.add(g); swing(g, s, 1);
          mesh(sphere(0.13), toon(0xffffff), 0, 0, 0, g);
          const t = mesh(strandGeo(), hairM, s * 0.05, -0.75, -0.05, g); t.scale.set(0.42, 0.8, 0.4);
          const t2 = mesh(strandGeo(), hairM, s * 0.12, -1.35, 0.02, g); t2.scale.set(0.24, 0.4, 0.24); t2.rotation.z = s * 0.4;
        }
        break;
      case 'ponytail': {
        const g = new THREE.Group(); g.position.set(0, 0.38, -1.08); g.rotation.x = 0.45; head.add(g); swing(g, 0, 1.2);
        mesh(sphere(0.17), soft(def.accent, 0.4), 0, 0, 0, g);
        const t = mesh(strandGeo(), hairM, 0, -0.78, -0.08, g); t.scale.set(0.48, 0.85, 0.44); t.rotation.x = -0.15;
        break;
      }
      case 'long': {
        const g = new THREE.Group(); g.position.set(0, -0.1, -0.42); head.add(g); swing(g, 0, 0.5);
        const back = mesh(strandGeo(), hairM, 0, -0.65, 0, g); back.scale.set(1.75, 0.95, 0.85);
        for (const s of [-1, 1]) {
          const lg = new THREE.Group(); lg.position.set(s * 0.66, -0.2, -0.05); head.add(lg); swing(lg, s, 0.6);
          const l = mesh(strandGeo(), hairM, 0, -0.65, 0, lg); l.scale.set(0.3, 0.75, 0.3);
        }
        break;
      }
      default: break; // short
    }

    if (def.acc === 'catears') {
      for (const s of [-1, 1]) {
        const e = mesh(new THREE.ConeGeometry(0.26, 0.55, 4), toon(def.shirt), s * 0.56, 0.95, -0.1, head);
        e.rotation.set(-0.1, Math.PI / 4, -s * 0.45);
        const inner = mesh(new THREE.ConeGeometry(0.14, 0.34, 4), basic(0x22ffd2), s * 0.55, 0.93, 0.0, head, false);
        inner.rotation.copy(e.rotation);
      }
    } else if (def.acc === 'horns') {
      for (const s of [-1, 1]) {
        const h = mesh(new THREE.ConeGeometry(0.14, 0.7, 10), toon(0x6a4a2a), s * 0.58, 0.95, 0.05, head);
        h.rotation.set(-0.35, 0, -s * 0.55);
      }
    } else if (def.acc === 'ahoge') {
      const a = mesh(new THREE.TorusGeometry(0.24, 0.055, 6, 14, Math.PI * 1.2), hairM, 0.05, 1.2, 0, head);
      a.rotation.set(0, Math.PI / 2, 0.4);
    } else if (def.acc === 'headphones') {
      const band = mesh(new THREE.TorusGeometry(1.08, 0.07, 8, 32, Math.PI), toon(0xf2f4f8), 0, 0.05, -0.06, head);
      band.rotation.x = -0.15;
      for (const s of [-1, 1]) {
        const cup = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20), toon(0xf2f4f8), s * 1.06, 0.02, -0.06, head);
        cup.rotation.z = Math.PI / 2;
        const pad = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20), toon(0x2a3a6a), s * 1.18, 0.02, -0.06, head);
        pad.rotation.z = Math.PI / 2;
      }
    }
    return head;
  }

  // ---------- body: slim chibi figure, about 2.5 heads tall ----------
  // Posable parts: legs (squash to crouch, pivot at the feet) and upper body (pivot at the hips)
  const HIP_Y = 0.85;
  // cone-ish frill with a wavy hem (skirts, tops)
  function ruffle(rTop, rBottom, h, waves, amp) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, 64, 3, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (h / 2 - y) / h;   // 0 at the top, 1 at the hem
      const k = 1 + Math.sin(Math.atan2(z, x) * waves) * amp * t;
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return g;
  }
  function buildRider(def) {
    // node names are the contract with Blender models (see docs/BLENDER.md)
    const rider = new THREE.Group(); rider.name = 'Rider';
    const legs = new THREE.Group(); legs.name = 'Legs';
    rider.add(legs);
    const upper = new THREE.Group(); upper.name = 'Upper';
    upper.position.y = HIP_Y;
    rider.add(upper);
    const body = new THREE.Group();   // children use rider-space heights
    body.position.y = -HIP_Y;
    upper.add(body);
    const shirtM = soft(def.shirt, 0.55, { side: THREE.DoubleSide }), pantsM = soft(def.pants, 0.55, { side: THREE.DoubleSide }),
      skinM = soft(def.skin, 0.75), shoeM = soft(def.shoes, 0.4), accM = soft(def.accent, 0.45);
    for (const s of [-1, 1]) {
      const leg = mesh(capsule(0.12, 0.46), skinM, s * 0.13, 0.46, 0, legs); leg.scale.set(1, 1, 0.95);
      const thigh = mesh(sphere(0.135, 14, 10), skinM, s * 0.13, 0.64, 0, legs); thigh.scale.y = 1.25;
      const shoe = mesh(sphere(1, 14, 10), shoeM, s * 0.13, 0.08, 0.04, legs); shoe.scale.set(0.13, 0.11, 0.2);
    }
    if (def.skirt) {   // two-tier ruffled skirt
      mesh(ruffle(0.25, 0.4, 0.2, 9, 0.12), pantsM, 0, 0.9, 0, body);
      mesh(ruffle(0.33, 0.5, 0.18, 11, 0.14), pantsM, 0, 0.76, 0, body);
    } else {
      for (const s of [-1, 1]) mesh(capsule(0.145, 0.16), pantsM, s * 0.125, 0.73, 0, legs);   // shorts legs cover the thighs
      const hips = mesh(capsule(0.2, 0.06), pantsM, 0, 0.9, 0, body); hips.scale.set(1.15, 0.8, 0.85);   // slim seat, no bulge
      mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 18), accM, 0, 0.97, 0, body);   // belt
    }
    const torso = mesh(capsule(0.25, 0.2), shirtM, 0, 1.16, 0, body);
    torso.scale.set(1, 1, 0.82);
    if (def.skirt) mesh(ruffle(0.24, 0.33, 0.14, 10, 0.12), shirtM, 0, 1.22, 0, body);   // frilled top
    mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.28, 12), skinM, 0, 1.54, 0, body);   // neck, long enough to show under the chin
    mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 16), accM, 0, 1.42, 0, body).rotation.x = Math.PI / 2;   // collar
    // arms out for balance
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.name = s < 0 ? 'ArmR' : 'ArmL'; sh.position.set(s * 0.27, 1.36, 0); sh.rotation.z = s * 1.05; body.add(sh);
      mesh(capsule(0.09, 0.14), shirtM, 0, -0.1, 0, sh);   // sleeve
      mesh(capsule(0.07, 0.2), skinM, 0, -0.3, 0, sh);
      const hand = mesh(sphere(0.09, 12, 10), skinM, 0, -0.48, 0, sh); hand.scale.set(1, 1.15, 0.85);
      arms.push(sh);
    }
    if (def.wings) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.9, 0.5); shape.lineTo(0.75, 0.05); shape.lineTo(0.55, 0.2);
      shape.lineTo(0.45, -0.15); shape.lineTo(0.25, 0.0); shape.lineTo(0.1, -0.25); shape.lineTo(0, 0);
      const wm = toon(0x2a1f3a, { side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.ShapeGeometry(shape), wm, s * 0.12, 1.3, -0.2, body);
        w.scale.set(s * 0.85, 0.85, 0.85); w.rotation.y = s * 0.5;
      }
    }
    const head = buildHead(def);
    head.name = 'Head';
    head.position.y = 2.23;
    head.scale.set(0.8, 0.76, 0.77);   // head-space is built at radius 0.9; this makes it ~0.7
    body.add(head);
    return { rider, legs, upper, head, arms };
  }

  // ---------- jet surfboard ----------
  function buildBoard(def) {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, 2.3);
    s.bezierCurveTo(0.65, 1.8, 0.8, 0.2, 0.72, -1.2);
    s.quadraticCurveTo(0.66, -2.0, 0, -2.0);
    s.quadraticCurveTo(-0.66, -2.0, -0.72, -1.2);
    s.bezierCurveTo(-0.8, 0.2, -0.65, 1.8, 0, 2.3);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 20 });
    const deck = mesh(geo, toon(def.board), 0, 0.07, 0, g);
    deck.rotation.x = Math.PI / 2; // nose -> +Z, top face at y ~ 0.13
    // neon stripes
    const stripeM = basic(def.boardAccent);
    mesh(new THREE.BoxGeometry(0.12, 0.03, 3.4), stripeM, 0, 0.14, 0.1, g, false);
    for (const x of [-0.45, 0.45]) mesh(new THREE.BoxGeometry(0.06, 0.03, 2.2), stripeM, x, 0.14, -0.4, g, false);
    // rim light
    const rim = mesh(new THREE.TorusGeometry(1, 0.03, 4, 40), glow(def.boardAccent, 0.8), 0, -0.02, 0.1, g, false);
    rim.rotation.x = Math.PI / 2; rim.scale.set(0.74, 2.15, 1);

    // twin jet engines
    const engM = toon(0x3a3f4a), flames = [];
    for (const x of [-0.4, 0.4]) {
      const eng = mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.8, 14), engM, x, 0.05, -1.75, g);
      eng.rotation.x = Math.PI / 2;
      mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 16), basic(def.boardAccent), x, 0.05, -2.15, g, false);
      const outer = mesh(new THREE.ConeGeometry(0.22, 1.4, 12, 1, true), glow(def.flame, 0.75), x, 0.05, -2.85, g, false);
      outer.rotation.x = -Math.PI / 2;
      const core = mesh(new THREE.ConeGeometry(0.11, 0.9, 10, 1, true), glow(0xffffff, 0.9), x, 0.05, -2.6, g, false);
      core.rotation.x = -Math.PI / 2;
      flames.push({ outer, core, baseZ: -2.85 });
    }
    // hover glow underneath
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    const hover = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv), color: def.flame, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    hover.rotation.x = -Math.PI / 2; hover.position.y = -0.3;
    g.add(hover);
    return { group: g, flames, hover };
  }

  // Procedural riding pose. p: { dt, steer (-1..1, + = left), drift (-1/0/1), stage, speed, time }
  // Springs give a small overshoot when the rider snaps from one turn into another.
  PB.animateRider = function (m, p) {
    const a = m.anim, dt = Math.min(p.dt, 0.05);
    const target = Math.max(-1.4, Math.min(1.4, p.steer + p.drift * 0.5));
    a.leanV += ((target - a.lean) * 90 - a.leanV * 12) * dt;
    a.lean += a.leanV * dt;
    a.air = (a.air || 0) + ((p.air || 0) - (a.air || 0)) * Math.min(1, 10 * dt);   // airborne: tuck and throw arms up
    const crouchT = Math.min(1, Math.abs(a.lean) * 0.55 + Math.abs(p.drift) * 0.6 + p.stage * 0.12 + a.air * 0.8);
    a.crouch += (crouchT - a.crouch) * Math.min(1, 8 * dt);
    const L = Math.max(a.lean, 0), R = Math.max(-a.lean, 0);   // left / right turn amounts

    // crouch on bent legs, lean and twist the upper body into the turn
    m.legs.scale.y = 1 - a.crouch * 0.32;
    m.upper.position.y = m.hipY * (1 - a.crouch * 0.32);
    m.upper.rotation.set(0.12 * a.crouch + p.stage * 0.05, a.lean * 0.3, -a.lean * 0.3);
    m.head.rotation.set(-0.08 * a.crouch, a.lean * 0.3, -a.lean * 0.12);
    // inner arm reaches forward and down toward the board, outer arm swings out and back for balance
    // (kept below shoulder height so the big head never hides it)
    const bob = Math.sin(p.time * 5) * 0.05;
    const up = a.air * 0.9;
    m.arms[1].rotation.set(-L * 0.8 + R * 0.6 + up * 0.3, 0, 1.05 - L * 0.55 + R * 0.45 + up + bob);    // character's left arm (+X)
    m.arms[0].rotation.set(-R * 0.8 + L * 0.6 + up * 0.3, 0, -1.05 + R * 0.55 - L * 0.45 - up - bob);   // character's right arm (-X)
    // board carves on its edge
    m.board.rotation.z = -a.lean * 0.1;

    // blink every few seconds (now and then a quick double blink); eyes squeeze shut while airborne
    if (m.face) {
      a.blink -= dt;
      if (a.blink < -0.11) a.blink = Math.random() < 0.2 ? 0.16 : 1.8 + Math.random() * 3.5;
      const shut = a.blink < 0 || a.air > 0.6;
      const map = shut ? m.face.shut : m.face.open;
      if (m.face.mat.map !== map) m.face.mat.map = map;
    }

    // hair: flung outward by the turn (with lag), streams back in the wind
    a.swayV += ((-a.lean * 0.45 - a.sway) * 50 - a.swayV * 6) * dt;
    a.sway += a.swayV * dt;
    const wind = Math.min(Math.abs(p.speed) / 110, 1) * 0.55 + p.stage * 0.12;
    for (const h of m.hair) {
      const flutter = Math.sin(p.time * 13 + h.side * 2) * 0.06 * wind;
      h.g.rotation.z = h.z + (a.sway + flutter) * h.w;
      h.g.rotation.x = h.x + (wind + flutter) * h.w;
    }
  };

  // Full racer model. Hierarchy: root(yaw/pitch) > body(roll/spin/bob) > board + rider
  // ---------- Blender models (.glb) ----------
  // Drop models/<character id>.glb into the project (or set def.model) and that character uses it instead of
  // the built-in chibi. Parts are found by object name so the riding animation still works; see docs/BLENDER.md.
  const RIDER_HEIGHT = 2.9;   // feet to top of head in game units (= metres in Blender)
  PB.loadModels = async function () {
    if (!THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    // models/index.json lists the .glb files present (served by server.js, written by scripts/build-www.sh)
    let files = [];
    try { const res = await fetch('models/index.json', { cache: 'no-cache' }); if (res.ok) files = await res.json(); } catch (e) { /* offline or file:// */ }
    await Promise.all(PB.CHARACTERS.map(async def => {
      const url = def.model || (files.includes(def.id + '.glb') ? `models/${def.id}.glb` : null);
      if (!url) return;   // no model for this character: keep the built-in chibi
      try { def._gltf = (await loader.loadAsync(url)).scene; }
      catch (e) { console.warn(`model ${url} could not be loaded, using the built-in chibi`, e); }
    }));
  };

  function buildGltfRider(def) {
    const src = def._gltf.clone(true);
    const rider = new THREE.Group(); rider.name = 'Rider';
    // size it so the feet sit on the board and the character is chibi-height, whatever units it was made in
    const box = new THREE.Box3().setFromObject(src), size = box.getSize(new V3());
    const k = size.y > 0 ? RIDER_HEIGHT / size.y : 1;
    src.scale.multiplyScalar(k);
    src.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k, -(box.min.z + size.z / 2) * k);
    rider.add(src);
    src.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      // lit Blender materials get the game's toon shading; unlit ones (e.g. a painted face) stay as they are
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const toonMats = mats.map(m => m.isMeshStandardMaterial ? toon(m.color.getHex(), {
        map: m.map, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side }) : m);
      o.material = Array.isArray(o.material) ? toonMats : toonMats[0];
    });
    const find = name => src.getObjectByName(name) || new THREE.Object3D();   // missing part: animate a dummy
    const upper = find('Upper');
    const head = find('Head');
    const hair = [];
    src.traverse(o => { if (/^Hair/i.test(o.name)) hair.push({ g: o, side: Math.sign(o.position.x), w: 1, z: o.rotation.z, x: o.rotation.x }); });
    head.userData.sway = hair;
    return { rider, legs: find('Legs'), upper, head, arms: [find('ArmR'), find('ArmL')], hipY: upper.position.y };
  }

  PB.buildRacerModel = function (def) {
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = new THREE.Group();
    root.add(body);
    const board = buildBoard(def);
    board.group.position.y = 0.45;
    body.add(board.group);
    const r = def._gltf ? buildGltfRider(def) : buildRider(def);
    r.rider.position.set(0, 0.62, -0.1);
    r.rider.rotation.y = 0.25;
    body.add(r.rider);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 16), glow(0x44ccff, 0.25));
    shield.position.y = 1.7; shield.visible = false;
    body.add(shield);
    // ~70 small meshes per racer -> ~25: merge pieces that never move relative to each other.
    // Flames, hover glow and shield are animated on their own, so they stay separate.
    const keep = new Set([shield, board.hover]);
    board.flames.forEach(f => { keep.add(f.outer); keep.add(f.core); });
    PB.optimize.mergeRigid(root, keep);
    return { root, body, rider: r.rider, legs: r.legs, upper: r.upper, head: r.head, arms: r.arms, hair: r.head.userData.sway,
      hipY: r.hipY == null ? HIP_Y : r.hipY,
      board: board.group, flames: board.flames, hover: board.hover, shield,
      face: r.head.userData.face || null,
      anim: { lean: 0, leanV: 0, crouch: 0, sway: 0, swayV: 0, air: 0, blink: 0.5 + Math.random() * 3 } };
  };

  // Face-forward portrait (data URL) for menus
  PB.renderPortraits = function () {
    const size = 160;
    const rend = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    rend.setSize(size, size);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8888aa, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.7); dl.position.set(2, 4, 5); scene.add(dl);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    cam.position.set(0.4, 3.5, 4.6); cam.lookAt(0, 2.74, 0);
    const out = {};
    for (const def of PB.CHARACTERS) {
      const m = PB.buildRacerModel(def);
      m.root.rotation.y = -0.15; // cancel the surf-stance twist so the face looks at the camera
      scene.add(m.root);
      rend.render(scene, cam);
      out[def.id] = rend.domElement.toDataURL();
      scene.remove(m.root);
      PB.disposeTree(m.root);
    }
    rend.dispose();
    return out;
  };

  PB.disposeTree = function (obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose(); if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
          (m.userData.maps || []).forEach(t => t.dispose());   // e.g. the face's blink frame
          m.dispose();
        });
      }
    });
  };
})();
