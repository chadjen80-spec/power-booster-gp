// Performance helpers: merge many small static meshes into a few big ones (fewer draw calls),
// and graphics-quality presets for low-spec machines.
(function () {
  const PB = window.PB = window.PB || {};
  const OPT = PB.optimize = {};

  // Meshes whose materials look the same can share one draw call
  function matKey(m) {
    if (Array.isArray(m)) return null;   // multi-material meshes stay as they are
    const c = m.color ? m.color.getHex() : -1, e = m.emissive ? m.emissive.getHex() : -1;
    return [m.type, c, e, m.emissiveIntensity, m.map ? m.map.uuid : '', m.emissiveMap ? m.emissiveMap.uuid : '', m.gradientMap ? m.gradientMap.uuid : '',
      m.transparent, m.opacity, m.side, m.blending, m.depthWrite, m.vertexColors, m.fog, m.roughness, m.metalness,
      m.uniforms ? m.uuid : ''].join('|');   // shader materials only merge with themselves
  }

  // Bring a geometry into a common format (non-indexed, position/normal/uv only) so it can be merged
  function normalize(geo, matrix) {
    let g = geo.clone();
    g.applyMatrix4(matrix);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    return g;
  }

  function mergeGroups(buckets, parent) {
    let made = 0;
    for (const b of buckets.values()) {
      if (b.geos.length < 2) { b.meshes.forEach(m => { m.userData.mergeSkip = true; }); continue; }
      const merged = THREE.BufferGeometryUtils.mergeBufferGeometries(b.geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
      mesh.renderOrder = b.renderOrder;
      parent.add(mesh);
      b.meshes.forEach(m => m.parent && m.parent.remove(m));
      made++;
    }
    return made;
  }

  const mergeable = (o, keep) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.children.length === 0
    && !o.userData.keep && !(keep && keep.has(o)) && matKey(o.material) !== null && o.geometry.attributes.position;

  // Static world: merge every eligible mesh under root, bucketed by material and by a spatial grid cell
  // so frustum culling still skips far-away chunks.
  OPT.mergeStatic = function (root, cellSize) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map(), center = new THREE.Vector3(), rel = new THREE.Matrix4();
    let before = 0;
    root.traverse(o => {
      if (!mergeable(o)) return;
      before++;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      center.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const big = o.geometry.boundingSphere.radius * o.getWorldScale(new THREE.Vector3()).x > cellSize;   // long ribbons get a bucket of their own
      const cell = big ? 'big' : `${Math.floor(center.x / cellSize)},${Math.floor(center.z / cellSize)}`;
      const key = `${matKey(o.material)}#${o.castShadow}#${o.receiveShadow}#${o.renderOrder}#${cell}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, renderOrder: o.renderOrder, geos: [], meshes: [] });
      rel.multiplyMatrices(inv, o.matrixWorld);
      b.geos.push(normalize(o.geometry, rel));
      b.meshes.push(o);
    });
    const made = mergeGroups(buckets, root);
    pruneEmpty(root);
    return { before, made };
  };

  // Animated model: only merge siblings under the same parent, so every pivot (arms, head, hair...) still moves.
  OPT.mergeRigid = function (root, keep) {
    const parents = [];
    root.traverse(o => { if (o.children.some(c => mergeable(c, keep))) parents.push(o); });
    let before = 0, made = 0;
    for (const p of parents) {
      const buckets = new Map();
      for (const o of p.children.slice()) {
        if (!mergeable(o, keep)) continue;
        o.updateMatrix();
        const key = `${matKey(o.material)}#${o.castShadow}#${o.receiveShadow}#${o.renderOrder}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, b = { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, renderOrder: o.renderOrder, geos: [], meshes: [] });
        b.geos.push(normalize(o.geometry, o.matrix));
        b.meshes.push(o);
        before++;
      }
      made += mergeGroups(buckets, p);
    }
    return { before, made };
  };

  function pruneEmpty(root) {
    const empty = [];
    root.traverse(o => { if (o !== root && o.type === 'Group' && o.children.length === 0) empty.push(o); });
    empty.forEach(o => o.parent && o.parent.remove(o));
  }

  // ---------------- quality presets ----------------
  const PRESETS = {
    high: { label: 'สูง', pixelRatio: 2, msaa: 4, bloom: true, shadows: true, shadowSize: 2048, particles: 4000, density: 1, speedLines: 70 },
    medium: { label: 'กลาง', pixelRatio: 1.25, msaa: 2, bloom: true, shadows: true, shadowSize: 1024, particles: 2500, density: 0.7, speedLines: 50 },
    low: { label: 'ต่ำ', pixelRatio: 1, msaa: 0, bloom: false, shadows: false, shadowSize: 512, particles: 1200, density: 0.4, speedLines: 30 },
  };
  OPT.PRESETS = PRESETS;
  function guess() {
    const phone = /Android.*Mobile|iPhone|iPod|Mobile/i.test(navigator.userAgent);
    const tablet = /iPad|Android/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);   // iPadOS reports as a Mac
    const cores = navigator.hardwareConcurrency || 4;
    if (phone || cores <= 2) return 'low';
    if (tablet) return 'medium';
    if (cores <= 4) return 'medium';
    return 'high';
  }
  let level;
  try { level = localStorage.getItem('pb-quality'); } catch (e) { level = null; }
  if (!PRESETS[level]) level = guess();
  OPT.level = level;
  PB.quality = Object.assign({ level }, PRESETS[level]);
  OPT.setLevel = function (l) {
    try { localStorage.setItem('pb-quality', l); } catch (e) { /* storage unavailable: applies this session only */ }
  };
})();
