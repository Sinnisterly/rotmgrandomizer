/*
 * Start up: tabs, theme, mute button and the order modules load in.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  // 8 by 8 pixel icons. # is a filled pixel.
  const ICON_MAPS = {
    randomizer: ['########', '#......#', '#.#..#.#', '#......#', '#......#', '#.#..#.#', '#......#', '########'],
    wheel: ['..####..', '.#.##.#.', '#..##..#', '########', '########', '#..##..#', '.#.##.#.', '..####..'],
    challenges: ['.######.', '########', '##.##.##', '##.##.##', '########', '.######.', '.#.##.#.', '.######.'],
    run: ['########', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '.#.##.#.', '########'],
    bingo: ['###.###.', '#.#.#.#.', '###.###.', '........', '###.###.', '#.#.###.', '###.###.', '........'],
    stream: ['........', '.######.', '.#....##', '.#....##', '.#....##', '.######.', '........', '........'],
  };

  const TABS = [
    { id: 'randomizer', name: 'Randomizer' },
    { id: 'wheel', name: 'Wheel' },
    { id: 'challenges', name: 'Challenges' },
    { id: 'run', name: 'Run' },
    { id: 'bingo', name: 'Bingo' },
    { id: 'stream', name: 'Stream' },
  ];

  function pixelIcon(map) {
    let rects = '';
    map.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }));
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
  }

  function buildTabs() {
    const bar = $('tabbar');
    for (const t of TABS) {
      const b = el('button', {
        type: 'button', class: 'tab', role: 'tab', id: 'tabbtn-' + t.id,
        'aria-controls': 'tab-' + t.id, 'data-tab': t.id,
        html: pixelIcon(ICON_MAPS[t.id]) + `<span>${t.name}</span>`,
        onclick: () => { R.sound.play('click'); showTab(t.id); },
      });
      bar.appendChild(b);
    }
    // Arrow keys move between tabs.
    bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = TABS.findIndex((t) => t.id === R.settings.tab);
      const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
      showTab(next.id);
      $('tabbtn-' + next.id).focus();
    });
  }

  function showTab(id) {
    if (!TABS.some((t) => t.id === id)) id = 'randomizer';
    // The Stream tab is all controls, so an overlay would be blank on it.
    if (R.overlay && id === 'stream') {
      if (built) return;
      id = 'randomizer';
    }
    // An overlay locked to one view never changes tab.
    if (R.overlay && R.overlay.view !== 'follow' && R.stream.overlayTab(R.overlay.view) !== id) return;
    const changed = R.settings.tab !== id;
    R.settings.tab = id;
    for (const t of TABS) {
      const on = t.id === id;
      $('tab-' + t.id).hidden = !on;
      const b = $('tabbtn-' + t.id);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    if (changed || !built) {
      built = true;
      R.saveSettings();
      R.settingsUI.build();
    }
    if (id === 'wheel') R.wheel.render();
    if (id === 'randomizer') R.rand.render();
    R.sync.send('tab', id);
  }
  let built = false;

  // ---------- Look ----------

  function applyLook() {
    const lk = R.settings.look;
    const root = document.documentElement;
    root.dataset.theme = lk.theme;
    root.dataset.font = lk.font;
    root.style.setProperty('--gold', lk.accent);
    root.style.setProperty('--scale', String(lk.scale / 100));
    document.body.classList.toggle('no-glow', !R.settings.fx.glow);
    renderMute();
  }

  const SPEAKER = '<svg viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="0" y="3" width="2" height="2"/><rect x="2" y="2" width="1" height="4"/><rect x="3" y="1" width="1" height="6"/>';

  function renderMute() {
    const b = $('muteBtn');
    if (!b) return;
    const on = R.settings.sound.on;
    b.innerHTML = SPEAKER + (on
      ? '<rect x="5" y="2" width="1" height="1"/><rect x="6" y="3" width="1" height="2"/><rect x="5" y="5" width="1" height="1"/></svg><span>Sound</span>'
      : '<rect x="5" y="2" width="1" height="1"/><rect x="7" y="2" width="1" height="1"/><rect x="6" y="3" width="1" height="2"/><rect x="5" y="5" width="1" height="1"/><rect x="7" y="5" width="1" height="1"/></svg><span>Muted</span>');
    b.setAttribute('aria-pressed', String(!on));
    b.classList.toggle('muted', !on);
  }

  function toggleMute() {
    R.settings.sound.on = !R.settings.sound.on;
    R.saveSettings();
    renderMute();
    R.sound.play('toggle');
    if (R.settings.tab) R.settingsUI.build();
  }

  // ---------- Layout ----------

  function applySidebar() {
    const hidden = !!R.settings.sidebarHidden;
    $('layout').classList.toggle('wide', hidden);
    $('settingsToggle').setAttribute('aria-expanded', String(!hidden));
    $('settingsToggle').title = hidden ? 'Show settings' : 'Hide settings';
  }

  // Collapsible panels in the tabs remember if they were open.
  function bindFolds() {
    for (const d of document.querySelectorAll('details[data-fold]')) {
      const key = 'fold-' + d.dataset.fold;
      if (R.settings.open[key] !== undefined) d.open = R.settings.open[key];
      d.addEventListener('toggle', () => {
        R.settings.open[key] = d.open;
        R.saveSettings();
      });
    }
  }

  function renderDataInfo() {
    const m = R.DATA.meta;
    const date = new Date(m.generated).toISOString().slice(0, 10);
    $('dataInfo').textContent = `${R.CLASSES.length} classes, ${R.ITEMS.length} items, ${R.SETS.length} ST sets, ${R.DUNGEONS.dungeons.length} dungeons. Data from ${m.source}, ${date}`;
  }

  // Opens a settings section and scrolls to it.
  function openSetting(id) {
    if (R.settings.sidebarHidden) {
      R.settings.sidebarHidden = false;
      applySidebar();
      R.saveSettings();
    }
    const d = $('sec-' + id);
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ behavior: R.fx.motion() ? 'smooth' : 'auto', block: 'start' });
    const first = d.querySelector('button, input, select');
    if (first) first.focus({ preventScroll: true });
  }

  R.main = { showTab, applyLook, renderMute, toggleMute, openSetting };

  // ---------- Start ----------

  applyLook();
  buildTabs();
  const hadHash = R.rand.init();
  R.wheel.init();
  R.challenges.init();
  R.run.init();
  R.bingo.init();
  R.stream.init();
  R.twitch.init();
  bindFolds();
  renderDataInfo();
  applySidebar();
  $('settingsToggle').addEventListener('click', () => {
    R.settings.sidebarHidden = !R.settings.sidebarHidden;
    applySidebar();
    R.saveSettings();
    R.rand.render();
    if (R.settings.tab === 'wheel') R.wheel.render();
  });
  $('muteBtn').addEventListener('click', toggleMute);

  let tab = R.params.get('tab') || R.settings.tab;
  if (R.overlay && R.overlay.view !== 'follow') tab = R.stream.overlayTab(R.overlay.view) || tab;
  showTab(tab);
  R.challenges.render();
  R.run.render();

  if (R.follower) R.rand.render();
  else if (hadHash) R.rand.render();
  else R.rand.rollAll();
})();
