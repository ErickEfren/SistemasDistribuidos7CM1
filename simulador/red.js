class RedNavegador {
  constructor({ alEvento }) {
    this.latenciaBase = 300;
    this.probPerdida = 0.03;
    this.servidores = new Map();
    this.alEvento = alEvento;
  }

  registrar(id, servidor) {
    this.servidores.set(id, servidor);
  }

  quitar(id) {
    this.servidores.delete(id);
  }

  latencia() {
    if (Math.random() < 0.02) return this.latenciaBase * (6 + Math.random() * 2);
    return this.latenciaBase * (0.5 + Math.random());
  }

  error(nombre, mensaje) {
    const err = new Error(mensaje);
    err.name = nombre;
    return err;
  }

  enviar(origen, destino, peticion, timeoutMs) {
    return new Promise((resolve, reject) => {
      let terminado = false;
      const temporizador = setTimeout(() => terminar(reject, this.error('TimeoutError', 'timeout')), timeoutMs);
      const terminar = (fn, valor) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        fn(valor);
      };

      const ida = this.latencia();
      const perderIda = Math.random() < this.probPerdida;
      this.alEvento({ tipo: 'solicitud', origen, destino, duracion: ida, perdido: perderIda });

      setTimeout(async () => {
        if (perderIda) return;
        const servidor = this.servidores.get(destino);
        const vuelta = this.latencia();

        if (!servidor) {
          this.alEvento({ tipo: 'rechazo', origen: destino, destino: origen, duracion: vuelta, perdido: false });
          setTimeout(() => terminar(reject, this.error('ErrorConexion', 'ECONNREFUSED')), vuelta);
          return;
        }

        const respuesta = await servidor.manejar(peticion);
        if (this.servidores.get(destino) !== servidor) return;

        const perderVuelta = Math.random() < this.probPerdida;
        this.alEvento({ tipo: 'respuesta', origen: destino, destino: origen, duracion: vuelta, perdido: perderVuelta, status: respuesta.status });
        setTimeout(() => {
          if (!perderVuelta) terminar(resolve, respuesta);
        }, vuelta);
      }, ida);
    });
  }
}
