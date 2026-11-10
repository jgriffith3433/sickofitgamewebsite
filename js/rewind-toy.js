// Rewind toy: a tiny dependency-free bullet-dodger for the landing hero. Drag (relative, so a finger never covers the
// hero) or arrows/WASD. Every fixed step is written into a ring buffer (last ~5 s); hold Rewind or R to play it backwards.
// Runs requestAnimationFrame only while the arena is on screen and the tab is visible.
(function () {
  var box = document.querySelector('[data-rewind-toy]');
  if (!box) return;
  var cv = document.createElement('canvas');
  cv.tabIndex = 0;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', 'Mini game: drag or use arrow keys to dodge the bullets with the hero');
  cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline-offset:2px;border-radius:12px';
  box.appendChild(cv);
  var ctx = cv.getContext('2d');

  var STEP = 1 / 60, SECONDS = 5, FRAMES = SECONDS * 60, MAXB = 48, HERO_R = 13, FLASH = 0.45, GRACE = 0.9;
  // Ring buffer: one fixed slab, nothing allocated while playing. Per frame: t, hero x/y, flash, bullet count, bullets (x, y).
  var BSTRIDE = 6 + MAXB * 4;
  var ring = new Float32Array(FRAMES * BSTRIDE), head = 0, filled = 0;

  var W = 0, H = 0, dpr = 1;
  var hero = { x: 0, y: 0, flash: 0, grace: 0 };
  var bx = new Float32Array(MAXB), by = new Float32Array(MAXB), bvx = new Float32Array(MAXB), bvy = new Float32Array(MAXB), bn = 0;
  var time = 0, acc = 0, last = 0, spawnA = 0, spawnB = 2, spawnC = 4, spin = 0, hits = 0, steps = 0;
  var onScreen = false, raf = 0, keys = {}, drag = null;
  // Rewind: hold the button or R. Plays the ring buffer backwards at 1.5x; the meter drains while held and refills after.
  var RATE = 1.5, DRAIN = 1 / 3.5, REFILL = 1 / 6;
  var meter = 1, rewinding = false, holdBtn = false, holdKey = false, racc = 0, rewound = 0, rewindFrames = 0, noise = 0;

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
    bx[bn] = x; by[bn] = y; bvx[bn] = vx; bvy[bn] = vy; bn++;
  }

  function spawn() {
    // 1) aimed shot from the top, 2) ring burst from the middle, 3) side-to-side rain
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

  function step() {
    var kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) {
      var m = Math.hypot(kx, ky);
      hero.x += kx / m * 190 * STEP; hero.y += ky / m * 190 * STEP;
      hero.x = Math.min(Math.max(hero.x, HERO_R), W - HERO_R);
      hero.y = Math.min(Math.max(hero.y, HERO_R), H - HERO_R);
    }
    time += STEP; steps++;
    spawn();
    hero.flash = Math.max(0, hero.flash - STEP);
    hero.grace = Math.max(0, hero.grace - STEP);
    var w = 0;
    for (var i = 0; i < bn; i++) {
      var x = bx[i] + bvx[i] * STEP, y = by[i] + bvy[i] * STEP;
      if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
      if (!hero.grace && Math.hypot(x - hero.x, y - hero.y) < HERO_R * 0.7 + 3) {
        hero.flash = FLASH; hero.grace = GRACE; hits++;
        continue;
      }
      bx[w] = x; by[w] = y; bvx[w] = bvx[i]; bvy[w] = bvy[i]; w++;
    }
    bn = w;
    record();
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

  // One recorded frame back. The newest frame is the present, so restore the one before it.
  function back() {
    if (filled < 2) return false;
    head = (head - 1 + FRAMES) % FRAMES; filled--;
    restore((head - 1 + FRAMES) % FRAMES);
    rewindFrames++;
    return true;
  }

  function setRewinding(on) {
    if (on === rewinding) return;
    rewinding = on;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('on', on);
    if (on) { racc = 0; rewound++; whoosh(true); } else { whoosh(false); }
  }

  function tickRewind(dt) {
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
    // cold tint, scanlines, noise, REWIND tag: the look of the hero clip
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
        .then(function (d) { wbuf = d; loading = false; if (rewinding) whoosh(true); }, function () { loading = false; });
    } catch (e) {}
  }
  function whoosh(on) {
    if (on) {
      if (!unlocked || !soundOn || !actx || !wbuf || wsrc) return;
      wsrc = actx.createBufferSource(); wsrc.buffer = wbuf;
      wgain = actx.createGain(); wgain.gain.value = 0.5;
      // pitch ramp: the reverse whoosh climbs while the hold lasts
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
  btn.style.cssText = 'position:absolute;right:8px;bottom:8px;min-width:112px;min-height:52px;padding:6px 14px;border-radius:10px;border:2px solid #6fb4ff;background:rgba(10,24,48,.82);color:#cfe8ff;font:900 15px Arial,sans-serif;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;-webkit-tap-highlight-color:transparent';
  var bar = btn.querySelector('i'), fill = btn.querySelector('b');
  bar.style.cssText = 'display:block;width:84px;height:5px;border-radius:3px;background:rgba(111,180,255,.25);overflow:hidden';
  fill.style.cssText = 'display:block;height:100%;width:100%;background:#8fd0ff';
  box.appendChild(btn);
  var snd = document.createElement('button');
  snd.type = 'button';
  snd.style.cssText = 'position:absolute;left:8px;bottom:8px;min-height:32px;padding:4px 10px;border-radius:8px;border:1px solid #4a3a36;background:rgba(10,4,5,.7);color:#d9c3ba;font:700 12px Arial,sans-serif;cursor:pointer';
  box.appendChild(snd); refreshSound();
  snd.addEventListener('click', function () {
    if (!unlocked) { unlock(); return; }
    soundOn = !soundOn; if (!soundOn) whoosh(false); else if (rewinding) whoosh(true);
    refreshSound();
  });
  btn.addEventListener('pointerdown', function (e) { e.preventDefault(); holdBtn = true; try { btn.setPointerCapture(e.pointerId); } catch (x) {} });
  function btnUp() { holdBtn = false; }
  btn.addEventListener('pointerup', btnUp); btn.addEventListener('pointercancel', btnUp); btn.addEventListener('lostpointercapture', btnUp);
  btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { holdBtn = true; e.preventDefault(); } });
  btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') holdBtn = false; });

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = rewinding ? 'rgba(4,10,24,.65)' : 'rgba(10,4,5,.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,120,60,.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    for (var i = 0; i < bn; i++) {
      ctx.fillStyle = '#ff9d2e'; ctx.beginPath(); ctx.arc(bx[i], by[i], 4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(bx[i], by[i], 1.8, 0, 6.2832); ctx.fill();
    }
    var blink = hero.grace > 0 && Math.floor(hero.grace * 20) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1;
    var s = HERO_R * 2.4;
    if (img.complete && img.naturalWidth) {
      // crop to the helmet: the full art is a big gun
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
  }

  function frame(now) {
    raf = 0;
    if (!onScreen || document.hidden) return;
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now; acc += dt;
    tickRewind(dt);
    if (rewinding) acc = 0; else while (acc >= STEP) { step(); acc -= STEP; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function update() {
    var go = onScreen && !document.hidden;
    if (go && !raf) { last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(frame); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; holdKey = false; holdBtn = false; setRewinding(false); }
  }

  // Relative drag: the hero moves by how far the pointer moved, so a finger can sit beside it.
  cv.addEventListener('pointerdown', function (e) {
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cv.style.cursor = 'grabbing'; cv.focus({ preventScroll: true });
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
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
        if (tg !== 'INPUT' && tg !== 'TEXTAREA' && tg !== 'SELECT' && (!down || onScreen)) holdKey = down;
        return;
      }
      var k = map[e.key];
      if (!k || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target && e.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if (down && !onScreen) return;
      keys[k] = down;
      // arrows only steal scrolling while the arena has focus
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

  // Read-only view for the playtest and for the rewind task to come.
  window.sickofitToy = {
    ring: function () { return { buffer: ring, stride: BSTRIDE, frames: FRAMES, head: head, filled: filled, maxBullets: MAXB }; },
    state: function () { return { running: !!raf, onScreen: onScreen, x: hero.x, y: hero.y, w: W, h: H, bullets: bn, hits: hits, flash: hero.flash, steps: steps, rewinding: rewinding, meter: meter, time: time, rewound: rewound, rewindFrames: rewindFrames, soundUnlocked: unlocked, soundOn: soundOn, whooshes: whooshes, whooshing: !!wsrc, recorded: filled, dpr: dpr }; }
  };
})();
