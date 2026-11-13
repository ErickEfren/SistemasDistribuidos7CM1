const { URLS, puertoDe } = require('../config');
const { ErrorHttp, json, leerJson, crearServicio, llamar } = require('../lib/http');

const CODIGOS = {
  EN_PROCESO: 202,
  CONFIRMADO: 201,
  RECHAZADO_SIN_STOCK: 409,
  PAGO_RECHAZADO: 402,
  PENDIENTE: 202,
  FALLIDO: 503,
};

const pedidos = new Map();
const porClave = new Map();
let contador = 0;

function repetido(clave) {
  const pedido = pedidos.get(porClave.get(clave));
  return json(CODIGOS[pedido.estado], { pedido, repetido: true });
}

function terminar(pedido, estado) {
  pedido.estado = estado;
  return json(CODIGOS[estado], { pedido });
}

async function liberarReserva(pedido, idSolicitud) {
  try {
    const r = await llamar('inventario', URLS.inventario, 'POST', `/reservas/${encodeURIComponent(pedido.id)}/liberar`, { idSolicitud });
    if (r.status === 200) pedido.pasos.push(`inventario: reserva liberada (quedan ${r.datos.reserva.disponible})`);
    else if (r.status === 404) pedido.pasos.push('inventario: no habia reserva que liberar');
    else pedido.pasos.push(`inventario: no se pudo liberar la reserva (${r.status})`);
  } catch (err) {
    pedido.pasos.push(`inventario: no se pudo liberar la reserva (${err.message})`);
  }
}

async function crearPedido({ cuerpo, headers, idSolicitud }) {
  const { producto, cantidad, cliente = 'anonimo' } = leerJson(cuerpo);
  if (typeof producto !== 'string' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1000) {
    throw new ErrorHttp(400, 'se requiere producto (texto) y cantidad (entero entre 1 y 1000)');
  }
  if (typeof cliente !== 'string' || cliente.length > 40) throw new ErrorHttp(400, 'cliente debe ser un texto de hasta 40 caracteres');

  const clave = headers['idempotency-key'];
  if (clave && porClave.has(clave)) return repetido(clave);

  const catalogo = await llamar('catalogo', URLS.catalogo, 'GET', `/productos/${encodeURIComponent(producto)}`, { idSolicitud });
  if (catalogo.status === 404) throw new ErrorHttp(404, `producto desconocido: ${producto}`);
  if (catalogo.status !== 200) throw new ErrorHttp(502, `el catalogo respondio con el codigo ${catalogo.status}`);
  if (clave && porClave.has(clave)) return repetido(clave);

  const { nombre, precio } = catalogo.datos.producto;
  const pedido = {
    id: `P-${++contador}`,
    cliente,
    producto,
    nombre,
    cantidad,
    monto: precio * cantidad,
    estado: 'EN_PROCESO',
    pasos: [],
    fecha: new Date().toISOString(),
  };
  pedidos.set(pedido.id, pedido);
  if (clave) porClave.set(clave, pedido.id);
  pedido.pasos.push(`catalogo: ${nombre} a ${precio} MXN, total ${pedido.monto} MXN`);

  let reserva;
  try {
    reserva = await llamar('inventario', URLS.inventario, 'POST', '/reservas', {
      cuerpo: { pedidoId: pedido.id, producto, cantidad },
      idSolicitud,
    });
  } catch (err) {
    pedido.pasos.push(`inventario: ${err.message}`);
    if (err.status === 504) await liberarReserva(pedido, idSolicitud);
    return terminar(pedido, 'FALLIDO');
  }
  if (reserva.status === 409) {
    pedido.pasos.push(`inventario: sin stock suficiente (quedan ${reserva.datos.reserva.disponible})`);
    return terminar(pedido, 'RECHAZADO_SIN_STOCK');
  }
  if (reserva.status !== 201 && reserva.status !== 200) {
    pedido.pasos.push(`inventario: respondio con el codigo ${reserva.status}`);
    return terminar(pedido, 'FALLIDO');
  }
  pedido.pasos.push(`inventario: ${cantidad} reservadas (quedan ${reserva.datos.reserva.disponible})`);

  let pago;
  try {
    pago = await llamar('pagos', URLS.pagos, 'POST', '/pagos', {
      cuerpo: { pedidoId: pedido.id, monto: pedido.monto },
      idSolicitud,
    });
  } catch (err) {
    pedido.pasos.push(`pagos: ${err.message}`);
    if (err.status === 504) {
      pedido.pasos.push('pagos: no se sabe si se cobro; la reserva se mantiene hasta revisarlo');
      return terminar(pedido, 'PENDIENTE');
    }
    await liberarReserva(pedido, idSolicitud);
    return terminar(pedido, 'FALLIDO');
  }
  if (pago.status === 402) {
    pedido.pasos.push(`pagos: rechazado, ${pago.datos.pago.motivo}`);
    await liberarReserva(pedido, idSolicitud);
    return terminar(pedido, 'PAGO_RECHAZADO');
  }
  if (pago.status !== 201 && pago.status !== 200) {
    pedido.pasos.push(`pagos: respondio con el codigo ${pago.status}`);
    await liberarReserva(pedido, idSolicitud);
    return terminar(pedido, 'FALLIDO');
  }
  pedido.pasos.push(`pagos: cobro aprobado por ${pedido.monto} MXN`);

  try {
    const confirmacion = await llamar('inventario', URLS.inventario, 'POST', `/reservas/${encodeURIComponent(pedido.id)}/confirmar`, { idSolicitud });
    pedido.pasos.push(confirmacion.status === 200
      ? 'inventario: reserva confirmada'
      : `inventario: no se pudo confirmar la reserva (${confirmacion.status})`);
  } catch (err) {
    pedido.pasos.push(`inventario: no se pudo confirmar la reserva (${err.message}); el cobro y la reserva se mantienen`);
  }
  return terminar(pedido, 'CONFIRMADO');
}

crearServicio({
  nombre: 'pedidos',
  puerto: puertoDe('pedidos'),
  rutas: [
    { metodo: 'GET', patron: /^\/salud$/, manejar: () => json(200, { servicio: 'pedidos', estado: 'ok' }) },
    { metodo: 'POST', patron: /^\/pedidos$/, manejar: crearPedido },
    {
      metodo: 'GET',
      patron: /^\/pedidos$/,
      manejar: () => json(200, { pedidos: [...pedidos.values()].reverse().slice(0, 50) }),
    },
    {
      metodo: 'GET',
      patron: /^\/pedidos\/([^/]+)$/,
      manejar: ({ params }) => {
        const pedido = pedidos.get(decodeURIComponent(params[1]));
        if (!pedido) throw new ErrorHttp(404, `no existe el pedido ${params[1]}`);
        return json(200, { pedido });
      },
    },
  ],
});
