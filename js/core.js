/*
 * RotMG Randomizer: shared data, settings, RNG and helpers.
 *
 * Data comes from data/items.js (built by tools/build-data.mjs),
 * data/enchants.js and data/dungeons.js. Everything runs in the browser.
 * Every script shares the window.RR object.
 */
(function () {
  'use strict';

  const R = (window.RR = {});
  const DATA = window.ROTMG_DATA;
  R.ok = !!(DATA && DATA.items);
  if (!R.ok) {
    document.body.innerHTML = '<p style="padding:20px">data/items.js is missing. Run: node tools/build-data.mjs</p>';
    return;
  }

  R.DATA = DATA;
  R.ENCHANTS = window.ROTMG_ENCHANTS || [];
  R.DUNGEONS = window.ROTMG_DUNGEONS || { groups: [], sections: [], dungeons: [] };

  R.CATEGORIES = ['weapon', 'ability', 'armor', 'ring'];
  R.CATEGORY_NAMES = { weapon: 'Weapon', ability: 'Ability', armor: 'Armor', ring: 'Ring' };
  R.SLOTS = ['class', ...R.CATEGORIES];
  R.KINDS = [
    { id: 't', name: 'Tiered' },
    { id: 'ut', name: 'UT' },
    { id: 'st', name: 'ST' },
  ];
  // Item flags that can be turned off in settings.
  R.FLAGS = [
    { id: 'limited', name: 'Limited edition items', hint: 'Event, shop and retired items.' },
    { id: 'legacy', name: 'Legacy items', hint: 'Old versions kept after a rework.' },
    { id: 'reskin', name: 'Reskinned items', hint: 'Alternate weapon styles like Spellblades, Flails and Tachis.' },
  ];
  R.ENCHANT_LEVELS = ['I', 'II', 'III', 'IV'];

  // Challenge modes. "kinds" limits which item types can roll.
  // "excludes" lists modes that cannot be on at the same time.
  // "note" marks modes whose rules differ between groups.
  const VARIES = 'Rules for this mode differ between players and groups. Agree on the exact rules before you start.';
  R.MODES = [
    { id: 'ppe', name: 'PPE', long: 'Pet Player Experience',
      summary: 'Fresh character. Use only what this character loots. Pet allowed.',
      details: [
        'Start a new level 1 character.',
        'No trading, and no items from your vault, gift chest or other characters.',
        'Equip only items that drop for this character.',
        'Your pet and cosmetics (skins, dyes, cloths) are allowed.',
        'Common extra rules: no guild or Discord dungeons, no leeching, no UT forging, or forging only with blueprints found on this run.',
        'Daily login, mission, event and shop rewards are usually avoided.',
      ],
      note: 'Originally called "Pro Player Experience" by NeutralMan.' },
    { id: 'group', name: 'Group PPE', long: 'Duo or trio PPE',
      summary: 'PPE rules, but a fixed group may share items.',
      details: [
        'All PPE rules apply to every member.',
        'Pick the group before starting. Usually a duo or trio.',
        'Items may be traded and shared only inside the group.',
        'Play together. Loot from outside the group is still off limits.',
      ] },
    { id: 'npe', name: 'NPE', long: 'Non-pet Player Experience',
      summary: 'PPE rules without a pet.',
      details: [
        'All PPE rules apply.',
        'No pet: do not equip, feed or use one.',
        'Some players run it on a brand new account and call it "New Player Experience". A new account has no pet either.',
      ] },
    { id: 'upe', name: 'UPE', long: 'Untiered Player Experience', kinds: ['ut', 'st'], excludes: ['ironman', 'tpe'],
      summary: 'PPE rules, but never equip tiered gear.',
      details: [
        'All PPE rules apply.',
        'Drop your starter gear. Start with only a T0 weapon and no ability, armor or ring.',
        'Never equip tiered items. Only UT and ST gear.',
        'A slot stays empty until you find a UT or ST item for it.',
      ] },
    { id: 'tpe', name: 'TPE', long: 'Tiered Player Experience', kinds: ['t'], excludes: ['upe'],
      summary: 'PPE rules, tiered gear only, upgraded in tier order.',
      details: [
        'All PPE rules apply.',
        'Only equip tiered items. No UT or ST gear.',
        'Upgrade one tier at a time. You cannot skip a tier.',
      ] },
    { id: 'ironman', name: 'Iron Man', long: 'Tiered only', kinds: ['t'], excludes: ['upe'],
      summary: 'Tiered items only. No UT or ST gear.',
      details: [
        'Only tiered items can be equipped.',
        'No UT or ST gear, even if it drops.',
        'Unlike TPE, you may skip tiers.',
      ] },
    { id: 'hpe', name: 'HPE', long: 'Hardcore Player Experience',
      summary: 'One mistake or forbidden action ends the run.',
      details: [
        'Usually built on PPE rules.',
        'One death ends the run.',
        'Breaking any agreed rule also ends the run.',
        'Popularized by content creators such as Sebchoof.',
      ],
      note: VARIES },
    { id: 'bpe', name: 'BPE', long: 'Bail Player Experience',
      summary: 'Nexusing to escape death costs you gear.',
      details: [
        'Usually built on PPE rules.',
        'Every time you use the nexus key to escape death, you lose your highest tier item, or take another agreed penalty.',
      ],
      note: VARIES },
    { id: 'gpe', name: 'GPE', long: 'Gun-Game Player Experience',
      summary: 'Clear dungeons in order before moving up.',
      details: [
        'Usually built on PPE rules.',
        'Progress through dungeon difficulty in order. Clear the current tier before moving to harder content.',
        'Use lower tier or restricted gear while you progress.',
      ],
      note: VARIES },
    { id: 'realmlocke', name: 'Realmlocke', long: 'PetNPE, Nuzlocke style',
      summary: 'No pet, plus Nuzlocke style limits.',
      details: [
        'All NPE rules apply.',
        'Only the first drop from each boss or dungeon may be kept, in the spirit of a Pokemon Nuzlocke.',
        'Limit how many item slots you may fill.',
        'Set permadeath milestones: if you die before one, the run is over.',
      ],
      note: VARIES },
  ];

  // ---------- Data indexes ----------

  let items = DATA.items.map(([id, name, slot, tier, x, y, kind, flags, shinyOf]) => ({
    id, name, slot, tier, x, y, kind,
    flags: flags ? flags.split(',') : [],
    shinyOf: shinyOf || null,
    category: DATA.slotTypes[slot].category,
    typeName: DATA.slotTypes[slot].name,
  }));
  // Data built before shinies were linked to their base item. Link them here
  // with the same rules as tools/build-data.mjs: same name and a different
  // sprite is a shiny, same name and the same sprite is a duplicate.
  if (!items.some((it) => it.shinyOf)) {
    const byName = new Map();
    for (const it of items.slice().sort((a, b) => a.id - b.id)) {
      const k = it.slot + '|' + it.name.toLowerCase();
      const base = byName.get(k);
      it.flags = it.flags.filter((f) => f !== 'shiny');
      if (!base) { byName.set(k, it); continue; }
      if (base.x === it.x && base.y === it.y) { it.dupe = true; continue; }
      it.flags.push('shiny');
      it.shinyOf = base.id;
    }
    items = items.filter((it) => !it.dupe);
  }
  R.ITEMS = items;
  R.ITEM_BY_ID = new Map(R.ITEMS.map((it) => [it.id, it]));
  R.CLASSES = DATA.classes;
  R.CLASS_BY_ID = new Map(R.CLASSES.map((c) => [c.id, c]));
  R.SETS = DATA.sets.map((set) => ({
    name: set.name,
    group: set.group,
    items: set.ids.map((id) => R.ITEM_BY_ID.get(id)).filter(Boolean),
  }));
  // Base item id -> its shiny versions. Shinies never roll on their own, they
  // replace the base item at the shiny chance.
  R.SHINIES = new Map();
  for (const it of R.ITEMS) {
    if (!it.shinyOf) continue;
    if (!R.SHINIES.has(it.shinyOf)) R.SHINIES.set(it.shinyOf, []);
    R.SHINIES.get(it.shinyOf).push(it);
  }
  R.KIND_COUNTS = R.ITEMS.reduce((acc, it) => (it.shinyOf ? acc : ((acc[it.kind] = (acc[it.kind] || 0) + 1), acc)), {});

  // Highest tier per category, for the tier limit dropdowns.
  R.MAX_TIER = {};
  for (const it of R.ITEMS) {
    if (it.kind === 't') R.MAX_TIER[it.category] = Math.max(R.MAX_TIER[it.category] || 0, it.tier);
  }

  // ---------- Storage ----------

  R.store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        return v === null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ }
    },
  };
  R.KEYS = {
    settings: 'rotmgr.settings.v1',
    history: 'rotmgr.history.v1',
    used: 'rotmgr.used.v1',
    wheel: 'rotmgr.wheel.v1',
    run: 'rotmgr.run.v1',
    bingo: 'rotmgr.bingo.v1',
    secrets: 'rotmgr.secrets.v1',
  };

  // Streamer secrets (tip service tokens). Kept apart from settings, so they
  // are never in pop-out windows, OBS links, shared settings or backups.
  // They stay in this browser and are only sent to the service they belong to.
  R.secrets = {
    get(name) {
      if (R.overlay) return '';
      const all = R.store.get(R.KEYS.secrets, {});
      return typeof all[name] === 'string' ? all[name] : '';
    },
    set(name, value) {
      if (R.overlay) return;
      const all = R.store.get(R.KEYS.secrets, {});
      if (value) all[name] = value;
      else delete all[name];
      R.store.set(R.KEYS.secrets, all);
    },
    count() {
      return Object.keys(R.store.get(R.KEYS.secrets, {})).length;
    },
  };

  // ---------- Settings ----------

  // Hotkeys start unset. Common keys like WASD are used in game, so each
  // player picks their own. tabs: where the action is used.
  R.HOTKEYS = [
    { id: 'main', name: 'Main action of the tab', tabs: ['randomizer', 'wheel', 'run'] },
    { id: 'roll', name: 'Randomize', tabs: ['randomizer'] },
    { id: 'revealNext', name: 'Reveal next', tabs: ['randomizer'] },
    { id: 'revealAll', name: 'Reveal all', tabs: ['randomizer'] },
    { id: 'reroll1', name: 'Reroll class', tabs: ['randomizer'] },
    { id: 'reroll2', name: 'Reroll weapon', tabs: ['randomizer'] },
    { id: 'reroll3', name: 'Reroll ability', tabs: ['randomizer'] },
    { id: 'reroll4', name: 'Reroll armor', tabs: ['randomizer'] },
    { id: 'reroll5', name: 'Reroll ring', tabs: ['randomizer'] },
    { id: 'spin', name: 'Spin the wheel', tabs: ['wheel'] },
    { id: 'timer', name: 'Start or pause the run timer', tabs: ['run'] },
    { id: 'death', name: 'Add a death', tabs: ['run'] },
    { id: 'whiteBag', name: 'Add a white bag', tabs: ['run'] },
    { id: 'setBag', name: 'Add a set bag', tabs: ['run'] },
    { id: 'mute', name: 'Sound on or off', tabs: [] },
  ];
  R.KEYS_VERSION = 2;

  R.defaultSettings = function () {
    const tiers = {};
    for (const c of R.CATEGORIES) tiers[c] = [0, R.MAX_TIER[c] || 0];
    return {
      tab: 'randomizer',
      sidebarHidden: false,
      open: {},
      // Roll pool
      modes: {},
      houseRules: [],
      weights: { t: 50, ut: 45, st: 25 },
      include: Object.fromEntries(R.FLAGS.map((f) => [f.id, true])),
      enchants: { on: true, count: 4, unique: false },
      setChance: 0,
      shinyChance: 5,
      tiers,
      classesOff: [],
      noRepeat: { classes: false, items: false },
      // Randomizer extras
      reveal: { on: true, style: 'bag', autoOpen: false, hideClass: true },
      tokens: { on: false, count: 3 },
      dungeonOn: true,
      // Dungeon filters, shared by the wheel and bingo
      dungeonGroups: R.DUNGEONS.groups.map((g) => g.id),
      dungeonSections: R.DUNGEONS.sections.filter((x) => x.on).map((x) => x.id),
      wheel: { preset: 'dungeons', style: 'auto', duration: 10, images: true, popup: true },
      run: { deathCurse: false, logEvents: true },
      bingo: { size: 5, free: true, level: 'normal', dungeons: true, goals: true },
      // Effects and sound
      fx: { animate: true, speed: 'normal', particles: true, amount: 'normal', shake: true, glow: true, flash: true },
      sound: { on: true, volume: 50, style: 'retro', ui: true, spin: true, reveal: true, fanfare: true, events: true },
      look: { theme: 'dungeon', font: 'pixel', accent: '#e0b43c', scale: 100 },
      keys: Object.fromEntries(R.HOTKEYS.map((h) => [h.id, ''])),
      keysVersion: R.KEYS_VERSION,
      twitch: { channel: '', autoConnect: false, who: 'mods', prefix: '!', voteTime: 30,
        commands: { roll: true, reveal: true, spin: true, vote: true, death: true } },
      // Viewer events. Rules run when an event matches. Tokens are not here,
      // they live in R.secrets.
      events: {
        mode: 'queue', maxQueue: 20, combineSecs: 10, switchTab: false,
        se: false, sl: false, seAck: false, slAck: false, pointsAck: false,
        rules: [
          { id: 'r1', on: true, event: 'bits', min: 500, each: false, action: 'spin', target: 'curses', cooldown: 0 },
          { id: 'r2', on: true, event: 'gift', min: 5, each: false, action: 'spin', target: 'curses', cooldown: 0 },
          { id: 'r3', on: true, event: 'raid', min: 10, each: false, action: 'spin', target: 'dungeons', cooldown: 0 },
          { id: 'r4', on: true, event: 'tip', min: 5, each: true, action: 'spin', target: 'curses', cooldown: 0 },
          { id: 'r5', on: false, event: 'command', command: 'curse', who: 'mods', min: 0, action: 'spin', target: 'curses', cooldown: 30 },
        ],
      },
      obs: { port: 4455, ack: false, auto: false, sound: true, scene: '', back: true, onlyEvents: true },
      stream: { view: 'follow', bg: 'transparent', scale: 100, popBg: 'green', hold: 6, jump: true, history: true, historyCount: 3, layout: {} },
    };
  };

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  // Fills missing keys in saved from base, one level of nesting deep and more.
  function mergeDefaults(base, saved) {
    if (!isObj(saved)) return base;
    const out = { ...base };
    for (const k of Object.keys(saved)) {
      out[k] = isObj(base[k]) && isObj(saved[k]) ? mergeDefaults(base[k], saved[k]) : saved[k];
    }
    return out;
  }

  R.loadSettings = function () {
    const base = R.defaultSettings();
    const saved = R.store.get(R.KEYS.settings, null);
    if (!isObj(saved)) return base;
    // Older saves kept the animation toggle at the top level.
    if (typeof saved.animate === 'boolean' && !saved.fx) saved.fx = { animate: saved.animate };
    delete saved.animate;
    // Shinies used to be a checkbox. Off becomes a 0% chance.
    if (saved.include && saved.include.shiny === false && saved.shinyChance === undefined) saved.shinyChance = 0;
    if (saved.include) delete saved.include.shiny;
    // Saves from before hotkeys started off had letter keys set. Clear them once.
    if (saved.keysVersion !== R.KEYS_VERSION) {
      delete saved.keys;
      saved.keysVersion = R.KEYS_VERSION;
    }
    return mergeDefaults(base, saved);
  };

  R.saveSettings = function () {
    // OBS links carry their own settings, and pop-outs follow the main window.
    if (R.overlay && (R.overlay.cfg || R.overlay.sync)) return;
    R.store.set(R.KEYS.settings, R.settings);
    R.emit('settingsSaved');
  };

  // Settings sent from the main window to an OBS Browser Source.
  R.applySettings = function (saved) {
    R.settings = mergeDefaults(R.defaultSettings(), JSON.parse(JSON.stringify(saved)));
  };

  // Site wide setup. The Twitch Client ID is public by design. It only names
  // this site to Twitch, it is not a password.
  R.config = { twitchClientId: '' };

  R.settings = R.loadSettings();

  // ---------- Events ----------

  const handlers = {};
  R.on = function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); };
  R.off = function (name, fn) { handlers[name] = (handlers[name] || []).filter((f) => f !== fn); };
  R.once = function (name, fn) {
    const wrap = (d) => { R.off(name, wrap); fn(d); };
    R.on(name, wrap);
  };
  R.emit = function (name, data) { for (const fn of handlers[name] || []) fn(data); };

  // ---------- Seeded RNG ----------

  // Hash a string seed into a 32 bit number.
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  // mulberry32: small, fast PRNG with a good spread.
  R.makeRng = function (seedStr) {
    let a = hashSeed(String(seedStr));
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  R.newSeed = function () {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  R.pick = (arr, rng) => arr[Math.floor((rng || Math.random)() * arr.length)];

  R.shuffle = function (arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rng || Math.random)() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Picks a key from { key: weight } using the rng. Returns null if all weights are 0.
  R.pickWeighted = function (weights, rng) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (!total) return null;
    let r = rng() * total;
    for (const [k, w] of entries) {
      if ((r -= w) < 0) return k;
    }
    return entries[entries.length - 1][0];
  };

  // ---------- Pools ----------
  // R.poolOverride swaps the pool settings for one roll (the daily roll uses defaults).

  const pool = () => R.poolOverride || R.settings;

  // Item kinds allowed by the active challenge modes.
  R.allowedKinds = function () {
    let kinds = new Set(R.KINDS.map((k) => k.id));
    for (const m of R.MODES) {
      if (pool().modes[m.id] && m.kinds) kinds = new Set([...kinds].filter((k) => m.kinds.includes(k)));
    }
    return kinds;
  };

  // Effective weight per kind after modes and weights.
  R.effectiveWeights = function () {
    const kinds = R.allowedKinds();
    const w = {};
    for (const k of R.KINDS) w[k.id] = kinds.has(k.id) ? Number(pool().weights[k.id]) || 0 : 0;
    return w;
  };

  R.itemAllowed = function (it) {
    const s = pool();
    for (const f of R.FLAGS) {
      if (!s.include[f.id] && it.flags.includes(f.id)) return false;
    }
    if (it.kind === 't') {
      const [lo, hi] = s.tiers[it.category];
      if (it.tier < lo || it.tier > hi) return false;
    }
    return true;
  };

  // All items the class can equip in a category, after filters.
  R.slotPool = function (cls, category) {
    const slotType = cls.slots[R.CATEGORIES.indexOf(category)];
    const w = R.effectiveWeights();
    return R.ITEMS.filter((it) => !it.shinyOf && it.slot === slotType && w[it.kind] > 0 && R.itemAllowed(it));
  };

  // ST sets where every piece fits the class and passes filters.
  R.setsForClass = function (cls) {
    if (!R.effectiveWeights().st) return [];
    return R.SETS.filter((set) => set.items.length > 1 && set.items.every((it) => {
      if (!R.itemAllowed(it)) return false;
      return it.slot === cls.slots[R.CATEGORIES.indexOf(it.category)];
    }));
  };

  R.enabledClasses = function () {
    return R.CLASSES.filter((c) => !pool().classesOff.includes(c.id));
  };

  R.enabledDungeons = function (groups) {
    const s = R.settings;
    const g = groups || s.dungeonGroups;
    return R.DUNGEONS.dungeons.filter((d) => g.includes(d.group) && s.dungeonSections.includes(d.section));
  };

  R.dungeonByName = (name) => R.DUNGEONS.dungeons.find((d) => d.name === name) || null;

  R.dungeonSub = function (d) {
    const group = R.DUNGEONS.groups.find((g) => g.id === d.group);
    const section = R.DUNGEONS.sections.find((x) => x.id === d.section);
    return `${group ? group.name : ''}, difficulty ${d.difficulty}${section ? ` (${section.name})` : ''}`;
  };

  // Two enchantments conflict when one's labels hit the other's incompatible labels.
  function enchantsConflict(a, b) {
    return a.name === b.name
      || a.labels.some((l) => b.incompat.includes(l))
      || b.labels.some((l) => a.incompat.includes(l));
  }

  // Rolls up to N compatible enchantments. Returns [[enchantIndex, level], ...].
  R.rollEnchants = function (category, rng) {
    const cfg = pool().enchants;
    if (!cfg.on || !R.ENCHANTS.length) return [];
    let list = R.ENCHANTS.map((e, i) => ({ e, i }))
      .filter(({ e }) => e.slots.includes(category) && (cfg.unique || e.type !== 'unique'));
    const out = [];
    while (out.length < cfg.count && list.length) {
      const { e, i } = R.pick(list, rng);
      out.push([i, e.type === 'unique' ? 0 : Math.floor(rng() * R.ENCHANT_LEVELS.length)]);
      list = list.filter((p) => !enchantsConflict(p.e, e));
    }
    return out;
  };

  R.enchantLabel = function ([i, lvl]) {
    const e = R.ENCHANTS[i];
    if (!e) return '';
    return e.type === 'unique' ? e.name : `${e.name} ${R.ENCHANT_LEVELS[lvl] || ''}`.trim();
  };

  // ---------- Item text and rarity ----------

  R.kindLabel = function (it) {
    if (it.kind === 't') return `T${it.tier}`;
    if (it.kind === 'ut') return 'UT';
    return 'ST';
  };

  R.isShiny = (it) => it.flags.includes('shiny');

  R.itemText = function (it) {
    return `${it.typeName}: ${it.name}${R.isShiny(it) ? ' (Shiny)' : ''} (${R.kindLabel(it)})`;
  };

  R.wikiUrl = function (name) {
    return 'https://www.realmeye.com/wiki/' + encodeURIComponent(name.toLowerCase().replace(/[\s']/g, '-'));
  };

  // Loot bags in drop priority order, with the in-game colors.
  R.BAGS = {
    brown: { name: 'Brown bag', color: '#8a5a2b', light: '#b9824a', rank: 0 },
    pink: { name: 'Pink bag', color: '#e86fb0', light: '#ffa6d6', rank: 1 },
    purple: { name: 'Purple bag', color: '#8d4fd8', light: '#b98cff', rank: 2 },
    cyan: { name: 'Cyan bag', color: '#2fc4d6', light: '#8ff0fb', rank: 3 },
    orange: { name: 'Orange bag', color: '#f08a1c', light: '#ffc078', rank: 4 },
    white: { name: 'White bag', color: '#f4f4f4', light: '#ffffff', rank: 5 },
  };

  // Tier where tiered items move from a pink to a purple to a cyan bag.
  const BAG_TIERS = { weapon: [6, 9], armor: [6, 9], ability: [2, 4], ring: [1, 4] };

  R.bagOf = function (it) {
    if (!it) return 'brown';
    if (it.kind === 'ut') return 'white';
    if (it.kind === 'st') return 'orange';
    const [pink, purple] = BAG_TIERS[it.category] || [6, 9];
    if (it.tier <= pink) return 'pink';
    if (it.tier <= purple) return 'purple';
    return 'cyan';
  };

  // ---------- DOM helpers ----------

  R.$ = (id) => document.getElementById(id);

  // el('div', { class: 'x', text: 'hi', onclick: fn }, [children])
  R.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children || [])) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : String(c));
    }
    return node;
  };

  R.checkbox = function (labelText, checked, onChange, opts = {}) {
    const input = R.el('input', { type: 'checkbox', id: opts.id });
    input.checked = !!checked;
    input.disabled = !!opts.disabled;
    input.addEventListener('change', () => onChange(input.checked, input));
    const span = R.el('span', { text: labelText });
    if (opts.small) span.appendChild(R.el('small', { text: opts.small }));
    return R.el('label', { class: 'check' + (opts.disabled ? ' disabled' : '') }, [input, span]);
  };

  // Range slider with a value readout. fmt turns the value into text.
  R.range = function (labelText, value, min, max, step, onInput, opts = {}) {
    const fmt = opts.fmt || ((v) => String(v));
    const input = R.el('input', { type: 'range', min, max, step });
    input.value = value;
    input.disabled = !!opts.disabled;
    input.setAttribute('aria-label', labelText);
    const out = R.el('output', { text: fmt(value) });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = fmt(v);
      onInput(v);
    });
    const row = R.el('div', { class: 'range-row labeled' }, [R.el('span', { class: 'range-name', text: labelText }), input, out]);
    return row;
  };

  // Dropdown. options: [[value, label], ...]
  R.select = function (labelText, value, options, onChange) {
    const sel = R.el('select');
    for (const [v, label] of options) sel.appendChild(R.el('option', { value: v, text: label }));
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    return R.el('label', { class: 'field' }, [R.el('span', { class: 'field-name', text: labelText }), sel]);
  };

  let toastTimer = null;
  R.toast = function (msg) {
    const t = R.$('toast');
    if (!t) return;
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.textContent = ''; }, 2200);
    // Toasts outside the randomizer show in a floating box.
    if (R.settings.tab === 'randomizer') return;
    const float = R.$('floatToast') || document.body.appendChild(R.el('div', { id: 'floatToast', class: 'float-toast', role: 'status' }));
    float.textContent = msg;
    float.classList.add('show');
    clearTimeout(float._t);
    float._t = setTimeout(() => float.classList.remove('show'), 2200);
  };

  R.copy = async function (text, msg) {
    try {
      await navigator.clipboard.writeText(text);
      R.toast(msg);
    } catch (e) {
      window.prompt('Copy this:', text);
    }
  };

  R.fmtTime = function (ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  R.today = () => new Date().toISOString().slice(0, 10);

  // ---------- Overlay and sync ----------
  // ?overlay=1 hides everything but the content, for OBS.
  // &sync=1 makes the page follow the window that opened it.

  R.params = new URLSearchParams(location.search);
  R.overlay = null;
  if (R.params.get('overlay') === '1') {
    R.overlay = {
      view: R.params.get('view') || 'follow',
      bg: R.params.get('bg') || 'transparent',
      scale: Number(R.params.get('scale')) || 100,
      // sync=1 follows the main window in the same browser. sync=obs is an
      // OBS Browser Source that follows it through OBS WebSocket.
      sync: R.params.get('sync') === '1' || R.params.get('sync') === 'obs',
      sound: R.params.get('sound') === '1',
      cfg: null,
    };
    const cfg = R.params.get('cfg');
    if (cfg) {
      try {
        R.overlay.cfg = JSON.parse(decodeURIComponent(escape(atob(cfg))));
        R.settings = mergeDefaults(R.defaultSettings(), R.overlay.cfg);
      } catch (e) { /* bad cfg, keep local settings */ }
    }
  }

  // Settings packed into a link, for OBS browser sources that do not share storage.
  R.packSettings = function () {
    // Never put streamer secrets in a link, even if one ends up in settings.
    const s = { ...R.settings, open: {} };
    delete s.secrets;
    return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  };

  R.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('rotmgr-sync') : null;
  R.follower = !!(R.overlay && R.overlay.sync);
  R.sync = {
    // Main window: tell overlay windows what happened.
    send(type, data) {
      if (R.follower) return;
      if (channel) channel.postMessage({ type, data });
      if (R.bridge) R.bridge(type, data);
    },
    // Overlay window: ask the main window for everything.
    hello() {
      if (channel) channel.postMessage({ type: 'hello' });
    },
    listen(fn) {
      if (channel) channel.addEventListener('message', (e) => fn(e.data.type, e.data.data));
      // OBS hands messages to its Browser Sources as a window event.
      window.addEventListener('rotmgr', (e) => { if (e.detail && e.detail.type) fn(e.detail.type, e.detail.data); });
    },
  };
})();
