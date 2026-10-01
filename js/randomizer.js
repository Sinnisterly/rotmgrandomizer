/*
 * Randomizer tab: class and gear rolls, reveal mode, reroll limit,
 * history, share link, text and image.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el, CATEGORIES, CATEGORY_NAMES, ITEM_BY_ID, CLASS_BY_ID, DATA } = R;

  const HISTORY_MAX = 25;
  const DAILY_RE = /^daily-(\d{4}-\d{2}-\d{2})$/;

  // ---------- Roll state ----------

  const state = {
    seed: '',
    classId: null,
    items: { weapon: null, ability: null, armor: null, ring: null },
    enchants: { weapon: [], ability: [], armor: [], ring: [] },
    dungeon: null, // dungeon name
    fromSet: null, // name of the ST set this roll came from
    locks: { class: false, weapon: false, ability: false, armor: false, ring: false },
    hidden: { class: false, weapon: false, ability: false, armor: false, ring: false },
    tokens: null, // rerolls left, null when the limit is off
    odds: null, // the build has a 1 in N chance
    daily: null, // date of the daily roll
  };
  let notices = [];
  let pendingHistory = false;

  const currentClass = () => CLASS_BY_ID.get(state.classId) || null;
  const anyHidden = () => R.SLOTS.some((s) => state.hidden[s]);

  // ---------- No repeat pools ----------

  function loadUsed() {
    const u = R.store.get(R.KEYS.used, null);
    return { classes: (u && u.classes) || [], items: (u && u.items) || [] };
  }
  let used = loadUsed();
  const saveUsed = () => R.store.set(R.KEYS.used, used);
  const noRepeat = (what) => !R.poolOverride && R.settings.noRepeat[what];

  function classPool() {
    const all = R.enabledClasses();
    if (!noRepeat('classes')) return all;
    const left = all.filter((c) => !used.classes.includes(c.id));
    if (left.length || !all.length) return left;
    used.classes = [];
    saveUsed();
    notices.push('Every class has been rolled. The class list starts over.');
    return all;
  }

  function itemPool(cls, category) {
    const all = R.slotPool(cls, category);
    if (!noRepeat('items')) return all;
    const left = all.filter((it) => !used.items.includes(it.id));
    if (left.length || !all.length) return left;
    notices.push(`Every ${CATEGORY_NAMES[category].toLowerCase()} for ${cls.name} has been rolled. Repeats are allowed for it.`);
    return all;
  }

  function recordUsed() {
    if (R.poolOverride) return;
    const s = R.settings.noRepeat;
    if (s.classes && state.classId !== null && !used.classes.includes(state.classId)) used.classes.push(state.classId);
    if (s.items) for (const c of CATEGORIES) if (state.items[c] !== null && !used.items.includes(state.items[c])) used.items.push(state.items[c]);
    if (s.classes || s.items) saveUsed();
  }

  // ---------- Rolling ----------

  function presentWeights(list) {
    const w = R.effectiveWeights();
    const present = {};
    for (const it of list) present[it.kind] = w[it.kind];
    return present;
  }

  // Weighted roll: pick an item kind by weight, then an item of that kind.
  function rollItem(cls, category, rng) {
    const list = itemPool(cls, category);
    if (!list.length) return null;
    const kind = R.pickWeighted(presentWeights(list), rng);
    return R.pick(list.filter((it) => it.kind === kind), rng);
  }

  // Chance this exact build comes up. Returns N for "1 in N", or null.
  // Items already rolled stay out of the pool, except the ones in this build.
  function buildOdds() {
    const cls = currentClass();
    if (!cls || state.fromSet) return null;
    const mine = new Set(Object.values(state.items));
    const classes = R.enabledClasses()
      .filter((c) => !noRepeat('classes') || c.id === cls.id || !used.classes.includes(c.id));
    if (!classes.some((c) => c.id === cls.id)) return null;
    let p = 1 / classes.length;
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(state.items[c]);
      if (!it) continue;
      const list = R.slotPool(cls, c).filter((x) => !noRepeat('items') || mine.has(x.id) || !used.items.includes(x.id));
      if (!list.includes(it)) return null;
      const w = presentWeights(list);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      p *= (w[it.kind] / total) / list.filter((x) => x.kind === it.kind).length;
    }
    return p > 0 ? Math.round(1 / p) : null;
  }

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
    state.enchants[category] = it ? R.rollEnchants(category, rng) : [];
  }

  function rollClass(rng) {
    const list = classPool();
    if (!list.length) {
      notices.push('No classes are turned on. Enable at least one in Settings > Classes.');
      return false;
    }
    state.classId = R.pick(list, rng).id;
    dropIncompatibleLocks(currentClass());
    return true;
  }

  // Full roll. Locked slots are kept. opts.daily rolls today's shared build.
  function rollAll(seed, opts = {}) {
    if (R.follower) return;
    notices = [];
    let daily = null;
    if (opts.daily) seed = 'daily-' + R.today();
    const m = DAILY_RE.exec(seed || '');
    if (m) {
      daily = m[1];
      R.poolOverride = R.defaultSettings();
      for (const s of R.SLOTS) state.locks[s] = false;
    }
    try {
      state.seed = seed || R.newSeed();
      const rng = R.makeRng(state.seed);
      const spun = [];
      if (!state.locks.class || !currentClass()) {
        if (!rollClass(rng)) { render(); return; }
        spun.push('class');
      }
      const cls = currentClass();
      state.fromSet = null;

      // ST set roll.
      const open = CATEGORIES.filter((c) => !state.locks[c]);
      const setChance = (R.poolOverride || R.settings).setChance;
      if (setChance > 0 && open.length && rng() * 100 < setChance) {
        const sets = R.setsForClass(cls);
        if (sets.length) {
          const set = R.pick(sets, rng);
          for (const it of set.items) {
            if (!state.locks[it.category]) {
              state.items[it.category] = it.id;
              state.enchants[it.category] = R.rollEnchants(it.category, rng);
            }
          }
          for (const c of open) if (!set.items.some((it) => it.category === c)) rollSlot(c, rng);
          state.fromSet = set.name;
        } else {
          notices.push(`No ST set fits ${cls.name} with the current filters. Rolled single items.`);
        }
      }
      if (!state.fromSet) for (const c of open) rollSlot(c, rng);
      state.daily = daily;
      state.odds = buildOdds();
      state.tokens = R.settings.tokens.on ? R.settings.tokens.count : null;
      recordUsed();
      finishRoll(spun.concat(open));
    } finally {
      R.poolOverride = null;
    }
  }

  // Reroll one slot with a fresh random seed. Uses up a reroll when the limit is on.
  function rerollOne(slot, opts = {}) {
    if (R.follower) return false;
    if (!currentClass()) return false;
    if (R.settings.tokens.on && !opts.free) {
      if (state.tokens === null) state.tokens = R.settings.tokens.count;
      if (state.tokens <= 0) {
        R.sound.play('error');
        R.toast('No rerolls left. Randomize to start a new run.');
        return false;
      }
      state.tokens--;
    }
    notices = [];
    const rng = R.makeRng(R.newSeed());
    const before = { ...state.items };
    if (slot === 'class') {
      if (!rollClass(rng)) { render(); return false; }
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
    state.daily = null;
    state.odds = buildOdds();
    recordUsed();
    finishRoll([slot, ...CATEGORIES.filter((c) => c !== slot && state.items[c] !== before[c])]);
    return true;
  }

  // spun: slots that changed.
  function finishRoll(spun) {
    const cls = currentClass();
    if (cls) {
      for (const c of CATEGORIES) {
        if (state.items[c] === null && !R.slotPool(cls, c).length) {
          notices.push(`No ${CATEGORY_NAMES[c].toLowerCase()} fits ${cls.name} with the current filters.`);
        }
      }
    }
    const rv = R.settings.reveal;
    for (const s of R.SLOTS) state.hidden[s] = false;
    if (rv.on) {
      for (const s of spun) {
        if (s === 'class' && !rv.hideClass) continue;
        if (s === 'class' || state.items[s] !== null) state.hidden[s] = true;
      }
    }
    pendingHistory = true;
    if (!anyHidden()) commitHistory();
    writeHash();
    play(spun);
    R.sync.send('rand', { snap: snapshot(), spun });
    R.emit('rolled');
  }

  function commitHistory() {
    if (!pendingHistory) return;
    pendingHistory = false;
    addHistory();
  }

  // ---------- Text ----------

  function rollAsText() {
    const cls = currentClass();
    if (!cls) return '';
    const parts = [cls.name];
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(state.items[c]);
      let t = it ? R.itemText(it) : `${CATEGORY_NAMES[c]}: none`;
      if (state.enchants[c].length) t += ` [${state.enchants[c].map(R.enchantLabel).join(', ')}]`;
      parts.push(t);
    }
    if (R.settings.dungeonOn && state.dungeon) parts.push(`Dungeon: ${state.dungeon}`);
    const modes = R.MODES.filter((m) => R.settings.modes[m.id]).map((m) => m.name);
    if (modes.length) parts.push(`Modes: ${modes.join(', ')}`);
    if (state.daily) parts.push(`Daily roll ${state.daily}`);
    return parts.join(' | ');
  }

  // ---------- Share link (URL hash) ----------
  // Format: #c=<classId>&w=<id>&a=<id>&ar=<id>&r=<id>&d=<dungeon>&m=<modes>&s=<seed>

  const HASH_KEYS = { weapon: 'w', ability: 'a', armor: 'ar', ring: 'r' };

  function writeHash() {
    if (R.overlay) return;
    const p = new URLSearchParams();
    if (state.classId !== null) p.set('c', state.classId);
    for (const c of CATEGORIES) {
      if (state.items[c] !== null) p.set(HASH_KEYS[c], state.items[c]);
      if (state.enchants[c].length) p.set(HASH_KEYS[c] + 'e', state.enchants[c].map((e) => e.join('.')).join('_'));
    }
    if (R.settings.dungeonOn && state.dungeon) p.set('d', state.dungeon);
    const modes = R.MODES.filter((m) => R.settings.modes[m.id]).map((m) => m.id);
    if (modes.length) p.set('m', modes.join(','));
    if (state.seed) p.set('s', state.seed);
    history.replaceState(null, '', location.pathname + location.search + '#' + p.toString());
  }

  function parseEnchants(str) {
    if (!str) return [];
    return str.split('_').map((x) => x.split('.').map(Number))
      .filter(([i, l]) => R.ENCHANTS[i] && l >= 0 && l < R.ENCHANT_LEVELS.length);
  }

  // Loads a roll from the URL hash. Returns true if a roll was found.
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const cls = CLASS_BY_ID.get(Number(p.get('c')));
    if (!cls) return false;
    state.classId = cls.id;
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(Number(p.get(HASH_KEYS[c])));
      state.items[c] = it && it.slot === cls.slots[CATEGORIES.indexOf(c)] ? it.id : null;
      state.enchants[c] = parseEnchants(p.get(HASH_KEYS[c] + 'e'));
    }
    state.dungeon = p.get('d');
    state.seed = p.get('s') || '';
    const m = DAILY_RE.exec(state.seed);
    state.daily = m ? m[1] : null;
    if (p.has('m')) {
      const ids = p.get('m').split(',');
      R.settings.modes = {};
      for (const md of R.MODES) if (ids.includes(md.id)) R.settings.modes[md.id] = true;
    }
    state.odds = buildOdds();
    return true;
  }

  // ---------- History ----------

  const loadHistory = () => R.store.get(R.KEYS.history, []);

  function addHistory() {
    if (!currentClass()) return;
    const list = loadHistory();
    list.unshift({
      text: rollAsText(),
      time: Date.now(),
      state: { c: state.classId, i: { ...state.items }, e: { ...state.enchants }, d: state.dungeon, s: state.seed },
    });
    R.store.set(R.KEYS.history, list.slice(0, HISTORY_MAX));
    renderHistory();
  }

  function restoreHistory(entry) {
    if (!entry || !entry.state || !CLASS_BY_ID.has(entry.state.c)) return;
    state.classId = entry.state.c;
    for (const c of CATEGORIES) state.items[c] = ITEM_BY_ID.has(entry.state.i[c]) ? entry.state.i[c] : null;
    for (const c of CATEGORIES) state.enchants[c] = (entry.state.e && entry.state.e[c]) || [];
    state.dungeon = entry.state.d || null;
    state.seed = entry.state.s || '';
    const m = DAILY_RE.exec(state.seed);
    state.daily = m ? m[1] : null;
    state.fromSet = null;
    for (const s of R.SLOTS) state.hidden[s] = false;
    state.odds = buildOdds();
    notices = [];
    writeHash();
    render();
    R.sync.send('rand', { snap: snapshot(), spun: [] });
  }

  function renderHistory() {
    const list = loadHistory();
    $('historyCount').textContent = list.length ? `(${list.length})` : '';
    const ol = $('historyList');
    ol.innerHTML = '';
    for (const entry of list) {
      ol.appendChild(el('li', {}, [
        el('button', { type: 'button', text: entry.text, title: 'Restore this roll', onclick: () => restoreHistory(entry) }),
      ]));
    }
  }

  // ---------- Cards ----------

  const ICONS = {
    lock: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 0 0-4 0v2z"/></svg>',
    unlock: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 7V5a4 4 0 0 1 7.7-1.5l-1.8.8A2 2 0 0 0 6 5v2h7v8H3V7h1z"/></svg>',
    reroll: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5"/><path d="M13 2v3h-3" stroke-linejoin="round"/></svg>',
  };

  function setSprite(node, it) {
    if (!it) {
      node.classList.add('empty');
      node.style.backgroundImage = '';
      return;
    }
    const sheet = DATA.meta.sheet;
    const box = node.clientWidth || 80;
    const scale = box / sheet.cell;
    node.classList.remove('empty');
    node.style.backgroundImage = `url("${sheet.file}")`;
    node.style.backgroundSize = `${sheet.w * scale}px ${sheet.h * scale}px`;
    node.style.backgroundPosition = `-${it.x * scale}px -${it.y * scale}px`;
  }
  R.setSprite = setSprite;

  function setClassImage(node, cls) {
    if (cls && cls.img) {
      node.classList.remove('empty');
      node.style.backgroundImage = `url("${cls.img}")`;
      node.style.backgroundSize = 'contain';
      node.style.backgroundPosition = 'center';
      return;
    }
    // Fallback: the class's starter weapon.
    const starter = cls
      ? R.ITEMS.filter((it) => it.slot === cls.slots[0] && it.kind === 't').sort((a, b) => a.tier - b.tier)[0]
      : null;
    setSprite(node, starter);
  }
  R.setClassImage = setClassImage;

  function actionButtons(container, slot, label) {
    container.innerHTML = '';
    const hidden = state.hidden[slot];
    const lock = el('button', {
      type: 'button',
      class: 'icon-btn' + (state.locks[slot] ? ' locked' : ''),
      html: state.locks[slot] ? ICONS.lock : ICONS.unlock,
      title: (state.locks[slot] ? 'Unlock ' : 'Lock ') + label,
      'aria-pressed': String(state.locks[slot]),
      disabled: hidden,
      onclick: (e) => {
        e.stopPropagation();
        state.locks[slot] = !state.locks[slot];
        R.sound.play('toggle');
        render();
        R.sync.send('rand', { snap: snapshot(), spun: [] });
      },
    });
    lock.setAttribute('aria-label', lock.title);
    const noTokens = R.settings.tokens.on && state.tokens !== null && state.tokens <= 0;
    const reroll = el('button', {
      type: 'button',
      class: 'icon-btn',
      html: ICONS.reroll,
      title: noTokens ? 'No rerolls left' : 'Reroll ' + label,
      disabled: noTokens || !currentClass(),
      onclick: (e) => { e.stopPropagation(); rerollOne(slot); },
    });
    reroll.setAttribute('aria-label', reroll.title);
    container.append(lock, reroll);
  }

  // Builds the four slot cards once.
  function buildSlots() {
    const wrap = $('slots');
    for (const c of CATEGORIES) {
      const card = el('div', { class: 'panel slot', id: 'slot-' + c, 'data-slot': c });
      card.innerHTML = `
        <div class="sprite" aria-hidden="true"></div>
        <div class="slot-body">
          <span class="label"></span>
          <p class="slot-name"></p>
          <span class="badges"></span>
          <ul class="enchants"></ul>
        </div>
        <div class="slot-actions ctrl"></div>`;
      wrap.appendChild(card);
    }
    // Hidden cards reveal on click or Enter.
    for (const slot of R.SLOTS) {
      const card = cardFor(slot);
      card.addEventListener('click', (e) => {
        if (state.hidden[slot] && !e.target.closest('button, a')) reveal(slot);
      });
      card.addEventListener('keydown', (e) => {
        if (state.hidden[slot] && (e.key === 'Enter' || e.key === ' ') && e.target === card) {
          e.preventDefault();
          reveal(slot);
        }
      });
    }
  }

  const cardFor = (slot) => (slot === 'class' ? $('classCard') : $('slot-' + slot));

  function drawClass(cls, hidden) {
    $('className').textContent = hidden ? '???' : cls ? cls.name : 'Press Randomize';
    $('classSlots').textContent = hidden ? 'Click to reveal'
      : cls ? cls.slots.slice(0, 3).map((t) => DATA.slotTypes[t].name).join(' / ') + ' / Ring' : '';
    const sp = $('classSprite');
    sp.classList.toggle('mystery', !!hidden);
    if (hidden) {
      sp.classList.add('empty');
      sp.style.backgroundImage = '';
    } else {
      setClassImage(sp, cls);
    }
  }

  function addBadge(parent, cls, label) {
    parent.appendChild(el('span', { class: 'badge ' + cls, text: label }));
  }

  // Paints an item card. "full" adds the wiki link, flags and enchantments.
  function drawItem(c, it, full, hidden) {
    const cls = currentClass();
    const card = $('slot-' + c);
    const typeName = hidden && state.hidden.class ? CATEGORY_NAMES[c]
      : it ? it.typeName
      : cls ? DATA.slotTypes[cls.slots[CATEGORIES.indexOf(c)]].name : CATEGORY_NAMES[c];
    card.querySelector('.label').textContent = typeName;
    const nameEl = card.querySelector('.slot-name');
    nameEl.textContent = '';
    if (hidden) {
      nameEl.textContent = '???';
    } else if (it && full) {
      nameEl.appendChild(el('a', { href: R.wikiUrl(it.name), target: '_blank', rel: 'noopener', text: it.name, title: 'Open on RealmEye wiki' }));
    } else {
      nameEl.textContent = it ? it.name : cls ? 'No item fits the current filters' : '-';
    }
    const badges = card.querySelector('.badges');
    badges.innerHTML = '';
    if (hidden) {
      addBadge(badges, 'flag', 'Click to reveal');
    } else if (it) {
      addBadge(badges, it.kind, R.kindLabel(it));
      if (full) {
        if (R.isShiny(it)) addBadge(badges, 'shiny', 'Shiny');
        if (it.flags.includes('limited')) addBadge(badges, 'flag', 'Limited');
        if (it.flags.includes('legacy')) addBadge(badges, 'flag', 'Legacy');
        if (it.flags.includes('reskin')) addBadge(badges, 'flag', 'Reskin');
      }
    }
    const ench = card.querySelector('.enchants');
    ench.innerHTML = '';
    const list = full && !hidden ? state.enchants[c] : [];
    for (const e of list) {
      ench.appendChild(el('li', { text: R.enchantLabel(e), title: R.ENCHANTS[e[0]].effect }));
    }
    ench.hidden = !list.length;
    const sp = card.querySelector('.sprite');
    sp.classList.toggle('mystery', !!hidden);
    setSprite(sp, hidden ? null : it);
  }

  function setHiddenAttrs(card, hidden) {
    card.classList.toggle('is-hidden', hidden);
    if (hidden) {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Reveal');
    } else {
      card.removeAttribute('tabindex');
      card.removeAttribute('role');
      card.removeAttribute('aria-label');
    }
  }

  function renderClass() {
    const hidden = state.hidden.class;
    drawClass(currentClass(), hidden);
    const card = $('classCard');
    card.classList.toggle('is-locked', state.locks.class);
    setHiddenAttrs(card, hidden);
    actionButtons(card.querySelector('.slot-actions'), 'class', 'class');
  }

  function renderItem(c) {
    const cls = currentClass();
    const it = ITEM_BY_ID.get(state.items[c]) || null;
    const hidden = state.hidden[c];
    drawItem(c, it, true, hidden);
    const card = $('slot-' + c);
    card.className = 'panel slot'
      + (hidden ? '' : it ? ` kind-${it.kind} bag-${R.bagOf(it)}${R.isShiny(it) ? ' shiny' : ''}` : cls ? ' empty' : '')
      + (state.locks[c] ? ' is-locked' : '');
    setHiddenAttrs(card, hidden);
    actionButtons(card.querySelector('.slot-actions'), c, CATEGORY_NAMES[c].toLowerCase());
  }

  function renderSlot(slot) {
    if (slot === 'class') renderClass();
    else renderItem(slot);
  }

  function renderDungeon() {
    $('dungeonStrip').hidden = !R.settings.dungeonOn;
    const d = R.dungeonByName(state.dungeon);
    $('dungeonName').textContent = d ? d.name : state.dungeon || 'Not rolled yet';
    const img = $('dungeonImg');
    img.classList.toggle('empty', !(d && d.img));
    img.style.backgroundImage = d && d.img ? `url("${d.img}")` : '';
    $('dungeonStrip').title = d ? R.dungeonSub(d) : '';
  }

  function fmtOdds(n) {
    if (n < 1e9) return n.toLocaleString('en-US');
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }

  function renderInfo() {
    $('seedInput').value = state.seed;
    const hiddenNow = anyHidden();
    $('revealAllBtn').hidden = !hiddenNow;
    const t = $('tokenInfo');
    t.hidden = !(R.settings.tokens.on && currentClass());
    if (!t.hidden) {
      const left = state.tokens === null ? R.settings.tokens.count : state.tokens;
      t.textContent = `Rerolls left: ${left} / ${R.settings.tokens.count}`;
      t.classList.toggle('out', left <= 0);
    }
    const o = $('oddsInfo');
    o.textContent = hiddenNow ? ''
      : state.fromSet ? `Full ST set: ${state.fromSet}`
      : state.odds ? `Odds of this build: 1 in ${fmtOdds(state.odds)}` : '';
    const dt = $('dailyTag');
    dt.hidden = !state.daily;
    dt.textContent = state.daily ? `Daily roll ${state.daily}` : '';
  }

  function renderRules() {
    const active = R.MODES.filter((m) => R.settings.modes[m.id]);
    const house = (R.settings.houseRules || []).filter(Boolean);
    const panel = $('rulesPanel');
    panel.hidden = !active.length && !house.length && !state.fromSet;
    $('rulesCount').textContent = active.length + house.length ? `(${active.length + house.length})` : '';
    const ul = $('rulesList');
    ul.innerHTML = '';
    if (state.fromSet && !anyHidden()) {
      ul.appendChild(el('li', {}, [el('strong', { text: 'ST set ' }), `${state.fromSet} set. Slots the set does not cover were rolled normally.`]));
    }
    for (const m of active) {
      ul.appendChild(el('li', {}, [el('strong', { text: `${m.name} (${m.long})` }), R.challenges ? R.challenges.details(m) : '']));
    }
    for (const h of house) ul.appendChild(el('li', {}, [el('strong', { text: 'House rule ' }), h]));
  }

  function render() {
    renderClass();
    for (const c of CATEGORIES) renderItem(c);
    renderDungeon();
    renderInfo();
    renderRules();
    $('notice').hidden = !notices.length;
    $('notice').textContent = notices.join(' ');
  }

  // ---------- Roll animation ----------

  let animToken = 0;

  // Returns a function that paints one random frame for the slot, or null.
  function frameDrawer(slot) {
    if (slot === 'class') {
      const list = R.enabledClasses();
      return list.length ? () => drawClass(R.pick(list)) : null;
    }
    const cls = currentClass();
    const list = cls ? R.slotPool(cls, slot) : [];
    return list.length > 1 ? () => drawItem(slot, R.pick(list), false) : null;
  }

  // Effects when a slot lands on its final value.
  function landFx(slot) {
    const card = cardFor(slot);
    card.classList.remove('landed');
    void card.offsetWidth;
    card.classList.add('landed');
    setTimeout(() => card.classList.remove('landed'), 600);
    if (slot === 'class') {
      R.sound.play('land');
      R.fx.burstAt(card.querySelector('.sprite'), { colors: ['#e0b43c', '#fff2c0'], count: 14, power: 4 });
      return;
    }
    const it = ITEM_BY_ID.get(state.items[slot]);
    if (!it) return;
    const bag = R.bagOf(it);
    R.sound.play(R.BAGS[bag].rank >= 3 ? 'bag-' + bag : 'land');
    R.fx.forItem(it, card.querySelector('.sprite'), { quiet: true });
  }

  function celebrateSet() {
    if (!state.fromSet) return;
    R.sound.play('stSet');
    R.fx.confetti({ colors: ['#f08a1c', '#ffc078', '#ffffff', '#e0b43c'] });
  }

  // Paints the final state, then spins the changed slots and lands them one by one.
  function play(slots) {
    const token = ++animToken;
    for (const s of R.SLOTS) cardFor(s).classList.remove('spinning', 'landed', 'concealing');
    render();
    if (!slots.length) return;
    const hiddenSlots = slots.filter((s) => state.hidden[s]);
    if (hiddenSlots.length) {
      R.sound.play('shuffle');
      if (R.fx.motion()) {
        for (const s of hiddenSlots) {
          const card = cardFor(s);
          card.classList.add('concealing');
          setTimeout(() => card.classList.remove('concealing'), 500 * R.fx.speed());
        }
      }
    }
    const visible = R.SLOTS.filter((s) => slots.includes(s) && !state.hidden[s]);
    if (!visible.length) return;
    if (!R.fx.motion()) {
      if (visible.some((s) => s !== 'class' && R.BAGS[R.bagOf(ITEM_BY_ID.get(state.items[s]))].rank >= 4)) R.sound.play('win');
      else R.sound.play('land');
      if (!anyHidden()) celebrateSet();
      return;
    }

    const sp = R.fx.speed();
    const spins = visible.map((s, i) => ({ slot: s, draw: frameDrawer(s), stopAt: (700 + i * 280) * sp, last: 0 }))
      .filter((x) => x.draw);
    for (const x of spins) cardFor(x.slot).classList.add('spinning');
    const start = performance.now();

    function tick(now) {
      if (token !== animToken) return;
      const t = now - start;
      let runningAny = false;
      for (const x of spins) {
        if (x.done) continue;
        if (t >= x.stopAt) {
          x.done = true;
          cardFor(x.slot).classList.remove('spinning');
          renderSlot(x.slot);
          landFx(x.slot);
          continue;
        }
        runningAny = true;
        // Frames slow down as the slot gets close to stopping.
        const p = t / x.stopAt;
        if (now - x.last >= 45 + 170 * p * p) {
          x.draw();
          x.last = now;
          R.sound.play('tick');
        }
      }
      if (runningAny) requestAnimationFrame(tick);
      else if (!anyHidden()) celebrateSet();
    }
    requestAnimationFrame(tick);
  }

  // ---------- Reveal ----------

  const REVEAL_ORDER = ['class', ...CATEGORIES];

  function nextHidden() {
    return REVEAL_ORDER.find((s) => state.hidden[s]) || null;
  }

  function afterReveal(slot) {
    state.hidden[slot] = false;
    renderSlot(slot);
    // Item labels show the class's slot types once the class is known.
    if (slot === 'class') for (const c of CATEGORIES) if (state.hidden[c]) renderItem(c);
    renderInfo();
    renderRules();
    if (!anyHidden()) {
      commitHistory();
      celebrateSet();
    }
  }

  // Shows one hidden slot. opts.inline forces the card flip.
  function reveal(slot, opts = {}) {
    if (!state.hidden[slot]) return;
    if (!R.follower) R.sync.send('reveal', { slot, inline: !!opts.inline });
    const usePopup = R.settings.reveal.style === 'bag' && !opts.inline;
    if (usePopup) revealPopup(slot);
    else flipReveal(slot);
  }

  function revealFx(slot, node) {
    if (slot === 'class') {
      R.sound.play('classReveal');
      R.fx.burstAt(node, { colors: ['#e0b43c', '#fff2c0', '#ffffff'], count: 30, power: 6 });
      return;
    }
    const it = ITEM_BY_ID.get(state.items[slot]);
    R.sound.play('bag-' + R.bagOf(it));
    R.fx.forItem(it, node);
  }

  function flipReveal(slot) {
    const card = cardFor(slot);
    if (!R.fx.motion()) {
      afterReveal(slot);
      revealFx(slot, card.querySelector('.sprite'));
      return;
    }
    const half = 220 * R.fx.speed();
    card.style.setProperty('--flip', half + 'ms');
    card.classList.add('flip-out');
    R.sound.play('pop');
    setTimeout(() => {
      card.classList.remove('flip-out');
      afterReveal(slot);
      card.classList.add('flip-in');
      revealFx(slot, card.querySelector('.sprite'));
      setTimeout(() => card.classList.remove('flip-in'), half + 30);
    }, half);
  }

  // Reveals every hidden slot one after another with the card flip.
  function revealAll() {
    if (R.follower) return;
    const list = REVEAL_ORDER.filter((s) => state.hidden[s]);
    R.closeModal();
    list.forEach((s, i) => setTimeout(() => reveal(s, { inline: true }), i * 380 * R.fx.speed()));
  }

  function revealNext() {
    const s = nextHidden();
    if (s) reveal(s);
  }

  // Loot bag pop-up. The bag drops, shakes harder for better loot, then opens.
  function revealPopup(slot) {
    const it = slot === 'class' ? null : ITEM_BY_ID.get(state.items[slot]);
    const cls = currentClass();
    const bagId = slot === 'class' ? null : R.bagOf(it);
    const bag = bagId ? R.BAGS[bagId] : null;
    const color = bag ? bag.color : '#e0b43c';
    const rank = bag ? bag.rank : 2;
    const sp = R.fx.speed();
    const motion = R.fx.motion();

    const rays = el('div', { class: 'rays' });
    const holder = el('div', { class: 'bag-holder' });
    if (bag) holder.innerHTML = R.fx.bagSvg(bagId);
    else holder.appendChild(el('div', { class: 'mystery-portrait', text: '?' }));
    const stage = el('div', { class: 'bag-stage' }, [rays, holder]);
    const hint = el('p', { class: 'reveal-hint', text: bag ? bag.name : 'Your class is...' });

    const sprite = el('div', { class: 'sprite huge' });
    const result = el('div', { class: 'reveal-result', hidden: true });
    const nextBtn = el('button', { class: 'btn btn-gold', type: 'button', text: 'Next', 'data-focus': '' });
    const doneBtn = el('button', { class: 'btn', type: 'button', text: 'Close' });
    const btns = el('div', { class: 'row-btns center', hidden: true }, [nextBtn, doneBtn]);

    const box = el('div', { class: 'reveal-pop' + (bag ? ' bag-' + bagId : ' is-class') }, [stage, hint, result, btns]);
    box.style.setProperty('--bag', color);
    const close = R.modal(box, {
      className: 'reveal-modal',
      onClose: () => {
        // Closing early still reveals the slot, without the effects.
        if (!opened) open(true);
        if (!R.follower) R.sync.send('closeModal');
      },
    });

    let opened = false;
    let timers = [];
    function open(quiet) {
      if (opened) return;
      opened = true;
      timers.forEach(clearTimeout);
      afterReveal(slot);
      if (quiet) return;
      holder.classList.remove('wobble', 'drop');
      holder.classList.add('popped');
      rays.classList.add('on');
      hint.hidden = true;
      result.innerHTML = '';
      if (slot === 'class') {
        setClassImage(sprite, cls);
        result.append(sprite, el('span', { class: 'label', text: 'Class' }), el('h2', { class: 'reveal-name', text: cls ? cls.name : '' }));
      } else {
        result.append(sprite, el('span', { class: 'label', text: it ? it.typeName : '' }),
          el('h2', { class: 'reveal-name kind-' + (it ? it.kind : ''), text: it ? it.name : 'Nothing' }));
        const badges = el('div', { class: 'badges center' });
        if (it) {
          addBadge(badges, it.kind, R.kindLabel(it));
          if (R.isShiny(it)) addBadge(badges, 'shiny', 'Shiny');
        }
        result.appendChild(badges);
        if (state.enchants[slot].length) {
          result.appendChild(el('ul', { class: 'enchants' }, state.enchants[slot].map((e) => el('li', { text: R.enchantLabel(e) }))));
        }
      }
      result.hidden = false;
      // Sprite size is known only once it is on screen.
      requestAnimationFrame(() => {
        if (slot !== 'class') setSprite(sprite, it);
        revealFx(slot, sprite);
      });
      const more = nextHidden();
      nextBtn.hidden = !more;
      btns.hidden = !!R.follower;
      (more ? nextBtn : doneBtn).focus({ preventScroll: true });
    }

    nextBtn.addEventListener('click', () => {
      const more = nextHidden();
      close();
      if (more) setTimeout(() => reveal(more), 60);
    });
    doneBtn.addEventListener('click', () => close());
    stage.addEventListener('click', () => open());

    if (!motion) { open(); return; }
    holder.classList.add('drop');
    holder.style.setProperty('--drop', 450 * sp + 'ms');
    timers.push(setTimeout(() => R.sound.play('drop'), 380 * sp));
    const wobbles = 1 + rank;
    const wobbleStart = 520 * sp;
    for (let i = 0; i < wobbles; i++) {
      timers.push(setTimeout(() => {
        holder.classList.remove('drop', 'wobble');
        void holder.offsetWidth;
        holder.style.setProperty('--wob', 4 + i * 2 + 'deg');
        holder.classList.add('wobble');
        R.sound.play('wobble');
      }, wobbleStart + i * 200 * sp));
    }
    const openAt = wobbleStart + wobbles * 200 * sp + 120;
    if (R.settings.reveal.autoOpen || R.follower) timers.push(setTimeout(() => open(), openAt));
    else timers.push(setTimeout(() => { hint.textContent = (bag ? bag.name : 'Mystery') + '. Click to open'; }, openAt));
  }

  // ---------- Image export ----------

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // The part of an image that is not transparent, so padding in the file does not matter.
  function opaqueBounds(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width;
    let y0 = c.height;
    let x1 = 0;
    let y1 = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (px[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < x0) return { x: 0, y: 0, w: c.width, h: c.height };
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  async function buildImage() {
    const cls = currentClass();
    if (!cls) return null;
    const W = 760;
    const H = 500;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--gold').trim() || '#e0b43c';
    const head = css.getPropertyValue('--head').trim() || 'system-ui, sans-serif';
    const body = 'system-ui, sans-serif';

    g.fillStyle = '#0f0d0b';
    g.fillRect(0, 0, W, H);
    g.fillStyle = accent;
    g.fillRect(8, 8, W - 16, 4);
    g.fillRect(8, H - 12, W - 16, 4);
    g.fillRect(4, 12, 4, H - 24);
    g.fillRect(W - 8, 12, 4, H - 24);

    const [sheet, clsImg, logo] = await Promise.all([
      loadImage(DATA.meta.sheet.file),
      cls.img ? loadImage(cls.img) : null,
      loadImage('data/img/assets/rotmg-randomizer-logo.png'),
    ]);

    g.fillStyle = '#1b1814';
    g.fillRect(28, 28, 112, 112);
    if (clsImg) g.drawImage(clsImg, 32, 32, 104, 104);
    g.fillStyle = accent;
    g.font = `600 14px ${head}`;
    g.fillText('CLASS', 160, 52);
    g.fillStyle = '#f2f2f2';
    g.font = `700 40px ${head}`;
    g.fillText(cls.name, 160, 96);
    g.fillStyle = '#a49a8a';
    g.font = `15px ${body}`;
    const modes = R.MODES.filter((m) => R.settings.modes[m.id]).map((m) => m.name);
    const gear = cls.slots.slice(0, 3).map((t) => DATA.slotTypes[t].name).join(' / ') + ' / Ring';
    g.fillText(modes.length ? 'Modes: ' + modes.join(', ') : gear, 160, 124);

    const colors = { t: '#d8d8d8', ut: '#b98cff', st: '#ffa24a' };
    CATEGORIES.forEach((cat, i) => {
      const it = ITEM_BY_ID.get(state.items[cat]);
      const x = 28 + (i % 2) * 360;
      const y = 164 + Math.floor(i / 2) * 110;
      g.fillStyle = '#1b1814';
      g.fillRect(x, y, 344, 96);
      if (it) {
        g.fillStyle = R.BAGS[R.bagOf(it)].color;
        g.fillRect(x, y, 4, 96);
      }
      g.fillStyle = '#26221c';
      g.fillRect(x + 14, y + 12, 72, 72);
      if (it && sheet) g.drawImage(sheet, it.x, it.y, DATA.meta.sheet.cell, DATA.meta.sheet.cell, x + 14, y + 12, 72, 72);
      g.fillStyle = accent;
      g.font = `600 12px ${head}`;
      g.fillText((it ? it.typeName : CATEGORY_NAMES[cat]).toUpperCase(), x + 100, y + 30);
      g.fillStyle = it ? colors[it.kind] : '#e05a4f';
      g.font = `700 17px ${body}`;
      let name = it ? it.name : 'None';
      while (g.measureText(name).width > 230 && name.length > 4) name = name.slice(0, -2);
      if (it && name !== it.name) name = name.trim() + '...';
      g.fillText(name, x + 100, y + 56);
      if (it) {
        g.font = `13px ${body}`;
        g.fillStyle = '#a49a8a';
        g.fillText(R.kindLabel(it) + (R.isShiny(it) ? ' Shiny' : '') + (state.enchants[cat].length ? ` / ${state.enchants[cat].length} enchant${state.enchants[cat].length > 1 ? 's' : ''}` : ''), x + 100, y + 78);
      }
    });

    g.font = `15px ${body}`;
    g.fillStyle = '#f2f2f2';
    const d = R.settings.dungeonOn && state.dungeon ? `Dungeon: ${state.dungeon}` : '';
    g.fillText(d, 28, 420);
    g.fillStyle = '#7d7466';
    g.font = `13px ${body}`;
    g.fillText(state.daily ? `Daily roll ${state.daily}` : state.seed ? `Seed ${state.seed}` : '', 28, 450);

    // Logo in the bottom right. The site address goes under it, only on the public site.
    if (logo) {
      const b = opaqueBounds(logo);
      const lh = 46;
      const lw = (b.w / b.h) * lh;
      g.imageSmoothingEnabled = true;
      g.drawImage(logo, b.x, b.y, b.w, b.h, W - 28 - lw, 400, lw, lh);
      g.imageSmoothingEnabled = false;
    }
    const local = !location.host || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname);
    if (!local) {
      g.textAlign = 'right';
      g.fillText((location.host + location.pathname).replace(/\/(index\.html)?$/, ''), W - 28, 466);
      g.textAlign = 'left';
    }
    return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  }

  async function copyImage() {
    if (anyHidden()) {
      R.toast('Reveal everything first.');
      return;
    }
    const blob = await buildImage();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      R.toast('Image copied. Paste it in Discord.');
    } catch (e) {
      const a = el('a', { href: URL.createObjectURL(blob), download: `rotmg-roll-${state.seed || 'build'}.png` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      R.toast('Image saved');
    }
  }

  // ---------- Sync ----------

  function snapshot() {
    return {
      state: JSON.parse(JSON.stringify(state)),
      modes: { ...R.settings.modes },
      houseRules: R.settings.houseRules.slice(),
      notices: notices.slice(),
    };
  }

  function applySnapshot(snap, spun) {
    Object.assign(state, JSON.parse(JSON.stringify(snap.state)));
    R.settings.modes = snap.modes || {};
    R.settings.houseRules = snap.houseRules || [];
    notices = snap.notices || [];
    if (spun && spun.length) play(spun);
    else render();
  }

  // ---------- Other entry points ----------

  // Sets the class from the wheel, locks it and rolls gear for it.
  function useClass(id) {
    if (!CLASS_BY_ID.has(id)) return;
    state.classId = id;
    state.locks.class = true;
    dropIncompatibleLocks(currentClass());
    for (const c of CATEGORIES) {
      const it = ITEM_BY_ID.get(state.items[c]);
      if (state.locks[c] && !it) state.locks[c] = false;
    }
    rollAll();
  }

  function setDungeon(name) {
    state.dungeon = name;
    if (!R.follower) writeHash();
    renderDungeon();
    R.sync.send('rand', { snap: snapshot(), spun: [] });
  }

  function bind() {
    $('rollBtn').addEventListener('click', () => rollAll());
    $('revealAllBtn').addEventListener('click', () => revealAll());
    $('seedRollBtn').addEventListener('click', () => rollAll($('seedInput').value.trim() || undefined));
    $('seedInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') rollAll($('seedInput').value.trim() || undefined);
    });
    $('dailyBtn').addEventListener('click', () => rollAll(undefined, { daily: true }));
    $('copyLinkBtn').addEventListener('click', () => copy(location.href, 'Link copied'));
    $('copyTextBtn').addEventListener('click', () => {
      if (anyHidden()) { R.toast('Reveal everything first.'); return; }
      copy(rollAsText(), 'Text copied');
    });
    $('copyImageBtn').addEventListener('click', () => copyImage());
    $('clearHistoryBtn').addEventListener('click', () => {
      R.store.remove(R.KEYS.history);
      renderHistory();
    });
    $('dungeonSpinBtn').addEventListener('click', () => R.wheel && R.wheel.spinPreset('dungeons'));
  }
  const copy = (text, msg) => R.copy(text, msg);

  R.rand = {
    state,
    init() {
      buildSlots();
      bind();
      renderHistory();
      return readHash();
    },
    rollAll,
    rerollOne,
    reveal,
    revealNext,
    revealAll,
    render,
    renderRules,
    renderInfo,
    snapshot,
    applySnapshot,
    useClass,
    setDungeon,
    anyHidden,
    currentClass,
    usedCounts: () => ({ classes: used.classes.length, items: used.items.length }),
    resetUsed(what) {
      used[what] = [];
      saveUsed();
    },
    // Called when settings change.
    changed() {
      if (R.settings.tokens.on && state.tokens === null) state.tokens = R.settings.tokens.count;
      if (!R.settings.tokens.on) state.tokens = null;
      if (!R.settings.reveal.on && anyHidden()) {
        for (const s of R.SLOTS) state.hidden[s] = false;
        commitHistory();
      }
      state.odds = buildOdds();
      writeHash();
      render();
      R.sync.send('rand', { snap: snapshot(), spun: [] });
    },
  };
})();
