/*
 * RotMG Randomizer
 *
 * Data comes from data/items.js (built by tools/build-data.mjs),
 * data/enchants.js and data/dungeons.js. Everything runs in the browser.
 */
(function () {
  'use strict';

  const DATA = window.ROTMG_DATA;
  const ENCHANTS = window.ROTMG_ENCHANTS || [];
  const DUNGEONS = window.ROTMG_DUNGEONS || { groups: [], sections: [], dungeons: [] };

  const CATEGORIES = ['weapon', 'ability', 'armor', 'ring'];
  const CATEGORY_NAMES = { weapon: 'Weapon', ability: 'Ability', armor: 'Armor', ring: 'Ring' };
  const KINDS = [
    { id: 't', name: 'Tiered' },
    { id: 'ut', name: 'UT' },
    { id: 'st', name: 'ST' },
  ];
  // Item flags that can be turned off in settings.
  const FLAGS = [
    { id: 'shiny', name: 'Shiny items', hint: 'Rare recolored versions of UT items.' },
    { id: 'limited', name: 'Limited edition items', hint: 'Event, shop and retired items.' },
    { id: 'legacy', name: 'Legacy items', hint: 'Old versions kept after a rework.' },
    { id: 'reskin', name: 'Reskinned items', hint: 'Alternate weapon styles like Spellblades, Flails and Tachis.' },
  ];
  const ENCHANT_LEVELS = ['I', 'II', 'III', 'IV'];
  const STORAGE_SETTINGS = 'rotmgr.settings.v1';
  const STORAGE_HISTORY = 'rotmgr.history.v1';
  const HISTORY_MAX = 25;

  // Challenge modes. "kinds" limits which item types can roll.
  // "excludes" lists modes that cannot be on at the same time.
  // "note" marks modes whose rules differ between groups.
  const VARIES = 'Rules for this mode differ between players and groups. Agree on the exact rules before you start.';
  const MODES = [
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

  if (!DATA || !DATA.items) {
    document.body.innerHTML = '<p style="padding:20px">data/items.js is missing. Run: node tools/build-data.mjs</p>';
    return;
  }

  // ---------- Data indexes ----------

  // Items as objects for readability.
  const ITEMS = DATA.items.map(([id, name, slot, tier, x, y, kind, flags]) => ({
    id, name, slot, tier, x, y, kind,
    flags: flags ? flags.split(',') : [],
    category: DATA.slotTypes[slot].category,
    typeName: DATA.slotTypes[slot].name,
  }));
  const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
  const CLASSES = DATA.classes;
  const CLASS_BY_ID = new Map(CLASSES.map((c) => [c.id, c]));
  // Sets are { name, group, ids } from the builder.
  const SETS = DATA.sets.map((set) => ({
    name: set.name,
    group: set.group,
    items: set.ids.map((id) => ITEM_BY_ID.get(id)).filter(Boolean),
  }));
  const KIND_COUNTS = ITEMS.reduce((acc, it) => ((acc[it.kind] = (acc[it.kind] || 0) + 1), acc), {});

  // Highest tier per category, for the tier limit dropdowns.
  const MAX_TIER = {};
  for (const it of ITEMS) {
    if (it.kind === 't') MAX_TIER[it.category] = Math.max(MAX_TIER[it.category] || 0, it.tier);
  }

  // ---------- Settings ----------

  function defaultSettings() {
    const tiers = {};
    for (const c of CATEGORIES) tiers[c] = [0, MAX_TIER[c] || 0];
    return {
      modes: {},
      weights: { t: 50, ut: 35, st: 15 },
      include: Object.fromEntries(FLAGS.map((f) => [f.id, true])),
      enchants: { on: false, count: 1, unique: false },
      setChance: 0,
      animate: true,
      sidebarHidden: false,
      tiers,
      classesOff: [],
      dungeonOn: true,
      dungeonGroups: DUNGEONS.groups.map((g) => g.id),
      dungeonSections: DUNGEONS.sections.filter((x) => x.on).map((x) => x.id),
    };
  }

  function loadSettings() {
    const base = defaultSettings();
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || 'null');
      if (saved && typeof saved === 'object') {
        return {
          ...base,
          ...saved,
          weights: { ...base.weights, ...saved.weights },
          include: { ...base.include, ...saved.include },
          enchants: { ...base.enchants, ...saved.enchants },
          tiers: { ...base.tiers, ...saved.tiers },
        };
      }
    } catch (e) { /* storage blocked or bad JSON */ }
    return base;
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  let settings = loadSettings();

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
  function makeRng(seedStr) {
    let a = hashSeed(String(seedStr));
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newSeed() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // Picks a key from { key: weight } using the rng. Returns null if all weights are 0.
  function pickWeighted(weights, rng) {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (!total) return null;
    let r = rng() * total;
    for (const [k, w] of entries) {
      if ((r -= w) < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  // ---------- Pools ----------

  // Item kinds allowed by the active challenge modes.
  function allowedKinds() {
    let kinds = new Set(KINDS.map((k) => k.id));
    for (const m of MODES) {
      if (settings.modes[m.id] && m.kinds) kinds = new Set([...kinds].filter((k) => m.kinds.includes(k)));
    }
    return kinds;
  }

  // Effective weight per kind after modes and weights.
  function effectiveWeights() {
    const kinds = allowedKinds();
    const w = {};
    for (const k of KINDS) w[k.id] = kinds.has(k.id) ? Number(settings.weights[k.id]) || 0 : 0;
    return w;
  }

  function itemAllowed(it) {
    for (const f of FLAGS) {
      if (!settings.include[f.id] && it.flags.includes(f.id)) return false;
    }
    if (it.kind === 't') {
      const [lo, hi] = settings.tiers[it.category];
      if (it.tier < lo || it.tier > hi) return false;
    }
    return true;
  }

  // All items the class can equip in a category, after filters.
  function slotPool(cls, category) {
    const slotType = cls.slots[CATEGORIES.indexOf(category)];
    const w = effectiveWeights();
    return ITEMS.filter((it) => it.slot === slotType && w[it.kind] > 0 && itemAllowed(it));
  }

  // Weighted roll: pick an item kind by weight, then an item of that kind.
  function rollItem(cls, category, rng) {
    const pool = slotPool(cls, category);
    if (!pool.length) return null;
    const w = effectiveWeights();
    const present = {};
    for (const it of pool) present[it.kind] = w[it.kind];
    const kind = pickWeighted(present, rng);
    return pick(pool.filter((it) => it.kind === kind), rng);
  }

  // ST sets where every non ring piece fits the class and passes filters.
  function setsForClass(cls) {
    if (!effectiveWeights().st) return [];
    return SETS.filter((set) => set.items.length > 1 && set.items.every((it) => {
      if (!itemAllowed(it)) return false;
      return it.slot === cls.slots[CATEGORIES.indexOf(it.category)];
    }));
  }

  function enabledClasses() {
    return CLASSES.filter((c) => !settings.classesOff.includes(c.id));
  }

  function enabledDungeons() {
    return DUNGEONS.dungeons.filter((d) => settings.dungeonGroups.includes(d.group)
      && settings.dungeonSections.includes(d.section));
  }

  // Two enchantments conflict when one's labels hit the other's incompatible labels.
  function enchantsConflict(a, b) {
    return a.name === b.name
      || a.labels.some((l) => b.incompat.includes(l))
      || b.labels.some((l) => a.incompat.includes(l));
  }

  // Rolls up to N compatible enchantments. Returns [[enchantIndex, level], ...].
  function rollEnchants(category, rng) {
    const cfg = settings.enchants;
    if (!cfg.on || !ENCHANTS.length) return [];
    let pool = ENCHANTS.map((e, i) => ({ e, i }))
      .filter(({ e }) => e.slots.includes(category) && (cfg.unique || e.type !== 'unique'));
    const out = [];
    while (out.length < cfg.count && pool.length) {
      const { e, i } = pick(pool, rng);
      out.push([i, e.type === 'unique' ? 0 : Math.floor(rng() * ENCHANT_LEVELS.length)]);
      pool = pool.filter((p) => !enchantsConflict(p.e, e));
    }
    return out;
  }

  function enchantLabel([i, lvl]) {
    const e = ENCHANTS[i];
    if (!e) return '';
    return e.type === 'unique' ? e.name : `${e.name} ${ENCHANT_LEVELS[lvl] || ''}`.trim();
  }

  // ---------- Roll state ----------

  const state = {
    seed: '',
    classId: null,
    items: { weapon: null, ability: null, armor: null, ring: null },
    enchants: { weapon: [], ability: [], armor: [], ring: [] },
    dungeon: null, // dungeon name
    fromSet: null, // name of the ST set this roll came from
    locks: { class: false, weapon: false, ability: false, armor: false, ring: false, dungeon: false },
  };
  let notices = [];

  function currentClass() { return CLASS_BY_ID.get(state.classId) || null; }

  // Unlocks items the class cannot use after a class change.
  function dropIncompatibleLocks(cls) {
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(state.items[c]);
      if (state.locks[c] && it && it.slot !== cls.slots[CATEGORIES.indexOf(c)]) {
        notices.push(`${it.name} was unlocked because ${cls.name} cannot equip it.`);
        state.locks[c] = false;
      }
    }
  }

  function rollSlot(category, rng) {
    const cls = currentClass();
    const it = cls ? rollItem(cls, category, rng) : null;
    state.items[category] = it ? it.id : null;
    state.enchants[category] = it ? rollEnchants(category, rng) : [];
  }

  function rollClass(rng) {
    const pool = enabledClasses();
    if (!pool.length) {
      notices.push('No classes are turned on. Enable at least one in Settings > Classes.');
      return false;
    }
    state.classId = pick(pool, rng).id;
    dropIncompatibleLocks(currentClass());
    return true;
  }

  function rollDungeon(rng) {
    const pool = enabledDungeons();
    state.dungeon = pool.length ? pick(pool, rng).name : null;
  }

  // Dungeon has its own button, separate from the class and item roll.
  function rollDungeonNow() {
    rollDungeon(makeRng(newSeed()));
    writeHash();
    animate(['dungeon']);
  }

  // Full roll. Locked slots are kept.
  function rollAll(seed) {
    notices = [];
    state.seed = seed || newSeed();
    const rng = makeRng(state.seed);
    const spun = [];
    if (!state.locks.class || !currentClass()) {
      if (!rollClass(rng)) { render(); return; }
      spun.push('class');
    }
    const cls = currentClass();
    state.fromSet = null;

    // ST set roll.
    const open = CATEGORIES.filter((c) => !state.locks[c]);
    if (settings.setChance > 0 && open.length && rng() * 100 < settings.setChance) {
      const sets = setsForClass(cls);
      if (sets.length) {
        const set = pick(sets, rng);
        for (const it of set.items) {
          if (!state.locks[it.category]) {
            state.items[it.category] = it.id;
            state.enchants[it.category] = rollEnchants(it.category, rng);
          }
        }
        // Fill slots the set does not cover.
        for (const c of open) if (!set.items.some((it) => it.category === c)) rollSlot(c, rng);
        state.fromSet = set.name;
      } else {
        notices.push(`No ST set fits ${cls.name} with the current filters. Rolled single items.`);
      }
    }
    if (!state.fromSet) for (const c of open) rollSlot(c, rng);
    finishRoll(spun.concat(open));
  }

  // Reroll one slot with a fresh random seed.
  function rerollOne(slot) {
    notices = [];
    const rng = makeRng(newSeed());
    const before = { ...state.items };
    if (slot === 'class') {
      if (!rollClass(rng)) { render(); return; }
      // Items that no longer fit get rerolled, locked ones were unlocked above.
      const cls = currentClass();
      for (const c of CATEGORIES) {
        const it = ITEM_BY_ID.get(state.items[c]);
        if (!state.locks[c] && (!it || it.slot !== cls.slots[CATEGORIES.indexOf(c)])) rollSlot(c, rng);
      }
    } else {
      rollSlot(slot, rng);
    }
    state.fromSet = null;
    state.seed = '';
    finishRoll([slot, ...CATEGORIES.filter((c) => c !== slot && state.items[c] !== before[c])]);
  }

  // spun: slots that changed and should play the slot machine animation.
  function finishRoll(spun) {
    const cls = currentClass();
    if (cls) {
      for (const c of CATEGORIES) {
        if (state.items[c] === null && !slotPool(cls, c).length) {
          notices.push(`No ${CATEGORY_NAMES[c].toLowerCase()} fits ${cls.name} with the current filters.`);
        }
      }
    }
    addHistory();
    writeHash();
    animate(spun);
  }

  // ---------- Text helpers ----------

  function kindLabel(it) {
    if (it.kind === 't') return `T${it.tier}`;
    if (it.kind === 'ut') return 'UT';
    return 'ST';
  }

  const isShiny = (it) => it.flags.includes('shiny');

  function itemText(it) {
    return `${it.typeName}: ${it.name}${isShiny(it) ? ' (Shiny)' : ''} (${kindLabel(it)})`;
  }

  function wikiUrl(name) {
    return 'https://www.realmeye.com/wiki/' + encodeURIComponent(name.toLowerCase().replace(/[\s']/g, '-'));
  }

  function rollAsText() {
    const cls = currentClass();
    if (!cls) return '';
    const parts = [cls.name];
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(state.items[c]);
      let t = it ? itemText(it) : `${CATEGORY_NAMES[c]}: none`;
      if (state.enchants[c].length) t += ` [${state.enchants[c].map(enchantLabel).join(', ')}]`;
      parts.push(t);
    }
    if (settings.dungeonOn && state.dungeon) parts.push(`Dungeon: ${state.dungeon}`);
    const modes = MODES.filter((m) => settings.modes[m.id]).map((m) => m.name);
    if (modes.length) parts.push(`Modes: ${modes.join(', ')}`);
    return parts.join(' | ');
  }

  // ---------- Share link (URL hash) ----------
  // Format: #c=<classId>&w=<id>&a=<id>&ar=<id>&r=<id>&d=<dungeon>&m=<modes>&s=<seed>

  function writeHash() {
    const p = new URLSearchParams();
    if (state.classId !== null) p.set('c', state.classId);
    const keys = { weapon: 'w', ability: 'a', armor: 'ar', ring: 'r' };
    for (const c of CATEGORIES) {
      if (state.items[c] !== null) p.set(keys[c], state.items[c]);
      if (state.enchants[c].length) p.set(keys[c] + 'e', state.enchants[c].map((e) => e.join('.')).join('_'));
    }
    if (settings.dungeonOn && state.dungeon) p.set('d', state.dungeon);
    const modes = MODES.filter((m) => settings.modes[m.id]).map((m) => m.id);
    if (modes.length) p.set('m', modes.join(','));
    if (state.seed) p.set('s', state.seed);
    history.replaceState(null, '', '#' + p.toString());
  }

  function parseEnchants(str) {
    if (!str) return [];
    return str.split('_').map((x) => x.split('.').map(Number))
      .filter(([i, l]) => ENCHANTS[i] && l >= 0 && l < ENCHANT_LEVELS.length);
  }

  // Loads a roll from the URL hash. Returns true if a roll was found.
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const cls = CLASS_BY_ID.get(Number(p.get('c')));
    if (!cls) return false;
    state.classId = cls.id;
    const keys = { weapon: 'w', ability: 'a', armor: 'ar', ring: 'r' };
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(Number(p.get(keys[c])));
      state.items[c] = it && it.slot === cls.slots[CATEGORIES.indexOf(c)] ? it.id : null;
      state.enchants[c] = parseEnchants(p.get(keys[c] + 'e'));
    }
    state.dungeon = p.get('d');
    state.seed = p.get('s') || '';
    if (p.has('m')) {
      const ids = p.get('m').split(',');
      settings.modes = {};
      for (const m of MODES) if (ids.includes(m.id)) settings.modes[m.id] = true;
    }
    return true;
  }

  // ---------- History ----------

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); } catch (e) { return []; }
  }

  function addHistory() {
    if (!currentClass()) return;
    const list = loadHistory();
    list.unshift({
      text: rollAsText(),
      time: Date.now(),
      state: { c: state.classId, i: { ...state.items }, e: { ...state.enchants }, d: state.dungeon, s: state.seed },
    });
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(list.slice(0, HISTORY_MAX))); } catch (e) { /* ignore */ }
  }

  function restoreHistory(entry) {
    if (!entry || !entry.state || !CLASS_BY_ID.has(entry.state.c)) return;
    state.classId = entry.state.c;
    for (const c of CATEGORIES) state.items[c] = ITEM_BY_ID.has(entry.state.i[c]) ? entry.state.i[c] : null;
    for (const c of CATEGORIES) state.enchants[c] = (entry.state.e && entry.state.e[c]) || [];
    state.dungeon = entry.state.d || null;
    state.seed = entry.state.s || '';
    state.fromSet = null;
    notices = [];
    writeHash();
    render();
  }

  // ---------- Rendering ----------

  const $ = (id) => document.getElementById(id);

  const ICONS = {
    lock: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z"/></svg>',
    unlock: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 7.7-1.5l-1.8.8A2 2 0 0 0 6 5v2h7v8H3V7h1z"/></svg>',
    reroll: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2v3h-3" stroke-linejoin="round"/></svg>',
  };

  function setSprite(el, it) {
    if (!it) {
      el.classList.add('empty');
      el.style.backgroundImage = '';
      return;
    }
    const sheet = DATA.meta.sheet;
    const box = el.clientWidth || 80;
    const scale = box / sheet.cell;
    el.classList.remove('empty');
    el.style.backgroundImage = `url("${sheet.file}")`;
    el.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    el.style.backgroundPosition = `-${it.x * scale}px -${it.y * scale}px`;
  }

  function actionButtons(container, slot, label) {
    container.innerHTML = '';
    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'icon-btn' + (state.locks[slot] ? ' locked' : '');
    lock.innerHTML = state.locks[slot] ? ICONS.lock : ICONS.unlock;
    lock.title = (state.locks[slot] ? 'Unlock ' : 'Lock ') + label;
    lock.setAttribute('aria-label', lock.title);
    lock.setAttribute('aria-pressed', String(state.locks[slot]));
    lock.addEventListener('click', () => { state.locks[slot] = !state.locks[slot]; render(); });

    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.className = 'icon-btn';
    reroll.innerHTML = ICONS.reroll;
    reroll.title = 'Reroll ' + label;
    reroll.setAttribute('aria-label', reroll.title);
    reroll.addEventListener('click', () => rerollOne(slot));

    container.append(lock, reroll);
  }

  // Builds the four slot cards once.
  function buildSlots() {
    const wrap = $('slots');
    for (const c of CATEGORIES) {
      const card = document.createElement('div');
      card.className = 'panel slot';
      card.id = 'slot-' + c;
      card.innerHTML = `
        <div class="sprite" aria-hidden="true"></div>
        <div class="slot-body">
          <span class="label"></span>
          <p class="slot-name"></p>
          <span class="badges"></span>
          <ul class="enchants"></ul>
        </div>
        <div class="slot-actions"></div>`;
      wrap.appendChild(card);
    }
  }

  // ---------- Slot drawing ----------
  // Each draw* function paints one card. render* functions paint the final
  // state; the slot machine animation paints random frames with the same
  // draw functions first.

  function cardFor(slot) {
    if (slot === 'class') return $('classCard');
    if (slot === 'dungeon') return $('dungeonCard');
    return $('slot-' + slot);
  }

  function setClassImage(el, cls) {
    if (cls && cls.img) {
      el.classList.remove('empty');
      el.style.backgroundImage = `url("${cls.img}")`;
      el.style.backgroundSize = 'contain';
      el.style.backgroundPosition = 'center';
      return;
    }
    // Fallback: the class's starter weapon.
    const starter = cls
      ? ITEMS.filter((it) => it.slot === cls.slots[0] && it.kind === 't').sort((a, b) => a.tier - b.tier)[0]
      : null;
    setSprite(el, starter);
  }

  function drawClass(cls) {
    $('className').textContent = cls ? cls.name : 'Press Randomize';
    $('classSlots').textContent = cls
      ? cls.slots.slice(0, 3).map((t) => DATA.slotTypes[t].name).join(' / ') + ' / Ring'
      : '';
    setClassImage($('classSprite'), cls);
  }

  function addBadge(parent, cls, label) {
    const b = document.createElement('span');
    b.className = 'badge ' + cls;
    b.textContent = label;
    parent.appendChild(b);
  }

  // Paints an item card. "full" adds the wiki link, flags and enchantments.
  function drawItem(c, it, full) {
    const cls = currentClass();
    const card = $('slot-' + c);
    const typeName = it ? it.typeName
      : cls ? DATA.slotTypes[cls.slots[CATEGORIES.indexOf(c)]].name : CATEGORY_NAMES[c];
    card.querySelector('.label').textContent = typeName;
    const nameEl = card.querySelector('.slot-name');
    nameEl.textContent = '';
    if (it && full) {
      const a = document.createElement('a');
      a.href = wikiUrl(it.name);
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = it.name;
      a.title = 'Open on RealmEye wiki';
      nameEl.appendChild(a);
    } else {
      nameEl.textContent = it ? it.name : cls ? 'No item fits the current filters' : '-';
    }
    const badges = card.querySelector('.badges');
    badges.innerHTML = '';
    if (it) {
      addBadge(badges, it.kind, kindLabel(it));
      if (full) {
        if (isShiny(it)) addBadge(badges, 'shiny', 'Shiny');
        if (it.flags.includes('limited')) addBadge(badges, 'flag', 'Limited');
        if (it.flags.includes('legacy')) addBadge(badges, 'flag', 'Legacy');
        if (it.flags.includes('reskin')) addBadge(badges, 'flag', 'Reskin');
      }
    }
    const ench = card.querySelector('.enchants');
    ench.innerHTML = '';
    const list = full ? state.enchants[c] : [];
    for (const e of list) {
      const li = document.createElement('li');
      li.textContent = enchantLabel(e);
      li.title = ENCHANTS[e[0]].effect;
      ench.appendChild(li);
    }
    ench.hidden = !list.length;
    setSprite(card.querySelector('.sprite'), it);
  }

  function drawDungeon(d) {
    $('dungeonName').textContent = d ? d.name : '-';
    const group = d && DUNGEONS.groups.find((g) => g.id === d.group);
    const section = d && DUNGEONS.sections.find((x) => x.id === d.section);
    $('dungeonGroup').textContent = d
      ? `${group.name}, difficulty ${d.difficulty} (${section.name})`
      : enabledDungeons().length ? 'Press Roll dungeon' : 'No dungeon matches the dungeon filters';
    const img = $('dungeonImg');
    if (d && d.img) {
      img.classList.remove('empty');
      img.style.backgroundImage = `url("${d.img}")`;
    } else {
      img.classList.add('empty');
      img.style.backgroundImage = '';
    }
  }

  function renderClass() {
    drawClass(currentClass());
    $('classCard').classList.toggle('is-locked', state.locks.class);
    actionButtons($('classCard').querySelector('.slot-actions'), 'class', 'class');
  }

  function renderItem(c) {
    const cls = currentClass();
    const it = ITEM_BY_ID.get(state.items[c]) || null;
    drawItem(c, it, true);
    $('slot-' + c).className = 'panel slot' + (it ? ' kind-' + it.kind : cls ? ' empty' : '')
      + (state.locks[c] ? ' is-locked' : '');
    actionButtons($('slot-' + c).querySelector('.slot-actions'), c, CATEGORY_NAMES[c].toLowerCase());
  }

  function renderDungeon() {
    $('dungeonCard').hidden = !settings.dungeonOn;
    drawDungeon(DUNGEONS.dungeons.find((d) => d.name === state.dungeon) || null);
  }

  function renderSlot(slot) {
    if (slot === 'class') renderClass();
    else if (slot === 'dungeon') renderDungeon();
    else renderItem(slot);
  }

  function render() {
    renderClass();
    for (const c of CATEGORIES) renderItem(c);
    renderDungeon();

    // Seed box
    $('seedInput').value = state.seed;

    // Rules
    const active = MODES.filter((m) => settings.modes[m.id]);
    $('rulesPanel').hidden = !active.length && !state.fromSet;
    const ul = $('rulesList');
    ul.innerHTML = '';
    if (state.fromSet) {
      const li = document.createElement('li');
      li.innerHTML = '<strong>ST set</strong> ';
      li.append(`${state.fromSet} set. Slots the set does not cover were rolled normally.`);
      ul.appendChild(li);
    }
    for (const m of active) {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = `${m.name} (${m.long})`;
      li.append(strong, modeDetails(m));
      ul.appendChild(li);
    }

    // Notices
    $('notice').hidden = !notices.length;
    $('notice').textContent = notices.join(' ');

    renderHistory();
  }

  // ---------- Slot machine animation ----------

  let animToken = 0;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPIN_ORDER = ['class', ...CATEGORIES, 'dungeon'];

  // Returns a function that paints one random frame for the slot, or null.
  function frameDrawer(slot) {
    const rand = () => Math.random();
    if (slot === 'class') {
      const pool = enabledClasses();
      return pool.length ? () => drawClass(pick(pool, rand)) : null;
    }
    if (slot === 'dungeon') {
      const pool = enabledDungeons();
      return pool.length ? () => drawDungeon(pick(pool, rand)) : null;
    }
    const cls = currentClass();
    const pool = cls ? slotPool(cls, slot) : [];
    return pool.length > 1 ? () => drawItem(slot, pick(pool, rand), false) : null;
  }

  // Draws the final state, then spins the given slots and lands them one by one.
  function animate(slots) {
    const token = ++animToken;
    for (const s of SPIN_ORDER) cardFor(s).classList.remove('spinning', 'landed');
    render();
    if (!settings.animate || reduceMotion || !slots.length) return;

    const order = SPIN_ORDER.filter((s) => slots.includes(s));
    const spins = order.map((s, i) => ({ slot: s, draw: frameDrawer(s), stopAt: 700 + i * 280, last: 0 }))
      .filter((x) => x.draw);
    for (const x of spins) cardFor(x.slot).classList.add('spinning');
    const start = performance.now();

    function tick(now) {
      if (token !== animToken) return;
      const t = now - start;
      let running = false;
      for (const x of spins) {
        if (x.done) continue;
        if (t >= x.stopAt) {
          x.done = true;
          const card = cardFor(x.slot);
          card.classList.remove('spinning');
          renderSlot(x.slot);
          card.classList.add('landed');
          setTimeout(() => card.classList.remove('landed'), 400);
          continue;
        }
        running = true;
        // Frames slow down as the slot gets close to stopping.
        const p = t / x.stopAt;
        if (now - x.last >= 45 + 170 * p * p) {
          x.draw();
          x.last = now;
        }
      }
      if (running) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderHistory() {
    const list = loadHistory();
    $('historyCount').textContent = list.length ? `(${list.length})` : '';
    const ol = $('historyList');
    ol.innerHTML = '';
    list.forEach((entry) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = entry.text;
      b.title = 'Restore this roll';
      b.addEventListener('click', () => restoreHistory(entry));
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  // ---------- Settings UI ----------

  function checkbox(labelText, checked, onChange, opts = {}) {
    const label = document.createElement('label');
    label.className = 'check' + (opts.disabled ? ' disabled' : '');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.disabled = !!opts.disabled;
    if (opts.id) input.id = opts.id;
    input.addEventListener('change', () => onChange(input.checked, input));
    const span = document.createElement('span');
    span.textContent = labelText;
    if (opts.small) {
      const small = document.createElement('small');
      small.textContent = opts.small;
      span.appendChild(small);
    }
    label.append(input, span);
    return label;
  }

  function changed() {
    saveSettings();
    writeHash();
    render();
  }

  let showOtherModes = false;

  // Bullet list of a mode's rules, plus its note.
  function modeDetails(m) {
    const frag = document.createDocumentFragment();
    const ul = document.createElement('ul');
    ul.className = 'mode-detail';
    for (const d of m.details) {
      const li = document.createElement('li');
      li.textContent = d;
      ul.appendChild(li);
    }
    frag.appendChild(ul);
    if (m.note) {
      const p = document.createElement('p');
      p.className = 'mode-note';
      p.textContent = m.note;
      frag.appendChild(p);
    }
    return frag;
  }

  function buildSettings() {
    // Display
    const disp = $('displayList');
    disp.innerHTML = '';
    disp.appendChild(checkbox('Slot machine animation', settings.animate, (on) => { settings.animate = on; saveSettings(); },
      { small: reduceMotion ? 'Off because your system asks for reduced motion.' : 'Items spin before they land.', disabled: reduceMotion }));

    // Modes: selected ones show as full cards, the rest fold away.
    const modeList = $('modeList');
    modeList.innerHTML = '';
    const selected = MODES.filter((m) => settings.modes[m.id]);
    const others = MODES.filter((m) => !settings.modes[m.id]);
    const modeBox = (m, full) => {
      const box = checkbox(m.name, !!settings.modes[m.id], (on) => {
        settings.modes[m.id] = on;
        if (on && m.excludes) for (const x of m.excludes) settings.modes[x] = false;
        if (on) showOtherModes = false;
        buildSettings();
        changed();
      }, { small: full ? m.long : `${m.long}. ${m.summary}` });
      if (m.kinds) {
        const tag = document.createElement('span');
        tag.className = 'mode-tag';
        tag.textContent = 'pool';
        tag.title = 'Changes which items can roll';
        box.querySelector('span').insertBefore(tag, box.querySelector('small'));
      }
      if (!full) return box;
      const card = document.createElement('div');
      card.className = 'mode-card';
      card.appendChild(box);
      card.appendChild(modeDetails(m));
      return card;
    };
    for (const m of selected) modeList.appendChild(modeBox(m, true));
    if (selected.length) {
      const wrap = document.createElement('div');
      wrap.className = 'mode-others';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small';
      btn.textContent = `${showOtherModes ? 'Hide' : 'Show'} other modes (${others.length})`;
      btn.setAttribute('aria-expanded', String(showOtherModes));
      btn.addEventListener('click', () => { showOtherModes = !showOtherModes; buildSettings(); });
      wrap.appendChild(btn);
      if (showOtherModes) {
        const list = document.createElement('div');
        list.className = 'mode-others-list';
        for (const m of others) list.appendChild(modeBox(m, false));
        wrap.appendChild(list);
      }
      modeList.appendChild(wrap);
    } else {
      for (const m of others) modeList.appendChild(modeBox(m, false));
    }

    // Weights
    const weightList = $('weightList');
    weightList.innerHTML = '';
    const kinds = allowedKinds();
    for (const k of KINDS) {
      if (!KIND_COUNTS[k.id]) continue;
      const row = document.createElement('div');
      row.className = 'weight-row';
      const name = document.createElement('label');
      name.className = 'name ' + k.id;
      name.textContent = `${k.name} (${KIND_COUNTS[k.id]})`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = 0;
      input.max = 100;
      input.value = settings.weights[k.id];
      input.id = 'weight-' + k.id;
      input.disabled = !kinds.has(k.id);
      name.htmlFor = input.id;
      const out = document.createElement('output');
      out.textContent = kinds.has(k.id) ? settings.weights[k.id] : 'off';
      input.addEventListener('input', () => {
        settings.weights[k.id] = Number(input.value);
        out.textContent = input.value;
        saveSettings();
      });
      row.append(name, input, out);
      weightList.appendChild(row);
    }

    // Include toggles
    const inc = $('includeList');
    inc.innerHTML = '';
    for (const f of FLAGS) {
      const n = ITEMS.filter((it) => it.flags.includes(f.id)).length;
      if (!n) continue;
      inc.appendChild(checkbox(`${f.name} (${n})`, settings.include[f.id], (on) => {
        settings.include[f.id] = on;
        changed();
      }, { small: f.hint }));
    }

    // Enchantments
    const en = $('enchantList');
    en.innerHTML = '';
    const ec = settings.enchants;
    en.appendChild(checkbox('Roll enchantments', ec.on && ENCHANTS.length > 0, (on) => { ec.on = on; buildSettings(); changed(); },
      { disabled: !ENCHANTS.length, small: ENCHANTS.length ? `${ENCHANTS.length} enchantments. Rolls never combine incompatible ones.` : 'No enchant data in this build.' }));
    en.appendChild(checkbox('Include unique enchantments', ec.unique, (on) => { ec.unique = on; saveSettings(); },
      { disabled: !ec.on }));
    const row = document.createElement('div');
    row.className = 'range-row';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = 1;
    range.max = 4;
    range.value = ec.count;
    range.disabled = !ec.on;
    range.setAttribute('aria-label', 'Enchantments per item');
    const out = document.createElement('output');
    out.textContent = `${ec.count} per item`;
    range.addEventListener('input', () => {
      ec.count = Number(range.value);
      out.textContent = `${ec.count} per item`;
      saveSettings();
    });
    row.append(range, out);
    en.appendChild(row);

    // Set chance
    $('setChance').value = settings.setChance;
    $('setChanceOut').textContent = settings.setChance + '%';

    // Tier limits
    const tierList = $('tierList');
    tierList.innerHTML = '';
    for (const c of CATEGORIES) {
      const max = MAX_TIER[c] || 0;
      const row = document.createElement('div');
      row.className = 'tier-row';
      const name = document.createElement('span');
      name.textContent = CATEGORY_NAMES[c];
      const mk = (idx) => {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', `${CATEGORY_NAMES[c]} ${idx ? 'max' : 'min'} tier`);
        for (let t = 0; t <= max; t++) {
          const o = document.createElement('option');
          o.value = t;
          o.textContent = 'T' + t;
          sel.appendChild(o);
        }
        sel.value = settings.tiers[c][idx];
        sel.addEventListener('change', () => {
          settings.tiers[c][idx] = Number(sel.value);
          // Keep min <= max.
          const [lo, hi] = settings.tiers[c];
          if (lo > hi) settings.tiers[c] = idx ? [hi, hi] : [lo, lo];
          buildSettings();
          changed();
        });
        return sel;
      };
      const to = document.createElement('span');
      to.textContent = 'to';
      row.append(name, mk(0), to, mk(1));
      tierList.appendChild(row);
    }

    // Classes
    const classList = $('classList');
    classList.innerHTML = '';
    for (const cls of CLASSES) {
      classList.appendChild(checkbox(cls.name, !settings.classesOff.includes(cls.id), (on) => {
        settings.classesOff = settings.classesOff.filter((id) => id !== cls.id);
        if (!on) settings.classesOff.push(cls.id);
        saveSettings();
      }));
    }

    // Dungeons
    $('dungeonOn').checked = settings.dungeonOn;
    const dg = $('dungeonGroupList');
    dg.innerHTML = '';
    for (const g of DUNGEONS.groups) {
      const count = DUNGEONS.dungeons.filter((d) => d.group === g.id).length;
      dg.appendChild(checkbox(`${g.name} (${count})`, settings.dungeonGroups.includes(g.id), (on) => {
        settings.dungeonGroups = settings.dungeonGroups.filter((id) => id !== g.id);
        if (on) settings.dungeonGroups.push(g.id);
        saveSettings();
      }, { small: groupRange(g) }));
    }
    const ds = $('dungeonSectionList');
    ds.innerHTML = '';
    for (const x of DUNGEONS.sections) {
      const count = DUNGEONS.dungeons.filter((d) => d.section === x.id).length;
      ds.appendChild(checkbox(`${x.name} (${count})`, settings.dungeonSections.includes(x.id), (on) => {
        settings.dungeonSections = settings.dungeonSections.filter((id) => id !== x.id);
        if (on) settings.dungeonSections.push(x.id);
        saveSettings();
      }));
    }
  }

  // Text like "Difficulty 3.5 to 5" for a dungeon group.
  function groupRange(g) {
    const i = DUNGEONS.groups.indexOf(g);
    const lo = i > 0 ? DUNGEONS.groups[i - 1].max + 0.5 : 0;
    return i === DUNGEONS.groups.length - 1 ? `Difficulty ${lo} and up` : `Difficulty ${lo} to ${g.max}`;
  }

  function applySidebar() {
    const hidden = !!settings.sidebarHidden;
    document.querySelector('.layout').classList.toggle('wide', hidden);
    $('settingsToggle').setAttribute('aria-expanded', String(!hidden));
    $('settingsToggle').title = hidden ? 'Show settings' : 'Hide settings';
    // Sprite sizes depend on card width, so redraw.
    render();
  }

  // ---------- Misc UI ----------

  let toastTimer = null;
  function toast(msg) {
    $('toast').textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 2000);
  }

  async function copy(text, msg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch (e) {
      window.prompt('Copy this:', text);
    }
  }

  function renderDataInfo() {
    const m = DATA.meta;
    const date = new Date(m.generated).toISOString().slice(0, 10);
    const el = $('dataInfo');
    el.textContent = `${CLASSES.length} classes, ${ITEMS.length} items, ${SETS.length} ST sets. Data from ${m.source}, ${date}`;
  }

  function bindEvents() {
    $('rollBtn').addEventListener('click', () => rollAll());
    $('settingsToggle').addEventListener('click', () => {
      settings.sidebarHidden = !settings.sidebarHidden;
      applySidebar();
      saveSettings();
    });
    $('dungeonBtn').addEventListener('click', () => rollDungeonNow());
    $('seedRollBtn').addEventListener('click', () => rollAll($('seedInput').value.trim() || undefined));
    $('seedInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') rollAll($('seedInput').value.trim() || undefined);
    });
    $('copyLinkBtn').addEventListener('click', () => copy(location.href, 'Link copied'));
    $('copyTextBtn').addEventListener('click', () => copy(rollAsText(), 'Text copied'));
    $('clearHistoryBtn').addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_HISTORY); } catch (e) { /* ignore */ }
      renderHistory();
    });
    $('setChance').addEventListener('input', (e) => {
      settings.setChance = Number(e.target.value);
      $('setChanceOut').textContent = settings.setChance + '%';
      saveSettings();
    });
    $('dungeonOn').addEventListener('change', (e) => {
      settings.dungeonOn = e.target.checked;
      if (settings.dungeonOn && !state.dungeon) rollDungeon(makeRng(newSeed()));
      changed();
    });
    $('classesAll').addEventListener('click', () => { settings.classesOff = []; buildSettings(); saveSettings(); });
    $('classesNone').addEventListener('click', () => {
      settings.classesOff = CLASSES.map((c) => c.id);
      buildSettings();
      saveSettings();
    });
    $('resetBtn').addEventListener('click', () => {
      settings = defaultSettings();
      buildSettings();
      changed();
    });
    // Space or R rolls when focus is not in a text field.
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea, button, summary')) return;
      if (e.key === 'r' || e.key === ' ') { e.preventDefault(); rollAll(); }
    });
  }

  // ---------- Start ----------

  buildSlots();
  bindEvents();
  const hadHash = readHash();
  buildSettings();
  renderDataInfo();
  if (settings.sidebarHidden) document.querySelector('.layout').classList.add('wide');
  if (hadHash) render();
  else {
    rollDungeon(makeRng(newSeed()));
    rollAll();
  }
})();
