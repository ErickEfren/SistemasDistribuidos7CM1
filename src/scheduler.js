const { STATES } = require('./process');

class RoundRobinScheduler {
  constructor(quantum = 3) {
    this.quantum = quantum;
    this.readyQueue = [];
    this.finished = [];
    this.events = [];
  }

  addProcess(process) {
    process.state = STATES.READY;
    this.readyQueue.push(process);
    this._log(`${process.id} (${process.type}) admitido en cola de listos`);
  }

  removeProcess(id) {
    this.readyQueue = this.readyQueue.filter(p => p.id !== id);
  }

  setQuantum(q) {
    this.quantum = Math.max(1, q | 0);
  }

  wake(process) {
    process.state = STATES.READY;
    process.blockedOn = null;
    this.readyQueue.push(process);
    this._log(`${process.id} desbloqueado -> vuelve a cola de listos`);
  }

  block(process, semName) {
    process.state = STATES.BLOCKED;
    process.blockedOn = semName;
    this._log(`${process.id} bloqueado esperando semaforo '${semName}'`);
  }

  finish(process) {
    process.state = STATES.DONE;
    this.finished.push(process.id);
    this._log(`${process.id} finalizo su ejecucion`);
  }

  _log(msg) {
    this.events.push(msg);
    if (this.events.length > 200) this.events.shift();
  }

  log(msg) {
    this._log(msg);
  }

  runTurn(executeInstruction) {
    if (this.readyQueue.length === 0) return null;

    const process = this.readyQueue.shift();
    process.state = STATES.RUNNING;
    this._log(`--- Cambio de contexto: CPU asignada a ${process.id} (quantum=${this.quantum}) ---`);

    let ticksUsed = 0;
    let outcome = 'quantum_expired';

    while (ticksUsed < this.quantum) {
      const instruction = process.step();
      ticksUsed++;

      if (instruction === null) {
        this.finish(process);
        outcome = 'finished';
        break;
      }

      const result = executeInstruction(process, instruction);
      process.feedResult(result && result.value);
      this._log(`${process.id}: ${describeInstruction(instruction, result)}`);

      if (result && result.blocked) {
        outcome = 'blocked';
        break;
      }
    }

    if (outcome === 'quantum_expired' && process.state === STATES.RUNNING) {
      process.state = STATES.READY;
      this.readyQueue.push(process);
      this._log(`${process.id} agoto su quantum -> vuelve al final de la cola`);
    }

    return { processId: process.id, ticksUsed, outcome };
  }

  snapshot() {
    return {
      quantum: this.quantum,
      ready: this.readyQueue.map(p => p.id),
      finished: this.finished,
      recentEvents: this.events.slice(-30),
    };
  }
}

function describeInstruction(instruction, result) {
  switch (instruction.type) {
    case 'work': return instruction.label;
    case 'sem_wait': return `wait(${instruction.sem})` + (result && result.blocked ? ' -> BLOQUEADO' : ' -> OK');
    case 'sem_signal': return `signal(${instruction.sem})`;
    case 'buffer_put': {
      const o = instruction.item;
      return `encola pedido ${o.orderId}: ${o.qty}x ${o.product}`;
    }
    case 'buffer_take': {
      const o = result && result.value;
      return o ? `retira de la cola: pedido ${o.orderId} (${o.qty}x ${o.product})` : 'retira de la cola';
    }
    case 'inventory_process': {
      const o = instruction.order;
      if (!result) return `procesa inventario para ${o.orderId}`;
      return result.fulfilled
        ? `pedido ${o.orderId} DESPACHADO (${o.qty}x ${o.product}, quedan ${result.remaining})`
        : `pedido ${o.orderId} RECHAZADO por falta de stock (${o.product}: quedan ${result.remaining}, pedia ${o.qty})`;
    }
    default: return JSON.stringify(instruction);
  }
}

module.exports = { RoundRobinScheduler };
