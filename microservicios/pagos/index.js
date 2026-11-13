const { puertoDe } = require('../config');
const { ErrorHttp, json, leerJson, crearServicio } = require('../lib/http');

const LIMITE_POR_PAGO = 100;
const pagos = new Map();

function cobrar({ cuerpo }) {
  const { pedidoId, monto } = leerJson(cuerpo);
  if (typeof pedidoId !== 'string' || typeof monto !== 'number' || !(monto > 0)) {
    throw new ErrorHttp(400, 'se requieren pedidoId y monto (numero positivo)');
  }

  const previo = pagos.get(pedidoId);
  if (previo) return json(previo.estado === 'APROBADO' ? 200 : 402, { pago: previo, repetido: true });

  const aprobado = monto <= LIMITE_POR_PAGO;
  const pago = {
    pedidoId,
    monto,
    estado: aprobado ? 'APROBADO' : 'RECHAZADO',
    motivo: aprobado ? null : `el monto supera el limite de ${LIMITE_POR_PAGO} MXN por compra`,
  };
  pagos.set(pedidoId, pago);
  return json(aprobado ? 201 : 402, { pago });
}

crearServicio({
  nombre: 'pagos',
  puerto: puertoDe('pagos'),
  rutas: [
    { metodo: 'GET', patron: /^\/salud$/, manejar: () => json(200, { servicio: 'pagos', estado: 'ok' }) },
    { metodo: 'POST', patron: /^\/pagos$/, manejar: cobrar },
    {
      metodo: 'GET',
      patron: /^\/pagos\/([^/]+)$/,
      manejar: ({ params }) => {
        const pago = pagos.get(decodeURIComponent(params[1]));
        if (!pago) throw new ErrorHttp(404, `no hay pago para el pedido ${params[1]}`);
        return json(200, { pago });
      },
    },
  ],
});
