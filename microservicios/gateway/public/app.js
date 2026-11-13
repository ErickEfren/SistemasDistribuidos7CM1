const SERVICIOS = [
  ['gateway', 8080],
  ['catalogo', 8081],
  ['inventario', 8082],
  ['pedidos', 8083],
  ['pagos', 8084],
];
const ESTADOS = {
  CONFIRMADO: 'Confirmado',
  RECHAZADO_SIN_STOCK: 'Sin stock',
  PAGO_RECHAZADO: 'Pago rechazado',
  FALLIDO: 'Fallido',
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
};

const el = (id) => document.getElementById(id);

function nuevaClave() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function nodo(etiqueta, texto, clase) {
  const n = document.createElement(etiqueta);
  if (texto !== undefined) n.textContent = texto;
  if (clase) n.className = clase;
  return n;
}

async function pedirJson(ruta, opciones) {
  const respuesta = await fetch(ruta, opciones);
  return { status: respuesta.status, datos: await respuesta.json() };
}

function pintarServicios(estados) {
  const caja = el('servicios');
  caja.replaceChildren();
  for (const [nombre, puerto] of SERVICIOS) {
    const estado = estados ? (nombre === 'gateway' ? 'ok' : estados[nombre]) : 'caido';
    const item = nodo('div', undefined, 'servicio');
    item.append(nodo('span', nombre), nodo('small', `:${puerto}`), nodo('span', estado === 'ok' ? 'en línea' : estado === 'caido' ? 'caído' : 'error', `pill ${estado}`));
    caja.append(item);
  }
}

function pintarProductos({ productos, inventarioDisponible }) {
  const caja = el('productos');
  caja.replaceChildren();
  for (const p of productos) {
    const fila = nodo('div', undefined, 'producto');
    const izquierda = nodo('div');
    izquierda.append(nodo('div', p.nombre), nodo('small', `${p.precio} MXN · ${p.id}`));
    fila.append(izquierda, nodo('span', p.stock === null ? 'sin datos' : `${p.stock} en stock`, 'stock'));
    caja.append(fila);
  }
  if (!inventarioDisponible) caja.append(nodo('div', 'El servicio de inventario no responde: el catálogo se muestra sin existencias.', 'aviso'));

  const select = el('producto');
  if (select.options.length === 0) {
    for (const p of productos) {
      const opcion = nodo('option', `${p.nombre} (${p.precio} MXN)`);
      opcion.value = p.id;
      select.append(opcion);
    }
  }
}

function pintarPedidos(pedidos) {
  const caja = el('pedidos');
  caja.replaceChildren();
  if (pedidos.length === 0) {
    caja.append(nodo('div', 'Todavía no hay pedidos.', 'vacio'));
    return;
  }
  const tabla = nodo('table');
  const cabecera = nodo('tr');
  for (const t of ['Pedido', 'Cliente', 'Producto', 'Total', 'Estado', 'Pasos']) cabecera.append(nodo('th', t));
  tabla.append(cabecera);
  for (const p of pedidos) {
    const fila = nodo('tr');
    fila.append(
      nodo('td', p.id),
      nodo('td', p.cliente),
      nodo('td', `${p.cantidad}x ${p.nombre}`),
      nodo('td', `${p.monto} MXN`),
      nodo('td', ESTADOS[p.estado] || p.estado, `estado ${p.estado}`),
      nodo('td', p.pasos.join(' → '), 'pasos'),
    );
    tabla.append(fila);
  }
  caja.append(tabla);
}

function pintarResultado(status, datos) {
  const caja = el('resultado');
  caja.replaceChildren();
  if (!datos.pedido) {
    caja.append(nodo('div', `${status}: ${datos.error}`, 'estado FALLIDO'));
    return;
  }
  const p = datos.pedido;
  caja.append(nodo('div', `${status} · ${p.id}: ${ESTADOS[p.estado] || p.estado}${datos.repetido ? ' (respuesta repetida)' : ''}`, `estado ${p.estado}`));
  const lista = nodo('ol');
  for (const paso of p.pasos) lista.append(nodo('li', paso));
  caja.append(lista);
}

async function actualizar() {
  try {
    const [salud, productos, pedidos] = await Promise.all([
      pedirJson('/api/salud'),
      pedirJson('/api/productos'),
      pedirJson('/api/pedidos'),
    ]);
    pintarServicios(salud.datos.servicios);
    if (productos.status === 200) pintarProductos(productos.datos);
    else el('productos').replaceChildren(nodo('div', `${productos.status}: ${productos.datos.error}`, 'aviso'));
    if (pedidos.status === 200) pintarPedidos(pedidos.datos.pedidos);
    else el('pedidos').replaceChildren(nodo('div', `${pedidos.status}: ${pedidos.datos.error}`, 'aviso'));
  } catch {
    pintarServicios(null);
  }
}

el('formulario').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = el('enviar');
  boton.disabled = true;
  try {
    const { status, datos } = await pedirJson('/api/pedidos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': nuevaClave() },
      body: JSON.stringify({ producto: el('producto').value, cantidad: Number(el('cantidad').value), cliente: el('cliente').value }),
    });
    pintarResultado(status, datos);
  } catch {
    pintarResultado(0, { error: 'no se pudo conectar con el gateway' });
  } finally {
    boton.disabled = false;
    actualizar();
  }
});

actualizar();
setInterval(actualizar, 2000);
