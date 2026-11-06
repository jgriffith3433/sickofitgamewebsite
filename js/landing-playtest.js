// Playtest contract (v1) for the landing page: the "trailer", "hero" and "about" scenarios. Loaded only when the URL has
// ?playtest=trailer, hero or about, so visitors never run it. Spec: hawkesstudio/docs/playtest.md. The Unity game's own
// scenarios live on Game/ (index.html sends every other ?playtest there).
(function () {
  var q = new URLSearchParams(location.search);
  var which = q.get('playtest');
  if (which !== 'trailer' && which !== 'hero' && which !== 'about') return;
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

  // Hero: premise, looping rewind clip and Play above the fold; clip muted, pauses off-screen; no layout shift.
  async function hero() {
    var v = document.querySelector('[data-hero-loop]');
    var play = document.getElementById('start-button');
    var premise = document.querySelector('.hero .premise');
    var shifts = 0, shiftSum = 0;
    try {
      new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) { shifts++; shiftSum += e.value; } }); }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { ev('layout-shift-observer', 'unsupported'); }
    run.state.scene = 'Landing: hero'; ev('scene', 'Landing: hero');
    window.scrollTo(0, 0);
    await sleep(1500);
    var h = window.innerHeight;
    var fold = function (el) { if (!el) return 'MISSING'; var r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < h ? 'visible above fold (top ' + Math.round(r.top) + ' of ' + h + ')' : 'NOT above fold (top ' + Math.round(r.top) + ' of ' + h + ')'; };
    ev('hero-premise', (premise ? premise.textContent.trim() + ' | ' : '') + fold(premise));
    ev('hero-play-button', fold(play));
    ev('hero-clip-above-fold', fold(v));
    if (!premise || fold(premise).indexOf('NOT') === 0 || fold(premise) === 'MISSING') problem('bug', 'premise is not above the fold');
    if (!play || fold(play).indexOf('visible') !== 0) problem('bug', 'Play button is not above the fold');
    if (!v) { problem('bug', 'hero rewind clip is missing'); finish('error'); return; }
    run.state.progress = 0.3;
    var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    ev('hero-clip-state', 'muted=' + v.muted + ' loop=' + v.loop + ' paused=' + v.paused + ' time=' + round(v.currentTime) + ' reducedMotion=' + rm);
    if (!v.muted) problem('bug', 'hero clip is not muted');
    if (!v.loop) problem('bug', 'hero clip does not loop');
    if (!rm) {
      var t1 = v.currentTime; await sleep(1500);
      ev('hero-clip-playing', v.paused ? 'PAUSED on load' : 'advancing ' + round(t1) + ' -> ' + round(v.currentTime));
      if (v.paused || v.currentTime === t1) problem('bug', 'hero clip is not playing above the fold');
    }
    run.state.progress = 0.5;
    // scroll the hero off-screen the way a player does, then check the clip paused
    var far = document.getElementById('trailer') || document.body;
    window.scrollTo(0, far.getBoundingClientRect().top + window.scrollY + 200);
    await sleep(1500);
    ev('hero-scrolled-away', 'scrollY=' + Math.round(window.scrollY) + ' clip paused=' + v.paused);
    if (!v.paused) problem('bug', 'hero clip keeps playing while off-screen');
    window.scrollTo(0, 0);
    await sleep(1500);
    ev('hero-scrolled-back', 'clip paused=' + v.paused);
    if (!rm && v.paused) problem('bug', 'hero clip did not resume on return');
    run.state.progress = 0.8;
    await sleep(1500);
    run.metrics.layoutShifts = shifts; run.metrics.layoutShiftScore = Math.round(shiftSum * 1000) / 1000;
    ev('layout-shift', shifts + ' shifts, score ' + run.metrics.layoutShiftScore);
    if (shiftSum > 0.1) problem('bug', 'layout shift score ' + run.metrics.layoutShiftScore + ' (over 0.1)');
    ev('hero-play-href', play ? play.getAttribute('href') : 'MISSING');
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
    run.metrics.storyWords = n;
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

  window.hawkesPlaytest = {
    version: 1, product: 'sickofit',
    scenarios: function () { return [{ id: 'trailer', title: 'Landing page: poster, play click, Watch on YouTube link', seconds: 20, tags: ['smoke'] },
      { id: 'hero', title: 'Landing hero: premise, looping muted rewind clip, Play above the fold; pauses off-screen; no layout shift', seconds: 15, tags: ['smoke'] },
      { id: 'about', title: 'Landing about: click About, FAQ and Credits; story word count, FAQ answers (free, account, phone support), team credits', seconds: 15, tags: ['smoke'] }]; },
    start: async function (id, options) {
      if (id !== 'trailer' && id !== 'hero' && id !== 'about') throw new Error('no playtest scenario "' + id + '" (have: trailer, hero, about)');
      t0 = performance.now();
      run = { id: id, done: false, moved: t0, seconds: 0, state: { ready: true, status: 'running', progress: 0 }, metrics: {}, events: [], problems: [], log: [] };
      ev('start', id);
      try { await (id === 'hero' ? hero() : id === 'about' ? about() : play()); } catch (e) { problem('bug', 'bot error: ' + (e && e.message || e)); finish(/timed out/.test(String(e && e.message)) ? 'stuck' : 'error'); }
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
  var go = function () { if (document.getElementById('trailer-play')) window.hawkesPlaytest.start(which, {}); else setTimeout(go, 100); };
  go();
})();
