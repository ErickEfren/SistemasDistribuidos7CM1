function crearCliente({ nombre, nodo, transporte, generarClave, escribir, timeoutMs = 5000 }) {
  async function solicitar(metodo, ruta, cuerpo, headers = {}) {
    try {
      const r = await transporte({
        metodo,
        ruta,
        headers: { 'content-type': 'application/json', ...headers },
        cuerpo: cuerpo ? JSON.stringify(cuerpo) : undefined,
      }, timeoutMs);
      return { status: r.status, datos: JSON.parse(r.cuerpo) };
    } catch (err) {
      return { status: 0, datos: { error: err && err.name === 'TimeoutError' ? 'sin respuesta a tiempo' : 'no se pudo conectar' } };
    }
  }

  async function pedir(producto, cantidad) {
    const clave = generarClave();
    let reintentos = 0;
    for (let intento = 1; intento <= 3; intento++) {
      const r = await solicitar('POST', '/pedidos', { producto, cantidad, cliente: nombre }, { 'idempotency-key': clave });
      if ([0, 502, 503, 504].includes(r.status)) {
        escribir(`  intento ${intento} fallido (${r.datos.error}), se reintenta con la misma clave`);
        reintentos += 1;
        continue;
      }
      return { ...r, reintentos };
    }
    return { status: 0, datos: { error: 'no se pudo completar el pedido' }, reintentos };
  }

  function mostrarPedido({ status, datos }) {
    if (status === 201 || status === 409) {
      const p = datos.pedido;
      const ruta = datos.enrutadoPor === p.atendidoPor
        ? `atendido localmente por ${p.atendidoPor}`
        : `enrutado por ${datos.enrutadoPor} hacia ${p.atendidoPor}`;
      const repetido = datos.repetido ? ' [respuesta repetida, no se desconto otra vez]' : '';
      if (status === 201) {
        escribir(`${status} Pedido ${p.id} DESPACHADO: ${p.cantidad}x ${p.producto}, quedan ${p.restante} (${ruta})${repetido}`);
      } else {
        escribir(`${status} Pedido ${p.id} RECHAZADO por falta de stock: ${p.producto} (quedan ${p.restante}, pedia ${p.cantidad}) (${ruta})${repetido}`);
      }
      return;
    }
    escribir(`${status || 'sin respuesta'} Error: ${datos.error}`);
  }

  function mostrarStock({ status, datos }) {
    if (status !== 200) {
      escribir(`${status || 'sin respuesta'} Error: ${datos.error}`);
      return;
    }
    escribir(`Inventario distribuido${datos.completo ? '' : ' (INCOMPLETO)'}:`);
    for (const [id, info] of Object.entries(datos.nodos)) {
      if (!info.disponible) {
        escribir(`  ${id}: no disponible (${info.error})`);
        continue;
      }
      escribir(`  ${info.nombre} (${id}): ${JSON.stringify(info.productos)}`);
    }
  }

  function encabezado() {
    return [
      `Cliente ${nombre} usando el nodo ${nodo.name} (${nodo.id}) en http://${nodo.host}:${nodo.port}`,
      'Comandos: order <producto> <cantidad> | pedido <id> | stock | salir',
    ];
  }

  async function ejecutar(linea) {
    const [cmd, a, b] = linea.trim().split(/\s+/);
    if (cmd === 'order') {
      const r = await pedir(a, Number(b));
      mostrarPedido(r);
      return { comando: 'order', ...r };
    }
    if (cmd === 'pedido') {
      const r = await solicitar('GET', `/pedidos/${encodeURIComponent(a || '')}`);
      if (r.status === 200) escribir(`200 ${JSON.stringify(r.datos.pedido)}`);
      else escribir(`${r.status || 'sin respuesta'} Error: ${r.datos.error}`);
      return { comando: 'pedido', ...r };
    }
    if (cmd === 'stock') {
      const r = await solicitar('GET', '/stock');
      mostrarStock(r);
      return { comando: 'stock', ...r };
    }
    if (cmd === 'salir') return { comando: 'salir' };
    if (cmd) escribir('Comando no reconocido');
    return { comando: null };
  }

  return { ejecutar, encabezado };
}

if (typeof module !== 'undefined') module.exports = { crearCliente };
