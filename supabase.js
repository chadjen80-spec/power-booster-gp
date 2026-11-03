// Supabase access for the game server: checks player sign-ins and reads/writes tables with the service role key.
// Player accounts (Ranked, purchases) are off until the three SUPABASE_* keys are set (see docs/PAYMENTS.md).
const env = process.env;

exports.enabled = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);

// the Supabase user behind an access token, or null
exports.userFromToken = async token => {
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
};

// Supabase REST with the service role key (bypasses row level security: server only, never sent to the game)
exports.db = (query, opts = {}) => {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1/${query}`, Object.assign({}, opts,
    { headers: Object.assign({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, opts.headers) }));
};

// rows from a REST query; throws on any database error
exports.rows = async (query, opts) => {
  const r = await exports.db(query, opts);
  if (!r.ok) throw new Error(`supabase ${r.status} ${await r.text()}`);
  return r.status === 204 ? [] : r.json();
};
