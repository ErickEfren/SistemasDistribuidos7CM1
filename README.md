# Sistemas Distribuidos: el almacén de una tienda

Proyecto de la materia de Sistemas Distribuidos. Un mismo problema, el inventario de una tienda que reciben varios clientes a la vez, resuelto por etapas: primero como procesos e hilos en un solo servidor, después como cliente-servidor con sockets, luego repartido entre varios servidores y al final como servicios web REST.

## Simulación en línea

La versión REST corre completa en el navegador, en tiempo real, en GitHub Pages:

**https://erickefren.github.io/SistemasDistribuidos7CM4/simulador/**

Tres servidores y cinco clientes funcionan solos, con el mismo código del proyecto (`rest/servicio.js` y `rest/cliente-logica.js`). La red simulada tiene retrasos y pierde mensajes, y los servidores se caen y se recuperan sin que nadie intervenga. GitHub Pages no puede ejecutar Node, así que en esa página los servidores corren dentro del navegador. Las direcciones `http://127.0.0.1:7001` a `7003` son las de la versión real.

## Etapas del proyecto

| Etapa | Qué resuelve | Dónde está |
|---|---|---|
| 1. Procesos e hilos | Productor-consumidor con planificación Round Robin y semáforos, evitando la sobreventa del inventario. Interfaz web por WebSocket. | `src/`, `public/`, `server.js` |
| 2. Cliente-servidor con sockets | La misma simulación expuesta por sockets TCP con un cliente de consola. | `socket-server.js`, `socket-client.js` |
| 3. Múltiples clientes | Cada cliente se identifica y sus acciones quedan en una bitácora compartida. Interfaz simplificada. | `server.js`, `socket-server.js`, `public/` |
| 4. Múltiples servidores | El inventario se reparte entre tres nodos por sockets, con enrutamiento entre ellos y consulta agregada. | `distribuido/` |
| 5. Objetos distribuidos | Se exploraron los riesgos de invocar objetos remotos. La versión con Java RMI se eliminó y la de JavaScript quedó archivada. | `_archivo/objetos-js/` |
| 6. Servicios web REST | Los tres nodos como servicios HTTP con JSON, con códigos de estado, reintentos idempotentes y manejo de caídas. | `rest/` |
| Publicación | La etapa 6 corriendo en el navegador para GitHub Pages. | `simulador/` |

## Cómo correrlo en tu computadora

Requisitos: Node.js 18 o más reciente. Instala las dependencias una vez:

```bash
npm install
```

En PowerShell, si aparece el error de "ejecución de scripts deshabilitada", usa `npm.cmd` en lugar de `npm`.

**Etapa 6 (REST)**, un nodo por terminal y uno o más clientes:

```bash
npm run rest:node1
npm run rest:node2
npm run rest:node3
npm run rest:cliente -- N1 Ana
```

En el cliente se escribe `order Peras 2`, `pedido N2-1`, `stock` o `salir`. También se puede usar `curl`, por ejemplo:

```bash
curl -X POST http://127.0.0.1:7001/pedidos -H "Content-Type: application/json" -d "{\"producto\":\"Peras\",\"cantidad\":2}"
```

**Etapa 4 (sockets, varios servidores):** `npm run start:node1`, `start:node2`, `start:node3` y `npm run start:dist-client -- N1`.

**Etapas 1 a 3:** `npm start` y abrir `http://localhost:3000`. Para la versión de sockets, `npm run start:socket-server` y `npm run start:socket-client`.

**Simulador sin internet:** sirve la carpeta del proyecto con cualquier servidor estático y abre `/simulador/`. No funciona abriendo el archivo directamente, porque el navegador bloquea los scripts relativos con `file://` en algunos casos.

## API REST

| Método y ruta | Qué hace |
|---|---|
| `GET /` | Describe el nodo, sus vecinos y sus endpoints. |
| `GET /salud` | Indica que el nodo está vivo. |
| `GET /inventario` | Inventario local del nodo. |
| `GET /stock` | Inventario de los tres nodos (`completo: false` si alguno no responde). |
| `POST /pedidos` | Crea un pedido. Responde 201, 409 sin stock, 400, 404, 421, 502 o 504. Acepta la cabecera `Idempotency-Key`. |
| `GET /pedidos/{id}` | Consulta un pedido, aunque lo guarde otro nodo. |

## Reportes

Cada etapa tiene su reporte en la raíz del repositorio (`Reporte_*.docx` y `Reporte_*.pdf`). `Reporte_Dificultades_y_Publicacion.docx` recoge las dificultades de todo el proyecto y la publicación en GitHub Pages.
