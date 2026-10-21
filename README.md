# Almacén distribuido REST

El inventario de una tienda repartido entre tres servidores que se hablan por HTTP. Cada servidor es dueño de un producto, y cualquier cliente puede pedir cualquier producto entrando por cualquiera de ellos: si el producto no es de ese servidor, el servidor reenvía el pedido a su dueño y devuelve la respuesta.

| Servidor | Dirección | Producto |
|---|---|---|
| N1 · Almacén Norte | `http://127.0.0.1:7001` | Manzanas |
| N2 · Almacén Centro | `http://127.0.0.1:7002` | Peras |
| N3 · Almacén Sur | `http://127.0.0.1:7003` | Bananas |

## Simulación en línea

**https://erickefren.github.io/SistemasDistribuidos7CM1/simulador/**

Los tres servidores y cinco clientes corren dentro del navegador, en tiempo real y sin que nadie los controle. La red simulada tiene retrasos y pierde mensajes, y los servidores se caen y se recuperan solos. La página usa el mismo código que la versión de Node (`rest/servicio.js` y `rest/cliente-logica.js`); lo único que cambia es por dónde viajan los mensajes.

## Cómo correrlo en tu computadora

Requisito: Node.js 18 o más reciente. No hay dependencias externas.

Un servidor por terminal:

```bash
npm run rest:node1
npm run rest:node2
npm run rest:node3
```

Y uno o más clientes, indicando el servidor de entrada y un nombre:

```bash
npm run rest:cliente -- N1 Ana
```

En el cliente se escribe `order Peras 2`, `pedido N2-1`, `stock` o `salir`. En PowerShell, si aparece el error de "ejecución de scripts deshabilitada", usa `npm.cmd` en lugar de `npm`.

También se puede usar cualquier cliente HTTP:

```bash
curl -X POST http://127.0.0.1:7001/pedidos -H "Content-Type: application/json" -d "{\"producto\":\"Peras\",\"cantidad\":2}"
```

## API

| Método y ruta | Qué hace |
|---|---|
| `GET /` | Describe el servidor, sus vecinos y sus endpoints. |
| `GET /salud` | Indica que el servidor está vivo. |
| `GET /inventario` | Inventario local del servidor. |
| `GET /stock` | Inventario de los tres servidores (`completo: false` si alguno no responde). |
| `POST /pedidos` | Crea un pedido. Acepta la cabecera `Idempotency-Key` para reintentar sin duplicar. |
| `GET /pedidos/{id}` | Consulta un pedido, aunque lo guarde otro servidor. |

Códigos de respuesta de `POST /pedidos`: 201 despachado, 409 sin stock suficiente, 400 datos inválidos, 404 producto desconocido, 421 reenvío a un servidor que no es dueño, 502 el dueño no está disponible, 504 el dueño no respondió en 2 segundos.

## Estructura

| Ruta | Contenido |
|---|---|
| `rest/servicio.js` | Lógica de un servidor: rutas, pedidos, reenvío, idempotencia e inventario global. |
| `rest/cliente-logica.js` | Lógica del cliente: reintentos con la misma clave y mensajes de salida. |
| `rest/nodo.js`, `rest/cliente.js` | Servidor HTTP y cliente de consola para Node. |
| `rest/config.js` | Los tres servidores, sus puertos y su producto. |
| `src/` | Semáforo e inventario que usa cada servidor para proteger su stock. |
| `simulador/` | La página de GitHub Pages: red simulada, servidores y clientes en el navegador. |

## Limitaciones

El estado vive en memoria, así que un servidor que se reinicia vuelve a su inventario inicial. Cada producto tiene un solo servidor dueño, y si ese servidor cae, su producto no se puede pedir. No hay autenticación.
