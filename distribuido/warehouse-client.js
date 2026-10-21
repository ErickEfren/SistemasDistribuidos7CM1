const net = require('net');
const readline = require('readline');
const { NODES } = require('./config');

const target = process.argv[2] || 'N1';
const node = NODES.find(n => n.id === target) || { host: '127.0.0.1', port: Number(target) };

const socket = net.connect(node.port, node.host, () => {
  console.log(`Conectado a ${node.host}:${node.port}`);
  console.log('Comandos: order <producto> <cantidad> | stock | salir');
});

socket.setEncoding('utf8');
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
    handleMessage(msg);
  }
});

function handleMessage(msg) {
  if (msg.type === 'hello') {
    console.log(`Eres el cliente ${msg.clientId}, conectado a ${msg.nodeName} (${msg.nodeId}).`);
    console.log(`Productos de este nodo: ${msg.localProducts.join(', ')}. Catalogo completo: ${msg.allProducts.join(', ')}`);
    return;
  }

  if (msg.type === 'error') {
    console.log(`Error: ${msg.message}`);
    return;
  }

  if (msg.type === 'orderResult') {
    const ruta = msg.routedVia === msg.handledBy
      ? `atendido localmente por ${msg.handledBy}`
      : `enrutado por ${msg.routedVia} hacia ${msg.handledBy}`;

    if (msg.fulfilled) {
      console.log(`Pedido DESPACHADO: ${msg.qty}x ${msg.product}, quedan ${msg.remaining} (${ruta})`);
    } else {
      console.log(`Pedido RECHAZADO por falta de stock: ${msg.product} (quedan ${msg.remaining}, pedia ${msg.qty}) (${ruta})`);
    }
    return;
  }

  if (msg.type === 'stock') {
    console.log('Inventario distribuido:');
    for (const [nodeId, info] of Object.entries(msg.byNode)) {
      if (!info.stock) {
        console.log(`  ${nodeId}: no disponible`);
        continue;
      }
      console.log(`  ${info.nodeName} (${nodeId}): ${JSON.stringify(info.stock.stock)}`);
    }
  }
}

socket.on('close', () => {
  console.log('Conexion cerrada');
  process.exit(0);
});

socket.on('error', (err) => {
  console.log(`Error de conexion: ${err.message}`);
  process.exit(1);
});

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (input) => {
  const [cmd, a, b] = input.trim().split(/\s+/);
  if (cmd === 'order') {
    socket.write(JSON.stringify({ cmd: 'order', product: a, qty: Number(b) }) + '\n');
    return;
  }
  if (cmd === 'stock') {
    socket.write(JSON.stringify({ cmd: 'stock' }) + '\n');
    return;
  }
  if (cmd === 'salir') {
    socket.end();
    rl.close();
    return;
  }
  console.log('Comando no reconocido');
});

rl.on('close', () => {
  socket.end();
});
