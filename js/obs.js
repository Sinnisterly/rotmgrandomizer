/*
 * OBS WebSocket bridge. The main page connects to OBS on this computer and
 * hands every update to OBS Browser Sources, so they follow this page live.
 * It can also switch OBS scenes while a spin plays.
 *
 * Uses OBS WebSocket 5 (built into OBS 28 and newer). The password lives in
 * R.secrets and is only sent to OBS on this computer.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const cfg = () => R.settings.obs;
  const save = () => R.saveSettings();
  const VIEWS = [
    ['layout', 'Show on stream layout'],
    ['alerts', 'Alerts only'],
    ['randomizer', 'Randomizer'],
    ['wheel', 'Wheel'],
    ['rules', 'Active rules'],
    ['run', 'Run tracker'],
    ['bingo', 'Bingo'],
  ];

  const st = { ws: null, status: 'off', want: false, nextId: 1, pending: new Map(), scenes: [], beat: null, timer: null, failed: false };

  // ---------- Connection ----------

  async function sha256b64(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function setStatus(s) {
    st.status = s;
    render();
  }

  function connect() {
    if (R.overlay) return;
    disconnect(true);
    st.want = true;
    st.failed = false;
    setStatus('connecting');
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${Number(cfg().port) || 4455}`);
    } catch (e) {
      setStatus('error');
      return;
    }
    st.ws = ws;
    ws.onmessage = async (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch (e) { return; }
      const { op, d } = msg;
      if (op === 0) {
        // Hello. Log in with the password if OBS asks for one.
        const ident = { rpcVersion: 1, eventSubscriptions: 4 }; // 4: scene events
        if (d.authentication) {
          const pass = R.secrets.get('obs');
          const secret = await sha256b64(pass + d.authentication.salt);
          ident.authentication = await sha256b64(secret + d.authentication.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: ident }));
      } else if (op === 2) {
        setStatus('on');
        loadScenes();
        sendAll();
        // Sources that load later catch up within a few seconds.
        clearInterval(st.beat);
        st.beat = setInterval(sendAll, 10000);
      } else if (op === 7) {
        const p = st.pending.get(d.requestId);
        if (p) {
          st.pending.delete(d.requestId);
          if (d.requestStatus && d.requestStatus.result) p.resolve(d.responseData || {});
          else p.reject(new Error((d.requestStatus && d.requestStatus.comment) || 'OBS said no'));
        }
      } else if (op === 5 && d.eventType === 'CurrentProgramSceneChanged') {
        // A source in the new scene may have just loaded.
        setTimeout(sendAll, 800);
      }
    };
    ws.onerror = () => { if (st.status !== 'denied') setStatus('error'); };
    ws.onclose = (e) => {
      clearInterval(st.beat);
      st.ws = null;
      for (const p of st.pending.values()) p.reject(new Error('closed'));
      st.pending.clear();
      if (e.code === 4009) {
        // Wrong password. Do not keep trying.
        st.want = false;
        setStatus('denied');
        return;
      }
      if (st.want) {
        setStatus('connecting');
        clearTimeout(st.timer);
        st.timer = setTimeout(connect, 5000);
      } else setStatus('off');
    };
  }

  function disconnect(quiet) {
    st.want = false;
    clearTimeout(st.timer);
    clearInterval(st.beat);
    if (st.ws) {
      st.ws.onclose = null;
      st.ws.close();
      st.ws = null;
    }
    if (!quiet) setStatus('off');
  }

  function request(requestType, requestData) {
    return new Promise((resolve, reject) => {
      if (!st.ws || st.status !== 'on') { reject(new Error('not connected')); return; }
      const requestId = 'r' + st.nextId++;
      st.pending.set(requestId, { resolve, reject });
      st.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (st.pending.has(requestId)) {
          st.pending.delete(requestId);
          reject(new Error('timed out'));
        }
      }, 8000);
    });
  }

  // ---------- Forwarding to Browser Sources ----------

  // OBS passes this to every Browser Source as a window event named rotmgr.
  function forward(type, data) {
    if (st.status !== 'on') return;
    request('CallVendorRequest', {
      vendorName: 'obs-browser',
      requestType: 'emit_event',
      requestData: { event_name: 'rotmgr', event_data: { type, data } },
    }).catch(() => {});
  }

  // Settings go along too, so sources match this page. Settings never hold
  // passwords or tokens, those are in R.secrets.
  function sendSettings() {
    const s = JSON.parse(JSON.stringify(R.settings));
    s.open = {};
    forward('settings', s);
  }

  function sendAll() {
    if (st.status !== 'on') return;
    sendSettings();
    R.stream.sendAll();
  }

  let settingsTimer = null;
  R.on('settingsSaved', () => {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(sendSettings, 300);
  });

  // ---------- Scene switching ----------

  async function loadScenes() {
    try {
      const r = await request('GetSceneList');
      st.scenes = (r.scenes || []).map((x) => x.sceneName).reverse();
    } catch (e) {
      st.scenes = [];
    }
    render();
  }

  let backTo = null;
  let backTimer = null;

  R.on('spinStart', async (info) => {
    const c = cfg();
    if (R.overlay || st.status !== 'on' || !c.scene) return;
    if (c.onlyEvents && !(info && info.auto)) return;
    clearTimeout(backTimer);
    try {
      const cur = await request('GetCurrentProgramScene');
      const name = cur.currentProgramSceneName || cur.sceneName;
      if (name !== c.scene) {
        if (!backTo) backTo = name;
        await request('SetCurrentProgramScene', { sceneName: c.scene });
      }
    } catch (e) { /* OBS busy or scene gone */ }
  });

  R.on('spinDone', () => {
    if (!backTo || !cfg().back) { backTo = null; return; }
    clearTimeout(backTimer);
    // Wait out the result, plus a little, so a run of spins stays in one scene.
    backTimer = setTimeout(() => {
      if (R.wheel.isSpinning()) return;
      request('SetCurrentProgramScene', { sceneName: backTo }).catch(() => {});
      backTo = null;
    }, (Number(R.settings.stream.hold) || 6) * 1000 + 2500);
  });

  // ---------- Stream tab ----------

  function link(view) {
    const p = new URLSearchParams({ overlay: '1', sync: 'obs', view, bg: 'transparent', scale: '100' });
    if (cfg().sound) p.set('sound', '1');
    return location.origin + location.pathname + '?' + p.toString();
  }

  function build() {
    const box = $('obsTools');
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Lets OBS Browser Sources follow this page live, with a see-through background and no Window Capture. Keep this page open while you stream. Needs OBS 28 or newer.' }));
    box.appendChild(el('ol', { class: 'plain-list steps' }, [
      el('li', { text: 'In OBS, open Tools, then WebSocket Server Settings.' }),
      el('li', { text: 'Tick Enable WebSocket server. Keep Enable Authentication ticked.' }),
      el('li', { text: 'Press Show Connect Info. Copy the Server Port and Server Password into the boxes below.' }),
    ]));
    box.appendChild(el('div', { class: 'warn-box' }, [
      el('strong', { text: 'Read this first' }),
      el('ul', {}, [
        el('li', { text: 'The OBS password lets anything on this computer that has it control OBS.' }),
        el('li', { text: 'It is saved only in this browser. It is never put in pop-out windows, OBS links, shared settings or backups, and it is never sent to us.' }),
        el('li', { text: 'It is only sent to OBS on this computer (127.0.0.1).' }),
        el('li', { text: 'Keep this page off stream while you paste it.' }),
      ]),
    ]));
    box.appendChild(R.checkbox('I read this and understand', cfg().ack, (on) => { cfg().ack = on; save(); build(); }));
    if (!cfg().ack) return;

    const port = el('input', { type: 'number', class: 'rule-num', value: cfg().port, min: 1, max: 65535, 'aria-label': 'OBS WebSocket port' });
    port.addEventListener('change', () => { cfg().port = Number(port.value) || 4455; save(); });
    box.appendChild(el('div', { class: 'rule-main' }, [el('span', { class: 'rule-word', text: 'Port' }), port]));
    box.appendChild(R.secretField('OBS WebSocket password', 'obs'));
    box.appendChild(el('div', { class: 'row-btns' }, [
      el('button', {
        type: 'button', class: 'btn btn-gold', id: 'obsConnect',
        onclick: () => {
          if (st.status === 'on' || st.status === 'connecting') { cfg().auto = false; save(); disconnect(); }
          else { cfg().auto = true; save(); connect(); }
        },
      }),
      el('span', { class: 'status-dot off', id: 'obsStatus' }),
    ]));
    box.appendChild(R.checkbox('Connect when the page opens', cfg().auto, (on) => { cfg().auto = on; save(); }));

    // Browser Source links
    box.appendChild(el('h4', { class: 'sub-head', text: 'Browser Source links' }));
    box.appendChild(el('p', { class: 'hint', text: 'Add any of these as a Browser Source in OBS. They have a see-through background. Size them 1920 by 1080 for the layout, or to fit for the others. The links have no passwords or tokens in them.' }));
    box.appendChild(R.checkbox('Play sounds in OBS', cfg().sound, (on) => { cfg().sound = on; save(); },
      { small: 'If OBS also captures this browser, you may hear sounds twice. Mute one of them.' }));
    const list = el('div', { class: 'pop-list' });
    for (const [view, name] of VIEWS) {
      list.appendChild(el('div', { class: 'pop-row' }, [
        el('strong', { text: name }),
        el('button', { type: 'button', class: 'btn small', text: 'Copy link', onclick: () => R.copy(link(view), name + ' link copied') }),
      ]));
    }
    box.appendChild(list);

    // Scene switching
    box.appendChild(el('h4', { class: 'sub-head', text: 'Switch scenes for spins' }));
    const scenes = [['', 'Do not switch']].concat(st.scenes.map((n) => [n, n]));
    box.appendChild(R.select('Scene to show while the wheel spins', cfg().scene, scenes, (v) => { cfg().scene = v; save(); }));
    box.append(
      R.checkbox('Go back to the scene I was on after the result', cfg().back, (on) => { cfg().back = on; save(); }),
      R.checkbox('Only for viewer events', cfg().onlyEvents, (on) => { cfg().onlyEvents = on; save(); },
        { small: 'Off: spins you start yourself switch scenes too.' }),
    );
    if (st.status === 'on') box.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Reload scene list', onclick: loadScenes }));
    render();
  }

  function render() {
    const dot = $('obsStatus');
    if (dot) {
      dot.className = 'status-dot ' + (st.status === 'denied' ? 'error' : st.status);
      dot.textContent = {
        off: 'Not connected', connecting: 'Connecting... Is OBS open with the WebSocket server on?',
        on: 'Connected to OBS', error: 'Could not reach OBS', denied: 'OBS did not accept the password',
      }[st.status];
    }
    const btn = $('obsConnect');
    if (btn) btn.textContent = st.status === 'on' || st.status === 'connecting' ? 'Disconnect' : 'Connect';
    // The scene list fills in once connected.
    const sel = document.querySelector('#obsTools select');
    if (sel && sel.options.length !== st.scenes.length + 1) {
      const keep = cfg().scene;
      sel.innerHTML = '';
      for (const [v, l] of [['', 'Do not switch']].concat(st.scenes.map((n) => [n, n]))) sel.appendChild(el('option', { value: v, text: l }));
      sel.value = keep;
    }
  }

  R.obs = {
    init() {
      if (R.overlay) return;
      R.bridge = forward;
      build();
      if (cfg().ack && cfg().auto) connect();
    },
    status: () => st.status,
  };
})();
