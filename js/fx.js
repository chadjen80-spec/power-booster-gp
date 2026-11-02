// Visual effects: post-processing (bloom, speed blur, grading), shader sky, water, lava, particles, speed lines
(function () {
  const PB = window.PB = window.PB || {};
  const V3 = THREE.Vector3;
  const FX = PB.fx = { time: { value: 0 } };

  // shared GLSL noise
  const NOISE = `
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  `;
  const FOG_UNIFORMS = () => ({ fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } });
  // copies scene fog settings into a custom shader's uniforms
  FX.syncFog = (mat, fog) => { mat.uniforms.fogColor.value.copy(fog.color); mat.uniforms.fogNear.value = fog.near; mat.uniforms.fogFar.value = fog.far; };

  // ---------------- post-processing ----------------
  const FinalShader = {
    uniforms: {
      tDiffuse: { value: null }, uSpeed: { value: 0 }, uFast: { value: 0 }, uChroma: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 },
      uVignette: { value: 0.35 }, uTint: { value: new THREE.Color(0, 0, 0) }, uTintAmt: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uSpeed, uFast, uChroma, uSat, uContrast, uVignette, uTintAmt; uniform vec3 uTint;
      varying vec2 vUv;
      void main(){
        vec2 dir = vUv - 0.5; float d = length(dir);
        // radial (zoom) blur that grows toward the screen edges with speed
        float s = uSpeed * 0.07 * smoothstep(0.12, 0.75, d);
        // Fast Blur (Booster Lv.3): a much stronger zoom blur centred on the rider, who stays sharp
        vec2 fdir = vUv - vec2(0.5, 0.42);
        float fs = uFast * 0.24 * smoothstep(0.06, 0.6, length(fdir * vec2(1.0, 1.4)));
        float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);   // hides banding between taps
        vec3 col = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 16; i++) {
          float t = (float(i) + jitter) / 16.0; float w = 1.0 - t * 0.6;
          col += texture2D(tDiffuse, vUv - dir * s * t - fdir * fs * t).rgb * w; tot += w;
        }
        col /= tot;
        if (uChroma > 0.0) {
          vec2 off = dir * uChroma * 0.018 * d;
          col.r = mix(col.r, texture2D(tDiffuse, vUv + off).r, 0.85);
          col.b = mix(col.b, texture2D(tDiffuse, vUv - off).b, 0.85);
        }
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, uSat);
        col = (col - 0.5) * uContrast + 0.5;
        col *= 1.0 - uVignette * smoothstep(0.38, 0.9, d);
        col = mix(col, uTint, uTintAmt * smoothstep(0.32, 0.82, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  };

  // opts: { msaa: samples (0 = off), bloom: bool } from the graphics quality preset
  FX.createComposer = function (renderer, scene, camera, opts) {
    opts = opts || { msaa: 4, bloom: true };
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { samples: opts.msaa });
    const composer = new THREE.EffectComposer(renderer, target);
    const renderPass = new THREE.RenderPass(scene, camera);
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.55, 0.82);
    bloom.enabled = opts.bloom;
    const final = new THREE.ShaderPass(FinalShader);
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(final);
    return {
      composer, bloom, final, u: final.uniforms,
      setScene(s) { renderPass.scene = s; },
      setSize(w, h) { composer.setSize(w, h); bloom.setSize(w / 2, h / 2); },
      render() { composer.render(); },
    };
  };

  // ---------------- sky dome ----------------
  FX.makeSky = function (o) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(o.top) }, horizon: { value: new THREE.Color(o.horizon) }, bottom: { value: new THREE.Color(o.bottom) },
        sunDir: { value: new V3(...o.sunDir).normalize() }, sunColor: { value: new THREE.Color(o.sunColor) }, sunSize: { value: o.sunSize || 900 },
        cloud: { value: o.cloud || 0 }, cloudColor: { value: new THREE.Color(o.cloudColor || 0xffffff) },
        stars: { value: o.stars || 0 }, retro: { value: o.retro || 0 }, aurora: { value: o.aurora || 0 }, time: FX.time,
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NOISE + `
        uniform vec3 top, horizon, bottom, sunDir, sunColor, cloudColor; uniform float sunSize, cloud, stars, retro, aurora, time;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h * 4.0, 0.0, 1.0), 0.5));
          float sd = max(dot(d, sunDir), 0.0);
          if (retro > 0.0) {
            // synthwave sun: big disc with horizontal cut stripes
            float disc = smoothstep(0.9935, 0.995, sd);
            float yy = (d.y - sunDir.y) / 0.114;            // -1 bottom .. 1 top of the disc
            float cut = yy > -0.1 ? 1.0 : step(0.4 + yy * 0.3, fract(yy * 5.0));
            vec3 sunc = mix(sunColor, vec3(1.0, 0.85, 0.25), clamp(yy * 0.5 + 0.5, 0.0, 1.0));
            col = mix(col, sunc * 1.6, disc * cut);
            col += sunColor * pow(sd, 30.0) * 0.6;
          } else {
            col += sunColor * (pow(sd, sunSize) * 3.0 + pow(sd, 10.0) * 0.2);
          }
          if (cloud > 0.0 && h > 0.0) {
            vec2 p = d.xz / (h + 0.12) * 1.4 + vec2(time * 0.012, time * 0.004);
            float n = fbm(p);
            float c = smoothstep(0.48, 0.78, n) * cloud * smoothstep(0.0, 0.12, h);
            vec3 cc = cloudColor * (0.8 + 0.35 * pow(sd, 4.0)) * (0.85 + 0.15 * fbm(p * 2.0 + 3.0));
            col = mix(col, cc, c);
          }
          if (stars > 0.0 && h > 0.0) {
            vec3 q = floor(d * 380.0);
            float r = hash3(q);
            float tw = 0.6 + 0.4 * sin(time * 3.0 + r * 50.0);
            col += step(0.9975, r) * stars * smoothstep(0.02, 0.3, h) * tw;
          }
          if (aurora > 0.0 && h > 0.0) {
            // drifting curtains of green/violet light
            float ang = atan(d.z, d.x);
            float wave = fbm(vec2(ang * 3.0 + time * 0.03, h * 3.0 - time * 0.05));
            float curtain = smoothstep(0.3, 0.85, fbm(vec2(ang * 9.0 + wave * 3.0, time * 0.08)));
            float band = smoothstep(0.12, 0.3, h) * smoothstep(0.75, 0.35, h);
            vec3 ac = mix(vec3(0.15, 1.0, 0.55), vec3(0.55, 0.3, 1.0), smoothstep(0.25, 0.6, h + wave * 0.2));
            col += ac * curtain * band * aurora * 0.7;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(2200, 48, 24), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  };

  // ---------------- water ----------------
  FX.makeWaterMaterial = function (o) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({
        time: FX.time, deep: { value: new THREE.Color(o.deep) }, shallow: { value: new THREE.Color(o.shallow) },
        skyCol: { value: new THREE.Color(o.sky) }, sunDir: { value: new V3(...o.sunDir).normalize() },
      }, FOG_UNIFORMS()),
      vertexShader: `varying vec3 vWorld; varying float vDepth;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: NOISE + `
        uniform float time; uniform vec3 deep, shallow, skyCol, sunDir, fogColor; uniform float fogNear, fogFar;
        varying vec3 vWorld; varying float vDepth;
        // smooth sine-sum waves (value noise looked blocky at this scale)
        float h(vec2 p){
          float t = time;
          return sin(p.x * 0.06 + t * 1.1) * 0.5 + sin(p.y * 0.05 - t * 0.9) * 0.5
               + sin((p.x + p.y) * 0.11 + t * 1.7) * 0.25 + sin((p.x - p.y * 0.7) * 0.17 - t * 2.1) * 0.15
               + sin((p.x * 0.6 + p.y) * 0.31 + t * 2.9) * 0.07;
        }
        void main(){
          vec2 p = vWorld.xz;
          float e = 0.6, c = h(p);
          vec3 n = normalize(vec3(-(h(p + vec2(e, 0.0)) - c) / e * 0.6, 1.0, -(h(p + vec2(0.0, e)) - c) / e * 0.6));
          c = c * 0.35 + 0.75;
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          vec3 col = mix(deep, shallow, smoothstep(0.55, 1.1, c));
          col = mix(col, skyCol, fres * 0.75);
          float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 180.0);
          col += vec3(1.0, 0.97, 0.9) * spec * 2.2;
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
        }`,
    });
  };

  // foam ring shader around islands
  FX.makeFoamMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: { time: FX.time },
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: NOISE + `uniform float time; varying vec2 vUv; varying vec3 vW;
        void main(){
          float r = vUv.x; // 0 at inner edge (shore) -> 1 outer
          float band = smoothstep(1.0, 0.0, r) * (0.55 + 0.45 * sin(r * 12.0 - time * 2.0));
          float n = noise(vW.xz * 0.3 + time * 0.4);
          gl_FragColor = vec4(vec3(1.0), clamp(band * (0.5 + n * 0.6), 0.0, 1.0) * 0.8);
        }`,
      transparent: true, depthWrite: false,
    });
  };

  // ---------------- lava ----------------
  FX.makeLavaMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({ time: FX.time }, FOG_UNIFORMS()),
      vertexShader: `varying vec3 vWorld; varying float vDepth;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: NOISE + `uniform float time; uniform vec3 fogColor; uniform float fogNear, fogFar;
        varying vec3 vWorld; varying float vDepth;
        void main(){
          vec2 p = vWorld.xz * 0.08;
          float n = fbm(p + vec2(time * 0.08, time * 0.05) + fbm(p * 1.7 - time * 0.06));
          vec3 col = mix(vec3(0.35, 0.03, 0.0), vec3(1.0, 0.35, 0.02), smoothstep(0.3, 0.6, n));
          col = mix(col, vec3(1.6, 1.15, 0.4), smoothstep(0.62, 0.8, n));
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(col, fogColor, f * 0.8), 1.0);
        }`,
    });
  };

  // ---------------- sea of clouds (Cloud Kingdom) ----------------
  FX.makeCloudSeaMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({ time: FX.time }, FOG_UNIFORMS()),
      vertexShader: `varying vec3 vWorld; varying float vDepth;
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: NOISE + `uniform float time; uniform vec3 fogColor; uniform float fogNear, fogFar;
        varying vec3 vWorld; varying float vDepth;
        void main(){
          vec2 p = vWorld.xz * 0.012 + vec2(time * 0.01, time * 0.004);
          float n = fbm(p) * 0.7 + fbm(p * 3.0 - time * 0.02) * 0.3;
          vec3 col = mix(vec3(0.62, 0.78, 1.0), vec3(1.0), smoothstep(0.35, 0.65, n));
          col = mix(col, vec3(1.0, 0.92, 0.97), smoothstep(0.65, 0.85, n) * 0.6);
          float f = smoothstep(fogNear, fogFar, vDepth);
          gl_FragColor = vec4(mix(col, fogColor, f * 0.7), 1.0);
        }`,
    });
  };

  // ---------------- particles ----------------
  class Particles {
    constructor(scene, max) {
      this.max = max; this.next = 0;
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
      this.geo = g;
      const mat = new THREE.ShaderMaterial({
        uniforms: { scale: { value: window.innerHeight / 2 } },
        vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale;
          void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vC; varying float vA;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
            if (vA * a < 0.01) discard; gl_FragColor = vec4(vC * (1.0 + a * 0.6), vA * a); }`,
        vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.mat = mat;
      this.points = new THREE.Points(g, mat);
      this.points.frustumCulled = false;
      scene.add(this.points);
      this._c = new THREE.Color();
    }
    // o: {pos, vel, spread, color, life, size:[a,b], grav, drag}
    emit(n, o) {
      for (let k = 0; k < n; k++) {
        const i = this.next; this.next = (this.next + 1) % this.max;
        const sp = o.spread || 0;
        this.pos[i * 3] = o.pos.x + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
        this.pos[i * 3 + 1] = o.pos.y + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
        this.pos[i * 3 + 2] = o.pos.z + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
        this.vel[i * 3] = (o.vel ? o.vel.x : 0) + (Math.random() - 0.5) * 2 * sp;
        this.vel[i * 3 + 1] = (o.vel ? o.vel.y : 0) + (Math.random() - 0.5) * 2 * sp;
        this.vel[i * 3 + 2] = (o.vel ? o.vel.z : 0) + (Math.random() - 0.5) * 2 * sp;
        const c = typeof o.color === 'function' ? o.color(this._c) : this._c.set(o.color);
        this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
        const life = o.life * (0.7 + Math.random() * 0.6);
        this.life[i] = life; this.maxLife[i] = life;
        this.s0[i] = o.size[0]; this.s1[i] = o.size[1];
        this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0;
      }
    }
    update(dt) {
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
        this.life[i] -= dt;
        const k = Math.max(0, this.life[i] / this.maxLife[i]);
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr + this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
        this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.alpha[i] = Math.min(1, k * 1.6);
        this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * k;
      }
      const a = this.geo.attributes;
      a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
      this.mat.uniforms.scale.value = window.innerHeight / 2;
    }
  }
  FX.Particles = Particles;

  // ---------------- 3D speed lines (attached to the camera) ----------------
  class SpeedLines {
    constructor(camera, count) {
      this.count = count;
      this.data = [];
      const pos = new Float32Array(count * 6);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.pos = pos; this.geo = g;
      this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      this.lines = new THREE.LineSegments(g, this.mat);
      this.lines.frustumCulled = false;
      for (let i = 0; i < count; i++) this.data.push(this.spawn({}, true));
      camera.add(this.lines);
      this.camera = camera;
    }
    spawn(d, anyZ) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      d.x = Math.cos(a) * r; d.y = Math.sin(a) * r * 0.7; d.z = anyZ ? -Math.random() * 90 : -90 - Math.random() * 20;
      d.len = 3 + Math.random() * 8;
      return d;
    }
    update(dt, speed, intensity, color) {
      this.mat.opacity += (intensity - this.mat.opacity) * Math.min(1, 5 * dt);
      this.lines.visible = this.mat.opacity > 0.01;
      if (!this.lines.visible) return;
      this.mat.color.set(color);
      for (let i = 0; i < this.count; i++) {
        const d = this.data[i];
        d.z += speed * 1.6 * dt;
        if (d.z > 2) this.spawn(d, false);
        const k = i * 6, l = d.len * (0.5 + intensity);
        this.pos[k] = d.x; this.pos[k + 1] = d.y; this.pos[k + 2] = d.z;
        this.pos[k + 3] = d.x; this.pos[k + 4] = d.y; this.pos[k + 5] = d.z - l;
      }
      this.geo.attributes.position.needsUpdate = true;
    }
    dispose() { this.camera.remove(this.lines); this.geo.dispose(); this.mat.dispose(); }
  }
  FX.SpeedLines = SpeedLines;
})();
