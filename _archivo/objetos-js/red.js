class ErrorTimeout extends Error {
  constructor(destino, ms) {
    super(`timeout de ${ms}ms esperando a '${destino}'`);
    this.name = 'ErrorTimeout';
  }
}

class ErrorRemoto extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorRemoto';
  }
}

class RedSimulada {
  constructor({ latenciaMs = 0, probPerderSolicitud = 0, probPerderRespuesta = 0, azar = Math.random } = {}) {
    this.latenciaMs = latenciaMs;
    this.probPerderSolicitud = probPerderSolicitud;
    this.probPerderRespuesta = probPerderRespuesta;
    this.azar = azar;
    this.servidores = new Map();
    this.mensajes = 0;
  }

  conectar(nombre, servidor) {
    this.servidores.set(nombre, servidor);
  }

  pausa(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  retardo() {
    if (!Array.isArray(this.latenciaMs)) return this.latenciaMs;
    const [min, max] = this.latenciaMs;
    return min + this.azar() * (max - min);
  }

  async enviar(destino, solicitud, timeoutMs) {
    this.mensajes += 1;
    const perderSolicitud = this.azar() < this.probPerderSolicitud;
    const perderRespuesta = this.azar() < this.probPerderRespuesta;
    const textoSolicitud = JSON.stringify(solicitud);

    let temporizador;
    const limite = new Promise((_, rechazar) => {
      temporizador = setTimeout(() => rechazar(new ErrorTimeout(destino, timeoutMs)), timeoutMs);
    });

    const viaje = (async () => {
      await this.pausa(this.retardo());
      if (perderSolicitud) return new Promise(() => {});
      const respuesta = await this.servidores.get(destino).despachar(JSON.parse(textoSolicitud));
      if (perderRespuesta) return new Promise(() => {});
      await this.pausa(this.retardo());
      return JSON.parse(JSON.stringify(respuesta));
    })();

    try {
      return await Promise.race([viaje, limite]);
    } finally {
      clearTimeout(temporizador);
    }
  }
}

module.exports = { RedSimulada, ErrorTimeout, ErrorRemoto };
