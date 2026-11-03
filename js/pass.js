// Daily missions + Season Pass: races and missions give XP, XP climbs pass tiers, tiers hold coin and skin rewards.
(function () {
  const PB = window.PB;

  const SEASON = { id: 1, name: 'NEON SUMMER', end: new Date(2026, 11, 31, 23, 59, 59) };
  const TIERS = 30;
  // XP to reach each tier: cheap first tiers so new players level up on day one, then ~6 weeks in total
  // at 5 races a day with every mission done
  const TIER_COST = [150, 300, 500, 800, 1100].concat(Array(TIERS - 5).fill(1650));
  const TIER_START = TIER_COST.reduce((a, c, i) => (a.push(a[i] + c), a), [0]);   // total XP at tier 0..TIERS
  const MAX_XP = TIER_START[TIERS];
  const XP_PLACE = [130, 115, 100, 90, 80, 70, 65, 60];   // race XP for 1st..8th
  const PREMIUM_PRICE = '149 บาท';
  const ALL_DONE = { xp: 200, coins: 100 };               // bonus for finishing all three missions of the day

  // a mission counts a race stat (see the stat() calls in js/game.js) up to its target
  const MISSIONS = [
    { id: 'races', stat: 'races', target: 3, xp: 150, coins: 50, text: 'ลงแข่งให้จบ 3 รอบ' },
    { id: 'top3', stat: 'top3', target: 2, xp: 180, coins: 60, text: 'จบใน 3 อันดับแรก 2 ครั้ง' },
    { id: 'win', stat: 'wins', target: 1, xp: 250, coins: 80, text: 'ชนะที่ 1 หนึ่งครั้ง' },
    { id: 'maxboost', stat: 'maxboost', target: 3, xp: 150, coins: 50, text: 'ขึ้น MAX BOOST (Lv.3) 3 ครั้ง' },
    { id: 'items', stat: 'items', target: 8, xp: 150, coins: 50, text: 'ใช้ไอเทม 8 ครั้ง' },
    { id: 'drift', stat: 'drift', target: 10, xp: 150, coins: 50, text: 'ดริฟต์จนได้เทอร์โบ 10 ครั้ง' },
    { id: 'air', stat: 'air', target: 5, xp: 150, coins: 50, text: 'ลอยตัวจากแท่นกระโดดแล้วได้บูสต์ตอนลงพื้น 5 ครั้ง' },
    { id: 'boxes', stat: 'boxes', target: 15, xp: 150, coins: 50, text: 'เก็บกล่องไอเทม 15 กล่อง' },
    { id: 'online', stat: 'online', target: 1, xp: 250, coins: 80, text: 'แข่งออนไลน์กับเพื่อน 1 รอบ' },
  ];

  // reward for each tier on both tracks: { coins } or { skin }, or null for an empty free slot
  function tierReward(tier, premium) {
    if (premium) {
      const skin = { 1: 's1_aurora', 10: 's1_cyber', 20: 's1_phoenix', 30: 's1_galaxy' }[tier];
      return skin ? { skin } : { coins: tier % 5 === 0 ? 300 : 100 };
    }
    if (tier === 15) return { skin: 'pass_bubble' };
    if (tier % 5 === 0) return { coins: 150 };
    return tier % 2 === 0 ? { coins: 50 } : null;
  }

  const KEY = 'pb-pass';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage unavailable or corrupt */ }
    if (!s || s.season !== SEASON.id) s = { season: SEASON.id, xp: 0, free: [], prem: [], premium: false, day: '', missions: [], bonus: false };
    return s;
  }
  const save = load();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ } }

  // the same three missions for everyone on a given day
  function pickMissions(day) {
    let h = 2166136261;
    for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const pool = MISSIONS.slice(), out = [];
    while (out.length < 3) { h = Math.imul(h ^ (h >>> 13), 1274126177); out.push(pool.splice((h >>> 0) % pool.length, 1)[0].id); }
    return out.map(id => ({ id, prog: 0, done: false }));
  }
  function refreshDay() {
    const d = today();
    if (save.day === d) return;
    save.day = d; save.missions = pickMissions(d); save.bonus = false;
    persist();
  }
  refreshDay();

  const tierOf = xp => { let t = 0; while (t < TIERS && xp >= TIER_START[t + 1]) t++; return t; };
  function grant(rw) {
    if (rw.coins) PB.shop.addCoins(rw.coins);
    if (rw.skin) PB.shop.give(rw.skin);
  }
  const claimable = (tier, premium) => tier <= tierOf(save.xp) && !!tierReward(tier, premium) &&
    !(premium ? save.prem : save.free).includes(tier) && (!premium || save.premium);

  PB.pass = {
    SEASON, TIERS, MAX_XP, PREMIUM_PRICE, tierReward,
    get xp() { return save.xp; },
    get tier() { return tierOf(save.xp); },
    // XP earned inside the current tier and the XP that tier needs
    progress() { const t = tierOf(save.xp); return t >= TIERS ? null : { into: save.xp - TIER_START[t], need: TIER_COST[t] }; },
    get premium() { return save.premium; },
    daysLeft: () => Math.max(0, Math.ceil((SEASON.end - Date.now()) / 86400000)),
    // hours until the daily missions change
    resetIn: () => { const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); return Math.ceil((m - n) / 3600000); },
    missions() {
      refreshDay();
      return save.missions.map(m => Object.assign({}, MISSIONS.find(x => x.id === m.id), m));
    },
    get bonusDone() { return save.bonus; },
    ALL_DONE,
    isClaimed: (tier, premium) => (premium ? save.prem : save.free).includes(tier),
    claimable,
    claim(tier, premium) {
      if (!claimable(tier, premium)) return null;
      const rw = tierReward(tier, premium);
      (premium ? save.prem : save.free).push(tier);
      persist(); grant(rw);
      return rw;
    },
    claimAll() {
      const got = [];
      for (let t = 1; t <= TIERS; t++) for (const p of [false, true]) { const rw = PB.pass.claim(t, p); if (rw) got.push(rw); }
      return got;
    },
    pending() {
      let n = 0;
      for (let t = 1; t <= TIERS; t++) for (const p of [false, true]) if (claimable(t, p)) n++;
      return n;
    },
    // premium needs real money; until a payment system exists this only says so
    buyPremium: () => false,
    // a finished race: race XP plus mission progress. Mission rewards are paid at once.
    recordRace({ place, online, stats }) {
      refreshDay();
      const tierBefore = tierOf(save.xp);
      const all = Object.assign({}, stats, { races: 1, top3: place <= 3 ? 1 : 0, wins: place === 1 ? 1 : 0, online: online ? 1 : 0 });
      let xp = Math.round(XP_PLACE[Math.max(0, Math.min(7, place - 1))] * (online ? 1.2 : 1));
      let coins = 0;
      const completed = [];
      for (const m of save.missions) {
        if (m.done) continue;
        const def = MISSIONS.find(x => x.id === m.id);
        m.prog = Math.min(def.target, m.prog + (all[def.stat] || 0));
        if (m.prog >= def.target) { m.done = true; xp += def.xp; coins += def.coins; completed.push(def.text); }
      }
      if (!save.bonus && save.missions.every(m => m.done)) { save.bonus = true; xp += ALL_DONE.xp; coins += ALL_DONE.coins; completed.push('ทำภารกิจครบทั้ง 3 ข้อ'); }
      save.xp = Math.min(MAX_XP, save.xp + xp);
      persist();
      if (coins) PB.shop.addCoins(coins);
      return { xp, coins, completed, tierBefore, tierAfter: tierOf(save.xp) };
    },
  };
})();
