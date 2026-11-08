// Tiny WebAudio synth: engine hum + procedural sound effects (no asset files needed)
(function () {
  const PB = window.PB = window.PB || {};
  const A = PB.audio = { ctx: null, master: null, engine: null };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    A.ctx = new Ctx();
    A.master = A.ctx.createGain();
    A.master.gain.value = 0.5;
    A.master.connect(A.ctx.destination);
    const n = A.ctx.sampleRate;
    A.noiseBuf = A.ctx.createBuffer(1, n, n);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  };

  A.beep = function (freq, dur, type, vol, slideTo) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.master);
    o.start(t); o.stop(t + dur + 0.02);
  };

  A.noise = function (dur, vol, freq) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf;
    const f = A.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq || 1200, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t); s.stop(t + dur);
  };

  A.sfx = function (name) {
    switch (name) {
      case 'count': A.beep(440, 0.25, 'square', 0.15); break;
      case 'go': A.beep(880, 0.6, 'square', 0.18); break;
      case 'pickup': A.beep(600, 0.08, 'triangle', 0.15, 1200); setTimeout(() => A.beep(900, 0.1, 'triangle', 0.12, 1600), 70); break;
      case 'item': A.beep(1200, 0.05, 'square', 0.06); break;
      case 'got': A.beep(700, 0.15, 'triangle', 0.15, 1400); break;
      case 'fire': A.noise(0.35, 0.25, 3000); A.beep(300, 0.3, 'sawtooth', 0.08, 900); break;
      case 'boom': A.noise(0.9, 0.6, 1500); A.beep(120, 0.5, 'sine', 0.3, 40); break;
      case 'hit': A.beep(500, 0.4, 'sawtooth', 0.15, 80); break;
      case 'shield': A.beep(400, 0.3, 'sine', 0.15, 1200); break;
      case 'bump': A.noise(0.12, 0.2, 600); break;
      case 'boost1': A.beep(300, 0.4, 'sawtooth', 0.12, 700); break;
      case 'boost2': A.beep(450, 0.4, 'sawtooth', 0.14, 1000); break;
      case 'boost3': A.beep(600, 0.6, 'sawtooth', 0.16, 1600); A.noise(0.6, 0.2, 4000); break;
      case 'tick': A.beep(1000, 0.06, 'square', 0.07); break;
      // boss stage: two-tone siren when an electric fish is about to charge, and a crackling zap when it goes
      case 'alarm': [0, 1, 2, 3].forEach(i => setTimeout(() => A.beep(i % 2 ? 660 : 990, 0.16, 'square', 0.13), i * 190)); break;
      case 'zap': A.noise(0.35, 0.3, 6000); A.beep(1700, 0.45, 'sawtooth', 0.14, 180); setTimeout(() => A.noise(0.15, 0.25, 8000), 90); break;
      case 'turbo': A.noise(0.4, 0.2, 2500); A.beep(400, 0.3, 'triangle', 0.1, 900); break;
      case 'lap': A.beep(660, 0.12, 'square', 0.12); setTimeout(() => A.beep(990, 0.25, 'square', 0.12), 130); break;
      case 'finish': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => A.beep(f, 0.3, 'square', 0.12), i * 140)); break;
      case 'select': A.beep(800, 0.06, 'triangle', 0.1); break;
      case 'jump': A.beep(300, 0.35, 'triangle', 0.14, 900); break;
      case 'land': A.noise(0.18, 0.3, 900); A.beep(140, 0.12, 'sine', 0.2, 70); break;
      case 'fall': A.beep(900, 0.9, 'triangle', 0.14, 120); break;
    }
  };

  // Continuous engine sound for the player: a jet board, not a car.
  //  - roar: rushing noise through a band-pass that opens up with speed (afterburner when boosting)
  //  - whine: a turbine's high pitch climbing with speed
  //  - laser: a sci-fi buzz with a fast wobble, rising with speed and each Booster stage
  A.startEngine = function () {
    if (!A.ctx || A.engine) return;
    const c = A.ctx, out = c.createGain(); out.gain.value = 1.6; out.connect(A.master);
    // jet roar
    const noise = c.createBufferSource(); noise.buffer = A.noiseBuf; noise.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7; bp.frequency.value = 400;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const roar = c.createGain(); roar.gain.value = 0;
    noise.connect(bp); bp.connect(lp); lp.connect(roar); roar.connect(out);
    // turbine whine (two slightly detuned sines shimmer against each other)
    const w1 = c.createOscillator(), w2 = c.createOscillator(); w1.type = w2.type = 'sine';
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
    const whine = c.createGain(); whine.gain.value = 0;
    w1.connect(hp); w2.connect(hp); hp.connect(whine); whine.connect(out);
    // laser hum: sawtooth through a resonant band-pass, its pitch wobbled by a fast LFO
    const lz = c.createOscillator(); lz.type = 'sawtooth';
    const lzf = c.createBiquadFilter(); lzf.type = 'bandpass'; lzf.Q.value = 6;
    const lfo = c.createOscillator(); lfo.type = 'sine';
    const lfoDepth = c.createGain(); lfoDepth.gain.value = 10;
    lfo.connect(lfoDepth); lfoDepth.connect(lz.frequency);
    const laser = c.createGain(); laser.gain.value = 0;
    lz.connect(lzf); lzf.connect(laser); laser.connect(out);
    [noise, w1, w2, lz, lfo].forEach(n => n.start());
    A.engine = { out, noise, bp, lp, roar, w1, w2, whine, lz, lzf, lfo, lfoDepth, laser };
  };
  A.setEngine = function (speed, stage) {
    const e = A.engine; if (!e) return;
    const t = A.ctx.currentTime, k = 0.06;
    const v = Math.min(Math.abs(speed) / 130, 1.25);   // 0 at rest, ~1 at top speed, more when boosting
    e.bp.frequency.setTargetAtTime(280 + v * 1500 + stage * 260, t, k);
    e.lp.frequency.setTargetAtTime(1800 + v * 3500 + stage * 800, t, k);
    e.roar.gain.setTargetAtTime(0.025 + v * 0.075 + stage * 0.02, t, 0.1);
    const wf = 700 + v * 2400 + stage * 420;
    e.w1.frequency.setTargetAtTime(wf, t, k); e.w2.frequency.setTargetAtTime(wf * 1.008, t, k);
    e.whine.gain.setTargetAtTime(0.004 + v * 0.012 + stage * 0.003, t, 0.1);
    const lf = 150 + v * 380 + stage * 140;
    e.lz.frequency.setTargetAtTime(lf, t, k);
    e.lzf.frequency.setTargetAtTime(lf * 3, t, k);
    e.lfo.frequency.setTargetAtTime(9 + v * 14 + stage * 5, t, k);
    e.lfoDepth.gain.setTargetAtTime(lf * 0.05, t, k);
    e.laser.gain.setTargetAtTime(0.008 + v * 0.016 + stage * 0.012, t, 0.1);
  };
  A.stopEngine = function () {
    const e = A.engine; if (!e) return;
    try { [e.noise, e.w1, e.w2, e.lz, e.lfo].forEach(n => n.stop()); } catch (err) { /* already stopped */ }
    e.out.disconnect();
    A.engine = null;
  };
})();
