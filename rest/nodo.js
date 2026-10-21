const http = require('http');
const { Semaphore } = require('../src/semaphore');
const { Inventory } = require('../src/inventory');
const { NODES } = require('./config');
const { crearServicioNodo } = require('./servicio');

const NODE_ID = process.argv[2] || process.env.NODE_ID;
const self = NODES.find(n => n.id === NODE_ID);

if (!self) {
  console.log(`Nodo desconocido: ${NODE_ID}. Usa uno de: ${NODES.map(n => n.id).join(', ')}`);
  process.exit(1);
}

async function transporteHttp(nodo, peticion, timeoutMs) {
  const r = await fetch(`http://${nodo.host}:${nodo.port}${peticion.ruta}`, {
    method: peticion.metodo,
    headers: peticion.headers,
    body: peticion.cuerpo,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, cuerpo: await r.text() };
}

const servicio = crearServicioNodo({ self, nodos: NODES, Inventory, Semaphore, transporte: transporteHttp });

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (fragmento) => {
      if (datos.length <= 100000) datos += fragmento;
    });
    req.on('end', () => resolve(datos));
  });
}

const server = http.createServer(async (req, res) => {
  const inicio = Date.now();
  const cuerpo = await leerCuerpo(req);
  const respuesta = await servicio.manejar({ metodo: req.method, ruta: req.url, headers: req.headers, cuerpo });
  res.writeHead(respuesta.status, respuesta.headers);
  res.end(respuesta.cuerpo);
  console.log(`${self.id} ${req.method} ${req.url} -> ${respuesta.status} (${Date.now() - inicio}ms)`);
});

server.listen(self.port, self.host, () => {
  console.log(`${self.name} (${self.id}) escuchando en http://${self.host}:${self.port} - productos locales: ${Object.keys(self.products).join(', ')}`);
});
