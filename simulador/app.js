const SVG = 'http://www.w3.org/2000/svg';
const PRODUCTOS = NODES.flatMap(n => Object.keys(n.products));
const CLIENTES = [
  { nombre: 'Ana', nodo: 'N1', x: 100 },
  { nombre: 'Beto', nodo: 'N2', x: 300 },
  { nombre: 'Carla', nodo: 'N3', x: 500 },
  { nombre: 'Diego', nodo: 'N1', x: 700 },
  { nombre: 'Elena', nodo: 'N3', x: 900 },
];
const POS = { N1: { x: 200, y: 105 }, N2: { x: 500, y: 62 }, N3: { x: 800, y: 105 } };
const Y_CLIENTES = 330;
const LATENCIA_BASE = 300;
const PROB_PERDIDA = 0.03;

const stats = { desp: 0, rech: 0, err: 0, ret: 0, rep: 0 };
const nodos = new Map();
const particulas = [];
let ultimoEvento = 'todos los servidores en línea';

const red = new RedNavegador({ alEvento: animarMensaje });
red.latenciaBase = LATENCIA_BASE;
red.probPerdida = PROB_PERDIDA;
const svg = document.getElementById('diagrama');
const capaParticulas = document.createElementNS(SVG, 'g');

function nuevaClave() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function azar(min, max) {
  return min + Math.random() * (max - min);
}

function elemento(etiqueta, atributos = {}, padre = null) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  if (padre) padre.appendChild(el);
  return el;
}

function claseLinea(texto) {
  if (texto.startsWith('>')) return 'lcmd';
  if (texto.startsWith('  intento')) return 'lint';
  const m = texto.match(/-> (\d{3})|^(\d{3}) /);
  const codigo = m ? Number(m[1] || m[2]) : null;
  if (codigo >= 200 && codigo < 300) return 'l2xx';
  if (codigo === 409) return 'l409';
  if (codigo >= 400 && codigo < 500) return 'l4xx';
  if (codigo >= 500) return 'l5xx';
  if (texto.startsWith('sin respuesta') || texto.includes('[proceso detenido]')) return 'lerr';
  if (texto.includes('escuchando en') || texto.startsWith('Cliente ') || texto.startsWith('Comandos:')) return 'lsis';
  return '';
}

function crearConsola(contenedor) {
  const caja = document.createElement('div');
  caja.className = 'consola';
  contenedor.appendChild(caja);
  return {
    escribir(texto) {
      const pegado = caja.scrollTop + caja.clientHeight >= caja.scrollHeight - 4;
      const linea = document.createElement('div');
      linea.textContent = texto;
      const clase = claseLinea(texto);
      if (clase) linea.className = clase;
      caja.appendChild(linea);
      while (caja.childElementCount > 150) caja.firstChild.remove();
      if (pegado) caja.scrollTop = caja.scrollHeight;
    },
  };
}

function posicion(id) {
  if (POS[id]) return POS[id];
  const cliente = CLIENTES.find(c => `c:${c.nombre}` === id);
  return { x: cliente.x, y: Y_CLIENTES };
}

function colorMensaje(evento) {
  if (evento.tipo === 'solicitud') return '#6ea8fe';
  if (evento.tipo === 'rechazo') return '#ff6b6b';
  if (evento.status >= 200 && evento.status < 300) return '#5cd08d';
  if (evento.status === 409) return '#f0a35b';
  if (evento.status >= 400 && evento.status < 500) return '#e6d36b';
  return '#ff6b6b';
}

function animarMensaje(evento) {
  const desde = posicion(evento.origen);
  const hasta = posicion(evento.destino);
  const circulo = elemento('circle', { r: 6, fill: colorMensaje(evento), cx: desde.x, cy: desde.y }, capaParticulas);
  particulas.push({ circulo, desde, hasta, inicio: performance.now(), duracion: evento.duracion, perdido: evento.perdido });
}

function cuadro(ahora) {
  for (let i = particulas.length - 1; i >= 0; i--) {
    const p = particulas[i];
    const avance = Math.max(0, (ahora - p.inicio) / p.duracion);
    if (p.perdido && avance >= 0.55) {
      const x = p.desde.x + (p.hasta.x - p.desde.x) * 0.55;
      const y = p.desde.y + (p.hasta.y - p.desde.y) * 0.55;
      p.circulo.remove();
      const marca = elemento('text', { x, y: y + 6, 'text-anchor': 'middle', fill: '#ff6b6b', 'font-size': 20, 'font-weight': 700 }, capaParticulas);
      marca.textContent = '✕';
      setTimeout(() => marca.remove(), 900);
      particulas.splice(i, 1);
      continue;
    }
    if (avance >= 1) {
      p.circulo.remove();
      particulas.splice(i, 1);
      continue;
    }
    p.circulo.setAttribute('cx', p.desde.x + (p.hasta.x - p.desde.x) * avance);
    p.circulo.setAttribute('cy', p.desde.y + (p.hasta.y - p.desde.y) * avance);
  }
  requestAnimationFrame(cuadro);
}

function dibujarDiagrama() {
  const fondo = elemento('g', {}, svg);
  const ids = Object.keys(POS);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = POS[ids[i]];
      const b = POS[ids[j]];
      elemento('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#2f3546', 'stroke-width': 2 }, fondo);
    }
  }
  for (const c of CLIENTES) {
    const n = POS[c.nodo];
    elemento('line', { x1: c.x, y1: Y_CLIENTES, x2: n.x, y2: n.y, stroke: '#262a35', 'stroke-width': 1.5, 'stroke-dasharray': '5 5' }, fondo);
  }

  for (const nodo of NODES) {
    const { x, y } = POS[nodo.id];
    const g = elemento('g', {}, svg);
    const circulo = elemento('circle', { cx: x, cy: y, r: 42, fill: '#1c2a44', stroke: '#3d8bfd', 'stroke-width': 2 }, g);
    const titulo = elemento('text', { x, y: y - 4, 'text-anchor': 'middle', fill: '#e6e6e6', 'font-size': 18, 'font-weight': 700 }, g);
    titulo.textContent = nodo.id;
    const detalle = elemento('text', { x, y: y + 16, 'text-anchor': 'middle', fill: '#9aa0ab', 'font-size': 11 }, g);
    const nombre = elemento('text', { x, y: y + 60, 'text-anchor': 'middle', fill: '#9aa0ab', 'font-size': 12 }, g);
    nombre.textContent = `${nodo.name} · :${nodo.port}`;
    nodos.get(nodo.id).svg = { circulo, detalle };
  }

  for (const c of CLIENTES) {
    const g = elemento('g', {}, svg);
    elemento('rect', { x: c.x - 48, y: Y_CLIENTES - 18, width: 96, height: 36, rx: 8, fill: '#1b2230', stroke: '#3a4256' }, g);
    const t = elemento('text', { x: c.x, y: Y_CLIENTES + 5, 'text-anchor': 'middle', fill: '#e6e6e6', 'font-size': 13 }, g);
    t.textContent = c.nombre;
  }

  svg.appendChild(capaParticulas);
}

function encender(id) {
  const e = nodos.get(id);
  const servicio = crearServicioNodo({
    self: e.nodo,
    nodos: NODES,
    Inventory,
    Semaphore,
    transporte: (destino, peticion, timeoutMs) => red.enviar(id, destino.id, peticion, timeoutMs),
  });
  const servidor = {
    async manejar(peticion) {
      const inicio = performance.now();
      const r = await servicio.manejar(peticion);
      if (e.servidor === servidor) {
        e.consola.escribir(`${id} ${peticion.metodo} ${peticion.ruta} -> ${r.status} (${Math.round(performance.now() - inicio)}ms)`);
      }
      return r;
    },
  };
  e.servicio = servicio;
  e.servidor = servidor;
  red.registrar(id, servidor);
  e.consola.escribir(`${e.nodo.name} (${id}) escuchando en http://${e.nodo.host}:${e.nodo.port} - productos locales: ${Object.keys(e.nodo.products).join(', ')}`);
}

function apagar(id) {
  const e = nodos.get(id);
  red.quitar(id);
  e.servidor = null;
  e.consola.escribir('[proceso detenido]');
}

function crearTarjetasNodos() {
  const contenedor = document.getElementById('nodos');
  for (const nodo of NODES) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'panel';
    tarjeta.innerHTML = `
      <div class="nodo-cab">
        <div><div class="nodo-nombre"></div><div class="url"></div></div>
        <span class="pill on">en línea</span>
      </div>
      <div class="inventario"></div>
      <div class="metricas">
        <span>Despachados: <b data-m="despachados">0</b></span>
        <span>Rechazados: <b data-m="rechazados">0</b></span>
        <span>Pedidos guardados: <b data-m="pedidosGuardados">0</b></span>
        <span>Claves de idempotencia: <b data-m="clavesGuardadas">0</b></span>
      </div>`;
    tarjeta.querySelector('.nodo-nombre').textContent = `${nodo.name} (${nodo.id})`;
    tarjeta.querySelector('.url').textContent = `http://${nodo.host}:${nodo.port}`;

    const inventario = tarjeta.querySelector('.inventario');
    const barras = {};
    for (const [producto, inicial] of Object.entries(nodo.products)) {
      const fila = document.createElement('div');
      fila.className = 'stock-row';
      fila.innerHTML = '<span class="nombre"></span><div class="stock-bar"><div></div></div><b class="cant"></b>';
      fila.querySelector('.nombre').textContent = producto;
      inventario.appendChild(fila);
      barras[producto] = { barra: fila.querySelector('.stock-bar > div'), cant: fila.querySelector('.cant'), inicial };
    }

    const consola = crearConsola(tarjeta);
    contenedor.appendChild(tarjeta);
    nodos.set(nodo.id, { nodo, tarjeta, barras, consola, servidor: null, servicio: null });
  }
}

function pintarNodos() {
  for (const e of nodos.values()) {
    const encendido = Boolean(e.servidor);
    e.tarjeta.classList.toggle('apagado', !encendido);
    const pill = e.tarjeta.querySelector('.pill');
    pill.className = `pill ${encendido ? 'on' : 'off'}`;
    pill.textContent = encendido ? 'en línea' : 'caído';

    if (e.svg) {
      e.svg.circulo.setAttribute('fill', encendido ? '#1c2a44' : '#2c1b1b');
      e.svg.circulo.setAttribute('stroke', encendido ? '#3d8bfd' : '#ff6b6b');
    }
    if (!encendido) {
      if (e.svg) e.svg.detalle.textContent = 'caído';
      continue;
    }

    const datos = e.servicio.estado();
    for (const [producto, b] of Object.entries(e.barras)) {
      const cantidad = datos.productos[producto];
      b.barra.style.width = `${Math.max(0, Math.min(100, (cantidad / b.inicial) * 100))}%`;
      b.cant.textContent = cantidad;
    }
    for (const el of e.tarjeta.querySelectorAll('[data-m]')) el.textContent = datos[el.dataset.m];
    if (e.svg) {
      const [producto] = Object.keys(e.nodo.products);
      e.svg.detalle.textContent = `${producto}: ${datos.productos[producto]}`;
    }
  }
}

function pintarCondiciones() {
  const caja = document.getElementById('condiciones');
  caja.innerHTML = `
    <span>Latencia de la red: <b>${LATENCIA_BASE / 2}-${LATENCIA_BASE * 1.5} ms</b>, con picos ocasionales de hasta ${LATENCIA_BASE * 8} ms</span>
    <span>Mensajes perdidos: <b>${PROB_PERDIDA * 100}%</b></span>
    <span>Tiempo de espera: <b>2 s</b> entre servidores, <b>5 s</b> del cliente</span>
    <span class="evento"></span>`;
  caja.querySelector('.evento').textContent = `Último evento: ${ultimoEvento}`;
}

function contar(r) {
  if (r.comando !== 'order') return;
  if (r.status === 201) stats.desp += 1;
  else if (r.status === 409) stats.rech += 1;
  else stats.err += 1;
  stats.ret += r.reintentos || 0;
  if (r.datos && r.datos.repetido) stats.rep += 1;
  document.getElementById('sDesp').textContent = stats.desp;
  document.getElementById('sRech').textContent = stats.rech;
  document.getElementById('sErr').textContent = stats.err;
  document.getElementById('sRet').textContent = stats.ret;
  document.getElementById('sRep').textContent = stats.rep;
}

async function vidaCliente(definicion) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'panel';
  const titulo = document.createElement('h2');
  titulo.textContent = `${definicion.nombre} · entra por ${definicion.nodo}`;
  tarjeta.appendChild(titulo);
  document.getElementById('clientes').appendChild(tarjeta);
  const consola = crearConsola(tarjeta);

  const nodo = NODES.find(n => n.id === definicion.nodo);
  const cliente = crearCliente({
    nombre: definicion.nombre,
    nodo,
    transporte: (peticion, timeoutMs) => red.enviar(`c:${definicion.nombre}`, nodo.id, peticion, timeoutMs),
    generarClave: nuevaClave,
    escribir: (linea) => consola.escribir(linea),
  });
  for (const linea of cliente.encabezado()) consola.escribir(linea);

  let ultimoPedido = null;
  await esperar(azar(0, 2500));
  while (true) {
    await esperar(azar(3000, 8000));
    const tirada = Math.random();
    let linea;
    if (tirada < 0.62) linea = `order ${PRODUCTOS[Math.floor(Math.random() * PRODUCTOS.length)]} ${1 + Math.floor(Math.random() * 2)}`;
    else if (tirada < 0.85 || !ultimoPedido) linea = 'stock';
    else linea = `pedido ${ultimoPedido}`;

    consola.escribir(`> ${linea}`);
    const r = await cliente.ejecutar(linea);
    if (r.comando === 'order' && r.datos && r.datos.pedido) ultimoPedido = r.datos.pedido.id;
    contar(r);
  }
}

async function fallasDelSistema() {
  while (true) {
    await esperar(azar(25000, 50000));
    const encendidos = [...nodos.keys()].filter(id => nodos.get(id).servidor);
    if (encendidos.length < NODES.length) continue;
    const id = encendidos[Math.floor(Math.random() * encendidos.length)];
    const caida = azar(8000, 16000);
    apagar(id);
    ultimoEvento = `${id} se cayó; volverá en unos ${Math.round(caida / 1000)} s y perderá lo que tenía en memoria`;
    pintarCondiciones();
    pintarNodos();
    await esperar(caida);
    encender(id);
    ultimoEvento = `${id} se recuperó con su inventario inicial`;
    pintarCondiciones();
    pintarNodos();
  }
}

crearTarjetasNodos();
dibujarDiagrama();
for (const nodo of NODES) encender(nodo.id);
pintarCondiciones();
pintarNodos();
for (const definicion of CLIENTES) vidaCliente(definicion);
fallasDelSistema();
setInterval(pintarNodos, 250);
requestAnimationFrame(cuadro);
