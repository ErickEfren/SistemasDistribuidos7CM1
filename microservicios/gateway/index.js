const fs = require('fs');
const path = require('path');
const { URLS, puertoDe } = require('../config');
const { json, leerJson, crearServicio, llamar } = require('../lib/http');

const SERVICIOS = ['catalogo', 'inventario', 'pedidos', 'pagos'];
const PUBLICO = path.join(__dirname, 'public');

function archivo(nombre, tipo) {
  return { status: 200, headers: { 'content-type': tipo }, cuerpo: fs.readFileSync(path.join(PUBLICO, nombre)) };
}

async function salud({ idSolicitud }) {
  const estados = await Promise.all(SERVICIOS.map(async (nombre) => {
    try {
      const r = await llamar(nombre, URLS[nombre], 'GET', '/salud', { idSolicitud, timeoutMs: 1000 });
      return [nombre, r.status === 200 ? 'ok' : 'error'];
    } catch {
      return [nombre, 'caido'];
    }
  }));
  return json(200, { gateway: 'ok', servicios: Object.fromEntries(estados) });
}

async function productos({ idSolicitud }) {
  const [catalogo, inventario] = await Promise.allSettled([
    llamar('catalogo', URLS.catalogo, 'GET', '/productos', { idSolicitud }),
    llamar('inventario', URLS.inventario, 'GET', '/stock', { idSolicitud }),
  ]);
  if (catalogo.status === 'rejected') throw catalogo.reason;
  const stock = inventario.status === 'fulfilled' && inventario.value.status === 200 ? inventario.value.datos.stock : null;
  const lista = catalogo.value.datos.productos.map(p => ({ ...p, stock: stock ? (stock[p.id] ?? 0) : null }));
  return json(200, { productos: lista, inventarioDisponible: stock !== null });
}

async function reenviar(metodo, ruta, { cuerpo, headers, idSolicitud }) {
  const extra = headers['idempotency-key'] ? { 'idempotency-key': headers['idempotency-key'] } : {};
  const r = await llamar('pedidos', URLS.pedidos, metodo, ruta, {
    cuerpo: metodo === 'POST' ? leerJson(cuerpo) : undefined,
    headers: extra,
    idSolicitud,
    timeoutMs: 12000,
  });
  return json(r.status, r.datos);
}

crearServicio({
  nombre: 'gateway',
  puerto: puertoDe('gateway'),
  rutas: [
    { metodo: 'GET', patron: /^\/$/, manejar: () => archivo('index.html', 'text/html; charset=utf-8') },
    { metodo: 'GET', patron: /^\/app\.js$/, manejar: () => archivo('app.js', 'application/javascript; charset=utf-8') },
    { metodo: 'GET', patron: /^\/api\/salud$/, manejar: salud },
    { metodo: 'GET', patron: /^\/api\/productos$/, manejar: productos },
    { metodo: 'POST', patron: /^\/api\/pedidos$/, manejar: (s) => reenviar('POST', '/pedidos', s) },
    { metodo: 'GET', patron: /^\/api\/pedidos$/, manejar: (s) => reenviar('GET', '/pedidos', s) },
    { metodo: 'GET', patron: /^\/api\/pedidos\/([^/]+)$/, manejar: (s) => reenviar('GET', `/pedidos/${encodeURIComponent(decodeURIComponent(s.params[1]))}`, s) },
  ],
});
