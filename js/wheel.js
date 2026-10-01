/*
 * Wheel tab: a spinning wheel for short lists and a case opening reel for
 * long ones. Built in lists for dungeons, classes, challenges and curses,
 * plus custom lists. Rolled options can be taken off until put back.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const DEFAULT_CURSES = [
    'No ability for the next dungeon',
    'No HP potions for the next dungeon',
    'Take off your ring until the next boss dies',
    'Take off your armor for the next dungeon',
    'Use your weakest weapon until the next boss dies',
    'No pet for the next dungeon',
    'No nexus key for 10 minutes',
    'Solo the next dungeon',
    'Chat picks your next dungeon',
    'Next dungeon must be one difficulty higher',
    'Reroll your weapon on the Randomizer',
    'Reroll your ring on the Randomizer',
    'Do 10 push-ups',
    'Free pass, nothing happens',
  ];

  const PALETTE = ['#7a2e2e', '#2e5274', '#4f6b26', '#5f3a86', '#86612a', '#246b62', '#7d3466', '#3d4486', '#6b4a2e', '#2e6b3d'];
  const AUTO_WHEEL_MAX = 24;
  const REEL_CELL = 120;

  // ---------- Saved wheel data ----------

  const data = Object.assign({ removed: {}, lists: [], text: {}, elim: {}, group: null }, R.store.get(R.KEYS.wheel, {}));
  const save = () => { if (!R.follower) R.store.set(R.KEYS.wheel, data); };

  const BUILT_IN = [
    { id: 'dungeons', name: 'Dungeons' },
    { id: 'difficulty', name: 'Dungeon difficulty' },
    { id: 'classes', name: 'Classes' },
    { id: 'modes', name: 'Challenge modes' },
    { id: 'curses', name: 'Curses', text: DEFAULT_CURSES },
  ];

  function presets() {
    return BUILT_IN.concat(data.lists.map((l) => ({ id: l.id, name: l.name, custom: true })));
  }

  const presetById = (id) => presets().find((p) => p.id === id) || BUILT_IN[0];
  const current = () => presetById(R.settings.wheel.preset);

  function textLines(p) {
    if (p.custom) {
      const l = data.lists.find((x) => x.id === p.id);
      return l ? l.lines : [];
    }
    return data.text[p.id] || p.text || [];
  }

  // Every option of a list: { id, label, sub, img }
  function allItems(p) {
    switch (p.id) {
      case 'dungeons':
        return R.enabledDungeons(data.group ? [data.group] : undefined)
          .map((d) => ({ id: d.name, label: d.name, sub: R.dungeonSub(d), img: d.img }));
      case 'difficulty':
        return R.DUNGEONS.groups.filter((g) => R.settings.dungeonGroups.includes(g.id))
          .map((g) => ({ id: g.id, label: g.name, sub: `${R.enabledDungeons([g.id]).length} dungeons` }));
      case 'classes':
        return R.enabledClasses().map((c) => ({ id: String(c.id), label: c.name, img: c.img }));
      case 'modes':
        return R.MODES.map((m) => ({ id: m.id, label: m.name, sub: m.long }));
      default:
        return [...new Set(textLines(p).map((t) => t.trim()).filter(Boolean))].map((t) => ({ id: t, label: t }));
    }
  }

  const elimOn = (p) => !!data.elim[p.id];
  const removedOf = (p) => data.removed[p.id] || [];

  function activeItems(p) {
    const all = allItems(p);
    if (!elimOn(p)) return all;
    const gone = new Set(removedOf(p));
    return all.filter((x) => !gone.has(x.id));
  }

  // ---------- View state ----------
  // In an overlay that follows the main window, the view comes from messages.

  let view = null; // { name, items, style }
  let rot = 0;
  let spinning = false;
  let pendingRemove = null;
  let reelOffset = 0;
  let reelStrip = [];
  const imgCache = new Map();

  function styleFor(n) {
    const s = R.settings.wheel.style;
    if (s === 'wheel' || s === 'reel') return s;
    return n <= AUTO_WHEEL_MAX ? 'wheel' : 'reel';
  }

  function buildView() {
    const p = current();
    const items = activeItems(p);
    return { id: p.id, name: p.name, items, style: styleFor(items.length), total: allItems(p).length, elim: elimOn(p), group: data.group };
  }

  function image(src) {
    if (!src) return null;
    if (imgCache.has(src)) return imgCache.get(src);
    const img = new Image();
    img.onload = () => { if (view && view.style === 'wheel') drawWheel(); };
    img.src = src;
    imgCache.set(src, img);
    return img;
  }

  // ---------- Wheel drawing ----------

  function drawWheel(lit) {
    const cv = $('wheelCanvas');
    const g = cv.getContext('2d');
    const size = Math.max(200, Math.round(cv.clientWidth || 480));
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== size * dpr) {
      cv.width = size * dpr;
      cv.height = size * dpr;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const items = view.items;
    const n = items.length;
    const cx = size / 2;
    const r = size / 2 - 14;
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--gold').trim() || '#e0b43c';
    const headFont = css.getPropertyValue('--head').trim() || 'system-ui, sans-serif';

    // Rim
    g.fillStyle = '#100e0b';
    g.beginPath();
    g.arc(cx, cx, r + 12, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = accent;
    g.beginPath();
    g.arc(cx, cx, r + 6, 0, Math.PI * 2);
    g.fill();

    if (!n) return;
    const seg = (Math.PI * 2) / n;
    const showImg = R.settings.wheel.images && n <= 16;
    const font = Math.max(10, Math.min(18, Math.floor(300 / n)));
    for (let i = 0; i < n; i++) {
      const a0 = rot + i * seg - Math.PI / 2;
      const a1 = a0 + seg;
      g.fillStyle = PALETTE[i % PALETTE.length];
      if (n % PALETTE.length === 1 && i === n - 1) g.fillStyle = PALETTE[(i + 3) % PALETTE.length];
      g.beginPath();
      g.moveTo(cx, cx);
      g.arc(cx, cx, r, a0, a1);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 2;
      g.stroke();

      g.save();
      g.translate(cx, cx);
      g.rotate(a0 + seg / 2);
      let textEnd = r - 16;
      if (showImg && items[i].img) {
        const img = image(items[i].img);
        const s = Math.min(44, seg * r * 0.7);
        if (img && img.complete && img.naturalWidth) {
          g.imageSmoothingEnabled = false;
          g.save();
          g.translate(r - 12 - s / 2, 0);
          g.rotate(Math.PI / 2);
          g.drawImage(img, -s / 2, -s / 2, s, s);
          g.restore();
        }
        textEnd = r - 20 - s;
      }
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.font = `600 ${font}px ${headFont}`;
      let label = items[i].label;
      const maxW = textEnd - r * 0.2;
      while (g.measureText(label).width > maxW && label.length > 3) label = label.slice(0, -2);
      if (label !== items[i].label) label = label.trim() + '.';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(label, textEnd, 1);
      g.fillStyle = '#fff';
      g.fillText(label, textEnd, 1);
      g.restore();
    }

    // Lights on the rim. They chase while spinning.
    const lights = 24;
    for (let i = 0; i < lights; i++) {
      const a = (i / lights) * Math.PI * 2;
      const on = lit === undefined ? i % 2 === 0 : (i + lit) % 3 === 0;
      g.fillStyle = on ? '#fff6d0' : '#5a4612';
      const x = cx + Math.cos(a) * (r + 6);
      const y = cx + Math.sin(a) * (r + 6);
      g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
    }
  }

  // Index of the segment under the pointer at the top.
  function wheelIndex(angle, n) {
    const seg = (Math.PI * 2) / n;
    const a = ((-angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(a / seg) % n;
  }

  // ---------- Reel drawing ----------

  function reelCard(item) {
    const card = el('div', { class: 'reel-card' });
    if (item.img) {
      const pic = el('div', { class: 'reel-img' });
      pic.style.backgroundImage = `url("${item.img}")`;
      card.appendChild(pic);
    } else {
      card.classList.add('text-only');
    }
    card.appendChild(el('span', { class: 'reel-label', text: item.label }));
    return card;
  }

  function buildReel(strip) {
    const track = $('reelTrack');
    track.innerHTML = '';
    reelStrip = strip;
    strip.forEach((it, i) => {
      const c = reelCard(it);
      c.style.setProperty('--hue', PALETTE[i % PALETTE.length]);
      track.appendChild(c);
    });
  }

  function setReel(offset) {
    reelOffset = offset;
    $('reelTrack').style.transform = `translateX(${-offset}px)`;
  }

  function idleReel() {
    const items = view.items;
    if (!items.length) return;
    const strip = [];
    while (strip.length < 30) strip.push(...R.shuffle(items));
    buildReel(strip.slice(0, 30));
    const w = $('reelBox').clientWidth || 600;
    setReel(10 * REEL_CELL + REEL_CELL / 2 - w / 2);
  }

  // ---------- Render ----------

  function render() {
    if (!R.follower) view = buildView();
    if (!view) return;
    const n = view.items.length;
    const p = current();

    if (!R.follower) {
      const sel = $('wheelPreset');
      sel.innerHTML = '';
      for (const x of presets()) sel.appendChild(el('option', { value: x.id, text: x.name }));
      sel.value = p.id;
      $('wheelElim').checked = elimOn(p);
    }
    $('wheelLeft').textContent = view.elim ? `${n} of ${view.total} left` : `${n} options`;

    const f = $('wheelFilter');
    const group = view.id === 'dungeons' && view.group && R.DUNGEONS.groups.find((g) => g.id === view.group);
    f.hidden = !group;
    f.innerHTML = '';
    if (group) {
      f.append(el('span', { text: `Only ${group.name} dungeons` }),
        el('button', { type: 'button', class: 'btn small', text: 'Show all', onclick: () => { data.group = null; save(); render(); } }));
    }

    $('wheelBox').hidden = !n || view.style !== 'wheel';
    $('reelBox').hidden = !n || view.style !== 'reel';
    const empty = $('wheelEmpty');
    empty.hidden = !!n;
    empty.innerHTML = '';
    if (!n) {
      if (view.elim && view.total) {
        empty.append(el('p', { text: 'Every option has been rolled.' }),
          el('button', { type: 'button', class: 'btn ctrl', text: 'Put all back', onclick: restoreAll }));
      } else {
        empty.append(el('p', { text: view.id === 'dungeons' || view.id === 'difficulty' || view.id === 'classes'
          ? 'Nothing matches the filters. Check the settings for this tab.'
          : 'This list is empty. Add options under Edit options.' }));
      }
    }
    $('spinBtn').disabled = !n || spinning;
    $('wheelHub').disabled = !n || spinning;
    if (n && !spinning) {
      if (view.style === 'wheel') drawWheel();
      else idleReel();
    }
    if (!R.follower) {
      renderRemoved();
      renderEdit();
      R.sync.send('wheel', view);
    }
  }

  function renderRemoved() {
    const p = current();
    const all = allItems(p);
    const gone = removedOf(p);
    const panel = $('wheelRemovedPanel');
    panel.hidden = !elimOn(p);
    $('wheelRemovedCount').textContent = gone.length ? `(${gone.length})` : '';
    const box = $('wheelRemoved');
    box.innerHTML = '';
    for (const id of gone) {
      const item = all.find((x) => x.id === id);
      if (!item) continue;
      box.appendChild(el('button', {
        type: 'button', class: 'chip', text: item.label, title: 'Put back on the wheel',
        onclick: () => {
          data.removed[p.id] = removedOf(p).filter((x) => x !== id);
          save();
          render();
        },
      }));
    }
    if (!box.children.length) box.appendChild(el('p', { class: 'hint', text: 'Nothing rolled yet.' }));
  }

  let editTimer = null;
  function renderEdit() {
    const p = current();
    const box = $('wheelEdit');
    box.innerHTML = '';
    const isText = p.custom || p.text;
    if (!isText) {
      const where = {
        dungeons: 'This wheel uses the dungeon filters in the settings for this tab.',
        difficulty: 'Spin a difficulty, then spin a dungeon from it. Uses the dungeon filters in the settings.',
        classes: 'This wheel uses the class list in the Randomizer settings.',
        modes: 'All challenge modes. Win one to turn it on.',
      }[p.id];
      box.appendChild(el('p', { class: 'hint', text: where }));
    } else {
      if (p.custom) {
        const l = data.lists.find((x) => x.id === p.id);
        const name = el('input', { type: 'text', value: l.name, 'aria-label': 'List name', class: 'text-in' });
        name.addEventListener('change', () => { l.name = name.value.trim() || 'My list'; save(); render(); });
        box.append(el('label', { class: 'field' }, [el('span', { class: 'field-name', text: 'List name' }), name]));
      }
      const ta = el('textarea', { rows: 8, spellcheck: 'false', 'aria-label': 'Options, one per line' });
      ta.value = textLines(p).join('\n');
      ta.addEventListener('input', () => {
        clearTimeout(editTimer);
        editTimer = setTimeout(() => {
          const lines = ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
          if (p.custom) data.lists.find((x) => x.id === p.id).lines = lines;
          else data.text[p.id] = lines;
          save();
          const keep = document.activeElement === ta;
          render();
          if (keep) {
            const again = $('wheelEdit').querySelector('textarea');
            again.focus();
            again.setSelectionRange(again.value.length, again.value.length);
          }
        }, 500);
      });
      box.append(el('p', { class: 'hint', text: 'One option per line.' }), ta);
      const row = el('div', { class: 'row-btns' });
      if (p.custom) {
        row.appendChild(el('button', {
          type: 'button', class: 'btn small danger', text: 'Delete list',
          onclick: () => {
            if (!confirm(`Delete the list "${p.name}"?`)) return;
            data.lists = data.lists.filter((x) => x.id !== p.id);
            delete data.removed[p.id];
            R.settings.wheel.preset = 'dungeons';
            R.saveSettings();
            save();
            render();
          },
        }));
      } else {
        row.appendChild(el('button', {
          type: 'button', class: 'btn small', text: 'Reset to default',
          onclick: () => { delete data.text[p.id]; save(); render(); },
        }));
      }
      box.appendChild(row);
    }
    box.appendChild(el('button', {
      type: 'button', class: 'btn small', text: 'New list',
      onclick: () => {
        const id = 'list-' + Date.now().toString(36);
        data.lists.push({ id, name: 'My list ' + (data.lists.length + 1), lines: ['Option 1', 'Option 2', 'Option 3'] });
        R.settings.wheel.preset = id;
        R.saveSettings();
        save();
        render();
        $('wheelEditPanel').open = true;
      },
    }));
  }

  function restoreAll() {
    const p = current();
    data.removed[p.id] = [];
    save();
    render();
  }

  // ---------- Spin ----------

  const ease = (t) => 1 - Math.pow(1 - t, 4);

  // Main window: pick a result and spin to it.
  function spin() {
    if (R.follower || spinning) return;
    applyPendingRemove();
    view = buildView();
    if (!view.items.length) {
      render();
      R.sound.play('error');
      return;
    }
    const target = Math.floor(Math.random() * view.items.length);
    const plan = {
      target,
      jitter: (Math.random() - 0.5) * 0.7,
      turns: 4 + Math.floor(Math.random() * 3),
      duration: R.settings.wheel.duration * 1000,
      strip: null,
    };
    if (view.style === 'reel') {
      const strip = [];
      while (strip.length < 52) strip.push(R.pick(view.items));
      strip[46] = view.items[target];
      plan.strip = strip.map((x) => view.items.indexOf(x));
    }
    R.sync.send('wheelSpin', { view, plan });
    run(plan);
  }

  // Plays a spin plan. Runs in the main window and in following overlays.
  function run(plan) {
    spinning = true;
    R.closeModal();
    $('wheelResult').textContent = '';
    $('spinBtn').disabled = true;
    $('wheelHub').disabled = true;
    const items = view.items;
    const result = items[plan.target];
    const motion = R.fx.motion();
    const duration = motion ? plan.duration : 0;
    $('wheelStage').classList.add('is-spinning');

    if (view.style === 'wheel') {
      $('wheelBox').hidden = false;
      $('reelBox').hidden = true;
      const n = items.length;
      const seg = (Math.PI * 2) / n;
      const desired = -((plan.target + 0.5 + plan.jitter) * seg);
      const twoPi = Math.PI * 2;
      const delta = (((desired - rot) % twoPi) + twoPi) % twoPi;
      const from = rot;
      const to = rot + plan.turns * twoPi + delta;
      let lastIdx = wheelIndex(rot, n);
      const t0 = performance.now();
      const step = (now) => {
        const t = duration ? Math.min(1, (now - t0) / duration) : 1;
        rot = from + (to - from) * ease(t);
        const idx = wheelIndex(rot, n);
        if (idx !== lastIdx) {
          lastIdx = idx;
          R.sound.play('tick');
          const ptr = document.querySelector('.wheel-pointer');
          ptr.classList.remove('bump');
          void ptr.offsetWidth;
          ptr.classList.add('bump');
        }
        drawWheel(Math.floor(now / 90));
        if (t < 1) requestAnimationFrame(step);
        else {
          rot = to % twoPi;
          drawWheel();
          done(result);
        }
      };
      requestAnimationFrame(step);
    } else {
      $('wheelBox').hidden = true;
      $('reelBox').hidden = false;
      buildReel(plan.strip.map((i) => items[i]));
      const w = $('reelBox').clientWidth || 600;
      const start = 2 * REEL_CELL + REEL_CELL / 2 - w / 2;
      const end = 46 * REEL_CELL + REEL_CELL / 2 - w / 2 + plan.jitter * (REEL_CELL - 20);
      setReel(start);
      let lastIdx = -1;
      const t0 = performance.now();
      const step = (now) => {
        const t = duration ? Math.min(1, (now - t0) / duration) : 1;
        setReel(start + (end - start) * ease(t));
        const idx = Math.floor((reelOffset + w / 2) / REEL_CELL);
        if (idx !== lastIdx) {
          lastIdx = idx;
          R.sound.play('reelTick');
        }
        if (t < 1) requestAnimationFrame(step);
        else {
          const cards = $('reelTrack').children;
          if (cards[46]) cards[46].classList.add('won');
          done(result);
        }
      };
      requestAnimationFrame(step);
    }
  }

  function done(result) {
    spinning = false;
    $('wheelStage').classList.remove('is-spinning');
    $('spinBtn').disabled = false;
    $('wheelHub').disabled = false;
    $('wheelResult').textContent = result.label;
    R.sound.play(view.id === 'curses' ? 'curse' : 'win');
    const anchor = view.style === 'wheel' ? document.querySelector('.wheel-pointer') : document.querySelector('.reel-marker');
    R.fx.burstAt(anchor, { colors: R.fx.SHINY, count: 40, power: 7 });
    if (view.id !== 'curses') R.fx.confetti({ count: 70 });
    else R.fx.shake(2);
    if (R.follower) {
      if (R.settings.wheel.popup) showResult(result, false);
      return;
    }
    applyResult(result);
    if (view.elim) pendingRemove = { preset: view.id, id: result.id };
    if (R.settings.wheel.popup) showResult(result, true);
    else setTimeout(() => { if (!spinning) { applyPendingRemove(); render(); } }, 1400);
  }

  // Things a result does on its own.
  function applyResult(result) {
    if (R.run) R.run.log(`${view.name}: ${result.label}`);
    if (view.id === 'dungeons' && R.rand) R.rand.setDungeon(result.id);
    if (view.id === 'curses' && R.run) R.run.addCurse(result.label);
    R.emit('wheelResult', { preset: view.id, result });
  }

  function applyPendingRemove() {
    if (!pendingRemove) return;
    const list = data.removed[pendingRemove.preset] || (data.removed[pendingRemove.preset] = []);
    if (!list.includes(pendingRemove.id)) list.push(pendingRemove.id);
    pendingRemove = null;
    save();
  }

  function showResult(result, withButtons) {
    const pic = el('div', { class: 'sprite huge result-img' });
    if (result.img) {
      pic.style.backgroundImage = `url("${result.img}")`;
      pic.style.backgroundSize = 'contain';
      pic.style.backgroundPosition = 'center';
    } else {
      pic.classList.add('text-only');
      pic.textContent = '!';
    }
    const kids = [el('div', { class: 'rays on' }), pic,
      el('span', { class: 'label', text: view.name }),
      el('h2', { class: 'reveal-name', text: result.label })];
    if (result.sub) kids.push(el('p', { class: 'sub', text: result.sub }));
    if (view.id === 'dungeons' && withButtons) kids.push(el('p', { class: 'hint', text: 'Set as your dungeon on the Randomizer.' }));
    const btns = el('div', { class: 'row-btns center' });
    let close = null;
    const after = () => { applyPendingRemove(); render(); };
    if (withButtons) {
      const action = actionFor(result);
      if (action) btns.appendChild(el('button', { type: 'button', class: 'btn btn-gold', text: action.label, 'data-focus': '', onclick: () => { close(); action.run(); } }));
      btns.appendChild(el('button', { type: 'button', class: 'btn', text: 'Spin again', onclick: () => { close(); setTimeout(spin, 80); } }));
      btns.appendChild(el('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => close() }));
      kids.push(btns);
    }
    const box = el('div', { class: 'reveal-pop wheel-pop' + (view.id === 'curses' ? ' is-curse' : '') }, kids);
    close = R.modal(box, {
      className: 'reveal-modal',
      onClose: () => {
        if (!R.follower) {
          after();
          R.sync.send('closeModal');
        }
      },
    });
  }

  function actionFor(result) {
    if (view.id === 'classes') {
      return { label: 'Roll gear for this class', run: () => { R.main.showTab('randomizer'); R.rand.useClass(Number(result.id)); } };
    }
    if (view.id === 'modes') {
      return { label: 'Turn on this mode', run: () => R.challenges.setMode(result.id, true) };
    }
    if (view.id === 'difficulty') {
      return {
        label: `Spin ${result.label} dungeons`,
        run: () => {
          setPreset('dungeons');
          data.group = result.id;
          save();
          render();
          setTimeout(spin, 120);
        },
      };
    }
    return null;
  }

  // Picking a list clears the one time difficulty filter.
  function setPreset(id) {
    applyPendingRemove();
    data.group = null;
    save();
    R.settings.wheel.preset = id;
    R.saveSettings();
    rot = 0;
    $('wheelResult').textContent = '';
    render();
    if (R.settingsUI) R.settingsUI.build();
  }

  // Switches to the wheel tab with a list and spins it.
  // Spinning dungeons from here always uses the full list from the filters.
  function spinPreset(id) {
    if (R.follower) return;
    R.main.showTab('wheel');
    if (id && id !== R.settings.wheel.preset) setPreset(id);
    else if (id === 'dungeons' && data.group) {
      data.group = null;
      save();
      render();
    }
    setTimeout(spin, 150);
  }

  // ---------- Sync ----------

  function onRemote(type, msg) {
    if (type === 'wheel' && !spinning) {
      view = msg;
      render();
    } else if (type === 'wheelSpin') {
      view = msg.view;
      run(msg.plan);
    }
  }

  function bind() {
    $('wheelPreset').addEventListener('change', (e) => setPreset(e.target.value));
    $('wheelElim').addEventListener('change', (e) => {
      const p = current();
      data.elim[p.id] = e.target.checked;
      if (!e.target.checked) pendingRemove = null;
      save();
      render();
    });
    $('spinBtn').addEventListener('click', spin);
    $('wheelHub').addEventListener('click', spin);
    $('wheelRestoreAll').addEventListener('click', restoreAll);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!spinning && view && !$('tab-wheel').hidden) render(); }, 150);
    });
  }

  R.wheel = {
    init() { bind(); },
    render,
    spin,
    spinPreset,
    setPreset,
    onRemote,
    isSpinning: () => spinning,
    data,
    save,
  };
})();
