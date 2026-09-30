/*⁠​‌​‌​‌‌​​‌‌‌‌​​‌​‌‌‌‌​​​​‌‌​​‌​‌​‌‌​‌‌‌​​​‌​​​​​​​‌​‌​​​​‌‌​​​‌‌​​‌​‌​​‌​​‌​​​​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​‌​​​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​‌‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​​‌‌​‌‌​‌​​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌​‌‌​​‌‌​​​​‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​​​​​‌‌‌​​‌​​‌‌​‌‌‌‌​‌‌​‌​​​​‌‌​‌​​‌​‌‌​​​‌​​‌‌​‌​​‌​‌‌​​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​‌​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌​​‌‌​​‌‌​‌​​‌​‌‌​​​‌‌​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​‌‌​​​​‌​​​​​​‌‌​​​‌‌​‌‌​‌‌‌‌​‌‌‌​​​​​‌‌​‌​​‌​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌‌​​‌‌​‌‌‌​‌​​​‌‌‌​​‌​​‌‌​‌​​‌​‌‌​​​‌​​‌‌‌​‌​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌‌​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌‌​‌​​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​​‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​⁠*/
/**
 * Corre en el mundo MAIN de la pagina.
 *
 * La Biblioteca de Anuncios entrega los datos de cada anuncio en JSON: una parte
 * viene incrustada en el HTML inicial y el resto llega por /api/graphql/ conforme
 * haces scroll. Aqui interceptamos ambas fuentes y mandamos los anuncios ya
 * parseados al content script via postMessage.
 *
 * Leer el JSON en vez de raspar el DOM es lo que mantiene esto vivo cuando Meta
 * cambia la maquetacion: los nombres de campo cambian mucho menos que las clases CSS.
 */
(() => {
  const CANAL = "WA_ADS_SPY";

  /*
   * Copia de todo lo leido. Este script vive en la propia pagina, asi que
   * sobrevive a que la extension se actualice; la version nueva del panel
   * la pide al arrancar ("reenviar") y recupera los anuncios ya cargados sin
   * tener que refrescar la pagina.
   */
  const leidos = new Map();

  const emitir = (anuncios) => {
    if (!anuncios.length) return;
    for (const a of anuncios) leidos.set(a.id, a);
    window.postMessage({ canal: CANAL, tipo: "anuncios", anuncios }, "*");
  };

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.canal !== CANAL || e.data.tipo !== "reenviar") return;
    const todos = [...leidos.values()];
    for (let i = 0; i < todos.length; i += 200) {
      window.postMessage({ canal: CANAL, tipo: "anuncios", anuncios: todos.slice(i, i + 200) }, "*");
    }
    window.postMessage({ canal: CANAL, tipo: "reenviado", total: todos.length }, "*");
  });

  /*
   * Se probo a bloquear la peticion que pide el siguiente lote
   * ("AdLibrarySearchPaginationQuery") para que solo el boton "Buscar"
   * pudiera traer mas anuncios. Rechazarla como si fuera un fallo de red
   * dejaba a la propia Biblioteca con el indicador de carga girando para
   * siempre — la pagina se ve rota, peor que el problema que se queria
   * resolver. Se revirtio: la Biblioteca sigue trayendo lotes con su propio
   * scroll, y es el tope de anuncios (`maxAnuncios`, en las preferencias)
   * el que evita que la extension misma se sature con todo lo que llegue.
   */

  /** Saca el primer valor de `campo` dentro de un fragmento de JSON crudo. */
  const campo = (texto, nombre) => {
    const m = texto.match(new RegExp('"' + nombre + '":"((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) return null;
    try {
      return JSON.parse('"' + m[1] + '"');
    } catch {
      return m[1];
    }
  };

  const campoNum = (texto, nombre) => {
    const m = texto.match(new RegExp('"' + nombre + '":(\\d+)'));
    return m ? Number(m[1]) : null;
  };

  /** Todos los valores de `campo` en el fragmento, sin repetir. */
  const todos = (texto, nombre) => {
    const re = new RegExp('"' + nombre + '":"((?:[^"\\\\]|\\\\.)*)"', "g");
    const salida = new Set();
    let m;
    while ((m = re.exec(texto))) {
      try {
        salida.add(JSON.parse('"' + m[1] + '"'));
      } catch {
        salida.add(m[1]);
      }
    }
    return [...salida];
  };

  /*
   * Las tarjetas de un carrusel: cada una con su propia imagen o video,
   * titulo, texto y hasta enlace de destino distintos entre si.
   *
   * A diferencia de `plataformas` o `paises`, aqui cada elemento del array
   * es un objeto entero, no una cadena suelta — no sirve partir por comas.
   * Se localiza "cards":[ y se camina caracter a caracter contando llaves y
   * corchetes para saber donde empieza y termina cada tarjeta, sin asumir
   * que las claves vengan en un orden fijo.
   */
  const tarjetasCarrusel = (texto) => {
    const inicio = texto.indexOf('"cards":[');
    if (inicio < 0) return [];
    const desde = inicio + '"cards":['.length;
    if (texto[desde] === "]") return []; // carrusel vacio

    const tarjetas = [];
    let profundidad = 0;
    let comienzoObjeto = -1;

    for (let i = desde; i < texto.length; i++) {
      const c = texto[i];
      if (c === "{") {
        if (profundidad === 0) comienzoObjeto = i;
        profundidad++;
      } else if (c === "}") {
        profundidad--;
        if (profundidad === 0 && comienzoObjeto >= 0) {
          const bloque = texto.slice(comienzoObjeto, i + 1);
          tarjetas.push({
            titulo: campo(bloque, "title"),
            cuerpo: campo(bloque, "body"),
            linkUrl: campo(bloque, "link_url"),
            ctaTexto: campo(bloque, "cta_text"),
            videoHd: campo(bloque, "video_hd_url"),
            videoSd: campo(bloque, "video_sd_url"),
            videoPreview: campo(bloque, "video_preview_image_url"),
            imagen: campo(bloque, "original_image_url"),
          });
          comienzoObjeto = -1;
        }
      } else if (c === "]" && profundidad === 0) {
        break; // fin del array de "cards"
      }
    }
    return tarjetas;
  };

  const lista = (texto, nombre) => {
    const m = texto.match(new RegExp('"' + nombre + '":\\[([^\\]]*)\\]'));
    if (!m) return [];
    // No bastaba con quitar comillas: sirvio mientras solo se leian valores
    // en mayusculas sin acentos (plataformas, paises), pero una categoria
    // como "Electrónica" llega escapada ("Electrónica") y sin decodificar
    // el JSON esa "o" con tilde salia tal cual, con la barra invertida y todo.
    const partes = m[1].match(/"(?:[^"\\]|\\.)*"|[^,]+/g) || [];
    return partes
      .map((s) => {
        const limpio = s.trim();
        try {
          return limpio.startsWith('"') ? JSON.parse(limpio) : limpio;
        } catch {
          return limpio.replace(/"/g, "");
        }
      })
      .filter(Boolean);
  };

  /**
   * Los enlaces click-to-WhatsApp llevan un JWT en `token`. Su carga util trae
   * el telefono y el "icebreaker": el mensaje que el anunciante dejo escrito
   * para que el cliente lo envie. No verificamos la firma (no podriamos ni nos
   * hace falta), solo leemos la carga util, que va en base64url.
   */
  const leerToken = (url) => {
    const m = (url || "").match(/[?&]token=([\w-]+\.([\w-]+)\.[\w-]+)/);
    if (!m) return {};
    try {
      const base64 = m[2].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(base64 + "===".slice((base64.length + 3) % 4))
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const carga = JSON.parse(json);
      return {
        telefono: carga.phone || null,
        mensaje: carga.icebreaker || carga.text || null,
      };
    } catch {
      return {};
    }
  };

  /**
   * Recorre un texto JSON y devuelve un objeto por cada anuncio encontrado.
   * Para cada `ad_archive_id` tomamos una ventana de texto hacia adelante y
   * leemos los campos de ahi. La ventana es generosa porque el snapshot trae
   * el cuerpo del anuncio, que puede ser largo.
   */
  const extraer = (texto) => {
    const anuncios = [];
    const vistos = new Set();
    const re = /"ad_archive_id":"(\d+)"/g;
    let m;

    // Posiciones de todos los anuncios, para poder cortar cada bloque justo
    // donde empieza el siguiente. Con una ventana de tamaño fijo los anuncios
    // cortos "heredaban" campos del anuncio de al lado: asi aparecian botones
    // de WhatsApp en anuncios que no van a WhatsApp.
    const cortes = [];
    let c;
    const reCortes = /"ad_archive_id":"\d+"/g;
    while ((c = reCortes.exec(texto))) cortes.push(c.index);

    while ((m = re.exec(texto))) {
      const id = m[1];
      if (vistos.has(id)) continue;
      vistos.add(id);

      const siguiente = cortes.find((p) => p > m.index);
      const v = texto.slice(m.index, siguiente ?? m.index + 12000);

      const linkUrl = campo(v, "link_url");
      const esWa = linkUrl && /whatsapp/i.test(linkUrl);
      const telefonoDirecto = esWa
        ? (linkUrl.match(/[?&]phone=(\d+)/) || [])[1] || null
        : null;
      const desdeToken = esWa ? leerToken(linkUrl) : {};
      const ctaTipo = campo(v, "cta_type") || "";
      const plataformas = lista(v, "publisher_platform");

      anuncios.push({
        id,
        paginaId: campo(v, "page_id"),
        paginaNombre: campo(v, "page_name"),
        paginaFoto: campo(v, "page_profile_picture_url"),
        perfilUrl: campo(v, "page_profile_uri"),
        /*
         * En un anuncio normal, "text" trae el texto de verdad y "body" ni
         * siquiera existe. En un anuncio dinamico (DCO, el que dice "este
         * anuncio tiene varias versiones" con plantillas de por medio),
         * "text" es literalmente la variable de la plantilla sin rellenar
         * ("{{product.brand}}") y el texto que de verdad se ve en pantalla
         * esta en "body". Se comprobo en vivo comparando los dos: usar solo
         * "text" copiaba la plantilla cruda en vez del anuncio real.
         */
        cuerpo: campo(v, "body") || campo(v, "text"),
        titulo: campo(v, "title"),
        descripcion: campo(v, "link_description"),
        ctaTexto: campo(v, "cta_text"),
        ctaTipo,
        formato: campo(v, "display_format"),
        linkUrl,
        caption: campo(v, "caption"),
        plataformas,
        paises: lista(v, "targeted_or_reached_countries"),
        inicio: campoNum(v, "start_date"),
        fin: campoNum(v, "end_date"),
        // En segundos; Meta no siempre lo rellena, se usa solo si esta.
        tiempoActivo: campoNum(v, "total_active_time"),
        activo: /"is_active":true/.test(v),
        copias: campoNum(v, "collation_count"),
        videoHd: campo(v, "video_hd_url"),
        videoSd: campo(v, "video_sd_url"),
        videoPreview: campo(v, "video_preview_image_url"),
        imagenes: todos(v, "original_image_url"),
        // Vacio en un anuncio normal; con contenido solo en un carrusel.
        tarjetasCarrusel: tarjetasCarrusel(v),
        instagram: campo(v, "instagram_actor_name"),
        /*
         * Datos que ya venian en el mismo JSON y no se leian.
         *
         * `gasto`, `alcance` e `impresionesTexto` casi siempre llegan nulos
         * — Meta solo los rellena en anuncios politicos o de la UE, se
         * comprobo en vivo — asi que se guardan igual pero sin esperar que
         * esten casi nunca.
         */
        seguidoresPagina: campoNum(v, "page_like_count"),
        categoriaPagina: (lista(v, "page_categories") || [])[0] || null,
        entregaLimitada: /"is_limited_delivery":true/.test(v),
        gasto: campoNum(v, "spend"),
        moneda: campo(v, "currency") || "",
        alcance: campoNum(v, "reach_estimate"),
        impresionesTexto: campo(v, "impressions_text"),
        // Dos señales distintas, porque no siempre coinciden: un anuncio puede
        // llevar a WhatsApp con un boton que dice "Comprar". `ctaEsWhatsapp` es
        // el llamado a la accion; `destinoWhatsapp` es a donde va de verdad.
        ctaEsWhatsapp: /WHATSAPP/i.test(ctaTipo),
        destinoWhatsapp: !!esWa || /whatsapp/i.test(campo(v, "caption") || ""),
        /*
         * Tercera señal: los anuncios de "enviar mensaje" que no declaran a
         * donde mandan.
         *
         * Su `link_url` viene vacio y su `cta_type` es MESSAGE_PAGE: Meta
         * decide en el momento del clic si abre Messenger, Instagram o
         * WhatsApp. Con las dos señales de arriba pasaban desapercibidos y la
         * tarjeta se quedaba sin boton — se vio en una busqueda filtrada por
         * la propia Biblioteca a plataforma WhatsApp, donde uno de estos se
         * colaba sin que la extension lo reconociera.
         *
         * Que WhatsApp este entre sus ubicaciones no garantiza que el chat se
         * abra ahi, asi que se guarda aparte: es un candidato, no una
         * certeza, y quien quiera solo los seguros tiene el ajuste de filtro.
         */
        mensajeriaAWhatsapp:
          /MESSAGE_PAGE|SEND_MESSAGE/i.test(ctaTipo) && plataformas.includes("WHATSAPP"),
        telefonoDirecto: telefonoDirecto || desdeToken.telefono || null,
        mensajePrellenado: desdeToken.mensaje || null,
      });
    }
    return anuncios;
  };

  // --- Fuente 1: el HTML inicial -------------------------------------------
  const leerHtmlInicial = () => {
    try {
      emitir(extraer(document.documentElement.innerHTML));
    } catch (e) {
      console.warn("[WA Ads Spy] no se pudo leer el HTML inicial:", e);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", leerHtmlInicial, { once: true });
  } else {
    leerHtmlInicial();
  }

  // --- Fuente 2: las respuestas GraphQL del scroll --------------------------
  const fetchOriginal = window.fetch;
  window.fetch = async function (...args) {
    const respuesta = await fetchOriginal.apply(this, args);
    try {
      const url = (args[0] && (args[0].url || args[0])) + "";
      if (url.includes("/api/graphql")) {
        respuesta
          .clone()
          .text()
          .then((t) => {
            if (t.includes("ad_archive_id")) emitir(extraer(t));
          })
          .catch(() => {});
      }
    } catch {}
    return respuesta;
  };

  const abrirOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.addEventListener("load", () => {
      try {
        if (
          (url + "").includes("/api/graphql") &&
          typeof this.responseText === "string" &&
          this.responseText.includes("ad_archive_id")
        ) {
          emitir(extraer(this.responseText));
        }
      } catch {}
    });
    return abrirOriginal.call(this, metodo, url, ...resto);
  };
})();
