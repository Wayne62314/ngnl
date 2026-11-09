// Offline support. Only the app's own files are cached; user data lives in
// IndexedDB and never passes through here.
// The build replaces these with the real file list and a content hash (see vite.config.ts),
// so every page works offline after the first visit and a new release replaces the old cache.
const BUILD = { version: 'dev', files: [] }
const CACHE = 'ngnl-' + BUILD.version
const SCOPE = self.registration.scope
const SHELL = ['./', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', ...BUILD.files].map((p) => new URL(p, SCOPE).href)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const put = (req, res) => {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone()
    caches.open(CACHE).then((c) => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || !req.url.startsWith(SCOPE)) return

  // Pages: try the network so updates show up, fall back to the cached app shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => put(new URL('./', SCOPE).href, res))
        .catch(() => caches.match(new URL('./', SCOPE).href, { ignoreVary: true })),
    )
    return
  }

  // Hashed build assets never change: cache first.
  if (req.url.includes('/assets/')) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit ?? fetch(req).then((res) => put(req, res))))
    return
  }

  // Everything else: serve cached copy, refresh it in the background.
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const net = fetch(req).then((res) => put(req, res)).catch(() => hit)
      return hit ?? net
    }),
  )
})
