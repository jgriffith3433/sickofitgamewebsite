// Playtest contract (v1) for Game/: scenarios `game-start` and `game-fail`.
// Registers window.hawkesPlaytest only when navigator.webdriver or ?playtest= is set, so visitors never get it.
// Spec: hawkesstudio/docs/playtest.md. Measure only — no player-visible change.
(function () {
  var q = new URLSearchParams(location.search);
  var which = q.get('playtest');
  var playtestOn = false;
  try {
    playtestOn = !!(navigator.webdriver || q.has('playtest') || sessionStorage.getItem('hawkes.playtest'));
  } catch (e) {
    playtestOn = !!(navigator.webdriver || q.has('playtest'));
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
  var resolveId = function (id) {
    if (id === 'fail-load') return 'game-fail';
    return id;
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
    ev('tap-prompt-on-controls', tapPromptUp() ? 'Tap to play is up over the controls card' : 'no Tap to play over controls card');

    // Dismiss Tap to play if the sound prompt is covering the card (real click on its button).
    if (tapPromptUp()) {
      var tapBtn = document.querySelector('#hawkes-tap button') || document.getElementById('hawkes-tap');
      if (realClick(tapBtn)) {
        tapsToGame++;
        ev('tap', 'Tap to play #' + tapsToGame);
      } else if (window.hawkesSound && window.hawkesSound.tap && window.hawkesSound.tap()) {
        tapsToGame++;
        ev('tap', 'Tap to play via hawkesSound.tap #' + tapsToGame);
      }
      await until(function () { return !tapPromptUp(); }, 8000, 'Tap to play to leave');
      await sleep(800);
    }

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

    // One Play tap (the only required press once the card is ready).
    playAt = performance.now();
    realClick(play);
    tapsToGame++;
    ev('tap', 'Play #' + tapsToGame);
    beat(0.7, 'after Play');

    await until(function () {
      return (window.hawkesGuide && window.hawkesGuide.isStarted()) || (guide && guide.hidden);
    }, 10000, 'controls card to hide after Play');

    run.state.scene = 'after-play';
    ev('scene', 'after-play');
    await sleep(2500);

    // Watch for a second Tap to play after Play (should not reappear).
    var watchEnd = performance.now() + 8000;
    while (performance.now() < watchEnd) {
      if (tapPromptUp()) { secondTap = true; break; }
      // First painted frame of the intro: canvas is up, loading bar gone, guide gone.
      if (introFirstFrameSec == null) {
        var bar = document.getElementById('unity-loading-bar');
        var canvas = document.getElementById('unity-canvas');
        var barGone = !bar || bar.style.display === 'none' || !visible(bar);
        if (canvas && visible(canvas) && barGone && (!guide || guide.hidden)) {
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

    var snd = soundState();
    var audioOk = audioRunning();
    ev('taps-to-game', tapsToGame);
    ev('second-tap-to-play', secondTap ? 'YES: Tap to play appeared again after Play' : 'no second Tap to play after Play');
    ev('audio-context', snd ? ('audio=' + snd.audio + ' prompt=' + snd.prompt + ' running=' + audioOk) : 'hawkesSound missing');
    run.metrics.tapsToGame = tapsToGame;
    run.metrics.secondTapToPlay = secondTap ? 1 : 0;
    run.metrics.introFirstFrameSeconds = round(introFirstFrameSec);
    run.metrics.audioContextRunning = audioOk ? 1 : 0;

    // Failure state for the same run: open Game/?playtest=fail-load in a full-page frame (setup shortcut).
    beat(0.85, 'failure frame');
    ev('setup-shortcut', 'iframe Game/?playtest=fail-load for failure state');
    var frame = document.createElement('iframe');
    frame.setAttribute('title', 'playtest fail-load');
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#000';
    var failUrl = new URL('index.html', location.href);
    failUrl.search = '?playtest=fail-load';
    document.body.appendChild(frame);
    frame.src = failUrl.href;
    try {
      await until(function () {
        try {
          var doc = frame.contentDocument;
          if (!doc) return false;
          var warn = doc.getElementById('unity-warning');
          var hasErr = warn && warn.children && warn.children.length > 0;
          var g = doc.getElementById('guide-status');
          var statusFail = g && /fail|error|could not|check your connection/i.test(g.textContent || '');
          return !!(hasErr || statusFail);
        } catch (e) { return false; }
      }, 45000, 'fail-load error UI');
      run.state.scene = 'failure';
      ev('scene', 'failure');
      ev('failure-state', 'fail-load showed an error');
      await sleep(2500);
    } catch (e) {
      problem('warning', 'failure frame: ' + (e && e.message || e));
      run.state.scene = 'failure';
      ev('scene', 'failure');
      await sleep(2000);
    }

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
          id: 'game-start',
          title: 'Game/: controls card, Play once, taps / second Tap to play / intro first frame / AudioContext; then fail-load frame',
          seconds: 180,
          tags: ['smoke'],
          description: 'Waits for #guide, logs hawkes-unity-progress, taps Play once, reports tapsToGame, secondTapToPlay, introFirstFrameSeconds, audioContextRunning. Opens ?playtest=fail-load in a frame for the failure scene.'
        },
        {
          id: 'game-fail',
          title: 'Game/?playtest=fail-load: loader simulates a failed build fetch and shows the error',
          seconds: 45,
          tags: ['smoke'],
          description: 'Requires ?playtest=fail-load (or game-fail): the page loads a missing loader and the scenario photographs the failure banner.'
        }
      ];
    },
    start: async function (id) {
      id = resolveId(id);
      if (id !== 'game-start' && id !== 'game-fail') {
        throw new Error('no playtest scenario "' + id + '" (have: game-start, game-fail; alias fail-load)');
      }
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
      if (!run) return { ready: ready, status: 'idle' };
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
  var auto = resolveId(which);
  if (auto === 'game-start' || auto === 'game-fail') {
    var go = function () {
      if (document.getElementById('guide')) window.hawkesPlaytest.start(auto);
      else setTimeout(go, 100);
    };
    go();
  }
})();
