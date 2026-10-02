/*
 * Show on stream: a 1920 by 1080 layout of movable pieces (timer, counters,
 * curses, build, rules, alerts, recent events, bingo, vote). The streamer
 * places them in the Stream tab, and a pop-out window shows them live.
 *
 * The Alerts piece is where wheel spins and reveals pop up. It stays empty
 * until something happens, then hides again after a few seconds.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const W = 1920;
  const H = 1080;
  const SNAP = 10;

  // Pieces that are always there. Counters are added from the run tracker.
  // w is the width the piece is drawn at before its scale.
  const BASE = [
    { id: 'timer', name: 'Run timer', w: 320, x: 40, y: 40, on: true },
    { id: 'curses', name: 'Active curses', w: 380, x: 40, y: 230, on: true },
    { id: 'build', name: 'Current build', w: 420, x: 40, y: 640, on: true },
    { id: 'alerts', name: 'Alerts (spins and reveals)', w: 600, x: 660, y: 200, on: true },
    { id: 'rules', name: 'Active rules', w: 420, x: 1460, y: 40, on: false },
    { id: 'events', name: 'Recent events', w: 420, x: 1460, y: 620, on: false },
    { id: 'bingo', name: 'Bingo card', w: 320, x: 1560, y: 300, on: false },
    { id: 'vote', name: 'Chat vote', w: 600, x: 660, y: 900, on: false },
  ];

  function pieces() {
    const list = BASE.slice();
    R.run.data.counters.forEach((c, i) => {
      list.splice(1 + i, 0, { id: 'counter:' + c.id, name: 'Counter: ' + c.name, w: 200, x: 400 + i * 220, y: 40, on: true });
    });
    return list;
  }

  const saved = () => R.settings.stream.layout || (R.settings.stream.layout = {});

  // A piece's place: saved values over the defaults.
  function cfg(p) {
    const s = saved()[p.id] || {};
    return { on: s.on === undefined ? p.on : s.on, x: s.x === undefined ? p.x : s.x, y: s.y === undefined ? p.y : s.y, scale: s.scale || 1 };
  }

  function setCfg(id, patch) {
    saved()[id] = { ...(saved()[id] || {}), ...patch };
    R.saveSettings();
  }

  // ---------- Piece content ----------

  const elapsed = (t) => t.acc + (t.running ? Date.now() - t.startedAt : 0);

  function spriteFor(it, size) {
    const box = el('div', { class: 'w-sprite' });
    box.style.width = box.style.height = size + 'px';
    if (!it) return box;
    const sheet = R.DATA.meta.sheet;
    const k = size / sheet.cell;
    box.style.backgroundImage = `url("${sheet.file}")`;
    box.style.backgroundSize = `${sheet.w * k}px ${sheet.h * k}px`;
    box.style.backgroundPosition = `-${it.x * k}px -${it.y * k}px`;
    return box;
  }

  // Returns [content, empty]. Empty pieces hide on stream but show in the editor.
  function content(p, edit) {
    const id = p.id;
    if (id === 'timer') {
      const t = R.run.data.timer;
      return [[el('span', { class: 'label', text: 'Run time' }), el('div', { class: 'w-time' + (t.running ? ' running' : ''), text: R.fmtTime(elapsed(t)) })], false];
    }
    if (id.startsWith('counter:')) {
      const c = R.run.data.counters.find((x) => 'counter:' + x.id === id);
      if (!c) return [[], true];
      return [[el('span', { class: 'label', text: c.name }),
        el('div', { 'data-counter': c.id, class: 'kind-' + c.kind }, [el('div', { class: 'counter-value', text: String(c.value) })])], false];
    }
    if (id === 'curses') {
      const list = R.run.data.curses;
      const rows = list.map((c) => el('li', { text: c.text }));
      if (!rows.length && edit) rows.push(el('li', { class: 'dim', text: 'Curses from the wheel show here.' }));
      return [[el('span', { class: 'label', text: 'Active curses' }), el('ul', { class: 'w-list' }, rows)], !list.length];
    }
    if (id === 'build') {
      const st = R.rand.state;
      const cls = R.CLASS_BY_ID.get(st.classId);
      if (!cls) return [[el('span', { class: 'label', text: 'Current build' }), el('p', { class: 'dim', text: 'Randomize to show a build.' })], true];
      const pic = el('div', { class: 'w-class-img' });
      if (!st.hidden.class && cls.img) pic.style.backgroundImage = `url("${cls.img}")`;
      else pic.textContent = '?';
      const head = el('div', { class: 'w-class' }, [pic, el('div', {}, [el('span', { class: 'label', text: 'Class' }), el('strong', { text: st.hidden.class ? '???' : cls.name })])]);
      const rows = R.CATEGORIES.map((c) => {
        const it = R.ITEM_BY_ID.get(st.items[c]);
        const hidden = st.hidden[c];
        const name = hidden ? '???' : it ? it.name : 'None';
        return el('li', { class: hidden || !it ? '' : 'kind-' + it.kind + (R.isShiny(it) ? ' shiny' : '') }, [
          hidden ? el('div', { class: 'w-sprite q', text: '?' }) : spriteFor(it, 40),
          el('span', { text: name }),
        ]);
      });
      const kids = [head, el('ul', { class: 'w-items' }, rows)];
      if (R.settings.dungeonOn && st.dungeon) kids.push(el('p', { class: 'w-dungeon' }, [el('span', { class: 'label', text: 'Dungeon' }), ' ' + st.dungeon]));
      return [kids, false];
    }
    if (id === 'rules') {
      const modes = R.MODES.filter((m) => R.settings.modes[m.id]);
      const house = (R.settings.houseRules || []).filter(Boolean);
      const rows = modes.map((m) => el('li', {}, [el('strong', { text: m.name + ' ' }), m.summary]))
        .concat(house.map((h) => el('li', {}, [el('strong', { text: 'House ' }), h])));
      if (!rows.length && edit) rows.push(el('li', { class: 'dim', text: 'Challenge modes and house rules show here.' }));
      return [[el('span', { class: 'label', text: 'Active rules' }), el('ul', { class: 'w-list' }, rows)], !modes.length && !house.length];
    }
    if (id === 'events') {
      const log = R.run.data.log.slice(0, 5);
      const rows = log.map((e) => el('li', {}, [el('time', { text: e.t }), ' ' + e.text]));
      if (!rows.length && edit) rows.push(el('li', { class: 'dim', text: 'Wheel results, counters and chat events show here.' }));
      return [[el('span', { class: 'label', text: 'Recent events' }), el('ul', { class: 'w-list w-events' }, rows)], !log.length];
    }
    if (id === 'bingo') {
      const card = R.bingo.card();
      if (!card) return [[], true];
      const grid = el('div', { class: 'w-bingo' });
      grid.style.setProperty('--n', card.size);
      card.cells.forEach((t, i) => grid.appendChild(el('i', { class: card.marks[i] ? 'on' : '', title: t })));
      const done = card.marks.filter(Boolean).length;
      return [[el('span', { class: 'label', text: `Bingo ${done} / ${card.cells.length}` }), grid], false];
    }
    if (id === 'vote') {
      const v = R.twitch.currentVote();
      if (!v) return [[el('span', { class: 'label', text: 'Chat vote' }), el('p', { class: 'dim', text: 'The keep or reroll vote shows here while it runs.' })], true];
      const t = v.tally;
      const total = t.keep + t.reroll || 1;
      return [[el('span', { class: 'label', text: v.result ? 'Vote over' : 'Chat vote: type 1 to keep, 2 to reroll' }),
        el('div', { class: 'vote-bars' }, [
          el('div', { class: 'vote-bar keep' }, [el('span', { text: `Keep: ${t.keep}` }), el('i', { style: `width:${(t.keep / total) * 100}%` })]),
          el('div', { class: 'vote-bar reroll' }, [el('span', { text: `Reroll: ${t.reroll}` }), el('i', { style: `width:${(t.reroll / total) * 100}%` })]),
        ])], false];
    }
    if (id === 'alerts') {
      return [[el('p', { class: 'w-alert-hint', text: 'Wheel spins and reveals pop up here, then hide again.' })], false];
    }
    return [[], true];
  }

  // ---------- Drawing pieces on a canvas ----------

  // Draws the pieces into a 1920 by 1080 canvas. Keeps one element per piece
  // so the live alert area is never rebuilt.
  function draw(canvas, mode) {
    const edit = mode === 'edit';
    const seen = new Set();
    for (const p of pieces()) {
      const c = cfg(p);
      if (!c.on) continue;
      seen.add(p.id);
      let node = canvas.querySelector(`[data-piece="${CSS.escape(p.id)}"]`);
      if (!node) {
        node = el('div', { class: 'sw panel', 'data-piece': p.id });
        node.appendChild(el('div', { class: 'sw-body' }));
        if (edit) {
          node.appendChild(el('span', { class: 'sw-name', text: p.name }));
          node.appendChild(el('span', { class: 'sw-size', title: 'Drag to resize' }));
        }
        canvas.appendChild(node);
      }
      node.classList.toggle('w-alerts', p.id === 'alerts');
      node.style.left = c.x + 'px';
      node.style.top = c.y + 'px';
      node.style.width = p.w + 'px';
      node.style.transform = `scale(${c.scale})`;
      if (p.id === 'alerts' && !edit) {
        // The live alert area holds the moved wheel and pop-ups. Do not rebuild it.
        continue;
      }
      const [kids, empty] = content(p, edit);
      const body = node.querySelector('.sw-body');
      // Only rebuild when something changed, so effects on counters are not cut off.
      const sig = JSON.stringify(kids.map((k) => k.outerHTML));
      if (node._sig !== sig) {
        node._sig = sig;
        body.innerHTML = '';
        body.append(...kids);
      }
      node.classList.toggle('is-empty', empty && !edit);
    }
    for (const node of canvas.querySelectorAll('[data-piece]')) if (!seen.has(node.dataset.piece)) node.remove();
  }

  // ---------- Live stream window ----------

  let live = null; // { canvas, host, mode }
  let holdUntil = 0;
  let modalTimer = null;
  let jumpedFrom = null;

  const hold = () => (Number(R.settings.stream.hold) || 6) * 1000;

  function fitLive() {
    if (!live || !live.canvas) return;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    live.canvas.style.transform = `scale(${s})`;
  }

  // Moves the wheel into the alert area so spins play there.
  function wheelIntoHost() {
    const stage = $('wheelStage');
    if (live && live.host && stage.parentNode !== live.host) live.host.appendChild(stage);
  }

  function alertActive() {
    return R.wheel.isSpinning() || R.modalOpen() || Date.now() < holdUntil;
  }

  // Shows the alert area while something happens, hides it after.
  // ---------- Earlier results ----------
  // When one event gives several spins, the earlier results stay visible
  // under the wheel. Stream windows start a fresh list for each alert.

  let results = [];

  function renderHistory() {
    const box = $('spinHistory');
    if (!box) return;
    const s = R.settings.stream;
    const earlier = results.slice(1, 1 + (Number(s.historyCount) || 3));
    box.hidden = !s.history || !earlier.length;
    box.innerHTML = '';
    if (box.hidden) return;
    box.appendChild(el('span', { class: 'label', text: 'Earlier results' }));
    const list = el('div', { class: 'spin-history-list' });
    for (const r of earlier) {
      const chip = el('div', { class: 'spin-chip' + (r.preset === 'curses' ? ' is-curse' : '') });
      if (r.img) {
        const pic = el('i');
        pic.style.backgroundImage = `url("${r.img}")`;
        chip.appendChild(pic);
      }
      chip.appendChild(el('span', { text: r.label }));
      list.appendChild(chip);
    }
    box.appendChild(list);
  }

  // Several spins from one event have short gaps between them. The alert
  // stays up through gaps under GAP ms, and the list clears after that.
  const GAP = 1500;
  let lastOn = 0;

  function tick() {
    if (live && live.host) {
      const now = Date.now();
      if (alertActive()) lastOn = now;
      const on = now - lastOn < GAP;
      live.host.classList.toggle('active', on);
      if (!on && results.length) {
        results = [];
        renderHistory();
      }
      $('wheelStage').classList.toggle('alert-idle', !R.wheel.isSpinning() && Date.now() >= holdUntil);
    }
    // Tab pop-outs that jumped to the wheel go back when it is over.
    if (jumpedFrom && !alertActive()) {
      R.main.showTab(jumpedFrom, { force: true });
      jumpedFrom = null;
    }
    if (live && live.canvas) draw(live.canvas, 'live');
  }

  function startLive(view) {
    document.body.classList.add('overlay-stage');
    const root = el('div', { class: 'stage-root' });
    if (view === 'alerts') {
      // Only the alert area, in the middle of the window.
      const host = el('div', { class: 'alert-host alerts-only' });
      root.appendChild(host);
      live = { host, canvas: null };
      host.style.transform = `translate(-50%, -50%) scale(${(R.overlay.scale || 100) / 100})`;
    } else {
      const canvas = el('div', { class: 'stage-canvas' });
      root.appendChild(canvas);
      live = { canvas, host: null };
      draw(canvas, 'live');
      const piece = canvas.querySelector('[data-piece="alerts"] .sw-body');
      if (piece) {
        live.host = el('div', { class: 'alert-host' });
        piece.appendChild(live.host);
      }
      window.addEventListener('resize', fitLive);
      fitLive();
    }
    document.body.appendChild(root);
    R.alertHost = live.host;
    wheelIntoHost();
    R.on('settingsLoaded', () => {
      if (!live.canvas) return;
      draw(live.canvas, 'live');
      // The alert piece may have been turned on or moved.
      const piece = live.canvas.querySelector('[data-piece="alerts"] .sw-body');
      if (piece && live.host && live.host.parentNode !== piece) piece.appendChild(live.host);
      if (piece && !live.host) {
        live.host = el('div', { class: 'alert-host' });
        piece.appendChild(live.host);
        R.alertHost = live.host;
        wheelIntoHost();
      }
    });
  }

  function bindAlerts() {
    R.on('spinStart', () => {
      holdUntil = 0;
      wheelIntoHost();
      // A tab pop-out can jump to the wheel for the spin.
      const o = R.overlay;
      if (o && !live && o.view !== 'follow' && o.view !== 'wheel' && R.settings.stream.jump) {
        if (!jumpedFrom) jumpedFrom = R.stream.overlayTab(o.view);
        R.main.showTab('wheel', { force: true });
      }
    });
    R.on('spinDone', (result) => {
      holdUntil = Date.now() + hold();
      if (!result) return;
      results.unshift({ label: result.label, img: result.img, preset: R.wheel.snapshot() ? R.wheel.snapshot().id : '' });
      results = results.slice(0, 11);
      renderHistory();
    });
    R.on('settingsLoaded', renderHistory);
    // In stream windows, pop-ups close on their own after the hold time.
    R.on('modalOpen', () => {
      clearTimeout(modalTimer);
      if (live || jumpedFrom) modalTimer = setTimeout(() => R.closeModal(), hold() + 1500);
    });
    R.on('modalClose', () => {
      clearTimeout(modalTimer);
      holdUntil = Math.max(holdUntil, Date.now() + 400);
    });
    setInterval(tick, 200);
  }

  // ---------- Editor in the Stream tab ----------

  function editor(box) {
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Pick what goes on your stream and drag it into place. Drag the corner of a piece to resize it. Then open the stream window and capture it in OBS.' }));

    const canvas = el('div', { class: 'stage-canvas edit' });
    const preview = el('div', { class: 'stage-preview' }, [canvas]);
    box.appendChild(preview);
    let view = 1;
    const fit = () => {
      view = preview.clientWidth / W;
      canvas.style.transform = `scale(${view})`;
      preview.style.height = H * view + 'px';
    };
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(preview);
    draw(canvas, 'edit');
    fit();

    // Drag to move, drag the corner to resize.
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      const node = e.target.closest('[data-piece]');
      if (!node) return;
      const p = pieces().find((x) => x.id === node.dataset.piece);
      const c = cfg(p);
      drag = { node, p, c, sx: e.clientX, sy: e.clientY, resize: e.target.classList.contains('sw-size') };
      node.setPointerCapture(e.pointerId);
      node.classList.add('dragging');
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.sx) / view;
      const dy = (e.clientY - drag.sy) / view;
      if (drag.resize) {
        const scale = Math.max(0.4, Math.min(3, Math.round(((drag.p.w * drag.c.scale + dx) / drag.p.w) * 20) / 20));
        drag.next = { scale };
        drag.node.style.transform = `scale(${scale})`;
      } else {
        const x = Math.max(0, Math.min(W - 40, Math.round((drag.c.x + dx) / SNAP) * SNAP));
        const y = Math.max(0, Math.min(H - 40, Math.round((drag.c.y + dy) / SNAP) * SNAP));
        drag.next = { x, y };
        drag.node.style.left = x + 'px';
        drag.node.style.top = y + 'px';
      }
    });
    const end = () => {
      if (!drag) return;
      drag.node.classList.remove('dragging');
      if (drag.next) setCfg(drag.p.id, drag.next);
      drag = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // Keep the preview current while the tab is open.
    setInterval(() => { if (!drag && box.isConnected && !$('tab-stream').hidden) draw(canvas, 'edit'); }, 600);

    const list = el('div', { class: 'check-list cols' });
    for (const p of pieces()) {
      list.appendChild(R.checkbox(p.name, cfg(p).on, (on) => { setCfg(p.id, { on }); draw(canvas, 'edit'); }));
    }
    box.append(el('h4', { class: 'sub-head', text: 'Pieces' }), list);
    box.appendChild(el('div', { class: 'row-btns' }, [
      el('button', { type: 'button', class: 'btn btn-gold', text: 'Open stream window', onclick: () => R.stream.popOut('layout') }),
      el('button', {
        type: 'button', class: 'btn small', text: 'Reset layout',
        onclick: () => {
          if (!confirm('Put every piece back in its first place?')) return;
          R.settings.stream.layout = {};
          R.saveSettings();
          editor(box);
        },
      }),
    ]));
    box.appendChild(el('p', { class: 'hint', text: 'The stream window is 1920 by 1080 and scales to fit. Size the window to 16 by 9, or crop it in OBS. Pieces with nothing to show, like curses when there are none, stay hidden on stream.' }));
  }

  // A short line about the event that started an alert, like
  // "Sam cheered 500 bits / Spin Curses". Shows in the alert area of stream
  // windows, or at the top of the page everywhere else.
  function banner(head, tail, remote) {
    if (!remote) R.sync.send('banner', { head, tail });
    const b = el('div', { class: 'alert-banner' }, [el('strong', { text: head }), tail ? el('span', { text: tail }) : null]);
    if (live && live.host) {
      live.host.insertBefore(b, live.host.firstChild);
      holdUntil = Math.max(holdUntil, Date.now() + hold());
    } else {
      let stack = $('bannerStack');
      if (!stack) stack = document.body.appendChild(el('div', { id: 'bannerStack', class: 'banner-stack' }));
      stack.appendChild(b);
    }
    R.sound.play('vote');
    setTimeout(() => b.remove(), hold() + 800);
  }

  R.layout = {
    banner,
    renderHistory,
    init() {
      bindAlerts();
      const o = R.overlay;
      if (o && (o.view === 'layout' || o.view === 'alerts')) startLive(o.view);
    },
    editor,
  };
})();
