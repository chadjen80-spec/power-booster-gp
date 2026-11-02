// Thin WebSocket client for online rooms (see server.js for the message protocol)
(function () {
  const PB = window.PB = window.PB || {};
  const net = PB.net = { ws: null, id: null, room: null, handlers: {} };

  net.connected = () => !!net.ws && net.ws.readyState === 1;
  net.isHost = () => !!net.room && net.room.host === net.id;
  net.on = (type, fn) => { net.handlers[type] = fn; };

  net.connect = function (addr) {
    return new Promise((resolve, reject) => {
      if (net.connected()) { resolve(); return; }
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try { ws = new WebSocket(`${proto}://${addr.replace(/^\w+:\/\//, '').replace(/\/+$/, '')}`); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
      ws.onopen = () => { clearTimeout(timer); net.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('connect failed')); };
      ws.onclose = () => {
        const was = net.ws === ws;
        if (was) { net.ws = null; net.room = null; net.id = null; }
        if (was && net.handlers.disconnect) net.handlers.disconnect();
      };
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'welcome') net.id = m.you;
        if (m.t === 'room') net.room = m;
        if (m.t === 'left' && net.room) net.room.host = m.host;
        const h = net.handlers[m.t];
        if (h) h(m);
      };
    });
  };

  net.send = msg => { if (net.connected()) net.ws.send(JSON.stringify(msg)); };
  net.leave = () => { net.send({ t: 'leave' }); net.room = null; };
})();
