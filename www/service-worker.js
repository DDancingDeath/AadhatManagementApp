/**
 * Service Worker for Aadhat Management App
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'aadhat-v5';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/js/main.js',
    '/js/auth/authentication.js',
    '/js/firebase/firestore-service.js',
    '/js/ui/ui-manager.js',
    '/js/ui/navigation.js',
    '/js/utils/state.js',
    '/js/utils/helpers.js',
    '/js/utils/constants.js',
    '/js/utils/template-loader.js',
    '/js/modules/billing.js',
    '/js/modules/items.js',
    '/js/modules/stock.js',
    '/js/modules/history.js',
    '/js/modules/wholesale-sales.js',
    '/js/modules/miscellaneous.js',
    '/js/modules/reports.js',
    '/js/modules/settings.js',
    '/js/modules/finance.js',
    '/js/modules/analytics.js',
    '/js/modules/cash-management.js',
    '/js/modules/outstanding.js',
    '/js/modules/users.js',
    '/js/modules/datefilter.js',
    '/js/modules/configure.js',
    '/js/modules/day.js',
    '/js/services/printer.js',
    '/js/services/audit.js',
    '/css/variables.css',
    '/css/auth.css',
    '/css/billing.css',
    '/css/buttons.css',
    '/css/day.css',
    '/css/charts.css',
    '/css/datefilter.css',
    '/css/hamburger.css',
    '/css/history.css',
    '/css/items.css',
    '/css/loading.css',
    '/css/navigation.css',
    '/css/overlay.css',
    '/css/reports.css',
    '/css/settings.css',
    '/css/stock.css',
    '/css/tables.css',
    '/css/tabs.css',
    '/css/toast.css',
    '/css/totals.css',
    '/templates/auth.html',
    '/templates/navigation.html',
    '/templates/billing.html',
    '/templates/items.html',
    '/templates/stock.html',
    '/templates/history.html',
    '/templates/wholesale-sales.html',
    '/templates/expenses.html',
    '/templates/reports.html',
    '/templates/settings.html',
    '/templates/finance.html',
    '/templates/analytics.html',
    '/templates/cash-management.html',
    '/templates/due.html',
    '/templates/users.html',
    '/templates/configure.html',
    '/templates/modals.html',
    '/templates/chat.html'
];

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('[SW] Failed to cache:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 * Strategy:
 *   - index.html (the navigation document) is fetched NETWORK-FIRST so the
 *     latest cache-buster query strings in <script> / <link> tags reach the
 *     browser on first reload after a deploy. Without this, the user has to
 *     reload twice to see new code (the SW serves a stale index.html on the
 *     first reload, which references the stale main.js URL).
 *   - All other static assets are cache-first with background refresh.
 *   - Firebase/external API calls bypass the SW entirely.
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip Firebase/external API requests - always go to network
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('googleapis') ||
        url.hostname.includes('gstatic')) {
        return;
    }

    // Treat navigation requests and explicit index.html requests as
    // network-first so post-deploy cache-busters take effect immediately.
    const isNavigation = event.request.mode === 'navigate'
        || url.pathname === '/'
        || url.pathname === '/index.html';
    if (isNavigation) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
                    }
                    return response;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
        );
        return;
    }
    
    // For static assets - cache first, then network
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version and update cache in background
                    event.waitUntil(
                        fetch(event.request)
                            .then((response) => {
                                if (response.ok) {
                                    caches.open(CACHE_NAME)
                                        .then((cache) => cache.put(event.request, response));
                                }
                            })
                            .catch(() => {})
                    );
                    return cachedResponse;
                }
                
                // Not in cache - fetch from network
                return fetch(event.request)
                    .then((response) => {
                        // Cache successful responses
                        if (response.ok) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseClone));
                        }
                        return response;
                    })
                    .catch(() => {
                        // Offline fallback for HTML pages
                        if (event.request.headers.get('accept')?.includes('text/html')) {
                            return caches.match('/index.html');
                        }
                        // Return empty response for other failed requests
                        return new Response('', { status: 404, statusText: 'Not Found' });
                    });
            })
            .catch(() => {
                // Fallback if cache match fails
                return new Response('', { status: 500, statusText: 'Service Worker Error' });
            })
    );
});

/**
 * Background sync for offline data
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncOfflineData());
    }
});

/**
 * Sync offline data when back online
 */
async function syncOfflineData() {
    // This will be called when the app comes back online
    // The main app handles syncing through Firebase's real-time listeners
    console.log('[SW] Syncing offline data...');
}
