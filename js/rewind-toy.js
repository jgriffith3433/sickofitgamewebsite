// Rewind toy: a tiny dependency-free bullet-dodger. Drag (relative, so a finger never covers the hero) or arrows/WASD.
// Every fixed step is written into a ring buffer (last ~5 s); hold Rewind or R to play it backwards.
// First-second hint, dodge counter, and a payoff card after ~15 s / 3 hits / a real rewind. Runs rAF only while the
// arena is on screen and the tab is visible.
//
// Reusable module: SickOfItToy.mount(box, opts) -> toy | null (no canvas). The toy has state(), reset(), teardown(),
// and a load-progress mode (opts.progress or toy.setProgress(0-100) / showPlay() / onPlay(fn)) so the same toy can run
// as the Game page's loading screen: a thin bar fills along the ledge, then a Play button appears; no payoff card there.
// The landing hero mounts it below (data-rewind-toy) and publishes it as window.sickofitToy, exactly as before.
// Prefers-reduced-motion or no canvas on the hero: leave the looping clip instead.
(function () {
  function mount(box, opts) {
  opts = opts || {};
  var cleanups = [], tornDown = false;
  function on(t, type, fn, o) { t.addEventListener(type, fn, o); cleanups.push(function () { t.removeEventListener(type, fn, o); }); }
  var cv = document.createElement('canvas');
  var ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return null;

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
  var loader = !!opts.progress, loadPct = 0, playFn = null;
  var hint = 1, moved = false, payoff = false, payoffReason = '', payoffDelay = 0;
  // Near-miss dodge radius; gem is a second verb (touch a diamond from the village sack).
  var NEAR = HERO_R + 18;
  var gem = { x: 0, y: 0, vx: 0, vy: 0, on: false, next: 3.2 };
  var embers = [];
  for (var ei = 0; ei < 14; ei++) embers.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2, sp: 0.15 + Math.random() * 0.35 });

  var img = new Image();
  img.src = opts.sprite || box.getAttribute('data-sprite') || 'blog/lore/img/hero.webp';

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
  // Resolves to a decoded AudioBuffer, or null when the clip is missing, an HTML fallback page, or undecodable: never rejects.
  function loadClip(url) {
    return fetch(url).then(function (r) {
      var type = (r.headers.get('content-type') || '').toLowerCase();
      if (!r.ok || type.indexOf('text/') === 0) return null;
      return r.arrayBuffer().then(function (b) { return b.byteLength ? actx.decodeAudioData(b) : null; });
    }).catch(function () { return null; });
  }
  function loadPayoffVo() {
    if (payoffLoading || payoffBuf || !actx) return;
    payoffLoading = true;
    loadClip(opts.payoffVo || box.getAttribute('data-payoff-vo') || 'sounds/toy-payoff.wav').then(function (d) { payoffBuf = d; payoffLoading = false; });
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
    if (payoff || loader) return;
    payoff = true;
    payoffReason = reason;
    holdBtn = false; holdKey = false;
    setRewinding(false);
    card.hidden = false;
    sayPayoff();
  }

  function resetToy(keepMoved) {
    head = 0; filled = 0;
    bn = 0; time = 0; acc = 0; spawnA = 0; spawnB = 2; spawnC = 4; spin = 0;
    hits = 0; dodges = 0; gems = 0; steps = 0; rewound = 0; rewindFrames = 0; holdRewound = 0;
    meter = 1; rewinding = false; holdBtn = false; holdKey = false; racc = 0;
    hero.x = W / 2; hero.y = H * 0.72; hero.flash = 0; hero.grace = 0;
    gem.on = false; gem.next = 2.5;
    payoff = false; payoffReason = ''; payoffDelay = 0; card.hidden = true;
    if (!keepMoved) moved = false;
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
    if (payoffDelay > 0) {
      payoffDelay -= STEP;
      if (payoffDelay <= 0) offerPayoff('rewind');
    }
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
    if (on) { racc = 0; holdRewound = 0; payoffDelay = 0; rewound++; whoosh(true); }
    else {
      whoosh(false);
      if (holdRewound >= 20) payoffDelay = 1.4;
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

    if (loader && loadPct < 100) {
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, H - 6, W, 6);
      ctx.fillStyle = '#ff9d2e'; ctx.fillRect(0, H - 6, W * loadPct / 100, 6);
      ctx.font = '800 12px Arial,sans-serif';
      var lt = 'Descending ' + Math.round(loadPct) + '%', ltw = ctx.measureText(lt).width;
      ctx.fillStyle = 'rgba(10,4,5,.72)'; ctx.fillRect((W - ltw) / 2 - 7, 8, ltw + 14, 22);
      ctx.fillStyle = '#ffd9a8'; ctx.fillText(lt, (W - ltw) / 2, 12);
    }
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
  // Bundled reverse whoosh (same bytes as sounds/rewind-whoosh.wav). Decoded on unlock so a site 404 cannot mute rewind.
  var WHOOSH_WAV_B64 = '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';
  function b64ToArrayBuffer(b64) {
    var bin = atob(b64), n = bin.length, u8 = new Uint8Array(n);
    for (var i = 0; i < n; i++) u8[i] = bin.charCodeAt(i);
    return u8.buffer;
  }
  function decodeWav(ab) {
    return new Promise(function (resolve) {
      try {
        var copy = ab.slice ? ab.slice(0) : ab;
        var p = actx.decodeAudioData(copy, function (b) { resolve(b || null); }, function () { resolve(null); });
        if (p && typeof p.then === 'function') p.then(function (b) { resolve(b || null); }, function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }
  // Procedural reverse whoosh when the bundled/file clip is missing or fails to decode.
  function makeWhooshBuf() {
    if (!actx) return null;
    var sr = actx.sampleRate || 22050, dur = 3.5, n = Math.max(1, Math.floor(sr * dur));
    var buf = actx.createBuffer(1, n, sr), ch = buf.getChannelData(0);
    var seed = 0x51c0f17, phase = 0;
    function rnd() { seed = (1103515245 * seed + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var env = t < 0.04 ? t / 0.04 : (t > dur - 0.25 ? Math.max(0, (dur - t) / 0.25) : 1);
      var f0 = 180 + 720 * (t / dur);
      phase += 6.283185307179586 * f0 / sr;
      var flutter = 0.85 + 0.15 * Math.sin(6.283185307179586 * (7 + 3 * t / dur) * t);
      var grit = ((rnd() * 2 - 1) * 0.55 + (rnd() * 2 - 1) * 0.25) * flutter * (0.55 + 0.45 * (t / dur));
      var motor = 0.12 * Math.sin(6.283185307179586 * (48 + 20 * t / dur) * t);
      var tone = Math.sin(phase) * (0.25 + 0.55 * (t / dur)) * 0.35;
      var s = (grit + tone + motor) * env * 0.55;
      ch[i] = s > 1 ? 1 : (s < -1 ? -1 : s);
    }
    return buf;
  }
  function ensureActx() {
    if (actx) {
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      return actx;
    }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      return actx;
    } catch (e) { return null; }
  }
  function unlock() {
    if (unlocked) return;
    unlocked = true; refreshSound();
    try {
      if (!ensureActx()) return;
      // Ready immediately so a hold-R right after the first tap still whooshes.
      wbuf = makeWhooshBuf();
      loading = true;
      // Prefer the bundled WAV (no network); optional file fetch can replace it; never wipe the buffer with null.
      var bundled = null;
      try { bundled = b64ToArrayBuffer(WHOOSH_WAV_B64); } catch (e) { bundled = null; }
      var fromBundle = bundled ? decodeWav(bundled) : Promise.resolve(null);
      fromBundle.then(function (d) {
        if (d) {
          wbuf = d;
          if (rewinding) { if (wsrc) whoosh(false); whoosh(true); }
        }
        return loadClip(opts.whoosh || box.getAttribute('data-whoosh') || 'sounds/rewind-whoosh.wav');
      }).then(function (d) {
        if (d) {
          wbuf = d;
          if (rewinding) { if (wsrc) whoosh(false); whoosh(true); }
        } else if (!wbuf) {
          wbuf = makeWhooshBuf();
          if (rewinding && !wsrc) whoosh(true);
        }
        loading = false;
        loadPayoffVo();
      }).catch(function () {
        if (!wbuf) wbuf = makeWhooshBuf();
        loading = false;
        loadPayoffVo();
      });
    } catch (e) {}
  }
  function whoosh(on) {
    if (on) {
      if (!unlocked || !soundOn || wsrc) return;
      if (!ensureActx()) return;
      if (!wbuf) wbuf = makeWhooshBuf();
      if (!wbuf) return;
      try {
        wsrc = actx.createBufferSource(); wsrc.buffer = wbuf; wsrc.loop = true;
        wgain = actx.createGain(); wgain.gain.value = 0.5;
        wsrc.playbackRate.setValueAtTime(0.8, actx.currentTime);
        wsrc.playbackRate.linearRampToValueAtTime(1.6, actx.currentTime + 3.5);
        wsrc.connect(wgain); wgain.connect(actx.destination); wsrc.start(); whooshes++;
      } catch (e) {
        wsrc = null;
        try {
          if (actx.state === 'suspended') actx.resume();
          wsrc = actx.createBufferSource(); wsrc.buffer = wbuf; wsrc.loop = true;
          wgain = actx.createGain(); wgain.gain.value = 0.5;
          wsrc.playbackRate.setValueAtTime(0.8, actx.currentTime);
          wsrc.playbackRate.linearRampToValueAtTime(1.6, actx.currentTime + 3.5);
          wsrc.connect(wgain); wgain.connect(actx.destination); wsrc.start(); whooshes++;
        } catch (e2) { wsrc = null; }
      }
    } else if (wsrc) {
      try { wgain.gain.setTargetAtTime(0, actx.currentTime, 0.04); wsrc.stop(actx.currentTime + 0.2); } catch (e) {}
      wsrc = null;
    }
  }
  function refreshSound() {
    snd.textContent = !unlocked ? '\uD83D\uDD07 Sound: tap to enable' : soundOn ? '\uD83D\uDD0A Sound on' : '\uD83D\uDD07 Sound off';
    snd.setAttribute('aria-pressed', unlocked && soundOn ? 'true' : 'false');
  }
  on(document, 'pointerdown', unlock, true);
  on(document, 'keydown', unlock, true);

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
  card.querySelector('[data-payoff-again]').addEventListener('click', function () { resetToy(true); });
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
  on(document, 'keydown', key(true));
  on(document, 'keyup', key(false));
  on(window, 'blur', function () { keys = {}; holdKey = false; holdBtn = false; });
  on(document, 'visibilitychange', update);
  on(window, 'resize', size);

  var io = null, ro = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; update(); }, { threshold: 0.1 }); io.observe(box);
  } else { onScreen = true; update(); }
  if (window.ResizeObserver) { ro = new ResizeObserver(size); ro.observe(box); }
  size();

  // Load-progress mode: setProgress(0-100) fills the bar; showPlay() swaps it for a Play button; onPlay(fn) hears the tap.
  var playBtn = document.createElement('button');
  playBtn.type = 'button'; playBtn.hidden = true; playBtn.setAttribute('data-toy-play', '');
  playBtn.textContent = 'PLAY';
  playBtn.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:4;min-width:120px;min-height:52px;padding:6px 22px;border-radius:10px;border:2px solid #ff9d2e;background:#ff6a1a;color:#fff;font:900 20px Arial,sans-serif;letter-spacing:.06em;cursor:pointer';
  box.appendChild(playBtn);
  on(playBtn, 'click', function () { if (playFn) playFn(); });
  var progressSet = false;
  function setProgress(p) {
    loader = true; progressSet = true;
    p = Math.max(0, Math.min(100, Number(p) || 0));
    loadPct = p;
    cv.setAttribute('aria-label', 'Loading the game, ' + Math.round(p) + ' percent. You can dodge while you wait.');
    if (!raf) draw();
  }
  function showPlay() {
    loader = true; loadPct = 100;
    playBtn.hidden = false;
    cv.setAttribute('aria-label', 'The game is ready. Press Play.');
    if (!raf) draw();
  }
  function teardown() {
    if (tornDown) return;
    tornDown = true;
    stopLoop();
    if (io) io.disconnect();
    if (ro) ro.disconnect();
    for (var i = 0; i < cleanups.length; i++) { try { cleanups[i](); } catch (e) {} }
    cleanups = [];
    try { if (wsrc) wsrc.stop(); } catch (e) {}
    wsrc = null;
    if (actx && actx.close) { try { actx.close(); } catch (e) {} }
    actx = null;
    if (cv.parentNode === box) box.removeChild(cv);
    [btn, snd, card, playBtn].forEach(function (n) { if (n && n.parentNode === box) box.removeChild(n); });
    onScreen = false;
  }
  if (loader) cv.setAttribute('aria-label', 'Loading the game. You can dodge while you wait.');

  var api = {
    ring: function () { return { buffer: ring, stride: BSTRIDE, frames: FRAMES, head: head, filled: filled, maxBullets: MAXB }; },
    state: function () {
      return {
        running: !!raf, onScreen: onScreen, x: hero.x, y: hero.y, w: W, h: H, bullets: bn, hits: hits, flash: hero.flash,
        steps: steps, rewinding: rewinding, meter: meter, time: time, rewound: rewound, rewindFrames: rewindFrames,
        soundUnlocked: unlocked, soundOn: soundOn, whooshReady: !!wbuf, whooshes: whooshes, whooshing: !!wsrc, recorded: filled, dpr: dpr,
        dodges: dodges, gems: gems, hint: hint, moved: moved, payoff: payoff, payoffReason: payoffReason, cardHidden: card.hidden,
        progress: loadPct, playShown: !playBtn.hidden, loader: loader, tornDown: tornDown
      };
    },
    reset: resetToy,
    setProgress: setProgress,
    showPlay: showPlay,
    onPlay: function (fn) { playFn = typeof fn === 'function' ? fn : null; },
    teardown: teardown,
    _stop: stopLoop
  };
  return api;
  }

  window.SickOfItToy = { mount: mount };


  // ---- Landing hero: mounts the toy in [data-rewind-toy], or leaves the rewind clip ----
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

  setMode('play');
  var toy = mount(box);
  if (!toy) {
    box.setAttribute('hidden', '');
    setMode('clip');
    return;
  }
  window.sickofitToy = toy;
})();
