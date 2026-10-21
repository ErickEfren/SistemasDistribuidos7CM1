const { ErrorTimeout, ErrorRemoto } = require('./red');

class Servidor {
  constructor({ idempotencia = false } = {}) {
    this.idempotencia = idempotencia;
    this.objetos = new Map();
    this.respuestasVistas = new Map();
  }

  registrar(nombre, objeto, { permitidos = null, ttlMs = null } = {}) {
    this.objetos.set(nombre, {
      objeto,
      permitidos,
      expira: ttlMs ? Date.now() + ttlMs : null,
    });
  }

  barrer(ahora = Date.now()) {
    let eliminados = 0;
    for (const [nombre, entrada] of this.objetos) {
      if (entrada.expira !== null && entrada.expira <= ahora) {
        this.objetos.delete(nombre);
        eliminados += 1;
      }
    }
    return eliminados;
  }

  reiniciar() {
    this.objetos.clear();
    this.respuestasVistas.clear();
  }

  async despachar({ objeto, metodo, args, idLlamada }) {
    const entrada = this.objetos.get(objeto);
    if (!entrada) return { error: `el objeto remoto '${objeto}' no existe` };
    if (entrada.permitidos && !entrada.permitidos.includes(metodo)) {
      return { error: `el metodo '${metodo}' no esta expuesto` };
    }
    if (typeof entrada.objeto[metodo] !== 'function') {
      return { error: `'${metodo}' no es un metodo de '${objeto}'` };
    }
    if (this.idempotencia && idLlamada && this.respuestasVistas.has(idLlamada)) {
      return this.respuestasVistas.get(idLlamada);
    }
    try {
      const valor = await entrada.objeto[metodo](...args);
      const respuesta = { valor };
      if (this.idempotencia && idLlamada) this.respuestasVistas.set(idLlamada, respuesta);
      return respuesta;
    } catch (err) {
      return { error: err.message };
    }
  }
}

function crearProxy(red, destino, objeto, { timeoutMs = 1000, reintentos = 0, idempotente = false } = {}) {
  let contador = 0;
  return new Proxy({}, {
    get(_, metodo) {
      if (typeof metodo === 'symbol' || metodo === 'then') return undefined;
      return async (...args) => {
        const idLlamada = idempotente ? `${objeto}.${metodo}#${contador++}:${Math.random()}` : undefined;
        let ultimoError;
        for (let intento = 0; intento <= reintentos; intento++) {
          try {
            const respuesta = await red.enviar(destino, { objeto, metodo, args, idLlamada }, timeoutMs);
            if (respuesta.error) throw new ErrorRemoto(respuesta.error);
            return respuesta.valor;
          } catch (err) {
            if (!(err instanceof ErrorTimeout)) throw err;
            ultimoError = err;
          }
        }
        throw ultimoError;
      };
    },
  });
}

module.exports = { Servidor, crearProxy };
