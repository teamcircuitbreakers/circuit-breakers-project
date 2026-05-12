const CACHE_NAME = "cb-dynamic-cache-v1"; // You won't need to change this again!

// 1. INSTALL: Force the new service worker to take over immediately
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

// 2. ACTIVATE: Clean up old caches and take control of all open pages
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. FETCH: The automated "Set-it-and-Forget-it" caching logic
self.addEventListener("fetch", (event) => {
    // We only want to handle GET requests securely
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    // Detect if the request is for an HTML page
    const isHtmlRequest = event.request.mode === 'navigate' || 
                          event.request.headers.get('accept').includes('text/html');

    if (isHtmlRequest) {
        // STRATEGY A: "Network First, Fallback to Cache" for HTML Pages
        // Guarantees users always see your newest UI updates immediately
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    // Clone and save the fresh HTML to cache for offline use
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                })
                .catch(() => {
                    // If offline, serve the last known good HTML from cache
                    return caches.match(event.request);
                })
        );
    } else {
        // STRATEGY B: "Stale-While-Revalidate" for Assets (Images, JS, CSS)
        // Loads instantly from cache, but updates the cache in the background silently
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const networkFetch = fetch(event.request).then((networkResponse) => {
                    // Only cache valid responses
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Ignore network errors on assets (prevents console spam when offline)
                });

                // Return the fast cache immediately if available, otherwise wait for network
                return cachedResponse || networkFetch;
            })
        );
    }
});
