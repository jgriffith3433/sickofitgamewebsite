// Hero presence: the live "N climbing right now" chip and the ghost climbers drifting down behind the hero.
// Driven only by js/climbers.js window events (climbers:count/join/leave/offline): no polling, no network here.
// Ghosts are a few absolutely positioned elements moved with CSS transforms (no layout impact), capped at 8,
// paused while the hero is off-screen or the tab is hidden, and left out entirely with reduced motion (chip only).
(function () {
  var MAX = 8, QUIET = 'Quiet down there. Be the first.';
  var hero = document.querySelector('[data-hero]');
  var chip = document.querySelector('[data-presence]');
  if (!hero || !chip) return;
  var field = hero.querySelector('[data-ghosts]');
  var num = chip.querySelector('[data-presence-num]');
  var txt = chip.querySelector('[data-presence-text]');
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var shown = 0, target = 0, offline = false, raf = 0, ghosts = [], seq = 0, visibleHero = true;

  function render(n) {
    if (offline || target === 0) { num.textContent = ''; txt.textContent = QUIET; }
    else { num.textContent = String(n); txt.textContent = ' climbing right now'; }
  }
  function pulse() {
    chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
  }
  function countTo(n) {
    var from = shown; target = n;
    cancelAnimationFrame(raf);
    if (rm || from === n || n === 0 || offline) { shown = n; render(n); return; }
    var t0 = performance.now(), dur = 600;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      shown = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3)));
      render(shown);
      if (k < 1) raf = requestAnimationFrame(step); else shown = n;
    })(t0);
  }
  function setState(n, off) {
    var changed = n !== target || off !== offline;
    offline = off;
    chip.setAttribute('data-state', off ? 'offline' : n > 0 ? 'live' : 'quiet');
    countTo(n);
    if (changed && !rm) pulse();
    chip.setAttribute('aria-label', off || n === 0 ? QUIET : n + ' climbing right now');
  }

  function travel() { if (field) field.style.setProperty('--travel', Math.round(hero.offsetHeight + 120) + 'px'); }
  function addGhost(id) {
    if (!field || rm || ghosts.length >= MAX) return;
    var el = document.createElement('div');
    el.className = 'ghost'; el.setAttribute('data-ghost', id || ''); el.setAttribute('aria-hidden', 'true');
    var i = seq++, lane = [8, 78, 22, 90, 36, 64, 14, 50][i % MAX];
    el.style.left = lane + '%';
    el.style.setProperty('--dur', (11 + (i * 3) % 7) + 's');
    el.style.setProperty('--delay', (-((i * 5) % 9)) + 's');
    el.style.setProperty('--sway', (i % 2 ? 1 : -1) * (14 + (i % 3) * 8) + 'px');
    el.style.setProperty('--s', (0.8 + (i % 4) * 0.12).toFixed(2));
    el.innerHTML = '<i></i>';
    field.appendChild(el);
    void el.offsetWidth; el.classList.add('in');
    ghosts.push({ id: id, el: el });
  }
  function removeGhost(id) {
    var k = -1;
    for (var i = 0; i < ghosts.length; i++) if (ghosts[i].id === id) { k = i; break; }
    if (k < 0) k = ghosts.length - 1;
    if (k < 0) return;
    var g = ghosts.splice(k, 1)[0];
    g.el.classList.remove('in'); g.el.classList.add('out');
    setTimeout(function () { if (g.el.parentNode) g.el.parentNode.removeChild(g.el); }, 1300);
  }
  function syncGhosts(n) {
    if (rm) return;
    n = Math.min(n, MAX);
    while (ghosts.length < n) addGhost('sync-' + seq);
    while (ghosts.length > n) removeGhost();
  }
  function run() { if (field) field.classList.toggle('paused', !visibleHero || document.visibilityState === 'hidden'); }

  window.addEventListener('climbers:count', function (e) {
    setState(e.detail.count, false);
    syncGhosts(e.detail.count);
  });
  window.addEventListener('climbers:join', function (e) {
    var id = e.detail.id;
    for (var i = 0; i < ghosts.length; i++) if (ghosts[i].id === id) return;
    if (ghosts.length < Math.min(e.detail.count, MAX)) addGhost(id);
  });
  window.addEventListener('climbers:leave', function (e) {
    if (ghosts.length > Math.min(e.detail.count, MAX) || e.detail.count === 0) removeGhost(e.detail.id);
  });
  window.addEventListener('climbers:offline', function () {
    setState(0, true);
    while (ghosts.length) removeGhost();
  });
  window.addEventListener('resize', travel);
  document.addEventListener('visibilitychange', run);
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visibleHero = es[0].isIntersecting; run(); }, { threshold: 0 }).observe(hero);
  travel(); render(0); chip.setAttribute('data-state', 'quiet');

  window.sickofitPresence = {
    state: function () {
      var cs = field ? getComputedStyle(field) : null;
      return { text: (num.textContent + txt.textContent).trim(), count: target, shown: shown, offline: offline, state: chip.getAttribute('data-state'),
        ghosts: ghosts.length, ghostEls: field ? field.querySelectorAll('.ghost:not(.out)').length : 0, paused: field ? field.classList.contains('paused') : false,
        reducedMotion: rm, ghostsDisplay: cs ? cs.display : 'none' };
    }
  };
})();
