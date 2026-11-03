// Real-money purchases (web version): pay on Stripe Checkout as a signed-in player (js/account.js), then the items
// arrive from the server's purchase record (payments.js). Off in the Android app and when the server has no keys.
(function () {
  const PB = window.PB;
  const acc = PB.account;
  const OFFER_HOURS = 72;

  const pay = PB.pay = { enabled: false, bought: new Set(), products: {}, onChange: null };
  Object.defineProperty(pay, 'user', { get: () => acc.user });
  pay.login = email => acc.login(email);
  pay.logout = () => acc.logout();

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
  PB.toast = toast;

  // pays out purchases this device hasn't granted yet (also restores them on a new device)
  function apply(list) {
    for (const p of list) {
      pay.bought.add(p.product);
      const prod = PB.shop.grantPurchase(p);
      if (prod) toast(`🎁 ได้รับ ${prod.name}: ${prod.label}`);
    }
    changed();
  }
  pay.sync = async () => { if (acc.user) apply((await acc.api('/api/purchases')).purchases); };
  pay.buy = async product => {
    const { url } = await acc.api('/api/checkout', { method: 'POST', body: JSON.stringify({ product }) });
    location.href = url;
  };

  // back from Stripe Checkout: ?paid=<session id> or ?paid=cancel
  async function handleReturn() {
    const q = new URLSearchParams(location.search), sid = q.get('paid');
    if (!sid) return;
    q.delete('paid');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    if (sid === 'cancel') { toast('ยกเลิกการชำระเงินแล้ว'); return; }
    if (!acc.user) return;
    // PromptPay can take a little while to clear, so ask a few times
    for (let i = 0; i < 6; i++) {
      try {
        const r = await acc.api('/api/confirm', { method: 'POST', body: JSON.stringify({ session: sid }) });
        apply(r.purchases);
        if (r.paid) return;
      } catch (e) { console.warn('[pay] confirm', e); }
      await new Promise(ok => setTimeout(ok, 2500));
    }
    toast('ยังไม่ได้รับการยืนยันการชำระเงิน ของจะเข้าเองเมื่อชำระสำเร็จ (เปิดเกมใหม่ภายหลัง)');
  }

  pay.ready = (async () => {
    await acc.ready;
    if (!acc.enabled || !acc.config.payments) return;
    pay.products = acc.config.products || {};
    pay.enabled = true;
    acc.onChange(() => {
      pay.bought.clear();
      changed();
      if (acc.user) pay.sync().catch(e => console.warn('[pay] sync', e));
    });
    changed();
    if (acc.user) await pay.sync().catch(e => console.warn('[pay] sync', e));
    await handleReturn();
  })();
})();
