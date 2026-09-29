# WA Ads Spy

Extensión de Chrome (Manifest V3) que espía la Biblioteca de Anuncios de Meta: decora cada tarjeta con datos que Meta no muestra, resuelve el número de WhatsApp de los anunciantes, y guarda un seguimiento de los anuncios que interesan.

## Las tres piezas

1. **Decorado de la grilla** (`src/content.js`, mundo ISOLATED) — por cada anuncio que aparece en pantalla, añade una barra con acciones (guardar, copiar, abrir, enviar, WhatsApp), un halo verde cuando varios anuncios comparten el mismo creativo, y pastillas con nota de "ganador", días activo, entrega limitada, etc.
2. **Lectura del JSON** (`src/hook.js`, mundo MAIN) — intercepta `fetch`/`XHR` para leer el JSON que la propia Biblioteca ya trae (mucho más estable que raspar el DOM, porque Meta cambia las clases CSS a menudo pero los nombres de campo casi nunca) y se lo pasa a `content.js` por `postMessage`.
3. **Resolución de WhatsApp y descargas** (`src/background.js`, service worker) — todo lo que necesita saltarse el CORS de la página (descargar creativos) o abrir pestañas de fondo (buscar el número de WhatsApp de un anunciante, comprobar si un anuncio sigue activo).

## Cómo probar un cambio

**Todo cambio en `src/` requiere recargar la extensión.** Chrome no relee los archivos de una extensión sin empaquetar solo porque cambiaron en disco:

1. Editar el archivo.
2. Ir a `chrome://extensions`, buscar "WA Ads Spy" y pulsar **Volver a cargar**.
3. Refrescar (o volver a abrir) cualquier pestaña de la Biblioteca de Anuncios que ya estuviera abierta — las que quedaron abiertas de antes de recargar la extensión se quedan con una copia "huérfana" del script y tirarán "Extension context invalidated" en la consola hasta que se refresquen. Es normal, no es un bug del código.

## Verificación automática

`herramientas/probar.js` es el chequeo base: abre la Biblioteca con la extensión cargada (vía Playwright) y confirma que las tarjetas se decoran, que el panel y la bandeja rápida existen una sola vez, y que no hay errores de consola. Se ejecuta con:

```
node herramientas/probar.js
```

Correrlo después de cualquier cambio antes de darlo por bueno. Para probar algo puntual (un selector, un flujo concreto), es más rápido escribir un script suelto en `herramientas/_probar-algo.js` (el prefijo `_` los excluye de todo lo demás) y borrarlo al terminar — así queda `herramientas/` con solo el chequeo base y utilidades permanentes.

## Estructura de datos de un anuncio

`hook.js` extrae de cada bloque de JSON un objeto con, entre otros, estos campos (ver `extraer()` en `hook.js` para la lista completa):

- `id`, `paginaId`, `paginaNombre`, `perfilUrl` — identidad del anuncio y su anunciante.
- `cuerpo`, `titulo`, `descripcion`, `ctaTexto`, `ctaTipo` — el creativo.
- `copias` (`collation_count`) — cuántos anuncios activos comparten este mismo creativo; es la señal detrás del halo verde.
- `inicio`, `fin`, `tiempoActivo` — de aquí sale `diasActivo()`, que ya tiene en cuenta que un anuncio inactivo deja de sumar días.
- `destinoWhatsapp`, `ctaEsWhatsapp`, `mensajeriaAWhatsapp` — tres señales distintas de si el anuncio lleva a WhatsApp, explicadas en el comentario junto a su definición en `hook.js`.
- `seguidoresPagina`, `categoriaPagina`, `entregaLimitada`, `gasto`, `alcance`, `impresionesTexto` — datos que Meta ya manda en el mismo JSON; los tres últimos casi siempre llegan vacíos (solo se rellenan en anuncios políticos o de la UE).

## Resolución del número de WhatsApp

Documentado a fondo en los comentarios de `background.js`. En resumen, en cascada:

1. La página del anunciante, abierta de verdad en una pestaña de fondo (un `fetch` plano no sirve: devuelve el cascarón de React sin rellenar). Se mira el HTML nada más cargar y se reconocen los cinco formatos en que puede venir escrito un número (`wa.me/`, `api.whatsapp.com`, `web.whatsapp.com`, `whatsapp://`, y sus variantes codificadas).
2. Si ahí no está, una publicación orgánica del mismo anunciante, localizada buscando el texto del anuncio en Bing.

Los resultados se guardan en `chrome.storage.local` (no en memoria: el service worker se apaga solo a los pocos segundos y con él se iría la caché) durante 30 días si se encontró número, 3 si no.

## Convenciones del código

- Comentarios en español, explicando el *porqué* de una decisión no obvia, nunca el *qué* (los nombres ya lo dicen).
- Sin punto y coma faltante, sin abreviaturas raras — el código está pensado para que otra persona (o la misma, meses después) entienda la razón de cada bloque sin tener que rehacer la investigación.
- `content.js`/`hook.js`/`background.js` usan finales de línea CRLF de forma consistente; si se edita con un script en vez de con el editor, hay que respetarlo o los diffs salen ilegibles.


## Instalar (una sola vez)
1. Descarga la carpeta de la extension y guardala en un sitio fijo (no la muevas despues).
2. Abre `chrome://extensions` (o `brave://extensions`) y activa el **Modo desarrollador**.
3. Pulsa **Cargar descomprimida** y elige esa carpeta.

## Actualizar
Cuando el icono de la extension muestre una flecha verde, hay version nueva:
1. Abre la carpeta de la extension y ejecuta **actualizar.bat**.
2. Espera el mensaje "Listo". La extension se recarga sola en menos de un minuto.
3. Refresca las pestañas de la Biblioteca de anuncios.

Tus anuncios guardados, etiquetas y ajustes no se pierden al actualizar.
**No quites la extension** (boton "Quitar"): eso si borra tus datos.
