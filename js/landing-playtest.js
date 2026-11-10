// Playtest contract (v1) for the landing page: "trailer", "hero", "toy", "toy-wrap", "about" and "share", plus product
// scenarios ("smoke", "game-start", "game-fail" on Game/ and "descent-assets" on data/descent/preview.html) so Studio
// discovers every scenario on whatever entry page it opens. Loaded only for automation or ?playtest=.
(function () {
  var q = new URLSearchParams(location.search);
  var which = q.get('playtest');
  var LANDING_IDS = ['trailer', 'hero', 'toy', 'toy-wrap', 'about', 'descent', 'share'];
  var GAME_IDS = ['smoke', 'game-start', 'game-fail', 'fail-load'];
  var playtestOn = false;
  try {
    playtestOn = !!(navigator.webdriver || q.has('playtest') || q.has('hawkesPlaytest') || sessionStorage.getItem('hawkes.playtest'));
    if (playtestOn) sessionStorage.setItem('hawkes.playtest', '1');
  } catch (e) {
    playtestOn = !!(navigator.webdriver || q.has('playtest') || q.has('hawkesPlaytest'));
  }
  if (!playtestOn) return;
  var run = null, t0 = 0;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var round = function (n) { return Math.round(n * 10) / 10; };
  var ev = function (type, detail) {
    if (!run) return;
    run.events.push({ t: round((performance.now() - t0) / 1000), type: type, detail: detail === undefined ? undefined : String(detail) });
    run.moved = performance.now();
  };
  var problem = function (severity, message) { run.problems.push({ severity: severity, message: message }); ev('problem', severity + ': ' + message); };
  var finish = function (o) { if (run.done) return; run.done = true; run.state.status = o; run.seconds = (performance.now() - t0) / 1000; ev('finish', o); };
  var until = async function (test, ms, what) {
    var s = performance.now();
    while (!test()) { if (performance.now() - s > ms) throw new Error('timed out waiting for ' + what); await sleep(50); }
  };

  async function play() {
    var box = document.getElementById('trailer-box');
    var btn = document.getElementById('trailer-play');
    run.state.scene = 'Landing: trailer'; ev('scene', 'Landing: trailer');
    box.scrollIntoView({ block: 'center' });
    await sleep(1500);
    run.state.progress = 0.25;
    var poster = (box.style.backgroundImage || '').indexOf('ytimg.com') >= 0;
    var iframes = document.querySelectorAll('#trailer iframe').length;
    ev('trailer-poster', poster ? 'poster image shown' : 'NO poster image');
    ev('trailer-play-button', btn && btn.offsetParent ? 'play button visible' : 'NO play button');
    ev('trailer-iframes-before-click', iframes);
    if (!poster) problem('bug', 'trailer has no poster image on load');
    if (iframes) problem('bug', 'trailer iframe is present before any click');
    var link = document.querySelector('#trailer .watch-yt a[href*="youtube.com/watch"]');
    ev('watch-on-youtube-link', link ? link.textContent.trim() + ' -> ' + link.href : 'MISSING');
    if (!link) problem('bug', 'Watch on YouTube link is missing');
    run.state.progress = 0.5;
    await sleep(1000);
    btn.click(); ev('trailer-click', 'play clicked');
    await until(function () { return document.querySelector('#trailer iframe'); }, 8000, 'trailer iframe');
    var f = document.querySelector('#trailer iframe');
    ev('trailer-loaded', f.src);
    if (f.src.indexOf('youtube-nocookie.com') < 0) problem('bug', 'trailer did not load from youtube-nocookie');
    run.state.progress = 0.9;
    await sleep(3000);
    finish('done');
  }

  // Hero: premise and PLAY NOW above the fold; toy in play mode (or looping clip in clip/reduced-motion); no layout shift.
  async function hero() {
    var v = document.querySelector('[data-hero-loop]');
    var play = document.getElementById('start-button');
    var premise = document.querySelector('.hero .premise');
    var toyBox = document.querySelector('[data-rewind-toy]');
    var shifts = 0, shiftSum = 0;
    try {
      new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) { shifts++; shiftSum += e.value; } }); }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { ev('layout-shift-observer', 'unsupported'); }
    run.state.scene = 'Landing: hero'; ev('scene', 'Landing: hero');
    window.scrollTo(0, 0);
    await sleep(1500);
    var h = window.innerHeight;
    var fold = function (el) { if (!el) return 'MISSING'; var r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < h ? 'visible above fold (top ' + Math.round(r.top) + ' of ' + h + ')' : 'NOT above fold (top ' + Math.round(r.top) + ' of ' + h + ')'; };
    var heroRoot = document.querySelector('[data-hero]');
    var mode = window.sickofitHero ? window.sickofitHero.mode() : (heroRoot && heroRoot.getAttribute('data-hero-mode')) || '';
    var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    ev('hero-mode', mode + ' reducedMotion=' + rm);
    ev('hero-premise', (premise ? premise.textContent.trim() + ' | ' : '') + fold(premise));
    ev('hero-play-button', fold(play));
    if (!premise || fold(premise).indexOf('NOT') === 0 || fold(premise) === 'MISSING') problem('bug', 'premise is not above the fold');
    if (!play || fold(play).indexOf('visible') !== 0) problem('bug', 'Play button is not above the fold');
    if (!v) { problem('bug', 'hero rewind clip is missing'); finish('error'); return; }
    run.state.progress = 0.3;
    ev('hero-clip-state', 'muted=' + v.muted + ' loop=' + v.loop + ' paused=' + v.paused + ' time=' + round(v.currentTime) + ' mode=' + mode);
    if (!v.muted) problem('bug', 'hero clip is not muted');
    if (!v.loop) problem('bug', 'hero clip does not loop');
    if (mode === 'play' && !rm) {
      ev('hero-toy-above-fold', fold(toyBox));
      if (!toyBox || fold(toyBox).indexOf('visible') !== 0) problem('bug', 'rewind toy is not above the fold in play mode');
      if (!window.sickofitToy) problem('bug', 'rewind toy did not boot');
    } else {
      ev('hero-clip-above-fold', fold(v));
      var t1 = v.currentTime; await sleep(1500);
      ev('hero-clip-playing', v.paused ? 'PAUSED on load' : 'advancing ' + round(t1) + ' -> ' + round(v.currentTime));
      if (!rm && (v.paused || v.currentTime === t1)) problem('bug', 'hero clip is not playing above the fold');
    }
    run.state.progress = 0.5;
    var far = document.getElementById('trailer') || document.body;
    window.scrollTo(0, far.getBoundingClientRect().top + window.scrollY + 200);
    await sleep(1500);
    var toyPaused = mode === 'play' && window.sickofitToy ? !window.sickofitToy.state().running : v.paused;
    ev('hero-scrolled-away', 'scrollY=' + Math.round(window.scrollY) + ' clip paused=' + v.paused + ' toy idle=' + toyPaused);
    if (!v.paused) problem('bug', 'hero clip keeps playing while off-screen');
    if (mode === 'play' && window.sickofitToy && window.sickofitToy.state().running) problem('bug', 'toy keeps running while scrolled away');
    window.scrollTo(0, 0);
    await sleep(1500);
    ev('hero-scrolled-back', 'clip paused=' + v.paused + ' mode=' + mode);
    if (mode !== 'play' && !rm && v.paused) problem('bug', 'hero clip did not resume on return');
    if (mode === 'play' && window.sickofitToy && !window.sickofitToy.state().running) problem('bug', 'toy did not resume on return');
    run.state.progress = 0.8;
    await sleep(1500);
    run.metrics.layoutShifts = shifts; run.metrics.layoutShiftScore = Math.round(shiftSum * 1000) / 1000;
    ev('layout-shift', shifts + ' shifts, score ' + run.metrics.layoutShiftScore);
    if (shiftSum > 0.1) problem('bug', 'layout shift score ' + run.metrics.layoutShiftScore + ' (over 0.1)');
    ev('hero-play-href', play ? play.getAttribute('href') : 'MISSING');
    finish('done');
  }

  // Toy: the hero's arena. Drag the hero with real pointer events, see bullets, get hit and flash, scroll away (loop stops).
  async function toy() {
    var box = document.querySelector('[data-rewind-toy]');
    var cv = box && box.querySelector('canvas');
    var T = window.sickofitToy;
    var shifts = 0, shiftSum = 0;
    try {
      new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) { shifts++; shiftSum += e.value; } }); }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { ev('layout-shift-observer', 'unsupported'); }
    run.state.scene = 'Landing: rewind toy'; ev('scene', 'Landing: rewind toy');
    if (!box || !cv || !T) { problem('bug', 'rewind toy is missing'); finish('error'); return; }
    if (T.reset) T.reset();
    window.scrollTo(0, 0);
    var top0 = box.getBoundingClientRect().top;
    box.scrollIntoView({ block: 'center' });
    var s0 = performance.now();
    await until(function () { return T.state().bullets > 0; }, 3000, 'bullets');
    var first = (performance.now() - s0) / 1000;
    ev('toy-first-bullet', round(first) + 's after the toy came into view');
    if (first > 1) problem('bug', 'first bullet took ' + round(first) + 's');
    run.state.progress = 0.25;
    var r = cv.getBoundingClientRect(), a = T.state();
    ev('toy-size', Math.round(r.width) + 'x' + Math.round(r.height) + ' css, canvas ' + cv.width + 'x' + cv.height);
    var fire = function (type, x, y) { cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y })); };
    // relative drag: start away from the hero, finger never over it
    var sx = r.left + 30, sy = r.top + 30;
    fire('pointerdown', sx, sy);
    for (var i = 1; i <= 20; i++) { fire('pointermove', sx - i * 4, sy + i * 2); await sleep(25); }
    fire('pointerup', sx - 80, sy + 40);
    var b = T.state();
    ev('toy-drag', 'hero ' + Math.round(a.x) + ',' + Math.round(a.y) + ' -> ' + Math.round(b.x) + ',' + Math.round(b.y));
    if (Math.abs(b.x - a.x) < 20) problem('bug', 'dragging did not move the hero');
    run.state.progress = 0.4;
    // keys
    var kx = T.state().x;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    await sleep(400);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
    ev('toy-keys', 'd moved hero x ' + Math.round(kx) + ' -> ' + Math.round(T.state().x));
    if (T.state().x - kx < 20) problem('bug', 'keys did not move the hero');
    // wait for a hit (the hero sits still in the bullet stream)
    var h0 = T.state().hits;
    try { await until(function () { return T.state().hits > h0; }, 12000, 'a hit'); } catch (e) { problem('bug', 'the hero was never hit in 12 s'); }
    var f = T.state();
    ev('toy-hit', 'hits ' + f.hits + ', flash ' + round(f.flash));
    if (f.hits > h0 && f.flash <= 0) problem('bug', 'getting hit did not flash the hero');
    run.state.progress = 0.7;
    ev('toy-recorded', f.recorded + ' frames in the ring buffer');
    // rewind: tap first (unlocks sound), hold R, then the on-screen button, with real input events
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
    // Unlock builds a whoosh buffer immediately (file or synth); short beat so AudioContext can resume.
    await sleep(400);
    try { await until(function () { return T.state().soundUnlocked; }, 2000, 'sound unlock'); } catch (e) { problem('bug', 'tap did not unlock toy sound'); }
    var t0r = T.state();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await sleep(1200);
    var t1r = T.state();
    ev('toy-rewind', 'game time ' + round(t0r.time) + 's -> ' + round(t1r.time) + 's, meter ' + round(t0r.meter) + ' -> ' + round(t1r.meter) + ', rewinding=' + t1r.rewinding);
    if (!t1r.rewinding || t1r.time >= t0r.time) problem('bug', 'holding R did not run the toy backwards');
    if (t1r.meter >= t0r.meter) problem('bug', 'rewind meter did not drain');
    ev('toy-rewind-whoosh', 'sound unlocked=' + t1r.soundUnlocked + ', whooshing=' + t1r.whooshing + ', played ' + t1r.whooshes);
    if (t1r.soundOn && t1r.soundUnlocked && !t1r.whooshing && t1r.whooshes < 1) problem('bug', 'no reverse whoosh during rewind after a tap');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', bubbles: true }));
    await sleep(150);
    var t2r = T.state(); await sleep(600); var t3r = T.state();
    ev('toy-rewind-release', 'resumed from game time ' + round(t2r.time) + 's -> ' + round(t3r.time) + 's, meter ' + round(t2r.meter) + ' -> ' + round(t3r.meter));
    if (t3r.rewinding || t3r.time <= t2r.time) problem('bug', 'letting go did not resume forward play');
    if (t3r.meter <= t2r.meter) problem('bug', 'rewind meter did not refill after release');
    var rb = Array.prototype.slice.call(box.querySelectorAll('button')).filter(function (b) { return /Rewind/i.test(b.textContent); })[0];
    var bb = rb ? rb.getBoundingClientRect() : { width: 0, height: 0 };
    ev('toy-rewind-button', Math.round(bb.width) + 'x' + Math.round(bb.height) + ' css');
    if (!rb || bb.height < 48 || bb.width < 48) problem('bug', 'rewind button is under 48 px');
    if (rb) {
      rb.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true }));
      await sleep(500);
      ev('toy-rewind-button-hold', 'rewinding=' + T.state().rewinding);
      if (!T.state().rewinding) problem('bug', 'holding the Rewind button did not rewind');
      rb.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true }));
    }
    await sleep(300);
    window.scrollTo(0, box.getBoundingClientRect().top + window.scrollY + 900);
    await sleep(800);
    var c1 = T.state().steps; await sleep(600);
    var c2 = T.state().steps;
    ev('toy-scrolled-away', 'running=' + T.state().running + ' steps ' + c1 + ' -> ' + c2);
    if (T.state().running || c2 !== c1) problem('bug', 'toy keeps running while scrolled away');
    window.scrollTo(0, 0);
    await sleep(800);
    ev('toy-scrolled-back', 'running=' + T.state().running);
    if (!T.state().running) problem('bug', 'toy did not resume on return');
    run.metrics.layoutShifts = shifts; run.metrics.layoutShiftScore = Math.round(shiftSum * 1000) / 1000;
    ev('layout-shift', shifts + ' shifts, score ' + run.metrics.layoutShiftScore + '; toy top at load ' + Math.round(top0));
    if (shiftSum > 0.1) problem('bug', 'layout shift score ' + run.metrics.layoutShiftScore + ' (over 0.1)');
    finish('done');
  }

  // Toy wrap: first-second hint fades on move, dodge counter, payoff card (PLAY NOW + Try again), PLAY NOW beside the
  // toy, 390 px no sideways scroll, and clip fallback (named start "clip" / setMode) instead of the toy.
  async function toyWrap(opts) {
    opts = opts || {};
    var at = opts.at || q.get('at') || '';
    run.state.scene = 'Landing: toy wrap'; ev('scene', 'Landing: toy wrap');
    window.scrollTo(0, 0);
    await sleep(600);

    if (at === 'clip') {
      if (window.sickofitHero && window.sickofitHero.setMode) window.sickofitHero.setMode('clip');
      await sleep(400);
      var mode = window.sickofitHero ? window.sickofitHero.mode() : '';
      var toyBox = document.querySelector('[data-rewind-toy]');
      var clip = document.querySelector('[data-hero-loop]');
      var toyHidden = !toyBox || toyBox.hasAttribute('hidden') || getComputedStyle(toyBox).display === 'none';
      ev('hero-mode', mode + '; toy hidden=' + toyHidden + '; clip present=' + !!clip);
      if (mode !== 'clip') problem('bug', 'clip start did not set hero mode to clip');
      if (!toyHidden) problem('bug', 'reduced-motion/clip path still shows the toy');
      if (!clip) problem('bug', 'rewind clip is missing in clip mode');
      run.metrics.heroMode = mode;
      finish('done');
      return;
    }

    var box = document.querySelector('[data-rewind-toy]');
    var cv = box && box.querySelector('canvas');
    var T = window.sickofitToy;
    var play = document.getElementById('start-button');
    if (!box || !cv || !T) { problem('bug', 'rewind toy is missing in play mode'); finish('error'); return; }
    if (T.reset) T.reset();
    box.scrollIntoView({ block: 'center' });
    await until(function () { return T.state().running || T.state().bullets > 0; }, 4000, 'toy running');
    var s0 = T.state();
    ev('toy-hint', 'hint=' + round(s0.hint) + ' moved=' + s0.moved);
    if (s0.hint < 0.5 || s0.moved) problem('bug', 'first-second hint is not showing before the visitor moves');
    run.state.progress = 0.15;

    var fold = function (el) {
      if (!el) return 'MISSING';
      var r = el.getBoundingClientRect(), h = window.innerHeight;
      return r.width > 0 && r.top < h && r.bottom > 0 ? 'visible' : 'NOT visible';
    };
    ev('play-beside-toy', fold(play) + '; ' + fold(box));
    if (!play || fold(play) !== 'visible') problem('bug', 'PLAY NOW is not visible beside the toy');
    run.metrics.dodges = s0.dodges;

    var r = cv.getBoundingClientRect();
    var fire = function (type, x, y) { cv.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y })); };
    var sx = r.left + 28, sy = r.top + 28;
    fire('pointerdown', sx, sy);
    for (var i = 1; i <= 16; i++) { fire('pointermove', sx + i * 5, sy - i * 2); await sleep(20); }
    fire('pointerup', sx + 80, sy - 32);
    await sleep(500);
    var s1 = T.state();
    ev('toy-hint-after-move', 'hint=' + round(s1.hint) + ' moved=' + s1.moved + ' dodges=' + s1.dodges);
    if (!s1.moved) problem('bug', 'moving the hero did not mark the visitor as moved');
    try { await until(function () { return T.state().hint < 0.2; }, 2500, 'hint fade'); } catch (e) { problem('bug', 'hint did not fade after move'); }
    ev('toy-hint-faded', 'hint=' + round(T.state().hint));
    run.state.progress = 0.35;

    // Payoff via a successful rewind (faster than waiting 15 s)
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 6, clientY: r.top + 6 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 6, clientY: r.top + 6 }));
    await sleep(700);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await sleep(900);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', bubbles: true }));
    try { await until(function () { return T.state().payoff; }, 4000, 'payoff card'); } catch (e) {
      // stand still for hits as a backup
      try { await until(function () { return T.state().hits >= 3 || T.state().payoff; }, 14000, '3 hits or payoff'); } catch (e2) { problem('bug', 'payoff card never appeared after play'); }
    }
    var s2 = T.state();
    var card = box.querySelector('.toy-payoff');
    var line = card && card.querySelector('.toy-payoff-line');
    var again = card && card.querySelector('[data-payoff-again]');
    var cardPlay = card && card.querySelector('[data-payoff-play]');
    ev('toy-payoff', 'on=' + s2.payoff + ' reason=' + s2.payoffReason + ' line=' + (line ? line.textContent.trim() : 'MISSING'));
    if (!s2.payoff || !card || card.hidden) problem('bug', 'payoff card is not shown after short play');
    if (!line || line.textContent.indexOf('1,000') < 0) problem('bug', 'payoff line is not in the game\'s voice');
    if (!cardPlay || cardPlay.getAttribute('href').indexOf('Game') < 0) problem('bug', 'payoff PLAY NOW does not link to Game/');
    if (!again) problem('bug', 'Try again is missing on the payoff card');
    ev('play-still-beside', fold(play));
    if (fold(play) !== 'visible') problem('bug', 'PLAY NOW beside the toy was covered by the payoff');
    run.state.progress = 0.7;

    again.click();
    await sleep(400);
    ev('toy-try-again', 'payoff=' + T.state().payoff + ' cardHidden=' + T.state().cardHidden);
    if (T.state().payoff || (card && !card.hidden)) problem('bug', 'Try again did not clear the payoff card');

    var overflow = document.documentElement.scrollWidth - window.innerWidth;
    ev('hero-width', 'inner=' + window.innerWidth + ' scrollWidth=' + document.documentElement.scrollWidth + ' overflow=' + overflow);
    run.metrics.horizontalOverflow = overflow;
    if (window.innerWidth <= 400 && overflow > 1) problem('bug', 'hero causes sideways scroll at phone width (' + overflow + 'px)');

    // Criterion 3: switch to the clip fallback the same way reduced-motion / no-canvas does
    if (window.sickofitHero && window.sickofitHero.setMode) window.sickofitHero.setMode('clip');
    await sleep(350);
    var mode2 = window.sickofitHero.mode();
    var toyHidden2 = box.hasAttribute('hidden') || getComputedStyle(box).display === 'none';
    var clip2 = document.querySelector('[data-hero-loop]');
    ev('hero-clip-fallback', mode2 + '; toy hidden=' + toyHidden2 + '; clip opacity=' + (clip2 ? getComputedStyle(clip2).opacity : 'MISSING'));
    if (mode2 !== 'clip' || !toyHidden2) problem('bug', 'clip fallback still shows the toy');
    if (!clip2) problem('bug', 'rewind clip missing after clip fallback');
    run.metrics.heroMode = mode2;
    run.metrics.dodges = T.state ? (window.sickofitToy && window.sickofitToy.state ? window.sickofitToy.state().dodges : s2.dodges) : s2.dodges;
    finish('done');
  }

  // About: click the nav About / FAQ links and the footer Credits link like a player; log the story word count, the FAQ
  // answers (free, account, phone support) and the credits list.
  async function about() {
    var words = function (t) { return (t.trim().match(/\S+/g) || []).length; };
    var visible = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.top < window.innerHeight && r.bottom > 0; };
    var go = async function (sel, id, label) {
      var a = document.querySelector(sel);
      if (!a) { problem('bug', label + ' link is missing'); return null; }
      a.click(); ev('click', label + ' link');
      await sleep(1200);
      var sec = document.getElementById(id);
      ev(id + '-in-view', sec ? (visible(sec) ? 'visible' : 'NOT visible') : 'MISSING');
      if (!sec || !visible(sec)) problem('bug', '#' + id + ' is not on screen after clicking ' + label);
      return sec;
    };
    run.state.scene = 'Landing: about'; ev('scene', 'Landing: about');
    window.scrollTo(0, 0);
    await sleep(1000);
    await go('nav a[href="#about"]', 'about', 'About');
    run.state.progress = 0.35;

    // Payoff via a successful rewind (faster than waiting 15 s)
    cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 6, clientY: r.top + 6 }));
    cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, pointerType: 'mouse', isPrimary: true, bubbles: true, clientX: r.left + 6, clientY: r.top + 6 }));
    await sleep(700);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    await sleep(900);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'r', bubbles: true }));
    try { await until(function () { return T.state().payoff; }, 4000, 'payoff card'); } catch (e) {
      // stand still for hits as a backup
      try { await until(function () { return T.state().hits >= 3 || T.state().payoff; }, 14000, '3 hits or payoff'); } catch (e2) { problem('bug', 'payoff card never appeared after play'); }
    }
    var s2 = T.state();
    var card = box.querySelector('.toy-payoff');
    var line = card && card.querySelector('.toy-payoff-line');
    var again = card && card.querySelector('[data-payoff-again]');
    var cardPlay = card && card.querySelector('[data-payoff-play]');
    ev('toy-payoff', 'on=' + s2.payoff + ' reason=' + s2.payoffReason + ' line=' + (line ? line.textContent.trim() : 'MISSING'));
    if (!s2.payoff || !card || card.hidden) problem('bug', 'payoff card is not shown after short play');
    if (!line || line.textContent.indexOf('1,000') < 0) problem('bug', 'payoff line is not in the game\'s voice');
    if (!cardPlay || cardPlay.getAttribute('href').indexOf('Game') < 0) problem('bug', 'payoff PLAY NOW does not link to Game/');
    if (!again) problem('bug', 'Try again is missing on the payoff card');
    ev('play-still-beside', fold(play));
    if (fold(play) !== 'visible') problem('bug', 'PLAY NOW beside the toy was covered by the payoff');
    run.state.progress = 0.7;

    again.click();
    await sleep(400);
    ev('toy-try-again', 'payoff=' + T.state().payoff + ' cardHidden=' + T.state().cardHidden);
    if (T.state().payoff || (card && !card.hidden)) problem('bug', 'Try again did not clear the payoff card');

    var overflow = document.documentElement.scrollWidth - window.innerWidth;
    ev('hero-width', 'inner=' + window.innerWidth + ' scrollWidth=' + document.documentElement.scrollWidth + ' overflow=' + overflow);
    run.metrics.horizontalOverflow = overflow;
    if (window.innerWidth <= 400 && overflow > 1) problem('bug', 'hero causes sideways scroll at phone width (' + overflow + 'px)');

    // Criterion 3: switch to the clip fallback the same way reduced-motion / no-canvas does
    if (window.sickofitHero && window.sickofitHero.setMode) window.sickofitHero.setMode('clip');
    await sleep(350);
    var mode2 = window.sickofitHero.mode();
    var toyHidden2 = box.hasAttribute('hidden') || getComputedStyle(box).display === 'none';
    var clip2 = document.querySelector('[data-hero-loop]');
    ev('hero-clip-fallback', mode2 + '; toy hidden=' + toyHidden2 + '; clip opacity=' + (clip2 ? getComputedStyle(clip2).opacity : 'MISSING'));
    if (mode2 !== 'clip' || !toyHidden2) problem('bug', 'clip fallback still shows the toy');
    if (!clip2) problem('bug', 'rewind clip missing after clip fallback');
    run.metrics.heroMode = mode2;
    run.metrics.dodges = T.state ? (window.sickofitToy && window.sickofitToy.state ? window.sickofitToy.state().dodges : s2.dodges) : s2.dodges;
    finish('done');
  }

  // About: click the nav About / FAQ links and the footer Credits link like a player; log the story word count, the FAQ
  // answers (free, account, phone support) and the credits list.
  async function about() {
    var words = function (t) { return (t.trim().match(/\S+/g) || []).length; };
    var visible = function (el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.top < window.innerHeight && r.bottom > 0; };
    var go = async function (sel, id, label) {
      var a = document.querySelector(sel);
      if (!a) { problem('bug', label + ' link is missing'); return null; }
      a.click(); ev('click', label + ' link');
      await sleep(1200);
      var sec = document.getElementById(id);
      ev(id + '-in-view', sec ? (visible(sec) ? 'visible' : 'NOT visible') : 'MISSING');
      if (!sec || !visible(sec)) problem('bug', '#' + id + ' is not on screen after clicking ' + label);
      return sec;
    };
    run.state.scene = 'Landing: about'; ev('scene', 'Landing: about');
    window.scrollTo(0, 0);
    await sleep(1000);
    await go('nav a[href="#about"]', 'about', 'About');
    var st = document.querySelector('[data-about-story]');
    var n = st ? words(st.textContent) : 0;
    ev('story-text', st ? st.textContent.trim().replace(/\s+/g, ' ') : 'MISSING');
    ev('story-words', n);
    if (n < 80 || n > 150) problem('bug', 'story section has ' + n + ' words (want 80 to 150)');
    run.state.progress = 0.35;
    var faq = await go('nav a[href="#faq"]', 'faq', 'FAQ');
    var qs = faq ? Array.prototype.slice.call(faq.querySelectorAll('details')) : [];
    var need = { free: /free/i, account: /account/i, phone: /phone support/i };
    Object.keys(need).forEach(function (k) {
      var d = qs.filter(function (x) { return need[k].test(x.textContent); })[0];
      ev('faq-' + k, d ? d.querySelector('summary').textContent.trim() + ' -> ' + d.querySelector('p').textContent.trim() + (d.open ? '' : ' (collapsed)') : 'MISSING');
      if (!d) problem('bug', 'FAQ has no answer about ' + k);
    });
    var phone = qs.filter(function (x) { return need.phone.test(x.textContent); })[0];
    if (phone) {
      var sm = phone.querySelector('summary');
      if (phone.open) { sm.click(); await sleep(300); }
      sm.click(); await sleep(500);
      ev('faq-phone-opened', phone.open ? 'answer shown' : 'answer NOT shown');
      if (!phone.open) problem('bug', 'FAQ answer does not open on click');
    }
    run.state.progress = 0.7;
    var cr = await go('footer a[href="#credits"]', 'credits', 'Credits');
    var items = cr ? Array.prototype.slice.call(cr.querySelectorAll('li')).map(function (li) { return li.textContent.trim().replace(/\s+/g, ' '); }) : [];
    ev('credits-count', items.length);
    items.forEach(function (t) { ev('credit', t); });
    run.metrics.credits = items.length;
    if (!items.length) problem('bug', 'credits list the team: no entries');
    await sleep(1000);
    finish('done');
  }

  // Share: the share-card tags (title, designed image that really loads), then click through to the press page like a
  // player and count the logo and screenshot downloads that really exist.
  async function share() {
    var meta = function (doc, sel) { var m = doc.querySelector(sel); return m ? m.getAttribute('content') : ''; };
    var img = function (src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i.naturalWidth + 'x' + i.naturalHeight); }; i.onerror = function () { res(''); }; i.src = src; }); };
    var local = function (u) { try { return new URL(u).pathname.replace(/^.*\/play\/sickofit\//, ''); } catch (e) { return u; } };
    run.state.scene = 'Landing: share cards'; ev('scene', 'Landing: share cards');
    await sleep(800);
    var title = meta(document, 'meta[property="og:title"]'), image = meta(document, 'meta[property="og:image"]');
    var card = meta(document, 'meta[name="twitter:card"]');
    ev('og-title', title || 'MISSING'); ev('og-image', image || 'MISSING'); ev('twitter-card', card || 'MISSING');
    if (!title) problem('bug', 'no og:title'); if (!image) problem('bug', 'no og:image'); if (card !== 'summary_large_image') problem('bug', 'twitter:card is not summary_large_image');
    var size = image ? await img(local(image)) : '';
    ev('og-image-loads', size || 'FAILED to load'); run.metrics.ogImage = size;
    if (!size) problem('bug', 'the og:image does not load from this site');
    run.state.progress = 0.4;
    var a = document.querySelector('a[href$="press.html"]');
    ev('press-link', a ? a.textContent.trim() + ' -> ' + a.getAttribute('href') : 'MISSING');
    if (!a) { problem('bug', 'no link to the press page on the landing page'); finish('error'); return; }
    a.scrollIntoView({ block: 'center' }); await sleep(800);
    var html = await (await fetch(a.getAttribute('href'))).text();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    ev('press-title', doc.title);
    var dl = Array.prototype.slice.call(doc.querySelectorAll('a[download]')).map(function (x) { return x.getAttribute('href'); });
    var logos = dl.filter(function (h) { return /logo|icon/i.test(h); }), shots = dl.filter(function (h) { return /\.jpg$/i.test(h) && !/share\//.test(h); });
    var zip = dl.filter(function (h) { return /\.zip$/i.test(h); });
    ev('press-downloads', 'logos ' + logos.length + ', screenshots ' + shots.length + ', zip ' + zip.length);
    run.metrics.logos = logos.length; run.metrics.screenshots = shots.length;
    if (!logos.length) problem('bug', 'press page offers no logo download'); if (!shots.length) problem('bug', 'press page offers no screenshot download');
    var bad = 0;
    for (var i = 0; i < dl.length; i++) { var r = await fetch(new URL(dl[i], a.href).href, { method: 'HEAD' }); if (!r.ok) { bad++; problem('bug', 'download ' + dl[i] + ' answers ' + r.status); } }
    ev('press-downloads-reachable', (dl.length - bad) + ' of ' + dl.length);
    ev('share-buttons', doc.querySelectorAll('[data-share] a, [data-share] button').length);
    run.state.progress = 0.9;
    a.click(); ev('click', 'press page link');
    await sleep(1500);
    finish('done');
  }

  // Descent: scroll through each floor with real wheel-sized steps, log the counting number and arrival; screenshots are taken by Studio at 1280x720 and 390x844.
  async function descent() {
    run.state.scene = 'Landing: descent'; ev('scene', 'Landing: descent');
    var btn = document.querySelector('[data-descent-sound]');
    await until(function () { return document.querySelectorAll('.d-floor').length > 0; }, 8000, 'descent floors');
    if (btn) { btn.scrollIntoView({ block: 'center' }); await sleep(400); btn.click(); ev('click', 'sound ' + btn.textContent); }
    var floors = Array.prototype.slice.call(document.querySelectorAll('.d-floor'));
    ev('viewport', innerWidth + 'x' + innerHeight);
    for (var i = 0; i < floors.length; i++) {
      var f = floors[i], top = f.getBoundingClientRect().top + scrollY, h = f.offsetHeight - innerHeight;
      for (var s = 0; s <= 4; s++) {
        window.scrollTo(0, top + h * s / 4); await sleep(450);
        ev('floor-' + f.dataset.floor, 'step ' + s + ' number ' + f.querySelector('.d-num').textContent + ' progress ' + (f.dataset.progress || 'n/a'));
      }
      ev('quip', f.querySelector('.d-quip').textContent);
      run.state.progress = (i + 1) / floors.length;
    }
    ev('arrived-with-voice', (window.sickofitDescent.arrived || []).join(','));
    var over = document.documentElement.scrollWidth > innerWidth;
    ev('sideways-scroll', over ? 'YES' : 'none');
    if (over) problem('bug', 'descent causes sideways scroll');
    run.metrics.floors = floors.length;
    var cr = document.querySelector('footer a[href="#credits"]'); if (cr) { cr.click(); await sleep(800); ev('credits-open', document.getElementById('credits').open); }
    finish('done');
  }

  window.hawkesPlaytest = {
    version: 1, product: 'sickofit',
    scenarios: function () { return [
      { id: 'smoke', title: 'Game/: smoke (same as game-start)', seconds: 180, tags: ['smoke'], description: 'Alias of game-start for product playtests named smoke.' },
      { id: 'game-start', title: 'Game/: one Play unlocks audio, no second Tap to play, no overlay after Play', seconds: 180, tags: ['smoke'], description: 'Waits for #guide above #hawkes-tap, taps Play once (no prior Tap to play), checks tapsToGame=1, secondTapToPlay, overlayBlockedAfterPlay, introFirstFrameSeconds, audioContextRunning.' },
      { id: 'game-fail', title: 'Game/?playtest=fail-load: loader simulates a failed build fetch and shows the error', seconds: 45, tags: ['smoke'], description: 'Requires ?playtest=fail-load (or game-fail): the page loads a missing loader and the scenario photographs the failure banner.' },
      { id: 'toy', title: 'Rewind toy: drag the hero, bullets fly within a second, a hit flashes, hold R or the button to rewind (meter, whoosh, resume), stops off-screen, no page shift', seconds: 25, tags: [] },
      { id: 'toy-wrap', title: 'Hero toy wrap: hint fades on move, dodge counter, payoff card with PLAY NOW and Try again, PLAY NOW beside toy, no sideways scroll, clip fallback', seconds: 35, tags: ['full'], starts: ['play', 'clip'] },
      { id: 'hero', title: 'Landing hero: premise, looping muted rewind clip, Play above the fold; pauses off-screen; no layout shift', seconds: 15, tags: ['smoke'] },
      { id: 'trailer', title: 'Landing page: poster, play click, Watch on YouTube link', seconds: 20, tags: ['smoke'] },
      { id: 'about', title: 'Landing about: click About, FAQ and Credits; story word count, FAQ answers (free, account, phone support), team credits', seconds: 15, tags: ['smoke'] },
      { id: 'descent', title: 'Descent: scroll each floor, counting number, quip, sound toggle plays voice once, no sideways scroll, credits in accordion', seconds: 30, tags: ['full'] },
      { id: 'share', title: 'Share cards: og title and image load; press page offers logo and screenshot downloads that exist', seconds: 12, tags: [] },
      { id: 'descent-assets', title: 'Descent asset pack: layered art, quips, voice and ambience for Shaft + Floors 1000–997', seconds: 45, tags: ['full'] }]; },
    start: async function (id, options) {
      options = options || {};
      if (id === 'fail-load') id = 'game-fail';
      if (GAME_IDS.indexOf(id) >= 0) {
        t0 = performance.now();
        run = { id: id, done: false, moved: t0, seconds: 0, state: { ready: true, status: 'running', progress: 0.02 }, metrics: {}, events: [], problems: [], log: [] };
        ev('start', id);
        var gq = new URLSearchParams(location.search);
        gq.set('playtest', id === 'game-fail' ? 'fail-load' : id);
        setTimeout(function () {
          location.replace('Game/index.html?' + gq.toString() + location.hash);
        }, 20);
        return new Promise(function () {});
      }
      if (id === 'descent-assets') {
        t0 = performance.now();
        run = { id: id, done: false, moved: t0, seconds: 0, state: { ready: true, status: 'running', progress: 0.02 }, metrics: {}, events: [], problems: [], log: [] };
        ev('start', id);
        var dq = new URLSearchParams(location.search);
        dq.set('playtest', 'descent-assets');
        setTimeout(function () {
          location.replace('data/descent/preview.html?' + dq.toString() + location.hash);
        }, 20);
        return new Promise(function () {});
      }
      if (LANDING_IDS.indexOf(id) < 0) throw new Error('no playtest scenario "' + id + '" (have: smoke, game-start, game-fail, trailer, hero, toy, toy-wrap, about, descent, share, descent-assets)');
      var reqAt = String(options.at || q.get('at') || '');
      if (run && !run.done && run.id === id && String(run.at || '') === reqAt) return;
      t0 = performance.now();
      run = { id: id, at: reqAt, done: false, moved: t0, seconds: 0, state: { ready: true, status: 'running', progress: 0 }, metrics: {}, events: [], problems: [], log: [] };
      ev('start', id);
      try {
        if (id === 'hero') await hero();
        else if (id === 'toy') await toy();
        else if (id === 'toy-wrap') await toyWrap(options);
        else if (id === 'about') await about();
        else if (id === 'descent') await descent();
        else if (id === 'share') await share();
        else await play();
      } catch (e) { problem('bug', 'bot error: ' + (e && e.message || e)); finish(/timed out/.test(String(e && e.message)) ? 'stuck' : 'error'); }
    },
    stop: function () { if (run) finish('done'); },
    state: function () {
      var ready = document.readyState !== 'loading' && !!document.getElementById('trailer-play') && !!(window.sickofitToy || window.sickofitHero);
      if (!run) {
        if (LANDING_IDS.indexOf(which) >= 0) return { ready: ready, status: 'running', progress: 0.02 };
        return { ready: ready, status: 'idle' };
      }
      return { ready: ready, status: run.state.status, scene: run.state.scene, progress: run.state.progress, metrics: run.metrics };
    },
    report: function () {
      if (!run) return null;
      return { scenario: run.id, outcome: run.done ? run.state.status : 'stuck', seconds: round(run.seconds || (performance.now() - t0) / 1000),
        metrics: run.metrics, events: run.events.slice(), problems: run.problems.slice(), log: run.log.slice() };
    }
  };
  if (LANDING_IDS.indexOf(which) >= 0) {
    var go = function () {
      if (document.getElementById('trailer-play') && (window.sickofitToy || window.sickofitHero)) {
        window.hawkesPlaytest.start(which, { at: q.get('at') || undefined });
      } else {
        setTimeout(go, 100);
      }
    };
    go();
  }
})();
