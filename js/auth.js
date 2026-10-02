/*
 * Log in with Twitch, for channel point redemptions. Uses Twitch's browser
 * login (no server): Twitch sends the streamer back to this page with a
 * token in the address bar. The token is moved into R.secrets right away
 * and removed from the address bar.
 *
 * The only permission asked for is channel:read:redemptions. Redemptions
 * arrive over Twitch EventSub, then go to the event rules.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  const SCOPE = 'channel:read:redemptions';
  const STATE_KEY = 'rotmgr.twitchState';
  const cfg = () => R.settings.events;

  const st = { status: 'off', user: null, ws: null, session: null, want: false, timer: null, error: '' };

  // ---------- Coming back from Twitch ----------
  // This runs as soon as the script loads, before the randomizer reads the
  // address bar for share links, so the token never sits in the address bar.

  let returned = null;
  (function capture() {
    if (R.overlay || !/access_token=|error=/.test(location.hash)) return;
    const p = new URLSearchParams(location.hash.slice(1));
    let expected = null;
    try { expected = sessionStorage.getItem(STATE_KEY); sessionStorage.removeItem(STATE_KEY); } catch (e) { /* blocked */ }
    history.replaceState(null, '', location.pathname + location.search);
    if (p.get('error')) {
      returned = { error: p.get('error_description') || 'Twitch did not log you in.' };
    } else if (!expected || p.get('state') !== expected) {
      // The login was not started from this page. Ignore it.
      returned = { error: 'That login did not come from this page, so it was ignored.' };
    } else {
      R.secrets.set('twitch', p.get('access_token'));
      returned = { ok: true };
    }
  })();

  const clientId = () => R.config.twitchClientId;

  function login() {
    if (!clientId()) return;
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(STATE_KEY, state); } catch (e) { /* blocked */ }
    const p = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPE,
      state,
    });
    location.href = 'https://id.twitch.tv/oauth2/authorize?' + p.toString();
  }

  async function logout() {
    const token = R.secrets.get('twitch');
    stop();
    R.secrets.set('twitch', '');
    st.user = null;
    setStatus('off');
    if (token && clientId()) {
      // Tell Twitch to cancel the token too.
      fetch('https://id.twitch.tv/oauth2/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId(), token }),
      }).catch(() => {});
    }
    build();
  }

  function setStatus(s, error) {
    st.status = s;
    st.error = error || '';
    render();
  }

  // Checks the saved token with Twitch and gets the channel it belongs to.
  async function validate() {
    const token = R.secrets.get('twitch');
    if (!token) return null;
    try {
      const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + token } });
      if (r.status === 401) {
        R.secrets.set('twitch', '');
        setStatus('off', 'Your Twitch login ran out. Log in again.');
        return null;
      }
      const j = await r.json();
      return { id: j.user_id, login: j.login, expires: j.expires_in };
    } catch (e) {
      setStatus('error', 'Could not reach Twitch.');
      return null;
    }
  }

  // ---------- EventSub ----------

  async function start() {
    if (R.overlay || !clientId()) return;
    st.user = await validate();
    if (!st.user) { build(); return; }
    build();
    open('wss://eventsub.wss.twitch.tv/ws');
  }

  function open(url, keep) {
    st.want = true;
    setStatus('connecting');
    const ws = new WebSocket(url);
    const old = st.ws;
    st.ws = ws;
    ws.onmessage = async (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch (e) { return; }
      const type = msg.metadata && msg.metadata.message_type;
      if (type === 'session_welcome') {
        st.session = msg.payload.session.id;
        if (keep && old) { old.onclose = null; old.close(); }
        if (!keep) await subscribe();
        else setStatus('on');
      } else if (type === 'notification') {
        const e = msg.payload.event || {};
        R.events.handle({
          type: 'points', user: e.user_name || e.user_login, amount: (e.reward && e.reward.cost) || 0,
          reward: (e.reward && e.reward.title) || '', text: e.user_input || '',
        });
      } else if (type === 'session_reconnect') {
        // Twitch moves the connection. Subscriptions carry over.
        open(msg.payload.session.reconnect_url, true);
      } else if (type === 'revocation') {
        setStatus('error', 'Twitch stopped sending redemptions. Log in again.');
      }
    };
    ws.onclose = () => {
      if (st.ws !== ws) return;
      st.ws = null;
      if (st.want) {
        setStatus('connecting');
        clearTimeout(st.timer);
        st.timer = setTimeout(start, 8000);
      }
    };
  }

  async function subscribe() {
    try {
      const r = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-Id': clientId(),
          Authorization: 'Bearer ' + R.secrets.get('twitch'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'channel.channel_points_custom_reward_redemption.add',
          version: '1',
          condition: { broadcaster_user_id: st.user.id },
          transport: { method: 'websocket', session_id: st.session },
        }),
      });
      if (r.ok) setStatus('on');
      else if (r.status === 403) setStatus('error', 'Twitch only allows this for Affiliate and Partner channels.');
      else setStatus('error', 'Twitch did not accept the request (' + r.status + ').');
    } catch (e) {
      setStatus('error', 'Could not reach Twitch.');
    }
  }

  function stop() {
    st.want = false;
    clearTimeout(st.timer);
    if (st.ws) {
      st.ws.onclose = null;
      st.ws.close();
      st.ws = null;
    }
  }

  // ---------- Stream tab ----------

  function build() {
    const box = $('pointsTools');
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('p', { class: 'hint', text: 'Lets channel point rewards trigger event rules. Make a rule with the event Channel points and type the reward name, or leave the name empty for any reward.' }));
    if (!clientId()) {
      box.appendChild(el('p', { class: 'hint', text: 'Channel points are not set up on this copy of the site yet. The site owner needs to add a Twitch Client ID.' }));
      return;
    }
    if (returned && returned.error) box.appendChild(el('p', { class: 'notice-line', text: returned.error }));
    box.appendChild(el('div', { class: 'warn-box' }, [
      el('strong', { text: 'Read this first' }),
      el('ul', {}, [
        el('li', { text: 'Log in with Twitch only asks to read your channel point redemptions. It cannot chat, change your channel or see your messages.' }),
        el('li', { text: 'The login is saved only in this browser. It is never put in pop-out windows, OBS links, shared settings or backups, and it is never sent to us. It is only sent to Twitch.' }),
        el('li', { text: 'You can log out here at any time. You can also remove it on Twitch in Settings, then Connections.' }),
        el('li', { text: 'Channel points only exist on Affiliate and Partner channels.' }),
      ]),
    ]));
    box.appendChild(R.checkbox('I read this and understand', cfg().pointsAck, (on) => { cfg().pointsAck = on; R.saveSettings(); build(); }));
    if (!cfg().pointsAck) return;
    const row = el('div', { class: 'row-btns' });
    if (R.secrets.get('twitch')) {
      row.append(
        el('span', { text: st.user ? 'Logged in as ' + st.user.login : 'Logged in' }),
        el('button', { type: 'button', class: 'btn small', text: 'Log out', onclick: logout }),
      );
    } else {
      row.appendChild(el('button', { type: 'button', class: 'btn btn-gold', text: 'Log in with Twitch', onclick: login }));
    }
    row.appendChild(el('span', { class: 'status-dot off', id: 'pointsStatus' }));
    box.appendChild(row);
    render();
  }

  function render() {
    const dot = $('pointsStatus');
    if (!dot) return;
    dot.className = 'status-dot ' + st.status;
    dot.textContent = st.error || {
      off: R.secrets.get('twitch') ? 'Not listening' : 'Not logged in',
      connecting: 'Connecting to Twitch...',
      on: 'Listening for channel point redemptions',
      error: 'Something went wrong',
    }[st.status];
  }

  R.auth = {
    init() {
      if (R.overlay) return;
      build();
      if (R.secrets.get('twitch') && cfg().pointsAck) start();
    },
    status: () => st.status,
  };
})();
