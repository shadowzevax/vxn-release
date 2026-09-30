# Cambios

Versionado MAYOR.MENOR.PARCHE:
- PARCHE (1.0.0 -> 1.0.1): correcciones de errores.
- MENOR (1.0.1 -> 1.1.0): funciones nuevas que no rompen nada.
- MAYOR (1.1.0 -> 2.0.0): cambios grandes o incompatibles.

Al publicar una version nueva: subir el numero en `manifest.json` y en
`version.json`, anotarla aqui, hacer commit, etiqueta `vX.Y.Z` y subir a GitHub.

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
