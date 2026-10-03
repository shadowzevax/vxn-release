# Cambios

Versionado MAYOR.MENOR.PARCHE:
- PARCHE (1.0.0 -> 1.0.1): correcciones de errores.
- MENOR (1.0.1 -> 1.1.0): funciones nuevas que no rompen nada.
- MAYOR (1.1.0 -> 2.0.0): cambios grandes o incompatibles.

Al publicar una version nueva: subir el numero en `manifest.json` y en
`version.json`, anotarla aqui, hacer commit, etiqueta `vX.Y.Z` y subir a GitHub.

## 1.16.0

- Engranaje en "Abrir > Buscar anuncios similares": ventana de ajustes para
  elegir los metodos (frase exacta, busqueda amplia, nombre del producto en el
  anuncio, nombre en su web, palabras de ChatGPT), cuantas palabras de ChatGPT
  usar y cuantas cargas por busqueda. Muestra el tiempo aproximado y trae
  preajustes "Rapido" y "Completo".

## 1.15.0

- "Buscar anuncios similares" le pide a ChatGPT (siempre en chat temporal, en
  una pestaña de fondo que se cierra sola, sin necesidad de iniciar sesion)
  las palabras de busqueda a partir del anuncio y su pagina de ventas, lee la
  respuesta y busca con las 5 mejores. Si ChatGPT no responde, sigue sin ellas.
- Permiso nuevo: chatgpt.com (para leer la respuesta).

## 1.14.0

- "Buscar anuncios similares" tambien lee la pagina de ventas del anuncio
  (como "Palabras para buscar similares") y saca de ella el nombre del
  producto (p. ej. "Grandes Mentes", "Hair Tonic"); busca por ese nombre
  primero, que suele ser la busqueda mas certera.

## 1.13.0

- "Crear con IA" > "Palabras para buscar similares": pide a ChatGPT entre 5 y 8
  busquedas cortas y precisas para encontrar en la Biblioteca a otros
  anunciantes del mismo producto. Combina el anuncio con el texto de su pagina
  de ventas (si el anuncio lleva a una web); si no se puede leer, usa solo el anuncio.
- El boton "Enviar" pasa al final de la barra de cada tarjeta.

## 1.12.0

- Nuevo boton "Crear con IA" en cada tarjeta (destellos): 8 analisis del
  anuncio que se abren en ChatGPT en chat temporal: palabras clave,
  segmentacion de audiencia, analisis de persuasion, variaciones A/B,
  estructura de la oferta, avatar del cliente, angulos creativos y embudo de quiz.

## 1.11.0

- "Anuncios similares" se puede minimizar (boton "-"): queda una capsula
  flotante y arrastrable junto al logo de Meta que muestra si sigue buscando
  (y cuantos lleva) o si ya termino. Al pulsarla se abre de nuevo la ventana.
  Mientras tanto se puede seguir usando la Biblioteca.

## 1.10.1

- Tarjetas sin decorar tras volver atras o regresar a una busqueda ya vista:
  Meta las pinta desde su cache sin volver a mandar los datos; ahora se
  recuperan de lo ya leido en la pagina.
- Autocomprobacion cada pocos segundos: si hay tarjetas con datos pero sin
  barra, se anota en consola ("Tarjetas sin decorar") con el motivo y se
  repintan solas.
- El aviso "El contador bajo" ya no salta al cambiar de busqueda.

## 1.10.0

- "Buscar anuncios similares" por etapas: al terminar, marca con la casilla
  los anunciantes que si son el mismo producto y pulsa "Buscar mas con los
  correctos". Se busca de nuevo con los textos y el nombre de producto de esos
  anuncios, y cada resultado se compara contra todos los anuncios correctos.
  Los marcados pasan a "Confirmados por ti". Se puede repetir.

## 1.9.3

- Cerrar la ventana de "Buscar anuncios similares" cancela la busqueda: se
  cierra su pestaña de fondo y no se abren las pasadas que faltaban. Tambien
  se cancela si se cierra la pestaña desde la que se busco.

## 1.9.2

- Los enlaces a un anuncio ("Ver anuncio", "URL del anuncio en la
  Biblioteca", guardados, similares) van siempre con pais "Todos" y cualquier
  estado: sin pais, Meta ponia el del usuario (p. ej. Colombia) y el
  anunciante aparecia vacio.

## 1.9.1

- Guardados: "+ Nueva etiqueta" como primera opcion del selector de
  etiquetas (se puede crear aunque aun no tenga anuncios) y boton "Eliminar"
  en la barra de la etiqueta (la quita de los anuncios, sin borrarlos).

## 1.9.0

- Guardados: al elegir una etiqueta, se puede renombrar (cambia en todos los
  anuncios que la llevan; si el nombre ya existe, se unen) y activar un orden
  personalizado propio de esa etiqueta, arrastrando las tarjetas.
- Sincronizacion entre pestañas corregida: los controles abiertos (filtros,
  numeros, interruptores) se actualizan en las demas pestañas; el panel
  abierto/recogido sigue siendo de cada pestaña. Apagar "Solo esta pestaña"
  refresca bien los valores. Los guardados tambien se comparten al momento
  (antes una pestaña podia pisar lo que cambio otra).
- "Ver vigilados" pasa debajo del interruptor.
- El diagnostico de "salto de scroll" ya no avisa cuando el salto lo causa un
  filtro que oculta o muestra tarjetas.

## 1.8.2

- Los "?" de la configuracion quedan todos alineados a la derecha.

## 1.8.1

- Configuracion mas limpia: las explicaciones pasan a un "?" junto a cada
  opcion (se ven al pasar el cursor), y se completan las que faltaban.

## 1.8.0

- Pegar en el buscador de la Biblioteca texto con comillas: Meta lo rechazaba
  en silencio; ahora se pega sin las comillas.
- "Buscar anuncios similares": tercera pasada por el nombre del producto
  (entre comillas, en mayusculas o como nombre propio) y nuevo bloque
  "Poco probable" que no mezcla con los exactos ni los posibles.
- El circulo, el panel y la bandeja guardan su posicion relativa a la ventana:
  el zoom ya no los desplaza.
- Diagnostico en consola (F12) marcado con [Vyxen]: errores, contador que baja
  y saltos de scroll sin tocar nada.
- Menos memoria: no se dibujan las tarjetas lejos de la pantalla.

## 1.7.0

- Sincronizacion entre pestañas: mover el circulo o los paneles, o cambiar
  filtros y ajustes en una pestaña, se aplica al momento en las demas (salvo
  las que tienen "Solo esta pestaña").
- "Buscar anuncios similares" muestra en que paises se anuncia cada
  anunciante encontrado, con los datos que ya trae la Biblioteca (sin
  busquedas extra).

## 1.6.2

- "Solo esta pestaña" ahora es de verdad solo de esa pestaña: las pestañas
  nuevas arrancan con la configuracion normal. Al apagarlo se vuelve a la
  configuracion normal sin pisarla con los filtros de esa pestaña.

## 1.6.1

- Se quita el interruptor "Enviar informes de errores": por ahora no se envia
  nada al autor. El aviso de fallo de lectura pide refrescar o avisar a Rixius.

## 1.6.0

- Modo seguro (activado por defecto): pausas al azar entre acciones en
  Facebook, Google e Instagram, busqueda automatica con ritmo irregular y
  pausa de 30 min si alguno pide verificacion.
- Vigilar anunciantes (desactivado por defecto): Abrir > "Vigilar este
  anunciante"; cada 4 h se revisan y llega una notificacion si hay anuncios nuevos.
- Deteccion de fallos: aviso si Vyxen no logra leer los anuncios, y registro
  de errores listo para enviarse al autor.

## 1.5.3

- En las ventanas de anunciantes (similares, posibles, mismo anuncio), boton
  "Ver anuncio" que abre el anuncio concreto que coincidio.

## 1.5.2

- "Buscar anuncios similares" busca en una pestaña con ajustes neutros propios:
  sin filtros, sin WhatsApp solo CTA, sin tope y sin tocar tus ajustes.
- Dos pasadas: frase exacta y luego las mismas palabras en cualquier orden
  (atrapa copias con pequeños cambios).

## 1.5.1

- "Buscar anuncios similares": la ventana se abre al instante con barra de carga
  y va mostrando los anunciantes en vivo mientras busca.
- El anunciante de origen aparece arriba y ya no se cuela en los resultados
  (tampoco sus otras paginas con el mismo nombre).

## 1.5.0
- Pastilla violeta "X posibles": anunciantes con un anuncio casi igual
  (cambia precio, moneda o detalles), ademas de los exactos.
- Abrir > "Buscar anuncios similares": busca la frase del anuncio en la
  Biblioteca y muestra los anunciantes con el mismo anuncio exacto y los
  posibles.

## 1.4.0
- La busqueda automatica se detiene por cantidad de anuncios O por tiempo,
  a eleccion; la opcion no elegida queda en gris y no cuenta.

## 1.3.2
- Actualizacion sin refrescar mas suave: la vista se queda anclada en el
  anuncio que estabas mirando, las tarjetas no encogen (Meta ya no carga un
  lote de mas) y las barras se sustituyen sin parpadeo.

## 1.3.1
- Con "WA solo CTA" desactivado, el boton de WhatsApp aparece en todos los
  anuncios (antes solo en los que llevaban a WhatsApp de alguna forma).

## 1.3.0
- Actualizar sin refrescar: la version nueva se mete en las pestañas abiertas,
  recupera los anuncios ya cargados (hook.js guarda una copia) y la vieja se
  aparta sola. Aplica a partir de esta version.
- Version pequeña en la cabecera del panel.
- La ayuda del "?" ya no se corta dentro del panel.
- Tope de anuncios mas preciso: se mira al llegar los datos y no se pide otro
  lote hasta recibir el anterior.
- Despues de parar por el tope, lo que se carga a mano tambien se decora.

## 1.2.1
- Al actualizarse con la Biblioteca abierta, el panel ya no se descoloca ni
  pierde el logo; sale un aviso "Vyxen se actualizo" para refrescar cuando
  convenga, sin perder lo cargado.
- "Buscar sola al abrir la Biblioteca" pasa a "Busqueda automatica" con un
  icono ? que explica que hace.

## 1.2.0
- Nueva pagina de Ajustes a pantalla completa, organizada por secciones:
  actualizaciones (con "Buscar ahora"), boton de WhatsApp, busqueda, tus
  datos y panel/bandeja.

## 1.1.0
- Apariencia: intensidad del brillo, tamaño del brillo y grosor del borde
  del halo de las tarjetas, configurables por cada usuario.

## 1.0.0
- Primera version distribuida: panel flotante, bandeja de accesos rapidos
  editable, boton de WhatsApp con verificacion, descarga multiple, anuncios
  guardados con etiquetas y miniaturas, y actualizaciones desde GitHub.
