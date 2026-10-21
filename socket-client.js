const net = require('net');
const readline = require('readline');

const HOST = process.env.SOCKET_HOST || '127.0.0.1';
const PORT = process.env.SOCKET_PORT || 5000;

const socket = net.connect(PORT, HOST, () => {
  console.log(`Conectado a ${HOST}:${PORT}`);
  console.log('Comandos: addProducer | addConsumer | order <producto> <cantidad> | pause | resume | quantum <n> | speed <ms> | salir');
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

let myClientId = null;

function handleMessage(msg) {
  if (msg.type === 'hello') {
    myClientId = msg.clientId;
    console.log(`Eres el cliente ${myClientId}. Productos disponibles: ${msg.products.join(', ')}`);
    return;
  }
  if (msg.type === 'error') {
    console.log(`Error: ${msg.message}`);
    return;
  }
  if (msg.type === 'state') {
    printState(msg);
  }
}

const OUTCOME_TEXT = {
  finished: 'termino',
  blocked: 'se bloqueo',
  quantum_expired: 'agoto su quantum',
};

function printState({ snapshot, paused, tickIntervalMs, lastTurn }) {
  if (lastTurn) {
    console.log(`  CPU -> ${lastTurn.processId} ${OUTCOME_TEXT[lastTurn.outcome] || lastTurn.outcome} (${lastTurn.ticksUsed}/${snapshot.scheduler.quantum} instrucciones)`);
  }
  const buf = snapshot.buffer.items.map(o => `${o.qty}x${o.product}`).join(', ') || 'vacio';
  const stock = Object.entries(snapshot.inventory.stock).map(([k, v]) => `${k}:${v}`).join(' ');
  const procs = snapshot.processes.map(p => `${p.id}(${p.state})`).join(' ');
  console.log(`[yo=cliente${myClientId} clientesConectados=${snapshot.connectedClients} ${paused ? 'PAUSA' : 'RUN'} q=${snapshot.scheduler.quantum} t=${tickIntervalMs}ms] buffer=[${buf}] stock={${stock}} listos=[${procs}]`);
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
  let payload = null;
  switch (cmd) {
    case 'addProducer':
      payload = { cmd: 'addProducer' };
      break;
    case 'addConsumer':
      payload = { cmd: 'addConsumer' };
      break;
    case 'order':
      payload = { cmd: 'submitOrder', product: a, qty: Number(b) };
      break;
    case 'pause':
      payload = { cmd: 'pause' };
      break;
    case 'resume':
      payload = { cmd: 'resume' };
      break;
    case 'quantum':
      payload = { cmd: 'setQuantum', value: Number(a) };
      break;
    case 'speed':
      payload = { cmd: 'setSpeed', value: Number(a) };
      break;
    case 'salir':
      socket.end();
      rl.close();
      return;
    default:
      console.log('Comando no reconocido');
      return;
  }
  socket.write(JSON.stringify(payload) + '\n');
});

rl.on('close', () => {
  socket.end();
});
