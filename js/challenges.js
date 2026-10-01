/*
 * Challenges tab: challenge modes as tiles, house rules and the list of
 * active rules.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  // Bullet list of a mode's rules, plus its note.
  function details(m) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('ul', { class: 'mode-detail' }, m.details.map((d) => el('li', { text: d }))));
    if (m.note) frag.appendChild(el('p', { class: 'mode-note', text: m.note }));
    return frag;
  }

  function setMode(id, on) {
    const m = R.MODES.find((x) => x.id === id);
    if (!m || R.follower) return;
    R.settings.modes[id] = on;
    if (on && m.excludes) {
      const off = m.excludes.filter((x) => R.settings.modes[x]);
      for (const x of m.excludes) R.settings.modes[x] = false;
      if (off.length) R.toast(`${m.name} turned off ${off.map((x) => R.MODES.find((y) => y.id === x).name).join(', ')}.`);
    }
    R.sound.play('toggle');
    R.saveSettings();
    render();
    if (R.rand) R.rand.changed();
    if (R.settingsUI) R.settingsUI.build();
  }

  function tile(m) {
    const on = !!R.settings.modes[m.id];
    const sw = el('button', {
      type: 'button', class: 'switch ctrl', role: 'switch', 'aria-checked': String(on),
      'aria-label': `${m.name} ${on ? 'on' : 'off'}`,
      onclick: () => setMode(m.id, !on),
    }, [el('span', { class: 'knob' })]);
    const head = el('div', { class: 'mode-head' }, [
      sw,
      el('div', { class: 'mode-title' }, [
        el('strong', { text: m.name }),
        m.kinds ? el('span', { class: 'mode-tag', text: 'pool', title: 'Changes which items can roll' }) : null,
        el('small', { text: m.long }),
      ]),
    ]);
    // Full rules open in a pop-up so every tile keeps the same size.
    const foot = el('div', { class: 'mode-foot' }, [
      el('span', { class: 'mode-state', text: on ? 'On' : 'Off' }),
      el('button', { type: 'button', class: 'btn small', text: 'Rules', onclick: () => showRules(m) }),
    ]);
    return el('div', { class: 'mode-tile' + (on ? ' on' : '') }, [head, el('p', { class: 'mode-sum', text: m.summary }), foot]);
  }

  function showRules(m) {
    const on = !!R.settings.modes[m.id];
    let close = null;
    const toggle = el('button', {
      type: 'button', class: 'btn ' + (on ? '' : 'btn-gold'), text: on ? 'Turn off' : 'Turn on', 'data-focus': '',
      onclick: () => { close(); setMode(m.id, !on); },
    });
    const box = el('div', { class: 'rules-pop' }, [
      el('span', { class: 'label', text: m.kinds ? 'Pool mode' : 'Play rule' }),
      el('h2', { class: 'reveal-name', text: m.name }),
      el('p', { class: 'sub', text: m.long }),
      details(m),
      el('div', { class: 'row-btns' }, [toggle, el('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => close() })]),
    ]);
    close = R.modal(box);
  }

  function renderActive() {
    const box = $('activeStrip');
    box.innerHTML = '';
    const active = R.MODES.filter((m) => R.settings.modes[m.id]);
    const house = (R.settings.houseRules || []).filter(Boolean);
    if (!active.length && !house.length) {
      box.appendChild(el('p', { class: 'hint', text: 'No challenge is on. Turn one on below or spin one.' }));
      return;
    }
    box.appendChild(el('span', { class: 'label', text: 'Active rules' }));
    const list = el('div', { class: 'active-list' });
    for (const m of active) {
      list.appendChild(el('div', { class: 'active-chip' }, [el('strong', { text: m.name }), el('span', { text: m.summary })]));
    }
    for (const h of house) list.appendChild(el('div', { class: 'active-chip house' }, [el('strong', { text: 'House' }), el('span', { text: h })]));
    box.appendChild(list);
  }

  function render() {
    const pool = $('poolModes');
    const play = $('playModes');
    pool.innerHTML = '';
    play.innerHTML = '';
    for (const m of R.MODES) (m.kinds ? pool : play).appendChild(tile(m));
    renderActive();
    const ta = $('houseRules');
    if (document.activeElement !== ta) ta.value = (R.settings.houseRules || []).join('\n');
  }

  let houseTimer = null;
  function bind() {
    $('houseRules').addEventListener('input', (e) => {
      clearTimeout(houseTimer);
      houseTimer = setTimeout(() => {
        R.settings.houseRules = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean);
        R.saveSettings();
        renderActive();
        if (R.rand) R.rand.changed();
      }, 400);
    });
    $('spinModeBtn').addEventListener('click', () => R.wheel.spinPreset('modes'));
    $('modesOffBtn').addEventListener('click', () => {
      R.settings.modes = {};
      R.saveSettings();
      R.sound.play('toggle');
      render();
      if (R.rand) R.rand.changed();
      if (R.settingsUI) R.settingsUI.build();
    });
  }

  R.challenges = { init: bind, render, details, setMode };
})();
