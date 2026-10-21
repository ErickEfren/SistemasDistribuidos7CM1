const { RedSimulada } = require('./red');
const { Servidor, crearProxy } = require('./orb');
const { Almacen, Fabrica } = require('./almacen');

function generador(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const semilla = Number(process.env.SEMILLA) || Math.floor(Math.random() * 1e9);
const azar = generador(semilla);

const STOCK_INICIAL = { Manzanas: 60, Peras: 50, Bananas: 70 };
const PRODUCTOS = Object.keys(STOCK_INICIAL);
const CLIENTES = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena'];
const COMPRAS_POR_CLIENTE = 12;
const OPCIONES = { timeoutMs: 50, reintentos: 2 };

const red = new RedSimulada({ latenciaMs: [5, 30], probPerderSolicitud: 0.04, probPerderRespuesta: 0.06, azar });
const servidor = new Servidor();
const bitacora = { descontado: {} };
let almacen;
let reinicios = 0;

function arrancarServidor() {
  almacen = new Almacen(STOCK_INICIAL, bitacora);
  servidor.registrar('almacen', almacen);
  servidor.registrar('fabrica', new Fabrica(servidor));
}

arrancarServidor();
red.conectar('tienda', servidor);

function elegir(lista) {
  return lista[Math.floor(azar() * lista.length)];
}

async function atenderCliente(nombre, creeVendido) {
  const almacenRemoto = crearProxy(red, 'tienda', 'almacen', OPCIONES);
  const fabrica = crearProxy(red, 'tienda', 'fabrica', OPCIONES);

  for (let i = 0; i < COMPRAS_POR_CLIENTE; i++) {
    await red.pausa(azar() * 30);
    const producto = elegir(PRODUCTOS);
    const cantidad = 1 + Math.floor(azar() * 4);
    try {
      const carrito = crearProxy(red, 'tienda', await fabrica.crearCarrito(), OPCIONES);
      await carrito.agregar(producto);
      const disponible = await almacenRemoto.stock(producto);
      if (disponible < cantidad) {
        console.log(`${nombre}: sin stock de ${producto} (hay ${disponible}, queria ${cantidad})`);
        continue;
      }
      await almacenRemoto.descontar(producto, cantidad);
      await almacenRemoto.registrarVenta({ cliente: nombre, producto, cantidad, fecha: new Date() });
      creeVendido[producto] = (creeVendido[producto] || 0) + cantidad;
      console.log(`${nombre}: compro ${cantidad}x ${producto}`);
    } catch (err) {
      console.log(`${nombre}: no se pudo completar la compra de ${cantidad}x ${producto} (${err.message})`);
    }
  }
}

function programarReinicio() {
  if (azar() >= 0.35) return;
  setTimeout(() => {
    servidor.reiniciar();
    reinicios += 1;
    console.log('[servidor] el proceso se reinicio por mantenimiento');
    setTimeout(arrancarServidor, 40);
  }, 150 + azar() * 250);
}

async function main() {
  console.log(`Tienda abierta (semilla de la red: ${semilla})\n`);
  programarReinicio();

  const creeVendido = {};
  await Promise.all(CLIENTES.map((nombre) => atenderCliente(nombre, creeVendido)));
  await red.pausa(150);

  console.log('\n--- Cierre de caja ---');
  for (const producto of PRODUCTOS) {
    const creen = creeVendido[producto] || 0;
    const descontado = bitacora.descontado[producto] || 0;
    console.log(`${producto}: los clientes creen haber vendido ${creen}, el almacen descuenta ${descontado}, stock final ${almacen.stockActual[producto]}`);
  }
  if (reinicios > 0) console.log(`(el servidor se reinicio ${reinicios} vez durante la jornada)`);

  const reporte = crearProxy(red, 'tienda', 'almacen', OPCIONES);
  try {
    console.log('Ventas por hora:', JSON.stringify(await reporte.resumenPorHora()));
  } catch (err) {
    console.log(`Ventas por hora: no se pudo generar (${err.message})`);
  }
  console.log(`Objetos remotos vivos en el servidor: ${servidor.objetos.size}`);
}

main();
