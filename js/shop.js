// Coins + cosmetic shop: board skins bought with coins earned by racing. Skins only change colors, never stats.
(function () {
  const PB = window.PB;

  const RARITY = { common: 'ธรรมดา', rare: 'หายาก', epic: 'มหากาพย์', legend: 'ตำนาน' };
  // board / boardAccent / flame override the character's own colors; rainbow cycles the flame color
  PB.SKINS = [
    { id: 'default', name: 'สีประจำตัว', rarity: 'common', price: 0 },
    { id: 'neon', name: 'นีออนฟ้า', rarity: 'common', price: 150, board: 0x0a1a2a, boardAccent: 0x22f0ff, flame: 0x22f0ff },
    { id: 'sakura', name: 'ซากุระ', rarity: 'common', price: 250, board: 0xffc0dc, boardAccent: 0xff5aa8, flame: 0xff8ad0 },
    { id: 'mint', name: 'มินต์ช็อก', rarity: 'common', price: 300, board: 0x9af0d0, boardAccent: 0x3a2418, flame: 0x7affd0 },
    { id: 'lava', name: 'ลาวา', rarity: 'rare', price: 400, board: 0x2a0a06, boardAccent: 0xff5a1a, flame: 0xff3a10 },
    { id: 'ocean', name: 'คลื่นทะเล', rarity: 'rare', price: 450, board: 0x0a4a8a, boardAccent: 0xffffff, flame: 0x4ad0ff },
    { id: 'songkran', name: 'สงกรานต์', rarity: 'rare', price: 600, board: 0x2ad0ff, boardAccent: 0xffe04a, flame: 0x7af7ff },
    { id: 'midnight', name: 'มิดไนท์', rarity: 'epic', price: 800, board: 0x0a0a14, boardAccent: 0x8a4aff, flame: 0xb07aff },
    { id: 'gold', name: 'ทองคำ', rarity: 'epic', price: 1200, board: 0xd4a020, boardAccent: 0xfff0a0, flame: 0xffd23a },
    { id: 'rainbow', name: 'สายรุ้ง', rarity: 'legend', price: 2000, board: 0xffffff, boardAccent: 0xff3ad0, flame: 0xffffff, rainbow: true },
    // Season Pass rewards (js/pass.js): not sold in the shop
    { id: 'pass_bubble', name: 'บับเบิ้ลกัม', rarity: 'rare', pass: true, board: 0xff8ad8, boardAccent: 0x7af7ff, flame: 0xff9aff },
    { id: 's1_aurora', name: 'ออโรร่า', rarity: 'epic', pass: true, board: 0x0a2a3a, boardAccent: 0x3affb0, flame: 0x7affe0 },
    { id: 's1_cyber', name: 'ไซเบอร์', rarity: 'epic', pass: true, board: 0x101018, boardAccent: 0xff2a6a, flame: 0xff3ad0 },
    { id: 's1_phoenix', name: 'ฟีนิกซ์', rarity: 'legend', pass: true, board: 0x3a0a00, boardAccent: 0xffb020, flame: 0xff6a10 },
    { id: 's1_galaxy', name: 'กาแล็กซี', rarity: 'legend', pass: true, board: 0x140a3a, boardAccent: 0xffffff, flame: 0xffffff, rainbow: true },
    // Starter Pack (real money, js/pay.js): not sold for coins
    { id: 'starter_ace', name: 'เอซ', rarity: 'legend', pack: true, board: 0x111111, boardAccent: 0xffd23a, flame: 0xff4a2a },
  ];
  // what each real-money product gives; prices are set on the server (payments.js)
  PB.PRODUCTS = {
    starter: { name: 'Starter Pack', coins: 1000, skin: 'starter_ace' },
  };
  PB.RARITY = RARITY;

  // coins for finishing 1st..8th, scaled by bot difficulty; online races pay a little more
  const PLACE_COINS = [100, 80, 65, 55, 45, 40, 35, 30];
  const DIFF_MUL = [0.8, 1, 1.3];
  const START_COINS = 200;   // enough for a first skin right away

  const KEY = 'pb-shop';
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage unavailable or corrupt */ }
    if (!s || typeof s.coins !== 'number') s = { coins: START_COINS, owned: [], skin: 'default' };
    if (!Array.isArray(s.owned)) s.owned = [];
    if (!Array.isArray(s.granted)) s.granted = [];   // purchase ids already paid out on this device
    if (!PB.SKINS.some(k => k.id === s.skin)) s.skin = 'default';
    return s;
  }
  const save = load();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ } }

  const listeners = [];
  function changed() { persist(); listeners.forEach(f => f()); }

  PB.shop = {
    get coins() { return save.coins; },
    get skin() { return save.skin; },
    onChange(f) { listeners.push(f); },
    find: id => PB.SKINS.find(k => k.id === id) || PB.SKINS[0],
    owns: id => id === 'default' || save.owned.includes(id),
    buy(id) {
      const k = PB.shop.find(id);
      if (k.pass || k.pack || PB.shop.owns(k.id) || save.coins < k.price) return false;
      save.coins -= k.price; save.owned.push(k.id); save.skin = k.id;
      changed(); return true;
    },
    equip(id) {
      if (!PB.shop.owns(id)) return false;
      save.skin = PB.shop.find(id).id; changed(); return true;
    },
    reward(place, diff, online) {
      const n = Math.round(PLACE_COINS[Math.max(0, Math.min(7, place - 1))] * DIFF_MUL[diff] * (online ? 1.2 : 1));
      save.coins += n; changed(); return n;
    },
    addCoins(n) { save.coins += n; changed(); },
    give(id) { if (!PB.shop.owns(id)) { save.owned.push(id); changed(); } },
    // skins shown in the shop grid: everything for sale, plus pass and pack skins already owned
    shown: () => PB.SKINS.filter(k => !(k.pass || k.pack) || PB.shop.owns(k.id)),
    // pays out a server purchase record once per device; returns the product, or null if already paid out
    grantPurchase(p) {
      const prod = PB.PRODUCTS[p.product];
      if (!prod || save.granted.includes(p.id)) return null;
      save.granted.push(p.id);
      save.coins += prod.coins || 0;
      if (prod.skin && !PB.shop.owns(prod.skin)) { save.owned.push(prod.skin); save.skin = prod.skin; }
      changed(); return prod;
    },
    // character def with a skin's colors applied (unknown ids fall back to the character's own colors)
    dress(def, skinId) {
      const k = PB.shop.find(skinId);
      if (k.id === 'default') return def;
      return Object.assign({}, def, { board: k.board, boardAccent: k.boardAccent, flame: k.flame, rainbow: !!k.rainbow, boardSkin: k.id });
    },
    // skin for a bot: sometimes a shop skin, so players see what's on sale
    botSkin: () => (Math.random() < 0.4 ? PB.SKINS[1 + Math.floor(Math.random() * (PB.SKINS.length - 1))].id : 'default'),
  };
})();
