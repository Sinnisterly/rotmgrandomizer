/*
 * Settings sidebar. The top part changes with the tab. The General part
 * (effects, sound, look, hotkeys, backup) is always there.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  // Collapsible section. Remembers if it was open.
  function section(id, title, build, opts = {}) {
    const open = R.settings.open[id];
    const d = el('details', { class: 'panel fold' });
    d.open = open === undefined ? !!opts.open : open;
    const body = el('div', { class: 'fold-body' });
    d.append(el('summary', { text: title }), body);
    d.addEventListener('toggle', () => {
      R.settings.open[id] = d.open;
      R.saveSettings();
    });
    if (opts.hint) body.appendChild(el('p', { class: 'hint', text: opts.hint }));
    build(body);
    return d;
  }

  const s = () => R.settings;
  const save = () => R.saveSettings();

  // Pool settings changed: save and refresh the roll.
  function poolChanged(rebuild) {
    save();
    R.rand.changed();
    if (rebuild) build();
  }

  function wheelChanged() {
    save();
    R.wheel.render();
  }

  // ---------- Randomizer ----------

  function randomizerSections(add) {
    add(section('reveal', 'Reveal', (b) => {
      const rv = s().reveal;
      b.append(
        R.checkbox('Hide results until clicked', rv.on, (on) => { rv.on = on; poolChanged(true); },
          { small: 'Every roll shows "?" cards. Click one to reveal it.' }),
        R.select('Reveal style', rv.style, [['bag', 'Loot bag pop-up'], ['flip', 'Flip the card']], (v) => { rv.style = v; save(); }),
        R.checkbox('Open bags on their own', rv.autoOpen, (on) => { rv.autoOpen = on; save(); },
          { small: 'Off: click the bag to open it.' }),
        R.checkbox('Hide the class too', rv.hideClass, (on) => { rv.hideClass = on; save(); }),
      );
    }, { open: true }));

    add(section('tokens', 'Reroll limit', (b) => {
      const t = s().tokens;
      b.append(
        R.checkbox('Limit rerolls per run', t.on, (on) => { t.on = on; poolChanged(true); },
          { small: 'Randomize starts a new run and refills them.' }),
        R.range('Rerolls', t.count, 1, 10, 1, (v) => { t.count = v; poolChanged(); }, { disabled: !t.on }),
      );
    }));

    add(section('norepeat', 'No repeats', (b) => {
      const nr = s().noRepeat;
      const u = R.rand.usedCounts();
      b.append(
        R.checkbox('No repeat classes', nr.classes, (on) => { nr.classes = on; poolChanged(); },
          { small: `${u.classes} of ${R.enabledClasses().length} rolled. Starts over when all are used.` }),
        R.checkbox('No repeat items', nr.items, (on) => { nr.items = on; poolChanged(); },
          { small: `${u.items} items rolled so far.` }),
        el('div', { class: 'row-btns' }, [
          el('button', { type: 'button', class: 'btn small', text: 'Reset classes', onclick: () => { R.rand.resetUsed('classes'); build(); } }),
          el('button', { type: 'button', class: 'btn small', text: 'Reset items', onclick: () => { R.rand.resetUsed('items'); build(); } }),
        ]),
        el('p', { class: 'hint', text: 'Seeds only give the same roll when this is off.' }),
      );
    }));

    add(section('itemtypes', 'Item types', (b) => {
      const kinds = R.allowedKinds();
      const weights = el('div', { class: 'weights' });
      for (const k of R.KINDS) {
        if (!R.KIND_COUNTS[k.id]) continue;
        const row = R.range(`${k.name} (${R.KIND_COUNTS[k.id]})`, s().weights[k.id], 0, 100, 1,
          (v) => { s().weights[k.id] = v; poolChanged(); },
          { disabled: !kinds.has(k.id), fmt: (v) => (kinds.has(k.id) ? String(v) : 'off') });
        row.classList.add('weight-row', k.id);
        weights.appendChild(row);
      }
      b.appendChild(weights);
      const inc = el('div', { class: 'check-list' });
      for (const f of R.FLAGS) {
        const n = R.ITEMS.filter((it) => it.flags.includes(f.id)).length;
        if (!n) continue;
        inc.appendChild(R.checkbox(`${f.name} (${n})`, s().include[f.id], (on) => { s().include[f.id] = on; poolChanged(); }, { small: f.hint }));
      }
      b.appendChild(inc);
    }, { open: true, hint: 'Weight is how often each type is picked. 0 turns it off. Pool modes on the Challenges tab can turn types off.' }));

    add(section('enchants', 'Enchantments', (b) => {
      const ec = s().enchants;
      const has = R.ENCHANTS.length > 0;
      b.append(
        R.checkbox('Roll enchantments', ec.on && has, (on) => { ec.on = on; poolChanged(true); },
          { disabled: !has, small: has ? `${R.ENCHANTS.length} enchantments. Rolls never combine incompatible ones.` : 'No enchant data in this build.' }),
        R.checkbox('Include unique enchantments', ec.unique, (on) => { ec.unique = on; save(); }, { disabled: !ec.on }),
        R.range('Per item', ec.count, 1, 4, 1, (v) => { ec.count = v; save(); }, { disabled: !ec.on }),
      );
    }));

    add(section('stsets', 'ST sets', (b) => {
      b.appendChild(R.range('Set chance', s().setChance, 0, 100, 5, (v) => { s().setChance = v; save(); }, { fmt: (v) => v + '%' }));
    }, { hint: 'Chance that a roll gives a full ST set for the class instead of single items. Needs ST items turned on.' }));

    add(section('tiers', 'Tier limits', (b) => {
      const list = el('div', { class: 'tier-list' });
      for (const c of R.CATEGORIES) {
        const max = R.MAX_TIER[c] || 0;
        const opts = [...Array(max + 1)].map((_, t) => [String(t), 'T' + t]);
        const mk = (idx) => {
          const sel = el('select', { 'aria-label': `${R.CATEGORY_NAMES[c]} ${idx ? 'max' : 'min'} tier` });
          for (const [v, l] of opts) sel.appendChild(el('option', { value: v, text: l }));
          sel.value = String(s().tiers[c][idx]);
          sel.addEventListener('change', () => {
            s().tiers[c][idx] = Number(sel.value);
            const [lo, hi] = s().tiers[c];
            if (lo > hi) s().tiers[c] = idx ? [hi, hi] : [lo, lo];
            poolChanged(true);
          });
          return sel;
        };
        list.appendChild(el('div', { class: 'tier-row' }, [el('span', { text: R.CATEGORY_NAMES[c] }), mk(0), el('span', { text: 'to' }), mk(1)]));
      }
      b.appendChild(list);
    }, { hint: 'Only affects tiered items.' }));

    add(section('classes', 'Classes', (b) => {
      b.appendChild(el('div', { class: 'row-btns' }, [
        el('button', { type: 'button', class: 'btn small', text: 'All', onclick: () => { s().classesOff = []; poolChanged(true); R.wheel.render(); } }),
        el('button', { type: 'button', class: 'btn small', text: 'None', onclick: () => { s().classesOff = R.CLASSES.map((c) => c.id); poolChanged(true); R.wheel.render(); } }),
      ]));
      const list = el('div', { class: 'check-list cols' });
      for (const cls of R.CLASSES) {
        list.appendChild(R.checkbox(cls.name, !s().classesOff.includes(cls.id), (on) => {
          s().classesOff = s().classesOff.filter((id) => id !== cls.id);
          if (!on) s().classesOff.push(cls.id);
          save();
          R.wheel.render();
        }));
      }
      b.appendChild(list);
    }));

    add(section('dungeon', 'Dungeon', (b) => {
      b.appendChild(R.checkbox('Show the dungeon under the build', s().dungeonOn, (on) => { s().dungeonOn = on; poolChanged(); },
        { small: 'Spin it on the Wheel tab. The dungeon filters are in the Wheel settings.' }));
    }));
  }

  // ---------- Wheel ----------

  function dungeonFilters(b, onChange) {
    b.appendChild(el('h4', { class: 'sub-head', text: 'Difficulty' }));
    b.appendChild(el('p', { class: 'hint', text: "Uses RealmEye's difficulty ratings." }));
    const groups = el('div', { class: 'check-list' });
    R.DUNGEONS.groups.forEach((g, i) => {
      const count = R.DUNGEONS.dungeons.filter((d) => d.group === g.id).length;
      const lo = i > 0 ? R.DUNGEONS.groups[i - 1].max + 0.5 : 0;
      const range = i === R.DUNGEONS.groups.length - 1 ? `Difficulty ${lo} and up` : `Difficulty ${lo} to ${g.max}`;
      groups.appendChild(R.checkbox(`${g.name} (${count})`, s().dungeonGroups.includes(g.id), (on) => {
        s().dungeonGroups = s().dungeonGroups.filter((id) => id !== g.id);
        if (on) s().dungeonGroups.push(g.id);
        onChange();
      }, { small: range }));
    });
    b.appendChild(groups);
    b.appendChild(el('h4', { class: 'sub-head', text: 'Dungeon types' }));
    const secs = el('div', { class: 'check-list' });
    for (const x of R.DUNGEONS.sections) {
      const count = R.DUNGEONS.dungeons.filter((d) => d.section === x.id).length;
      secs.appendChild(R.checkbox(`${x.name} (${count})`, s().dungeonSections.includes(x.id), (on) => {
        s().dungeonSections = s().dungeonSections.filter((id) => id !== x.id);
        if (on) s().dungeonSections.push(x.id);
        onChange();
      }));
    }
    b.appendChild(secs);
  }

  function wheelSections(add) {
    add(section('wheel', 'Wheel', (b) => {
      const w = s().wheel;
      b.append(
        R.select('Style', w.style, [['auto', 'Auto (reel for long lists)'], ['wheel', 'Wheel'], ['reel', 'Case opening reel']], (v) => { w.style = v; wheelChanged(); }),
        R.range('Spin time', w.duration, 2, 12, 1, (v) => { w.duration = v; save(); }, { fmt: (v) => v + 's' }),
        R.checkbox('Show pictures on the wheel', w.images, (on) => { w.images = on; wheelChanged(); }, { small: 'For lists with 16 options or fewer.' }),
        R.checkbox('Show the result in a pop-up', w.popup, (on) => { w.popup = on; save(); }),
      );
    }, { open: true }));
    add(section('dungeonFilters', 'Dungeon filters', (b) => dungeonFilters(b, wheelChanged), { open: true }));
  }

  // ---------- Run and bingo ----------

  function runSections(add) {
    add(section('runopts', 'Run tracker', (b) => {
      const r = s().run;
      b.append(
        R.checkbox('Spin the Curses wheel on a death', r.deathCurse, (on) => { r.deathCurse = on; save(); }),
        R.checkbox('Log events', r.logEvents, (on) => { r.logEvents = on; save(); },
          { small: 'Counters, wheel results and bingo squares go in the log.' }),
      );
    }, { open: true }));
  }

  function bingoSections(add) {
    add(section('bingoopts', 'Bingo card', (b) => {
      const bg = s().bingo;
      const remake = () => { save(); R.bingo.remake(); };
      b.append(
        R.select('Size', String(bg.size), [['3', '3 by 3'], ['4', '4 by 4'], ['5', '5 by 5']], (v) => { bg.size = Number(v); remake(); }),
        R.select('Difficulty', bg.level, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], (v) => { bg.level = v; remake(); }),
        R.checkbox('Free square in the middle', bg.free, (on) => { bg.free = on; remake(); }, { small: 'Only on 3 by 3 and 5 by 5 cards.' }),
        R.checkbox('Dungeon squares', bg.dungeons, (on) => { bg.dungeons = on; remake(); }),
        R.checkbox('Goal squares', bg.goals, (on) => { bg.goals = on; remake(); }, { small: 'Boss kills, white bags, maxed stats and more.' }),
        el('p', { class: 'hint', text: 'Changing these makes a new card with the same seed and clears the marks.' }),
      );
    }, { open: true }));
  }

  // ---------- General ----------

  const THEMES = [['dungeon', 'Dungeon'], ['nexus', 'Nexus'], ['void', 'Void']];
  const FONTS = [['pixel', 'Pixel'], ['titles', 'Pixel titles only'], ['plain', 'Plain (easiest to read)']];
  const ACCENTS = ['#e0b43c', '#b98cff', '#ff9d3b', '#2fc4d6', '#e05a4f', '#6fcf5a', '#f4f4f4'];

  function generalSections(add) {
    add(section('effects', 'Effects', (b) => {
      const f = s().fx;
      const off = R.reduceMotion;
      b.append(
        R.checkbox('Animations', f.animate && !off, (on) => { f.animate = on; save(); build(); },
          { disabled: off, small: off ? 'Off because your system asks for reduced motion.' : 'Spins, bag drops and card flips.' }),
        R.select('Speed', f.speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], (v) => { f.speed = v; save(); }),
        R.checkbox('Particles', f.particles, (on) => { f.particles = on; save(); }),
        R.select('Particle amount', f.amount, [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']], (v) => { f.amount = v; save(); }),
        R.checkbox('Screen shake on rare drops', f.shake, (on) => { f.shake = on; save(); }),
        R.checkbox('Screen flash on rare drops', f.flash, (on) => { f.flash = on; save(); }),
        R.checkbox('Glow around UT, ST and shiny items', f.glow, (on) => { f.glow = on; save(); R.main.applyLook(); }),
        el('button', {
          type: 'button', class: 'btn small', text: 'Test a white bag',
          onclick: (e) => {
            R.sound.play('bag-white');
            R.fx.burstAt(e.target, { colors: ['#ffffff', '#b98cff'], count: 60, power: 7 });
            R.fx.flash('#ffffff');
            R.fx.shake(2);
          },
        }),
      );
    }));

    add(section('sound', 'Sound', (b) => {
      const so = s().sound;
      const cats = [['ui', 'Buttons'], ['spin', 'Spins and ticks'], ['reveal', 'Reveals'], ['fanfare', 'Rare drops and wins'], ['events', 'Run tracker and votes']];
      b.append(
        R.checkbox('Sound', so.on, (on) => { so.on = on; save(); R.main.renderMute(); }),
        R.range('Volume', so.volume, 0, 100, 5, (v) => { so.volume = v; save(); }, { fmt: (v) => v + '%' }),
        R.select('Sound style', so.style, [['retro', 'Retro (8-bit)'], ['soft', 'Soft']], (v) => { so.style = v; save(); R.sound.play('bag-cyan'); }),
      );
      const list = el('div', { class: 'check-list' });
      for (const [id, name] of cats) list.appendChild(R.checkbox(name, so[id], (on) => { so[id] = on; save(); }));
      b.appendChild(list);
      b.appendChild(el('div', { class: 'row-btns' }, [
        el('button', { type: 'button', class: 'btn small', text: 'Test', onclick: () => R.sound.play('win') }),
        el('button', { type: 'button', class: 'btn small', text: 'Test rare', onclick: () => R.sound.play('bag-orange') }),
      ]));
    }));

    add(section('look', 'Look', (b) => {
      const lk = s().look;
      b.appendChild(R.select('Theme', lk.theme, THEMES, (v) => { lk.theme = v; save(); R.main.applyLook(); }));
      b.appendChild(R.select('Font', lk.font, FONTS, (v) => { lk.font = v; save(); R.main.applyLook(); R.wheel.render(); }));
      b.appendChild(el('span', { class: 'field-name', text: 'Accent color' }));
      const sw = el('div', { class: 'swatches' });
      for (const c of ACCENTS) {
        sw.appendChild(el('button', {
          type: 'button', class: 'swatch' + (lk.accent === c ? ' on' : ''), title: c, 'aria-label': 'Accent ' + c,
          style: `background:${c}`,
          onclick: () => { lk.accent = c; save(); R.main.applyLook(); build(); },
        }));
      }
      const pick = el('input', { type: 'color', value: lk.accent, 'aria-label': 'Custom accent color' });
      pick.addEventListener('input', () => { lk.accent = pick.value; save(); R.main.applyLook(); });
      sw.appendChild(pick);
      b.appendChild(sw);
      b.appendChild(R.range('Text size', lk.scale, 85, 150, 5, (v) => { lk.scale = v; save(); R.main.applyLook(); }, { fmt: (v) => v + '%' }));
    }));

    add(section('hotkeys', 'Hotkeys', (b) => R.stream.hotkeyEditor(b)));

    add(section('backup', 'Backup and reset', (b) => {
      b.append(
        el('p', { class: 'hint', text: 'Copy your settings and lists to move them to another browser.' }),
        el('div', { class: 'row-btns' }, [
          el('button', {
            type: 'button', class: 'btn small', text: 'Copy settings',
            onclick: () => R.copy(JSON.stringify({ settings: { ...s(), open: {} }, wheel: R.wheel.data }), 'Settings copied'),
          }),
          el('button', {
            type: 'button', class: 'btn small', text: 'Paste settings',
            onclick: () => {
              const text = window.prompt('Paste your settings:');
              if (!text) return;
              try {
                const j = JSON.parse(text);
                if (j.settings) R.store.set(R.KEYS.settings, j.settings);
                if (j.wheel) R.store.set(R.KEYS.wheel, j.wheel);
                location.reload();
              } catch (e) {
                R.toast('That did not look like settings.');
              }
            },
          }),
        ]),
        el('button', {
          type: 'button', class: 'btn small danger', text: 'Reset all settings',
          onclick: () => {
            if (!confirm('Reset every setting to the default?')) return;
            R.settings = R.defaultSettings();
            save();
            location.reload();
          },
        }),
      );
    }));
  }

  // ---------- Build ----------

  const TAB_SECTIONS = {
    randomizer: randomizerSections,
    wheel: wheelSections,
    run: runSections,
    bingo: bingoSections,
  };

  function build() {
    const tabBox = $('settingsTab');
    const genBox = $('settingsGeneral');
    if (!tabBox) return;
    const scrollY = window.scrollY;
    tabBox.innerHTML = '';
    genBox.innerHTML = '';
    const fn = TAB_SECTIONS[s().tab];
    const name = { randomizer: 'Randomizer', wheel: 'Wheel', challenges: 'Challenges', run: 'Run', bingo: 'Bingo', stream: 'Stream' }[s().tab];
    tabBox.appendChild(el('h3', { class: 'settings-sub', text: name }));
    if (fn) fn((node) => tabBox.appendChild(node));
    else tabBox.appendChild(el('p', { class: 'hint pad', text: s().tab === 'stream' ? 'Stream settings are on the tab itself.' : 'Challenge modes are set on the tab itself.' }));
    generalSections((node) => genBox.appendChild(node));
    window.scrollTo(0, scrollY);
  }

  R.settingsUI = { build, section };
})();
