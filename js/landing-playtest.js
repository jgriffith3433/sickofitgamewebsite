// Playtest contract (v1) for the landing page: the "trailer" scenario. Loaded only when the URL has
// ?playtest=trailer, so visitors never run it. Spec: hawkesstudio/docs/playtest.md. The Unity game's own
// scenarios live on Game/ (index.html sends every other ?playtest there).
(function () {
  var q = new URLSearchParams(location.search);
  if (q.get('playtest') !== 'trailer') return;
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

  window.hawkesPlaytest = {
    version: 1, product: 'sickofit',
    scenarios: function () { return [{ id: 'trailer', title: 'Landing page: poster, play click, Watch on YouTube link', seconds: 20, tags: ['smoke'] }]; },
    start: async function (id, options) {
      if (id !== 'trailer') throw new Error('no playtest scenario "' + id + '" (have: trailer)');
      t0 = performance.now();
      run = { id: id, done: false, moved: t0, seconds: 0, state: { ready: true, status: 'running', progress: 0 }, metrics: {}, events: [], problems: [], log: [] };
      ev('start', id);
      try { await play(); } catch (e) { problem('bug', 'bot error: ' + (e && e.message || e)); finish(/timed out/.test(String(e && e.message)) ? 'stuck' : 'error'); }
    },
    stop: function () { if (run) finish('done'); },
    state: function () {
      var ready = document.readyState !== 'loading' && !!document.getElementById('trailer-play');
      if (!run) return { ready: ready, status: 'idle' };
      return { ready: ready, status: run.state.status, scene: run.state.scene, progress: run.state.progress, metrics: run.metrics };
    },
    report: function () {
      if (!run) return null;
      return { scenario: run.id, outcome: run.done ? run.state.status : 'stuck', seconds: round(run.seconds || (performance.now() - t0) / 1000),
        metrics: run.metrics, events: run.events.slice(), problems: run.problems.slice(), log: run.log.slice() };
    }
  };
  var go = function () { if (document.getElementById('trailer-play')) window.hawkesPlaytest.start('trailer', {}); else setTimeout(go, 100); };
  go();
})();
