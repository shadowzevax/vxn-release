# Cambios

Versionado MAYOR.MENOR.PARCHE:
- PARCHE (1.0.0 -> 1.0.1): correcciones de errores.
- MENOR (1.0.1 -> 1.1.0): funciones nuevas que no rompen nada.
- MAYOR (1.1.0 -> 2.0.0): cambios grandes o incompatibles.

Al publicar una version nueva: subir el numero en `manifest.json` y en
`version.json`, anotarla aqui, hacer commit, etiqueta `vX.Y.Z` y subir a GitHub.

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
