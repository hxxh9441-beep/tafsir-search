/* سيرفر الخدمة — الباحث القرآني (Offline-First + تحديث فوري) */
const CACHE = 'quran-search-v9';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/search-engine.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/amiri.woff2'
];

// تثبيت: نخزن واجهة التطبيق + تفعيل فوري
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// تفعيل: ننظف الكاشات القديمة + نتحكم فوراً
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// رسالة: تخطّي الانتظار فوراً (من الصفحة عند وجود تحديث)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// جلب: الواجهة = Network First (التحديثات تظهر فوراً) — البيانات = Stale-While-Revalidate
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // بيانات القرآن — من الكاش فوراً + تحديث خلفي
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

  // ملفات الواجهة (html/css/js) — الشبكة أولاً: أي تحديث ترفعه يظهر فوراً
  const isShell = url.pathname.endsWith('/') || /\.(html|css|js)$/.test(url.pathname);
  if (isShell) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // الباقي (خطوط، أيقونات) — كاش أولاً ثم شبكة
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
