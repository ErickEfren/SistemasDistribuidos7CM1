function crearServicioNodo({ self, nodos, Inventory, Semaphore, transporte, timeoutMs = 2000 }) {
  const peers = nodos.filter(n => n.id !== self.id);
  const inventory = new Inventory(self.products);
  const invMutex = new Semaphore('invMutex', 1);
  const pedidos = new Map();
  const respuestasPorClave = new Map();
  let contador = 0;

  class ErrorHttp extends Error {
    constructor(status, mensaje) {
      super(mensaje);
      this.status = status;
    }
  }

  function ownerOf(producto) {
    return nodos.find(n => Object.hasOwn(n.products, producto));
  }

  function respuesta(status, cuerpo, headers = {}) {
    return {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
      cuerpo: JSON.stringify(cuerpo),
    };
  }

  function leerJson(texto) {
    if (!texto) return {};
    if (texto.length > 100000) throw new ErrorHttp(413, 'el cuerpo es demasiado grande');
    let datos;
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new ErrorHttp(400, 'el cuerpo no es JSON valido');
    }
    if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
      throw new ErrorHttp(400, 'el cuerpo debe ser un objeto JSON');
    }
    return datos;
  }

  async function llamarNodo(nodo, metodo, ruta, cuerpo, headers = {}) {
    try {
      const r = await transporte(nodo, {
        metodo,
        ruta,
        headers: { 'content-type': 'application/json', ...headers },
        cuerpo: cuerpo ? JSON.stringify(cuerpo) : undefined,
      }, timeoutMs);
      return { status: r.status, datos: JSON.parse(r.cuerpo) };
    } catch (err) {
      if (err && err.name === 'TimeoutError') throw new ErrorHttp(504, `el nodo ${nodo.id} no respondio a tiempo`);
      throw new ErrorHttp(502, `el nodo ${nodo.id} no esta disponible`);
    }
  }

  function procesarLocal(producto, cantidad, cliente) {
    invMutex.tryWait({ id: 'local' });
    const resultado = inventory.processOrder({ product: producto, qty: cantidad });
    invMutex.signal();

    const id = `${self.id}-${++contador}`;
    const pedido = {
      id,
      producto,
      cantidad,
      cliente,
      estado: resultado.fulfilled ? 'DESPACHADO' : 'RECHAZADO',
      restante: resultado.remaining,
      atendidoPor: self.id,
      fecha: new Date().toISOString(),
    };
    pedidos.set(id, pedido);
    return pedido;
  }

  async function crearPedido(peticion) {
    const { producto, cantidad, cliente = 'anonimo' } = leerJson(peticion.cuerpo);
    if (typeof producto !== 'string' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1000) {
      throw new ErrorHttp(400, 'se requiere producto (texto) y cantidad (entero entre 1 y 1000)');
    }
    const dueno = ownerOf(producto);
    if (!dueno) throw new ErrorHttp(404, `producto desconocido: ${producto}`);

    const clave = peticion.headers['idempotency-key'];
    if (clave && respuestasPorClave.has(clave)) {
      const previa = respuestasPorClave.get(clave);
      return respuesta(previa.status, { ...previa.cuerpo, repetido: true }, previa.headers);
    }

    let status;
    let cuerpo;
    if (dueno.id === self.id) {
      const pedido = procesarLocal(producto, cantidad, cliente);
      status = pedido.estado === 'DESPACHADO' ? 201 : 409;
      cuerpo = { pedido, enrutadoPor: peticion.headers['x-enrutado-por'] || self.id };
    } else {
      if (peticion.headers['x-enrutado-por']) {
        throw new ErrorHttp(421, `el producto ${producto} no pertenece al nodo ${self.id}`);
      }
      const remota = await llamarNodo(
        dueno, 'POST', '/pedidos', { producto, cantidad, cliente },
        { 'idempotency-key': clave || '', 'x-enrutado-por': self.id },
      );
      status = remota.status;
      cuerpo = remota.datos;
    }

    const headers = cuerpo.pedido ? { location: `/pedidos/${cuerpo.pedido.id}` } : {};
    if (clave && (status === 201 || status === 409)) respuestasPorClave.set(clave, { status, cuerpo, headers });
    return respuesta(status, cuerpo, headers);
  }

  async function consultarPedido(id) {
    const nodoId = id.split('-')[0];
    if (nodoId === self.id) {
      const pedido = pedidos.get(id);
      if (!pedido) throw new ErrorHttp(404, `no existe el pedido ${id}`);
      return respuesta(200, { pedido });
    }
    const dueno = nodos.find(n => n.id === nodoId);
    if (!dueno) throw new ErrorHttp(404, `no existe el pedido ${id}`);
    const remota = await llamarNodo(dueno, 'GET', `/pedidos/${encodeURIComponent(id)}`);
    return respuesta(remota.status, remota.datos);
  }

  function inventarioLocal() {
    const instantanea = inventory.snapshot();
    return {
      nodo: self.id,
      nombre: self.name,
      productos: instantanea.stock,
      despachados: instantanea.fulfilled,
      rechazados: instantanea.rejected,
    };
  }

  async function stockGlobal() {
    const resultado = { [self.id]: { disponible: true, ...inventarioLocal() } };
    const respuestas = await Promise.allSettled(peers.map(p => llamarNodo(p, 'GET', '/inventario')));
    respuestas.forEach((r, i) => {
      const peer = peers[i];
      resultado[peer.id] = r.status === 'fulfilled'
        ? { disponible: true, ...r.value.datos }
        : { disponible: false, error: r.reason.message };
    });
    const completo = Object.values(resultado).every(n => n.disponible);
    return respuesta(200, { completo, nodos: resultado });
  }

  function raiz() {
    return respuesta(200, {
      nodo: self.id,
      nombre: self.name,
      productosLocales: Object.keys(self.products),
      vecinos: peers.map(p => ({ id: p.id, url: `http://${p.host}:${p.port}` })),
      endpoints: ['GET /salud', 'GET /inventario', 'GET /stock', 'POST /pedidos', 'GET /pedidos/{id}'],
    });
  }

  const rutas = [
    { metodo: 'GET', patron: /^\/$/, manejar: () => raiz() },
    { metodo: 'GET', patron: /^\/salud$/, manejar: () => respuesta(200, { estado: 'ok', nodo: self.id }) },
    { metodo: 'GET', patron: /^\/inventario$/, manejar: () => respuesta(200, inventarioLocal()) },
    { metodo: 'GET', patron: /^\/stock$/, manejar: () => stockGlobal() },
    { metodo: 'POST', patron: /^\/pedidos$/, manejar: (p) => crearPedido(p) },
    { metodo: 'GET', patron: /^\/pedidos\/([^/]+)$/, manejar: (p, m) => consultarPedido(decodeURIComponent(m[1])) },
  ];

  async function manejar(peticion) {
    try {
      const ruta = new URL(peticion.ruta, 'http://localhost').pathname.replace(/(.)\/+$/, '$1');
      const coincidentes = rutas.filter(r => r.patron.test(ruta));
      if (coincidentes.length === 0) throw new ErrorHttp(404, 'ruta no encontrada');

      const elegida = coincidentes.find(r => r.metodo === peticion.metodo);
      if (!elegida) {
        return respuesta(405, { error: 'metodo no permitido' }, { allow: coincidentes.map(r => r.metodo).join(', ') });
      }
      return await elegida.manejar(peticion, ruta.match(elegida.patron));
    } catch (err) {
      if (err instanceof ErrorHttp) return respuesta(err.status, { error: err.message });
      return respuesta(500, { error: 'error interno del nodo' });
    }
  }

  function estado() {
    return { ...inventarioLocal(), pedidosGuardados: pedidos.size, clavesGuardadas: respuestasPorClave.size };
  }

  return { manejar, estado };
}

if (typeof module !== 'undefined') module.exports = { crearServicioNodo };
