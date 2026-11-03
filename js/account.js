// Player accounts (web version): sign in with an email link through Supabase. Used by Ranked (js/game.js) and
// purchases (js/pay.js). Off in the Android app and when the server has no Supabase keys.
(function () {
  const PB = window.PB;
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';

  const acc = PB.account = { enabled: false, user: null, config: {} };
  const listeners = [];
  let sb = null;
  acc.onChange = f => listeners.push(f);   // called when someone signs in or out
  const changed = () => listeners.forEach(f => f());

  function loadScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  acc.token = async () => { const { data } = await sb.auth.getSession(); return data.session ? data.session.access_token : null; };
  // this server's API, as the signed-in player
  acc.api = async (path, opts = {}) => {
    const token = sb ? await acc.token() : null;
    const r = await fetch(path, Object.assign({}, opts,
      { headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}) }));
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || 'HTTP ' + r.status), { status: r.status });
    return body;
  };
  acc.login = async email => {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
  };
  acc.logout = () => sb.auth.signOut();

  acc.ready = (async () => {
    if (PB.isApp || !location.protocol.startsWith('http')) return;   // the app would need its own sign-in redirect
    try { acc.config = await (await fetch('/api/config')).json(); } catch (e) { return; }
    if (!acc.config.accounts) return;
    try { await loadScript(SUPABASE_JS); } catch (e) { console.warn('[account] supabase-js failed to load'); return; }
    sb = window.supabase.createClient(acc.config.supabaseUrl, acc.config.supabaseAnonKey);
    acc.enabled = true;
    const { data } = await sb.auth.getSession();   // also picks up the sign-in link's token from the URL
    acc.user = data.session ? data.session.user : null;
    sb.auth.onAuthStateChange((ev, session) => {
      const was = acc.user && acc.user.id;
      acc.user = session ? session.user : null;
      if ((acc.user && acc.user.id) !== was) changed();
    });
    changed();
  })();
})();
