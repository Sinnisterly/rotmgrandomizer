/*
 * Bingo tab: a card of RotMG goals made from a seed, so friends with the
 * same link get the same card and can race it.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  // [goal, level] with e = easy, m = medium, h = hard.
  const GOALS = [
    ['Reach level 20', 'e'],
    ['Max one stat', 'e'],
    ['Drink 5 stat potions', 'e'],
    ['Equip a UT item', 'e'],
    ['Solo clear any dungeon', 'e'],
    ['Kill a Cube God', 'e'],
    ['Kill a Skull Shrine', 'e'],
    ['Kill a Pentaract', 'e'],
    ['Kill a Grand Sphinx', 'e'],
    ['Kill a Hermit God', 'e'],
    ['Kill a Ghost Ship', 'e'],
    ['Kill a Lord of the Lost Lands', 'e'],
    ['Max three stats', 'm'],
    ['Find a UT item', 'm'],
    ['Get a white bag', 'm'],
    ['Close a realm', 'm'],
    ['Earn 200 base fame', 'm'],
    ['Clear 5 different dungeons', 'm'],
    ['Clear 3 dungeons in a row without going to the nexus', 'm'],
    ['Clear a dungeon without using an HP potion', 'm'],
    ['Clear a dungeon without using your ability', 'm'],
    ['Equip 4 tiered items of the same tier', 'm'],
    ['Max all 8 stats', 'h'],
    ['Find an ST item', 'h'],
    ['Find a shiny item', 'h'],
    ['Get 3 white bags', 'h'],
    ['Find a Potion of Life', 'h'],
    ['Earn 1,000 base fame', 'h'],
    ['Clear 10 different dungeons', 'h'],
    ['Equip 4 UT or ST items at once', 'h'],
  ];

  const LEVELS = {
    easy: { goals: ['e'], groups: ['beginner', 'adept'] },
    normal: { goals: ['e', 'm'], groups: ['beginner', 'adept', 'hard'] },
    hard: { goals: ['m', 'h'], groups: ['adept', 'hard', 'exalt'] },
  };

  let card = R.store.get(R.KEYS.bingo, null);
  let lineCount = 0;

  function save() {
    if (!R.follower) R.store.set(R.KEYS.bingo, card);
    R.sync.send('bingo', card);
  }

  // Builds the squares from the card options. Same options give the same card.
  function makeCells(o) {
    const rng = R.makeRng('bingo:' + o.seed);
    const lv = LEVELS[o.level] || LEVELS.normal;
    const goals = o.goals ? R.shuffle(GOALS.filter(([, l]) => lv.goals.includes(l)).map(([g]) => g), rng) : [];
    const defaultSections = R.DUNGEONS.sections.filter((x) => x.on).map((x) => x.id);
    const dungeons = o.dungeons
      ? R.shuffle(R.DUNGEONS.dungeons.filter((d) => lv.groups.includes(d.group) && defaultSections.includes(d.section))
        .map((d) => 'Clear ' + d.name), rng)
      : [];
    const free = o.free && o.size % 2 === 1;
    const need = o.size * o.size - (free ? 1 : 0);
    // About half dungeons and half goals when both are on.
    let fromD = goals.length && dungeons.length ? Math.round(need * 0.45) : dungeons.length ? need : 0;
    fromD = Math.min(fromD, dungeons.length);
    let picked = dungeons.slice(0, fromD).concat(goals.slice(0, need - fromD));
    if (picked.length < need) picked = picked.concat(dungeons.slice(fromD, fromD + need - picked.length));
    picked = R.shuffle(picked, rng);
    if (free) picked.splice(Math.floor((o.size * o.size) / 2), 0, 'FREE');
    return picked;
  }

  function newCard(seed, opts) {
    const s = R.settings.bingo;
    const o = Object.assign({ size: s.size, level: s.level, free: s.free, dungeons: s.dungeons, goals: s.goals }, opts || {});
    o.seed = seed || R.newSeed();
    card = { ...o, cells: makeCells(o) };
    card.marks = card.cells.map((c) => c === 'FREE');
    lineCount = countLines().length;
    save();
    render();
  }

  // Lists of cell indexes for every finished row, column and diagonal.
  function countLines() {
    if (!card) return [];
    const n = card.size;
    if (card.cells.length !== n * n) return [];
    const lines = [];
    for (let i = 0; i < n; i++) {
      lines.push([...Array(n)].map((_, j) => i * n + j));
      lines.push([...Array(n)].map((_, j) => j * n + i));
    }
    lines.push([...Array(n)].map((_, j) => j * n + j));
    lines.push([...Array(n)].map((_, j) => j * n + (n - 1 - j)));
    return lines.filter((l) => l.every((i) => card.marks[i]));
  }

  function toggle(i) {
    if (R.follower || !card || card.cells[i] === 'FREE') return;
    card.marks[i] = !card.marks[i];
    const cellEl = $('bingoGrid').children[i];
    if (card.marks[i]) {
      R.sound.play('plus');
      R.fx.burstAt(cellEl, { colors: ['#e0b43c', '#ffffff'], count: 10, power: 3 });
      if (R.run) R.run.log('Bingo: ' + card.cells[i]);
    } else {
      R.sound.play('minus');
    }
    const lines = countLines();
    const fresh = lines.length > lineCount;
    lineCount = lines.length;
    save();
    render();
    if (fresh) celebrate();
  }

  function celebrate(remote) {
    const all = card.marks.every(Boolean);
    R.sound.play('bingo');
    R.fx.confetti({ count: all ? 260 : 130 });
    R.fx.flash('#e0b43c');
    R.fx.shake(all ? 3 : 1);
    if (!remote) R.sync.send('bingoFx');
    R.toast(all ? 'Blackout! Every square done.' : 'Bingo!');
  }

  function render() {
    if (!card) return;
    $('bingoSeed').value = card.seed;
    const grid = $('bingoGrid');
    grid.innerHTML = '';
    grid.style.setProperty('--n', card.size);
    const lines = countLines();
    const inLine = new Set(lines.flat());
    card.cells.forEach((text, i) => {
      const cls = 'bingo-cell' + (card.marks[i] ? ' marked' : '') + (inLine.has(i) ? ' in-line' : '') + (text === 'FREE' ? ' free' : '');
      grid.appendChild(el('button', {
        type: 'button', class: cls, 'aria-pressed': String(!!card.marks[i]),
        onclick: () => toggle(i),
      }, [el('span', { text: text === 'FREE' ? 'Free' : text })]));
    });
    $('bingoLines').textContent = lines.length ? `Lines: ${lines.length}` : '';
  }

  function link() {
    const p = new URLSearchParams({
      tab: 'bingo', bseed: card.seed, bsize: card.size, blevel: card.level,
      bfree: card.free ? 1 : 0, bdun: card.dungeons ? 1 : 0, bgoal: card.goals ? 1 : 0,
    });
    return location.origin + location.pathname + '?' + p.toString();
  }

  // Reads a shared card from the address bar. Returns true if found.
  function readLink() {
    const p = R.params;
    if (!p.get('bseed')) return false;
    const size = Number(p.get('bsize'));
    newCard(p.get('bseed'), {
      size: [3, 4, 5].includes(size) ? size : 5,
      level: LEVELS[p.get('blevel')] ? p.get('blevel') : 'normal',
      free: p.get('bfree') !== '0',
      dungeons: p.get('bdun') !== '0',
      goals: p.get('bgoal') !== '0',
    });
    return true;
  }

  function bind() {
    $('bingoNew').addEventListener('click', () => newCard());
    $('bingoUseSeed').addEventListener('click', () => newCard($('bingoSeed').value.trim() || undefined));
    $('bingoSeed').addEventListener('keydown', (e) => { if (e.key === 'Enter') newCard($('bingoSeed').value.trim() || undefined); });
    $('bingoCopy').addEventListener('click', () => R.copy(link(), 'Card link copied'));
    $('bingoClear').addEventListener('click', () => {
      card.marks = card.cells.map((c) => c === 'FREE');
      lineCount = 0;
      save();
      render();
    });
  }

  R.bingo = {
    init() {
      bind();
      if (R.overlay && R.overlay.sync) return;
      if (!readLink()) {
        if (card && card.cells && card.cells.length) {
          lineCount = countLines().length;
          render();
        } else newCard();
      }
    },
    render,
    card: () => card,
    // Settings changed: same seed, new options.
    remake() { newCard(card ? card.seed : undefined); },
    applyRemote(c) { card = c; lineCount = countLines().length; render(); },
    celebrate,
  };
})();
