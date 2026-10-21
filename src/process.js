const STATES = Object.freeze({
  READY: 'READY',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  DONE: 'DONE',
});

const PRODUCTS = ['Manzanas', 'Peras', 'Bananas'];
let nextId = 1;

class SimProcess {
  constructor(type, generatorFn) {
    this.id = `${type[0].toUpperCase()}${nextId++}`;
    this.type = type;
    this.iterator = generatorFn(this.id);
    this.state = STATES.READY;
    this.blockedOn = null;
    this.log = [];
    this._pendingInput = undefined;
  }

  feedResult(value) {
    this._pendingInput = value;
  }

  step() {
    const { value, done } = this.iterator.next(this._pendingInput);
    this._pendingInput = undefined;
    if (done) {
      this.state = STATES.DONE;
      return null;
    }
    return value;
  }
}

function randomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

function randomQty() {
  return 1 + Math.floor(Math.random() * 3);
}

function* producerProcess(bufferSize, id) {
  let seq = 0;
  while (true) {
    const product = randomProduct();
    const qty = randomQty();
    yield { type: 'work', label: `${id} arma pedido: ${qty}x ${product}` };
    yield { type: 'sem_wait', sem: 'empty' };
    yield { type: 'sem_wait', sem: 'mutex' };
    yield { type: 'buffer_put', item: { orderId: `${id}-${seq}`, client: id, product, qty } };
    yield { type: 'sem_signal', sem: 'mutex' };
    yield { type: 'sem_signal', sem: 'full' };
    seq++;
  }
}

function* customOrderProcess(id, product, qty) {
  yield { type: 'work', label: `${id} envia pedido manual: ${qty}x ${product}` };
  yield { type: 'sem_wait', sem: 'empty' };
  yield { type: 'sem_wait', sem: 'mutex' };
  yield { type: 'buffer_put', item: { orderId: id, client: id, product, qty } };
  yield { type: 'sem_signal', sem: 'mutex' };
  yield { type: 'sem_signal', sem: 'full' };
}

function* consumerProcess(id) {
  while (true) {
    yield { type: 'sem_wait', sem: 'full' };
    yield { type: 'sem_wait', sem: 'mutex' };
    const order = yield { type: 'buffer_take' };
    yield { type: 'sem_signal', sem: 'mutex' };
    yield { type: 'sem_signal', sem: 'empty' };

    yield { type: 'sem_wait', sem: 'invMutex' };
    yield { type: 'inventory_process', order };
    yield { type: 'sem_signal', sem: 'invMutex' };

    yield { type: 'work', label: `${id} termina de gestionar pedido` };
  }
}

module.exports = {
  SimProcess,
  STATES,
  PRODUCTS,
  producerProcess,
  customOrderProcess,
  consumerProcess,
};
