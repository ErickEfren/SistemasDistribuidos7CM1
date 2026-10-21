const ws = new WebSocket(`ws://${location.host}`);

const el = {
  status: document.getElementById('status'),
  cpuCard: document.getElementById('cpuCard'),
  procs: document.getElementById('procs'),
  bufferSlots: document.getElementById('bufferSlots'),
  inventory: document.getElementById('inventory'),
  fulfilled: document.getElementById('fulfilled'),
  rejected: document.getElementById('rejected'),
  semaphores: document.getElementById('semaphores'),
  log: document.getElementById('log'),
  orderProduct: document.getElementById('orderProduct'),
  toggleRun: document.getElementById('toggleRun'),
};

let maxStock = {};
let myClientId = null;
let isPaused = false;

ws.addEventListener('open', () => {
  el.status.textContent = 'Conectando...';
});

ws.addEventListener('close', () => {
  el.status.textContent = 'Desconectado del servidor';
});

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'hello') myClientId = msg.clientId;
  if (msg.type === 'state') render(msg);
  if (msg.type === 'error') alert(msg.message);
});

function ensureProductOptions(products) {
  if (!products || el.orderProduct.options.length) return;
  for (const pName of products) {
    const opt = document.createElement('option');
    opt.value = pName;
    opt.textContent = pName;
    el.orderProduct.appendChild(opt);
  }
}

function renderCpuCard(lastTurn, quantum) {
  if (!lastTurn) {
    el.cpuCard.innerHTML = '<div class="cpu-idle">Todavía no hay procesos ejecutados en este turno.</div>';
    return;
  }
  const outcomeText = {
    finished: 'Terminó su ejecución',
    blocked: 'Se bloqueó esperando un semáforo',
    quantum_expired: 'Agotó su quantum',
  }[lastTurn.outcome] || lastTurn.outcome;

  const badgeClass = lastTurn.outcome === 'blocked' ? 'blocked' : lastTurn.outcome === 'finished' ? 'done' : 'ok';
  const pct = Math.min(100, Math.round((lastTurn.ticksUsed / quantum) * 100));

  el.cpuCard.innerHTML = `
    <div class="cpu-id">${lastTurn.processId}</div>
    <div class="cpu-details">
      <div class="cpu-outcome">${outcomeText}<span class="badge ${badgeClass}">${lastTurn.ticksUsed}/${quantum} instrucciones</span></div>
      <div class="cpu-bar"><div style="width:${pct}%"></div></div>
    </div>
  `;
}

function classifyLogLine(line) {
  if (line.includes('BLOQUEADO') || line.includes('bloqueado')) return 'ev-block';
  if (line.includes('RECHAZADO')) return 'ev-reject';
  if (line.includes('DESPACHADO') || line.includes('desbloqueado')) return 'ev-ok';
  if (line.includes('Cambio de contexto')) return 'ev-ctx';
  return '';
}

function render({ snapshot, paused, tickIntervalMs, lastTurn, products }) {
  ensureProductOptions(products);
  isPaused = paused;
  el.toggleRun.textContent = paused ? 'Reanudar' : 'Pausar';

  el.status.innerHTML = `Eres el <b>cliente ${myClientId}</b> · clientes conectados: <b>${snapshot.connectedClients}</b> · ${paused ? '<b>PAUSADO</b>' : 'ejecutando'} · quantum=${snapshot.scheduler.quantum} · velocidad=${tickIntervalMs}ms`;

  renderCpuCard(lastTurn, snapshot.scheduler.quantum);

  el.procs.innerHTML = '';
  snapshot.processes.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = `proc ${p.type}` + (i === 0 ? ' next' : '');
    chip.textContent = `${p.id} (${p.state})`;
    chip.title = i === 0 ? 'Próximo en recibir la CPU' : '';
    el.procs.appendChild(chip);
  });
  if (!snapshot.processes.length) {
    el.procs.innerHTML = '<span style="color:#6b7180;font-size:13px">Sin procesos en espera.</span>';
  }

  el.bufferSlots.innerHTML = '';
  for (let i = 0; i < snapshot.buffer.capacity; i++) {
    const order = snapshot.buffer.items[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (order ? ' filled' : '');
    slot.textContent = order ? `${order.qty}x ${order.product}` : 'vacío';
    slot.title = order ? `${order.orderId} (${order.client})` : '';
    el.bufferSlots.appendChild(slot);
  }

  el.inventory.innerHTML = '';
  for (const [product, qty] of Object.entries(snapshot.inventory.stock)) {
    if (!(product in maxStock)) maxStock[product] = Math.max(qty, 1);
    const pct = Math.max(0, Math.min(100, (qty / maxStock[product]) * 100));
    const row = document.createElement('div');
    row.className = 'stock-row';
    row.innerHTML = `<span class="stock-name">${product}</span><div class="stock-bar"><div style="width:${pct}%"></div></div><span class="stock-val">${qty}</span>`;
    el.inventory.appendChild(row);
  }
  el.fulfilled.textContent = snapshot.inventory.fulfilled;
  el.rejected.textContent = snapshot.inventory.rejected;

  el.semaphores.innerHTML = '';
  for (const [name, sem] of Object.entries(snapshot.semaphores)) {
    const blocked = sem.blocked.length > 0;
    const row = document.createElement('div');
    row.className = 'sem-row';
    row.innerHTML = `<span>${name}</span><span class="sem-value ${blocked ? 'blocked' : 'free'}">valor=${sem.value}${blocked ? ` · bloqueados: ${sem.blocked.join(', ')}` : ''}</span>`;
    el.semaphores.appendChild(row);
  }

  el.log.innerHTML = snapshot.scheduler.recentEvents
    .map(e => `<div class="${classifyLogLine(e)}">${e}</div>`)
    .join('');
  el.log.scrollTop = el.log.scrollHeight;
}

function send(cmd, extra = {}) {
  ws.send(JSON.stringify({ cmd, ...extra }));
}

document.getElementById('addProducer').onclick = () => send('addProducer');
document.getElementById('addConsumer').onclick = () => send('addConsumer');
el.toggleRun.onclick = () => send(isPaused ? 'resume' : 'pause');
document.getElementById('quantum').onchange = (e) => send('setQuantum', { value: e.target.value });
document.getElementById('speed').onchange = (e) => send('setSpeed', { value: e.target.value });

document.getElementById('submitOrder').onclick = () => {
  const product = el.orderProduct.value;
  const qty = document.getElementById('orderQty').value;
  send('submitOrder', { product, qty });
};
