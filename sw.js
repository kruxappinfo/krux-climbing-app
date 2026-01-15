/**
 * KRUX Service Worker v2
 * Estrategia: Cache First para assets estáticos, Network First para datos
 * PWA completa con soporte offline
 */

const CACHE_VERSION = 'v3';
const CACHE_NAME = `krux-cache-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `krux-data-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Assets estáticos para cachear en la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/app_2.css',
  '/app_3.js',
  '/auth.js',
  '/firebase-config.js',
  '/maplibre-config.js',
  '/maplibre-map.js',
  '/user-features.js',
  '/route-photos.js',
  '/manifest.json',
  '/favicon.png',
  '/logo_krujx_v2.png',
  '/assets/logo.png',
  '/assets/krux-logo-login.png',
  '/assets/reset-view-icon.png',
  '/icons/climbing-marker.png',
  '/icons/parking_icon.png',
  '/icons/pwa/icon-192x192.png',
  '/icons/pwa/icon-512x512.png',
  '/icons/pwa/apple-touch-icon.png',
  '/capacitor-init.js'
];

// Recursos externos que intentaremos cachear
const EXTERNAL_RESOURCES = [
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.css',
  'https://unpkg.com/maplibre-gl@4.1.0/dist/maplibre-gl.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Instalación: cachear assets estáticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cacheando assets estáticos');
        // Cachear assets locales
        return cache.addAll(STATIC_ASSETS)
          .then(() => {
            // Intentar cachear recursos externos (no falla si no se pueden)
            return Promise.allSettled(
              EXTERNAL_RESOURCES.map(url =>
                fetch(url, { mode: 'cors' }).then(response => {
                  if (response.ok) {
                    return cache.put(url, response);
                  }
                }).catch(() => {
                  console.log('[SW] No se pudo cachear recurso externo:', url);
                })
              )
            );
          });
      })
      .then(() => {
        console.log('[SW] Instalación completada');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Error en instalación:', error);
      })
  );
});

// Activación: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Eliminar caches que no coincidan con la versión actual
              return cacheName.startsWith('krux-') &&
                     cacheName !== CACHE_NAME &&
                     cacheName !== DATA_CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('[SW] Eliminando cache antiguo:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activado');
        return self.clients.claim();
      })
  );
});

// Fetch: estrategia de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar peticiones que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar peticiones a Firebase (auth, firestore, storage)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firebaseio') ||
      url.hostname.includes('googleapis.com') && !url.pathname.includes('fonts')) {
    return;
  }

  // Ignorar chrome-extension y otros esquemas no http/https
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Estrategia para archivos GeoJSON y tiles del mapa
  if (url.pathname.includes('/Cartografia/') ||
      url.pathname.includes('/tiles/') ||
      url.pathname.endsWith('.geojson')) {
    event.respondWith(cacheFirstThenNetwork(request, DATA_CACHE_NAME));
    return;
  }

  // Estrategia para assets estáticos (CSS, JS, imágenes)
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstThenNetwork(request, CACHE_NAME));
    return;
  }

  // Estrategia para navegación (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Por defecto: network first
  event.respondWith(networkFirstThenCache(request));
});

/**
 * Determina si es un asset estático
 */
function isStaticAsset(url) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.ico'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

/**
 * Cache First, luego Network
 * Ideal para assets que no cambian frecuentemente
 */
async function cacheFirstThenNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // Actualizar cache en background (stale-while-revalidate)
    fetchAndCache(request, cache);
    return cachedResponse;
  }

  return fetchAndCache(request, cache);
}

/**
 * Network First con fallback a página offline
 * Ideal para navegación
 */
async function networkFirstWithOfflineFallback(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Intentar servir desde cache
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    // Si es navegación y no hay cache, mostrar página offline
    const offlineResponse = await cache.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }

    // Fallback final al index
    return cache.match('/index.html');
  }
}

/**
 * Network First, luego Cache
 * Ideal para contenido dinámico
 */
async function networkFirstThenCache(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

/**
 * Fetch y guardar en cache
 */
async function fetchAndCache(request, cache) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // Intentar devolver del cache si falla la red
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    console.error('[SW] Error en fetch:', error);
    throw error;
  }
}

// Escuchar mensajes del cliente
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_GEOJSON') {
    // Cachear archivos GeoJSON bajo demanda
    const urls = event.data.urls;
    caches.open(DATA_CACHE_NAME).then((cache) => {
      urls.forEach(url => {
        fetch(url).then(response => {
          if (response.ok) {
            cache.put(url, response);
          }
        });
      });
    });
  }

  // Limpiar caches específicos
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache limpiado');
    });
  }

  // Pre-cachear rutas específicas
  if (event.data && event.data.type === 'PRECACHE_ROUTES') {
    const routes = event.data.routes;
    caches.open(DATA_CACHE_NAME).then((cache) => {
      routes.forEach(route => {
        fetch(route).then(response => {
          if (response.ok) {
            cache.put(route, response);
            console.log('[SW] Pre-cacheada ruta:', route);
          }
        });
      });
    });
  }
});

// Sincronización en background (cuando vuelve la conexión)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-ascents') {
    event.waitUntil(syncPendingAscents());
  }
});

/**
 * Sincronizar ascensos pendientes almacenados en IndexedDB
 */
async function syncPendingAscents() {
  console.log('[SW] Sincronizando ascensos pendientes...');
  // Esta función se implementará cuando se añada IndexedDB
  // Por ahora, notificamos a los clientes que la sincronización está disponible
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_AVAILABLE',
      message: 'La conexión está disponible para sincronizar'
    });
  });
}

// Manejar notificaciones push (preparado para el futuro)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nueva notificación de KRUX',
      icon: '/icons/pwa/icon-192x192.png',
      badge: '/icons/pwa/icon-96x96.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      },
      actions: [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Cerrar' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'KRUX', options)
    );
  }
});

// Manejar clic en notificaciones
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clientList => {
        // Si ya hay una ventana abierta, enfocarla
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no, abrir una nueva
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
    );
  }
});
