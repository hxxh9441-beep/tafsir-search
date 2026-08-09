/* سيرفر الخدمة — الباحث القرآني (Offline-First) */
const CACHE = 'quran-search-v3';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/search-engine.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/ThmanyahSans-Regular.ttf',
  './fonts/amiri.woff2'
];

// تثبيت: نخزن واجهة التطبيق
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// تفعيل: ننظف الكاشات القديمة
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// جلب: App Shell من الكاش أولاً — البيانات Stale-While-Revalidate
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // طلبات البيانات — من الكاش فوراً + تحديث في الخلفية
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // الباقي — Cache First مع تجاوز للشبكة
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res && res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
