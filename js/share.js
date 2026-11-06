/* Share buttons: any [data-share] container. Uses the page's canonical URL (or its own), the native share sheet when
   there is one, and plain links otherwise. Also points og:/twitter: image URLs at this origin so beta shows its own card.
   No network requests, no polling. */
(function () {
  'use strict';
  var ROOT = new URL('../', document.currentScript.src).href;
  var TEXT = 'Sick Of It: climb 1,000 floors of Hell. Rewind it. Free in your browser.';
  try {
    if (/^https?:/.test(location.protocol) && location.hostname.indexOf('hawkesgames.com') < 0) {
      document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[property="og:url"]').forEach(function (m) {
        var c = m.getAttribute('content') || '';
        var i = c.indexOf('/play/sickofit/');
        if (i >= 0) m.setAttribute('content', new URL(c.slice(i + '/play/sickofit/'.length), ROOT).href);
      });
    }
  } catch (e) {}
  function url(box) { return box.getAttribute('data-url') || location.href.split('#')[0].split('?')[0]; }
  function setup(box) {
    var u = url(box), e = encodeURIComponent;
    var links = {
      x: 'https://twitter.com/intent/tweet?text=' + e(TEXT) + '&url=' + e(u),
      reddit: 'https://www.reddit.com/submit?url=' + e(u) + '&title=' + e('Sick Of It: climb 1,000 floors of Hell. Rewind it.'),
      facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + e(u)
    };
    Object.keys(links).forEach(function (k) {
      var a = box.querySelector('[data-share-' + k + ']'); if (a) a.href = links[k];
    });
    var copy = box.querySelector('[data-share-copy]');
    if (copy) copy.addEventListener('click', function () {
      var done = function () { var t = copy.textContent; copy.textContent = 'Copied!'; setTimeout(function () { copy.textContent = t; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done, done); else done();
    });
    var native = box.querySelector('[data-share-native]');
    if (native) {
      if (navigator.share) native.hidden = false;
      native.addEventListener('click', function () { navigator.share({ title: 'Sick Of It', text: TEXT, url: u }).catch(function () {}); });
    }
  }
  document.querySelectorAll('[data-share]').forEach(setup);
})();
