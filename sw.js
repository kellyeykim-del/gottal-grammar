// 앱 설치(홈 화면에 추가)용 서비스 워커.
// 항상 최신 버전을 쓰도록 네트워크 우선, 오프라인일 때만 저장해 둔 앱 화면을 보여준다.
// 로그인·기록 저장(Supabase), YouTube 등 다른 주소로 가는 요청에는 관여하지 않는다.
const CACHE = 'gottal-grammar-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
