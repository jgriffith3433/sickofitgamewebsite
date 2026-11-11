// Playtest contract (v1) for Game/: scenarios `game-start` and `game-fail`.
// Registers window.hawkesPlaytest only when navigator.webdriver or ?playtest= is set, so visitors never get it.
// Spec: hawkesstudio/docs/playtest.md. Measure only — no player-visible change.
(function () {
  var q = new URLSearchParams(location.search);
  var which = q.get('playtest');
  var LANDING_IDS = ['trailer', 'hero', 'toy', 'toy-wrap', 'about', 'descent', 'share'];
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
  var problem = function (severity, message) {
    if (!run) return;
    if (run.problems.some(function (p) { return p.message === message; })) return;
    run.problems.push({ severity: severity, message: message });
    ev('problem', severity + ': ' + message);
  };
  var finish = function (o) {
    if (!run || run.done) return;
    run.done = true;
    run.state.status = o;
    run.seconds = (performance.now() - t0) / 1000;
    ev('finish', o);
  };
  var until = async function (test, ms, what) {
    var s = performance.now();
    while (!test()) {
      if (performance.now() - s > ms) throw new Error('timed out waiting for ' + what);
      await sleep(50);
    }
  };
  var visible = function (el) {
    if (!el || el.hidden) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  var soundState = function () {
    try {
      if (!window.hawkesSound || !window.hawkesSound.state) return null;
      return JSON.parse(window.hawkesSound.state());
    } catch (e) { return null; }
  };
  var audioRunning = function () {
    var s = soundState();
    if (!s || !s.audio || s.audio === 'none') return false;
    return String(s.audio).split(',').indexOf('running') >= 0;
  };
  var tapPromptUp = function () {
    var el = document.getElementById('hawkes-tap');
    return !!(el && !el.classList.contains('gone') && visible(el));
  };
  var realClick = function (el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      var x = r.left + Math.min(r.width, Math.max(1, r.width / 2));
      var y = r.top + Math.min(r.height, Math.max(1, r.height / 2));
      var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: 1 };
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (e) {
      try { el.click(); return true; } catch (e2) { return false; }
    }
  };
  var beat = function (p, note) {
    if (!run) return;
    run.state.progress = p;
    run.moved = performance.now();
    if (note) ev('progress', note);
  };

  // Alias: ?playtest=fail-load runs game-fail (and Game/index.html forces a failed build fetch).
  // smoke → game-start so product playtests named smoke@local find the same contract.
  var resolveId = function (id) {
    if (id === 'fail-load') return 'game-fail';
    if (id === 'smoke') return 'game-start';
    return id;
  };

  var topAt = function (x, y) {
    try {
      var el = document.elementFromPoint(x, y);
      if (!el) return 'none';
      var id = el.id ? ('#' + el.id) : el.tagName.toLowerCase();
      var block = el.closest && el.closest('#guide, #rotate-prompt, #hawkes-tap, #unity-canvas, #fs-button, #version-display, #install-banner');
      if (block && block.id) return '#' + block.id + ' (' + id + ')';
      return id;
    } catch (e) { return 'error'; }
  };
  var overlayBlocksGame = function () {
    var ids = ['guide', 'rotate-prompt', 'hawkes-tap'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el) continue;
      if (el.hidden || (el.classList && el.classList.contains('gone'))) continue;
      if (el.style && el.style.pointerEvents === 'none') continue;
      if (visible(el)) return '#' + ids[i];
    }
    return null;
  };

  async function gameStart() {
    // This scenario clicks Play itself: tell Game/index.html not to dismiss the toy when the build's own contract starts.
    window.hawkesPageClicksPlay = true;
    var guide = document.getElementById('guide');
    var stage = document.getElementById('guide-toy');
    var tapsToGame = 0;
    var secondTap = false;
    var progressLogs = 0;
    var lastProgress = -1;
    var playAt = 0;
    var introFirstFrameSec = null;
    var overlayAfterPlay = null;
    var playBtn = function () {
      return document.querySelector('[data-toy-play]') || document.getElementById('guide-play');
    };

    var onProgress = function (e) {
      var p = typeof e.detail === 'number' ? e.detail : 0;
      if (p !== lastProgress) {
        lastProgress = p;
        progressLogs++;
        ev('hawkes-unity-progress', round(p * 100) + '%');
        // Keep the softlock timer alive during the ~33 MB Unity load.
        beat(Math.min(0.45, 0.05 + p * 0.4), 'unity ' + round(p * 100) + '%');
      }
    };
    window.addEventListener('hawkes-unity-progress', onProgress);

    run.state.scene = 'load-toy';
    ev('scene', 'load-toy');
    ev('viewport', window.innerWidth + 'x' + window.innerHeight);
    await sleep(400);

    if (!guide || !visible(guide)) {
      problem('bug', 'load toy (#guide) is not visible on Game/');
    }
    var T = window.sickofitToy;
    if (!T || !stage) {
      problem('bug', 'load toy module did not mount');
    } else {
      ev('load-toy', 'mounted progress=' + round(T.state().progress) + ' running=' + T.state().running);
      // Phone criterion: dodge in the toy within 5 s of opening Game/ (touch drag, no mouse).
      var openAt = performance.now();
      var cv = stage.querySelector('canvas');
      if (cv) {
        var r = cv.getBoundingClientRect();
        var fire = function (type, x, y) {
          cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y }));
        };
        var a = T.state(), sx = r.left + 30, sy = r.top + 30;
        fire('pointerdown', sx, sy);
        for (var i = 1; i <= 16; i++) { fire('pointermove', sx - i * 5, sy + i * 3); await sleep(20); }
        fire('pointerup', sx - 80, sy + 48);
        var b = T.state();
        var dodgeSec = (performance.now() - openAt) / 1000;
        ev('toy-dodge-within-5s', round(dodgeSec) + 's; hero ' + Math.round(a.x) + ',' + Math.round(a.y) + ' -> ' + Math.round(b.x) + ',' + Math.round(b.y));
        run.metrics.toyDodgeSeconds = round(dodgeSec);
        if (dodgeSec > 5) problem('bug', 'first dodge took ' + round(dodgeSec) + 's (over 5)');
        if (Math.abs(b.x - a.x) < 15 && Math.abs(b.y - a.y) < 15) problem('bug', 'touch drag did not move the hero in the load toy');
      } else {
        problem('bug', 'load toy has no canvas');
      }
      // Hold rewind briefly so rewind responds to touch while loading.
      var rb = Array.prototype.slice.call(stage.querySelectorAll('button')).filter(function (btn) { return /Rewind/i.test(btn.textContent || ''); })[0];
      if (rb) {
        rb.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true }));
        await sleep(400);
        ev('toy-rewind-touch', 'rewinding=' + T.state().rewinding);
        rb.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true }));
      }
    }
    // Play must be reachable without dismissing Tap to play first (guide sits above #hawkes-tap).
    var cx = Math.floor(window.innerWidth / 2), cy = Math.floor(window.innerHeight / 2);
    var topBefore = topAt(cx, cy);
    ev('top-at-center-before-play', topBefore);
    if (/#hawkes-tap/.test(topBefore)) {
      problem('bug', 'Tap to play is above the load toy; Play is not the single gesture');
    }
    ev('tap-prompt-dom', tapPromptUp() ? 'hawkes-tap in DOM (should sit under #guide)' : 'no hawkes-tap');

    beat(0.25, 'waiting for Unity ready');
    // Unity is ~33 MB; tick progress while waiting so the run is not stuck.
    var readyWait = performance.now();
    while (!(window.hawkesGuide && window.hawkesGuide.isReady()) && !(playBtn() && !playBtn().hidden)) {
      if (performance.now() - readyWait > 150000) throw new Error('timed out waiting for Unity ready / Play');
      beat(Math.min(0.55, 0.2 + ((performance.now() - readyWait) / 150000) * 0.35), 'waiting Unity');
      await sleep(500);
    }
    ev('unity-ready', 'Play enabled after ' + progressLogs + ' progress events');
    run.metrics.unityProgressEvents = progressLogs;
    beat(0.6, 'ready');
    await sleep(1500);
    ev('scene', 'load-toy-ready');
    run.state.scene = 'load-toy-ready';
    await sleep(1000);

    var play = playBtn();
    if (!play || play.hidden) {
      problem('bug', 'Play button is not ready after Unity load');
      finish('error');
      window.removeEventListener('hawkes-unity-progress', onProgress);
      return;
    }
    var playRect = play.getBoundingClientRect();
    ev('play-thumb-zone', Math.round(playRect.width) + 'x' + Math.round(playRect.height) + ' at y=' + Math.round(playRect.top));
    if (playRect.height < 44 || playRect.width < 44) problem('bug', 'Play is under 44 px');

    // One Play tap only: unlocks audio, dismisses Tap to play, tears down the toy, clears overlays.
    playAt = performance.now();
    realClick(play);
    tapsToGame++;
    ev('tap', 'Play #' + tapsToGame);
    beat(0.7, 'after Play');

    await until(function () {
      return (window.hawkesGuide && window.hawkesGuide.isStarted()) || (guide && guide.hidden) || document.body.classList.contains('hawkes-playing');
    }, 10000, 'load toy to hide after Play');

    run.state.scene = 'after-play';
    ev('scene', 'after-play');
    await sleep(800);

    // Toy must be torn down the moment the game starts (AC3: costs the game nothing).
    var toyAfter = window.sickofitToy;
    var toyState = toyAfter && toyAfter.state ? toyAfter.state() : null;
    ev('toy-after-play', toyState ? ('tornDown=' + toyState.tornDown + ' running=' + toyState.running) : 'null (torn down)');
    run.metrics.toyTornDown = (!toyAfter || (toyState && toyState.tornDown) || (toyState && !toyState.running)) ? 1 : 0;
    if (toyState && !toyState.tornDown && toyState.running) problem('bug', 'load toy still running after Play');
    if (window.hawkesGuide && window.hawkesGuide.toy && window.hawkesGuide.toy()) problem('bug', 'hawkesGuide still holds a live toy after Play');

    // Page spectator must stay closed so the build's own chip owns the count.
    var C = window.hawkesClimbers;
    if (C && C.close && !C.closed()) C.close();
    await sleep(1600);
    ev('climbers-after-play', C ? ('closed=' + (C.closed && C.closed()) + ' connected=' + C.connected()) : 'missing');
    if (C && C.closed && !C.closed()) problem('bug', 'page climbers spectator did not stay closed after Play');
    if (C && C.connected && C.connected()) problem('bug', 'page climbers spectator reconnected after Play');
    run.metrics.climbersClosedAfterPlay = (C && C.closed && C.closed() && !C.connected()) ? 1 : 0;

    overlayAfterPlay = overlayBlocksGame();
    ev('overlay-after-play', overlayAfterPlay ? ('BLOCKING ' + overlayAfterPlay) : 'none blocking');
    ev('top-at-center-after-play', topAt(cx, cy));
    if (overlayAfterPlay) problem('bug', 'overlay blocks the game after Play: ' + overlayAfterPlay);

    // Sample page rAF fps for ~10 s after Play (paired no-toy control is judged on beta against this metric).
    var frames = 0, fpsT0 = performance.now(), fpsRaf = 0;
    await new Promise(function (resolve) {
      var end = fpsT0 + 10000;
      function tick(now) {
        frames++;
        if (now < end) fpsRaf = requestAnimationFrame(tick);
        else resolve();
      }
      fpsRaf = requestAnimationFrame(tick);
    });
    var fps = frames / ((performance.now() - fpsT0) / 1000);
    ev('fps-after-play-10s', round(fps) + ' (toy torn down; beta compares within 2 of a no-toy run)');
    run.metrics.fpsAfterPlay10s = round(fps);

    // Watch for a second Tap to play after Play (should not reappear).
    var watchEnd = performance.now() + 4000;
    while (performance.now() < watchEnd) {
      if (tapPromptUp()) { secondTap = true; break; }
      var midBlock = overlayBlocksGame();
      if (midBlock && !overlayAfterPlay) {
        overlayAfterPlay = midBlock;
        ev('overlay-after-play', 'BLOCKING ' + midBlock + ' (during watch)');
        problem('bug', 'overlay blocks the game after Play: ' + midBlock);
      }
      // First painted frame of the intro: canvas is up, loading bar gone, guide gone.
      if (introFirstFrameSec == null) {
        var bar = document.getElementById('unity-loading-bar');
        var canvas = document.getElementById('unity-canvas');
        var barGone = !bar || bar.style.display === 'none' || !visible(bar);
        if (canvas && visible(canvas) && barGone && (!guide || guide.hidden || document.body.classList.contains('hawkes-playing'))) {
          introFirstFrameSec = (performance.now() - playAt) / 1000;
          ev('intro-first-frame', round(introFirstFrameSec) + 's after Play');
        }
      }
      beat(0.85, 'watching after Play');
      await sleep(200);
    }
    if (introFirstFrameSec == null) {
      introFirstFrameSec = (performance.now() - playAt) / 1000;
      ev('intro-first-frame', round(introFirstFrameSec) + 's after Play (fallback: watch ended)');
    }

    // Portrait then landscape: after Play, neither orientation may leave a blocking overlay.
    ev('orientation-check', 'forcing portrait then landscape probe via resize events');
    var prevW = window.innerWidth, prevH = window.innerHeight;
    try {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('orientationchange'));
      await sleep(400);
      var blockPortrait = overlayBlocksGame();
      ev('overlay-portrait-probe', blockPortrait ? ('BLOCKING ' + blockPortrait) : 'clear ' + prevW + 'x' + prevH);
      if (blockPortrait) problem('bug', 'overlay blocks after Play in current orientation: ' + blockPortrait);
    } catch (e) {
      ev('orientation-check', 'probe skipped: ' + (e && e.message || e));
    }

    var snd = soundState();
    var audioOk = audioRunning();
    ev('taps-to-game', tapsToGame);
    ev('second-tap-to-play', secondTap ? 'YES: Tap to play appeared again after Play' : 'no second Tap to play after Play');
    ev('audio-context', snd ? ('audio=' + snd.audio + ' prompt=' + snd.prompt + ' running=' + audioOk) : 'hawkesSound missing');
    if (tapsToGame !== 1) problem('bug', 'expected exactly 1 tap to reach the game, got ' + tapsToGame);
    if (secondTap) problem('bug', 'Tap to play appeared again after Play');
    run.metrics.tapsToGame = tapsToGame;
    run.metrics.secondTapToPlay = secondTap ? 1 : 0;
    run.metrics.introFirstFrameSeconds = round(introFirstFrameSec);
    run.metrics.audioContextRunning = audioOk ? 1 : 0;
    run.metrics.overlayBlockedAfterPlay = overlayAfterPlay ? 1 : 0;

    window.removeEventListener('hawkes-unity-progress', onProgress);
    beat(1, 'done');
    finish('done');
  }

  async function climbersWatch() {
    var down = /[?&]playtest=net-down\b/.test(location.search);
    var seen = { count: 0, join: 0, leave: 0, offline: 0 }, warns = 0, errs = 0;
    var ow = console.warn, oe = console.error;
    console.warn = function () { warns++; return ow.apply(console, arguments); };
    console.error = function () { errs++; return oe.apply(console, arguments); };
    ['count', 'join', 'leave', 'offline'].forEach(function (k) {
      window.addEventListener('climbers:' + k, function (e) { seen[k]++; ev('climbers:' + k, JSON.stringify(e.detail)); });
    });
    ev('setup-shortcut', down ? 'net-down: lobby treated as unreachable' : 'server up: spectator joins t-lobby');
    await sleep(down ? 6000 : 8000);
    run.metrics.countEvents = seen.count; run.metrics.joinEvents = seen.join; run.metrics.leaveEvents = seen.leave;
    run.metrics.offlineEvents = seen.offline; run.metrics.consoleWarnings = warns; run.metrics.consoleErrors = errs;
    if (down) {
      if (!seen.offline) problem('bug', 'no climbers:offline with the server down');
      if (errs) problem('bug', 'console errors with the server down');
    } else if (!seen.count && !seen.offline) problem('bug', 'no climber count or offline event after 8 s');
    console.warn = ow; console.error = oe;
    finish('done');
  }

  async function gameFail() {
    // The page only simulates a failed fetch when the URL says so (set before the loader runs).
    if (!/[?&]playtest=(fail-load|game-fail)\b/.test(location.search)) {
      ev('setup-shortcut', 'reload with ?playtest=fail-load');
      location.replace(location.pathname + '?playtest=fail-load' + location.hash);
      return;
    }
    run.state.scene = 'failure';
    ev('scene', 'failure');
    ev('viewport', window.innerWidth + 'x' + window.innerHeight);
    ev('setup-shortcut', 'playtest=fail-load forces a missing loader fetch; Retry stays on the running toy');
    await sleep(800);

    var guide = document.getElementById('guide');
    var T = window.sickofitToy;
    if (!guide || !visible(guide)) problem('bug', 'load toy is not visible during forced fail');
    if (!T) problem('bug', 'load toy did not mount for fail-load');

    await until(function () {
      var retry = document.querySelector('[data-toy-retry]');
      return !!(retry && !retry.hidden) || (T && T.state && T.state().retryShown);
    }, 30000, 'Retry on the load toy');

    var retry = document.querySelector('[data-toy-retry]');
    ev('retry-visible', retry && !retry.hidden ? 'Retry on toy' : 'missing');
    if (!retry || retry.hidden) problem('bug', 'forced load failure did not show Retry on the toy');

    // Toy must keep running while Retry is up.
    var s0 = T && T.state ? T.state().steps : 0;
    await sleep(700);
    var s1 = T && T.state ? T.state().steps : 0;
    ev('toy-still-running', 'steps ' + s0 + ' -> ' + s1 + ', running=' + (T && T.state && T.state().running));
    if (!T || !T.state().running || s1 <= s0) problem('bug', 'toy stopped after load failure; Retry should keep the toy running');

    run.metrics.loadFailed = 1;
    run.metrics.retryShown = 1;
    beat(0.9, 'failure + retry on toy');
    await sleep(1500);
    finish('done');
  }

  window.hawkesPlaytest = {
    version: 1,
    product: 'sickofit',
    scenarios: function () {
      return [
        {
          id: 'smoke',
          title: 'Game/: smoke (same as game-start)',
          seconds: 180,
          tags: ['smoke'],
          description: 'Alias of game-start for product playtests named smoke.'
        },
        {
          id: 'game-start',
          title: 'Game/: dodge in the load toy within 5 s, then one Play unlocks audio with no second Tap to play',
          seconds: 180,
          tags: ['smoke'],
          description: 'Touches the load toy within 5 s, waits for Play on the toy above #hawkes-tap, taps Play once, checks tapsToGame=1, secondTapToPlay, overlayBlockedAfterPlay, introFirstFrameSeconds, audioContextRunning.'
        },
        {
          id: 'climbers',
          title: 'Game/: spectator climber count over the lobby socket; with ?playtest=net-down, offline and at most one warning per retry',
          seconds: 30,
          tags: ['full'],
          description: 'Logs climbers:count/join/leave/offline events; run again with ?playtest=net-down.'
        },
        {
          id: 'game-fail',
          title: 'Game/?playtest=fail-load: Retry on the running load toy after a forced fetch failure',
          seconds: 45,
          tags: ['smoke'],
          description: 'Requires ?playtest=fail-load (or game-fail): the toy keeps running and shows Retry.'
        },
        {
          id: 'toy',
          title: 'Rewind toy: drag the hero, bullets fly within a second, a hit flashes, hold R or the button to rewind (meter, whoosh, resume), stops off-screen, no page shift',
          seconds: 25,
          tags: []
        },
        {
          id: 'toy-wrap',
          title: 'Hero toy wrap: hint fades on move, dodge counter, payoff card with PLAY NOW and Try again, PLAY NOW beside toy, no sideways scroll, clip fallback',
          seconds: 35,
          tags: ['full'],
          starts: ['play', 'clip']
        },
        {
          id: 'hero',
          title: 'Landing hero: premise, looping muted rewind clip, Play above the fold; pauses off-screen; no layout shift',
          seconds: 15,
          tags: ['smoke']
        },
        {
          id: 'trailer',
          title: 'Landing page: poster, play click, Watch on YouTube link',
          seconds: 20,
          tags: ['smoke']
        },
        {
          id: 'about',
          title: 'Landing about: click About, FAQ and Credits; story word count, FAQ answers (free, account, phone support), team credits',
          seconds: 15,
          tags: ['smoke']
        },
        {
          id: 'descent',
          title: 'Descent: scroll each floor, counting number, quip, sound toggle plays voice once, no sideways scroll, credits in accordion',
          seconds: 30,
          tags: ['full']
        },
        {
          id: 'share',
          title: 'Share cards: og title and image load; press page offers logo and screenshot downloads that exist',
          seconds: 12,
          tags: []
        },
        {
          id: 'descent-assets',
          title: 'Descent asset pack: layered art, quips, voice and ambience for Shaft + Floors 1000–997',
          seconds: 45,
          tags: ['full']
        }
      ];
    },
    start: async function (id, options) {
      options = options || {};
      if (LANDING_IDS.indexOf(id) >= 0) {
        t0 = performance.now();
        run = {
          id: id, done: false, moved: t0, seconds: 0,
          state: { ready: true, status: 'running', progress: 0.02 },
          metrics: {}, events: [], problems: [], log: []
        };
        ev('start', id);
        var lq = new URLSearchParams(location.search);
        lq.set('playtest', id);
        if (options.at) lq.set('at', String(options.at));
        setTimeout(function () {
          location.replace('../?' + lq.toString() + location.hash);
        }, 20);
        return new Promise(function () {});
      }
      if (id === 'descent-assets') {
        t0 = performance.now();
        run = {
          id: id, done: false, moved: t0, seconds: 0,
          state: { ready: true, status: 'running', progress: 0.02 },
          metrics: {}, events: [], problems: [], log: []
        };
        ev('start', id);
        var dq = new URLSearchParams(location.search);
        dq.set('playtest', 'descent-assets');
        setTimeout(function () {
          location.replace('../data/descent/preview.html?' + dq.toString() + location.hash);
        }, 20);
        return new Promise(function () {});
      }
      id = resolveId(id);
      if (id !== 'game-start' && id !== 'game-fail' && id !== 'climbers') {
        throw new Error('no playtest scenario "' + id + '" (have: smoke, game-start, game-fail, toy, toy-wrap, hero, trailer, about, descent, share, descent-assets)');
      }
      if (run && !run.done && run.id === id) return;
      t0 = performance.now();
      run = {
        id: id, done: false, moved: t0, seconds: 0,
        state: { ready: true, status: 'running', progress: 0 },
        metrics: {}, events: [], problems: [], log: []
      };
      ev('start', id);
      try {
        if (id === 'climbers') await climbersWatch();
        else if (id === 'game-fail') await gameFail();
        else await gameStart();
      } catch (e) {
        problem('bug', 'bot error: ' + (e && e.message || e));
        finish(/timed out/.test(String(e && e.message)) ? 'stuck' : 'error');
      }
    },
    stop: function () { if (run) finish('done'); },
    state: function () {
      var ready = document.readyState !== 'loading' && !!document.getElementById('guide');
      if (!run) {
        var pend = resolveId(which);
        if (pend === 'game-start' || pend === 'game-fail') return { ready: ready, status: 'running', progress: 0.02 };
        return { ready: ready, status: 'idle' };
      }
      return {
        ready: ready,
        status: run.state.status,
        scene: run.state.scene,
        progress: run.state.progress,
        metrics: run.metrics,
        note: run.state.note
      };
    },
    report: function () {
      if (!run) return null;
      return {
        scenario: run.id,
        outcome: run.done ? run.state.status : 'stuck',
        seconds: round(run.seconds || (performance.now() - t0) / 1000),
        metrics: run.metrics,
        events: run.events.slice(),
        problems: run.problems.slice(),
        log: run.log.slice()
      };
    }
  };

  // Auto-start from ?playtest=<id> once the controls card exists (fail-load → game-fail).
  if (LANDING_IDS.indexOf(which) >= 0 || which === 'descent-assets') {
    window.hawkesPlaytest.start(which, { at: q.get('at') || undefined });
    return;
  }
  if (which === 'net-down') which = 'climbers';
  var auto = resolveId(which);
  if (auto === 'game-start' || auto === 'game-fail' || auto === 'climbers') {
    var go = function () {
      if (document.getElementById('guide')) window.hawkesPlaytest.start(auto);
      else setTimeout(go, 100);
    };
    go();
  }
})();
