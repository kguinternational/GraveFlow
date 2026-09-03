/* GraveFlow Service Worker
   - Caches the core app shell for offline capability
   - Handles push notifications for new gig alerts
*/

const CACHE_NAME = 'graveflow-v1';
const SHELL_ASSETS = [
    '/',
    '/index.html',
    '/driver.html',
    '/rider.html',
    '/client/graveflow-rider.html',
    '/admin.html',
    '/sw.js',
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(SHELL_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((k) => k !== CACHE_NAME)
                    .map((k) => {
                        console.log('[SW] Deleting old cache:', k);
                        return caches.delete(k);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ── Fetch: network-first for API, cache-first for static ─────────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip cross-origin requests (Stripe, Socket.io server, etc.)
    if (url.origin !== self.location.origin) return;

    // API requests: always go network, don't cache
    if (url.pathname.startsWith('/auth/') || url.pathname.startsWith('/push/') ||
        url.pathname.startsWith('/ledger') || url.pathname.startsWith('/chat') ||
        url.pathname.startsWith('/search-graves') || url.pathname.startsWith('/create-payment-intent')) {
        return; // let browser handle — no caching for dynamic API
    }

    // Static assets: cache-first with network fallback
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // Only cache successful same-origin GET responses
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return response;
            });
        }).catch(() => {
            // Offline fallback: serve index.html for navigation requests
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        })
    );
});

// ── Push: show notification for incoming gig ──────────────────────────────────
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        console.error('[SW] Push payload parse error:', e);
    }

    const title = data.title || '🚗 GraveFlow';
    const options = {
        body: data.body || 'A new gig is available near you.',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: data.gigId || 'graveflow-gig',
        renotify: true,
        data: { gigId: data.gigId, url: '/driver.html' },
        actions: [
            { action: 'open', title: 'View Gig' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: open driver dashboard ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    if (event.action === 'dismiss') return;

    const targetUrl = (event.notification.data && event.notification.data.url) || '/driver.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if (client.url.includes('driver.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
