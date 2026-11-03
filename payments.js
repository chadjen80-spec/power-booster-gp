// Real-money purchases (web version): Stripe Checkout takes the payment, Supabase holds player accounts and the
// purchase record. Only this server decides what was paid for; the game grants items from GET /api/purchases.
// Off until the Stripe keys and the Supabase keys (supabase.js) are set (see docs/PAYMENTS.md).
const Stripe = require('stripe');
const sb = require('./supabase');

const env = process.env;
const enabled = !!(sb.enabled && env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
const stripe = enabled ? Stripe(env.STRIPE_SECRET_KEY) : null;

// price list; amounts in satang (3500 = 35.00 baht). What each product contains is in js/shop.js (PB.PRODUCTS).
const PRODUCTS = { starter: { name: 'Starter Pack — Power Booster GP', amount: 3500, currency: 'thb', once: true } };

function json(res, code, body) {   // also used by ranked.js
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// the Supabase user behind the request's access token, or null
function userFrom(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return m ? sb.userFromToken(m[1]) : null;
}
const purchasesOf = userId => sb.rows(`purchases?user_id=eq.${encodeURIComponent(userId)}&select=id,product,created_at&order=id`);
function origin(req) {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/+$/, '');
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
}

// a paid Checkout Session becomes a purchase row; safe to call more than once for the same session
async function recordPaid(session) {
  if (session.payment_status !== 'paid') return false;   // PromptPay can still be pending; async_payment_succeeded follows
  const product = session.metadata && session.metadata.product, user = session.client_reference_id;
  if (!PRODUCTS[product] || !user) return false;
  const r = await sb.db('purchases?on_conflict=stripe_session', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({ user_id: user, product, stripe_session: session.id, amount: session.amount_total, currency: session.currency }) });
  if (r.status === 409) {
    // a one-time product paid twice (two checkouts opened at once): the database keeps one, the other needs a refund
    console.warn(`[payments] duplicate ${product} for user ${user}, session ${session.id}: refund it in the Stripe dashboard`);
    return true;
  }
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  return true;
}

async function route(req, res, url) {
  if (url === '/api/config' && req.method === 'GET') {
    // accounts: sign-in for Ranked and purchases. The anon key is public by design; row level security protects the data.
    const cfg = { accounts: sb.enabled, payments: enabled };
    if (sb.enabled) Object.assign(cfg, { supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY });
    if (enabled) cfg.products = Object.fromEntries(Object.entries(PRODUCTS).map(([id, p]) => [id, { amount: p.amount, currency: p.currency }]));
    return json(res, 200, cfg);
  }
  if (!enabled) return json(res, 503, { error: 'payments are not set up on this server' });

  // Stripe calls this when a payment completes; the signature proves it came from Stripe
  if (url === '/api/stripe-webhook' && req.method === 'POST') {
    let event;
    try { event = stripe.webhooks.constructEvent(await readBody(req), req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET); }
    catch (e) { return json(res, 400, { error: 'bad signature' }); }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await recordPaid(event.data.object);
    }
    return json(res, 200, { received: true });
  }

  const user = await userFrom(req);
  if (!user) return json(res, 401, { error: 'not signed in' });

  if (url === '/api/purchases' && req.method === 'GET') return json(res, 200, { purchases: await purchasesOf(user.id) });

  if (url === '/api/checkout' && req.method === 'POST') {
    let body = {};
    try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) { /* treated as no product */ }
    const p = PRODUCTS[body.product];
    if (!p) return json(res, 400, { error: 'unknown product' });
    if (p.once && (await purchasesOf(user.id)).some(x => x.product === body.product)) return json(res, 409, { error: 'already bought' });
    const base = origin(req);
    // payment methods (card, PromptPay, ...) come from the Stripe dashboard settings
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: p.currency, unit_amount: p.amount, product_data: { name: p.name } } }],
      client_reference_id: user.id,
      customer_email: user.email || undefined,
      metadata: { product: body.product },
      success_url: `${base}/?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?paid=cancel`,
    });
    return json(res, 200, { url: session.url });
  }

  // back from Checkout: record the payment now instead of waiting for the webhook
  if (url === '/api/confirm' && req.method === 'POST') {
    let body = {};
    try { body = JSON.parse(await readBody(req) || '{}'); } catch (e) { /* no session id */ }
    if (!/^cs_[A-Za-z0-9_]+$/.test(body.session || '')) return json(res, 400, { error: 'bad session id' });
    const session = await stripe.checkout.sessions.retrieve(body.session);
    if (session.client_reference_id !== user.id) return json(res, 403, { error: 'not your purchase' });
    const paid = await recordPaid(session);
    return json(res, 200, { paid, purchases: await purchasesOf(user.id) });
  }

  return json(res, 404, { error: 'not found' });
}

// handles /api/* requests; errors become a 500 without taking the game server down
exports.handle = (req, res, url) => {
  route(req, res, url).catch(e => {
    console.error('[payments]', e);
    if (!res.headersSent) json(res, 500, { error: 'server error' });
  });
};
exports.enabled = enabled;
exports.json = json;
exports.userFrom = userFrom;
