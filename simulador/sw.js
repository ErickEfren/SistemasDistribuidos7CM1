const CACHE = 'almacen-rest-v1';
const ARCHIVOS = [
  './',
  'index.html',
  'app.js',
  'red.js',
  'pwa.js',
  'manifest.webmanifest',
  'iconos/icono-192.png',
  'iconos/icono-512.png',
  'iconos/icono-maskable-512.png',
  'iconos/apple-touch-icon.png',
  '../src/semaphore.js',
  '../src/inventory.js',
  '../rest/config.js',
  '../rest/servicio.js',
  '../rest/cliente-logica.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await fetch(peticion, { signal: AbortSignal.timeout(3000) });
    if (respuesta.ok) await cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (err) {
    const guardada = await cache.match(peticion, { ignoreSearch: true });
    if (guardada) return guardada;
    if (peticion.mode === 'navigate') return cache.match('index.html');
    throw err;
  }
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  evento.respondWith(redPrimero(request));
});
