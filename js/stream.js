/*
 * Stream tools: overlay mode for OBS, pop-out windows that copy the main
 * window (one per tab, an alerts window and the Show on stream layout), and
 * hotkeys.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const VIEWS = [
    ['follow', 'Follow my tab'],
    ['randomizer', 'Randomizer'],
    ['wheel', 'Wheel'],
    ['rules', 'Active rules'],
    ['run', 'Run tracker'],
    ['bingo', 'Bingo'],
    ['layout', 'Show on stream layout'],
    ['alerts', 'Alerts only'],
  ];
  // Pop-outs that can be opened from the Stream tab, each in its own window.
  const POPOUTS = [
    ['randomizer', 'Randomizer', 'The build and the dungeon.'],
    ['wheel', 'Wheel', 'The wheel or reel, always on screen.'],
    ['rules', 'Active rules', 'Challenge modes and house rules.'],
    ['run', 'Run tracker', 'Timer, counters, curses and the log.'],
    ['bingo', 'Bingo', 'The bingo card.'],
    ['alerts', 'Alerts', 'Empty until a spin or reveal happens, then it pops up and hides again.'],
  ];
  const BGS = [
    ['transparent', 'Transparent (OBS browser source)'],
    ['green', 'Green screen'],
    ['magenta', 'Magenta screen'],
    ['dark', 'Dark'],
  ];

  // ---------- Overlay mode ----------

  function applyOverlay() {
    const o = R.overlay;
    if (!o) return;
    document.body.classList.add('overlay');
    document.body.dataset.bg = o.bg;
    if (o.view === 'rules') document.body.classList.add('overlay-rules');
    document.title = 'RotMG Randomizer: ' + (VIEWS.find(([v]) => v === o.view) || ['', 'Overlay'])[1];
    $('layout').style.zoom = String(o.scale / 100);
  }

  // Tab to show in the overlay for a view.
  function overlayTab(view) {
    if (view === 'rules') return 'challenges';
    return VIEWS.some(([v]) => v === view) && view !== 'follow' ? view : null;
  }

  function overlayUrl(extra) {
    const s = R.settings.stream;
    const p = new URLSearchParams({ overlay: '1', view: s.view, bg: s.bg, scale: s.scale, ...extra });
    return location.origin + location.pathname + '?' + p.toString();
  }

  // Each view opens in its own window, so several can be open at once.
  function popOut(view) {
    const size = view === 'layout' ? 'width=1280,height=760' : view === 'alerts' ? 'width=760,height=820' : 'width=960,height=820';
    const w = window.open(overlayUrl({ sync: '1', view, bg: R.settings.stream.popBg }), 'rotmgr-' + view, size);
    if (!w) R.toast('Your browser blocked the pop-up. Allow pop-ups for this site.');
  }

  // ---------- Sync: the main window answers, the overlay follows ----------

  function sendAll() {
    R.sync.send('tab', R.settings.tab);
    R.sync.send('rand', { snap: R.rand.snapshot(), spun: [] });
    R.sync.send('wheel', R.wheel.snapshot());
    R.sync.send('run', R.run.data);
    R.sync.send('bingo', R.bingo.card());
    R.twitch.renderVote();
  }

  function follow(type, data) {
    switch (type) {
      case 'tab':
        if (R.overlay.view === 'follow') R.main.showTab(data);
        break;
      case 'rand':
        R.rand.applySnapshot(data.snap, data.spun);
        R.challenges.render();
        break;
      case 'reveal': R.rand.reveal(data.slot, { inline: data.inline }); break;
      case 'closeModal': R.closeModal(); break;
      case 'wheel':
      case 'wheelSpin': R.wheel.onRemote(type, data); break;
      case 'run': R.run.applyRemote(data); break;
      case 'runFx': R.run.remoteFx(data); break;
      case 'bingo': if (data) R.bingo.applyRemote(data); break;
      case 'bingoFx': R.bingo.celebrate(true); break;
      case 'vote': R.twitch.renderVote(data); break;
      case 'banner': R.layout.banner(data.head, data.tail, true); break;
      default: break;
    }
  }

  function startSync() {
    if (R.follower) {
      R.sync.listen(follow);
      R.sync.hello();
      // Settings live in shared storage. Pick up changes from the main window.
      window.addEventListener('storage', (e) => {
        if (e.key !== R.KEYS.settings) return;
        R.settings = R.loadSettings();
        R.main.applyLook();
        R.emit('settingsLoaded');
      });
    } else {
      R.sync.listen((type) => { if (type === 'hello') sendAll(); });
    }
  }

  // ---------- Hotkeys ----------

  let capture = null; // { id, done } while waiting for a new key

  function keyName(k) {
    if (!k) return 'Not set';
    if (k === ' ') return 'Space';
    if (k.startsWith('Numpad')) return 'Num ' + k.slice(6);
    if (k.length === 1) return k.toUpperCase();
    return k;
  }

  // Numpad keys are kept apart from the number row.
  function keyOf(e) {
    if (e.code && e.code.startsWith('Numpad')) return e.code;
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  const anyKeyFor = (tab) => R.HOTKEYS.some((h) => h.tabs.includes(tab) && R.settings.keys[h.id]);

  // Tabs with hotkey actions show a note until one of their keys is set.
  function renderKeyNotes() {
    for (const tab of ['randomizer', 'wheel', 'run']) {
      const panel = $('tab-' + tab);
      let note = panel.querySelector('.key-note');
      if (!note) {
        note = el('div', { class: 'key-note ctrl' }, [
          el('span', { text: 'Hotkeys are off. Pick keys you do not use in game, like F keys or the numpad.' }),
          el('button', { type: 'button', class: 'btn small', text: 'Set hotkeys', onclick: () => R.main.openSetting('hotkeys') }),
        ]);
        panel.appendChild(note);
      }
      note.hidden = anyKeyFor(tab);
    }
    const mute = $('muteBtn');
    if (mute) mute.title = 'Sound on or off' + (R.settings.keys.mute ? ` (${keyName(R.settings.keys.mute)})` : '');
  }

  function doAction(id) {
    const tab = R.settings.tab;
    switch (id) {
      case 'main':
        if (tab === 'wheel') R.wheel.spin();
        else if (tab === 'run') R.run.toggleTimer();
        else if (tab === 'randomizer') {
          if (R.rand.anyHidden()) R.rand.revealNext();
          else R.rand.rollAll();
        } else return false;
        return true;
      case 'roll': R.main.showTab('randomizer'); R.rand.rollAll(); return true;
      case 'revealNext': R.main.showTab('randomizer'); R.rand.revealNext(); return true;
      case 'revealAll': R.main.showTab('randomizer'); R.rand.revealAll(); return true;
      case 'spin': R.wheel.spinPreset(); return true;
      case 'timer': R.run.toggleTimer(); return true;
      case 'death': R.run.add('death'); return true;
      case 'whiteBag': R.run.add('white'); return true;
      case 'setBag': R.run.add('set'); return true;
      case 'mute': R.main.toggleMute(); return true;
      default:
        if (id.startsWith('reroll')) {
          R.main.showTab('randomizer');
          R.rand.rerollOne(R.SLOTS[Number(id.slice(6)) - 1]);
          return true;
        }
        return false;
    }
  }

  function onKey(e) {
    if (capture) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') capture.done(null, true);
      else if (e.key === 'Backspace' || e.key === 'Delete') capture.done('');
      else capture.done(keyOf(e));
      return;
    }
    if (R.follower || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
    const key = keyOf(e);
    // Space and Enter keep their normal job on buttons and links.
    if ((key === ' ' || key === 'Enter') && e.target.closest && e.target.closest('button, a, summary, [role="button"]')) return;
    const hit = key && R.HOTKEYS.find((h) => R.settings.keys[h.id] === key);
    if (!hit) return;
    if (R.modalOpen()) {
      // In a pop-up, the reveal and main keys press its main button.
      if (hit.id === 'revealNext' || hit.id === 'main') {
        const b = document.querySelector('.modal-back.show [data-focus]:not([hidden])');
        if (b && !b.closest('[hidden]')) { e.preventDefault(); b.click(); }
      }
      return;
    }
    if (doAction(hit.id)) e.preventDefault();
  }

  // Waits for the next key press and binds it.
  function rebind(id, btn, after) {
    btn.textContent = 'Press a key...';
    btn.classList.add('capturing');
    capture = {
      done(key, cancel) {
        capture = null;
        btn.classList.remove('capturing');
        if (!cancel) {
          if (key) for (const h of R.HOTKEYS) if (R.settings.keys[h.id] === key) R.settings.keys[h.id] = '';
          R.settings.keys[id] = key;
          R.saveSettings();
        }
        after();
      },
    };
  }

  function hotkeyEditor(box) {
    const draw = () => {
      box.innerHTML = '';
      box.appendChild(el('p', { class: 'hint', text: 'Hotkeys start off. Click a button, then press the key you want. Backspace clears it, Escape cancels.' }));
      box.appendChild(el('p', { class: 'hint', text: 'They only work while this page is the active window, and never while you type in a text box. Avoid keys you use in game, like WASD. F keys and the numpad are good picks.' }));
      const list = el('div', { class: 'key-list' });
      for (const h of R.HOTKEYS) {
        const btn = el('button', { type: 'button', class: 'key-btn', text: keyName(R.settings.keys[h.id]) });
        btn.addEventListener('click', () => rebind(h.id, btn, draw));
        list.appendChild(el('div', { class: 'key-row' }, [el('span', { text: h.name }), btn]));
      }
      box.appendChild(list);
      box.appendChild(el('button', {
        type: 'button', class: 'btn small', text: 'Clear all hotkeys',
        onclick: () => {
          R.settings.keys = Object.fromEntries(R.HOTKEYS.map((h) => [h.id, '']));
          R.saveSettings();
          draw();
          renderRef();
        },
      }));
      renderRef();
    };
    draw();
  }

  function renderRef() {
    const box = $('hotkeyRef');
    if (!box) return;
    box.innerHTML = '';
    const none = !R.HOTKEYS.some((h) => R.settings.keys[h.id]);
    box.appendChild(el('p', { class: 'hint', text: none
      ? 'Hotkeys start off so they never clash with game keys like WASD. Set the ones you want in Settings > Hotkeys.'
      : 'Change these in Settings > Hotkeys. Bind them to a Stream Deck as normal key presses.' }));
    box.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Set hotkeys', onclick: () => R.main.openSetting('hotkeys') }));
    const list = el('div', { class: 'key-list' });
    for (const h of R.HOTKEYS) {
      list.appendChild(el('div', { class: 'key-row' }, [el('span', { text: h.name }), el('kbd', { text: keyName(R.settings.keys[h.id]) })]));
    }
    box.appendChild(list);
    renderKeyNotes();
  }

  // ---------- Stream tab ----------

  function buildOverlayTools() {
    const s = R.settings.stream;
    const save = () => R.saveSettings();

    // Pop-out windows: one per tab, plus alerts.
    const pop = $('popoutTools');
    pop.innerHTML = '';
    pop.appendChild(el('p', { class: 'hint', text: 'Each window copies what you do on this page, live. Open as many as you like and capture each one in OBS with Window Capture. Keep this page open while you stream.' }));
    const grid = el('div', { class: 'tool-grid' });
    grid.append(
      R.select('Background', s.popBg, BGS.slice(1), (v) => { s.popBg = v; save(); }),
      R.range('Size', s.scale, 50, 200, 10, (v) => { s.scale = v; save(); }, { fmt: (v) => v + '%' }),
    );
    pop.appendChild(grid);
    pop.appendChild(el('p', { class: 'hint', text: 'Window Capture cannot see through a window. Pick Green screen or Magenta screen and add a Chroma Key filter in OBS to hide the background.' }));
    const list = el('div', { class: 'pop-list' });
    for (const [view, name, desc] of POPOUTS) {
      list.appendChild(el('div', { class: 'pop-row' }, [
        el('div', {}, [el('strong', { text: name }), el('small', { text: desc })]),
        el('button', { type: 'button', class: 'btn small', text: 'Pop out', onclick: () => popOut(view) }),
      ]));
    }
    pop.appendChild(list);
    pop.appendChild(el('h4', { class: 'sub-head', text: 'Spins and reveals' }));
    pop.append(
      R.checkbox('Jump to the wheel for spins', s.jump, (on) => { s.jump = on; save(); },
        { small: 'A tab pop-out, like Run, shows the wheel while it spins, then goes back on its own.' }),
      R.range('Show results for', s.hold, 2, 20, 1, (v) => { s.hold = v; save(); }, { fmt: (v) => v + 's' }),
    );

    // Show on stream editor.
    R.layout.editor($('stageTools'));

    // OBS browser source.
    const box = $('overlayTools');
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'OBS runs its own browser, so a Browser Source cannot copy what you do on this page. This link is a separate copy that you control with Twitch commands, or by right clicking the source in OBS and picking Interact. It keeps your current settings, so copy it again after you change them. To show exactly what you do here, use the pop-out windows above.' }));
    box.appendChild(el('p', { class: 'hint', text: 'The link never includes passwords or tokens.' }));
    const grid2 = el('div', { class: 'tool-grid' });
    grid2.append(
      R.select('Show', s.view, VIEWS, (v) => { s.view = v; save(); }),
      R.select('Background', s.bg, BGS, (v) => { s.bg = v; save(); }),
    );
    box.appendChild(grid2);
    box.appendChild(el('button', {
      type: 'button', class: 'btn', text: 'Copy OBS link',
      onclick: () => R.copy(overlayUrl({ sound: '1', cfg: R.packSettings() }), 'OBS link copied'),
    }));
  }

  R.stream = {
    init() {
      applyOverlay();
      document.addEventListener('keydown', onKey);
      startSync();
      if (!R.overlay) {
        buildOverlayTools();
        R.twitch.buildTools($('twitchTools'));
      }
      renderRef();
    },
    overlayTab,
    popOut,
    hotkeyEditor,
    keyName,
    doAction,
  };
})();
