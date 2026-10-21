// Sick Of It lore: "The Descent" (blog/lore.html) and the lore pages under blog/lore/.
// The page scrolls down into Hell like the game's Shaft: a floor counter from 0 (the Meadow) to 1,000, each Circle's
// band with its palette and parallax, the announcer calling each Circle, embers rising thicker the deeper you go and
// a heat edge at the bottom of the screen. Sound only after a tap (the Hawkes rule: never autoplay).
// Reduced motion: no embers, no parallax, no shimmer; the counter and the captions still work.
// Source: sickofitgame-unity Tools/Web/site (installed into the website by the deploy, step 7d). Edit it there.
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var floorEl = doc.querySelector("[data-hell-floor]");
  var hud = doc.querySelector(".hell-hud");
  var caption = doc.querySelector(".hell-caption");
  var bands = Array.prototype.slice.call(doc.querySelectorAll("[data-floor-from]"));
  var backs = Array.prototype.slice.call(doc.querySelectorAll(".band-bg"));
  var footer = doc.querySelector("footer");
  var floor = 0, shown = -1;

  // ── Band art loads when it gets close ──
  function loadBack(el) {
    var src = el.getAttribute("data-bg");
    if (src) { el.style.backgroundImage = "url(" + src + ")"; el.removeAttribute("data-bg"); }
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { loadBack(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "800px 0px" });
    backs.forEach(function (b) { io.observe(b); });
  } else {
    backs.forEach(loadBack);
  }

  // ── Floor counter: where the middle of the screen is in the Shaft ──
  function floorAt() {
    if (!bands.length) return 0;
    var mid = window.innerHeight * 0.5, last = 0;
    for (var i = 0; i < bands.length; i++) {
      var r = bands[i].getBoundingClientRect();
      var from = +bands[i].getAttribute("data-floor-from"), to = +bands[i].getAttribute("data-floor-to");
      if (r.top > mid) return last;
      if (r.bottom >= mid) return Math.round(from + (to - from) * Math.min(1, Math.max(0, (mid - r.top) / r.height)));
      last = to;
    }
    return last;
  }

  // ── The announcer ──
  var called = {}, captionTimer = 0;
  function announce(text) {
    if (!caption || !text) return;
    caption.textContent = text;
    caption.classList.add("is-on");
    clearTimeout(captionTimer);
    captionTimer = setTimeout(function () { caption.classList.remove("is-on"); }, 2200);
  }
  function callBands() {
    var line = window.innerHeight * 0.6;
    bands.forEach(function (b, i) {
      var text = b.getAttribute("data-caption");
      if (!text || called[i]) return;
      var r = b.getAttribute("data-floor-from") && b.getBoundingClientRect();
      if (r && r.top < line && r.bottom > line) { called[i] = true; announce(text); }
    });
  }

  function tick() {
    floor = floorAt();
    if (floor !== shown && floorEl) {
      shown = floor;
      floorEl.textContent = floor.toLocaleString("en-US");
      root.style.setProperty("--depth", (floor / 1000).toFixed(3));
      if (sound && sound.on) sound.depth(floor / 1000);
    }
    callBands();
    if (!still) {
      for (var i = 0; i < backs.length; i++) {
        var r = backs[i].parentNode.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) continue;
        backs[i].style.transform = "translate3d(0," + (r.top * -0.1).toFixed(1) + "px,0)";
      }
    }
    if (hud && footer) {
      var f = footer.getBoundingClientRect();
      hud.classList.toggle("is-hidden", f.top < window.innerHeight - 10);
    }
  }
  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; tick(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  tick();

  // ── Wardens: a tap peeks (hover does it on a mouse) ──
  Array.prototype.forEach.call(doc.querySelectorAll(".warden:not(.is-known)"), function (w) {
    w.addEventListener("click", function () { w.classList.toggle("is-peek"); });
  });

  // ── Embers ──
  var canvas = doc.querySelector(".hell-embers");
  if (canvas && !still && canvas.getContext) {
    var ctx = canvas.getContext("2d"), sparks = [], w = 0, h = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    var base = +canvas.getAttribute("data-embers") || 0;
    var resize = function () {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    var spawn = function (s, anywhere) {
      s.x = Math.random() * w;
      s.y = anywhere ? Math.random() * h : h + 10;
      s.r = 0.8 + Math.random() * 2.2;
      s.vy = 0.35 + Math.random() * 1.1;
      s.vx = (Math.random() - 0.5) * 0.4;
      s.life = 0.6 + Math.random() * 0.4;
      s.hue = 18 + Math.random() * 28;
      return s;
    };
    resize();
    window.addEventListener("resize", resize);
    for (var i = 0; i < 70; i++) sparks.push(spawn({}, true));
    var draw = function () {
      if (!doc.hidden) {
        ctx.clearRect(0, 0, w, h);
        // a few sparks even in the Meadow (it's burning), all of them at the bottom of Hell
        var count = Math.round(base + (sparks.length - base) * (bands.length ? floor / 1000 : 0.35));
        ctx.globalCompositeOperation = "lighter";
        for (var j = 0; j < count; j++) {
          var s = sparks[j];
          s.y -= s.vy; s.x += s.vx + Math.sin((s.y + j * 37) / 60) * 0.25;
          if (s.y < -10) spawn(s, false);
          var a = Math.max(0, Math.min(1, s.y / h)) * s.life;
          ctx.fillStyle = "hsla(" + s.hue + ",100%,60%," + a.toFixed(2) + ")";
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
        }
      }
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // ── Sound: Hell's hum, made in the page, only after the visitor asks for it ──
  var sound = {
    on: false, ctx: null, out: null, filter: null,
    start: function () {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!this.ctx) {
        var c = this.ctx = new AC();
        this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(c.destination);
        this.filter = c.createBiquadFilter(); this.filter.type = "lowpass"; this.filter.frequency.value = 180;
        this.filter.connect(this.out);
        // the rumble: brown noise
        var len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0), last = 0;
        for (var i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.5; }
        var noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true; noise.connect(this.filter); noise.start();
        // the drone: two low saws a little apart, the furnace's hum
        [55, 55.6, 82.4].forEach(function (f) {
          var o = c.createOscillator(), g = c.createGain();
          o.type = "sawtooth"; o.frequency.value = f; g.gain.value = 0.05;
          o.connect(g); g.connect(sound.filter); o.start();
        });
      }
      this.ctx.resume();
      this.on = true;
      this.depth(floor / 1000);
      return true;
    },
    stop: function () {
      this.on = false;
      if (!this.ctx) return;
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      var c = this.ctx;
      setTimeout(function () { if (!sound.on) c.suspend(); }, 900);
    },
    depth: function (d) {
      if (!this.ctx) return;
      var t = this.ctx.currentTime;
      this.out.gain.setTargetAtTime(0.10 + d * 0.30, t, 0.4);
      this.filter.frequency.setTargetAtTime(160 + d * 520, t, 0.4);
    }
  };
  var soundBtn = doc.querySelector(".hell-sound");
  if (soundBtn) {
    soundBtn.addEventListener("click", function () {
      var on = !sound.on && sound.start();
      if (!on) sound.stop();
      soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
      soundBtn.textContent = on ? "Sound on" : "Sound off";
    });
  }

  // For the playtest (and the curious): the counter as it stands.
  window.hellDescent = { floor: function () { return floor; } };
})();
