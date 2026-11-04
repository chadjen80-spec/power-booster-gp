// Boss Stage models: the giant electric arowana that chases the player, and its electric baby fish.
// Both are built from code (no files). Nose points to +Z; the model's origin is the middle of the body.
(function () {
  const PB = window.PB = window.PB || {};
  const V2 = THREE.Vector2;

  // metallic scales: rows of overlapping arcs, darker toward the back, a light belly
  function scaleTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 256, 0);   // u runs round the body: 0/1 = belly, 0.5 = back
    g.addColorStop(0, '#d8f0b8'); g.addColorStop(0.3, '#5fc06a'); g.addColorStop(0.5, '#1f6a3a'); g.addColorStop(0.7, '#5fc06a'); g.addColorStop(1, '#d8f0b8');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const R = 16;
    for (let row = 0; row < 256 / R + 1; row++) for (let col = 0; col < 256 / (R * 1.6) + 1; col++) {
      const cx = col * R * 1.6 + (row % 2 ? R * 0.8 : 0), cy = row * R;
      x.strokeStyle = 'rgba(10,40,20,0.55)'; x.lineWidth = 2.5;
      x.beginPath(); x.arc(cx, cy, R * 0.95, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
      x.strokeStyle = 'rgba(255,255,220,0.35)'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(cx, cy - 2, R * 0.8, 0.25 * Math.PI, 0.75 * Math.PI); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
    return t;
  }

  // a lathe round the Z axis, squeezed sideways (arowanas are tall and thin)
  function body(profile, squeeze, mat) {
    const g = new THREE.LatheGeometry(profile.map(([r, z]) => new V2(r, z)), 28);
    g.rotateX(Math.PI / 2); g.scale(squeeze, 1, 1);
    return new THREE.Mesh(g, mat);
  }
  // flat fin from a 2D outline (x = along the fish, y = up), stood up in the fish's mid-plane
  function fin(points, mat) {
    const s = new THREE.Shape(); s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    const g = new THREE.ShapeGeometry(s); g.rotateY(-Math.PI / 2);   // shape x -> fish z, shape y -> up
    return new THREE.Mesh(g, mat);
  }

  PB.buildArowana = function () {
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ map: scaleTexture(), metalness: 0.55, roughness: 0.32, emissive: 0x1a5a2a, emissiveIntensity: 0.35 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0xc8e86a, metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide, emissive: 0x3a5a10, emissiveIntensity: 0.4 });
    // front half (head + body) and a tail section that swings
    const front = new THREE.Group(); root.add(front);
    const fb = body([[0, 7.4], [0.55, 7.1], [1.05, 6.5], [1.55, 5.4], [1.85, 3.8], [1.95, 1.5], [1.85, -0.5], [1.5, -2.4], [1.05, -3.6]], 0.55, skin);
    front.add(fb);
    // eye, mouth line and the two chin barbels
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4f0d0, roughness: 0.2 }));
      eye.position.set(s * 0.72, 0.55, 5.5); eye.scale.set(0.5, 1, 1); front.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
      pupil.position.set(s * 0.86, 0.55, 5.6); pupil.scale.set(0.4, 1, 1); front.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(s * 0.95, 0.68, 5.66); front.add(glint);
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), new THREE.MeshBasicMaterial({ color: 0x0a2010 }));
      mouth.position.set(s * 0.42, -0.25, 6.6); mouth.rotation.x = -0.45; front.add(mouth);
    }
    const barbelMat = new THREE.MeshStandardMaterial({ color: 0xd8e8a0, roughness: 0.5 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.4, 6), barbelMat);
      b.position.set(s * 0.18, 0.1, 7.9); b.rotation.set(-Math.PI / 2 + 0.6, 0, s * 0.15); front.add(b);
    }
    // long pectoral fins, low behind the gills
    const pecs = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(s * 0.7, -1.0, 3.6); front.add(p);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2), finMat);
      f.position.set(s * 0.3, -0.4, -1.3); f.rotation.set(-1.15, 0, s * 0.5); p.add(f);
      pecs.push({ g: p, s });
    }
    // tail section: narrow wrist, dorsal + anal fins sitting far back (an arowana trait), and a big fan tail
    const tail = new THREE.Group(); tail.position.z = -3.4; root.add(tail);
    const tb = body([[1.1, 0.2], [0.85, -1.2], [0.6, -2.4], [0.5, -2.9]], 0.55, skin);
    tail.add(tb);
    const dorsal = fin([[2.2, 1.6], [0.6, 2.9], [-1.4, 2.4], [-2.6, 0.6], [-1.6, 0.4], [1.4, 1.2]], finMat);
    dorsal.position.z = 0.6; tail.add(dorsal);
    const anal = fin([[2.6, -1.6], [0.6, -3.0], [-1.4, -2.5], [-2.6, -0.6], [-1.6, -0.4], [1.6, -1.2]], finMat);
    anal.position.z = 0.6; tail.add(anal);
    const caudal = fin([[-2.6, 0], [-4.4, 2.6], [-5.4, 1.4], [-5.6, 0], [-5.4, -1.4], [-4.4, -2.6]], finMat);
    tail.add(caudal);
    // electric aura: a flickering shell round the body
    const auraMat = new THREE.MeshBasicMaterial({ color: 0x6af0ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    const aura = body([[0, 8.2], [1.2, 7.2], [2.4, 4.5], [2.6, 0.5], [2.2, -3.5], [1.4, -6.5], [0.6, -8.8], [0, -9.4]], 0.62, auraMat);
    root.add(aura);
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { root, front, tail, pecs, aura, auraMat, skin };
  };

  // swim cycle: the tail sweeps side to side, the head counter-swings a little, fins row, the aura crackles
  PB.animateArowana = function (m, t, effort) {
    const w = 4 + effort * 4;
    m.tail.rotation.y = Math.sin(t * w) * (0.35 + effort * 0.15);
    m.front.rotation.y = -Math.sin(t * w) * 0.06;
    m.pecs.forEach(p => { p.g.rotation.z = p.s * (0.2 + Math.sin(t * w * 0.7) * 0.25); });
    m.auraMat.opacity = 0.12 + Math.random() * 0.14;
    m.aura.scale.setScalar(1 + Math.sin(t * 9) * 0.02);
  };

  // small glowing fish that darts out of the boss: touching one is Game Over
  PB.buildElectricFish = function () {
    const g = new THREE.Group();
    const core = new THREE.MeshBasicMaterial({ color: 0x9ff8ff });
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), core); b.scale.set(0.45, 0.6, 1.3); g.add(b);
    const tailFin = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 4), core); tailFin.rotation.x = -Math.PI / 2; tailFin.scale.set(0.35, 1, 1); tailFin.position.z = -1.5; g.add(tailFin);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x002030 }));
      eye.position.set(s * 0.32, 0.18, 0.85); g.add(eye);
    }
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0x3ad8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(1.0, 1.2, 2.1); g.add(halo);
    return { root: g, halo, tailFin };
  };
})();
