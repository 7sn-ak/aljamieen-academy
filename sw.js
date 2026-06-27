/* أكاديمية الجامعيين — Service Worker (تخزين مؤقت + عمل دون اتصال + سرعة) */
const CACHE = 'aljamieen-v6';
const ASSETS = [
  './', './index.html', './app.css', './app.js', './mock-data.js',
  './logo.png', './icon.png', './icon-maskable.png', './apple-touch-icon.png', './manifest.webmanifest'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
// تفعيل النسخة الجديدة فوراً عند طلب الصفحة
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname.indexOf('fonts.googleapis.com') >= 0 || url.hostname.indexOf('fonts.gstatic.com') >= 0;
  const isImg = /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(url.pathname);

  // الخطوط والصور: تُعرض فوراً من الذاكرة المؤقتة وتُحدَّث في الخلفية (تسريع)
  if (isFont || isImg) {
    e.respondWith(
      caches.open(CACHE).then(c => c.match(req).then(cached => {
        const fresh = fetch(req).then(resp => {
          if (resp && (resp.ok || resp.type === 'opaque')) c.put(req, resp.clone());
          return resp;
        }).catch(() => cached);
        return cached || fresh;
      }))
    );
    return;
  }

  // صفحات HTML ومنطق التطبيق: من الشبكة أولاً (الأحدث دائماً)، ويرجع للكاش عند انقطاع النت
  e.respondWith(
    fetch(req).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(req, cp));
      return resp;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
