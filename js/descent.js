// Descent section: builds floors from data/descent.json; updates parallax, floor counter and one-shot hero voice on scroll.
(function () {
  var root = document.querySelector('[data-descent]');
  var btn = document.querySelector('[data-descent-sound]');
  if (!root) return;
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var soundOn = false, played = {}, items = [], ambTimer = null;
  var voiceEl = typeof Audio !== 'undefined' ? new Audio() : null;
  var ambEl = typeof Audio !== 'undefined' ? new Audio() : null;
  var audioCtx = null;
  var state = {
    floors: [],
    arrived: [],
    playCounts: {},
    voices: {},
    heroVoice: null,
    soundOn: false,
    soundUnlocked: false,
    currentFloor: null,
    speaking: null
  };
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

  function unlockAudio() {
    if (state.soundUnlocked) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx && !audioCtx) audioCtx = new Ctx();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      if (voiceEl) { voiceEl.preload = 'auto'; voiceEl.volume = 1; }
      if (ambEl) { ambEl.preload = 'auto'; ambEl.volume = 0.4; }
      state.soundUnlocked = true;
    } catch (e) {}
  }

  function stopAudio() {
    if (ambTimer) { clearTimeout(ambTimer); ambTimer = null; }
    try { if (voiceEl) { voiceEl.onended = null; voiceEl.pause(); } } catch (e) {}
    try { if (ambEl) { ambEl.pause(); } } catch (e) {}
    if (state.speaking) {
      items.forEach(function (it) { if (it.f.id === state.speaking) it.sec.dataset.speaking = '0'; });
      state.speaking = null;
    }
  }

  if (btn) {
    btn.addEventListener('pointerdown', unlockAudio);
    btn.addEventListener('click', function () {
      unlockAudio();
      soundOn = !soundOn;
      state.soundOn = soundOn;
      btn.setAttribute('aria-pressed', String(soundOn));
      btn.textContent = soundOn ? 'Sound on' : 'Sound off';
      if (!soundOn) stopAudio();
      else syncAll();
    });
  }

  function play(f, sec) {
    if (!soundOn || !f.voice || played[f.id]) return;
    played[f.id] = true;
    state.playCounts[f.id] = (state.playCounts[f.id] || 0) + 1;
    if (state.arrived.indexOf(f.id) < 0) state.arrived.push(f.id);
    var qEl = sec && sec.querySelector('.d-quip');
    var cap = qEl ? (qEl.dataset.quip || qEl.textContent.replace(/^"|"$/g, '')) : f.quip;
    var rec = {
      voiceId: f.voiceId,
      actor: f.voiceActor || 'player',
      quip: f.quip,
      voiceText: f.voiceText || f.quip,
      caption: cap,
      exactMatch: cap === f.quip && (f.voiceText || f.quip) === f.quip,
      channels: f.voiceChannels || 1,
      duration: f.voiceDuration || 0,
      bytes: f.voiceBytes || 0,
      count: state.playCounts[f.id],
      started: false,
      ended: false
    };
    state.voices[f.id] = rec;
    if (sec) { sec.dataset.voiced = '1'; sec.dataset.speaking = '1'; }
    stopAudio();
    state.speaking = f.id;
    if (sec) sec.dataset.speaking = '1';
    try {
      var v = voiceEl || new Audio();
      v.src = 'data/' + f.voice;
      v.currentTime = 0;
      v.volume = 1;
      var finishVoice = function () {
        if (rec.ended) return;
        rec.ended = true;
        if (sec) sec.dataset.speaking = '0';
        if (state.speaking === f.id) state.speaking = null;
        if (!f.ambience || !soundOn || state.currentFloor !== f.id) return;
        try {
          var s = ambEl || new Audio();
          s.src = 'data/' + f.ambience;
          s.currentTime = 0;
          s.volume = 0.4;
          var sp = s.play();
          if (sp && sp.catch) sp.catch(function () {});
          ambTimer = setTimeout(function () { try { s.pause(); } catch (e) {} }, 3500);
        } catch (e) {}
      };
      v.onended = finishVoice;
      var vp = v.play();
      rec.started = true;
      if (vp && vp.catch) vp.catch(function () {});
    } catch (e) {}
  }

  function syncFloor(it) {
    var sec = it.sec, f = it.f, num = it.num, streaks = it.streaks, ls = it.ls;
    var r = sec.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 1;
    if (r.bottom < -40 || r.top > vh + 40) return;
    var p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
    if (!still) {
      ls.forEach(function (l) { l.style.transform = 'translate3d(0,' + ((0.5 - p) * l.dataset.parallax * 160).toFixed(1) + 'px,0)'; });
      // Numbered floors always show the caption's floor (label and big number agree when the quip plays).
      // Shaft alone counts down through the fall (1001→1010 band) before Floor 1000.
      var n = f.floor != null
        ? f.floor
        : Math.round(1001 + (1 - Math.min(1, p * 2.5)) * 9);
      num.textContent = fmt(n);
      var drop = Math.max(0, 1 - p * 6);
      streaks.style.opacity = drop.toFixed(2);
      streaks.style.backgroundPositionY = (p * 1600) + 'px';
      sec.dataset.progress = p.toFixed(2);
    } else {
      sec.dataset.progress = p.toFixed(2);
    }
    if (r.top <= vh * 0.35 && r.bottom >= vh * 0.35) {
      state.currentFloor = f.id;
      play(f, sec);
    }
  }

  function syncAll() {
    for (var i = 0; i < items.length; i++) syncFloor(items[i]);
  }

  fetch('data/descent.json').then(function (r) { return r.json(); }).then(function (d) {
    state.heroVoice = d.heroVoice || null;
    state.captionOnly = d.captionOnly || [];
    d.floors.forEach(function (f) {
      var sec = document.createElement('div'); sec.className = 'd-floor'; sec.dataset.floor = f.id;
      sec.dataset.voiceId = f.voiceId || '';
      var layers = f.layers.map(function (l) {
        return '<div class="d-layer ' + l.id + '" data-parallax="' + l.parallax + '" style="background-image:url(data/' + l.src + ')"></div>';
      }).join('');
      var escQuip = String(f.quip || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      sec.innerHTML = '<div class="d-stage" role="img" aria-label="' + f.label + ': ' + f.title + '">' + layers +
        '<div class="d-streaks"></div><div class="d-info"><div class="d-num" aria-hidden="true">' + (f.floor || 1010) +
        '</div><div class="d-label">' + f.label + ' · ' + f.title + '</div><p class="d-quip" data-quip="' + escQuip + '">"' + f.quip + '"</p></div></div>';
      root.appendChild(sec);
      state.floors.push(f.id);
      var num = sec.querySelector('.d-num'), streaks = sec.querySelector('.d-streaks'), ls = sec.querySelectorAll('.d-layer');
      if (still) num.textContent = f.floor ? fmt(f.floor) : '1001';
      var it = { sec: sec, f: f, num: num, streaks: streaks, ls: ls };
      items.push(it);
      if ('IntersectionObserver' in window) {
        var th = []; for (var k = 0; k <= 50; k++) th.push(k / 50);
        new IntersectionObserver(function () { syncFloor(it); }, { threshold: th }).observe(sec);
      }
    });
    window.addEventListener('scroll', syncAll, { passive: true });
    window.addEventListener('resize', syncAll, { passive: true });
    syncAll();
  });
})();
