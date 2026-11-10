/* Service worker - Quản lý nhà trạm IBS
   - Cài như ứng dụng, mở được khi mất mạng.
   - Mở nhanh, ít tốn pin/dữ liệu: dùng bản đã lưu ngay, tải bản mới ngầm cho lần mở sau
     (ứng dụng tự báo "Đã có phiên bản mới" khi cần).
   - Nhận THÔNG BÁO ĐẨY: tín hiệu từ máy chủ đồng bộ → hỏi máy chủ nội dung → hiện thông báo. */
const C = 'ibs-v2';
const CORE = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k !== 'ibs-cfg').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.searchParams.has('nocache')) return;
    const nav = r.mode === 'navigate', key = nav ? './' : r;
    const net = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(key, cp)); } return res; });
    if (nav && u.searchParams.has('v')) { e.respondWith(net.catch(() => caches.match('./'))); return; }   // bấm "Cập nhật ngay": lấy bản mới
    e.respondWith(caches.match(key, { ignoreSearch: nav }).then(m => { if (m) { e.waitUntil(net.catch(() => {})); return m; } return net.catch(() => caches.match('./')); }));
  } else if (u.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(r, cp)); } return res; })));
  }
});
function cfgGet() { return caches.open('ibs-cfg').then(c => c.match('cfg')).then(r => r ? r.json() : {}).catch(() => ({})); }
function cfgPut(o) { return caches.open('ibs-cfg').then(c => c.put('cfg', new Response(JSON.stringify(o)))); }
self.addEventListener('push', e => {
  e.waitUntil(cfgGet().then(cfg => {
    if (!cfg.url || !cfg.user) return self.registration.showNotification('Nhà trạm IBS', { body: 'Có thông báo mới – mở ứng dụng để xem.', icon: 'icon-192.png', badge: 'icon-192.png' });
    const q = cfg.url + (cfg.url.indexOf('?') < 0 ? '?' : '&') + 'action=inbox&user=' + encodeURIComponent(cfg.user) + '&since=' + (cfg.since || 0) + '&token=' + encodeURIComponent(cfg.token);
    return fetch(q, { redirect: 'follow' }).then(r => r.json()).then(j => {
      const items = (j && j.items) || [];
      if (!items.length) return self.registration.showNotification('Nhà trạm IBS', { body: 'Có cập nhật mới.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ibs-update' });
      cfg.since = Math.max.apply(null, items.map(x => x.t)); 
      const show = items.length > 3 ? [{ title: items.length + ' thông báo mới', body: items.slice(-4).map(x => '• ' + x.title).join('\n'), url: './', id: 'sum' }] : items;
      return cfgPut(cfg).then(() => Promise.all(show.map(x => self.registration.showNotification(x.title, { body: x.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ibs-' + x.id, data: { url: x.url || './' }, vibrate: [120, 60, 120] }))));
    }).catch(() => self.registration.showNotification('Nhà trạm IBS', { body: 'Có thông báo mới – mở ứng dụng để xem.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ibs-update' }));
  }).then(() => self.clients.matchAll({ type: 'window' })).then(cs => cs.forEach(c => c.postMessage({ type: 'push' }))));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => new URL(x.url).pathname.startsWith(new URL('./', self.registration.scope).pathname));
    if (c) { c.postMessage({ type: 'nav', url: url }); return c.focus(); }
    return self.clients.openWindow(new URL(url, self.registration.scope).href);
  }));
});
