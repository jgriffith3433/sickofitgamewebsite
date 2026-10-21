const CACHE_NAME = 'sickofit-pwa-v200';
// Note: manifest.json is intentionally not cached to ensure users always get
// the latest version and start_url, which is critical for cache busting
const URLS_TO_CACHE = [
  '/offline.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', event => {
  console.log('Service worker installing, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('Service worker activating, cache:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        // Only drop previous copies of this site cache.
        // Unity stores asset bundles in Cache Storage under UnityCache_*,
        // and deleting those forces a full redownload.
        if (key.startsWith('sickofit-pwa-') && key !== CACHE_NAME) {
          console.log('Deleting old cache:', key);
          return caches.delete(key);
        }
      })
    ))
  );
  self.clients.claim();
});

// Handle skipWaiting message from client
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Unity's loader caches these itself (Cache Storage + IndexedDB).
// A service worker cannot hand a 304 back to the page, so intercepting
// them makes Unity treat every revisit as a full download.
function unityManagesCache(url) {
  const path = url.pathname;
  return path.endsWith('.bundle') || path.indexOf('.data.unityweb') !== -1;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (unityManagesCache(url)) {
    return;
  }

  // Hawkes Analytics batches are POSTs (sendBeacon / keepalive fetch) to Gen: let the browser send them as they are.
  if (event.request.method !== 'GET') {
    return;
  }

  // NETWORK-FIRST strategy for site files (shell, catalog, images).
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone the response before caching
        const responseClone = response.clone();
        
        // Only cache successful responses for offline.html and icons
        if (response.status === 200 && 
            (url.pathname.endsWith('/offline.html') || url.pathname.startsWith('/icons/'))) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Only use cache as fallback for offline.html and icons
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page if nothing else works
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Network error', { status: 503 });
        });
      })
  );
});
