const { puertoDe } = require('../config');
const { ErrorHttp, json, crearServicio } = require('../lib/http');

const PRODUCTOS = [
  { id: 'manzanas', nombre: 'Manzanas', precio: 12 },
  { id: 'peras', nombre: 'Peras', precio: 15 },
  { id: 'bananas', nombre: 'Bananas', precio: 9 },
];

crearServicio({
  nombre: 'catalogo',
  puerto: puertoDe('catalogo'),
  rutas: [
    { metodo: 'GET', patron: /^\/salud$/, manejar: () => json(200, { servicio: 'catalogo', estado: 'ok' }) },
    { metodo: 'GET', patron: /^\/productos$/, manejar: () => json(200, { productos: PRODUCTOS }) },
    {
      metodo: 'GET',
      patron: /^\/productos\/([^/]+)$/,
      manejar: ({ params }) => {
        const producto = PRODUCTOS.find(p => p.id === decodeURIComponent(params[1]));
        if (!producto) throw new ErrorHttp(404, `producto desconocido: ${params[1]}`);
        return json(200, { producto });
      },
    },
  ],
});
