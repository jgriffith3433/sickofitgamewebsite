// Rewind toy: a tiny dependency-free bullet-dodger for the landing hero. Drag (relative, so a finger never covers the
// hero) or arrows/WASD. Every fixed step is written into a ring buffer (last ~5 s); hold Rewind or R to play it backwards.
// First-second hint, dodge counter, and a payoff card after ~15 s / 3 hits / a real rewind. Runs rAF only while the
// arena is on screen and the tab is visible. Prefers-reduced-motion or no canvas: leave the looping clip instead.
(function () {
  var box = document.querySelector('[data-rewind-toy]');
  var heroEl = document.querySelector('[data-hero]') || (box && box.closest('.hero'));
  var q = new URLSearchParams(location.search);
  var forceClip = q.get('hero') === 'clip' || q.get('at') === 'clip';
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setMode(mode) {
    if (heroEl) heroEl.setAttribute('data-hero-mode', mode);
    document.documentElement.setAttribute('data-hero-mode', mode);
    var v = document.querySelector('[data-hero-loop]');
    if (!v) return;
    if (mode === 'clip') {
      v.removeAttribute('hidden');
      if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      }
    } else {
      v.pause();
    }
  }

  window.sickofitHero = {
    mode: function () { return (heroEl && heroEl.getAttribute('data-hero-mode')) || 'clip'; },
    setMode: function (m) {
      if (m === 'clip') {
        setMode('clip');
        if (box) box.setAttribute('hidden', '');
        if (window.sickofitToy && window.sickofitToy._stop) window.sickofitToy._stop();
      } else if (m === 'play' && box) {
        box.removeAttribute('hidden');
        setMode('play');
      }
    }
  };

  if (!box) {
    setMode('clip');
    return;
  }

  if (rm || forceClip) {
    box.setAttribute('hidden', '');
    setMode('clip');
    return;
  }

  var cv = document.createElement('canvas');
  var ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) {
    box.setAttribute('hidden', '');
    setMode('clip');
    return;
  }

  setMode('play');
  cv.tabIndex = 0;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Mini game: drag or use arrow keys to dodge the bullets with the hero');
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline-offset:2px;border-radius:12px';
  box.appendChild(cv);

  var STEP = 1 / 60, SECONDS = 5, FRAMES = SECONDS * 60, MAXB = 48, HERO_R = 13, FLASH = 0.45, GRACE = 0.9;
  var BSTRIDE = 6 + MAXB * 4;
  var ring = new Float32Array(FRAMES * BSTRIDE), head = 0, filled = 0;

  var W = 0, H = 0, dpr = 1;
  var hero = { x: 0, y: 0, flash: 0, grace: 0 };
  var bx = new Float32Array(MAXB), by = new Float32Array(MAXB), bvx = new Float32Array(MAXB), bvy = new Float32Array(MAXB), bnear = new Uint8Array(MAXB), bn = 0;
  var time = 0, acc = 0, last = 0, spawnA = 0, spawnB = 2, spawnC = 4, spin = 0, hits = 0, steps = 0, dodges = 0, gems = 0;
  var onScreen = false, raf = 0, keys = {}, drag = null;
  var RATE = 1.5, DRAIN = 1 / 3.5, REFILL = 1 / 6;
  var meter = 1, rewinding = false, holdBtn = false, holdKey = false, racc = 0, rewound = 0, rewindFrames = 0, noise = 0;
  var holdRewound = 0;
  var hint = 1, moved = false, payoff = false, payoffReason = '';
  // Near-miss dodge radius; gem is a second verb (touch a diamond from the village sack).
  var NEAR = HERO_R + 18;
  var gem = { x: 0, y: 0, vx: 0, vy: 0, on: false, next: 3.2 };
  var embers = [];
  for (var ei = 0; ei < 14; ei++) embers.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, sp: 0.15 + Math.random() * 0.35 });

  var img = new Image();
  img.src = box.getAttribute('data-sprite') || 'blog/lore/img/hero.webp';

  function size() {
    var r = box.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    var d = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h || (w === W && h === H && d === dpr)) return;
    var first = !W;
    W = w; H = h; dpr = d;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (first) { hero.x = W / 2; hero.y = H * 0.72; }
    hero.x = Math.min(Math.max(hero.x, HERO_R), W - HERO_R);
    hero.y = Math.min(Math.max(hero.y, HERO_R), H - HERO_R);
    draw();
  }

  function fire(x, y, vx, vy) {
    if (bn >= MAXB) return;
    bx[bn] = x; by[bn] = y; bvx[bn] = vx; bvy[bn] = vy; bnear[bn] = 0; bn++;
  }

  function spawn() {
    if (time >= spawnA) {
      var sx = W * (0.15 + 0.7 * ((time * 0.37) % 1)), dx = hero.x - sx, dy = hero.y - 4, d = Math.hypot(dx, dy) || 1;
      fire(sx, 4, dx / d * 130, dy / d * 130);
      spawnA = time + 0.9;
    }
    if (time >= spawnB) {
      var n = 10, o = spin; spin += 0.4;
      for (var i = 0; i < n; i++) { var a = o + i / n * Math.PI * 2; fire(W / 2, H * 0.28, Math.cos(a) * 85, Math.sin(a) * 85); }
      spawnB = time + 3.2;
    }
    if (time >= spawnC) {
      var lane = Math.floor(time * 3) % 2 ? 1 : 0;
      for (var k = 0; k < 4; k++) fire(lane ? W - 6 : 6, H * (0.3 + k * 0.17), lane ? -110 : 110, 0);
      spawnC = time + 2.4;
    }
  }

  function markMoved() {
    if (!moved) moved = true;
  }

  // Optional VO: play sounds/toy-payoff.wav when present (Gen import). Text line stays the beat if the file is missing.
  var payoffBuf = null, payoffLoading = false;
  function loadPayoffVo() {
    if (payoffLoading || payoffBuf || !actx) return;
    payoffLoading = true;
    fetch(box.getAttribute('data-payoff-vo') || 'sounds/toy-payoff.wav').then(function (r) {
      if (!r.ok) throw new Error('no vo');
      return r.arrayBuffer();
    }).then(function (b) {
      return new Promise(function (ok, no) { actx.decodeAudioData(b, ok, no); });
    }).then(function (d) { payoffBuf = d; payoffLoading = false; }, function () { payoffLoading = false; });
  }
  function sayPayoff() {
    if (!unlocked || !soundOn || !actx) return;
    loadPayoffVo();
    if (!payoffBuf) return;
    try {
      var src = actx.createBufferSource(); src.buffer = payoffBuf;
      var g = actx.createGain(); g.gain.value = 0.85;
      src.connect(g); g.connect(actx.destination); src.start();
    } catch (e) {}
  }

  function offerPayoff(reason) {
    if (payoff) return;
    payoff = true;
    payoffReason = reason;
    holdBtn = false; holdKey = false;
    setRewinding(false);
    card.hidden = false;
    sayPayoff();
  }

  function resetToy() {
    head = 0; filled = 0;
    bn = 0; time = 0; acc = 0; spawnA = 0; spawnB = 2; spawnC = 4; spin = 0;
    hits = 0; dodges = 0; gems = 0; steps = 0; rewound = 0; rewindFrames = 0; holdRewound = 0;
    meter = 1; rewinding = false; holdBtn = false; holdKey = false; racc = 0;
    hero.x = W / 2; hero.y = H * 0.72; hero.flash = 0; hero.grace = 0;
    gem.on = false; gem.next = 2.5;
    payoff = false; payoffReason = ''; card.hidden = true;
    hint = moved ? 0 : 1;
    keys = {}; drag = null;
    draw();
  }

  function stepGem() {
    if (!gem.on) {
      if (time >= gem.next) {
        gem.on = true;
        gem.x = W * (0.15 + 0.7 * Math.random());
        gem.y = -8;
        gem.vx = (Math.random() - 0.5) * 40;
        gem.vy = 55 + Math.random() * 35;
      }
      return;
    }
    gem.x += gem.vx * STEP; gem.y += gem.vy * STEP;
    if (Math.hypot(gem.x - hero.x, gem.y - hero.y) < HERO_R + 8) {
      gems++; gem.on = false; gem.next = time + 4 + Math.random() * 3;
      return;
    }
    if (gem.y > H + 12 || gem.x < -12 || gem.x > W + 12) {
      gem.on = false; gem.next = time + 3 + Math.random() * 2;
    }
  }

  function step() {
    var kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) {
      markMoved();
      var m = Math.hypot(kx, ky);
      hero.x += kx / m * 190 * STEP; hero.y += ky / m * 190 * STEP;
      hero.x = Math.min(Math.max(hero.x, HERO_R), W - HERO_R);
      hero.y = Math.min(Math.max(hero.y, HERO_R), H - HERO_R);
    }
    time += STEP; steps++;
    spawn();
    stepGem();
    hero.flash = Math.max(0, hero.flash - STEP);
    hero.grace = Math.max(0, hero.grace - STEP);
    var w = 0;
    for (var i = 0; i < bn; i++) {
      var x = bx[i] + bvx[i] * STEP, y = by[i] + bvy[i] * STEP;
      var dist = Math.hypot(x - hero.x, y - hero.y);
      if (dist < NEAR) bnear[i] = 1;
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) {
        if (bnear[i]) dodges++;
        continue;
      }
      if (!hero.grace && dist < HERO_R * 0.7 + 3) {
        hero.flash = FLASH; hero.grace = GRACE; hits++;
        if (hits >= 3) offerPayoff('hits');
        continue;
      }
      bx[w] = x; by[w] = y; bvx[w] = bvx[i]; bvy[w] = bvy[i]; bnear[w] = bnear[i]; w++;
    }
    bn = w;
    record();
    if (time >= 15) offerPayoff('time');
  }

  function record() {
    var o = head * BSTRIDE;
    ring[o] = time; ring[o + 1] = hero.x; ring[o + 2] = hero.y; ring[o + 3] = hero.flash; ring[o + 4] = bn; ring[o + 5] = hero.grace;
    for (var i = 0; i < bn; i++) { var q = o + 6 + i * 4; ring[q] = bx[i]; ring[q + 1] = by[i]; ring[q + 2] = bvx[i]; ring[q + 3] = bvy[i]; }
    head = (head + 1) % FRAMES;
    if (filled < FRAMES) filled++;
  }

  function restore(f) {
    var o = f * BSTRIDE;
    time = ring[o]; hero.x = ring[o + 1]; hero.y = ring[o + 2]; hero.flash = ring[o + 3]; bn = ring[o + 4]; hero.grace = ring[o + 5];
    for (var i = 0; i < bn; i++) { var q = o + 6 + i * 4; bx[i] = ring[q]; by[i] = ring[q + 1]; bvx[i] = ring[q + 2]; bvy[i] = ring[q + 3]; }
  }

  function back() {
    if (filled < 2) return false;
    head = (head - 1 + FRAMES) % FRAMES; filled--;
    restore((head - 1 + FRAMES) % FRAMES);
    rewindFrames++;
    holdRewound++;
    return true;
  }

  function setRewinding(on) {
    if (on === rewinding) return;
    rewinding = on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('on', on);
    if (on) { racc = 0; holdRewound = 0; rewound++; whoosh(true); }
    else {
      whoosh(false);
      if (holdRewound >= 20) offerPayoff('rewind');
    }
  }

  function tickRewind(dt) {
    if (payoff) {
      if (rewinding) setRewinding(false);
      return;
    }
    var want = (holdBtn || holdKey) && meter > 0 && filled > 1;
    if (want && !rewinding) setRewinding(true);
    if (!want && rewinding) setRewinding(false);
    if (rewinding) {
      meter = Math.max(0, meter - DRAIN * dt);
      racc += dt * RATE / STEP;
      while (racc >= 1) { racc -= 1; if (!back()) break; }
      if (meter <= 0 || filled < 2) setRewinding(false);
    } else {
      meter = Math.min(1, meter + REFILL * dt);
    }
    var pct = Math.round(meter * 100);
    fill.style.width = pct + '%';
    btn.disabled = false;
  }

  function drawRewind() {
    ctx.fillStyle = 'rgba(70,150,255,.22)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,10,30,.28)';
    for (var y = (steps % 4); y < H; y += 4) ctx.fillRect(0, y, W, 1.5);
    for (var i = 0; i < 70; i++) {
      noise = (noise * 9301 + 49297 + i * 17) % 233280;
      ctx.fillStyle = 'rgba(200,225,255,' + (0.08 + (noise % 100) / 700) + ')';
      ctx.fillRect(noise % W, (noise * 7) % H, 2 + noise % 14, 1);
    }
    var by0 = (steps * 3) % (H + 40) - 20;
    ctx.fillStyle = 'rgba(160,210,255,.12)'; ctx.fillRect(0, by0, W, 10);
    ctx.font = '900 14px Arial,sans-serif'; ctx.textBaseline = 'top';
    var tw = ctx.measureText('REWIND').width;
    ctx.fillStyle = 'rgba(10,30,60,.8)'; ctx.fillRect(10, 10, tw + 38, 24);
    ctx.fillStyle = '#bfe3ff'; ctx.fillText('\u25C0\u25C0 REWIND', 18, 15);
  }

  function drawHud() {
    ctx.textBaseline = 'top';
    ctx.font = '800 12px Arial,sans-serif';
    var label = 'Dodges ' + dodges;
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,4,5,.72)';
    ctx.fillRect(8, 8, tw + 14, 22);
    ctx.fillStyle = '#f0cdbf';
    ctx.fillText(label, 15, 12);

    if (hint > 0.02) {
      var line1 = 'Drag to dodge.';
      var line2 = 'Hold to rewind.';
      ctx.font = '900 15px Arial,sans-serif';
      var w1 = ctx.measureText(line1).width, w2 = ctx.measureText(line2).width;
      var bw = Math.max(w1, w2) + 28, bh = 48;
      var bx0 = (W - bw) / 2, by1 = H * 0.38;
      ctx.globalAlpha = hint;
      ctx.fillStyle = 'rgba(10,4,5,.78)';
      ctx.fillRect(bx0, by1, bw, bh);
      ctx.strokeStyle = 'rgba(255,120,60,.45)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(bx0 + 0.5, by1 + 0.5, bw - 1, bh - 1);
      ctx.fillStyle = '#fff';
      ctx.fillText(line1, bx0 + (bw - w1) / 2, by1 + 10);
      ctx.fillText(line2, bx0 + (bw - w2) / 2, by1 + 28);
      ctx.globalAlpha = 1;
    }
  }

  var actx = null, wbuf = null, wsrc = null, wgain = null, unlocked = false, soundOn = true, whooshes = 0, loading = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true; refreshSound();
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      if (actx.state === 'suspended') actx.resume();
      loading = true;
      fetch(box.getAttribute('data-whoosh') || 'sounds/rewind-whoosh.wav').then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (ok, no) { actx.decodeAudioData(b, ok, no); }); })
        .then(function (d) { wbuf = d; loading = false; if (rewinding) whoosh(true); loadPayoffVo(); }, function () { loading = false; loadPayoffVo(); });
    } catch (e) {}
  }
  function whoosh(on) {
    if (on) {
      if (!unlocked || !soundOn || !actx || !wbuf || wsrc) return;
      wsrc = actx.createBufferSource(); wsrc.buffer = wbuf;
      wgain = actx.createGain(); wgain.gain.value = 0.5;
      wsrc.playbackRate.setValueAtTime(0.8, actx.currentTime);
      wsrc.playbackRate.linearRampToValueAtTime(1.6, actx.currentTime + 3.5);
      wsrc.connect(wgain); wgain.connect(actx.destination); wsrc.start(); whooshes++;
    } else if (wsrc) {
      try { wgain.gain.setTargetAtTime(0, actx.currentTime, 0.04); wsrc.stop(actx.currentTime + 0.2); } catch (e) {}
      wsrc = null;
    }
  }
  function refreshSound() {
    snd.textContent = !unlocked ? '\uD83D\uDD07 Sound: tap to enable' : soundOn ? '\uD83D\uDD0A Sound on' : '\uD83D\uDD07 Sound off';
    snd.setAttribute('aria-pressed', unlocked && soundOn ? 'true' : 'false');
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);

  var btn = document.createElement('button');
  btn.type = 'button'; btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<span aria-hidden="true">\u25C0\u25C0</span> Rewind<i><b></b></i>';
  btn.style.cssText = 'position:absolute;right:8px;bottom:8px;min-width:112px;min-height:52px;padding:6px 14px;border-radius:10px;border:2px solid #6fb4ff;background:rgba(10,24,48,.82);color:#cfe8ff;font:900 15px Arial,sans-serif;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;-webkit-tap-highlight-color:transparent;z-index:2';
  var bar = btn.querySelector('i'), fill = btn.querySelector('b');
  bar.style.cssText = 'display:block;width:84px;height:5px;border-radius:3px;background:rgba(111,180,255,.25);overflow:hidden';
  fill.style.cssText = 'display:block;height:100%;width:100%;background:#8fd0ff';
  box.appendChild(btn);
  var snd = document.createElement('button');
  snd.type = 'button';
  snd.style.cssText = 'position:absolute;left:8px;bottom:8px;min-height:32px;padding:4px 10px;border-radius:8px;border:1px solid #4a3a36;background:rgba(10,4,5,.7);color:#d9c3ba;font:700 12px Arial,sans-serif;cursor:pointer;z-index:2';
  box.appendChild(snd); refreshSound();
  // Payoff card over the toy only (PLAY NOW beside the toy stays outside this box). Appended last so
  // querySelectorAll('button')[0] stays the Rewind control for the existing toy playtest.
  var card = document.createElement('div');
  card.className = 'toy-payoff';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Try the full game');
  card.innerHTML = '<p class="toy-payoff-line">Now do it for 1,000 floors.</p>' +
    '<div class="toy-payoff-actions">' +
    '<a class="btn small" data-payoff-play href="Game/index.html" data-play="toy-payoff">PLAY NOW</a>' +
    '<button type="button" class="btn ghost small" data-payoff-again>Try again</button>' +
    '</div>';
  box.appendChild(card);
  card.querySelector('[data-payoff-again]').addEventListener('click', function () { resetToy(); });
  snd.addEventListener('click', function () {
    if (!unlocked) { unlock(); return; }
    soundOn = !soundOn; if (!soundOn) whoosh(false); else if (rewinding) whoosh(true);
    refreshSound();
  });
  btn.addEventListener('pointerdown', function (e) { if (payoff) return; e.preventDefault(); holdBtn = true; try { btn.setPointerCapture(e.pointerId); } catch (x) {} });
  function btnUp() { holdBtn = false; }
  btn.addEventListener('pointerup', btnUp); btn.addEventListener('pointercancel', btnUp); btn.addEventListener('lostpointercapture', btnUp);
  btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  btn.addEventListener('keydown', function (e) { if (payoff) return; if (e.key === ' ' || e.key === 'Enter') { holdBtn = true; e.preventDefault(); } });
  btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') holdBtn = false; });

  function drawShaft() {
    // Landing / Shaft taste: ledge, heat glow, drifting embers (no new art)
    var ground = H * 0.82;
    ctx.fillStyle = 'rgba(40,12,8,.55)';
    ctx.fillRect(0, ground, W, H - ground);
    ctx.fillStyle = 'rgba(255,90,30,.12)';
    ctx.fillRect(0, ground - 6, W, 6);
    ctx.strokeStyle = 'rgba(255,140,60,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8, ground); ctx.lineTo(W - 8, ground); ctx.stroke();
    ctx.fillStyle = 'rgba(80,30,18,.4)';
    ctx.fillRect(0, 0, 10, H); ctx.fillRect(W - 10, 0, 10, H);
    ctx.font = '800 11px Arial,sans-serif'; ctx.textBaseline = 'top';
    var fl = 'FLOOR 1000';
    var flw = ctx.measureText(fl).width;
    ctx.fillStyle = 'rgba(255,157,46,.75)';
    ctx.fillText(fl, W - flw - 12, 10);
    for (var e = 0; e < embers.length; e++) {
      var em = embers[e];
      var ex = em.x * W, ey = ((em.y + time * em.sp) % 1) * H;
      ctx.fillStyle = 'rgba(255,' + Math.floor(100 + em.s * 40) + ',40,' + (0.35 + em.s * 0.2) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, em.s, 0, 6.2832); ctx.fill();
    }
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = rewinding ? 'rgba(4,10,24,.65)' : 'rgba(10,4,5,.55)';
    ctx.fillRect(0, 0, W, H);
    if (!rewinding) drawShaft();
    ctx.strokeStyle = 'rgba(255,120,60,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    if (gem.on) {
      ctx.fillStyle = '#5ad0ff'; ctx.beginPath();
      ctx.moveTo(gem.x, gem.y - 6); ctx.lineTo(gem.x + 5, gem.y); ctx.lineTo(gem.x, gem.y + 6); ctx.lineTo(gem.x - 5, gem.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(200,240,255,.8)'; ctx.beginPath(); ctx.arc(gem.x, gem.y, 1.6, 0, 6.2832); ctx.fill();
    }
    for (var i = 0; i < bn; i++) {
      ctx.fillStyle = '#ff9d2e'; ctx.beginPath(); ctx.arc(bx[i], by[i], 4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(bx[i], by[i], 1.8, 0, 6.2832); ctx.fill();
    }
    var blink = hero.grace > 0 && Math.floor(hero.grace * 20) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    var s = HERO_R * 2.4;
    if (img.complete && img.naturalWidth) {
      var sw = img.naturalWidth * 0.4, sh = img.naturalHeight * 0.72;
      ctx.drawImage(img, img.naturalWidth * 0.58, img.naturalHeight * 0.14, sw, sh, hero.x - s / 2, hero.y - s / 2, s, s * sh / sw);
    } else {
      ctx.fillStyle = '#8a7f78'; ctx.beginPath(); ctx.arc(hero.x, hero.y, HERO_R, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (hero.flash > 0) {
      var f = hero.flash / FLASH;
      ctx.fillStyle = 'rgba(255,40,20,' + (0.35 + 0.5 * f) + ')';
      ctx.beginPath(); ctx.arc(hero.x, hero.y, HERO_R * (1.2 + (1 - f) * 0.8), 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + f + ')'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (rewinding) drawRewind();
    drawHud();
  }

  function frame(now) {
    raf = 0;
    if (!onScreen || document.hidden) return;
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now; acc += dt;
    if (moved && hint > 0) hint = Math.max(0, hint - dt * 2.4);
    tickRewind(dt);
    if (!payoff) {
      if (rewinding) acc = 0; else while (acc >= STEP) { step(); acc -= STEP; }
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function update() {
    var go = onScreen && !document.hidden;
    if (go && !raf) { last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(frame); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; holdKey = false; holdBtn = false; setRewinding(false); }
  }

  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    holdKey = false; holdBtn = false; setRewinding(false); whoosh(false);
  }

  cv.addEventListener('pointerdown', function (e) {
    if (payoff) return;
    markMoved();
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cv.style.cursor = 'grabbing'; cv.focus({ preventScroll: true });
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id || payoff) return;
    markMoved();
    hero.x = Math.min(Math.max(hero.x + (e.clientX - drag.px), HERO_R), W - HERO_R);
    hero.y = Math.min(Math.max(hero.y + (e.clientY - drag.py), HERO_R), H - HERO_R);
    drag.px = e.clientX; drag.py = e.clientY;
  });
  function release(e) { if (drag && e.pointerId === drag.id) { drag = null; cv.style.cursor = 'grab'; } }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);

  var map = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  function key(down) {
    return function (e) {
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tg = e.target && e.target.tagName;
        if (tg !== 'INPUT' && tg !== 'TEXTAREA' && tg !== 'SELECT' && (!down || onScreen) && !payoff) holdKey = down;
        return;
      }
      var k = map[e.key];
      if (!k || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (down && !onScreen) return;
      if (payoff) return;
      keys[k] = down;
      if (down && e.key.indexOf('Arrow') === 0 && document.activeElement === cv) e.preventDefault();
    };
  }
  document.addEventListener('keydown', key(true));
  document.addEventListener('keyup', key(false));
  window.addEventListener('blur', function () { keys = {}; holdKey = false; holdBtn = false; });
  document.addEventListener('visibilitychange', update);
  window.addEventListener('resize', size);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; update(); }, { threshold: 0.1 }).observe(box);
  } else { onScreen = true; update(); }
  if (window.ResizeObserver) new ResizeObserver(size).observe(box);
  size();

  window.sickofitToy = {
    ring: function () { return { buffer: ring, stride: BSTRIDE, frames: FRAMES, head: head, filled: filled, maxBullets: MAXB }; },
    state: function () {
      return {
        running: !!raf, onScreen: onScreen, x: hero.x, y: hero.y, w: W, h: H, bullets: bn, hits: hits, flash: hero.flash,
        steps: steps, rewinding: rewinding, meter: meter, time: time, rewound: rewound, rewindFrames: rewindFrames,
        soundUnlocked: unlocked, soundOn: soundOn, whooshes: whooshes, whooshing: !!wsrc, recorded: filled, dpr: dpr,
        dodges: dodges, gems: gems, hint: hint, moved: moved, payoff: payoff, payoffReason: payoffReason, cardHidden: card.hidden
      };
    },
    reset: resetToy,
    _stop: stopLoop
  };
})();
