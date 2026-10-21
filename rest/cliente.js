const readline = require('readline');
const crypto = require('crypto');
const { NODES } = require('./config');
const { crearCliente } = require('./cliente-logica');

const destino = process.argv[2] || 'N1';
const nombre = process.argv[3] || `cliente-${process.pid}`;
const nodo = NODES.find(n => n.id === destino);

if (!nodo) {
  console.log(`Nodo desconocido: ${destino}. Usa uno de: ${NODES.map(n => n.id).join(', ')}`);
  process.exit(1);
}

async function transporteHttp(peticion, timeoutMs) {
  const r = await fetch(`http://${nodo.host}:${nodo.port}${peticion.ruta}`, {
    method: peticion.metodo,
    headers: peticion.headers,
    body: peticion.cuerpo,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, cuerpo: await r.text() };
}

const cliente = crearCliente({
  nombre,
  nodo,
  transporte: transporteHttp,
  generarClave: () => crypto.randomUUID(),
  escribir: (linea) => console.log(linea),
});

for (const linea of cliente.encabezado()) console.log(linea);

const rl = readline.createInterface({ input: process.stdin });
let cola = Promise.resolve();
rl.on('line', (linea) => {
  cola = cola.then(async () => {
    const r = await cliente.ejecutar(linea);
    if (r.comando === 'salir') rl.close();
  });
});
