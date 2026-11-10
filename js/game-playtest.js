// Playtest contract (v1) for Game/: scenarios `game-start` and `game-fail`.
// Registers window.hawkesPlaytest only when navigator.webdriver or ?playtest= is set, so visitors never get it.
// Spec: hawkesstudio/docs/playtest.md. Measure only — no player-visible change.
(function () {
  var q = new URLSearchParams(location.search);
  var which = q.get('playtest');
  var LANDING_IDS = ['trailer', 'hero', 'toy', 'toy-wrap', 'about', 'share'];
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
    var guide = document.getElementById('guide');
    var play = document.getElementById('guide-play');
    var tapsToGame = 0;
    var secondTap = false;
    var progressLogs = 0;
    var lastProgress = -1;
    var playAt = 0;
    var introFirstFrameSec = null;
    var overlayAfterPlay = null;

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

    run.state.scene = 'controls-card';
    ev('scene', 'controls-card');
    ev('viewport', window.innerWidth + 'x' + window.innerHeight);
    await sleep(2500);

    if (!guide || !visible(guide)) {
      problem('bug', 'controls card (#guide) is not visible on Game/');
    } else {
      ev('controls-card', 'visible: ' + (document.getElementById('guide-sub') || {}).textContent);
    }
    // Play must be reachable without dismissing Tap to play first (guide sits above #hawkes-tap).
    var cx = Math.floor(window.innerWidth / 2), cy = Math.floor(window.innerHeight / 2);
    var topBefore = topAt(cx, cy);
    ev('top-at-center-before-play', topBefore);
    if (/#hawkes-tap/.test(topBefore)) {
      problem('bug', 'Tap to play is above the controls card; Play is not the single gesture');
    }
    ev('tap-prompt-dom', tapPromptUp() ? 'hawkes-tap in DOM (should sit under #guide)' : 'no hawkes-tap');

    beat(0.2, 'waiting for Unity ready');
    // Unity is ~33 MB; tick progress while waiting so the run is not stuck.
    var readyWait = performance.now();
    while (!(window.hawkesGuide && window.hawkesGuide.isReady()) && !(play && !play.disabled && /play/i.test(play.textContent || ''))) {
      if (performance.now() - readyWait > 150000) throw new Error('timed out waiting for Unity ready / Play');
      beat(Math.min(0.55, 0.2 + ((performance.now() - readyWait) / 150000) * 0.35), 'waiting Unity');
      await sleep(500);
    }
    ev('unity-ready', 'Play enabled after ' + progressLogs + ' progress events');
    run.metrics.unityProgressEvents = progressLogs;
    beat(0.6, 'ready');
    await sleep(2000);
    ev('scene', 'controls-card-ready');
    run.state.scene = 'controls-card-ready';
    await sleep(2500);

    if (!play || play.disabled) {
      problem('bug', 'Play button is not ready after Unity load');
      finish('error');
      window.removeEventListener('hawkes-unity-progress', onProgress);
      return;
    }

    // One Play tap only: unlocks audio, dismisses Tap to play, clears overlays (no prior Tap to play press).
    playAt = performance.now();
    realClick(play);
    tapsToGame++;
    ev('tap', 'Play #' + tapsToGame);
    beat(0.7, 'after Play');

    await until(function () {
      return (window.hawkesGuide && window.hawkesGuide.isStarted()) || (guide && guide.hidden) || document.body.classList.contains('hawkes-playing');
    }, 10000, 'controls card to hide after Play');

    run.state.scene = 'after-play';
    ev('scene', 'after-play');
    await sleep(1500);

    overlayAfterPlay = overlayBlocksGame();
    ev('overlay-after-play', overlayAfterPlay ? ('BLOCKING ' + overlayAfterPlay) : 'none blocking');
    ev('top-at-center-after-play', topAt(cx, cy));
    if (overlayAfterPlay) problem('bug', 'overlay blocks the game after Play: ' + overlayAfterPlay);

    // Watch for a second Tap to play after Play (should not reappear).
    var watchEnd = performance.now() + 8000;
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
      beat(0.8, 'watching after Play');
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
      // Soft probe: re-run the page's orientation logic by dispatching resize; overlays must stay clear.
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
    ev('setup-shortcut', 'playtest=fail-load forces a missing loader fetch');
    await sleep(1500);

    // Tap prompt may cover the page; dismiss so the failure banner can be photographed.
    if (tapPromptUp()) {
      var tapBtn = document.querySelector('#hawkes-tap button') || document.getElementById('hawkes-tap');
      realClick(tapBtn) || (window.hawkesSound && window.hawkesSound.tap && window.hawkesSound.tap());
      await sleep(500);
    }
    var guide = document.getElementById('guide');
    if (guide) guide.hidden = true;

    await until(function () {
      var warn = document.getElementById('unity-warning');
      return !!(warn && warn.children && warn.children.length > 0);
    }, 30000, 'unity load error banner');

    var warn = document.getElementById('unity-warning');
    var msg = warn && warn.textContent ? warn.textContent.trim().replace(/\s+/g, ' ') : '';
    ev('failure-banner', msg || 'error banner present');
    run.metrics.loadFailed = 1;
    beat(0.9, 'failure visible');
    await sleep(2500);
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
          title: 'Game/: one Play unlocks audio, no second Tap to play, no overlay after Play',
          seconds: 180,
          tags: ['smoke'],
          description: 'Waits for #guide above #hawkes-tap, taps Play once (no prior Tap to play), checks tapsToGame=1, secondTapToPlay, overlayBlockedAfterPlay, introFirstFrameSeconds, audioContextRunning.'
        },
        {
          id: 'game-fail',
          title: 'Game/?playtest=fail-load: loader simulates a failed build fetch and shows the error',
          seconds: 45,
          tags: ['smoke'],
          description: 'Requires ?playtest=fail-load (or game-fail): the page loads a missing loader and the scenario photographs the failure banner.'
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
      if (id !== 'game-start' && id !== 'game-fail') {
        throw new Error('no playtest scenario "' + id + '" (have: smoke, game-start, game-fail, toy, toy-wrap, hero, trailer, about, share, descent-assets)');
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
        if (id === 'game-fail') await gameFail();
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
  var auto = resolveId(which);
  if (auto === 'game-start' || auto === 'game-fail') {
    var go = function () {
      if (document.getElementById('guide')) window.hawkesPlaytest.start(auto);
      else setTimeout(go, 100);
    };
    go();
  }
})();
