/*
 * Viewer events: bits, subs, gift subs, raids and chat commands from Twitch
 * chat, and tips from StreamElements or Streamlabs. Rules set by the
 * streamer decide what each event does. Events wait in a queue so only one
 * plays at a time.
 *
 * Tokens for StreamElements and Streamlabs live in R.secrets. They are only
 * read here, in the main window, and only sent to the service they belong to.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const EVENTS = [
    ['bits', 'Bits', 'bits'],
    ['sub', 'Sub or resub', 'months'],
    ['gift', 'Gift subs', 'gifts'],
    ['raid', 'Raid', 'viewers'],
    ['tip', 'Tip', 'amount'],
    ['command', 'Chat command', ''],
  ];
  const ACTIONS = [
    ['spin', 'Spin a wheel'],
    ['randomize', 'Randomize'],
    ['reroll', 'Reroll a slot'],
    ['reveal', 'Reveal next'],
    ['counter', 'Add 1 to a counter'],
    ['curse', 'Add a curse'],
    ['vote', 'Start a keep or reroll vote'],
    ['message', 'Show a message'],
  ];
  const SLOTS = [['class', 'Class'], ['weapon', 'Weapon'], ['ability', 'Ability'], ['armor', 'Armor'], ['ring', 'Ring']];
  const WHO = [['everyone', 'Everyone'], ['subs', 'Subs, mods and me'], ['mods', 'Mods and me'], ['broadcaster', 'Only me']];

  const cfg = () => R.settings.events;
  const save = () => R.saveSettings();
  const hold = () => (Number(R.settings.stream.hold) || 6) * 1000;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  // ---------- Event text ----------

  function title(e) {
    const who = e.user || 'Someone';
    switch (e.type) {
      case 'bits': return `${who} cheered ${e.amount} bits`;
      case 'sub': return e.amount > 1 ? `${who} subscribed for ${e.amount} months` : `${who} subscribed`;
      case 'gift': return `${who} gifted ${e.amount} sub${e.amount === 1 ? '' : 's'}`;
      case 'raid': return `${who} raided with ${e.amount} viewer${e.amount === 1 ? '' : 's'}`;
      case 'tip': return `${who} tipped ${e.text || e.amount}`;
      case 'command': return `${who} used ${R.settings.twitch.prefix || '!'}${e.name}`;
      default: return who;
    }
  }

  function presetName(id) {
    const p = R.wheel.presetList().find(([v]) => v === id);
    return p ? p[1] : id;
  }

  function actionLabel(r) {
    switch (r.action) {
      case 'spin': return 'Spin ' + presetName(r.target);
      case 'randomize': return 'Randomize';
      case 'reroll': return 'Reroll the ' + (r.target || 'weapon');
      case 'reveal': return 'Reveal next';
      case 'counter': {
        const c = R.run.data.counters.find((x) => x.id === r.target);
        return '+1 ' + (c ? c.name : 'counter');
      }
      case 'curse': return 'Curse: ' + (r.target || '');
      case 'vote': return 'Keep or reroll vote';
      case 'message': return r.target || '';
      default: return '';
    }
  }

  // ---------- Rules ----------

  const ROLE_RANK = { viewer: 0, sub: 1, vip: 1, mod: 2, broadcaster: 3 };
  const WHO_RANK = { everyone: 0, subs: 1, mods: 2, broadcaster: 3 };
  const lastRun = {};

  // Rules that match an event. When several amount rules match, only the ones
  // with the highest amount run, so tiers work (100+ and 500+ bits).
  function matches(e) {
    const now = Date.now();
    const list = cfg().rules.filter((r) => {
      if (!r.on || r.event !== e.type) return false;
      if (r.cooldown && lastRun[r.id] && now - lastRun[r.id] < r.cooldown * 1000) return false;
      if (e.type === 'command') {
        return (r.command || '').toLowerCase() === e.name && (ROLE_RANK[e.role] || 0) >= (WHO_RANK[r.who] || 0);
      }
      return (Number(e.amount) || 0) >= (Number(r.min) || 0);
    });
    if (e.type === 'command' || !list.length) return list;
    const top = Math.max(...list.map((r) => Number(r.min) || 0));
    return list.filter((r) => (Number(r.min) || 0) === top);
  }

  // ---------- Queue ----------

  const queue = []; // { id, event, rule, count, users, at, approved, state }
  let running = false;
  let paused = false;
  let nextId = 1;

  function handle(e) {
    if (R.follower) return false;
    const rules = matches(e);
    // Chat commands nobody set a rule for are just chat.
    if (e.type === 'command' && !rules.length) return false;
    R.run.log(title(e) + (rules.length ? ': ' + rules.map(actionLabel).join(', ') : ''));
    recent.unshift({ text: title(e), at: Date.now(), test: !!e.test });
    recent.splice(8);
    if (!rules.length) {
      renderQueue();
      return false;
    }
    for (const r of rules) {
      lastRun[r.id] = Date.now();
      const per = Number(r.min) || 1;
      const count = r.each && e.type !== 'command' ? Math.max(1, Math.min(10, Math.floor((Number(e.amount) || 0) / per))) : 1;
      if (cfg().mode === 'combine') {
        const same = queue.find((q) => q.state === 'waiting' && q.rule.id === r.id && Date.now() - q.at < cfg().combineSecs * 1000);
        if (same) {
          same.users.push(e.user || 'Someone');
          renderQueue();
          continue;
        }
      }
      if (queue.length >= cfg().maxQueue) {
        R.run.log('Event queue is full. Skipped: ' + title(e));
        continue;
      }
      queue.push({ id: nextId++, event: e, rule: { ...r }, count, users: [e.user || 'Someone'], at: Date.now(), approved: cfg().mode !== 'approve', state: 'waiting' });
    }
    renderQueue();
    pump();
    return true;
  }

  async function pump() {
    if (running || paused) return;
    const item = queue.find((q) => q.state === 'waiting' && q.approved);
    if (!item) return;
    running = true;
    item.state = 'running';
    renderQueue();
    try {
      for (let i = 0; i < item.count; i++) {
        const head = item.users.length > 1 ? `${item.users.length} events: ${title(item.event)} and more` : title(item.event);
        const tail = actionLabel(item.rule) + (item.count > 1 ? ` (${i + 1} of ${item.count})` : '');
        R.layout.banner(head, tail);
        await run(item.rule);
      }
    } catch (err) {
      R.run.log('An event could not play: ' + (err && err.message ? err.message : 'unknown error'));
    }
    queue.splice(queue.indexOf(item), 1);
    running = false;
    renderQueue();
    pump();
  }

  // Waits until the wheel is free, spins, and resolves after the result.
  function spinAndWait(preset) {
    return new Promise((resolve) => {
      const start = () => {
        if (R.wheel.isSpinning()) { setTimeout(start, 300); return; }
        R.once('spinDone', () => setTimeout(resolve, hold() + 600));
        R.wheel.spinPreset(preset, { auto: true, stay: !cfg().switchTab });
      };
      start();
    });
  }

  async function run(r) {
    const tab = (id) => { if (cfg().switchTab) R.main.showTab(id); };
    switch (r.action) {
      case 'spin': return spinAndWait(r.target || 'curses');
      case 'randomize': tab('randomizer'); R.rand.rollAll(); return wait(2600 * R.fx.speed());
      case 'reroll': tab('randomizer'); R.rand.rerollOne(r.target || 'weapon', { free: true }); return wait(2000 * R.fx.speed());
      case 'reveal': tab('randomizer'); R.rand.revealNext(); return wait(hold());
      case 'counter': R.run.add(r.target || 'deaths', 1); return wait(1500);
      case 'curse': R.run.addCurse(r.target || 'Curse'); R.sound.play('curse'); return wait(hold());
      case 'vote': R.twitch.startVote(r.target || 'all'); return wait(1000);
      case 'message': R.sound.play('win'); return wait(hold());
      default: return wait(0);
    }
  }

  // ---------- Tip services ----------
  // Both use socket.io over a WebSocket. This is the small part of that
  // protocol needed to listen for events, so no library is loaded.

  const sources = {
    se: { name: 'StreamElements', status: 'off', ws: null, want: false, timer: null },
    sl: { name: 'Streamlabs', status: 'off', ws: null, want: false, timer: null },
  };
  const URLS = {
    se: () => 'wss://realtime.streamelements.com/socket.io/?EIO=3&transport=websocket',
    sl: (token) => 'wss://sockets.streamlabs.com/socket.io/?EIO=3&transport=websocket&token=' + encodeURIComponent(token),
  };

  function setStatus(id, s) {
    sources[id].status = s;
    renderSources();
  }

  function connectSource(id) {
    const src = sources[id];
    const token = R.secrets.get(id);
    if (!token || R.follower || R.overlay) return;
    disconnectSource(id, true);
    src.want = true;
    setStatus(id, 'connecting');
    let ws;
    try { ws = new WebSocket(URLS[id](token)); } catch (e) { setStatus(id, 'error'); return; }
    src.ws = ws;
    let ping = null;
    const emit = (name, data) => ws.send('42' + JSON.stringify([name, data]));
    ws.onmessage = (m) => {
      const d = String(m.data);
      if (d[0] === '0') {
        let info = {};
        try { info = JSON.parse(d.slice(1)); } catch (e) { /* keep defaults */ }
        ping = setInterval(() => { if (ws.readyState === 1) ws.send('2'); }, info.pingInterval || 25000);
      } else if (d.startsWith('40')) {
        if (id === 'se') emit('authenticate', { method: 'jwt', token });
        else setStatus(id, 'on');
      } else if (d.startsWith('42')) {
        let name;
        let payload;
        try { [name, payload] = JSON.parse(d.slice(2)); } catch (e) { return; }
        onSourceEvent(id, name, payload);
      } else if (d.startsWith('44')) {
        setStatus(id, 'error');
      }
    };
    ws.onerror = () => setStatus(id, 'error');
    ws.onclose = () => {
      clearInterval(ping);
      src.ws = null;
      if (src.want && src.status !== 'denied') {
        setStatus(id, 'connecting');
        clearTimeout(src.timer);
        src.timer = setTimeout(() => connectSource(id), 8000);
      } else if (src.status !== 'denied') setStatus(id, 'off');
    };
  }

  function disconnectSource(id, quiet) {
    const src = sources[id];
    src.want = false;
    clearTimeout(src.timer);
    if (src.ws) {
      src.ws.onclose = null;
      src.ws.close();
      src.ws = null;
    }
    if (!quiet) setStatus(id, 'off');
  }

  const money = (amount, currency) => {
    const n = Number(amount) || 0;
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n); } catch (e) { return String(n); }
  };

  function onSourceEvent(id, name, p) {
    if (id === 'se') {
      if (name === 'authenticated') setStatus('se', 'on');
      else if (name === 'unauthorized') { setStatus('se', 'denied'); disconnectSource('se', true); }
      else if (name === 'event' && p && p.type === 'tip' && p.data) {
        handle({ type: 'tip', user: p.data.username || p.data.displayName, amount: Number(p.data.amount) || 0, text: money(p.data.amount, p.data.currency), source: 'StreamElements' });
      } else if (name === 'event:test' && p && p.listener === 'tip-latest' && p.event) {
        // Test tips sent from the StreamElements dashboard.
        handle({ type: 'tip', user: p.event.name, amount: Number(p.event.amount) || 0, text: money(p.event.amount), source: 'StreamElements', test: true });
      }
    } else if (id === 'sl' && name === 'event' && p && p.type === 'donation') {
      for (const d of [].concat(p.message || [])) {
        handle({ type: 'tip', user: d.name || d.from, amount: Number(d.amount) || 0, text: d.formatted_amount || money(d.amount, d.currency), source: 'Streamlabs' });
      }
    }
  }

  // ---------- Stream tab UI ----------

  const recent = [];

  // Password style field. Hover or press the eye to see it.
  function secretField(label, name) {
    const input = el('input', { type: 'password', class: 'text-in', autocomplete: 'off', spellcheck: 'false', 'aria-label': label });
    input.value = R.secrets.get(name);
    input.addEventListener('change', () => {
      R.secrets.set(name, input.value.trim());
      renderSources();
    });
    const eye = el('button', {
      type: 'button', class: 'btn small eye', title: 'Hover or hold to show', 'aria-label': 'Show ' + label,
      html: '<svg viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="4" height="1"/><rect x="1" y="3" width="1" height="2"/><rect x="6" y="3" width="1" height="2"/><rect x="2" y="5" width="4" height="1"/><rect x="3" y="3" width="2" height="2"/></svg>',
    });
    const show = (on) => { input.type = on ? 'text' : 'password'; };
    // Only a real mouse move over the eye shows it. A page that shifts under a
    // still mouse must not show a token on stream.
    eye.addEventListener('pointermove', () => show(true));
    eye.addEventListener('pointerleave', () => show(false));
    eye.addEventListener('pointerdown', () => show(true));
    eye.addEventListener('pointerup', () => show(false));
    eye.addEventListener('blur', () => show(false));
    eye.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(input.type === 'password'); } });
    window.addEventListener('blur', () => show(false));
    return el('div', { class: 'secret-row' }, [input, eye]);
  }

  const SOURCE_TEXT = {
    se: {
      warn: [
        'Your StreamElements JWT token works like a password. Anyone who has it can control your StreamElements account.',
        'It is saved only in this browser. It is never put in pop-out windows, OBS links, shared settings or backups, and it is never sent to us. This site has no server.',
        'It is only sent to StreamElements, to listen for tips.',
        'Keep this page off stream while you paste it, and do not paste it anywhere else.',
        'If you think someone saw it, get a new token from StreamElements right away.',
      ],
      where: 'Find it in your StreamElements dashboard: your account settings, then Channels, then Show secrets.',
    },
    sl: {
      warn: [
        'Your Streamlabs Socket API token lets anyone who has it read your Streamlabs alerts. Treat it like a password.',
        'It is saved only in this browser. It is never put in pop-out windows, OBS links, shared settings or backups, and it is never sent to us. This site has no server.',
        'It is only sent to Streamlabs, to listen for tips.',
        'Keep this page off stream while you paste it, and do not paste it anywhere else.',
      ],
      where: 'Find it in your Streamlabs dashboard: Settings, then API Settings, then API Tokens, then Your Socket API Token.',
    },
  };

  function buildSources(box) {
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Optional. Listen for tips from StreamElements or Streamlabs. Bits, subs, gift subs and raids come from Twitch chat and need no token.' }));
    for (const id of ['se', 'sl']) {
      const t = SOURCE_TEXT[id];
      const ackKey = id + 'Ack';
      const card = el('div', { class: 'tool-card source-card' });
      card.appendChild(el('h4', { class: 'sub-head', text: sources[id].name }));
      card.appendChild(el('div', { class: 'warn-box' }, [
        el('strong', { text: 'Read this first' }),
        el('ul', {}, t.warn.map((w) => el('li', { text: w }))),
      ]));
      card.appendChild(R.checkbox('I read this and understand', cfg()[ackKey], (on) => { cfg()[ackKey] = on; save(); buildSources(box); }));
      if (cfg()[ackKey]) {
        card.appendChild(el('p', { class: 'hint', text: t.where }));
        card.appendChild(secretField(sources[id].name + ' token', id));
        card.appendChild(el('div', { class: 'row-btns' }, [
          el('button', {
            type: 'button', class: 'btn btn-gold', 'data-src': id,
            onclick: () => {
              const on = sources[id].status === 'off' || sources[id].status === 'error' || sources[id].status === 'denied';
              cfg()[id] = on;
              save();
              if (on) connectSource(id);
              else disconnectSource(id);
            },
          }),
          el('button', {
            type: 'button', class: 'btn small danger', text: 'Delete token',
            onclick: () => {
              disconnectSource(id);
              R.secrets.set(id, '');
              cfg()[id] = false;
              save();
              buildSources(box);
            },
          }),
          el('span', { class: 'status-dot off', 'data-status': id }),
        ]));
      }
      box.appendChild(card);
    }
    renderSources();
  }

  function renderSources() {
    for (const id of ['se', 'sl']) {
      const s = sources[id].status;
      const has = !!R.secrets.get(id);
      const dot = document.querySelector(`[data-status="${id}"]`);
      if (dot) {
        dot.className = 'status-dot ' + (s === 'denied' ? 'error' : s);
        dot.textContent = { off: has ? 'Not connected' : 'No token saved', connecting: 'Connecting...', on: 'Connected. Listening for tips.', error: 'Could not connect', denied: 'The token was not accepted' }[s];
      }
      const btn = document.querySelector(`[data-src="${id}"]`);
      if (btn) {
        btn.textContent = s === 'on' || s === 'connecting' ? 'Disconnect' : 'Connect';
        btn.disabled = !has && !(s === 'on' || s === 'connecting');
      }
    }
  }

  // Rule list
  function buildRules(box) {
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Each rule says what happens when an event comes in. If several rules match the same event, only the ones with the highest amount run, so 100 and 500 bit tiers work. Tip amounts are compared as plain numbers, whatever the currency.' }));
    const presets = R.wheel.presetList();
    const counters = R.run.data.counters.map((c) => [c.id, c.name]);
    const list = el('div', { class: 'rule-list' });
    cfg().rules.forEach((r, i) => {
      const changed = () => { save(); };
      const evSel = el('select', { 'aria-label': 'Event' }, EVENTS.map(([v, l]) => el('option', { value: v, text: l })));
      evSel.value = r.event;
      evSel.addEventListener('change', () => { r.event = evSel.value; changed(); buildRules(box); });
      const parts = [
        R.checkbox('', r.on, (on) => { r.on = on; changed(); }),
        el('span', { class: 'rule-word', text: 'When' }),
        evSel,
      ];
      if (r.event === 'command') {
        const cmd = el('input', { type: 'text', class: 'rule-num', value: r.command || '', placeholder: 'curse', 'aria-label': 'Command name' });
        cmd.addEventListener('change', () => { r.command = cmd.value.trim().replace(/^[!?~$]/, '').toLowerCase(); changed(); });
        const who = el('select', { 'aria-label': 'Who can use it' }, WHO.map(([v, l]) => el('option', { value: v, text: l })));
        who.value = r.who || 'mods';
        who.addEventListener('change', () => { r.who = who.value; changed(); });
        parts.push(el('span', { class: 'rule-word', text: R.settings.twitch.prefix || '!' }), cmd, el('span', { class: 'rule-word', text: 'by' }), who);
      } else {
        const unit = EVENTS.find(([v]) => v === r.event)[2];
        const min = el('input', { type: 'number', class: 'rule-num', min: 0, value: r.min, 'aria-label': 'At least' });
        min.addEventListener('change', () => { r.min = Math.max(0, Number(min.value) || 0); changed(); });
        parts.push(el('span', { class: 'rule-word', text: 'is at least' }), min, el('span', { class: 'rule-word', text: unit }));
      }
      const acSel = el('select', { 'aria-label': 'Action' }, ACTIONS.map(([v, l]) => el('option', { value: v, text: l })));
      acSel.value = r.action;
      acSel.addEventListener('change', () => { r.action = acSel.value; r.target = ''; changed(); buildRules(box); });
      parts.push(el('span', { class: 'rule-word', text: 'do' }), acSel);
      const opts = { spin: presets, reroll: SLOTS, counter: counters, vote: [['all', 'Whole build']].concat(SLOTS) }[r.action];
      if (opts) {
        const tSel = el('select', { 'aria-label': 'Target' }, opts.map(([v, l]) => el('option', { value: v, text: l })));
        if (!opts.some(([v]) => v === r.target)) r.target = opts[0] ? opts[0][0] : '';
        tSel.value = r.target;
        tSel.addEventListener('change', () => { r.target = tSel.value; changed(); });
        parts.push(tSel);
      } else if (r.action === 'curse' || r.action === 'message') {
        const txt = el('input', { type: 'text', class: 'text-in rule-text', value: r.target || '', placeholder: r.action === 'curse' ? 'No HP potions for the next dungeon' : 'Thanks for the support!', 'aria-label': 'Text' });
        txt.addEventListener('change', () => { r.target = txt.value.trim(); changed(); });
        parts.push(txt);
      }
      const extra = el('div', { class: 'rule-extra' });
      if (r.event !== 'command') {
        extra.appendChild(R.checkbox('Run once for every amount', !!r.each, (on) => { r.each = on; changed(); },
          { small: 'For example, 15 on a rule set to 5 runs it 3 times. Never more than 10.' }));
      }
      const cd = el('input', { type: 'number', class: 'rule-num', min: 0, value: r.cooldown || 0, 'aria-label': 'Cooldown in seconds' });
      cd.addEventListener('change', () => { r.cooldown = Math.max(0, Number(cd.value) || 0); changed(); });
      extra.append(el('label', { class: 'rule-cd' }, [el('span', { text: 'Cooldown' }), cd, el('span', { text: 'seconds' })]));
      extra.appendChild(el('button', {
        type: 'button', class: 'btn small danger', text: 'Remove',
        onclick: () => { cfg().rules.splice(i, 1); changed(); buildRules(box); },
      }));
      list.appendChild(el('div', { class: 'rule' + (r.on ? '' : ' off') }, [el('div', { class: 'rule-main' }, parts), extra]));
    });
    box.appendChild(list);
    box.appendChild(el('button', {
      type: 'button', class: 'btn small', text: 'Add rule',
      onclick: () => {
        cfg().rules.push({ id: 'r' + Date.now().toString(36), on: true, event: 'bits', min: 100, each: false, action: 'spin', target: 'curses', cooldown: 0 });
        save();
        buildRules(box);
      },
    }));
  }

  // Queue, recent events and test buttons
  function buildQueue(box) {
    box.innerHTML = '';
    const grid = el('div', { class: 'tool-grid' });
    grid.append(
      R.select('When events come in', cfg().mode, [
        ['queue', 'Play them one at a time'],
        ['combine', 'Combine ones that arrive close together'],
        ['approve', 'Wait for me to approve each one'],
      ], (v) => { cfg().mode = v; save(); buildQueue(box); }),
      R.range('Most waiting', cfg().maxQueue, 1, 50, 1, (v) => { cfg().maxQueue = v; save(); }),
    );
    box.appendChild(grid);
    if (cfg().mode === 'combine') {
      box.appendChild(R.range('Combine within', cfg().combineSecs, 2, 60, 1, (v) => { cfg().combineSecs = v; save(); }, { fmt: (v) => v + 's' }));
    }
    box.appendChild(R.checkbox('Switch tabs on this page when an event plays', cfg().switchTab, (on) => { cfg().switchTab = on; save(); },
      { small: 'Off: spins play in the pop-out windows and show their result here, and you stay on your tab.' }));
    box.appendChild(el('div', { id: 'queueList' }));

    box.appendChild(el('h4', { class: 'sub-head', text: 'Test an event' }));
    box.appendChild(el('p', { class: 'hint', text: 'Sends a pretend event through your rules, so you can try everything without going live.' }));
    const type = el('select', { 'aria-label': 'Event type' }, EVENTS.map(([v, l]) => el('option', { value: v, text: l })));
    const amount = el('input', { type: 'number', class: 'rule-num', value: 500, min: 0, 'aria-label': 'Amount' });
    const name = el('input', { type: 'text', class: 'rule-num', value: 'TestViewer', 'aria-label': 'Name' });
    const cmd = el('input', { type: 'text', class: 'rule-num', value: 'curse', 'aria-label': 'Command' });
    box.appendChild(el('div', { class: 'rule-main' }, [type, el('span', { class: 'rule-word', text: 'amount or command' }), amount, cmd, el('span', { class: 'rule-word', text: 'from' }), name,
      el('button', {
        type: 'button', class: 'btn btn-gold', text: 'Send test',
        onclick: () => {
          const e = { type: type.value, user: name.value || 'TestViewer', amount: Number(amount.value) || 0, test: true };
          if (e.type === 'command') { e.name = cmd.value.trim().replace(/^[!?~$]/, '').toLowerCase(); e.role = 'broadcaster'; }
          if (e.type === 'tip') e.text = money(e.amount);
          if (!handle(e)) R.toast('No rule matched that event.');
        },
      })]));
    renderQueue();
  }

  function renderQueue() {
    const box = $('queueList');
    if (box) {
      box.innerHTML = '';
      box.appendChild(el('div', { class: 'row-btns' }, [
        el('strong', { class: 'queue-count', text: queue.length ? `${queue.length} waiting or playing` : 'Nothing waiting' }),
        el('button', { type: 'button', class: 'btn small', text: paused ? 'Resume' : 'Pause', onclick: () => { paused = !paused; renderQueue(); pump(); } }),
        queue.some((q) => q.state === 'waiting') ? el('button', { type: 'button', class: 'btn small', text: 'Clear waiting', onclick: () => { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].state === 'waiting') queue.splice(i, 1); renderQueue(); } }) : null,
      ]));
      const ul = el('ul', { class: 'queue-list' });
      for (const q of queue) {
        const who = q.users.length > 1 ? ` (+${q.users.length - 1} more)` : '';
        ul.appendChild(el('li', { class: q.state }, [
          el('span', { text: `${title(q.event)}${who}: ${actionLabel(q.rule)}${q.count > 1 ? ' x' + q.count : ''}` }),
          q.state === 'running' ? el('em', { text: 'Playing' }) : el('span', { class: 'row-btns' }, [
            !q.approved ? el('button', { type: 'button', class: 'btn small btn-gold', text: 'Play', onclick: () => { q.approved = true; renderQueue(); pump(); } }) : null,
            el('button', { type: 'button', class: 'btn small', text: 'Skip', onclick: () => { queue.splice(queue.indexOf(q), 1); renderQueue(); } }),
          ]),
        ]));
      }
      box.appendChild(ul);
      if (recent.length) {
        box.appendChild(el('h4', { class: 'sub-head', text: 'Recent events' }));
        box.appendChild(el('ul', { class: 'seen-list' }, recent.map((r) => el('li', { text: r.text + (r.test ? ' (test)' : '') }))));
      }
    }
    // Events waiting for approval show a chip on every tab.
    const waiting = queue.filter((q) => !q.approved).length;
    let chip = $('approveChip');
    if (!chip && !R.overlay) {
      chip = el('button', { id: 'approveChip', class: 'approve-chip btn btn-gold', type: 'button', onclick: () => { R.main.showTab('stream'); R.main.openFold('events'); } });
      document.body.appendChild(chip);
    }
    if (chip) {
      chip.hidden = !waiting;
      chip.textContent = `${waiting} event${waiting === 1 ? '' : 's'} waiting for you`;
    }
  }

  // Privacy panel
  function buildPrivacy(box) {
    box.innerHTML = '';
    box.append(
      el('p', {}, [el('strong', { text: 'This site has no server and collects nothing.' }), ' Everything you set up here is saved in this browser only. There are no accounts, no analytics, no tracking and no cookies. The code is public, so anyone can check this: ',
        el('a', { href: 'https://github.com/Sinnisterly/rotmgrandomizer', target: '_blank', rel: 'noopener', text: 'source code on GitHub' }), '.']),
      el('h4', { class: 'sub-head', text: 'What this page connects to' }),
      el('ul', { class: 'plain-list' }, [
        el('li', { text: 'This website, to load the page, item data and images.' }),
        el('li', { text: 'Twitch chat (irc-ws.chat.twitch.tv), only after you press Connect. It only reads chat and never logs in.' }),
        el('li', { text: 'StreamElements (realtime.streamelements.com), only if you save a token and press Connect.' }),
        el('li', { text: 'Streamlabs (sockets.streamlabs.com), only if you save a token and press Connect.' }),
        el('li', { text: 'Links you click, like RealmEye item pages, open in a new tab.' }),
      ]),
      el('h4', { class: 'sub-head', text: 'What is saved in this browser' }),
    );
    const names = {
      settings: 'Settings', history: 'Roll history', used: 'No repeats list', wheel: 'Wheel lists',
      run: 'Run tracker', bingo: 'Bingo card', secrets: 'Tokens (hidden)',
    };
    const list = el('ul', { class: 'data-list' });
    for (const [k, key] of Object.entries(R.KEYS)) {
      let raw = null;
      try { raw = localStorage.getItem(key); } catch (e) { /* blocked */ }
      const size = raw ? raw.length : 0;
      const row = el('li', {}, [
        el('span', { text: `${names[k] || k}: ${size ? (size / 1024).toFixed(1) + ' KB' : 'nothing saved'}` }),
      ]);
      if (size && k !== 'secrets') {
        const pre = el('pre', { class: 'data-pre', hidden: true, text: raw.slice(0, 4000) + (raw.length > 4000 ? '\n(cut off)' : '') });
        row.append(el('button', { type: 'button', class: 'btn small', text: 'Show', onclick: (e) => { pre.hidden = !pre.hidden; e.target.textContent = pre.hidden ? 'Show' : 'Hide'; } }), pre);
      } else if (k === 'secrets' && size) {
        row.append(el('small', { class: 'hint', text: ` ${R.secrets.count()} saved. Shown only in their own fields above, behind the eye button.` }));
      }
      if (size) {
        row.append(el('button', {
          type: 'button', class: 'btn small danger', text: 'Delete',
          onclick: () => {
            if (!confirm(`Delete ${names[k] || k} from this browser?`)) return;
            if (k === 'secrets') { disconnectSource('se'); disconnectSource('sl'); }
            R.store.remove(key);
            location.reload();
          },
        }));
      }
      list.appendChild(row);
    }
    box.appendChild(list);
    box.appendChild(el('button', {
      type: 'button', class: 'btn danger', text: 'Delete everything',
      onclick: () => {
        if (!confirm('Delete every setting, list, run, card and token this site saved in this browser?')) return;
        disconnectSource('se');
        disconnectSource('sl');
        for (const key of Object.values(R.KEYS)) R.store.remove(key);
        location.reload();
      },
    }));
  }

  R.events = {
    init() {
      if (R.overlay) return;
      buildSources($('sourceTools'));
      buildRules($('ruleTools'));
      buildQueue($('queueTools'));
      buildPrivacy($('privacyTools'));
      // Show what is saved right now each time the panel opens.
      $('privacyTools').closest('details').addEventListener('toggle', (e) => { if (e.target.open) buildPrivacy($('privacyTools')); });
      for (const id of ['se', 'sl']) if (cfg()[id] && cfg()[id + 'Ack'] && R.secrets.get(id)) connectSource(id);
    },
    handle,
    title,
    sources,
  };
})();
