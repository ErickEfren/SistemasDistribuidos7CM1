class Almacen {
  constructor(stockInicial, bitacora) {
    this.stockActual = { ...stockInicial };
    this.ventas = [];
    this.bitacora = bitacora;
  }

  stock(producto) {
    return this.stockActual[producto] ?? 0;
  }

  descontar(producto, cantidad) {
    this.stockActual[producto] -= cantidad;
    this.bitacora.descontado[producto] = (this.bitacora.descontado[producto] || 0) + cantidad;
    return this.stockActual[producto];
  }

  registrarVenta(venta) {
    this.ventas.push(venta);
    return this.ventas.length;
  }

  resumenPorHora() {
    const porHora = {};
    for (const venta of this.ventas) {
      const hora = venta.fecha.getHours();
      porHora[hora] = (porHora[hora] || 0) + venta.cantidad;
    }
    return porHora;
  }
}

class Carrito {
  constructor() {
    this.items = [];
  }

  agregar(producto) {
    this.items.push(producto);
    return this.items.length;
  }
}

class Fabrica {
  constructor(servidor, ttlMs = null) {
    this.servidor = servidor;
    this.ttlMs = ttlMs;
    this.contador = 0;
  }

  crearCarrito() {
    const nombre = `carrito-${this.contador++}`;
    this.servidor.registrar(nombre, new Carrito(), { ttlMs: this.ttlMs });
    return nombre;
  }
}

module.exports = { Almacen, Carrito, Fabrica };
