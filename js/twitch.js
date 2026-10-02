/*
 * Twitch chat: reads chat with an anonymous, read only connection. No login
 * and no server needed. Chat commands can roll, reveal, spin and vote.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
  const COMMANDS = [
    { id: 'roll', name: 'roll', desc: 'Randomize a new build' },
    { id: 'reveal', name: 'reveal', desc: 'Reveal the next hidden slot' },
    { id: 'spin', name: 'spin', desc: 'Spin the wheel' },
    { id: 'vote', name: 'vote', desc: 'Start a keep or reroll vote. Add a slot: vote weapon' },
    { id: 'death', name: 'death', desc: 'Add a death on the run tracker' },
  ];
  const VOTE_TARGETS = [
    ['all', 'Whole build'], ['class', 'Class'], ['weapon', 'Weapon'],
    ['ability', 'Ability'], ['armor', 'Armor'], ['ring', 'Ring'],
  ];

  let ws = null;
  let status = 'off'; // off, connecting, on, error
  let wanted = false;
  let retry = null;
  let seen = []; // recent commands
  let vote = null;
  let shown = null; // the vote as last drawn, also in windows that follow
  let voteTimer = null;

  // ---------- Connection ----------

  function connect() {
    const ch = (R.settings.twitch.channel || '').trim().replace(/^#/, '').toLowerCase();
    if (!ch) { R.toast('Type your channel name first.'); return; }
    disconnect(true);
    wanted = true;
    setStatus('connecting');
    try {
      ws = new WebSocket(IRC_URL);
    } catch (e) {
      setStatus('error');
      return;
    }
    ws.onopen = () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK justinfan' + Math.floor(10000 + Math.random() * 80000));
      ws.send('JOIN #' + ch);
    };
    ws.onmessage = (e) => String(e.data).split('\r\n').forEach(onLine);
    ws.onerror = () => setStatus('error');
    ws.onclose = () => {
      ws = null;
      if (wanted) {
        setStatus('connecting');
        clearTimeout(retry);
        retry = setTimeout(connect, 5000);
      } else setStatus('off');
    };
  }

  function disconnect(quiet) {
    wanted = false;
    clearTimeout(retry);
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    if (!quiet) setStatus('off');
  }

  function setStatus(s) {
    status = s;
    renderStatus();
  }

  // Splits one IRC line into tags, nick, command, channel and text.
  function parse(line) {
    let rest = line;
    const tags = {};
    if (rest.startsWith('@')) {
      const sp = rest.indexOf(' ');
      for (const kv of rest.slice(1, sp).split(';')) {
        const i = kv.indexOf('=');
        tags[kv.slice(0, i)] = kv.slice(i + 1);
      }
      rest = rest.slice(sp + 1);
    }
    let nick = '';
    if (rest.startsWith(':')) {
      const sp = rest.indexOf(' ');
      nick = rest.slice(1, sp).split('!')[0];
      rest = rest.slice(sp + 1);
    }
    const textAt = rest.indexOf(' :');
    const text = textAt >= 0 ? rest.slice(textAt + 2) : '';
    const parts = (textAt >= 0 ? rest.slice(0, textAt) : rest).split(' ');
    return { tags, nick, command: parts[0], channel: parts[1], text };
  }

  function onLine(line) {
    if (!line) return;
    if (line.startsWith('PING')) {
      if (ws) ws.send('PONG :tmi.twitch.tv');
      return;
    }
    const msg = parse(line);
    if (msg.command === 'JOIN' || msg.command === 'ROOMSTATE') setStatus('on');
    if (msg.command === 'PRIVMSG') onChat(msg);
  }

  // ---------- Chat ----------

  function roleOf(msg) {
    const badges = msg.tags.badges || '';
    if (badges.includes('broadcaster/')) return 'broadcaster';
    if (msg.tags.mod === '1' || badges.includes('moderator/')) return 'mod';
    if (badges.includes('vip/')) return 'vip';
    return 'viewer';
  }

  function allowed(role) {
    const who = R.settings.twitch.who;
    if (who === 'everyone') return true;
    if (who === 'broadcaster') return role === 'broadcaster';
    return role === 'broadcaster' || role === 'mod';
  }

  function onChat(msg) {
    const user = msg.tags['display-name'] || msg.nick;
    const text = msg.text.trim();
    if (vote && !vote.result) {
      const t = text.toLowerCase();
      const choice = t === '1' || t === 'keep' ? 'keep' : t === '2' || t === 'reroll' ? 'reroll' : null;
      if (choice) {
        vote.votes[msg.nick] = choice;
        R.sound.play('vote');
        renderVote();
        return;
      }
    }
    const prefix = R.settings.twitch.prefix || '!';
    if (!text.startsWith(prefix)) return;
    const [name, arg] = text.slice(prefix.length).trim().toLowerCase().split(/\s+/);
    const cmd = COMMANDS.find((c) => c.name === name);
    if (!cmd || !R.settings.twitch.commands[cmd.id]) return;
    const role = roleOf(msg);
    if (!allowed(role)) return;
    run(cmd.id, arg, user);
  }

  // Runs a command. Also used by the test buttons in the Stream tab.
  function run(id, arg, user) {
    seen.unshift({ user: user || 'You', text: (R.settings.twitch.prefix || '!') + id + (arg ? ' ' + arg : ''), t: Date.now() });
    seen = seen.slice(0, 8);
    renderSeen();
    if (id === 'roll') { R.main.showTab('randomizer'); R.rand.rollAll(); }
    else if (id === 'reveal') { R.main.showTab('randomizer'); R.rand.revealNext(); }
    else if (id === 'spin') R.wheel.spinPreset();
    else if (id === 'vote') startVote(VOTE_TARGETS.some(([v]) => v === arg) ? arg : 'all');
    else if (id === 'death') R.run.add('death');
  }

  // ---------- Votes ----------

  function startVote(target) {
    if (vote && !vote.result) return;
    if (!R.rand.currentClass()) { R.toast('Randomize first.'); return; }
    R.main.showTab('randomizer');
    vote = { target, votes: {}, endsAt: Date.now() + R.settings.twitch.voteTime * 1000, result: null };
    R.sound.play('toggle');
    clearInterval(voteTimer);
    voteTimer = setInterval(tickVote, 250);
    renderVote();
  }

  function tally() {
    const v = Object.values(vote.votes);
    return { keep: v.filter((x) => x === 'keep').length, reroll: v.filter((x) => x === 'reroll').length };
  }

  function tickVote() {
    if (!vote) return;
    if (!vote.result && Date.now() >= vote.endsAt) endVote();
    else renderVote();
  }

  function endVote() {
    const t = tally();
    vote.result = t.reroll > t.keep ? 'reroll' : 'keep';
    clearInterval(voteTimer);
    renderVote();
    R.sound.play(vote.result === 'reroll' ? 'curse' : 'win');
    if (vote.result === 'reroll') {
      if (vote.target === 'all') R.rand.rollAll();
      else R.rand.rerollOne(vote.target);
    }
    setTimeout(() => { vote = null; renderVote(); }, 5000);
  }

  function cancelVote() {
    clearInterval(voteTimer);
    vote = null;
    renderVote();
  }

  function voteLabel(target) {
    return target === 'all' ? 'the whole build' : 'the ' + VOTE_TARGETS.find(([v]) => v === target)[1].toLowerCase();
  }

  function renderVote(remote) {
    const v = remote !== undefined ? remote : vote ? { ...vote, tally: tally() } : null;
    if (remote === undefined) R.sync.send('vote', v);
    shown = v;
    const p = $('votePanel');
    p.hidden = !v;
    if (!v) return;
    p.innerHTML = '';
    const t = v.tally;
    const total = t.keep + t.reroll || 1;
    const left = Math.max(0, Math.ceil((v.endsAt - Date.now()) / 1000));
    p.append(
      el('div', { class: 'vote-head' }, [
        el('span', { class: 'label', text: 'Chat vote' }),
        el('strong', { text: v.result ? (v.result === 'reroll' ? `Chat rerolls ${voteLabel(v.target)}!` : `Chat keeps ${voteLabel(v.target)}.`) : `Keep or reroll ${voteLabel(v.target)}?` }),
        el('span', { class: 'vote-time', text: v.result ? '' : `${left}s` }),
      ]),
      el('div', { class: 'vote-bars' }, [
        el('div', { class: 'vote-bar keep' }, [el('span', { text: `1 Keep: ${t.keep}` }), el('i', { style: `width:${(t.keep / total) * 100}%` })]),
        el('div', { class: 'vote-bar reroll' }, [el('span', { text: `2 Reroll: ${t.reroll}` }), el('i', { style: `width:${(t.reroll / total) * 100}%` })]),
      ]),
    );
    if (!v.result && !R.follower) {
      p.appendChild(el('div', { class: 'row-btns ctrl' }, [
        el('button', { type: 'button', class: 'btn small', text: 'End now', onclick: endVote }),
        el('button', { type: 'button', class: 'btn small', text: 'Cancel', onclick: cancelVote }),
      ]));
    }
  }

  // ---------- Stream tab UI ----------

  function renderStatus() {
    const s = $('twitchStatus');
    if (!s) return;
    const text = { off: 'Not connected', connecting: 'Connecting...', on: 'Connected. Reading chat.', error: 'Could not connect' }[status];
    s.textContent = text;
    s.className = 'status-dot ' + status;
    const btn = $('twitchConnect');
    if (btn) btn.textContent = status === 'off' || status === 'error' ? 'Connect' : 'Disconnect';
  }

  function renderSeen() {
    const box = $('twitchSeen');
    if (!box) return;
    box.innerHTML = '';
    if (!seen.length) box.appendChild(el('li', { class: 'hint', text: 'Commands from chat show here.' }));
    for (const s of seen) box.appendChild(el('li', {}, [el('strong', { text: s.user }), ' ', s.text]));
  }

  function buildTools(box) {
    const tw = R.settings.twitch;
    const saveTw = () => R.saveSettings();
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Lets chat run commands and vote. It only reads chat, so you do not need to log in. Commands also work in the OBS overlay.' }));

    const chan = el('input', { type: 'text', class: 'text-in', value: tw.channel, placeholder: 'your_channel', spellcheck: 'false', 'aria-label': 'Twitch channel' });
    chan.addEventListener('change', () => { tw.channel = chan.value.trim(); saveTw(); });
    const connectBtn = el('button', {
      type: 'button', class: 'btn btn-gold', id: 'twitchConnect', text: 'Connect',
      onclick: () => {
        tw.channel = chan.value.trim();
        saveTw();
        if (status === 'off' || status === 'error') connect();
        else disconnect();
      },
    });
    box.append(
      el('div', { class: 'seed-row' }, [el('label', { text: 'Channel' }), chan, connectBtn]),
      el('p', { class: 'status-line' }, [el('span', { id: 'twitchStatus', class: 'status-dot off' })]),
      R.checkbox('Connect when the page opens', tw.autoConnect, (on) => { tw.autoConnect = on; saveTw(); }),
    );

    const grid = el('div', { class: 'tool-grid' });
    grid.append(
      R.select('Who can use commands', tw.who, [['broadcaster', 'Only me'], ['mods', 'Me and mods'], ['everyone', 'Everyone']], (v) => { tw.who = v; saveTw(); }),
      R.select('Command prefix', tw.prefix, [['!', '!'], ['?', '?'], ['~', '~'], ['$', '$']], (v) => { tw.prefix = v; saveTw(); buildTools(box); }),
    );
    box.appendChild(grid);

    box.appendChild(el('h4', { class: 'sub-head', text: 'Commands' }));
    const list = el('div', { class: 'check-list' });
    for (const c of COMMANDS) {
      list.appendChild(R.checkbox(`${tw.prefix}${c.name}`, tw.commands[c.id], (on) => { tw.commands[c.id] = on; saveTw(); }, { small: c.desc }));
    }
    box.appendChild(list);

    box.appendChild(el('h4', { class: 'sub-head', text: 'Keep or reroll vote' }));
    box.appendChild(el('p', { class: 'hint', text: 'Chat types 1 to keep or 2 to reroll. Anyone in chat can vote once. A reroll uses up a reroll if the reroll limit is on.' }));
    box.appendChild(R.range('Vote length', tw.voteTime, 10, 120, 5, (v) => { tw.voteTime = v; saveTw(); }, { fmt: (v) => v + 's' }));
    let target = 'all';
    const tsel = R.select('Vote on', target, VOTE_TARGETS, (v) => { target = v; });
    box.append(tsel, el('div', { class: 'row-btns' }, [
      el('button', { type: 'button', class: 'btn', text: 'Start vote', onclick: () => startVote(target) }),
    ]));

    box.appendChild(el('h4', { class: 'sub-head', text: 'Recent commands' }));
    box.appendChild(el('ul', { class: 'seen-list', id: 'twitchSeen' }));
    renderStatus();
    renderSeen();
  }

  R.twitch = {
    init() {
      if (R.settings.twitch.autoConnect && R.settings.twitch.channel && !R.follower) connect();
      // OBS links with a channel connect on their own.
      else if (R.overlay && !R.follower && R.settings.twitch.channel) connect();
    },
    buildTools,
    startVote,
    renderVote,
    run,
    parse,
    COMMANDS,
    status: () => status,
    currentVote: () => shown,
  };
})();
