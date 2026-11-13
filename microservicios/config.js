const PUERTOS = {
  gateway: 8080,
  catalogo: 8081,
  inventario: 8082,
  pedidos: 8083,
  pagos: 8084,
};

const URLS = {
  catalogo: process.env.CATALOGO_URL || `http://127.0.0.1:${PUERTOS.catalogo}`,
  inventario: process.env.INVENTARIO_URL || `http://127.0.0.1:${PUERTOS.inventario}`,
  pedidos: process.env.PEDIDOS_URL || `http://127.0.0.1:${PUERTOS.pedidos}`,
  pagos: process.env.PAGOS_URL || `http://127.0.0.1:${PUERTOS.pagos}`,
};

const HOST = process.env.HOST || '127.0.0.1';

function puertoDe(servicio) {
  return Number(process.env.PORT || PUERTOS[servicio]);
}

module.exports = { PUERTOS, URLS, HOST, puertoDe };
