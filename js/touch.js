// Touch controls for phones/tablets: drag anywhere on the left half to steer (analog), buttons on the right.
// Shown after the first real touch (or straight away on touch-first devices); the throttle is held automatically.
(function () {
  const PB = window.PB;
  const input = PB.input;
  const $ = id => document.getElementById(id);
  const T = PB.touchState = { active: false };

  function activate() {
    if (T.active) return;
    T.active = true;
    document.body.classList.add('touch');
    input.setAutoGas(true);
  }
  if (window.matchMedia('(pointer: coarse)').matches) activate();
  window.addEventListener('touchstart', activate, { passive: true });
  // a real keyboard press hands control back to the keyboard
  window.addEventListener('keydown', e => {
    if (!T.active || e.repeat || e.code === 'Unidentified') return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;   // typing a name on the on-screen keyboard
    T.active = false; document.body.classList.remove('touch'); input.setAutoGas(false);
  });

  // keep receiving a finger's events after it slides off the control (some browsers refuse for odd pointers)
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* events still arrive while over the element */ } };

  // ---------- steering stick ----------
  const zone = $('t-stick-zone'), base = $('t-stick'), knob = $('t-knob');
  const RANGE = 60;   // px of drag for full lock
  let stickId = null, ox = 0, oy = 0;
  zone.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    stickId = e.pointerId; capture(zone, e.pointerId);
    ox = e.clientX; oy = e.clientY;
    const r = zone.getBoundingClientRect();   // stick is positioned inside the zone
    base.style.left = (ox - r.left) + 'px'; base.style.top = (oy - r.top) + 'px';
    base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    const dx = Math.max(-RANGE, Math.min(RANGE, e.clientX - ox));
    knob.style.transform = `translate(calc(-50% + ${dx}px),-50%)`;
    input.setSteer(-dx / RANGE);   // drag left = steer left (+1)
  });
  const endStick = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; base.classList.remove('on'); input.setSteer(null);
  };
  zone.addEventListener('pointerup', endStick);
  zone.addEventListener('pointercancel', endStick);

  // ---------- buttons ----------
  document.querySelectorAll('#touch-ui [data-hold], #touch-ui [data-tap]').forEach(b => {
    const hold = b.dataset.hold, tap = b.dataset.tap;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); capture(b, e.pointerId); b.classList.add('down');
      if (hold) input.hold(hold, true);
      if (tap) input.tap(tap);
    });
    const up = () => { b.classList.remove('down'); if (hold) input.hold(hold, false); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  });
  // no long-press menus, text selection or double-tap zoom on the controls
  $('touch-ui').addEventListener('contextmenu', e => e.preventDefault());

  // ---------- fullscreen + landscape lock (where the browser allows it) ----------
  $('btn-fullscreen').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch (e) { /* iPhone Safari has no element fullscreen; the rotate prompt still guides the player */ }
  });
  // the Android app already runs fullscreen in landscape
  if (!document.documentElement.requestFullscreen || PB.isApp) $('btn-fullscreen').classList.add('hidden');
})();
