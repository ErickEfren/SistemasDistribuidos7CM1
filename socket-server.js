const net = require('net');
const { Simulation, PRODUCTS } = require('./src/simulation');

const PORT = process.env.SOCKET_PORT || 5000;
const TICK_MS_DEFAULT = 400;

const sim = new Simulation({ bufferSize: 5, quantum: 3 });
sim.addProducer();
sim.addProducer();
sim.addConsumer();

let tickIntervalMs = TICK_MS_DEFAULT;
let paused = false;
let timer = null;
const sockets = new Set();
const clientIds = new WeakMap();
let nextClientId = 1;

function send(socket, payload) {
  socket.write(JSON.stringify(payload) + '\n');
}

function broadcast(payload) {
  const line = JSON.stringify(payload) + '\n';
  for (const socket of sockets) socket.write(line);
}

function broadcastState() {
  broadcast({ type: 'state', snapshot: sim.snapshot(), lastTurn: null, paused, tickIntervalMs });
}

function step() {
  if (paused) return;
  const result = sim.tick();
  broadcast({ type: 'state', snapshot: sim.snapshot(), lastTurn: result, paused, tickIntervalMs });
}

function restartTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(step, tickIntervalMs);
}

function handleCommand(socket, clientId, msg) {
  switch (msg.cmd) {
    case 'addProducer': {
      const id = sim.addProducer();
      sim.logEvent(`Cliente ${clientId} agrega cliente automatico ${id}`);
      break;
    }
    case 'addConsumer': {
      const id = sim.addConsumer();
      sim.logEvent(`Cliente ${clientId} agrega trabajador ${id}`);
      break;
    }
    case 'submitOrder':
      try {
        const id = sim.addCustomOrder(msg.product, msg.qty);
        sim.logEvent(`Cliente ${clientId} envia pedido manual ${id} (${msg.qty}x ${msg.product})`);
      } catch (err) {
        send(socket, { type: 'error', message: err.message });
        return;
      }
      break;
    case 'setQuantum':
      sim.setQuantum(Number(msg.value) || 1);
      sim.logEvent(`Cliente ${clientId} cambia el quantum a ${sim.scheduler.quantum}`);
      break;
    case 'setSpeed':
      tickIntervalMs = Math.max(50, Number(msg.value) || TICK_MS_DEFAULT);
      restartTimer();
      sim.logEvent(`Cliente ${clientId} cambia la velocidad a ${tickIntervalMs}ms`);
      break;
    case 'pause':
      paused = true;
      sim.logEvent(`Cliente ${clientId} pausa la simulacion`);
      break;
    case 'resume':
      paused = false;
      sim.logEvent(`Cliente ${clientId} reanuda la simulacion`);
      break;
    default:
      return;
  }

  broadcastState();
}

const server = net.createServer((socket) => {
  const clientId = nextClientId++;
  clientIds.set(socket, clientId);
  sockets.add(socket);
  socket.setEncoding('utf8');

  sim.clientConnected();
  sim.logEvent(`Cliente ${clientId} conectado por socket TCP (${socket.remoteAddress}:${socket.remotePort})`);

  send(socket, { type: 'hello', clientId, products: PRODUCTS });
  send(socket, { type: 'state', snapshot: sim.snapshot(), lastTurn: null, paused, tickIntervalMs });
  broadcastState();

  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      handleCommand(socket, clientId, msg);
    }
  });

  socket.on('close', () => {
    sockets.delete(socket);
    sim.clientDisconnected();
    sim.logEvent(`Cliente ${clientId} desconectado`);
    broadcastState();
  });

  socket.on('error', () => {
    sockets.delete(socket);
  });
});

restartTimer();

server.listen(PORT, () => {
  console.log(`Servidor de sockets escuchando en tcp://localhost:${PORT}`);
});
