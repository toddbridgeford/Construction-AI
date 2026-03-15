const APP_CACHE = 'construction-ai-app-v1'
const DATA_CACHE = 'construction-ai-data-v1'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== APP_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

const isSameOrigin = (url) => new URL(url).origin === self.location.origin
const isDataRequest = (request) => {
  if (request.method !== 'GET') return false
  const { pathname } = new URL(request.url)
  return pathname.startsWith('/api') || pathname.startsWith('/fred') || pathname.startsWith('/bls') || pathname.startsWith('/census')
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !isSameOrigin(request.url)) return

  if (isDataRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          void caches.open(DATA_CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error()))
    )
    return
  }

  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).catch(() => caches.match('/index.html'))))
})
