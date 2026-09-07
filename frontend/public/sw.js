const CACHE_NAME = 'zenload-shell-v6'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/fonts/outfit-400.woff2',
  '/fonts/outfit-500.woff2',
  '/fonts/outfit-600.woff2',
  '/fonts/outfit-700.woff2',
  '/fonts/noto-sans-thai-400.woff2',
  '/fonts/noto-sans-thai-500.woff2',
  '/fonts/noto-sans-thai-600.woff2',
  '/fonts/noto-sans-thai-700.woff2'
]
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)))
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME && (key.startsWith('download-everything-cache-') || key.startsWith('zenload-shell-'))).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health') return
  
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)))
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) { const cache = await caches.open(CACHE_NAME); await cache.put('/', response.clone()) }
      return response
    }).catch(async () => (await caches.match('/')) || Response.error()))
  }
})

