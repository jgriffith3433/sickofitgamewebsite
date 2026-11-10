// Rewind toy: a tiny dependency-free bullet-dodger for the landing hero. Drag (relative, so a finger never covers the
// hero) or arrows/WASD. Every fixed step is written into a ring buffer (last ~5 s) so a later task can play it backwards.
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
  var BSTRIDE = 5 + MAXB * 2;
  var ring = new Float32Array(FRAMES * BSTRIDE), head = 0, filled = 0;

  var W = 0, H = 0, dpr = 1;
  var hero = { x: 0, y: 0, flash: 0, grace: 0 };
  var bx = new Float32Array(MAXB), by = new Float32Array(MAXB), bvx = new Float32Array(MAXB), bvy = new Float32Array(MAXB), bn = 0;
  var time = 0, acc = 0, last = 0, spawnA = 0, spawnB = 2, spawnC = 4, spin = 0, hits = 0, steps = 0;
  var onScreen = false, raf = 0, keys = {}, drag = null;

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
    ring[o] = time; ring[o + 1] = hero.x; ring[o + 2] = hero.y; ring[o + 3] = hero.flash; ring[o + 4] = bn;
    for (var i = 0; i < bn; i++) { ring[o + 5 + i * 2] = bx[i]; ring[o + 6 + i * 2] = by[i]; }
    head = (head + 1) % FRAMES;
    if (filled < FRAMES) filled++;
  }

  function draw() {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,4,5,.55)';
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
  }

  function frame(now) {
    raf = 0;
    if (!onScreen || document.hidden) return;
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now; acc += dt;
    while (acc >= STEP) { step(); acc -= STEP; }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function update() {
    var go = onScreen && !document.hidden;
    if (go && !raf) { last = performance.now(); acc = 0; size(); raf = requestAnimationFrame(frame); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
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
  window.addEventListener('blur', function () { keys = {}; });
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
    state: function () { return { running: !!raf, onScreen: onScreen, x: hero.x, y: hero.y, w: W, h: H, bullets: bn, hits: hits, flash: hero.flash, steps: steps, recorded: filled, dpr: dpr }; }
  };
})();
