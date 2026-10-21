const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Simulation, PRODUCTS } = require('./src/simulation');

const PORT = process.env.PORT || 3000;
const TICK_MS_DEFAULT = 400;

const sim = new Simulation({ bufferSize: 5, quantum: 3 });
sim.addProducer();
sim.addProducer();
sim.addConsumer();

let tickIntervalMs = TICK_MS_DEFAULT;
let paused = false;
let timer = null;
const clientIds = new WeakMap();
let nextClientId = 1;

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, 'public', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('No encontrado');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
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

wss.on('connection', (ws, req) => {
  const clientId = nextClientId++;
  clientIds.set(ws, clientId);

  sim.clientConnected();
  sim.logEvent(`Cliente ${clientId} conectado por WebSocket (${req.socket.remoteAddress})`);

  ws.send(JSON.stringify({ type: 'hello', clientId, products: PRODUCTS }));
  ws.send(JSON.stringify({ type: 'state', snapshot: sim.snapshot(), lastTurn: null, paused, tickIntervalMs }));
  broadcastState();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

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
          ws.send(JSON.stringify({ type: 'error', message: err.message }));
          return;
        }
        break;
      case 'removeProcess':
        sim.removeProcess(msg.id);
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
  });

  ws.on('close', () => {
    sim.clientDisconnected();
    sim.logEvent(`Cliente ${clientId} desconectado`);
    broadcastState();
  });
});

restartTimer();

server.listen(PORT, () => {
  console.log(`Servidor de simulacion escuchando en http://localhost:${PORT}`);
});
