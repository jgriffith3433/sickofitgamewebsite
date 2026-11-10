// Climbers: watches Hawkes Net's lobby (project sickofit, room t-lobby) as a spectator and tells the page, over the
// WebSocket (no polling), how many people are climbing. DOM events on window:
//   climbers:count   {count}            live player count (spectators are never counted)
//   climbers:join    {id, name, count}  a climber arrived
//   climbers:leave   {id, name, count}  a climber left
//   climbers:offline {attempt, retryIn} the lobby can't be reached (retryIn null: stopped until the tab is visible again)
// Connects when the page is idle and visible, disconnects when the tab is hidden. ?playtest=net-down simulates the
// service being unreachable without touching the network.
(function () {
  var PROJECT = 'sickofit', ROOM = 't-lobby', BACKOFF = [2000, 5000, 10000, 30000];
  var SDK = 'https://net.hawkesgen.ai/sdk/hawkes-net@1.mjs';
  var net = null, sdk = null, timer = null, attempt = 0, session = 0, count = 0, started = false;
  var down = /[?&]playtest=net-down\b/.test(location.search);
  var endpoint = function () { return window.HAWKES_NET_ENDPOINT || 'https://net.hawkesgen.ai'; };

  function emit(name, detail) { window.dispatchEvent(new CustomEvent('climbers:' + name, { detail: detail })); }
  function visible() { return document.visibilityState === 'visible'; }
  function climbers(n) {
    var c = 0;
    n.peers.forEach(function (p) { if (p.role !== 'spectator') c++; });
    return c;
  }
  function setCount(n) { if (n !== count || !started) { count = n; started = true; emit('count', { count: n }); } }

  function stop() {
    session++;
    clearTimeout(timer); timer = null;
    var n = net; net = null;
    if (n) { try { n.leave('hidden'); } catch (e) {} }
  }

  function fail(mine, err) {
    if (mine !== session) return;
    var n = net; net = null;
    if (n) { try { n.leave('failed'); } catch (e) {} }
    var wait = attempt < BACKOFF.length ? BACKOFF[attempt] : null;
    attempt++;
    console.warn('[climbers] lobby unreachable (' + (err && err.message || err || 'closed') + ')' + (wait ? '; retrying in ' + wait / 1000 + ' s' : '; giving up until this tab is visible again'));
    emit('offline', { attempt: attempt, retryIn: wait });
    if (wait != null) timer = setTimeout(connect, wait);
  }

  async function connect() {
    timer = null;
    if (!visible() || net) return;
    var mine = ++session;
    try {
      if (down) throw new Error('net-down playtest');
      sdk = sdk || await import(SDK);
      // Each join asks for a fresh ticket.
      var room = await sdk.join(ROOM, { project: PROJECT, role: 'spectator', name: 'spectator', endpoint: endpoint(), log: false, leaveOnHide: false, away: false });
      if (mine !== session || !visible()) { try { room.leave('hidden'); } catch (e) {} return; }
      net = room;
      attempt = 0;
      setCount(climbers(room));
      room.when('peer:join', function (e) {
        if (mine !== session || e.peer.role === 'spectator') return;
        setCount(climbers(room));
        emit('join', { id: e.peer.id, name: e.peer.name, count: count });
      });
      room.when('peer:leave', function (e) {
        if (mine !== session || e.peer.role === 'spectator') return;
        setCount(climbers(room));
        emit('leave', { id: e.peer.id, name: e.peer.name, count: count });
      });
      room.when('status', function (e) {
        if (mine === session && (e.status === 'reconnecting' || e.status === 'closed')) fail(mine, new Error('connection lost'));
      });
    } catch (err) {
      fail(mine, err);
    }
  }

  function onVisibility() {
    if (visible()) { attempt = 0; if (!net && !timer) connect(); }
    else stop();
  }

  function begin() {
    document.addEventListener('visibilitychange', onVisibility);
    if (visible()) connect();
  }
  function whenIdle() {
    if ('requestIdleCallback' in window) requestIdleCallback(begin, { timeout: 4000 });
    else setTimeout(begin, 1500);
  }
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle);

  window.hawkesClimbers = { count: function () { return count; }, connected: function () { return !!net; } };
})();
