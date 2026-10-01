/*
 * Stream tools: overlay mode for OBS, a pop-out window that copies the main
 * window, and hotkeys.
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

  function popOut() {
    const w = window.open(overlayUrl({ sync: '1' }), 'rotmgr-overlay', 'width=960,height=820');
    if (!w) R.toast('Your browser blocked the pop-up. Allow pop-ups for this site.');
  }

  // ---------- Sync: the main window answers, the overlay follows ----------

  function sendAll() {
    R.sync.send('tab', R.settings.tab);
    R.sync.send('rand', { snap: R.rand.snapshot(), spun: [] });
    R.wheel.render();
    R.sync.send('run', R.run.data);
    R.bingo.render();
    R.sync.send('bingo', R.bingo.card ? R.bingo.card() : null);
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
      });
    } else {
      R.sync.listen((type) => { if (type === 'hello') sendAll(); });
    }
  }

  // ---------- Hotkeys ----------

  let capture = null; // { id, done } while waiting for a new key

  function keyName(k) {
    if (!k) return 'None';
    if (k === ' ') return 'Space';
    if (k.length === 1) return k.toUpperCase();
    return k;
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
      else capture.done(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      return;
    }
    if (R.follower || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea, [contenteditable]')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Space and Enter keep their normal job on buttons and links.
    if ((key === ' ' || key === 'Enter') && e.target.closest && e.target.closest('button, a, summary, [role="button"]')) return;
    const hit = R.HOTKEYS.find((h) => R.settings.keys[h.id] === key);
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
      box.appendChild(el('p', { class: 'hint', text: 'Click a key to change it. Backspace clears it. Hotkeys do nothing while you type in a text box.' }));
      const list = el('div', { class: 'key-list' });
      for (const h of R.HOTKEYS) {
        const btn = el('button', { type: 'button', class: 'key-btn', text: keyName(R.settings.keys[h.id]) });
        btn.addEventListener('click', () => rebind(h.id, btn, draw));
        list.appendChild(el('div', { class: 'key-row' }, [el('span', { text: h.name }), btn]));
      }
      box.appendChild(list);
      box.appendChild(el('button', {
        type: 'button', class: 'btn small', text: 'Reset hotkeys',
        onclick: () => {
          R.settings.keys = Object.fromEntries(R.HOTKEYS.map((h) => [h.id, h.key]));
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
    box.appendChild(el('p', { class: 'hint', text: 'Change these in Settings > Hotkeys. Bind them to a Stream Deck as normal key presses.' }));
    const list = el('div', { class: 'key-list' });
    for (const h of R.HOTKEYS) {
      list.appendChild(el('div', { class: 'key-row' }, [el('span', { text: h.name }), el('kbd', { text: keyName(R.settings.keys[h.id]) })]));
    }
    box.appendChild(list);
  }

  // ---------- Stream tab ----------

  function buildOverlayTools() {
    const box = $('overlayTools');
    const s = R.settings.stream;
    const save = () => R.saveSettings();
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'A clean view with only the results, for OBS. Settings, buttons and the page frame are hidden.' }));
    const grid = el('div', { class: 'tool-grid' });
    grid.append(
      R.select('Show', s.view, VIEWS, (v) => { s.view = v; save(); }),
      R.select('Background', s.bg, BGS, (v) => { s.bg = v; save(); }),
    );
    box.appendChild(grid);
    box.appendChild(R.range('Size', s.scale, 50, 200, 10, (v) => { s.scale = v; save(); }, { fmt: (v) => v + '%' }));

    box.append(
      el('div', { class: 'tool-card' }, [
        el('h4', { class: 'sub-head', text: 'Pop-out window' }),
        el('p', { class: 'hint', text: 'Opens a window that copies everything you do on this page. Capture it in OBS with Window Capture. Pick Green screen and add a Chroma Key filter to hide the background.' }),
        el('button', { type: 'button', class: 'btn btn-gold', text: 'Open pop-out', onclick: popOut }),
      ]),
      el('div', { class: 'tool-card' }, [
        el('h4', { class: 'sub-head', text: 'OBS browser source' }),
        el('p', { class: 'hint', text: 'Add this link as a Browser Source. It keeps a copy of your current settings, so copy it again after you change them. Control it with Twitch commands, or right click the source in OBS and pick Interact.' }),
        el('button', {
          type: 'button', class: 'btn', text: 'Copy OBS link',
          onclick: () => R.copy(overlayUrl({ sound: '1', cfg: R.packSettings() }), 'OBS link copied'),
        }),
      ]),
    );
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
    hotkeyEditor,
    keyName,
    doAction,
  };
})();
