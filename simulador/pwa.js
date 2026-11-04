const estadoPwa = document.getElementById('estadoPwa');
const botonInstalar = document.getElementById('instalar');
let invitacion = null;
let listaSinInternet = false;

function instalada() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function pintarPwa() {
  const partes = [instalada() ? 'Aplicación instalada' : 'Abierta en el navegador'];
  partes.push(navigator.onLine ? 'con internet' : 'sin internet');
  if (listaSinInternet) partes.push('lista para funcionar sin conexión');
  estadoPwa.textContent = partes.join(' · ');
}

window.addEventListener('beforeinstallprompt', (evento) => {
  evento.preventDefault();
  invitacion = evento;
  botonInstalar.hidden = false;
});

botonInstalar.addEventListener('click', async () => {
  botonInstalar.hidden = true;
  await invitacion.prompt();
  invitacion = null;
});

window.addEventListener('appinstalled', () => {
  botonInstalar.hidden = true;
  pintarPwa();
});
window.addEventListener('online', pintarPwa);
window.addEventListener('offline', pintarPwa);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
  navigator.serviceWorker.ready.then(() => {
    listaSinInternet = true;
    pintarPwa();
  });
}

pintarPwa();
