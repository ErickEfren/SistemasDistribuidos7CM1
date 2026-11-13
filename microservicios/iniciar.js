const { spawn } = require('child_process');
const path = require('path');
const { PUERTOS } = require('./config');

const ORDEN = ['catalogo', 'inventario', 'pagos', 'pedidos', 'gateway'];

const hijos = ORDEN.map((nombre) => {
  const hijo = spawn(process.execPath, [path.join(__dirname, nombre, 'index.js')], {
    env: { ...process.env, PORT: String(PUERTOS[nombre]) },
    stdio: 'inherit',
  });
  hijo.on('exit', (codigo) => console.log(`[iniciar] el servicio de ${nombre} termino (codigo ${codigo})`));
  return hijo;
});

function detener() {
  for (const hijo of hijos) hijo.kill();
  process.exit(0);
}

process.on('SIGINT', detener);
process.on('SIGTERM', detener);

setTimeout(() => console.log(`\n[iniciar] Abre http://127.0.0.1:${PUERTOS.gateway} en el navegador. Ctrl+C detiene todo.\n`), 500);
