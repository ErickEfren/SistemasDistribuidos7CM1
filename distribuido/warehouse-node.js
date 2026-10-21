const net = require('net');
const { Semaphore } = require('../src/semaphore');
const { Inventory } = require('../src/inventory');
const { NODES } = require('./config');

const NODE_ID = process.argv[2] || process.env.NODE_ID;
const self = NODES.find(n => n.id === NODE_ID);

if (!self) {
  console.log(`Nodo desconocido: ${NODE_ID}. Usa uno de: ${NODES.map(n => n.id).join(', ')}`);
  process.exit(1);
}

const peers = NODES.filter(n => n.id !== NODE_ID);
const allProducts = NODES.flatMap(n => Object.keys(n.products));
const inventory = new Inventory(self.products);
const invMutex = new Semaphore('invMutex', 1);
const sockets = new Set();
let nextClientId = 1;

function ownerOf(product) {
  return NODES.find(n => product in n.products);
}

function send(socket, payload) {
  socket.write(JSON.stringify(payload) + '\n');
}

function broadcastLocal(payload) {
  const line = JSON.stringify(payload) + '\n';
  for (const s of sockets) s.write(line);
}

function processLocalOrder(product, qty) {
  invMutex.tryWait({ id: 'local' });
  const result = inventory.processOrder({ product, qty });
  invMutex.signal();
  return result;
}

function rpcCall(peer, payload) {
  return new Promise((resolve) => {
    const conn = net.connect(peer.port, peer.host, () => {
      conn.write(JSON.stringify(payload) + '\n');
    });
    conn.setEncoding('utf8');
    let buffer = '';
    conn.on('data', (chunk) => {
      buffer += chunk;
      const idx = buffer.indexOf('\n');
      if (idx >= 0) {
        resolve(JSON.parse(buffer.slice(0, idx)));
        conn.end();
      }
    });
    conn.on('error', () => resolve({ ok: false, error: `nodo ${peer.id} no disponible` }));
  });
}

async function handleMessage(socket, msg) {
  if (msg.cmd === 'order') {
    const owner = ownerOf(msg.product);
    if (!owner) {
      send(socket, { type: 'error', message: `Producto desconocido: ${msg.product}` });
      return;
    }

    let result;
    if (owner.id === self.id) {
      result = processLocalOrder(msg.product, msg.qty);
    } else {
      result = await rpcCall(owner, { cmd: 'peerOrder', product: msg.product, qty: msg.qty, fromNode: self.id });
    }

    const payload = { type: 'orderResult', handledBy: owner.id, routedVia: self.id, product: msg.product, qty: msg.qty, ...result };
    broadcastLocal(payload);
    return;
  }

  if (msg.cmd === 'stock') {
    const byNode = { [self.id]: { nodeId: self.id, nodeName: self.name, stock: inventory.snapshot() } };
    const results = await Promise.all(peers.map(p => rpcCall(p, { cmd: 'peerStock' })));
    for (const r of results) byNode[r.nodeId] = r;
    send(socket, { type: 'stock', byNode });
    return;
  }

  if (msg.cmd === 'peerOrder') {
    const result = processLocalOrder(msg.product, msg.qty);
    send(socket, result);
    return;
  }

  if (msg.cmd === 'peerStock') {
    send(socket, { nodeId: self.id, nodeName: self.name, stock: inventory.snapshot() });
    return;
  }
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let isClient = false;
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

      if (!isClient && (msg.cmd === 'order' || msg.cmd === 'stock')) {
        isClient = true;
        sockets.add(socket);
        send(socket, {
          type: 'hello',
          clientId: nextClientId++,
          nodeId: self.id,
          nodeName: self.name,
          localProducts: Object.keys(self.products),
          allProducts,
        });
      }

      handleMessage(socket, msg);
    }
  });

  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
});

server.listen(self.port, self.host, () => {
  console.log(`${self.name} (${self.id}) escuchando en tcp://${self.host}:${self.port} — productos locales: ${Object.keys(self.products).join(', ')}`);
});
