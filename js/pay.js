// Real-money purchases (web version): sign in with an email link (Supabase), pay on Stripe Checkout, then the items
// arrive from the server's purchase record (payments.js). Off in the Android app and when the server has no keys.
(function () {
  const PB = window.PB;
  const OFFER_HOURS = 72;
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  const pay = PB.pay = { enabled: false, user: null, bought: new Set(), products: {}, onChange: null };
  let sb = null;

  // the Starter Pack offer runs for 72 hours from the first time this device opened the game
  const firstSeen = (() => {
    try {
      let t = +localStorage.getItem('pb-first');
      if (!t) { t = Date.now(); localStorage.setItem('pb-first', t); }
      return t;
    } catch (e) { return Date.now(); }
  })();
  pay.offerLeft = () => Math.max(0, firstSeen + OFFER_HOURS * 3600e3 - Date.now());
  pay.offerOpen = () => pay.enabled && !pay.bought.has('starter') && pay.offerLeft() > 0;
  pay.priceText = id => { const p = pay.products[id]; return p ? `${(p.amount / 100).toLocaleString()} บาท` : ''; };

  const changed = () => { if (pay.onChange) pay.onChange(); };
  function toast(text) {
    const t = document.getElementById('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 6000);
  }
  function loadScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  async function api(path, opts = {}) {
    const { data } = await sb.auth.getSession();
    const token = data.session && data.session.access_token;
    const r = await fetch(path, Object.assign({}, opts,
      { headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}) }));
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'HTTP ' + r.status), { status: r.status });
    return body;
  }

  // pays out purchases this device hasn't granted yet (also restores them on a new device)
  function apply(list) {
    for (const p of list) {
      pay.bought.add(p.product);
      const prod = PB.shop.grantPurchase(p);
      if (prod) toast(`🎁 ได้รับ ${prod.name}: สกิน ${PB.shop.find(prod.skin).name} + 🪙 ${prod.coins.toLocaleString()}`);
    }
    changed();
  }
  pay.sync = async () => { if (pay.user) apply((await api('/api/purchases')).purchases); };
  pay.login = async email => {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  };
  pay.logout = () => sb.auth.signOut();
  pay.buy = async product => {
    const { url } = await api('/api/checkout', { method: 'POST', body: JSON.stringify({ product }) });
    location.href = url;
  };

  // back from Stripe Checkout: ?paid=<session id> or ?paid=cancel
  async function handleReturn() {
    const sid = new URLSearchParams(location.search).get('paid');
    if (!sid) return;
    history.replaceState(null, '', location.pathname);
    if (sid === 'cancel') { toast('ยกเลิกการชำระเงินแล้ว'); return; }
    if (!pay.user) return;
    // PromptPay can take a little while to clear, so ask a few times
    for (let i = 0; i < 6; i++) {
      try {
        const r = await api('/api/confirm', { method: 'POST', body: JSON.stringify({ session: sid }) });
        apply(r.purchases);
        if (r.paid) return;
      } catch (e) { console.warn('[pay] confirm', e); }
      await new Promise(ok => setTimeout(ok, 2500));
    }
    toast('ยังไม่ได้รับการยืนยันการชำระเงิน ของจะเข้าเองเมื่อชำระสำเร็จ (เปิดเกมใหม่ภายหลัง)');
  }

  pay.ready = (async () => {
    if (PB.isApp || !location.protocol.startsWith('http')) return;   // app stores require their own billing
    let cfg;
    try { cfg = await (await fetch('/api/config')).json(); } catch (e) { return; }
    if (!cfg.payments) return;
    try { await loadScript(SUPABASE_JS); } catch (e) { console.warn('[pay] supabase-js failed to load'); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    pay.products = cfg.products || {};
    pay.enabled = true;
    const { data } = await sb.auth.getSession();   // also picks up the sign-in link's token from the URL
    pay.user = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((ev, session) => {
      const was = pay.user && pay.user.id;
      pay.user = session ? session.user : null;
      if ((pay.user && pay.user.id) === was) return;
      pay.bought.clear();
      changed();
      if (pay.user) pay.sync().catch(e => console.warn('[pay] sync', e));
    });
    changed();
    if (pay.user) await pay.sync().catch(e => console.warn('[pay] sync', e));
    await handleReturn();
  })();
})();
