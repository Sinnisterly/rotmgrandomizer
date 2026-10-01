/*
 * Effects: synthesized sounds, pixel particles, screen shake, flashes,
 * pop-up windows and the loot bag art. Nothing here loads audio files.
 */
(function () {
  'use strict';

  const R = window.RR;
  if (!R || !R.ok) return;
  const { $, el } = R;

  // ---------- Effect settings ----------

  const SPEED = { slow: 1.5, normal: 1, fast: 0.6 };
  const AMOUNT = { low: 0.4, normal: 1, high: 2 };

  R.fx = {
    // True when animations should play.
    motion: () => R.settings.fx.animate && !R.reduceMotion,
    // Multiplies animation durations.
    speed: () => SPEED[R.settings.fx.speed] || 1,
    amount: () => AMOUNT[R.settings.fx.amount] || 1,
  };

  // ---------- Sound ----------
  // Every cue is built from short oscillator notes and filtered noise.

  let ctx = null;
  let master = null;

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    return ctx;
  }

  // Browsers only start audio after a click or key press.
  const unlock = () => { const a = audio(); if (a && a.state === 'suspended') a.resume(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  function wave() {
    return R.settings.sound.style === 'soft' ? 'sine' : 'square';
  }

  // One note. t is the start time offset in seconds.
  function note(freq, dur, opts = {}) {
    const a = ctx;
    const t0 = a.currentTime + (opts.t || 0);
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = opts.type || wave();
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
    const vol = (opts.vol || 0.2) * (osc.type === 'square' || osc.type === 'sawtooth' ? 0.55 : 1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, opts = {}) {
    const a = ctx;
    const t0 = a.currentTime + (opts.t || 0);
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 1200, t0);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(opts.vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  // Arpeggio helper: notes in Hz, step in seconds.
  function arp(freqs, step, dur, opts = {}) {
    freqs.forEach((f, i) => note(f, dur, { ...opts, t: (opts.t || 0) + i * step }));
  }

  const N = { C4: 262, E4: 330, G4: 392, A4: 440, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568 };

  // Cue name: [category, play function]
  const CUES = {
    click: ['ui', () => note(1400, 0.03, { vol: 0.06 })],
    toggle: ['ui', () => note(900, 0.04, { vol: 0.07, slide: 1300 })],
    error: ['ui', () => note(140, 0.18, { vol: 0.15, type: 'sawtooth' })],
    tick: ['spin', () => note(1800, 0.018, { vol: 0.05, type: 'triangle' })],
    reelTick: ['spin', () => note(1200, 0.02, { vol: 0.06, type: 'triangle' })],
    land: ['spin', () => { note(N.C5, 0.08, { vol: 0.1 }); note(N.G5, 0.12, { vol: 0.1, t: 0.06 }); }],
    shuffle: ['reveal', () => noise(0.25, { freq: 600, sweep: 3000, vol: 0.12 })],
    drop: ['reveal', () => { note(220, 0.12, { vol: 0.18, slide: 90, type: 'triangle' }); noise(0.08, { freq: 300, vol: 0.15, t: 0.02 }); }],
    wobble: ['reveal', () => note(320, 0.06, { vol: 0.06, type: 'triangle', slide: 360 })],
    pop: ['reveal', () => noise(0.18, { freq: 2500, sweep: 600, vol: 0.18 })],
    'bag-brown': ['reveal', () => arp([N.C4, N.E4], 0.07, 0.12, { vol: 0.1 })],
    'bag-pink': ['reveal', () => arp([N.C5, N.E5], 0.07, 0.14, { vol: 0.1 })],
    'bag-purple': ['reveal', () => arp([N.C5, N.E5, N.G5], 0.07, 0.15, { vol: 0.1 })],
    'bag-cyan': ['reveal', () => arp([N.C5, N.E5, N.G5, N.C6], 0.065, 0.18, { vol: 0.11 })],
    'bag-orange': ['fanfare', () => {
      arp([N.G4, N.C5, N.E5, N.G5], 0.08, 0.2, { vol: 0.12 });
      note(N.C6, 0.5, { vol: 0.12, t: 0.34 });
      note(N.E5, 0.5, { vol: 0.08, t: 0.34 });
    }],
    'bag-white': ['fanfare', () => {
      noise(0.5, { freq: 6000, filter: 'highpass', vol: 0.05 });
      arp([N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.06, 0.25, { vol: 0.1, type: 'triangle' });
      note(N.C6, 0.8, { vol: 0.1, t: 0.38 });
      note(N.G5, 0.8, { vol: 0.07, t: 0.38 });
      note(N.E5, 0.8, { vol: 0.06, t: 0.38 });
    }],
    classReveal: ['reveal', () => {
      note(N.C4, 0.4, { vol: 0.1, type: 'triangle' });
      note(N.G4, 0.4, { vol: 0.08, type: 'triangle', t: 0.05 });
      note(N.C5, 0.5, { vol: 0.1, t: 0.12 });
    }],
    win: ['fanfare', () => {
      arp([N.C5, N.E5, N.G5], 0.09, 0.16, { vol: 0.11 });
      note(N.C6, 0.45, { vol: 0.12, t: 0.27 });
    }],
    bingo: ['fanfare', () => {
      arp([N.C5, N.C5, N.C5, N.E5, N.G5], 0.1, 0.12, { vol: 0.12 });
      note(N.C6, 0.7, { vol: 0.13, t: 0.5 });
      note(N.G5, 0.7, { vol: 0.08, t: 0.5 });
    }],
    stSet: ['fanfare', () => {
      arp([N.C5, N.D5, N.E5, N.G5, N.A5, N.C6], 0.07, 0.2, { vol: 0.11 });
      note(N.C6, 0.9, { vol: 0.12, t: 0.42 });
      note(N.E6, 0.9, { vol: 0.07, t: 0.42 });
    }],
    death: ['events', () => arp([N.G4, 370, 349, 330], 0.18, 0.3, { vol: 0.12, type: 'triangle' })],
    curse: ['events', () => {
      note(110, 0.9, { vol: 0.14, type: 'sawtooth', detune: 10 });
      note(116, 0.9, { vol: 0.1, type: 'sawtooth' });
      noise(0.6, { freq: 300, sweep: 120, vol: 0.12 });
    }],
    plus: ['events', () => note(N.E5, 0.07, { vol: 0.08, slide: N.A5 })],
    minus: ['events', () => note(N.A4, 0.07, { vol: 0.08, slide: N.E4 })],
    vote: ['events', () => note(N.G5, 0.05, { vol: 0.06, type: 'triangle' })],
    timer: ['events', () => note(N.A5, 0.1, { vol: 0.08 })],
  };

  let lastTick = 0;
  R.sound = {
    play(name) {
      const s = R.settings.sound;
      if (!s.on || !s.volume) return;
      if (R.follower && !R.overlay.sound) return; // The main window plays the sound.
      const cue = CUES[name];
      if (!cue || s[cue[0]] === false) return;
      const a = audio();
      if (!a || a.state !== 'running') return;
      // Spin ticks can fire very fast. Keep them from stacking.
      if (cue[0] === 'spin' && name !== 'land') {
        const now = performance.now();
        if (now - lastTick < 28) return;
        lastTick = now;
      }
      const v = s.volume / 100;
      master.gain.setValueAtTime(v * v * 1.6, a.currentTime);
      try { cue[1](); } catch (e) { /* audio node errors are not fatal */ }
    },
    cues: CUES,
  };

  // ---------- Particles ----------
  // Square pixel particles on one full screen canvas.

  const canvas = $('fxCanvas');
  const g = canvas ? canvas.getContext('2d') : null;
  let parts = [];
  let running = false;

  function fit() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', fit);
  fit();

  function loop() {
    g.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    parts = parts.filter((p) => now - p.born < p.life);
    for (const p of parts) {
      const t = (now - p.born) / p.life;
      p.vy += p.grav;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      g.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      g.fillStyle = p.color;
      if (p.kind === 'confetti') {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        g.restore();
      } else {
        const s = p.size * (1 - t * 0.5);
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.round(s), Math.round(s));
      }
    }
    g.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(loop);
    else running = false;
  }

  function start() {
    if (!running && g) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  const SHINY = ['#ff5e5e', '#ffb35e', '#fff35e', '#5eff8a', '#5ed8ff', '#9a7bff', '#ff7bf0'];

  // Burst of pixels from a point. colors: array of css colors.
  R.fx.burst = function (x, y, opts = {}) {
    if (!R.fx.motion() || !R.settings.fx.particles || !g) return;
    const n = Math.round((opts.count || 30) * R.fx.amount());
    const colors = opts.colors || ['#ffffff'];
    const power = opts.power || 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.3 + Math.random() * 0.9);
      parts.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (opts.lift || 1.5),
        grav: opts.grav === undefined ? 0.18 : opts.grav,
        drag: 0.97,
        size: (opts.size || 6) * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        life: (opts.life || 900) * (0.7 + Math.random() * 0.6),
        born: performance.now(),
        rot: 0,
        spin: 0,
        kind: 'pixel',
      });
    }
    start();
  };

  // Confetti from the top of the screen.
  R.fx.confetti = function (opts = {}) {
    if (!R.fx.motion() || !R.settings.fx.particles || !g) return;
    const n = Math.round((opts.count || 120) * R.fx.amount());
    const colors = opts.colors || SHINY;
    for (let i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        grav: 0.05,
        drag: 0.995,
        size: 8 + Math.random() * 8,
        color: colors[i % colors.length],
        life: 2600 + Math.random() * 1400,
        born: performance.now(),
        rot: Math.random() * 6,
        spin: (Math.random() - 0.5) * 0.3,
        kind: 'confetti',
      });
    }
    start();
  };

  // Burst from the middle of an element.
  R.fx.burstAt = function (node, opts) {
    if (!node) return;
    const r = node.getBoundingClientRect();
    R.fx.burst(r.left + r.width / 2, r.top + r.height / 2, opts);
  };

  R.fx.SHINY = SHINY;

  // Effects for an item by its loot bag. node is where the burst starts.
  R.fx.forItem = function (it, node, opts = {}) {
    const bag = R.BAGS[R.bagOf(it)];
    const rank = bag.rank;
    const colors = it && R.isShiny(it) ? SHINY : [bag.color, bag.light, '#ffffff'];
    if (node) R.fx.burstAt(node, { colors, count: 10 + rank * 14, power: 3 + rank * 1.4, size: 5 + rank });
    if (rank >= 4) {
      R.fx.shake(rank - 3);
      R.fx.flash(bag.color);
    }
    if (it && R.isShiny(it) && !opts.quiet) R.fx.confetti({ count: 60 });
  };

  // ---------- Shake and flash ----------

  R.fx.shake = function (level) {
    if (!R.fx.motion() || !R.settings.fx.shake) return;
    const target = document.querySelector('.layout');
    if (!target) return;
    const cls = 'shake-' + Math.max(1, Math.min(3, level || 1));
    target.classList.remove('shake-1', 'shake-2', 'shake-3');
    void target.offsetWidth;
    target.classList.add(cls);
    setTimeout(() => target.classList.remove(cls), 500);
  };

  R.fx.flash = function (color) {
    if (!R.fx.motion() || !R.settings.fx.flash) return;
    const f = $('fxFlash');
    if (!f) return;
    f.style.background = color || '#fff';
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  };

  // ---------- Loot bag art ----------
  // 12 by 13 pixel bag. X outline, O fill, H highlight, K knot, S shade.

  const BAG_MAP = [
    '....XXXX....',
    '...XKKKKX...',
    '....XKKX....',
    '...XOOOOX...',
    '..XOHOOOOX..',
    '.XOHOOOOOOX.',
    'XOHOOOOOOSOX',
    'XOOOOOOOOSOX',
    'XOOOOOOOOSOX',
    'XOOOOOOOSSOX',
    'XSOOOOOSSSSX',
    '.XSSSSSSSSX.',
    '..XXXXXXXX..',
  ];

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  R.fx.bagSvg = function (bagId) {
    const bag = R.BAGS[bagId] || R.BAGS.brown;
    const colors = {
      X: '#141414',
      O: bag.color,
      H: bag.light,
      S: shade(bag.color, 0.7),
      K: shade(bag.color, 0.55),
    };
    let rects = '';
    BAG_MAP.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (colors[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch]}"/>`;
      });
    });
    return `<svg viewBox="0 0 12 13" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  };

  // ---------- Pop-up windows ----------

  let openModal = null;

  // Opens a pop-up with the given content. Returns a close function.
  R.modal = function (content, opts = {}) {
    if (openModal) openModal.close(true);
    const box = el('div', { class: 'modal-box ' + (opts.className || ''), role: 'dialog', 'aria-modal': 'true' }, [content]);
    const back = el('div', { class: 'modal-back' }, [box]);
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const prevFocus = document.activeElement;

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    }
    function close(silent) {
      if (!back.isConnected) return;
      document.removeEventListener('keydown', onKey, true);
      back.classList.remove('show');
      setTimeout(() => back.remove(), 180);
      if (openModal && openModal.box === box) openModal = null;
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      if (!silent && opts.onClose) opts.onClose();
    }
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey, true);
    openModal = { box, close };
    setTimeout(() => {
      const f = box.querySelector('[data-focus]') || box.querySelector('button');
      if (f) f.focus({ preventScroll: true });
    }, 30);
    return close;
  };

  R.modalOpen = () => !!openModal;
  R.closeModal = () => { if (openModal) openModal.close(); };
})();
