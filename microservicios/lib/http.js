const http = require('http');
const crypto = require('crypto');
const { HOST } = require('../config');

class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function json(status, cuerpo, headers = {}) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    cuerpo: JSON.stringify(cuerpo),
  };
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (fragmento) => {
      if (datos.length <= 100000) datos += fragmento;
    });
    req.on('end', () => resolve(datos));
  });
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

function crearServicio({ nombre, puerto, rutas }) {
  const servidor = http.createServer(async (req, res) => {
    const inicio = Date.now();
    const idSolicitud = req.headers['x-request-id'] || crypto.randomUUID();
    let respuesta;
    try {
      const url = new URL(req.url, 'http://localhost');
      const ruta = url.pathname.replace(/(.)\/+$/, '$1');
      const coincidentes = rutas.filter(r => r.patron.test(ruta));
      if (coincidentes.length === 0) throw new ErrorHttp(404, 'ruta no encontrada');
      const elegida = coincidentes.find(r => r.metodo === req.method);
      if (!elegida) {
        respuesta = json(405, { error: 'metodo no permitido' }, { allow: coincidentes.map(r => r.metodo).join(', ') });
      } else {
        respuesta = await elegida.manejar({
          ruta,
          params: ruta.match(elegida.patron),
          headers: req.headers,
          cuerpo: await leerCuerpo(req),
          idSolicitud,
        });
      }
    } catch (err) {
      if (err instanceof ErrorHttp) {
        respuesta = json(err.status, { error: err.message });
      } else {
        console.error(`[${nombre}]`, err);
        respuesta = json(500, { error: `error interno en el servicio de ${nombre}` });
      }
    }
    res.writeHead(respuesta.status, { ...respuesta.headers, 'x-request-id': idSolicitud });
    res.end(respuesta.cuerpo);
    console.log(`[${nombre}] ${idSolicitud.slice(0, 8)} ${req.method} ${req.url} -> ${respuesta.status} (${Date.now() - inicio}ms)`);
  });

  servidor.listen(puerto, HOST, () => {
    console.log(`[${nombre}] escuchando en http://${HOST}:${puerto}`);
  });
  return servidor;
}

async function llamar(servicio, base, metodo, ruta, { cuerpo, headers = {}, idSolicitud, timeoutMs = 2000 } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: { 'content-type': 'application/json', 'x-request-id': idSolicitud || crypto.randomUUID(), ...headers },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new ErrorHttp(504, `el servicio de ${servicio} no respondio a tiempo`);
    throw new ErrorHttp(503, `el servicio de ${servicio} no esta disponible`);
  }
  const texto = await respuesta.text();
  try {
    return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null };
  } catch {
    throw new ErrorHttp(502, `el servicio de ${servicio} respondio algo que no es JSON`);
  }
}

module.exports = { ErrorHttp, json, leerJson, crearServicio, llamar };
