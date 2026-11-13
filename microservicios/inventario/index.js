const { Inventory } = require('../../src/inventory');
const { Semaphore } = require('../../src/semaphore');
const { puertoDe } = require('../config');
const { ErrorHttp, json, leerJson, crearServicio } = require('../lib/http');

const STOCK_INICIAL = { manzanas: 10, peras: 8, bananas: 12 };

const inventario = new Inventory(STOCK_INICIAL);
const mutex = new Semaphore('inventario', 1);
const reservas = new Map();

function seccionCritica(operacion) {
  mutex.tryWait({ id: 'inventario' });
  try {
    return operacion();
  } finally {
    mutex.signal();
  }
}

function crearReserva({ cuerpo }) {
  const { pedidoId, producto, cantidad } = leerJson(cuerpo);
  if (typeof pedidoId !== 'string' || typeof producto !== 'string' || !Number.isInteger(cantidad) || cantidad < 1) {
    throw new ErrorHttp(400, 'se requieren pedidoId, producto y cantidad (entero positivo)');
  }
  if (!Object.hasOwn(STOCK_INICIAL, producto)) throw new ErrorHttp(404, `producto sin inventario: ${producto}`);

  const previa = reservas.get(pedidoId);
  if (previa) return json(previa.estado === 'RECHAZADA' ? 409 : 200, { reserva: previa, repetida: true });

  return seccionCritica(() => {
    const resultado = inventario.processOrder({ product: producto, qty: cantidad });
    const reserva = {
      pedidoId,
      producto,
      cantidad,
      estado: resultado.fulfilled ? 'RESERVADA' : 'RECHAZADA',
      disponible: resultado.remaining,
    };
    reservas.set(pedidoId, reserva);
    return json(resultado.fulfilled ? 201 : 409, { reserva });
  });
}

function cambiarReserva(pedidoId, accion) {
  const reserva = reservas.get(pedidoId);
  if (!reserva) throw new ErrorHttp(404, `no hay reserva para el pedido ${pedidoId}`);

  if (accion === 'liberar') {
    if (reserva.estado === 'RESERVADA') {
      seccionCritica(() => {
        reserva.disponible = inventario.release({ product: reserva.producto, qty: reserva.cantidad }).remaining;
        reserva.estado = 'LIBERADA';
      });
    }
    return json(200, { reserva });
  }

  if (reserva.estado === 'RESERVADA') reserva.estado = 'CONFIRMADA';
  if (reserva.estado !== 'CONFIRMADA') throw new ErrorHttp(409, `la reserva del pedido ${pedidoId} esta ${reserva.estado}`);
  return json(200, { reserva });
}

crearServicio({
  nombre: 'inventario',
  puerto: puertoDe('inventario'),
  rutas: [
    { metodo: 'GET', patron: /^\/salud$/, manejar: () => json(200, { servicio: 'inventario', estado: 'ok' }) },
    {
      metodo: 'GET',
      patron: /^\/stock$/,
      manejar: () => {
        const activas = [...reservas.values()].filter(r => r.estado === 'RESERVADA').length;
        return json(200, { stock: inventario.snapshot().stock, reservasActivas: activas });
      },
    },
    { metodo: 'POST', patron: /^\/reservas$/, manejar: crearReserva },
    {
      metodo: 'POST',
      patron: /^\/reservas\/([^/]+)\/(liberar|confirmar)$/,
      manejar: ({ params }) => cambiarReserva(decodeURIComponent(params[1]), params[2]),
    },
  ],
});
