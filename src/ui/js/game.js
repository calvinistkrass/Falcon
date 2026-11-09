'use strict';
/*
 * „Falcon Flight“ – kleines Spiel für die Offline-Fehlerseite.
 * Der Falke fliegt durch die Lücken zwischen Funkmasten. Leertaste, Pfeil nach oben oder Klick
 * lassen ihn flattern. Läuft nur, solange die Fehlerseite sichtbar ist.
 */

const FalconGame = (() => {
  const W = 640;
  const H = 220;
  const GROUND = H - 18;
  const BIRD_X = 120;
  const BIRD_R = 11;
  const GRAVITY = 1500;
  const FLAP = -430;
  const MAST_W = 44;
  const SPACING = 220;
  const BEST_KEY = 'falcon.game.best';

  let canvas, ctx, wrap;
  let raf = 0;
  let visible = false;
  let last = 0;
  let colors = {};
  let mode = 'idle';           // idle | play | over
  let bird, masts, clouds, score, best, speed, time, shake, overAt;

  function readColors() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue(n).trim();
    colors = { accent: v('--accent'), text: v('--text'), text2: v('--text-2'), text3: v('--text-3'), line: v('--line-2'), mast: v('--raised-2'), panel: v('--surface'), danger: v('--danger') };
  }

  function reset() {
    bird = { y: H / 2 - 20, vy: 0, wing: 0 };
    masts = [];
    clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 150 + Math.random() * 80, y: 20 + Math.random() * 70, w: 40 + Math.random() * 50 }));
    score = 0;
    speed = 170;
    time = 0;
    shake = 0;
  }

  function gapSize() { return Math.max(70, 92 - score * 1.2); }

  function spawnMast(x) {
    const gap = gapSize();
    const top = 24 + Math.random() * (GROUND - gap - 48);
    masts.push({ x, top, gap, passed: false });
  }

  // -------------------------------------------------------------------------
  // Spiellogik
  // -------------------------------------------------------------------------
  function flap() {
    if (mode === 'idle') { mode = 'play'; reset(); spawnMast(W + 40); }
    else if (mode === 'over') {
      if (performance.now() - overAt < 450) return; // versehentlichen Neustart vermeiden
      mode = 'play'; reset(); spawnMast(W + 40);
    }
    bird.vy = FLAP;
  }

  function hits(m) {
    const cx = BIRD_X, cy = bird.y;
    const inX = cx + BIRD_R > m.x && cx - BIRD_R < m.x + MAST_W;
    return inX && (cy - BIRD_R < m.top || cy + BIRD_R > m.top + m.gap);
  }

  function gameOver() {
    mode = 'over';
    overAt = performance.now();
    shake = 1;
    if (score > best) { best = score; store.set(BEST_KEY, best); }
  }

  function update(dt) {
    time += dt;
    for (const c of clouds) {
      c.x -= (mode === 'play' ? speed : 40) * 0.25 * dt;
      if (c.x + c.w < 0) { c.x = W + Math.random() * 60; c.y = 20 + Math.random() * 70; }
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 3);

    if (mode === 'idle') {
      bird.y = H / 2 - 20 + Math.sin(time * 3) * 6;
      bird.wing += dt * 9;
      return;
    }
    if (mode === 'over') {
      if (bird.y < GROUND - BIRD_R) { bird.vy += GRAVITY * dt; bird.y = Math.min(GROUND - BIRD_R, bird.y + bird.vy * dt); }
      return;
    }

    bird.vy += GRAVITY * dt;
    bird.y += bird.vy * dt;
    bird.wing += dt * (bird.vy < 0 ? 22 : 8);
    speed = Math.min(300, 170 + score * 4);

    for (const m of masts) {
      m.x -= speed * dt;
      if (!m.passed && m.x + MAST_W < BIRD_X - BIRD_R) { m.passed = true; score++; }
      if (hits(m)) return gameOver();
    }
    if (masts.length && masts[0].x + MAST_W < -10) masts.shift();
    const lastMast = masts[masts.length - 1];
    if (!lastMast || lastMast.x < W - SPACING) spawnMast(W + 10);

    if (bird.y + BIRD_R >= GROUND) { bird.y = GROUND - BIRD_R; return gameOver(); }
    if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0; }
  }

  // -------------------------------------------------------------------------
  // Zeichnen
  // -------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function drawMast(m) {
    ctx.fillStyle = colors.mast;
    roundRect(m.x, -6, MAST_W, m.top + 6, 6);
    roundRect(m.x, m.top + m.gap, MAST_W, GROUND - m.top - m.gap + 6, 6);
    // Kanten in Akzentfarbe, wie Leuchten an einem Funkmast
    ctx.fillStyle = colors.accent;
    roundRect(m.x - 3, m.top - 6, MAST_W + 6, 6, 3);
    roundRect(m.x - 3, m.top + m.gap, MAST_W + 6, 6, 3);
    ctx.fillStyle = colors.line;
    for (let y = m.top - 20; y > 0; y -= 18) ctx.fillRect(m.x + MAST_W / 2 - 1, y, 2, 9);
    for (let y = m.top + m.gap + 20; y < GROUND; y += 18) ctx.fillRect(m.x + MAST_W / 2 - 1, y, 2, 9);
  }

  function drawBird() {
    const tilt = mode === 'idle' ? 0 : Math.max(-0.5, Math.min(1.1, bird.vy / 600));
    const wing = Math.sin(bird.wing) * 0.9;
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(tilt);
    // Schwanz
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(-10, -2); ctx.lineTo(-20, -7); ctx.lineTo(-18, 2); ctx.lineTo(-20, 8); ctx.lineTo(-10, 3);
    ctx.fill();
    // Körper
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Flügel
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = colors.text;
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(-2, -14 * wing - 4, 8, -18 * wing - 2);
    ctx.quadraticCurveTo(4, -4, 6, 0);
    ctx.fill();
    ctx.restore();
    // Kopf, Auge, Schnabel
    ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(10, -3, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath(); ctx.moveTo(15, -4); ctx.lineTo(21, -1); ctx.lineTo(15, 1); ctx.fill();
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath(); ctx.arc(12, -4.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function text(str, x, y, { size = 13, color = colors.text2, align = 'center', weight = 500, font = 'sans' } = {}) {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.font = `${weight} ${size}px ${font === 'mono' ? '"Cascadia Mono", Consolas, monospace' : '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'}`;
    ctx.fillText(str, x, y);
  }

  function draw() {
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shake) ctx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

    // Wolken
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = colors.line;
    for (const c of clouds) roundRect(c.x, c.y, c.w, 8, 4);
    ctx.globalAlpha = 1;

    // Boden
    ctx.fillStyle = colors.line;
    ctx.fillRect(0, GROUND, W, 1);
    const offset = (time * (mode === 'play' ? speed : 40)) % 24;
    for (let x = -offset; x < W; x += 24) ctx.fillRect(x, GROUND + 7, 10, 1);

    for (const m of masts) drawMast(m);
    drawBird();

    const pad = (n) => String(n).padStart(4, '0');
    text(`HI ${pad(best)}   ${pad(score)}`, W - 14, 24, { align: 'right', size: 13, weight: 600, font: 'mono', color: colors.text2 });

    if (mode !== 'play') {
      // ruhige Fläche hinter dem Text, damit er nicht über den Masten liegt
      const boxY = mode === 'idle' ? H / 2 + 14 : H / 2 - 36;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = colors.panel;
      roundRect(W / 2 - 150, boxY, 300, 56, 10);
      ctx.globalAlpha = 1;
    }
    if (mode === 'idle') {
      text('Falcon Flight', W / 2, H / 2 + 34, { size: 15, weight: 600, color: colors.text });
      text($t('Leertaste oder Klick zum Starten'), W / 2, H / 2 + 56, { size: 12.5, color: colors.text3 });
    } else if (mode === 'over') {
      text('Game Over', W / 2, H / 2 - 12, { size: 18, weight: 700, color: colors.text });
      text(score >= best && score > 0 ? $t('Neuer Rekord!') : $t('Leertaste für eine neue Runde'), W / 2, H / 2 + 12,
        { size: 12.5, color: score >= best && score > 0 ? colors.accent : colors.text3 });
    }
  }

  function frame(now) {
    if (!visible) { raf = 0; return; }
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------------
  // Einbinden
  // -------------------------------------------------------------------------
  function mount(container) {
    wrap = h('div', { class: 'game', tabindex: '0', 'aria-label': 'Falcon Flight' });
    canvas = h('canvas', { width: W * (devicePixelRatio || 1), height: H * (devicePixelRatio || 1) });
    wrap.append(canvas);
    container.append(wrap);
    ctx = canvas.getContext('2d');
    best = store.get(BEST_KEY, 0);

    wrap.addEventListener('mousedown', (e) => { e.preventDefault(); wrap.focus(); flap(); });
    wrap.addEventListener('keydown', (e) => {
      if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) flap(); }
    });
  }

  function show() {
    if (visible) return;
    visible = true;
    readColors();
    mode = 'idle';
    reset();
    wrap.parentElement.classList.remove('hidden');
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(frame);
    requestAnimationFrame(() => wrap.focus());
  }

  function hide() {
    visible = false;
    if (wrap) wrap.parentElement.classList.add('hidden');
  }

  return { mount, show, hide };
})();
