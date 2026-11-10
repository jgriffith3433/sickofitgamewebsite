// Descent section: builds floors from data/descent.json; scroll progress comes from IntersectionObserver, not scroll events.
(function () {
  var root = document.querySelector('[data-descent]');
  var btn = document.querySelector('[data-descent-sound]');
  if (!root) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var soundOn = false, played = {}, state = { floors: [], arrived: [] };
  window.sickofitDescent = state;
  var fmt = function (n) { return String(n); };

  function openHash() {
    var el = location.hash && document.querySelector(location.hash);
    if (el && el.tagName === 'DETAILS') el.open = true;
    else if (el && el.id === 'faq') { var d = el.querySelector('details'); if (d) d.open = true; }
  }
  window.addEventListener('hashchange', openHash); openHash();
  document.querySelectorAll('a[href="#credits"]').forEach(function (a) {
    a.addEventListener('click', function () { var c = document.getElementById('credits'); if (c) c.open = true; });
  });

  btn.addEventListener('click', function () {
    soundOn = !soundOn;
    btn.setAttribute('aria-pressed', soundOn);
    btn.textContent = soundOn ? 'Sound on' : 'Sound off';
  });

  function play(f) {
    if (!soundOn || played[f.id]) return;
    played[f.id] = true;
    try {
      var v = new Audio('data/' + f.voice); v.play().catch(function () {});
      v.addEventListener('ended', function () {
        if (!f.ambience || !soundOn) return;
        var s = new Audio('data/' + f.ambience); s.volume = 0.5; s.play().catch(function () {});
        setTimeout(function () { s.pause(); }, 4000);
      });
      state.arrived.push(f.id);
    } catch (e) {}
  }

  fetch('data/descent.json').then(function (r) { return r.json(); }).then(function (d) {
    d.floors.forEach(function (f, i) {
      var sec = document.createElement('div'); sec.className = 'd-floor'; sec.dataset.floor = f.id;
      var layers = f.layers.map(function (l) {
        return '<div class="d-layer ' + l.id + '" data-parallax="' + l.parallax + '" style="background-image:url(data/' + l.src + ')"></div>';
      }).join('');
      sec.innerHTML = '<div class="d-stage" role="img" aria-label="' + f.label + ': ' + f.title + '">' + layers +
        '<div class="d-streaks"></div><div class="d-info"><div class="d-num" aria-hidden="true">' + (f.floor || 1010) +
        '</div><div class="d-label">' + f.label + ' · ' + f.title + '</div><p class="d-quip">"' + f.quip + '"</p></div></div>';
      root.appendChild(sec);
      state.floors.push(f.id);
      if (still) { sec.querySelector('.d-num').textContent = f.floor ? fmt(f.floor) : '1001'; return; }
      var num = sec.querySelector('.d-num'), streaks = sec.querySelector('.d-streaks'), ls = sec.querySelectorAll('.d-layer');
      var th = []; for (var k = 0; k <= 50; k++) th.push(k / 50);
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1], r = e.boundingClientRect;
        var p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
        if (!e.isIntersecting) return;
        ls.forEach(function (l) { l.style.transform = 'translate3d(0,' + ((0.5 - p) * l.dataset.parallax * 160).toFixed(1) + 'px,0)'; });
        var base = f.floor || 1001, n = Math.round(base + (1 - Math.min(1, p * 2.5)) * (f.floor ? 1 : 9));
        num.textContent = fmt(n);
        var drop = Math.max(0, 1 - p * 6);
        streaks.style.opacity = drop.toFixed(2);
        streaks.style.backgroundPositionY = (p * 1600) + 'px';
        if (e.intersectionRatio > 0.3 && r.top <= innerHeight * 0.3) play(f);
        sec.dataset.progress = p.toFixed(2);
      }, { threshold: th }).observe(sec);
    });
  });
})();
