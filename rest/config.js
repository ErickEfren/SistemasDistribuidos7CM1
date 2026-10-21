const NODES = [
  { id: 'N1', name: 'Almacen Norte', host: '127.0.0.1', port: 7001, products: { Manzanas: 10 } },
  { id: 'N2', name: 'Almacen Centro', host: '127.0.0.1', port: 7002, products: { Peras: 8 } },
  { id: 'N3', name: 'Almacen Sur', host: '127.0.0.1', port: 7003, products: { Bananas: 12 } },
];

if (typeof module !== 'undefined') module.exports = { NODES };
