/*
 * Run tab: run timer, counters (deaths, dungeons, white bags and your own),
 * active curses and a log of what happened.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const LOG_MAX = 100;
  const DEFAULT_COUNTERS = [
    { id: 'deaths', name: 'Deaths', value: 0, kind: 'death' },
    { id: 'dungeons', name: 'Dungeons cleared', value: 0, kind: 'plain' },
    { id: 'whitebags', name: 'White bags', value: 0, kind: 'white' },
    { id: 'setbags', name: 'Set bags', value: 0, kind: 'set' },
  ];

  const saved = R.store.get(R.KEYS.run, null) || {};
  const data = {
    timer: saved.timer || { running: false, startedAt: 0, acc: 0 },
    counters: saved.counters || DEFAULT_COUNTERS.map((c) => ({ ...c })),
    log: saved.log || [],
    curses: saved.curses || [],
    // Default counters this browser has been given. Saves from before this
    // list existed had the first three.
    defaults: saved.defaults || (saved.counters ? ['deaths', 'dungeons', 'whitebags'] : DEFAULT_COUNTERS.map((c) => c.id)),
  };

  // New default counters are added to saved runs once. A counter removed on
  // purpose stays removed.
  const fresh = DEFAULT_COUNTERS.filter((c) => !data.defaults.includes(c.id));
  if (fresh.length) {
    for (const c of fresh) if (!data.counters.some((x) => x.id === c.id)) data.counters.push({ ...c });
    data.defaults = DEFAULT_COUNTERS.map((c) => c.id);
    if (!R.follower) R.store.set(R.KEYS.run, data);
  }

  function save() {
    if (!R.follower) R.store.set(R.KEYS.run, data);
    R.sync.send('run', data);
  }

  const elapsed = () => data.timer.acc + (data.timer.running ? Date.now() - data.timer.startedAt : 0);

  function stamp() {
    if (data.timer.running || data.timer.acc) return R.fmtTime(elapsed());
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function log(text) {
    if (!R.settings.run.logEvents || R.follower) return;
    data.log.unshift({ t: stamp(), text });
    data.log = data.log.slice(0, LOG_MAX);
    save();
    renderLog();
  }

  // ---------- Timer ----------

  function toggleTimer() {
    if (R.follower) return;
    const t = data.timer;
    if (t.running) {
      t.acc += Date.now() - t.startedAt;
      t.running = false;
      log('Timer paused');
    } else {
      t.startedAt = Date.now();
      t.running = true;
      log(t.acc ? 'Timer resumed' : 'Run started');
    }
    R.sound.play('timer');
    save();
    renderTimer();
  }

  function resetTimer() {
    data.timer = { running: false, startedAt: 0, acc: 0 };
    save();
    renderTimer();
  }

  function renderTimer() {
    $('runTimer').textContent = R.fmtTime(elapsed());
    $('timerBtn').textContent = data.timer.running ? 'Pause' : data.timer.acc ? 'Resume' : 'Start';
    $('runTimer').classList.toggle('running', data.timer.running);
  }

  // ---------- Counters ----------

  function counterFx(c, node, n) {
    if (n < 0) { R.sound.play('minus'); return; }
    if (c.kind === 'death') {
      R.sound.play('death');
      R.fx.shake(2);
      R.fx.flash('#a01c1c');
      R.fx.burstAt(node, { colors: ['#a01c1c', '#e05a4f', '#3a0d0d'], count: 30, power: 5 });
    } else if (c.kind === 'set') {
      R.sound.play('bag-orange');
      R.fx.flash('#f08a1c');
      R.fx.shake(1);
      R.fx.burstAt(node, { colors: ['#f08a1c', '#ffc078', '#ffffff'], count: 40, power: 6 });
    } else if (c.kind === 'white') {
      R.sound.play('bag-white');
      R.fx.flash('#ffffff');
      R.fx.burstAt(node, { colors: ['#ffffff', '#e8e8e8', '#b98cff'], count: 50, power: 7 });
    } else {
      R.sound.play('plus');
      R.fx.burstAt(node, { colors: [getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#e0b43c', '#ffffff'], count: 12, power: 4 });
    }
  }

  function add(id, n = 1) {
    if (R.follower) return;
    const c = data.counters.find((x) => x.id === id || x.kind === id);
    if (!c) return;
    c.value = Math.max(0, c.value + n);
    if (n > 0) log(`${c.name} +${n} (${c.value})`);
    save();
    renderCounters();
    const node = document.querySelector(`[data-counter="${c.id}"] .counter-value`);
    if (node) {
      node.classList.remove('bump');
      void node.offsetWidth;
      node.classList.add('bump');
    }
    counterFx(c, node, n);
    R.sync.send('runFx', { id: c.id, n });
    if (n > 0 && c.kind === 'death' && R.settings.run.deathCurse && R.wheel) {
      setTimeout(() => R.wheel.spinPreset('curses'), 900);
    }
  }

  function renderCounters() {
    const box = $('counters');
    box.innerHTML = '';
    for (const c of data.counters) {
      const name = el('input', { type: 'text', class: 'counter-name', value: c.name, 'aria-label': 'Counter name', readOnly: !!R.follower });
      name.addEventListener('change', () => { c.name = name.value.trim() || 'Counter'; save(); });
      const kind = el('select', { class: 'counter-kind ctrl', 'aria-label': 'Counter effect', title: 'Effect when it goes up' }, [
        el('option', { value: 'plain', text: 'Plain' }),
        el('option', { value: 'death', text: 'Death' }),
        el('option', { value: 'white', text: 'White bag' }),
        el('option', { value: 'set', text: 'Set bag' }),
      ]);
      kind.value = c.kind;
      kind.addEventListener('change', () => { c.kind = kind.value; save(); renderCounters(); });
      box.appendChild(el('div', { class: 'panel counter kind-' + c.kind, 'data-counter': c.id }, [
        name,
        el('div', { class: 'counter-value', text: String(c.value) }),
        el('div', { class: 'counter-btns ctrl' }, [
          el('button', { type: 'button', class: 'btn', text: '-1', 'aria-label': `Remove one from ${c.name}`, onclick: () => add(c.id, -1) }),
          el('button', { type: 'button', class: 'btn btn-gold', text: '+1', 'aria-label': `Add one to ${c.name}`, onclick: () => add(c.id, 1) }),
        ]),
        el('div', { class: 'counter-foot ctrl' }, [
          kind,
          el('button', {
            type: 'button', class: 'btn small', text: 'Remove',
            onclick: () => {
              if (!confirm(`Remove the counter "${c.name}"?`)) return;
              data.counters = data.counters.filter((x) => x !== c);
              save();
              renderCounters();
            },
          }),
        ]),
      ]));
    }
  }

  // ---------- Curses ----------

  function addCurse(text) {
    if (R.follower) return;
    data.curses.push({ id: Date.now().toString(36), text, t: stamp() });
    save();
    renderCurses();
  }

  function renderCurses() {
    let box = $('curseList');
    if (!box) {
      box = el('div', { class: 'panel curse-list', id: 'curseList' });
      $('counters').before(box);
    }
    box.hidden = !data.curses.length;
    box.innerHTML = '';
    box.appendChild(el('span', { class: 'label', text: 'Active curses' }));
    for (const c of data.curses) {
      box.appendChild(el('div', { class: 'curse' }, [
        el('span', { text: c.text }),
        el('button', {
          type: 'button', class: 'btn small ctrl', text: 'Done',
          onclick: () => {
            data.curses = data.curses.filter((x) => x !== c);
            log(`Curse done: ${c.text}`);
            save();
            renderCurses();
          },
        }),
      ]));
    }
  }

  function renderLog() {
    const ol = $('runLog');
    ol.innerHTML = '';
    for (const e of data.log) ol.appendChild(el('li', {}, [el('time', { text: e.t }), ' ', e.text]));
    $('runLogCount').textContent = data.log.length ? `(${data.log.length})` : '';
  }

  function render() {
    renderTimer();
    renderCurses();
    renderCounters();
    renderLog();
  }

  function bind() {
    $('timerBtn').addEventListener('click', toggleTimer);
    $('timerReset').addEventListener('click', () => {
      if (elapsed() > 60000 && !confirm('Reset the run timer?')) return;
      resetTimer();
    });
    $('addCounter').addEventListener('click', () => {
      data.counters.push({ id: 'c' + Date.now().toString(36), name: 'New counter', value: 0, kind: 'plain' });
      save();
      renderCounters();
      const inputs = document.querySelectorAll('.counter-name');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    });
    $('resetCounters').addEventListener('click', () => {
      if (!confirm('Set every counter back to 0?')) return;
      for (const c of data.counters) c.value = 0;
      log('Counters reset');
      save();
      renderCounters();
    });
    $('clearRunLog').addEventListener('click', () => {
      data.log = [];
      save();
      renderLog();
    });
    setInterval(() => { if (data.timer.running) $('runTimer').textContent = R.fmtTime(elapsed()); }, 250);
  }

  function applyRemote(d) {
    Object.assign(data, JSON.parse(JSON.stringify(d)));
    render();
  }

  // Overlay windows replay the counter effects.
  function remoteFx(msg) {
    const c = data.counters.find((x) => x.id === msg.id);
    const node = document.querySelector(`[data-counter="${msg.id}"] .counter-value`);
    if (c && node) counterFx(c, node, msg.n);
  }

  R.run = { init: bind, render, add, log, toggleTimer, addCurse, applyRemote, remoteFx, data };
})();
