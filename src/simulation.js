const { Semaphore } = require('./semaphore');
const { SharedBuffer } = require('./buffer');
const { Inventory } = require('./inventory');
const { RoundRobinScheduler } = require('./scheduler');
const {
  SimProcess,
  producerProcess,
  customOrderProcess,
  consumerProcess,
  PRODUCTS,
} = require('./process');

const INITIAL_STOCK = { Manzanas: 10, Peras: 8, Bananas: 12 };

class Simulation {
  constructor({ bufferSize = 5, quantum = 3 } = {}) {
    this.bufferSize = bufferSize;
    this.buffer = new SharedBuffer(bufferSize);
    this.inventory = new Inventory(INITIAL_STOCK);
    this.semaphores = {
      mutex: new Semaphore('mutex', 1),
      empty: new Semaphore('empty', bufferSize),
      full: new Semaphore('full', 0),
      invMutex: new Semaphore('invMutex', 1),
    };
    this.scheduler = new RoundRobinScheduler(quantum);
    this.running = false;
    this.connectedClients = 0;
  }

  logEvent(msg) {
    this.scheduler.log(msg);
  }

  clientConnected() {
    this.connectedClients += 1;
    return this.connectedClients;
  }

  clientDisconnected() {
    this.connectedClients = Math.max(0, this.connectedClients - 1);
  }

  addProducer() {
    const p = new SimProcess('producer', (id) => producerProcess(this.bufferSize, id));
    this.scheduler.addProcess(p);
    return p.id;
  }

  addConsumer() {
    const c = new SimProcess('consumer', (id) => consumerProcess(id));
    this.scheduler.addProcess(c);
    return c.id;
  }

  addCustomOrder(product, qty) {
    if (!PRODUCTS.includes(product)) throw new Error(`Producto invalido: ${product}`);
    const safeQty = Math.max(1, Math.min(20, Number(qty) || 1));
    const p = new SimProcess('producer', (id) => customOrderProcess(id, product, safeQty));
    this.scheduler.addProcess(p);
    return p.id;
  }

  removeProcess(id) {
    this.scheduler.removeProcess(id);
  }

  setQuantum(q) {
    this.scheduler.setQuantum(q);
  }

  _executeInstruction = (process, instruction) => {
    switch (instruction.type) {
      case 'work':
        return { ok: true };

      case 'sem_wait': {
        const sem = this.semaphores[instruction.sem];
        const canRun = sem.tryWait(process);
        if (!canRun) {
          this.scheduler.block(process, instruction.sem);
          return { blocked: true };
        }
        return { ok: true };
      }

      case 'sem_signal': {
        const sem = this.semaphores[instruction.sem];
        const woken = sem.signal();
        if (woken) this.scheduler.wake(woken);
        return { ok: true };
      }

      case 'buffer_put':
        this.buffer.put(instruction.item);
        return { ok: true };

      case 'buffer_take': {
        const item = this.buffer.take();
        return { ok: true, value: item };
      }

      case 'inventory_process':
        return { ok: true, ...this.inventory.processOrder(instruction.order) };

      default:
        return { ok: false };
    }
  };

  tick() {
    return this.scheduler.runTurn(this._executeInstruction);
  }

  snapshot() {
    return {
      buffer: this.buffer.snapshot(),
      inventory: this.inventory.snapshot(),
      semaphores: {
        mutex: this.semaphores.mutex.snapshot(),
        empty: this.semaphores.empty.snapshot(),
        full: this.semaphores.full.snapshot(),
        invMutex: this.semaphores.invMutex.snapshot(),
      },
      scheduler: this.scheduler.snapshot(),
      processes: [...this.scheduler.readyQueue].map(p => ({ id: p.id, type: p.type, state: p.state })),
      connectedClients: this.connectedClients,
    };
  }
}

module.exports = { Simulation, PRODUCTS };
