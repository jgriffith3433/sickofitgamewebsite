/*
 * Sick Of It: the site's own Hawkes Analytics events, on top of what the SDK sends by itself (page views, sessions,
 * outbound links, errors...). Load it after the SDK tag:
 *
 *   <script src="https://gen.hawkesgen.ai/sdk/analytics@1.js" data-product="sickofit" data-hawkes-analytics="page" defer></script>
 *   <script src="/js/hawkes-site.js" defer></script>
 *
 * - play_click: a click on a Play button (a link with data-play, or any link into /Game/), with where it was on the
 *   page: the link's data-play (landing, nav), else nav / footer / page.
 * - Blog posts (/blog/posts/): read_depth at 25, 50, 75 and 100% of the post, and read_time (seconds the post was
 *   on screen) each time the page is hidden or closed.
 *
 * The SDK is in hawkesgen (clients/js/hawkes-analytics.js, docs/analytics.md). If it hasn't loaded, calls wait in
 * window.hawkesAnalyticsQ and the SDK plays them back when it starts. Nothing here throws.
 */
(function () {
  'use strict';

  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    try {
      var a = window.hawkesAnalytics;
      if (a && typeof a[method] === 'function') return void a[method].apply(a, args);
      var q = window.hawkesAnalyticsQ = window.hawkesAnalyticsQ || [];
      q.push([method].concat(args));
    } catch (e) { /* analytics never breaks the page */ }
  }

  function log() {
    try { console.info.apply(console, ['[hawkes-site]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
  }

  // One SDK per page: the game's Unity bridge sees the tag (data-hawkes-analytics) and doesn't add another.
  var sdkTags = document.querySelectorAll('script[src*="/sdk/analytics"]').length;
  log('analytics sdk tags on this page:', sdkTags, '· loaded:', !!window.hawkesAnalytics, '· host:', location.hostname);

  // ------------------------------------------------------------------ play_click
  function isGameLink(a) {
    try {
      var u = new URL(a.getAttribute('href'), location.href);
      return u.origin === location.origin && /\/Game\/(index\.html)?$/i.test(u.pathname);
    } catch (e) { return false; }
  }

  function whereOf(a) {
    if (a.getAttribute('data-play')) return a.getAttribute('data-play');
    if (a.closest('nav')) return 'nav';
    if (a.closest('footer')) return 'footer';
    return 'page';
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !(a.hasAttribute('data-play') || isGameLink(a))) return;
    var props = { where: whereOf(a), text: (a.textContent || '').trim().slice(0, 60) };
    call('track', 'play_click', props);
    log('play_click', JSON.stringify(props));
  }, true);

  // ------------------------------------------------------------------ blog posts: read depth and time
  if (!/\/blog\/posts\/[^/]+$/.test(location.pathname)) return;

  var post = location.pathname.replace(/^.*\/blog\/posts\//, '').replace(/\.html$/, '');
  var article = document.querySelector('article') || document.querySelector('main') || document.body;
  var marks = [25, 50, 75, 100], reached = 0;

  function depth() {
    var r = article.getBoundingClientRect();
    var height = r.height || 1, seen = window.innerHeight - r.top;
    return Math.max(0, Math.min(100, Math.round(seen / height * 100)));
  }

  function checkDepth() {
    var d = depth();
    while (marks.length && d >= marks[0]) {
      reached = marks.shift();
      call('track', 'read_depth', { post: post, depth: reached });
      log('read_depth', post, reached + '%');
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    setTimeout(function () { ticking = false; checkDepth(); }, 200);
  }, { passive: true });
  window.addEventListener('resize', checkDepth, { passive: true });
  // A short post can be read without scrolling: count what's on screen once the reader has had a moment.
  setTimeout(checkDepth, 2000);

  // Time on the post: only while the tab is visible. Sent as the seconds since the last send, so they add up.
  var shownAt = document.visibilityState === 'hidden' ? 0 : Date.now(), total = 0;
  function sendTime() {
    if (!shownAt) return;
    var seconds = Math.round((Date.now() - shownAt) / 1000);
    shownAt = 0;
    if (seconds < 1) return;
    total += seconds;
    call('track', 'read_time', { post: post, seconds: seconds, total: total, depth: reached });
    log('read_time', post, seconds + 's', '(total ' + total + 's, ' + reached + '%)');
  }
  // Capture listeners on window run before the SDK's own (document, bubbling), so read_time is queued before the
  // SDK sends everything on the way out.
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTime();
    else if (!shownAt) shownAt = Date.now();
  }, true);
  window.addEventListener('pagehide', sendTime, true);
})();
