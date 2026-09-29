/**
 * Vyxen — capa de interfaz sobre la Biblioteca de Anuncios de Meta.
 *
 * Tres piezas:
 *   1. Decorado de cada tarjeta: bandeja de acciones, dias activos, borde de
 *      color cuando varios anuncios comparten el mismo creativo.
 *   2. Panel flotante arrastrable: filtros, orden y busqueda automatica.
 *   3. Bandeja rapida: contador de filtrados, mostrar/ocultar, volver arriba.
 *
 * El emparejado tarjeta <-> datos se hace por el "Identificador de la
 * biblioteca" que la propia tarjeta muestra, no por rutas del DOM.
 */
(() => {
  const CANAL = "WA_ADS_SPY";
  const anuncios = new Map(); // ad_archive_id -> datos
  const telefonos = new Map(); // id de anuncio -> { telefono, mensaje, origen }

  const RE_ID = /(?:Identificador de la biblioteca|Library ID|ID da biblioteca)[:\s]*(\d{8,})/i;

  // Sube este numero al cambiar algun valor por defecto: quien ya tenga
  // preferencias guardadas recibira los nuevos sin perder el resto de ajustes.
  const VERSION_PREFS = 6;

  const PREFS_DEF = {
    minAnuncios: 0,
    minDias: 0,
    opAnuncios: "gte",
    opDias: "gte",
    ordenar: "off",
    formato: "todos",
    plataforma: "todas",
    cta: "todos",
    soloSeguidos: false,
    waSoloCta: true, // solo los anuncios cuyo CTA dice WhatsApp
    colorBorde: "#12d95e",
    tamCopias: 16,
    ocultarFiltrados: true, // los que no pasan el filtro no se muestran
    plegado: true, // el panel arranca recogido para no estorbar
    rapidaPlegada: true, // y la bandeja rapida, tambien
    autoBusqueda: false,
    detenerMin: 1,
    intervaloSeg: 15,
    cargaAcelerada: false,
    notificar: true,
    // Tope de anuncios en memoria. Pasado ese punto la pagina se arrastra: son
    // miles de nodos que Meta nunca suelta y que hay que recorrer y recolocar.
    maxAnuncios: 600,
    // Si esta activo, los ajustes de esta pestaña no se comparten con las
    // demas: cada una lleva su propia configuracion.
    configPorPestana: false,
    // Si esta activo, el desplegable "Tipo de anuncio" de la Biblioteca se
    // mantiene siempre en "Todos los anuncios", aunque se toque sin querer.
    forzarTodosAnuncios: false,
    // Si esta activo, la descarga multiple agrega ademas un .txt con texto,
    // titulo y descripcion de cada anuncio (uno solo si varios seguidos
    // comparten exactamente el mismo texto).
    multiDescargaConTexto: false,
    version: VERSION_PREFS,
  };

  // Valores que se reimponen al actualizar, aunque ya hubiera preferencias.
  const RENOVAR = ["waSoloCta", "ocultarFiltrados", "detenerMin", "colorBorde", "maxAnuncios"];
  let prefs = { ...PREFS_DEF };

  // =========================================================================
  // utilidades
  // =========================================================================

  /*
   * Cuando la extension se recarga (o se actualiza) con una pestaña de la
   * Biblioteca ya abierta, el content script de esa pestaña sigue vivo pero
   * su conexion con la extension murio: cualquier llamada a chrome.storage
   * lanza "Extension context invalidated" — no es un fallo del codigo, solo
   * una pestaña vieja que necesita un refresco para volver a engancharse.
   * Sin este intento/captura, quedaba como error sin capturar y se iba
   * acumulando en la lista de Errores de chrome://extensions cada vez que se
   * guardaba una preferencia en una pestaña asi.
   */
  const guardarLocal = (obj) => {
    try {
      chrome.storage.local.set(obj);
    } catch (e) {}
  };

  const el = (tag, clase, html) => {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (html != null) n.innerHTML = html;
    return n;
  };

  /**
   * Avisos con Notyf (MIT): apila varios sin que se pisen y los retira solo.
   * Se crea la primera vez que hace falta, porque necesita <body>.
   */
  let notyf = null;

  const aviso = (texto, error = false) => {
    if (!notyf && typeof Notyf === "function") {
      notyf = new Notyf({
        duration: 2800,
        ripple: false,
        position: { x: "center", y: "bottom" },
        types: [
          { type: "success", background: "#2b3a4f", icon: false },
          { type: "error", background: "#b3261e", icon: false },
        ],
      });
    }
    if (notyf) return notyf.open({ type: error ? "error" : "success", message: texto });

    // Sin la libreria a mano seguimos avisando, sin dejar al usuario a ciegas.
    console.log("[WA Ads Spy]", texto);
  };

  const copiar = async (texto, etiqueta) => {
    if (!texto) return aviso("No hay " + etiqueta.toLowerCase() + " para copiar", true);
    try {
      await navigator.clipboard.writeText(texto);
      aviso(etiqueta + " copiado");
    } catch {
      aviso("No se pudo copiar al portapapeles", true);
    }
  };

  const abrir = (url) => {
    if (!url) return aviso("Enlace no disponible o inexistente", true);
    window.open(url, "_blank", "noopener");
  };

  /** Desenvuelve los redirectores l.facebook.com/l.php?u=<destino>. */
  const limpiarUrl = (url) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.endsWith("facebook.com") && u.pathname === "/l.php") {
        return decodeURIComponent(u.searchParams.get("u") || url);
      }
    } catch {}
    return url;
  };

  const dominioDe = (url) => {
    const limpia = limpiarUrl(url);
    if (!limpia) return null;
    try {
      return new URL(limpia).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  };

  /*
   * Dias que lleva en circulacion.
   *
   * Para un anuncio activo, hoy menos start_date. Para uno inactivo eso
   * mentia: seguia contando dias despues de que el anuncio se apagara, asi
   * que uno que corrio 10 dias y lleva 200 parado salia como "210 dias" —
   * justo la señal contraria a la real. Si Meta declara `total_active_time`
   * se usa directo (es el dato mas fino que hay); si no, pero hay
   * `end_date`, se cuenta hasta ahi. Solo cuando ninguno de los dos esta se
   * seguia contando hasta hoy, y unicamente si el anuncio sigue activo.
   */
  const diasActivo = (a) => {
    if (a.tiempoActivo) return Math.max(0, Math.floor(a.tiempoActivo / 86400));
    if (!a.inicio) return null;
    const hasta = !a.activo && a.fin ? a.fin : Date.now() / 1000;
    return Math.max(0, Math.floor((hasta - a.inicio) / 86400));
  };

  const bibliotecaUrl = (id) => "https://www.facebook.com/ads/library/?id=" + id;

  /*
   * Igual que bibliotecaUrl, pero forzando el pais a "Todos".
   *
   * Sin un ?country= explicito, Meta abre el enlace con el ultimo pais que
   * quedo activo en esa sesion (a veces Colombia, a veces otro) en vez de
   * "Todos". Esto pasa solo desde "Anuncios guardados": un anuncio guardado
   * puede ser de cualquier pais, asi que abrirlo con el pais de la sesion
   * puesto por casualidad no tiene sentido ahi. En el resto de la extension
   * (compartir/copiar el enlace de un anuncio que ya estas viendo en la
   * grilla) se deja bibliotecaUrl tal cual: ahi si tiene sentido conservar
   * el pais con el que se esta mirando.
   */
  const bibliotecaUrlTodos = (id) => bibliotecaUrl(id) + "&country=ALL";

  // =========================================================================
  // guardados, vistos y agrupacion por oferta
  // =========================================================================

  let guardados = {}; // id -> { nombre, puntos: [{ t, copias, dias }] }
  let vistos = new Set();

  /*
   * Hasta que no esta leida la memoria no se pinta nada.
   *
   * El HTML con los anuncios puede llegar antes que el almacen, y entonces las
   * tarjetas se dibujaban con la lista vacia: la estrella salia apagada aunque
   * el anuncio estuviera guardado, y ya no se repintaba.
   */
  let memoriaLista = false;

  const MAX_PUNTOS = 40; // historial por anuncio guardado
  const MAX_VISTOS = 6000;

  // Cuando se abrio el mural de guardados por ultima vez: sirve para saber
  // que cambio desde entonces (ver `novedadesDe` en `abrirMural`).
  let ultimaVisitaMural = 0;

  const cargarMemoria = () =>
    new Promise((listo) => {
      chrome.storage.local.get(["guardados", "vistos", "muralUltimaVisita"], (d) => {
        guardados = d.guardados || {};
        vistos = new Set(d.vistos || []);
        ultimaVisitaMural = d.muralUltimaVisita || 0;
        memoriaLista = true;
        listo();
      });
    });

  const guardarGuardados = () => guardarLocal({ guardados });

  /*
   * Pide una miniatura propia (chica, en base64) de la imagen de un anuncio
   * guardado y la deja anotada junto al resumen. Es la unica forma de que la
   * vista previa no dependa de la URL de Facebook, que trae una firma con
   * vencimiento y deja de cargar sola pasadas unas semanas.
   *
   * Sucede en segundo plano y sin avisar: si falla (anuncio sin imagen, sin
   * red en ese momento, etc.) el resumen se queda con la URL original y sigue
   * funcionando como hasta ahora, solo que expuesto a que esa URL caduque.
   */
  // Sube al cambiar el tamaño o la calidad: las guardadas con una version
  // anterior se rehacen solas al abrir el mural, si su imagen aun carga.
  const VERSION_MINIATURA = 2;

  const generarMiniatura = (id, url) => {
    if (!url) return;
    chrome.runtime.sendMessage({ tipo: "miniatura", url }, (r) => {
      if (chrome.runtime.lastError || !r?.dataUrl) return;
      const f = guardados[id];
      if (!f) return; // se dejo de seguir mientras se generaba
      f.resumen.miniatura = r.dataUrl;
      f.resumen.miniaturaV = VERSION_MINIATURA;
      guardarGuardados();
    });
  };

  let vistosPendiente = null;
  const guardarVistos = () => {
    clearTimeout(vistosPendiente);
    vistosPendiente = setTimeout(() => {
      // Solo los mas recientes: la lista crece sola con cada scroll.
      const lista = [...vistos].slice(-MAX_VISTOS);
      vistos = new Set(lista);
      guardarLocal({ vistos: lista });
    }, 1200);
  };

  /**
   * Añade una medida al historial del anuncio guardado.
   *
   * Con esto la tarjeta puede decir "de 3 a 12 copias en 5 dias", que es lo
   * que distingue un creativo escalando ahora de uno que lleva meses igual.
   */
  const anotarMedida = (a) => {
    const ficha = guardados[a.id];
    if (!ficha) return;

    const hoy = new Date().toISOString().slice(0, 10);
    const ultimo = ficha.puntos[ficha.puntos.length - 1];

    // Una medida por dia: mas fino no aporta y engorda el almacen.
    if (ultimo && ultimo.t === hoy) {
      ultimo.copias = a.copias || 1;
      ultimo.dias = diasActivo(a) ?? 0;
    } else {
      ficha.puntos.push({ t: hoy, copias: a.copias || 1, dias: diasActivo(a) ?? 0 });
      if (ficha.puntos.length > MAX_PUNTOS) ficha.puntos.shift();
    }
    ficha.nombre = a.paginaNombre || ficha.nombre;
    guardarGuardados();
  };

  /** Crecimiento observado desde la primera vez que se guardo. */
  const evolucion = (a) => {
    const ficha = guardados[a.id];
    if (!ficha || ficha.puntos.length < 2) return null;

    const primero = ficha.puntos[0];
    const ahora = ficha.puntos[ficha.puntos.length - 1];
    const dCopias = (ahora.copias || 1) - (primero.copias || 1);
    const dDias = Math.max(1, (ahora.dias || 0) - (primero.dias || 0));
    if (dCopias <= 0) return null;

    return { dCopias, dDias, desde: primero.copias, hasta: ahora.copias };
  };

  /**
   * Huella del texto del anuncio, para reconocer la misma oferta aunque la
   * publiquen anunciantes distintos. Quitamos emojis, signos y espacios de
   * mas, y nos quedamos con el principio, que es lo que rara vez cambia.
   */
  // Se guarda en una tabla aparte: el texto de un anuncio no cambia, y esta
  // expresion regular sobre todo el texto, repetida para cada anuncio en
  // cada lote que llega, era de lo que mas pesaba con 1000 anuncios.
  const huellas = new WeakMap();
  const huellaOferta = (a) => {
    if (huellas.has(a)) return huellas.get(a);
    const t = (a.cuerpo || a.titulo || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const h = t.length < 40 ? null : t.slice(0, 120);
    huellas.set(a, h);
    return h;
  };

  /** id de anuncio -> cuantos anunciantes distintos publican esa misma oferta. */
  let copiones = new Map();
  // id de anuncio -> [{ paginaId, nombre, foto, perfilUrl }, ...] de esos anunciantes.
  let anunciantesDeOferta = new Map();

  // id -> funciones para repintar los botones de esa tarjeta
  const barraDe = new Map();

  const recalcularCopiones = () => {
    // huella -> paginaId -> datos del anunciante (el ultimo anuncio visto de
    // esa pagina gana; solo cambia la foto/el nombre, que no varian entre
    // sus propios anuncios).
    const porHuella = new Map();
    for (const a of anuncios.values()) {
      const h = huellaOferta(a);
      if (!h || !a.paginaId) continue;
      if (!porHuella.has(h)) porHuella.set(h, new Map());
      porHuella.get(h).set(a.paginaId, {
        paginaId: a.paginaId,
        nombre: a.paginaNombre || "Anunciante",
        foto: a.paginaFoto || "",
        // El perfil de Facebook, no: los anuncios de este anunciante en la
        // propia Biblioteca — es lo que tiene sentido ver desde aqui.
        urlBiblioteca: buscarAnunciante(a.paginaId),
      });
    }

    copiones = new Map();
    anunciantesDeOferta = new Map();
    for (const a of anuncios.values()) {
      const h = huellaOferta(a);
      const paginas = h && porHuella.get(h);
      if (paginas && paginas.size > 1) {
        copiones.set(a.id, paginas.size);
        anunciantesDeOferta.set(a.id, [...paginas.values()]);
      }
    }
  };

  /**
   * Nota de "ganador" de 0 a 100.
   *
   * Mezcla las tres señales que de verdad separan un anuncio bueno: que lleve
   * tiempo corriendo (si no funcionara, ya lo habrian parado), que el propio
   * anunciante lo este multiplicando, y que otros lo esten copiando.
   */
  const puntuacion = (a) => {
    const dias = diasActivo(a) ?? 0;
    const copias = a.copias || 1;
    const otros = copiones.get(a.id) || 1;

    const porTiempo = Math.min(40, Math.log2(1 + dias) * 8); // 0-40
    const porCopias = Math.min(35, Math.log2(copias) * 14); // 0-35
    const porCopiones = Math.min(15, (otros - 1) * 8); // 0-15
    const porPlataformas = Math.min(10, (a.plataformas?.length || 1) * 2); // 0-10

    return Math.round(porTiempo + porCopias + porCopiones + porPlataformas);
  };

  const buscarAnunciante = (paginaId) =>
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
    "&country=ALL&view_all_page_id=" + paginaId + "&search_type=page";

  const buscarSitio = (url) => {
    const d = dominioDe(url);
    return d
      ? "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
        "&country=ALL&q=" + encodeURIComponent(d) + "&search_type=keyword_unordered"
      : null;
  };

  const instagramUrl = (a) =>
    a.instagram ? "https://www.instagram.com/" + a.instagram : null;

  const pitido = () => {
    if (!prefs.notificar) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.frequency.value = 880;
      vol.gain.setValueAtTime(0.2, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  // =========================================================================
  // resolucion del boton de WhatsApp
  // =========================================================================

  /**
   * En un anuncio click-to-WhatsApp el creativo casi nunca guarda el numero:
   * segun la documentacion de Meta el enlace es literalmente
   * "https://api.whatsapp.com/send" y el telefono se resuelve al hacer clic,
   * desde la cuenta de WhatsApp vinculada a la Pagina del anunciante.
   *
   *   Via A: el anunciante escribio el numero a mano -> ya viene en el enlace.
   *   Via B: hay que leerlo de las publicaciones publicas de la Pagina.
   *
   * Un anuncio que solo existe como dark post no es alcanzable por ninguna via
   * publica: ahi avisamos en lugar de inventar un numero.
   */
  /**
   * Numero escrito en el propio texto del anuncio.
   *
   * Bastantes anunciantes lo ponen a mano en el cuerpo ("Escribenos al 318
   * 862 3493"). Es gratis y sale al instante, asi que se mira antes de ir a
   * buscarlo a la pagina del anunciante.
   */
  const RE_TELEFONO = /\+?\d[\d\s().-]{7,17}\d/g;

  // Palabras que suelen acompañar a un numero de contacto. Sirven para
  // separar un telefono de una cifra cualquiera.
  const RE_PISTA_CONTACTO = /whatsapp|wasap|wsp|escr[ií]b|cont[aá]ct|mens[aá]j|ll[aá]ma|pedido|cel(?:ular)?\b|tel(?:[eé]fono)?\b/i;

  // Lo que descarta una cifra: dinero, descuentos y medidas.
  const RE_NO_ES_TELEFONO = /[$€%]|\b(pesos|cop|usd|eur|precio|descuento|env[ií]o|unidades|ml|gr|kg|cm)\b/i;

  /*
   * Prefijo internacional por pais.
   *
   * Antes salia del parametro `country` de la URL, y eso fallaba justo en el
   * caso mas comun: con el pais puesto en "Todos" (que es lo que usa el
   * boton "Ver anuncio" de guardados) no habia prefijo y el numero quedaba
   * incompleto. El anuncio ya dice en que paises corre, que es el dato bueno.
   */
  const PREFIJOS = {
    CO: "57", PE: "51", MX: "52", AR: "54", CL: "56", EC: "593", VE: "58",
    BO: "591", PY: "595", UY: "598", BR: "55", PA: "507", CR: "506", GT: "502",
    SV: "503", HN: "504", NI: "505", DO: "1", PR: "1", CU: "53", ES: "34", US: "1",
  };

  const prefijoDe = (a) => {
    for (const pais of a.paises || []) {
      if (PREFIJOS[pais]) return PREFIJOS[pais];
    }
    const deLaUrl = new URLSearchParams(location.search).get("country");
    return PREFIJOS[deLaUrl] || "";
  };

  /**
   * Devuelve todos los candidatos a telefono del texto, mejor primero.
   *
   * Antes se cogia la primera cifra de 8 a 15 digitos que apareciera, y eso
   * metia ruido: un precio ("1.250.000"), una fecha o un NIT se colaban como
   * si fueran un numero de contacto. Ahora una cifra solo cuenta si tiene
   * cerca una palabra de contacto y no va pegada a un simbolo de dinero.
   */
  const numerosEnTexto = (a) => {
    const texto = [a.cuerpo, a.titulo, a.descripcion].filter(Boolean).join(" ").replace(/\s+/g, " ");
    const prefijo = prefijoDe(a);
    const salida = [];

    for (const m of texto.matchAll(RE_TELEFONO)) {
      const digitos = m[0].replace(/\D/g, "");
      if (digitos.length < 8 || digitos.length > 15) continue;

      const pegado = texto.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15);
      if (RE_NO_ES_TELEFONO.test(pegado)) continue;

      const alrededor = texto.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
      if (!RE_PISTA_CONTACTO.test(alrededor)) continue;

      const completo = digitos.length <= 10 && prefijo ? prefijo + digitos : digitos;
      if (!salida.includes(completo)) salida.push(completo);
    }
    return salida;
  };


  /*
   * De donde salio el numero, en palabras.
   *
   * No todos los origenes valen lo mismo y el usuario tiene derecho a
   * saberlo antes de escribirle a alguien: el numero que venia en el enlace
   * del propio anuncio es seguro; uno encontrado en una publicacion suelta
   * que el buscador relaciono con el texto es una apuesta razonable, pero
   * una apuesta.
   */
  const ORIGENES = {
    enlace: "Numero del propio enlace del anuncio",
    texto: "Numero tomado del texto del anuncio",
    pagina: "Numero tomado de la pagina del anunciante",
    publicacion: "Numero de un enlace en una publicacion del anunciante",
    publicacion_texto: "Numero escrito en una publicacion encontrada por buscador",
    instagram: "Numero de un enlace en el Instagram del anunciante",
    instagram_texto: "Numero escrito en la biografia de Instagram del anunciante",
    landing: "Numero encontrado en la pagina de destino del anuncio",
    anuncio_real: "Boton de WhatsApp del anuncio real (story.php)",
    texto_otro: "Numero escrito en otro anuncio del mismo anunciante",
    enlace_otro: "Enlace de WhatsApp de otro anuncio del mismo anunciante",
    pagina_info: "Numero de WhatsApp de la informacion de la pagina del anunciante",
    pagina_telefono: "Telefono de la pagina del anunciante, verificado en WhatsApp",
  };

  /*
   * Estado del boton de WhatsApp, por anuncio (no por anunciante: dos
   * anuncios del mismo anunciante pueden llevar numeros distintos).
   *
   *  - Buscando: el boton muestra un cuadrado de "detener"; otro clic corta
   *    la busqueda y cierra las pestañas de fondo que tuviera abiertas.
   *  - Sin numero: 15 segundos de espera con la cuenta atras en el propio
   *    boton, para no repetir la misma busqueda fallida sin querer.
   *  - Mantener presionado 3 segundos: busca de nuevo desde cero, sin esperar
   *    la cuenta atras y sin usar lo que ya estuviera guardado.
   */
  const ESPERA_SIN_NUMERO = 15;
  const PULSACION_LARGA_MS = 3000;
  const estadoWa = new Map(); // id -> { buscando, solicitud, hasta, reloj }
  const botonesWa = new Map(); // id -> Set de botones (tarjeta, mural...)
  let siguienteSolicitud = 1;

  /*
   * Resultado de la ultima busqueda de cada anuncio ("ok" o "no"), guardado
   * en el almacen: la marca del boton (encontrado / no encontrado) sigue ahi
   * al recargar la pagina, no solo durante los 15 segundos de espera.
   */
  const MAX_RESULTADOS_WA = 4000;
  let resultadosWa = {};
  chrome.storage.local.get("waResultados", (d) => {
    resultadosWa = d.waResultados || {};
    for (const id of botonesWa.keys()) pintarBotonesWa(id);
  });
  const anotarResultadoWa = (id, r, tel) => {
    resultadosWa[id] = { r, t: Date.now(), tel: tel || null };
    const ids = Object.keys(resultadosWa);
    if (ids.length > MAX_RESULTADOS_WA) {
      ids.sort((x, y) => resultadosWa[x].t - resultadosWa[y].t);
      for (const viejo of ids.slice(0, ids.length - MAX_RESULTADOS_WA)) delete resultadosWa[viejo];
    }
    guardarLocal({ waResultados: resultadosWa });
  };

  const estadoDe = (id) => {
    if (!estadoWa.has(id)) estadoWa.set(id, { buscando: false, solicitud: null, hasta: 0, reloj: null });
    return estadoWa.get(id);
  };

  /*
   * El icono de WhatsApp partido en dos piezas (burbuja y auricular), para
   * poder pintar el auricular aparte: rojo si no se encontro numero, o
   * cambiarlo por la bandera del pais del numero si si se encontro.
   */
  const BURBUJA_WA = 'M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592';
  const AURICULAR_WA = 'M11.609 9.587c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232';
  const iconoWaSinNumero = () =>
    '<svg viewBox="0 0 16 16"><path fill="currentColor" d="' + BURBUJA_WA + '"/>' +
    '<path fill="#e5202f" d="' + AURICULAR_WA + '"/></svg>';

  // Prefijo telefonico -> pais (codigo ISO de la bandera en /banderas).
  // Los de mas cifras primero, para que 1809 gane a 1.
  const PAIS_DE_PREFIJO = [
    ["1809", "do"], ["1829", "do"], ["1849", "do"], ["1787", "pr"], ["1939", "pr"],
    ["591", "bo"], ["593", "ec"], ["595", "py"], ["598", "uy"], ["502", "gt"], ["503", "sv"],
    ["504", "hn"], ["505", "ni"], ["506", "cr"], ["507", "pa"], ["509", "ht"], ["501", "bz"],
    ["351", "pt"], ["240", "gq"],
    ["52", "mx"], ["53", "cu"], ["54", "ar"], ["55", "br"], ["56", "cl"], ["57", "co"],
    ["58", "ve"], ["51", "pe"], ["34", "es"], ["44", "gb"], ["33", "fr"], ["39", "it"], ["49", "de"],
    ["1", "us"],
  ];
  const paisDeTelefono = (tel) => {
    const d = String(tel || "").replace(/\D/g, "");
    const par = PAIS_DE_PREFIJO.find(([pre]) => d.startsWith(pre));
    return par ? par[1] : null;
  };
  const iconoWaConBandera = (pais) =>
    '<span class="was-wa-bandera"><svg viewBox="0 0 16 16"><path fill="currentColor" d="' + BURBUJA_WA + '"/></svg>' +
    '<img alt="" draggable="false" src="' + chrome.runtime.getURL("banderas/" + pais + ".svg") + '"></span>';

  const ICONO_DETENER =
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>';

  // Pinta todos los botones de ese anuncio segun su estado actual.
  const pintarBotonesWa = (id) => {
    const st = estadoDe(id);
    for (const b of botonesWa.get(id) || []) {
      // Tambien si aun no esta en la pagina (se registra antes de insertarse);
      // uno que ya estuvo y Meta quito, se suelta para no acumularlo.
      if (b.isConnected) b._wasConectado = true;
      else if (b._wasConectado) {
        botonesWa.get(id).delete(b);
        continue;
      }
      if (b._wasOriginal == null) b._wasOriginal = b.innerHTML;
      const quedan = Math.ceil((st.hasta - Date.now()) / 1000);
      const resultado = resultadosWa[id]?.r;
      b.classList.toggle("was-wa-buscando", st.buscando);
      b.classList.toggle("was-wa-espera", !st.buscando && quedan > 0);
      const pais = resultado === "ok" ? paisDeTelefono(resultadosWa[id].tel) : null;
      if (st.buscando) {
        b.innerHTML = ICONO_DETENER;
        b.title = "Buscando... clic para detener";
      } else if (quedan > 0) {
        b.innerHTML = '<span class="was-wa-cuenta">' + quedan + "</span>";
        b.title = "Sin numero. Espera " + quedan + " s o manten presionado 3 s para buscar de nuevo";
      } else {
        // En los botones redondos (la tarjeta) el icono cambia; en los de
        // texto (el mural) se deja el texto tal cual.
        const redondo = b.classList.contains("was-accion-btn");
        b.innerHTML =
          redondo && resultado === "no"
            ? iconoWaSinNumero()
            : redondo && pais
              ? iconoWaConBandera(pais)
              : b._wasOriginal;
        b.title =
          resultado === "ok"
            ? "WhatsApp encontrado (manten presionado 3 s para buscar de nuevo)"
            : resultado === "no"
              ? "Ya se busco y no se encontro numero (manten presionado 3 s para buscar de nuevo)"
              : "WhatsApp (manten presionado 3 s para buscar de nuevo)";
      }
    }
  };

  const iniciarEspera = (id) => {
    const st = estadoDe(id);
    st.hasta = Date.now() + ESPERA_SIN_NUMERO * 1000;
    clearInterval(st.reloj);
    st.reloj = setInterval(() => {
      pintarBotonesWa(id);
      if (Date.now() >= st.hasta) clearInterval(st.reloj);
    }, 1000);
    pintarBotonesWa(id);
  };

  /** Engancha un boton a la busqueda de WhatsApp de un anuncio. */
  const conectarBotonWa = (a, btn) => {
    if (!botonesWa.has(a.id)) botonesWa.set(a.id, new Set());
    botonesWa.get(a.id).add(btn);
    btn._wasOriginal = btn.innerHTML;
    pintarBotonesWa(a.id);

    let temporizador = null;
    const soltar = () => {
      clearTimeout(temporizador);
      temporizador = null;
      btn.classList.remove("was-wa-presionando");
    };
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || estadoDe(a.id).buscando) return;
      btn.classList.add("was-wa-presionando");
      temporizador = setTimeout(() => {
        soltar();
        btn._wasIgnorarClic = true; // el clic que llega al soltar ya se atendio
        aviso("Buscando de nuevo desde cero");
        clicWhatsapp(anuncios.get(a.id) || a, btn, true);
      }, PULSACION_LARGA_MS);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, soltar);
  };

  const clicWhatsapp = (a, boton, forzar) => {
    if (!forzar && boton._wasIgnorarClic) {
      boton._wasIgnorarClic = false;
      return;
    }
    const st = estadoDe(a.id);

    if (st.buscando) {
      chrome.runtime.sendMessage({ tipo: "cancelarWhatsapp", solicitud: st.solicitud }).catch(() => {});
      st.buscando = false;
      st.solicitud = null;
      pintarBotonesWa(a.id);
      return aviso("Busqueda detenida");
    }

    const quedan = Math.ceil((st.hasta - Date.now()) / 1000);
    if (!forzar && quedan > 0) {
      return aviso(
        "Sin numero hace poco. Espera " + quedan + " s o manten presionado 3 s para buscar de nuevo",
        true
      );
    }
    if (forzar) {
      st.hasta = 0;
      clearInterval(st.reloj);
      telefonos.delete(a.id);
    }
    resolverWhatsapp(a, forzar);
  };

  const resolverWhatsapp = async (a, forzar) => {
    const ir = (tel, msg, origen, nombreWa) => {
      const base = ORIGENES[origen] || "";
      aviso(nombreWa ? 'WhatsApp de "' + nombreWa + '" — ' + base.toLowerCase() : base);
      const texto = msg || a.mensajePrellenado || "";
      abrir(
        "https://api.whatsapp.com/send?phone=" + tel +
        (texto ? "&text=" + encodeURIComponent(texto) : "")
      );
    };

    // El enlace completo que trae el propio anuncio es el dato mas seguro:
    // es literalmente a donde lleva su boton.
    if (a.telefonoDirecto && !forzar) {
      anotarResultadoWa(a.id, "ok", a.telefonoDirecto);
      pintarBotonesWa(a.id);
      return ir(a.telefonoDirecto, null, "enlace");
    }

    if (!forzar && telefonos.has(a.id)) {
      const c = telefonos.get(a.id);
      return ir(c.telefono, c.mensaje, c.origen, c.nombreWa);
    }

    /*
     * Numeros escritos en este anuncio y en los demas del mismo anunciante
     * que ya estan cargados: se mandan para verificarlos primero, antes de
     * abrir su pagina. Ya no se abren a ciegas: un numero del texto puede
     * ser un fijo o uno que no esta en WhatsApp.
     */
    const candidatos = [];
    const origenDe = (x) => (x === a ? "texto" : "texto_otro");
    for (const x of [a, ...[...anuncios.values()].filter((o) => o !== a && o.paginaId === a.paginaId)]) {
      if (x.telefonoDirecto) candidatos.push({ telefono: x.telefonoDirecto, origen: x === a ? "enlace" : "enlace_otro" });
      for (const n of numerosEnTexto(x)) candidatos.push({ telefono: n, origen: origenDe(x) });
    }

    const st = estadoDe(a.id);
    const solicitud = siguienteSolicitud++;
    st.buscando = true;
    st.solicitud = solicitud;
    pintarBotonesWa(a.id);
    try {
      const r = await chrome.runtime.sendMessage({
        tipo: "resolverWhatsapp",
        solicitud,
        forzar: !!forzar,
        adId: a.id,
        paginaId: a.paginaId,
        perfilUrl: a.perfilUrl,
        copy: a.cuerpo,
        titulo: a.titulo,
        instagram: a.instagram,
        linkUrl: a.linkUrl,
        prefijo: prefijoDe(a),
        candidatos,
      });
      // Detenida por el usuario (o sustituida por otra busqueda): se ignora.
      if (st.solicitud !== solicitud) return;
      st.buscando = false;
      st.solicitud = null;
      if (r && r.telefono) {
        telefonos.set(a.id, r);
        anotarResultadoWa(a.id, "ok", r.telefono);
        pintarBotonesWa(a.id);
        ir(r.telefono, r.mensaje, r.origen, r.nombreWa);
      } else {
        anotarResultadoWa(a.id, "no");
        iniciarEspera(a.id);
        if (r && r.descartados && r.descartados.length) {
          aviso(
            "Se encontro " + r.descartados.map((n) => "+" + n).join(", ") +
              " pero no es una cuenta de WhatsApp activa. No se abre para no darte un numero falso.",
            true
          );
        } else {
          aviso("Este anunciante no publica su WhatsApp en ningun sitio publico", true);
        }
      }
    } catch {
      if (st.solicitud !== solicitud) return;
      st.buscando = false;
      st.solicitud = null;
      pintarBotonesWa(a.id);
      aviso("Error al resolver el numero", true);
    }
  };



  // =========================================================================
  // descarga de creativos
  // =========================================================================

  const nombreArchivo = (a, i, ext) =>
    (a.paginaNombre || "anuncio").replace(/[^\w\s-]/g, "").trim().slice(0, 40) +
    "-" + a.id + (i != null ? "-" + (i + 1) : "") + "." + ext;

  const descargar = (url, nombre) =>
    chrome.runtime.sendMessage({ tipo: "descargar", url, nombre });

  /*
   * Un carrusel trae varias tarjetas, cada una con su propia imagen o video
   * (y a veces su propio enlace de destino). Antes solo se leia el creativo
   * principal: al descargar un carrusel completo, faltaban las demas
   * tarjetas sin ningun aviso de que se habian quedado fuera.
   */
  const creativosDe = (a) => {
    const lista = [];

    if (a.tarjetasCarrusel?.length) {
      for (const t of a.tarjetasCarrusel) {
        if (t.videoHd || t.videoSd) lista.push({ url: t.videoHd || t.videoSd, ext: "mp4", titulo: t.titulo });
        if (t.imagen) lista.push({ url: t.imagen, ext: "jpg", titulo: t.titulo });
      }
      if (lista.length) return lista;
    }

    if (a.videoHd || a.videoSd) lista.push({ url: a.videoHd || a.videoSd, ext: "mp4" });
    for (const img of a.imagenes || []) lista.push({ url: img, ext: "jpg" });
    return lista;
  };

  const baseCarpeta = (a) =>
    (a.paginaNombre || "anuncio").replace(/[^\w\s-]/g, "").trim().slice(0, 40) + "-" + a.id;

  /**
   * Un solo creativo baja suelto; varios se juntan en un ZIP para no llenar la
   * carpeta de descargas con quince archivos por anuncio.
   *
   * Los bytes los trae el service worker: en MV3 el content script sigue atado
   * al CORS de la pagina, y fbcdn no nos deja leer sus respuestas desde aqui.
   */
  const guardarCreativos = async (a, cuantos) => {
    const lista = creativosDe(a);
    if (!lista.length) return aviso("Creativo no disponible para descarga", true);
    await guardarSeleccion(a, cuantos === "principal" ? lista.slice(0, 1) : lista);
  };

  const guardarSeleccion = async (a, sel) => {
    if (!sel.length) return aviso("Creativo no disponible para descarga", true);

    if (sel.length === 1) {
      await descargar(sel[0].url, nombreArchivo(a, null, sel[0].ext));
      return aviso("Creativo guardado");
    }

    if (typeof JSZip !== "function") {
      for (let i = 0; i < sel.length; i++) {
        await descargar(sel[i].url, nombreArchivo(a, i, sel[i].ext));
      }
      return aviso(sel.length + " creativos guardados");
    }

    aviso("Preparando " + sel.length + " creativos...");
    const zip = new JSZip();
    const carpeta = zip.folder(baseCarpeta(a));
    let fallos = 0;

    for (let i = 0; i < sel.length; i++) {
      const r = await chrome.runtime.sendMessage({ tipo: "traer", url: sel[i].url });
      if (!r || !r.base64) {
        fallos++;
        continue;
      }
      carpeta.file(nombreArchivo(a, i, sel[i].ext), r.base64, { base64: true });
    }

    carpeta.file("informacion.txt", resumen(a));

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const enlace = el("a");
    enlace.href = url;
    enlace.download = baseCarpeta(a) + ".zip";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);

    aviso(
      fallos
        ? "ZIP guardado, " + fallos + " creativos no se pudieron descargar"
        : "ZIP con " + sel.length + " creativos guardado",
      fallos > 0
    );
  };

  /*
   * Descarga multiple: seleccionar varios anuncios de la grilla y bajar
   * todos sus creativos juntos en un solo ZIP.
   *
   * `orden` es la lista de ids en el orden en que se fueron marcando — ese
   * orden es directamente el numero con el que se nombra cada archivo (indice
   * + 1), asi que quitar uno de la mitad renumera solo a mover elementos
   * en un array, sin nada que recalcular a mano. `distintivos` guarda el
   * nodo numerico de cada tarjeta para poder repintarlos todos cuando el
   * orden cambia, sin tener que volver a recorrer el documento entero.
   */
  const multiDescarga = { activo: false, orden: [] };
  const distintivosMulti = new Map(); // id -> nodo que muestra el numero
  const itemsMenuMultiDescarga = new Set(); // items "Descarga multiple" de cada tarjeta

  const refrescarItemsMenuMultiDescarga = () => {
    const texto = multiDescarga.activo ? "Detener descarga multiple" : "Descarga multiple (varios anuncios)";
    for (const item of itemsMenuMultiDescarga) {
      if (item) item.textContent = texto;
    }
  };

  const repintarDistintivosMulti = () => {
    for (const [id, nodo] of distintivosMulti) {
      const pos = multiDescarga.orden.indexOf(id);
      nodo.textContent = pos >= 0 ? String(pos + 1) : "";
      nodo.classList.toggle("was-multi-marcado", pos >= 0);
    }
    actualizarBandejaRapida();
  };

  // El ultimo clic SIN Shift: el punto desde el que se extiende un rango.
  // Se actualiza solo con un clic normal, nunca con uno en Shift, para poder
  // extender o corregir el mismo rango con varios Shift+clic seguidos.
  let anclaRangoMulti = null;
  // El rango que puso el ULTIMO Shift+clic (no lo seleccionado a mano antes
  // de empezar a usar Shift): hace falta recordarlo para poder encogerlo.
  let ultimoRangoAplicado = [];

  /*
   * El "rango" es el orden en que las tarjetas estan en el documento en este
   * momento — el mismo orden visual de la grilla (izquierda a derecha, fila
   * por fila), que es lo que cualquiera esperaria al decir "desde este
   * anuncio hasta este otro".
   */
  const idsEnOrdenVisual = () => [...document.querySelectorAll("[data-was-id]")].map((t) => t.dataset.wasId);

  const alternarSeleccionMulti = (id, conRango) => {
    if (conRango && anclaRangoMulti && anclaRangoMulti !== id) {
      const visual = idsEnOrdenVisual();
      const i = visual.indexOf(anclaRangoMulti);
      const j = visual.indexOf(id);
      if (i >= 0 && j >= 0) {
        const [desde, hasta] = i < j ? [i, j] : [j, i];
        const rangoNuevo = visual.slice(desde, hasta + 1);

        /*
         * Un Shift+clic mas corto que el anterior debe ENCOGER la seleccion,
         * no solo sumarle mas: si ya se habia marcado 1-5 con Shift y ahora
         * se hace Shift+clic en el 3, el 4 y el 5 tienen que soltarse. Solo
         * se sueltan los que quedaron marcados por el rango anterior — algo
         * marcado aparte, antes de empezar a usar Shift, no se toca.
         */
        for (const idViejo of ultimoRangoAplicado) {
          if (!rangoNuevo.includes(idViejo)) {
            const pos = multiDescarga.orden.indexOf(idViejo);
            if (pos >= 0) multiDescarga.orden.splice(pos, 1);
          }
        }
        for (const idDelRango of rangoNuevo) {
          if (!multiDescarga.orden.includes(idDelRango)) multiDescarga.orden.push(idDelRango);
        }
        ultimoRangoAplicado = rangoNuevo;
        return repintarDistintivosMulti();
      }
    }

    // Clic normal (o Shift sin ancla previa): alterna solo este, y se
    // convierte en la nueva ancla para el proximo Shift+clic.
    anclaRangoMulti = id;
    ultimoRangoAplicado = [];
    const pos = multiDescarga.orden.indexOf(id);
    if (pos >= 0) multiDescarga.orden.splice(pos, 1);
    else multiDescarga.orden.push(id);
    repintarDistintivosMulti();
  };

  const activarMultiDescarga = () => {
    multiDescarga.activo = true;
    multiDescarga.orden = [];
    anclaRangoMulti = null;
    ultimoRangoAplicado = [];
    document.querySelectorAll("[data-was-id]").forEach((t) => t.classList.add("was-multi-activo"));
    aviso("Selecciona los anuncios a descargar — Shift+clic marca un rango entero");
    refrescarItemsMenuMultiDescarga();
    actualizarBandejaRapida();
  };

  const desactivarMultiDescarga = () => {
    multiDescarga.activo = false;
    multiDescarga.orden = [];
    document.querySelectorAll("[data-was-id]").forEach((t) => t.classList.remove("was-multi-activo"));
    refrescarItemsMenuMultiDescarga();
    repintarDistintivosMulti();
  };

  // Escape cancela la seleccion sin tener que ir a buscar el menu de nuevo:
  // es el atajo natural para "salir de este modo" en casi cualquier programa.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && multiDescarga.activo) desactivarMultiDescarga();
  });

  /*
   * El nombre de cada archivo es solo el numero: el orden de seleccion para
   * el anuncio, y si ese anuncio trae mas de un creativo (carrusel, o varias
   * imagenes), un sub-numero detras de un guion — "3-1", "3-2" — para que se
   * sepa que ambos vienen del mismo anuncio sin tener que abrirlos.
   */
  const descargarMultiple = async () => {
    const ids = [...multiDescarga.orden];
    if (!ids.length) return aviso("No has seleccionado ningun anuncio", true);

    if (typeof JSZip !== "function") return aviso("Falta JSZip: no se puede armar el ZIP", true);

    aviso("Preparando " + ids.length + " anuncios...");
    const zip = new JSZip();
    let archivos = 0;
    let fallos = 0;
    // Texto de cada anuncio que si logro bajar al menos un creativo, en el
    // mismo orden numerico — sirve para agrupar despues los que comparten
    // exactamente el mismo texto en un solo .txt.
    const entradasTexto = [];

    for (let i = 0; i < ids.length; i++) {
      const a = anuncios.get(ids[i]);
      if (!a) { fallos++; continue; }
      const sel = creativosDe(a);
      if (!sel.length) { fallos++; continue; }

      const numero = i + 1;
      let logrados = 0;
      for (let j = 0; j < sel.length; j++) {
        const r = await chrome.runtime.sendMessage({ tipo: "traer", url: sel[j].url });
        if (!r || !r.base64) { fallos++; continue; }
        const nombre = (sel.length > 1 ? numero + "-" + (j + 1) : String(numero)) + "." + sel[j].ext;
        zip.file(nombre, r.base64, { base64: true });
        archivos++;
        logrados++;
      }
      if (logrados) entradasTexto.push({ numero, texto: textoTituloDescripcion(a).trim() });
    }

    if (!archivos) return aviso("No se pudo descargar ningun creativo", true);

    /*
     * Un .txt por anuncio, salvo que dos o mas SEGUIDOS (en el orden de
     * seleccion) tengan exactamente el mismo texto: ahi se agrupan en uno
     * solo nombrado "desde-hasta.txt", para no repetir el mismo archivo una
     * y otra vez cuando varias copias comparten el mismo anuncio.
     */
    if (prefs.multiDescargaConTexto) {
      const grupos = [];
      for (const entrada of entradasTexto) {
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.texto === entrada.texto) ultimo.hasta = entrada.numero;
        else grupos.push({ desde: entrada.numero, hasta: entrada.numero, texto: entrada.texto });
      }
      for (const g of grupos) {
        if (!g.texto) continue;
        const nombre = (g.desde === g.hasta ? String(g.desde) : g.desde + "-" + g.hasta) + ".txt";
        zip.file(nombre, g.texto);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const enlace = el("a");
    enlace.href = url;
    enlace.download = "wa-ads-spy-multidescarga-" + new Date().toISOString().slice(0, 10) + ".zip";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 8000);

    aviso(
      fallos
        ? "ZIP guardado con " + archivos + " archivos, " + fallos + " no se pudieron descargar"
        : "ZIP guardado con " + archivos + " archivos de " + ids.length + " anuncios",
      fallos > 0
    );

    desactivarMultiDescarga();
  };

  const guardarInfo = (a) => {
    const blob = new Blob([resumen(a)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = el("a");
    enlace.href = url;
    enlace.download = "informacion-del-anuncio-" + a.id + ".txt";
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    aviso("Informacion guardada");
  };

  /*
   * Los tres campos de texto juntos, pero separados con un encabezado y una
   * linea en blanco antes de cada uno: pegar el texto principal, el titulo y
   * la descripcion sueltos, uno detras de otro, deja al que lo recibe sin
   * forma de saber donde termina uno y empieza el siguiente. Un campo vacio
   * se omite en vez de dejar el encabezado seguido de nada.
   */
  const textoTituloDescripcion = (a) => {
    const partes = [];
    if (a.cuerpo) partes.push("TEXTO PRINCIPAL:\n" + a.cuerpo);
    if (a.titulo) partes.push("TITULO:\n" + a.titulo);
    if (a.descripcion) partes.push("DESCRIPCION:\n" + a.descripcion);
    return partes.join("\n\n");
  };

  const resumen = (a) => {
    const d = diasActivo(a);
    return [
      "INFORMACION DEL CREATIVO:",
      "Texto principal: " + (a.cuerpo || "-"),
      "Titulo: " + (a.titulo || "-"),
      "Descripcion: " + (a.descripcion || "-"),
      "Llamado a la accion: " + (a.ctaTexto || "-"),
      "URL del sitio: " + (limpiarUrl(a.linkUrl) || "-"),
      "",
      "OTRA INFORMACION DEL ANUNCIO:",
      "Identificacion del anuncio: " + a.id,
      "Estado: " + (a.activo ? "Activo" : "Inactivo"),
      "Tipo del anuncio: " + (a.formato || "-"),
      "Cantidad de anuncios con el mismo creativo: " + (a.copias || 1),
      "Ubicacion del anuncio: " + (a.plataformas.join(", ") || "-"),
      "Tiempo de actividad: " + (d != null ? d + " dias" : "-"),
      "",
      "INFORMACION DEL ANUNCIANTE:",
      "Nombre: " + (a.paginaNombre || "-"),
      "Perfil: " + (a.perfilUrl || "-"),
      "",
      "ENLACES RELACIONADOS:",
      "URL en la Biblioteca: " + bibliotecaUrl(a.id),
      "Anuncios del anunciante: " + buscarAnunciante(a.paginaId),
      "Anuncios del sitio: " + (buscarSitio(a.linkUrl) || "-"),
    ].join("\n");
  };

  // =========================================================================
  // compartir
  // =========================================================================

  const textoCompartir = (a, titulo, url) => {
    const d = diasActivo(a);
    return (
      "🚀 Mira esta oferta que encontre en la Biblioteca de Anuncios." +
      (d != null ? " Lleva al menos " + d + " dias activa!" : "") +
      "\n\n✅ " + titulo + ": " + url + "\n"
    );
  };

  const compartirEn = (red, texto) => {
    const t = encodeURIComponent(texto);
    const destinos = {
      whatsapp: "https://api.whatsapp.com/send?text=" + t,
      telegram: "https://t.me/share/url?url=&text=" + t,
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + t,
      email: "mailto:?subject=Anuncio&body=" + t,
    };
    abrir(destinos[red]);
  };

  /**
   * Segundo paso de "Enviar": elegido el enlace, se elige por donde sale.
   * Va en un cuadro suelto porque el menu de la barra ya se cerro.
   */
  const elegirRed = (titulo, texto, url) => {
    const fondo = el("div", "was-suelto-fondo");
    const caja = el("div", "was-suelto");

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, "Enviar: " + titulo));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", () => fondo.remove());
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    const opciones = [
      ["WhatsApp", () => compartirEn("whatsapp", texto)],
      ["Telegram", () => compartirEn("telegram", texto)],
      ["Facebook", () => compartirEn("facebook", url || texto)],
      ["Email", () => compartirEn("email", texto)],
      ["Copiar el texto", () => copiar(texto, "Texto")],
    ];
    for (const [nombre, accionar] of opciones) {
      const b = el("button", "was-item");
      b.textContent = nombre;
      b.addEventListener("click", () => {
        fondo.remove();
        accionar();
      });
      caja.appendChild(b);
    }

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && fondo.remove());
    document.body.appendChild(fondo);
  };

  /**
   * "Elegir creativos": marca cuales bajar cuando el anuncio trae varios
   * (carrusel o varias imagenes).
   */
  const elegirCreativos = (a) => {
    const lista = creativosDe(a);
    if (!lista.length) return aviso("Creativo no disponible para descarga", true);
    if (lista.length === 1) return guardarCreativos(a, "principal");

    const fondo = el("div", "was-suelto-fondo");
    const caja = el("div", "was-suelto");

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, "Elegir creativos"));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", () => fondo.remove());
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    const marcas = [];
    lista.forEach((c, i) => {
      const fila = el("label", "was-elegible");
      const casilla = el("input");
      casilla.type = "checkbox";
      casilla.checked = true;
      marcas.push(casilla);

      // Con titulo propio (viene de una tarjeta de carrusel) se muestra ese
      // texto: es lo que de verdad distingue una tarjeta de otra, el numero
      // suelto no dice nada de que trae cada una.
      const etiqueta = (c.ext === "mp4" ? "Video" : "Imagen") + " " + (i + 1) + (c.titulo ? " — " + c.titulo : "");
      const nombre = el("span", null, etiqueta);
      fila.append(casilla, nombre);
      caja.appendChild(fila);
    });

    const bajar = el("button", "was-primario", "DESCARGAR");
    bajar.addEventListener("click", async () => {
      const elegidos = lista.filter((_, i) => marcas[i].checked);
      fondo.remove();
      if (!elegidos.length) return aviso("No marcaste ningun creativo", true);
      await guardarSeleccion(a, elegidos);
    });
    caja.appendChild(bajar);

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && fondo.remove());
    document.body.appendChild(fondo);
  };

  /** Enlaces del anuncio, listos para pegar en un mensaje. */
  const enlacesDe = (a) =>
    [
      ["Sitio del anuncio", limpiarUrl(a.linkUrl)],
      ["Perfil del anunciante", a.perfilUrl],
      ["Instagram del anunciante", instagramUrl(a)],
      ["Anuncio en la Biblioteca", bibliotecaUrl(a.id)],
      ["Anuncios del anunciante", buscarAnunciante(a.paginaId)],
      ["Anuncios del sitio", buscarSitio(a.linkUrl)],
    ].filter(([, url]) => url);

  // =========================================================================
  // bandeja de acciones de la tarjeta
  // =========================================================================

  /**
   * Iconos de Bootstrap Icons (MIT) y Lucide (ISC), incrustados como SVG.
   * Van en el archivo en vez de como recursos para que no haya ni una peticion
   * de red: la extension tiene que pintar la tarjeta en el mismo instante en
   * que aparece.
   */
  const relleno = (d, vb = "0 0 16 16") =>
    '<svg viewBox="' + vb + '" fill="currentColor">' + d + "</svg>";

  const trazo = (d, vb = "0 0 24 24") =>
    '<svg viewBox="' + vb + '" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>";

  const ICONOS = {
    guardar: relleno(
      '<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>' +
        '<path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>'
    ),
    copiar: relleno(
      '<path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/>'
    ),
    abrir: trazo(
      '<path d="M15 3h6v6"/><path d="M10 14 21 3"/>' +
        '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
    ),
    compartir: trazo(
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
        '<line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/>' +
        '<line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>'
    ),
    wa: relleno(
      '<path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>'
    ),
    calendario: trazo(
      '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/>' +
        '<path d="M3 9h18"/><path d="M8 13h.01"/><path d="M12 13h.01"/><path d="M16 13h.01"/>' +
        '<path d="M8 17h.01"/><path d="M12 17h.01"/><path d="M16 17h.01"/>'
    ),
    ojo: relleno(
      '<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/>' +
        '<path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>'
    ),
    ojoNo: trazo(
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/>' +
        '<path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/>' +
        '<path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/>' +
        '<path d="m2 2 20 20"/>'
    ),
    arriba: relleno(
      '<path fill-rule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5"/>'
    ),
    ajustes: trazo(
      '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>' +
        '<circle cx="12" cy="12" r="3"/>'
    ),
    // Marca del panel recogido: una mira sobre un anuncio, que es justo lo que
    // hace la extension — apuntar al anuncio que interesa.
    marca:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="2.5" y="4" width="19" height="14" rx="2.5"/>' +
      '<path d="M2.5 8.5h19"/>' +
      '<circle cx="12" cy="13.2" r="3.1"/>' +
      '<path d="M12 8.6v1.3M12 16.5v1.3M7.4 13.2h1.3M15.3 13.2h1.3"/>' +
      "</svg>",
    copia: trazo(
      '<path d="M21 8v11a2 2 0 0 1-2 2H8"/>' +
        '<rect x="3" y="3" width="13" height="13" rx="2"/>' +
        '<path d="M9.5 6.5v6M6.5 9.5h6"/>'
    ),
    ficha: trazo(
      '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/>' +
        '<path d="M9 21v-5h6v5"/><path d="M9 11h.01"/><path d="M15 11h.01"/>'
    ),
    estrella: trazo(
      '<path d="M11.5 2.7a.6.6 0 0 1 1 0l2.4 5a.6.6 0 0 0 .5.3l5.4.8a.6.6 0 0 1 .3 1l-3.9 3.8a.6.6 0 0 0-.2.6l1 5.4a.6.6 0 0 1-.9.6l-4.8-2.5a.6.6 0 0 0-.6 0l-4.8 2.5a.6.6 0 0 1-.9-.6l1-5.4a.6.6 0 0 0-.2-.6L2.9 9.8a.6.6 0 0 1 .3-1l5.4-.8a.6.6 0 0 0 .5-.3z"/>'
    ),
    estrellaLlena:
      '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linejoin="round"><path d="M11.5 2.7a.6.6 0 0 1 1 0l2.4 5a.6.6 0 0 0 .5.3l5.4.8a.6.6 0 0 1 ' +
      '.3 1l-3.9 3.8a.6.6 0 0 0-.2.6l1 5.4a.6.6 0 0 1-.9.6l-4.8-2.5a.6.6 0 0 0-.6 0l-4.8 2.5a.6.6 0 0 ' +
      '1-.9-.6l1-5.4a.6.6 0 0 0-.2-.6L2.9 9.8a.6.6 0 0 1 .3-1l5.4-.8a.6.6 0 0 0 .5-.3z"/></svg>',
    flechaIzq: trazo('<path d="m15 18-6-6 6-6"/>'),
    flechaDer: trazo('<path d="m9 18 6-6-6-6"/>'),
    chispa: trazo(
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>' +
        '<path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'
    ),
    paleta: trazo(
      '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>' +
        '<circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>' +
        '<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>' +
        '<circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>' +
        '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'
    ),
    plegar: relleno(
      '<path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>'
    ),
  };

  const svg = (marca) => marca;

  const cerrarMenus = (menos) =>
    document.querySelectorAll(".was-accion.was-abierto").forEach((m) => {
      if (m !== menos) m._wasCerrar?.();
    });

  document.addEventListener("click", () => cerrarMenus(null));

  /*
   * "Mantener siempre Todos los anuncios": el desplegable "Tipo de anuncio"
   * de la Biblioteca es un grid de opciones sin selector fijo, asi que se
   * localiza por el texto de su encabezado ("Selecciona una categoria de
   * anuncio") y se corrige la opcion marcada tras cualquier clic en la
   * pagina — no solo en el propio desplegable, por si se cierra solo antes
   * de que le de tiempo a este chequeo.
   */
  const RE_CATEGORIA_ANUNCIO = /categor.a de anuncio/i;

  const forzarTodosLosAnuncios = () => {
    if (!prefs.forzarTodosAnuncios) return;
    for (const grid of document.querySelectorAll('[role="grid"]')) {
      let contenedor = grid;
      let esDeCategoria = false;
      for (let i = 0; i < 6 && contenedor; i++) {
        if (RE_CATEGORIA_ANUNCIO.test(contenedor.textContent || "")) {
          esDeCategoria = true;
          break;
        }
        contenedor = contenedor.parentElement;
      }
      if (!esDeCategoria) continue;

      const opciones = grid.querySelectorAll('[role="row"] input[aria-checked]');
      const primera = opciones[0];
      if (primera && primera.getAttribute("aria-checked") !== "true") primera.click();
    }
  };

  document.addEventListener(
    "click",
    () => setTimeout(forzarTodosLosAnuncios, 150),
    true
  );

  /*
   * Al abrir la Biblioteca en una pestaña nueva, sin ninguna busqueda, deja
   * el buscador en pais "Todos" y categoria "Todos los anuncios" sin que
   * haya que tocar nada. Los dos son desplegables (role=combobox) que Meta
   * abre con eventos de puntero, no con .click(), y cuyas opciones son filas
   * de un grid con un <input aria-checked> dentro.
   *
   * Solo una vez por pestaña (sessionStorage): si luego el usuario cambia el
   * pais o la categoria a mano, no se le vuelve a pisar.
   */
  const pulsar = (nodo) => {
    for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const Clase = tipo.startsWith("pointer") ? PointerEvent : MouseEvent;
      nodo.dispatchEvent(new Clase(tipo, { bubbles: true, cancelable: true, view: window }));
    }
  };

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  const esperarQue = async (comprobar, maxMs) => {
    const fin = Date.now() + maxMs;
    while (Date.now() < fin) {
      const r = comprobar();
      if (r) return r;
      await esperar(150);
    }
    return null;
  };

  const desplegables = () => [...document.querySelectorAll('[role="combobox"][aria-haspopup="listbox"]')];

  // Abre el desplegable y pulsa la opcion cuyo texto cumple `esOpcion`.
  const elegirEnDesplegable = async (caja, esOpcion) => {
    pulsar(caja);
    const opcion = await esperarQue(() => {
      for (const fila of document.querySelectorAll('[role="grid"] [role="row"]')) {
        if (esOpcion((fila.textContent || "").trim())) return fila.querySelector("input") || fila;
      }
      return null;
    }, 3000);
    if (!opcion) return false;
    if (opcion.getAttribute?.("aria-checked") !== "true") pulsar(opcion);
    return true;
  };

  const configurarBuscadorInicial = async () => {
    try {
      if (sessionStorage.getItem("was-buscador-inicial")) return;
    } catch (e) {}
    if (new URLSearchParams(location.search).get("q")) return;

    const cajas = await esperarQue(() => {
      const d = desplegables();
      return d.length >= 2 ? d : null;
    }, 15000);
    if (!cajas) return;
    // Solo si es el buscador de la portada: la categoria aun sin elegir.
    if (!RE_CATEGORIA_ANUNCIO.test(cajas[1].textContent || "")) return;

    try { sessionStorage.setItem("was-buscador-inicial", "1"); } catch (e) {}

    if (!/^todos$/i.test((cajas[0].textContent || "").replace(/​/g, "").trim())) {
      await elegirEnDesplegable(cajas[0], (t) => /^todos$/i.test(t));
      await esperar(600);
    }
    const categoria = desplegables()[1];
    if (categoria && RE_CATEGORIA_ANUNCIO.test(categoria.textContent || "")) {
      await elegirEnDesplegable(categoria, (t) => /^todos los anuncios$/i.test(t));
    }
  };

  /*
   * Al cambiar de pais Meta devuelve la categoria a "Categoria de anuncio"
   * (sin elegir), y eso no genera ningun clic que el chequeo de arriba pueda
   * ver. Por eso se vigila el propio texto del desplegable: si vuelve a
   * quedar sin elegir en la portada, se vuelve a poner "Todos los anuncios".
   * Elegir a mano otra categoria no choca: entonces el texto ya no es ese.
   */
  let corrigiendoCategoria = false;
  let ultimaCorreccionCategoria = 0;
  // Si la ultima vez que se miro estabamos en la portada del buscador. Al
  // volver a ella (p. ej. con el logo de Meta, que navega sin recargar la
  // pagina) el pais reaparece como el del usuario y hay que ponerlo en
  // "Todos" otra vez — pero solo en ese momento de llegada, no mientras se
  // esta en ella, para poder cambiar de pais sin que se deshaga.
  let enPortadaAntes = null;

  const enPortadaDelBuscador = () => {
    const q = new URLSearchParams(location.search);
    return !q.get("q") && !q.get("view_all_page_id") && desplegables().length >= 2;
  };

  const vigilarCategoriaSinElegir = () => {
    enPortadaAntes = enPortadaDelBuscador();
    setInterval(async () => {
      const enPortada = enPortadaDelBuscador();
      const acabaDeLlegar = enPortada && enPortadaAntes === false;
      enPortadaAntes = enPortada;
      if (acabaDeLlegar && !corrigiendoCategoria) {
        const pais = desplegables()[0];
        if (!/^todos$/i.test((pais.textContent || "").replace(/​/g, "").trim())) {
          corrigiendoCategoria = true;
          try {
            await elegirEnDesplegable(pais, (t) => /^todos$/i.test(t));
          } finally {
            corrigiendoCategoria = false;
          }
        }
        return;
      }
      if (corrigiendoCategoria || Date.now() - ultimaCorreccionCategoria < 2500) return;
      if (new URLSearchParams(location.search).get("q")) return;
      const cajas = desplegables();
      if (cajas.length < 2) return;
      if (cajas.some((c) => c.getAttribute("aria-expanded") === "true")) return;
      if (!RE_CATEGORIA_ANUNCIO.test(cajas[1].textContent || "")) return;

      corrigiendoCategoria = true;
      try {
        await elegirEnDesplegable(cajas[1], (t) => /^todos los anuncios$/i.test(t));
      } finally {
        ultimaCorreccionCategoria = Date.now();
        corrigiendoCategoria = false;
      }
    }, 700);
  };

  /** Boton circular que se expande al pasar el raton y despliega su menu. */
  const accion = (etiqueta, icono, opciones, extraClase) => {
    const cont = el("div", "was-accion " + (extraClase || ""));
    const btn = el("button", "was-accion-btn", svg(icono));
    btn.setAttribute("aria-label", etiqueta);
    cont.appendChild(btn);

    // La etiqueta es un globo por encima del boton: dentro no cabria sin
    // ensanchar el circulo y empujar a los vecinos.
    const globo = el("span", "was-globo");
    globo.textContent = etiqueta;
    cont.appendChild(globo);

    if (typeof opciones === "function") {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        cerrarMenus(null);
        opciones(btn);
      });
      return cont;
    }

    /*
     * El menu cuelga de <body>, no de la tarjeta: dentro de la tarjeta lo
     * recortaria cualquier ancestro con overflow. Popper (MIT) se encarga de
     * colocarlo junto al boton y de voltearlo cuando no cabe abajo, que es lo
     * que pasa con las tarjetas del final de la pagina.
     */
    const panel = el("div", "was-panel");
    for (const [texto, fn] of opciones) {
      const item = el("button", "was-item");
      item.textContent = texto;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        cerrar();
        fn();
      });
      panel.appendChild(item);
    }

    let popper = null;

    const cerrar = () => {
      cont.classList.remove("was-abierto");
      panel.remove();
      popper?.destroy();
      popper = null;
    };
    cont._wasCerrar = cerrar;
    // Para poder refrescar el texto de un item concreto desde fuera (la
    // descarga multiple lo necesita: su etiqueta cambia segun un estado
    // global, no algo fijo desde que se construyo el menu).
    cont._wasPanel = panel;

    const abrirMenu = () => {
      document.body.appendChild(panel);
      cont.classList.add("was-abierto");
      if (window.Popper) {
        popper = Popper.createPopper(btn, panel, {
          placement: "bottom-start",
          modifiers: [
            { name: "offset", options: { offset: [0, 8] } },
            { name: "preventOverflow", options: { padding: 8 } },
            { name: "flip", options: { padding: 8 } },
          ],
        });
      } else {
        const caja = btn.getBoundingClientRect();
        panel.style.position = "fixed";
        panel.style.top = caja.bottom + 8 + "px";
        panel.style.left = caja.left + "px";
      }
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const abierto = cont.classList.contains("was-abierto");
      cerrarMenus(null);
      if (!abierto) abrirMenu();
    });
    return cont;
  };

  const construirBandeja = (a) => {
    const bandeja = el("div", "was-bandeja");
    const sitio = limpiarUrl(a.linkUrl);

    const accionGuardar = accion("Guardar", ICONOS.guardar, [
      ["Solo el creativo principal", () => guardarCreativos(a, "principal")],
      ["Elegir creativos", () => elegirCreativos(a)],
      ["Todos los creativos", () => guardarCreativos(a, "todos")],
      ["Solo la informacion", () => guardarInfo(a)],
      [
        "Creativos e informacion",
        () => {
          guardarCreativos(a, "todos");
          guardarInfo(a);
        },
      ],
      [
        multiDescarga.activo ? "Detener descarga multiple" : "Descarga multiple (varios anuncios)",
        () => (multiDescarga.activo ? desactivarMultiDescarga() : activarMultiDescarga()),
      ],
    ]);
    bandeja.appendChild(accionGuardar);
    // El texto de esa ultima opcion se congelo al construir el menu: para que
    // diga lo correcto aunque el modo se haya activado desde OTRA tarjeta, se
    // apunta el item para refrescarlo junto con los distintivos.
    itemsMenuMultiDescarga.add(accionGuardar._wasPanel.querySelector(".was-item:last-child"));

    bandeja.appendChild(
      accion("Copiar", ICONOS.copiar, [
        ["Texto principal", () => copiar(a.cuerpo, "Texto principal")],
        ["Titulo", () => copiar(a.titulo, "Titulo")],
        ["Descripcion", () => copiar(a.descripcion, "Descripcion")],
        ["Texto, titulo y descripcion", () => copiar(textoTituloDescripcion(a), "Texto, titulo y descripcion")],
        ["URL del sitio", () => copiar(sitio, "URL del sitio")],
        ["Llamado a la accion", () => copiar(a.ctaTexto, "Llamado a la accion")],
        ["URL en la Biblioteca", () => copiar(bibliotecaUrl(a.id), "URL")],
        ["Toda la informacion", () => copiar(resumen(a), "Informacion")],
      ])
    );

    bandeja.appendChild(
      accion("Abrir", ICONOS.abrir, [
        ["Sitio del anuncio", () => abrir(sitio)],
        ["Perfil del anunciante", () => abrir(a.perfilUrl)],
        ["Instagram del anunciante", () => abrir(instagramUrl(a))],
        ["Buscar anuncios de este sitio", () => abrir(buscarSitio(a.linkUrl))],
        ["Buscar anuncios de este anunciante", () => abrir(buscarAnunciante(a.paginaId))],
        ["URL del anuncio en la Biblioteca", () => abrir(bibliotecaUrl(a.id))],
      ])
    );

    const textoEnlaces =
      textoCompartir(a, "Anuncio", bibliotecaUrl(a.id)) +
      enlacesDe(a)
        .map(([t, u]) => "✅ " + t + ": " + u)
        .join("\n");

    // Primero se elige QUE enlace enviar y luego POR DONDE, como en el resto
    // de menus de la barra.
    const opcionesEnviar = enlacesDe(a).map(([titulo, url]) => [
      titulo,
      () => elegirRed(titulo, textoCompartir(a, titulo, url), url),
    ]);
    opcionesEnviar.push(["Todos los enlaces", () => elegirRed("Todos los enlaces", textoEnlaces, null)]);

    bandeja.appendChild(accion("Enviar", ICONOS.compartir, opcionesEnviar));

    // --- guardar en seguimiento -------------------------------------------
    const favorito = el("div", "was-accion was-accion-fav");
    const btnFav = el("button", "was-accion-btn");
    btnFav.setAttribute("aria-label", "Seguir");
    const globoFav = el("span", "was-globo");

    const pintarFav = () => {
      const sigue = !!guardados[a.id];
      btnFav.innerHTML = sigue ? ICONOS.estrellaLlena : ICONOS.estrella;
      favorito.classList.toggle("was-fav-activo", sigue);
      globoFav.textContent = sigue ? "Siguiendo" : "Seguir";
    };

    btnFav.addEventListener("click", (e) => {
      e.stopPropagation();
      if (guardados[a.id]) {
        delete guardados[a.id];
        aviso("Ya no sigues este anuncio");
      } else {
        // Guardamos tambien un resumen del anuncio para poder mostrarlo luego
        // sin depender de que aparezca en una busqueda.
        const imagenOriginal = a.imagenes?.[0] || a.videoPreview || "";
        guardados[a.id] = {
          nombre: a.paginaNombre || "",
          guardadoEl: Date.now(),
          puntos: [],
          resumen: {
            paginaId: a.paginaId,
            perfilUrl: a.perfilUrl,
            cuerpo: (a.cuerpo || "").slice(0, 400),
            titulo: a.titulo || "",
            imagen: imagenOriginal,
            cta: a.ctaTexto || "",
            sitio: limpiarUrl(a.linkUrl) || "",
            esWhatsapp: !!(a.destinoWhatsapp || a.ctaEsWhatsapp),
            telefono: a.telefonoDirecto || null,
            formato: a.formato || "",
            activo: !!a.activo,
          },
        };
        anotarMedida(a);
        generarMiniatura(a.id, imagenOriginal);
        aviso("Guardado: se anotara como evoluciona");
        // Ya queda seguido; el cuadro solo añade etiquetas si quieres.
        elegirEtiquetas([], (nuevas) => {
          if (!guardados[a.id]) return;
          guardados[a.id].etiquetas = nuevas;
          guardarGuardados();
        }, "Anuncio guardado: ¿con que etiquetas?");
      }
      guardarGuardados();
      pintarFav();
    });
    pintarFav();
    favorito.append(btnFav, globoFav);
    bandeja.appendChild(favorito);

    barraDe.set(a.id, { pintarFav });

    // Ficha del anunciante. Antes iba con doble clic sobre el nombre, pero el
    // nombre es un enlace de Meta y se lo comia: mejor un boton propio.
    bandeja.appendChild(
      accion("Anunciante", ICONOS.ficha, () => verFicha(a.paginaId), "was-accion-ficha")
    );

    // Por defecto el boton sale cuando el anuncio realmente lleva a WhatsApp,
    // aunque su llamado a la accion diga otra cosa ("Comprar", "Ver mas"...).
    // Quien prefiera verlo solo en los que dicen "Enviar mensaje de WhatsApp"
    // lo restringe desde la configuracion de filtro.
    //
    // `mensajeriaAWhatsapp` suma los anuncios de "enviar mensaje" sin URL
    // propia (Meta decide si abre WhatsApp, Messenger o Instagram): en una
    // busqueda filtrada por la propia Biblioteca a plataforma WhatsApp, uno
    // de estos pasaba desapercibido. No es una certeza como el resto, asi
    // que solo cuenta cuando el filtro no pide exclusivamente el CTA exacto.
    const mostrarWa = prefs.waSoloCta
      ? a.ctaEsWhatsapp
      : a.destinoWhatsapp || a.ctaEsWhatsapp || a.mensajeriaAWhatsapp;
    if (mostrarWa) {
      const accionWa = accion("WhatsApp", ICONOS.wa, (btn) => clicWhatsapp(a, btn, false), "was-accion-wa");
      conectarBotonWa(a, accionWa.querySelector(".was-accion-btn"));
      bandeja.appendChild(accionWa);
    }

    /*
     * Distintivo de la descarga multiple: vive siempre en la barra, oculto
     * por CSS (`.was-multi-distintivo` solo se ve cuando la tarjeta tiene la
     * clase `was-multi-activo`) para no reconstruir la barra entera cada vez
     * que se activa o se desactiva el modo. Un numero, no una marca — es
     * literalmente el orden con el que se nombrara el archivo al descargar.
     */
    const distintivo = el("button", "was-multi-distintivo");
    distintivo.title = "Marcar para descarga multiple (Shift+clic marca un rango)";
    distintivo.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault(); // Shift+clic no debe seleccionar texto de la pagina
      alternarSeleccionMulti(a.id, e.shiftKey);
    });
    distintivosMulti.set(a.id, distintivo);
    const pos = multiDescarga.orden.indexOf(a.id);
    distintivo.textContent = pos >= 0 ? String(pos + 1) : "";
    distintivo.classList.toggle("was-multi-marcado", pos >= 0);
    bandeja.appendChild(distintivo);

    return bandeja;
  };

  // =========================================================================
  // decorado de la tarjeta
  // =========================================================================

  const RE_ETIQUETA_ID = /Identificador de la biblioteca|Library ID|ID da biblioteca/g;

  /*
   * Cada texto "Identificador de la biblioteca" se marca con un atributo al
   * recorrer la pagina (ver `pasearYDecorar`), y contar anuncios dentro de
   * un nodo es contar esas marcas. Antes se leia el `textContent` entero del
   * ancestro con una expresion regular: cerca de la grilla eso es el texto de
   * TODA la pagina, repetido por cada tarjeta y cada nivel de subida — era,
   * con diferencia, lo que mas CPU gastaba la extension al hacer scroll.
   */
  //
  // Solo importa si hay OTRO anuncio ademas del propio, asi que se quita un
  // momento la marca propia y se busca la primera marca que quede:
  // `querySelector` para en cuanto encuentra una, en vez de recorrer y
  // contar todo el subarbol (con 1000 anuncios, el contenedor de la grilla
  // tiene mas de 200.000 nodos).
  const hayOtroAnuncio = (padre, propio) => {
    propio.removeAttribute("data-was-idtxt");
    const otro = padre.querySelector("[data-was-idtxt]");
    propio.setAttribute("data-was-idtxt", "");
    return !!otro;
  };

  /**
   * Encuentra el recuadro de UNA tarjeta subiendo desde su identificador.
   *
   * Medir por tamaño no sirve: los contenedores de la grilla tambien son
   * grandes, y ahi la barra terminaba flotando sobre la pagina. En cambio
   * contamos identificadores: subimos mientras el ancestro siga conteniendo un
   * solo anuncio, y paramos justo antes de que abarque a sus vecinos.
   */
  const contenedorTarjeta = (nodo) => {
    let n = nodo;
    for (let i = 0; i < 18 && n && n.parentElement; i++) {
      const padre = n.parentElement;
      if (padre === document.body) break;
      if (hayOtroAnuncio(padre, nodo)) break;
      /*
       * Nunca subir hasta el propio dialogo ("Vincular a anuncio", el que
       * abre "Ver anuncio" al entrar directo con ?id=). Un dialogo con un
       * solo anuncio dentro no tiene ningun vecino que frene la subida por
       * conteo, y el salvavidas de tamaño de aqui abajo tampoco lo detecta
       * siempre a tiempo. El dialogo entero incluye su propia cabecera (el
       * titulo y la X de cerrar), que no es parte del anuncio: si se decora
       * el dialogo, el hueco reservado para la barra empuja esa cabecera
       * hacia abajo y el dialogo se ve deforme.
       */
      if (padre.getAttribute && padre.getAttribute("role") === "dialog") break;
      /*
       * Salvavidas por ancho: si el ancestro se ensancha de golpe mucho mas
       * que la tarjeta que ya tenemos, ya no es la
       * tarjeta — es un contenedor de layout que incluye cabecera, barra de
       * filtros y demas furniture de la pagina. El conteo de identificadores
       * no lo detiene porque solo frena al llegar a un vecino, y en una
       * pagina con un unico resultado (un anunciante con un solo anuncio, o
       * una busqueda muy angosta) nunca hay vecino: la subida seguia hasta
       * el limite de 18 niveles y se tragaba casi toda la pagina.
       *
       * Se mira SOLO el ancho, nunca el alto. Una tarjeta y su envoltorio
       * real miden practicamente lo mismo de ancho (los dos ocupan su
       * columna de la grilla), mientras que un contenedor de layout salta
       * a todo el ancho de la pagina de golpe: en el caso real que disparo
       * esto, se pasaba de 427 a 1385 en un solo paso.
       *
       * El alto, en cambio, NO sirve como señal: dentro de una misma
       * tarjeta agrupada ("varias versiones") el recuadro del resumen mide
       * unos 246px y la tarjeta completa que lo contiene 749px — un salto
       * de 3x perfectamente normal. Vigilando el alto, la subida se paraba
       * justo ahi y se tomaba el resumen por toda la tarjeta: el halo y el
       * fondo blanco se cortaban antes de la vista previa del creativo.
       *
       * La condicion de que `n` ya mida mas de 150x150 no sobra: sin ella
       * cualquier fila de texto estrecha detiene la subida en seco (su padre
       * la supera de largo en ancho) y la tarjeta se queda sin decorar. Paso
       * de verdad con el dialogo "Vincular con un anuncio".
       */
      if (
        n.offsetHeight > 150 &&
        n.offsetWidth > 150 &&
        padre.offsetWidth > n.offsetWidth * 1.5
      ) {
        break;
      }
      n = padre;
    }
    return n && n.offsetHeight > 150 ? n : null;
  };

  /**
   * El recuadro blanco que se ve NO siempre es el contenedor de la tarjeta:
   * a veces el fondo lo pinta un hijo interno y el padre queda transparente.
   * Si decoramos el padre, los botones aparecen flotando fuera del recuadro.
   * Buscamos el descendiente que realmente pinta el fondo y ocupa casi toda
   * la tarjeta; si no hay ninguno, la tarjeta ya es su propia superficie.
   */
  const superficieDe = (tarjeta) => {
    const alto = tarjeta.offsetHeight;
    const ancho = tarjeta.offsetWidth;
    let mejor = null;
    let mejorArea = 0;

    /*
     * Con un umbral de 0.7 el "cuadro resumen" (acciones y datos, sin la
     * vista previa del creativo) ya calificaba como "superficie": en una
     * tarjeta con varias versiones ese cuadro puede rondar el 70-85% del
     * alto total sin ser en absoluto la tarjeta completa. Al quedarnos con
     * el primero que aparecia en el documento, el halo se recortaba justo
     * donde terminaba ese cuadro, dejando la vista previa de abajo sin
     * cubrir. Subir el umbral y quedarnos con el de mayor area (no el primero) evita
     * elegir un descendiente que solo cubre una parte. 0.92 seguia dejando
     * pasar cuadros unos pixeles mas cortos que la tarjeta real (95% del
     * alto, por ejemplo) que igual recortaban el halo un poco: con 0.98 solo
     * entra un descendiente practicamente del mismo tamano que la tarjeta;
     * si ninguno califica, se usa la tarjeta misma (mejor || tarjeta mas
     * abajo), que siempre tiene el tamano exacto.
     */
    for (const hijo of tarjeta.querySelectorAll("div")) {
      if (hijo.offsetHeight < alto * 0.98 || hijo.offsetWidth < ancho * 0.98) {
        continue;
      }
      const fondo = getComputedStyle(hijo).backgroundColor;
      if (!fondo || fondo === "transparent" || /rgba\(0, 0, 0, 0\)/.test(fondo)) continue;
      const area = hijo.offsetHeight * hijo.offsetWidth;
      if (area > mejorArea) {
        mejor = hijo;
        mejorArea = area;
      }
    }
    if (mejor) return mejor;

    /*
     * La grilla estira cada celda al alto de la tarjeta mas alta de su fila,
     * pero la tarjeta de Meta (el recuadro con borde, esquinas redondeadas y
     * sombra) conserva su alto natural. Con una vecina mas alta, la tarjeta
     * queda muy por debajo del 98% de la celda y se decoraba la celda: el
     * fondo blanco sobresalia por debajo y el borde de la tarjeta real se
     * veia dentro, partiendo la tarjeta en dos. Aqui se busca ese recuadro
     * por su aspecto (borde o sombra y esquinas redondeadas) a todo el ancho;
     * el alto no se exige, que es justo lo que varia. El cuadro de resumen de
     * las tarjetas agrupadas no califica: va dentro del relleno de la
     * tarjeta, asi que nunca ocupa todo el ancho.
     */
    for (const hijo of tarjeta.querySelectorAll("div")) {
      if (hijo.closest(".was-barra")) continue;
      if (hijo.offsetWidth < ancho * 0.98 || hijo.offsetHeight < 150) continue;
      const s = getComputedStyle(hijo);
      if (!s.backgroundColor || /rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) continue;
      if (!(parseFloat(s.borderRadius) > 0)) continue;
      if (!(parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none")) continue;
      const area = hijo.offsetHeight * hijo.offsetWidth;
      if (area > mejorArea) {
        mejor = hijo;
        mejorArea = area;
      }
    }
    return mejor || tarjeta;
  };

  const RE_COPIAS = /^\s*\d+\s+(anuncios?|ads?)\b/i;
  const RE_INACTIVO = /^\s*(Inactivo|Inactive|Inativo)\s*$/i;

  /**
   * Ficha del anunciante.
   *
   * Va en un cuadro propio sobre la pagina, no dentro del panel: la ficha nace
   * de una tarjeta y con el panel recogido no habria donde mostrarla.
   *
   * Ojo con lo que cuenta: aqui solo estan los anuncios que la Biblioteca ha
   * cargado en esta busqueda. Por eso los recuentos dicen "en esta busqueda" y
   * hay un boton aparte para ir a contar los de verdad.
   */
  /**
   * Lista de anunciantes que publican la misma oferta (el texto coincide,
   * segun `huellaOferta`), con foto, nombre y un boton para ir directo a los
   * anuncios de cada uno. Antes la pastilla "X anunciantes" solo informaba
   * el numero; para ver quienes eran habia que ir anuncio por anuncio
   * buscando cual tenia el mismo texto.
   */
  /*
   * Elegir etiquetas de un anuncio seguido: marcar/desmarcar las que ya
   * existen (en cualquier anuncio guardado), crear nuevas o dejarlo sin
   * ninguna. Un anuncio puede llevar todas las que quieras. Cerrar con la X
   * o fuera del cuadro no cambia nada.
   */
  const todasLasEtiquetasGuardadas = () => {
    const s = new Set();
    for (const f of Object.values(guardados)) for (const e of f.etiquetas || []) s.add(e);
    return [...s].sort((x, y) => x.localeCompare(y));
  };

  const elegirEtiquetas = (actuales, alGuardar, titulo) => {
    const elegidas = new Set(actuales || []);
    const disponibles = new Set([...todasLasEtiquetasGuardadas(), ...elegidas]);

    const fondo = el("div", "was-suelto-fondo");
    const caja = el("div", "was-suelto was-suelto-etiquetas");
    const cerrarModal = () => {
      fondo.remove();
      document.removeEventListener("keydown", alTeclado, true);
    };
    const alTeclado = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cerrarModal();
      }
    };
    document.addEventListener("keydown", alTeclado, true);

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, titulo || "Etiquetas"));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", cerrarModal);
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    const lista = el("div", "was-etiquetas-lista");
    const pintarLista = () => {
      lista.innerHTML = "";
      if (!disponibles.size) {
        lista.appendChild(el("p", "was-etiquetas-vacio", "Aun no tienes etiquetas. Crea la primera abajo."));
        return;
      }
      for (const e of [...disponibles].sort((x, y) => x.localeCompare(y))) {
        const chip = el("button", "was-etiqueta-opcion" + (elegidas.has(e) ? " was-elegida" : ""));
        chip.textContent = e;
        chip.addEventListener("click", () => {
          if (elegidas.has(e)) elegidas.delete(e);
          else elegidas.add(e);
          pintarLista();
        });
        lista.appendChild(chip);
      }
    };
    pintarLista();
    caja.appendChild(el("div", "was-etiquetas-ayuda", "Toca para marcar o desmarcar. Puedes elegir varias."));
    caja.appendChild(lista);

    const fila = el("div", "was-etiquetas-nueva");
    const entrada = el("input", "was-texto");
    entrada.type = "text";
    entrada.placeholder = "Nueva etiqueta...";
    const crear = el("button", "was-mini", "Crear");
    const crearEtiqueta = () => {
      const nueva = entrada.value.trim();
      if (!nueva) return;
      disponibles.add(nueva);
      elegidas.add(nueva);
      entrada.value = "";
      pintarLista();
      entrada.focus();
    };
    crear.addEventListener("click", crearEtiqueta);
    entrada.addEventListener("keydown", (e) => {
      if (e.key === "Enter") crearEtiqueta();
    });
    fila.append(entrada, crear);
    caja.appendChild(fila);

    const pie = el("div", "was-etiquetas-pie");
    const sinNada = el("button", "was-mini", "Sin etiqueta");
    sinNada.addEventListener("click", () => {
      alGuardar([]);
      cerrarModal();
    });
    const guardar = el("button", "was-primario", "GUARDAR");
    guardar.addEventListener("click", () => {
      // Lo escrito sin pulsar "Crear" tambien cuenta.
      if (entrada.value.trim()) elegidas.add(entrada.value.trim());
      alGuardar([...elegidas]);
      cerrarModal();
    });
    pie.append(sinNada, guardar);
    caja.appendChild(pie);

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && cerrarModal());
    document.body.appendChild(fondo);
    entrada.focus();
  };

  const verAnunciantesOferta = (id) => {
    const lista = anunciantesDeOferta.get(id) || [];
    if (!lista.length) return aviso("Sin datos de los otros anunciantes", true);

    const fondo = el("div", "was-suelto-fondo");
    const caja = el("div", "was-suelto was-suelto-ficha");

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, lista.length + " anunciantes con esta misma oferta"));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", () => fondo.remove());
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    const listaEl = el("div", "was-lista-anunciantes");
    for (const anun of lista) {
      const fila = el("div", "was-fila-anunciante");

      const foto = el("img", "was-fila-anunciante-foto");
      foto.src = anun.foto || "";
      foto.alt = "";
      foto.loading = "lazy";
      // Sin foto (algun anunciante no la trae en el JSON de este anuncio en
      // concreto): se oculta en vez de dejar el hueco de una imagen rota.
      foto.addEventListener("error", () => foto.remove(), { once: true });
      fila.appendChild(foto);

      fila.appendChild(el("span", "was-fila-anunciante-nombre", anun.nombre));

      const ver = el("button", "was-mini", "Ver anunciante");
      ver.addEventListener("click", () => abrir(anun.urlBiblioteca));
      fila.appendChild(ver);

      listaEl.appendChild(fila);
    }
    caja.appendChild(listaEl);

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && fondo.remove());
    document.body.appendChild(fondo);
  };

  const verFicha = (paginaId) => {
    const suyos = [...anuncios.values()].filter((x) => x.paginaId === paginaId);
    if (!suyos.length) return aviso("Sin datos de este anunciante", true);

    const nombre = suyos[0].paginaNombre || "Anunciante";
    const dias = suyos.map((x) => diasActivo(x) ?? 0);
    const dominios = [...new Set(suyos.map((x) => dominioDe(x.linkUrl)).filter(Boolean))];
    const formatos = [...new Set(suyos.map((x) => x.formato).filter(Boolean))];
    const plataformas = [...new Set(suyos.flatMap((x) => x.plataformas || []))];
    const ctas = [...new Set(suyos.map((x) => x.ctaTexto).filter(Boolean))];
    const mejor = suyos.reduce((m, x) => (puntuacion(x) > puntuacion(m) ? x : m), suyos[0]);

    const fondo = el("div", "was-suelto-fondo");
    const caja = el("div", "was-suelto was-suelto-ficha");

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, nombre));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", () => fondo.remove());
    cab.appendChild(cerrar);
    caja.appendChild(cab);

    const tabla = el("div", "was-ficha");
    const ponerFila = (k, v, clase) => {
      const fila = el("div", "was-ficha-fila " + (clase || ""));
      fila.append(el("span", "was-ficha-k", k), el("span", "was-ficha-v", String(v)));
      tabla.appendChild(fila);
      return fila;
    };

    caja.appendChild(el("p", "was-vacio", "Contado sobre los anuncios cargados en esta busqueda:"));
    ponerFila("En esta busqueda", suyos.length);
    ponerFila("Activos aqui", suyos.filter((x) => x.activo).length);
    ponerFila("Inactivos aqui", suyos.filter((x) => !x.activo).length);
    ponerFila("Con WhatsApp", suyos.filter((x) => x.destinoWhatsapp).length);
    ponerFila("Mas antiguo", Math.max(...dias) + " dias");
    ponerFila("Mas nuevo", Math.min(...dias) + " dias");
    ponerFila("Mejor nota", puntuacion(mejor) + "/100");
    ponerFila("Formatos", formatos.join(", ") || "-");
    ponerFila("Plataformas", plataformas.join(", ") || "-");
    ponerFila("Llamados a la accion", ctas.join(", ") || "-");
    ponerFila("Dominios", dominios.join(", ") || "-");

    // Datos de la propia Pagina, no de la busqueda: seguidores y categoria
    // son el mismo para todos sus anuncios, se toman del primero que los trae.
    const conSeguidores = suyos.find((x) => x.seguidoresPagina != null);
    if (conSeguidores) ponerFila("Seguidores de la pagina", conSeguidores.seguidoresPagina.toLocaleString());
    const conCategoria = suyos.find((x) => x.categoriaPagina);
    if (conCategoria) ponerFila("Categoria", conCategoria.categoriaPagina);
    const limitados = suyos.filter((x) => x.entregaLimitada).length;
    if (limitados) ponerFila("Con entrega limitada", limitados, "was-ficha-alerta");

    caja.appendChild(tabla);

    // --- recuento real, consultando su biblioteca -------------------------
    const totales = el("div", "was-ficha");
    caja.appendChild(totales);

    const contar = el("button", "was-primario", "CONTAR SUS ANUNCIOS REALES");
    contar.addEventListener("click", async () => {
      contar.disabled = true;
      contar.textContent = "CONTANDO...";
      try {
        const r = await chrome.runtime.sendMessage({ tipo: "contarAnuncios", paginaId });
        totales.innerHTML = "";
        if (!r || r.error || r.total == null) {
          contar.textContent = "NO SE PUDO CONTAR";
          return;
        }
        const cab2 = el("p", "was-vacio", "Su biblioteca completa:");
        caja.insertBefore(cab2, totales);
        const fila = (k, v) => {
          const f = el("div", "was-ficha-fila was-ficha-real");
          f.append(el("span", "was-ficha-k", k), el("span", "was-ficha-v", String(v)));
          totales.appendChild(f);
        };
        fila("Anuncios en total", r.total);
        fila("Activos", r.activos);
        fila("Inactivos", r.inactivos);
        contar.textContent = "CONTADO";
      } catch {
        contar.textContent = "NO SE PUDO CONTAR";
      }
    });
    caja.appendChild(contar);

    const ver = el("button", "was-secundario", "VER TODOS SUS ANUNCIOS");
    ver.addEventListener("click", () => abrir(buscarAnunciante(paginaId)));
    caja.appendChild(ver);

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && fondo.remove());
    document.body.appendChild(fondo);
  };

  /** Pinta en rojo la etiqueta "Inactivo": Meta la deja en gris y se pasa. */
  const marcarInactivo = (tarjeta) => {
    const paseo = document.createTreeWalker(tarjeta, NodeFilter.SHOW_TEXT);
    let nodo;
    while ((nodo = paseo.nextNode())) {
      if (!RE_INACTIVO.test(nodo.nodeValue || "")) continue;
      nodo.parentElement?.classList.add("was-inactivo");
      return;
    }
  };

  /**
   * Meta escribe "N anuncios usan este contenido y texto" en el mismo gris que
   * el resto. Es el dato que dice si un creativo se esta escalando, asi que lo
   * resaltamos en verde para que salte a la vista al recorrer la grilla.
   */
  const resaltarCopias = (tarjeta) => {
    const paseo = document.createTreeWalker(tarjeta, NodeFilter.SHOW_TEXT);
    let nodo;
    while ((nodo = paseo.nextNode())) {
      if (!RE_COPIAS.test(nodo.nodeValue || "")) continue;
      const destino = nodo.parentElement;
      if (destino && !destino.classList.contains("was-resalte")) {
        destino.classList.add("was-resalte");
      }
      return;
    }
  };

  /**
   * La bandeja y la insignia flotan sobre la esquina superior de la tarjeta.
   * Es seguro porque el contenedor se detecta contando identificadores, asi que
   * siempre es una tarjeta y nunca la columna entera de la grilla.
   */
  /*
   * La barra vive dentro de la tarjeta: es un hijo real, no una capa aparte.
   *
   * Se probo asi al principio y se abandono porque React se lleva por
   * delante cualquier nodo que no sea suyo en su siguiente renderizado (las
   * clases que añadimos sobreviven; los nodos, no). La capa aparte evitaba
   * ese problema, pero a cambio obligaba a sincronizar su posicion a mano en
   * cada scroll y a inventar reglas para pasar "por debajo" de la cabecera
   * fija y de los desplegables de Meta — una capa aparte no comparte el
   * contexto de apilamiento del resto de la tarjeta, asi que ni el z-index ni
   * el orden del DOM se comportaban como se espera.
   *
   * La solucion no es evitar el problema de React, es contarlo: `anclas`
   * guarda que tarjeta le corresponde a cada barra, y el observador de
   * mutaciones (mas abajo) vigila si React se lleva una barra por delante
   * para volver a decorar esa tarjeta. Mientras tanto, al ser un hijo real,
   * la barra se apila exactamente igual que el resto del contenido: pasa por
   * debajo de la cabecera y de los desplegables sin ningun truco, y viaja
   * sola con el scroll, el orden y el filtrado porque esta pegada a su
   * tarjeta.
   */
  const anclas = new Map(); // barra -> tarjeta

  /**
   * Devuelve un flotante a la pantalla si se ha quedado fuera.
   *
   * Pasa al encoger la ventana: la posicion guardada era buena en una pantalla
   * ancha y deja el panel o la bandeja fuera de la vista, sin forma de
   * alcanzarlos para arrastrarlos de vuelta.
   */
  const mantenerEnPantalla = (nodo, claveGuardado) => {
    if (!nodo || !nodo.style.left) return;

    const r = nodo.getBoundingClientRect();
    const margen = 8;
    const x = Math.max(margen, Math.min(window.innerWidth - r.width - margen, r.left));
    const y = Math.max(margen, Math.min(window.innerHeight - r.height - margen, r.top));
    if (Math.round(x) === Math.round(r.left) && Math.round(y) === Math.round(r.top)) return;

    nodo.style.left = x + "px";
    nodo.style.top = y + "px";
    guardarLocal({
      [claveGuardado]: { left: nodo.style.left, top: nodo.style.top },
    });
  };

  /*
   * Mejoras de rendimiento sobre la propia Biblioteca (Meta no las hace):
   *
   * - Imagenes: Meta las pide y decodifica todas en cuanto inserta la
   *   tarjeta, aunque este a miles de pixeles de la pantalla. Las que aun no
   *   terminaron de cargar pasan a carga diferida, y todas se decodifican
   *   fuera del hilo principal (`decoding=async`), que es lo que evita
   *   tirones al hacer scroll rapido sobre una grilla larga.
   * - Videos: uno que reprodujiste sigue sonando y decodificando fotogramas
   *   aunque ya lo hayas dejado muy atras. Se pausa solo al salir de la
   *   pantalla; si vuelves a el, lo reanudas tu con un clic.
   */
  const observadorVideo = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting && !e.target.paused) e.target.pause();
    }
  });

  const aligerarTarjeta = (tarjeta) => {
    for (const img of tarjeta.querySelectorAll("img")) {
      img.decoding = "async";
      if (!img.complete) img.loading = "lazy";
    }
    // Solo se vigila mientras suena: vigilar todos los videos (cientos con
    // 1000 anuncios) le costaba al navegador calcular sus intersecciones en
    // cada frame, aunque casi ninguno se reproduzca nunca.
    for (const v of tarjeta.querySelectorAll("video")) {
      if (v.dataset.wasVigilado) continue;
      v.dataset.wasVigilado = "1";
      v.addEventListener("play", () => observadorVideo.observe(v));
      v.addEventListener("pause", () => observadorVideo.unobserve(v));
    }
  };

  // Solo limpia anclas de tarjetas que ya no estan: no mide nada.
  const colocarBarras = () => {
    for (const [barra, tarjeta] of anclas) {
      if (!tarjeta.isConnected) anclas.delete(barra);
    }
  };

  window.addEventListener("resize", () => {
    mantenerEnPantalla(panel, "was-pos-panel");
    mantenerEnPantalla(bandejaRapida, "was-pos-rapida");
  });

  // Durante un video a pantalla completa no se toca el DOM (ver pintar() y
  // ordenar()); al salir, un repintado por si quedo algo sin decorar.
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) setTimeout(() => pintar(), 120);
  });

  const decorar = (tarjeta, a) => {
    const lienzo = superficieDe(tarjeta);

    /*
     * React reutiliza el mismo nodo para un anuncio distinto (reordenar,
     * virtualizacion) y se lleva por delante la barra vieja, pero no las
     * clases que le pusimos encima porque no las gestiona el: sin esta
     * limpieza, una tarjeta reciclada se quedaba con el halo verde o el rojo
     * de "inactivo" de un anuncio anterior aunque el que ocupa ahora ese
     * hueco no tenga nada que ver.
     *
     * Se limpia en toda la tarjeta, no solo en `lienzo`: si la imagen o el
     * video del anuncio tardan en cargar, la primera vez que se decora la
     * tarjeta puede no tener aun su alto final, y `superficieDe` elige un
     * descendiente distinto al que elegiria despues (ver el ResizeObserver
     * mas abajo, que vuelve a llamar a `decorar` cuando la tarjeta cambia de
     * tamano). Si solo se limpiara `lienzo` (el nuevo), la barra y las
     * clases del `lienzo` viejo se quedarian huerfanas ahi.
     */
    // La propia tarjeta tambien: pudo ser el lienzo en una pasada anterior.
    [tarjeta, ...tarjeta.querySelectorAll(".was-tarjeta")].forEach((n) => {
      n.classList.remove("was-tarjeta", "was-escalando");
    });
    tarjeta.querySelectorAll(".was-inactivo, .was-resalte").forEach((n) => {
      n.classList.remove("was-inactivo", "was-resalte");
    });
    tarjeta.querySelectorAll(".was-barra").forEach((n) => {
      anclas.delete(n);
      n.remove();
    });

    lienzo.classList.add("was-tarjeta");

    // Halo cuando el mismo creativo se repite en varios anuncios: es la señal
    // de que el anunciante esta escalando ese creativo.
    if ((a.copias || 1) > 1) {
      lienzo.classList.add("was-escalando");
      resaltarCopias(tarjeta);
    }
    if (!a.activo) marcarInactivo(tarjeta);

    const barra = el("div", "was-barra");
    // Un atributo propio, distinto del que llevan las tarjetas: la barra
    // ahora es hija real de la tarjeta, y si comparte el mismo atributo
    // "data-was-id" cualquier `[data-was-id]` que busque tarjetas la cuenta
    // tambien a ella, duplicando el total (una tarjeta real + su barra).
    barra.dataset.wasBarraId = a.id;

    const bandeja = construirBandeja(a);
    barra.appendChild(bandeja);

    const dias = diasActivo(a);
    if (dias != null) {
      const insignia = el("div", "was-dias");
      insignia.innerHTML =
        ICONOS.calendario + "<span>" + dias + (dias === 1 ? " DIA" : " DIAS") + "</span>";
      insignia.title = "Tiempo en circulacion";
      if ((a.copias || 1) > 1) {
        const c = el("span", "was-copias");
        c.textContent = a.copias;
        c.title = a.copias + " anuncios usan este mismo creativo";
        insignia.appendChild(c);
      }
      barra.appendChild(insignia);
    }

    const extras = el("div", "was-extras");


    // Nota de ganador
    const nota = puntuacion(a);
    const pill = el("span", "was-pastilla was-nota");
    pill.classList.add(nota >= 70 ? "was-nota-alta" : nota >= 45 ? "was-nota-media" : "was-nota-baja");
    pill.textContent = "Puntuación: " + nota + "%";
    pill.title =
      "Qué tan ganador es este anuncio: " + nota + "% (100% es el máximo)\n" +
      "Combina tiempo activo, copias del anunciante, otros que lo copian y plataformas";
    extras.appendChild(pill);

    // Otros anunciantes con la misma oferta: la pastilla es un boton que
    // abre la lista completa, no solo informa el numero.
    const otros = copiones.get(a.id);
    if (otros > 1) {
      const c = el("button", "was-pastilla was-copiones");
      c.textContent = otros + " anunciantes";
      c.title = "Ver los " + otros + " anunciantes que publican esta misma oferta";
      c.addEventListener("click", (e) => {
        e.stopPropagation();
        verAnunciantesOferta(a.id);
      });
      extras.appendChild(c);
    }

    // Paises donde se esta publicando
    if (a.paises?.length) {
      const p = el("span", "was-pastilla was-paises");
      p.textContent = a.paises.slice(0, 3).join(" ") + (a.paises.length > 3 ? " +" + (a.paises.length - 3) : "");
      p.title = "Se anuncia en: " + a.paises.join(", ");
      extras.appendChild(p);
    }

    // Como ha crecido desde que lo sigues
    const ev = evolucion(a);
    if (ev) {
      const e = el("span", "was-pastilla was-evolucion");
      e.textContent = "+" + ev.dCopias + " en " + ev.dDias + "d";
      e.title = "Paso de " + ev.desde + " a " + ev.hasta + " copias desde que lo sigues";
      extras.appendChild(e);
    }

    /*
     * Entrega limitada: Meta esta restringiendo este anuncio, casi siempre
     * porque tiene algun problema (de rendimiento o de politicas). Es una
     * señal de descarte, lo contrario de lo que busca esta extension, asi
     * que se resalta en el mismo tono rojo que "Inactivo".
     */
    if (a.entregaLimitada) {
      const l = el("span", "was-pastilla was-limitada");
      l.textContent = "Entrega limitada";
      l.title = "Meta esta restringiendo la entrega de este anuncio";
      extras.appendChild(l);
    }

    // Gasto/alcance declarados: solo existen en anuncios politicos o de la
    // UE, pero cuando estan son la mejor señal de que un anuncio funciona.
    if (a.gasto != null || a.alcance != null || a.impresionesTexto) {
      const g = el("span", "was-pastilla was-gasto");
      const partes = [];
      if (a.gasto != null) partes.push((a.moneda || "") + a.gasto + " gastados");
      if (a.impresionesTexto) partes.push(a.impresionesTexto + " impresiones");
      if (a.alcance != null) partes.push("~" + a.alcance + " de alcance");
      g.textContent = partes[0];
      g.title = partes.join(" · ");
      extras.appendChild(g);
    }

    if (extras.children.length) barra.insertBefore(extras, barra.firstChild.nextSibling);

    lienzo.appendChild(barra);
    anclas.set(barra, tarjeta);
    aligerarTarjeta(tarjeta);
    alturaDecorada.set(tarjeta, tarjeta.offsetHeight);
    vigilarTamano(tarjeta);
    // Una imagen diferida puede terminar de cargar mucho despues: al hacerlo
    // cambia el alto de la tarjeta, asi que se vuelve a vigilar un rato.
    for (const img of tarjeta.querySelectorAll("img")) {
      if (!img.complete) img.addEventListener("load", () => vigilarTamano(tarjeta), { once: true });
    }
  };

  /*
   * La imagen o el video del anuncio a veces tardan en cargar: la primera
   * vez que `decorar` corre, la tarjeta puede no tener aun su alto final, y
   * `superficieDe` (que compara alturas) elige un descendiente mas chico que
   * la tarjeta completa. El resultado es un halo o un fondo blanco que se
   * corta antes de donde termina la tarjeta de verdad.
   *
   * En vez de intentar esperar a que todo cargue antes de decorar (dificil
   * de saber de antemano y distinto por formato: imagen, video, carrusel),
   * se vuelve a decorar cuando la tarjeta cambia de alto despues de la
   * primera pasada. `alturaDecorada` recuerda el alto con el que se decoro
   * por ultima vez cada tarjeta para no disparar esto por cambios de un
   * pixel; el margen es pequeño (8px) porque un texto que reflowa y estira
   * la tarjeta apenas 16px ya basta para dejar el fondo corto por abajo.
   *
   * `reajustes` es un seguro: redecorar cambia el alto (el hueco de la barra
   * son 90px que pasan de un elemento a otro), asi que dispara al propio
   * observador. En la practica converge en una o dos vueltas porque
   * `superficieDe` es determinista, pero un tope duro evita que un layout
   * raro de Meta lo deje dando vueltas para siempre.
   */
  const alturaDecorada = new WeakMap();
  const finVigilanciaTamano = new WeakMap();

  // El reajuste por tamaño solo hace falta mientras carga la imagen o el
  // video. Vigilar para siempre cientos de tarjetas era trabajo extra del
  // navegador en cada frame, asi que se suelta a los 12 segundos.
  const vigilarTamano = (tarjeta) => {
    observadorTamano.observe(tarjeta);
    clearTimeout(finVigilanciaTamano.get(tarjeta));
    finVigilanciaTamano.set(
      tarjeta,
      setTimeout(() => observadorTamano.unobserve(tarjeta), 12000)
    );
  };
  const reajustes = new WeakMap();
  const MAX_REAJUSTES = 5;

  const observadorTamano = new ResizeObserver((entradas) => {
    for (const entrada of entradas) {
      const tarjeta = entrada.target;
      const a = anuncios.get(tarjeta.dataset.wasId);
      if (!a) continue;

      const previa = alturaDecorada.get(tarjeta);
      if (previa == null || Math.abs(tarjeta.offsetHeight - previa) <= 8) {
        alturaDecorada.set(tarjeta, tarjeta.offsetHeight);
        continue;
      }

      // El contador va atado al id: si React reutiliza el nodo para otro
      // anuncio, el nuevo empieza con su cupo entero.
      const llevado = reajustes.get(tarjeta);
      const hechos = llevado && llevado.id === a.id ? llevado.veces : 0;
      if (hechos >= MAX_REAJUSTES) {
        alturaDecorada.set(tarjeta, tarjeta.offsetHeight);
        continue;
      }
      reajustes.set(tarjeta, { id: a.id, veces: hechos + 1 });
      decorar(tarjeta, a);
    }
  });

  /**
   * Decorar la pagina genera mutaciones, y esas mutaciones despiertan al
   * observador otra vez. Lo apagamos mientras trabajamos para no entrar en un
   * ciclo de repintados.
   */
  const pintar = (raices) => {
    if (!memoriaLista) return; // se repintara al terminar de leer el almacen

    /*
     * Con un video a pantalla completa no se toca el DOM.
     *
     * El navegador sale del modo pantalla completa en cuanto se mueve o se
     * reemplaza un ancestro del elemento que lo ocupa, y eso es justo lo que
     * hacen `decorar` y sobre todo `ordenar`, que reinserta las tarjetas con
     * appendChild. De ahi que el video se cerrara solo al abrirlo. Se repinta
     * al salir, con el listener de fullscreenchange.
     */
    if (document.fullscreenElement) return;

    observador.disconnect();
    try {
      pintarAhora(raices);
    } finally {
      if (document.body) {
        observador.observe(document.body, { childList: true, subtree: true });
      }
    }
  };

  /*
   * Recorre el arbol buscando identificadores de anuncio y decora sus tarjetas.
   *
   * `raices` limita el recorrido a los trozos que acaban de aparecer. Recorrer
   * el documento entero en cada cambio era barato con treinta anuncios y letal
   * con mil: el paseo de texto crece con la pagina y se repetia cada vez que
   * Meta tocaba cualquier cosa, incluido un video reproduciendose. Sin
   * argumento se recorre todo, que es lo que hace falta al arrancar.
   */
  const pintarAhora = (raices) => {
    const desde = raices && raices.length ? raices : [document.body];
    for (const raiz of desde) {
      if (raiz.isConnected) pasearYDecorar(raiz);
    }
    aplicarFiltros(); // recoloca las barras al terminar
  };

  let paginaMarcada = false;

  const pasearYDecorar = (raiz) => {
    // Primero se marcan todos (ver `hayOtroAnuncio`): una tarjeta tiene que
    // ver a sus vecinas del mismo lote antes de decidir hasta donde subir.
    const hallados = [];

    /*
     * Repaso de toda la pagina: tras el primero, cada identificador ya esta
     * marcado (los que Meta inserta despues los marca el repaso parcial del
     * observador), asi que basta con pedir las marcas al navegador en vez de
     * leer con JavaScript los cientos de miles de textos de la pagina.
     */
    if (raiz === document.body && paginaMarcada) {
      for (const marcado of document.querySelectorAll("[data-was-idtxt]")) {
        const m = RE_ID.exec(marcado.textContent || "");
        if (m) hallados.push([marcado.firstChild || marcado, m[1]]);
      }
    } else {
      const paseo = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let nodo;
      while ((nodo = paseo.nextNode())) {
        const m = RE_ID.exec(nodo.nodeValue || "");
        if (!m || !nodo.parentElement) continue;
        nodo.parentElement.setAttribute("data-was-idtxt", "");
        hallados.push([nodo, m[1]]);
      }
      if (raiz === document.body) paginaMarcada = true;
    }

    for (const [nodo, id] of hallados) {
      const a = anuncios.get(id);
      if (!a) continue;

      // Atajo: la tarjeta ya decorada con este mismo anuncio no hace falta
      // volver a buscarla subiendo por el arbol en cada repaso.
      const hecha = nodo.parentElement.closest("[data-was-id]");
      if (hecha && hecha.dataset.wasId === id && hecha.querySelector(".was-barra")) continue;

      const tarjeta = contenedorTarjeta(nodo.parentElement);
      if (!tarjeta) continue;
      // Si ya tiene el mismo id Y conserva su barra, no hay nada que hacer.
      // Sin barra (React se la llevo) se re-decora aunque el id coincida.
      if (tarjeta.dataset.wasId === a.id && tarjeta.querySelector(".was-barra")) continue;

      // Antes se dejaba tal cual el cuadro "Datos resumidos": la barra vivia
      // en una capa aparte que no se apilaba bien dentro de un modal. Siendo
      // hija real de la tarjeta, decorar tambien esas versiones funciona
      // igual que en la grilla, y ahi es donde el usuario las necesita.
      tarjeta.dataset.wasId = a.id;
      // Aislado: si un anuncio trae algo inesperado, se pierde su barra pero
      // el resto de la grilla sigue decorandose.
      try {
        decorar(tarjeta, a);
      } catch (e) {
        console.error("[WA Ads Spy] no se pudo decorar el anuncio", a.id, e);
      }
    }
  };

  // =========================================================================
  // filtros y orden
  // =========================================================================

  const comparar = (valor, limite, op) => {
    if (!limite) return true;
    if (op === "lte") return valor <= limite;
    if (op === "eq") return valor === limite;
    return valor >= limite;
  };

  const pasaFiltro = (a) => {
    if (!comparar(a.copias || 1, prefs.minAnuncios, prefs.opAnuncios)) return false;
    if (!comparar(diasActivo(a) ?? 0, prefs.minDias, prefs.opDias)) return false;

    if (prefs.formato !== "todos") {
      const f = (a.formato || "").toUpperCase();
      if (prefs.formato === "video" && !f.includes("VIDEO")) return false;
      if (prefs.formato === "imagen" && !f.includes("IMAGE")) return false;
      if (prefs.formato === "carrusel" && !/CAROUSEL|DCO|DYNAMIC/.test(f)) return false;
    }

    if (prefs.plataforma !== "todas") {
      const p = (a.plataformas || []).map((x) => x.toUpperCase());
      if (!p.includes(prefs.plataforma.toUpperCase())) return false;
    }

    if (prefs.cta === "whatsapp" && !a.destinoWhatsapp && !a.ctaEsWhatsapp && !a.mensajeriaAWhatsapp) return false;
    if (prefs.cta === "web" && (a.destinoWhatsapp || a.ctaEsWhatsapp || a.mensajeriaAWhatsapp)) return false;

    if (prefs.soloSeguidos && !guardados[a.id]) return false;

    return true;
  };

  let contadores = { total: 0, visibles: 0 };

  /**
   * ¿Esta tarjeta esta dentro del cuadro "Datos resumidos" de Meta?
   *
   * Ese cuadro desglosa las versiones de UN anuncio, asi que filtrar ahi no
   * tiene sentido: cada version cuenta como un solo anuncio y con un filtro de
   * "3 anuncios o mas" el cuadro salia vacio.
   */
  const enDetalle = (n) => !!n.closest('[role="dialog"]');

  // Se compara contra el valor de la ultima pasada para saber si el orden
  // cambio de verdad, no solo si `ordenar()` volvio a ejecutarse.
  let ultimoOrden = prefs.ordenar;

  const aplicarFiltros = () => {
    /*
     * Ocultar tarjetas por encima de donde estas mirando encoge el documento
     * y todo lo de mas abajo sube para llenar el hueco. El numero de pixeles
     * de scroll no cambia, pero como el documento es mas corto ese mismo
     * numero ya no apunta al mismo sitio: se siente como si el scroll
     * hubiera saltado al inicio, aunque en realidad el hueco de arriba fue
     * el que desaparecio.
     *
     * Para corregirlo hace falta una tarjeta de referencia que seguisiga
     * visible DESPUES del filtro nuevo, no una cualquiera de las visibles
     * ahora — un filtro exigente (p. ej. "minimo 3 copias") puede ocultar
     * justo las primeras tarjetas visibles, y entonces no queda ninguna
     * candidata con la que corregir. Por eso se comprueba `pasaFiltro` de
     * antemano: solo entran en la lista las que van a seguir ahi.
     */
    /*
     * Primero se decide, sin medir nada, que tarjetas cambian de estado. En
     * el caso normal (llegan anuncios nuevos y el filtro no cambio) no cambia
     * ninguna de las ya pintadas, y entonces no hace falta buscar tarjeta de
     * referencia: esa busqueda medía con getBoundingClientRect desde la
     * primera tarjeta del documento hasta la visible — con 1000 anuncios y
     * el scroll abajo del todo, cientos de mediciones tras cada lote.
     */
    let total = 0;
    let visibles = 0;
    const cambios = [];

    for (const tarjeta of document.querySelectorAll("[data-was-id]")) {
      const a = anuncios.get(tarjeta.dataset.wasId);

      // Sin datos (Meta reemplazo el nodo) o dentro del detalle: se deja como
      // esta. Si no, al cerrar el cuadro quedaban tarjetas ocultas para
      // siempre, sin nada que las volviera a mostrar.
      if (!a || enDetalle(tarjeta)) {
        if (tarjeta.classList.contains("was-filtrado") || tarjeta.classList.contains("was-oculto")) {
          cambios.push([tarjeta, false, false]);
        }
        continue;
      }

      total++;
      const pasa = pasaFiltro(a);
      if (pasa) visibles++;
      const oculto = !pasa && prefs.ocultarFiltrados;
      if (
        tarjeta.classList.contains("was-filtrado") !== !pasa ||
        tarjeta.classList.contains("was-oculto") !== oculto
      ) {
        cambios.push([tarjeta, !pasa, oculto, pasa]);
      }
    }

    // Solo si algo va a aparecer o desaparecer hace falta una tarjeta de
    // referencia que siga visible despues, para que el scroll no salte.
    // Si el primer cambio (en orden del documento) ya esta por debajo de la
    // pantalla, todos los demas tambien: lo de abajo no mueve lo que ves.
    // Es el caso de los lotes nuevos con un filtro puesto.
    const candidatas = [];
    const todoAbajo =
      cambios.length && cambios[0][0].getBoundingClientRect().top > window.innerHeight;
    if (cambios.length && !todoAbajo) {
      const cambia = new Map(cambios.map((c) => [c[0], c]));
      for (const t of document.querySelectorAll("[data-was-id]:not(.was-oculto)")) {
        const c = cambia.get(t);
        if (c ? c[2] : false) continue; // se va a ocultar
        const r = t.getBoundingClientRect();
        if (r.bottom >= 0) {
          candidatas.push({ t, top: r.top });
          if (candidatas.length >= 6) break;
        }
      }
    }
    for (const [tarjeta, filtrado, oculto] of cambios) {
      tarjeta.classList.toggle("was-filtrado", filtrado);
      tarjeta.classList.toggle("was-oculto", oculto);
    }

    contadores = { total, visibles };

    // Solo si el CRITERIO de orden cambio de verdad (no cada vez que
    // `ordenar()` se ejecuta): si el usuario deja el mismo orden y solo
    // llegan anuncios nuevos, forzar el scroll al inicio en cada lote seria
    // igual de molesto que el salto que se esta arreglando.
    const cambioDeOrden = prefs.ordenar !== ultimoOrden;
    ultimoOrden = prefs.ordenar;

    ordenar();
    colocarBarras(); // ajusta que barras se ven tras cambiar el filtro
    actualizarBandejaRapida();

    /*
     * Si lo que cambio fue el criterio de orden, perseguir la tarjeta de
     * referencia no tiene sentido: reordenar es precisamente moverla a otro
     * sitio a proposito, y intentar mantenerla en el mismo punto de la
     * pantalla convierte un cambio de orden pequeño en un salto de scroll
     * enorme (se probo y asi fue). Ahi lo sensato es empezar a ver la lista
     * nueva desde arriba, que es lo que se espera al cambiar el orden.
     */
    if (cambioDeOrden) {
      window.scrollTo(0, 0);
      return;
    }

    const viva = candidatas.find(
      (c) => c.t.isConnected && !c.t.classList.contains("was-oculto")
    );
    if (viva) {
      const despues = viva.t.getBoundingClientRect().top;
      const diferencia = despues - viva.top;
      if (diferencia) window.scrollBy(0, diferencia);
    }
  };

  /**
   * Reordena las tarjetas, de mayor a menor.
   *
   * La Biblioteca reparte los resultados en varios contenedores segun los va
   * cargando, asi que se ordena dentro de cada uno. Antes se exigia un unico
   * padre comun y, al haber mas de uno, la ordenacion no llegaba a ejecutarse.
   */
  // Devuelve si de verdad reordeno algo, para que quien la llama sepa que la
  // posicion de cualquier tarjeta concreta ya no significa lo mismo que antes.
  const ordenar = () => {
    if (prefs.ordenar === "off") return false;
    // Reinsertar tarjetas saca al navegador de la pantalla completa.
    if (document.fullscreenElement) return false;

    const clave = (t) => {
      const a = anuncios.get(t.dataset.wasId) || {};
      if (prefs.ordenar === "dias") return diasActivo(a) ?? 0;
      if (prefs.ordenar === "nota") return puntuacion(a);
      return a.copias || 1;
    };

    const porPadre = new Map();
    for (const t of document.querySelectorAll("[data-was-id]")) {
      if (enDetalle(t)) continue;
      const padre = t.parentElement;
      if (!padre) continue;
      if (!porPadre.has(padre)) porPadre.set(padre, []);
      porPadre.get(padre).push(t);
    }

    let reordeno = false;
    for (const [padre, tarjetas] of porPadre) {
      if (tarjetas.length < 2) continue;
      tarjetas.sort((x, y) => clave(y) - clave(x)).forEach((t) => padre.appendChild(t));
      reordeno = true;
    }
    return reordeno;
  };

  // =========================================================================
  // busqueda automatica
  // =========================================================================

  let auto = { timer: null, fin: 0 };

  const alturaPagina = () =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);

  const pasoScroll = () => {
    // El tope corta aqui, por si se alcanzo sin pasar por el mensaje del canal.
    if (anuncios.size >= prefs.maxAnuncios) {
      detenerBusqueda();
      aviso("Tope de " + prefs.maxAnuncios + " anuncios alcanzado", true);
      return;
    }

    /*
     * Solo scroll, nunca clics: antes se pulsaba cualquier boton con "mostrar
     * mas" o "cargar mas", y ese texto tambien aparece en botones de los
     * propios anuncios, que abren la web del anunciante en otra pestaña.
     */
    const antes = alturaPagina();
    window.scrollTo(0, antes);

    if (prefs.cargaAcelerada) {
      // Un vaiven corto obliga a la biblioteca a pedir el siguiente lote antes.
      setTimeout(() => window.scrollTo(0, antes - 800), 250);
      setTimeout(() => window.scrollTo(0, alturaPagina()), 600);
    }

    if (Date.now() > auto.fin) {
      detenerBusqueda();
      aviso("Busqueda completa");
      pitido();
    }
  };

  const iniciarBusqueda = () => {
    if (auto.timer) return;
    auto.fin = Date.now() + prefs.detenerMin * 60000;
    auto.timer = setInterval(pasoScroll, Math.max(1, prefs.intervaloSeg) * 1000);
    pasoScroll();
    actualizarPanel();
  };

  const detenerBusqueda = () => {
    clearInterval(auto.timer);
    auto.timer = null;
    actualizarPanel();
  };

  const alternarBusqueda = () => (auto.timer ? detenerBusqueda() : iniciarBusqueda());

  // =========================================================================
  // panel flotante
  // =========================================================================

  let panel, bandejaRapida;

  /*
   * Los ajustes pueden ser comunes a todas las pestañas o propios de cada una.
   *
   * Por defecto viven en el almacen de la extension, que comparten todas las
   * pestañas. Con `configPorPestana` activo se guardan ademas en el
   * `sessionStorage` de la pestaña, que por definicion no sale de ella: asi
   * puedes tener una pestaña filtrando WhatsApp y otra mirando otra cosa sin
   * que se pisen. La bandera en si siempre se guarda en el almacen comun, para
   * que se recuerde entre sesiones.
   */
  const guardarPrefs = () => {
    if (prefs.configPorPestana) {
      try {
        sessionStorage.setItem("was-prefs", JSON.stringify(prefs));
      } catch (e) {}
      guardarLocal({ configPorPestana: true });
      return;
    }
    try {
      sessionStorage.removeItem("was-prefs");
    } catch (e) {}
    guardarLocal({ prefs, configPorPestana: false });
  };

  /**
   * Abre y cierra un flotante manteniendo fijo su borde derecho, para que
   * crezca hacia la izquierda.
   *
   * Sin esto, en cuanto lo arrastras queda anclado por la izquierda (`left`) y
   * al desplegarse se estira hacia la derecha, saliendose de la pantalla si
   * estaba pegado a ese lado.
   */
  const crecerHaciaLaIzquierda = (nodo, claveGuardado, cambiar) => {
    const antes = nodo.getBoundingClientRect();
    cambiar();
    if (!nodo.style.left) return; // sin arrastrar: lo ancla `right` y ya crece bien

    const ahora = nodo.getBoundingClientRect();
    nodo.style.left = Math.max(0, antes.right - ahora.width) + "px";
    guardarLocal({
      [claveGuardado]: { left: nodo.style.left, top: nodo.style.top },
    });
  };

  /** #3ec46d -> "62, 196, 109", para poder componer rgba() desde CSS. */
  const aRgb = (hex) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
    if (!m) return "62, 196, 109";
    return [1, 2, 3].map((i) => parseInt(m[i], 16)).join(", ");
  };

  /**
   * Los ajustes de apariencia viajan como variables CSS en la raiz del
   * documento: cambiarlos repinta todas las tarjetas de golpe, sin recorrerlas.
   */
  const aplicarApariencia = () => {
    const raiz = document.documentElement.style;
    raiz.setProperty("--was-halo-rgb", aRgb(prefs.colorBorde));
    raiz.setProperty("--was-halo", prefs.colorBorde);
    raiz.setProperty("--was-copias-tam", prefs.tamCopias + "px");
  };

  const control = (etiqueta, contenido) => {
    const fila = el("div", "was-campo");
    fila.appendChild(el("label", null, etiqueta));
    fila.appendChild(contenido);
    return fila;
  };

  const deslizador = (etiqueta, unidad, clave, max) => {
    const cont = el("div", "was-deslizador");
    cont.appendChild(el("label", null, etiqueta));

    const fila = el("div", "was-fila");
    const rango = el("input");
    rango.type = "range";
    rango.min = 0;
    rango.max = max;
    rango.value = prefs[clave];

    const num = el("input", "was-num");
    num.type = "number";
    num.min = 0;
    num.value = prefs[clave];

    const sincronizar = (v) => {
      prefs[clave] = Number(v) || 0;
      rango.value = Math.min(prefs[clave], max);
      num.value = prefs[clave];
      guardarPrefs();
      aplicarFiltros();
    };
    rango.addEventListener("input", (e) => sincronizar(e.target.value));
    num.addEventListener("input", (e) => sincronizar(e.target.value));

    fila.appendChild(rango);
    fila.appendChild(num);
    fila.appendChild(el("span", "was-unidad", unidad));
    cont.appendChild(fila);
    return cont;
  };

  const selector = (clave, opciones) => {
    const s = el("select");
    for (const [valor, texto] of opciones) {
      const o = el("option");
      o.value = valor;
      o.textContent = texto;
      if (prefs[clave] === valor) o.selected = true;
      s.appendChild(o);
    }
    s.addEventListener("change", (e) => {
      prefs[clave] = e.target.value;
      guardarPrefs();
      aplicarFiltros();
    });
    return s;
  };

  const interruptor = (etiqueta, clave, alCambiar) => {
    const fila = el("div", "was-switch-fila");
    const sw = el("button", "was-switch" + (prefs[clave] ? " was-on" : ""));
    sw.innerHTML = "<i></i>";
    sw.addEventListener("click", () => {
      prefs[clave] = !prefs[clave];
      sw.classList.toggle("was-on", prefs[clave]);
      guardarPrefs();
      alCambiar?.();
    });
    fila.appendChild(sw);
    fila.appendChild(el("span", null, etiqueta));
    return fila;
  };

  const modal = (titulo, contenido) => {
    const fondo = el("div", "was-modal-fondo");
    const caja = el("div", "was-modal");

    // El cuadro vive dentro del panel; le damos alto minimo mientras esta
    // abierto para que quepa el contenido y, si sobra, se desplace dentro.
    panel.classList.add("was-con-modal");
    const quitar = () => {
      fondo.remove();
      panel.classList.remove("was-con-modal");
    };

    const cab = el("div", "was-modal-cab");
    cab.appendChild(el("h3", null, titulo));
    const cerrar = el("button", "was-cerrar", "&times;");
    cerrar.addEventListener("click", quitar);
    cab.appendChild(cerrar);
    caja.appendChild(cab);
    caja.appendChild(contenido);

    const listo = el("button", "was-primario", "LISTO");
    listo.addEventListener("click", quitar);
    caja.appendChild(listo);

    fondo.appendChild(caja);
    fondo.addEventListener("click", (e) => e.target === fondo && quitar());
    panel.appendChild(fondo);
  };

  const configFiltro = () => {
    const c = el("div");
    c.appendChild(
      control(
        "Filtrar por anuncios",
        selector("opAnuncios", [
          ["gte", "Mayor o igual"],
          ["lte", "Menor o igual"],
          ["eq", "Igual"],
        ])
      )
    );
    c.appendChild(
      control(
        "Filtrar por tiempo",
        selector("opDias", [
          ["gte", "Mayor o igual"],
          ["lte", "Menor o igual"],
          ["eq", "Igual"],
        ])
      )
    );
    c.appendChild(
      control(
        "Ordenar por:",
        selector("ordenar", [
          ["off", "Deshabilitado"],
          ["anuncios", "Cantidad de anuncios"],
          ["dias", "Tiempo de actividad"],
          ["nota", "Nota de ganador"],
        ])
      )
    );

    c.appendChild(
      control(
        "Formato",
        selector("formato", [
          ["todos", "Todos"],
          ["video", "Solo video"],
          ["imagen", "Solo imagen"],
          ["carrusel", "Carrusel o dinamico"],
        ])
      )
    );

    c.appendChild(
      control(
        "Plataforma",
        selector("plataforma", [
          ["todas", "Todas"],
          ["facebook", "Facebook"],
          ["instagram", "Instagram"],
          ["messenger", "Messenger"],
          ["whatsapp", "WhatsApp"],
        ])
      )
    );

    c.appendChild(
      control(
        "Destino",
        selector("cta", [
          ["todos", "Todos"],
          ["whatsapp", "Solo a WhatsApp"],
          ["web", "Solo a una web"],
        ])
      )
    );

    c.appendChild(interruptor("Solo los que sigo", "soloSeguidos", aplicarFiltros));

    c.appendChild(
      interruptor("Boton de WhatsApp solo si el CTA lo dice", "waSoloCta", () => {
        document.querySelectorAll("[data-was-id]").forEach((t) => delete t.dataset.wasId);
        pintar();
      })
    );

    c.appendChild(
      interruptor("Descarga multiple: incluir texto, titulo y descripcion (.txt)", "multiDescargaConTexto")
    );

    /*
     * El permiso para leer la landing del anuncio (busqueda de WhatsApp,
     * paso 4 de la cascada) solo se puede pedir desde una pagina propia de
     * la extension — un content script ni siquiera tiene acceso al objeto
     * chrome.permissions (existe, pero es undefined aqui; se comprobo en
     * vivo, tiraba error). Por eso se pregunta al service worker, que si lo
     * tiene. Se deja un aviso con el estado real (no lo que el usuario
     * recuerde haber marcado) y la indicacion de donde activarlo.
     */
    const notaPermiso = el("div", "was-ayuda");
    notaPermiso.textContent = "Comprobando el permiso para leer la pagina de destino del anuncio...";
    c.appendChild(notaPermiso);
    chrome.runtime.sendMessage({ tipo: "tienePermisoLanding" }, (concedido) => {
      notaPermiso.textContent = concedido
        ? "Busqueda en la pagina de destino del anuncio: activada."
        : "Busqueda en la pagina de destino del anuncio: desactivada. Se activa desde el icono de la extension en la barra de Chrome (el logo de Vyxen), no desde aqui.";
    });

    modal("Configuracion de filtro", c);
  };

  // Palabras que aparecen en cualquier texto y no dicen nada del nicho.
  const VACIAS = new Set(
    ("de la que el en y a los se del las un por con no una su para es al lo como mas " +
      "pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta " +
      "hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante " +
      "ellos e esto mi antes algunos qué unos yo otro otras otra él tanto esa estos mucho " +
      "quienes nada muchos cual sea poco ella estar haber estas estaba estamos algunas " +
      "algo nosotros mi mis tu te ti tus ellas nosotras vosotros vosotras os mio mia " +
      "tuyo tuya suyo suya nuestro nuestra vuestro vuestra esos esas te vos ha han hace " +
      "ser son fue era solo asi tu"
    ).split(" ")
  );

  /**
   * Sugerencias sacadas de los propios anuncios analizados: las parejas de
   * palabras que mas se repiten en sus textos. Son los ganchos que el nicho
   * esta usando ahora mismo, asi que sirven como siguiente busqueda.
   */
  const calcularSugerencias = () => {
    const cuenta = new Map();

    for (const a of anuncios.values()) {
      const palabras = (a.cuerpo || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((p) => p.length > 2 && !VACIAS.has(p));

      const vistasAqui = new Set();
      for (let i = 0; i < palabras.length - 1; i++) {
        const par = palabras[i] + " " + palabras[i + 1];
        if (vistasAqui.has(par)) continue; // una vez por anuncio, no por repeticion
        vistasAqui.add(par);
        cuenta.set(par, (cuenta.get(par) || 0) + 1);
      }
    }

    return [...cuenta.entries()]
      .filter(([, n]) => n > 1)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 14);
  };

  /** Campo con su globo de ayuda al lado de la etiqueta. */
  const campoConAyuda = (etiqueta, ayuda, entrada) => {
    const fila = el("div", "was-campo");
    const lab = el("label");
    lab.append(document.createTextNode(etiqueta));

    const pista = el("span", "was-pista", "&#9432;");
    pista.setAttribute("data-ayuda", ayuda);
    pista.setAttribute("tabindex", "0");
    lab.appendChild(pista);

    fila.append(lab, entrada);
    return fila;
  };

  /**
   * Pide nicho y tipo de producto y abre ChatGPT con el encargo ya escrito.
   *
   * Debajo se listan las frases que mas se repiten en los anuncios ya leidos:
   * eso no lo tiene que adivinar nadie, sale de los datos que hay en pantalla.
   */
  const configSugerencias = () => {
    const c = el("div");

    const nicho = el("input", "was-texto");
    nicho.type = "text";
    nicho.placeholder = "";
    c.appendChild(
      campoConAyuda(
        "Nicho:",
        "¿Que nicho de mercado quieres investigar? Ej.: ingresos extra, relaciones, perdida de peso, moda, etc",
        nicho
      )
    );

    const producto = el("input", "was-texto");
    producto.type = "text";
    c.appendChild(
      campoConAyuda(
        "Tipo de producto:",
        "¿Que tipo de producto quieres investigar? Ej.: ebook, curso, ropa, servicio, etc",
        producto
      )
    );

    const guardarChat = el("div", "was-switch-fila");
    const sw = el("button", "was-switch");
    sw.innerHTML = "<i></i>";
    let guardar = false;
    sw.addEventListener("click", () => {
      guardar = !guardar;
      sw.classList.toggle("was-on", guardar);
    });
    const etiqueta = el("span", null, "Guardar chat");
    const pista = el("span", "was-pista", "&#9432;");
    pista.setAttribute(
      "data-ayuda",
      "Guardar el chat de sugerencias de palabras clave en tu historial de ChatGPT"
    );
    pista.setAttribute("tabindex", "0");
    guardarChat.append(sw, etiqueta, pista);
    c.appendChild(guardarChat);

    const ir = el("button", "was-primario", "ABRIR EN CHATGPT");
    ir.addEventListener("click", () => {
      const n = nicho.value.trim();
      const p = producto.value.trim();
      if (!n && !p) return aviso("Escribe al menos el nicho", true);

      const encargo =
        "Dame 25 palabras clave y frases en español para buscar en la Biblioteca de " +
        "Anuncios de Meta anuncios del nicho \"" + (n || "cualquiera") + "\"" +
        (p ? ' con productos de tipo "' + p + '"' : "") +
        ". Incluye ganchos de copy que suelan usar esos anuncios, promesas " +
        "habituales y objeciones frecuentes. Devuelvelas en una lista, sin explicaciones.";

      // Sin "guardar chat" se usa el modo temporal, que no deja rastro en el historial.
      abrir(
        "https://chatgpt.com/?" +
          (guardar ? "" : "temporary-chat=true&") +
          "q=" + encodeURIComponent(encargo)
      );
    });
    c.appendChild(ir);

    const frases = calcularSugerencias();
    if (frases.length) {
      c.appendChild(
        el("p", "was-vacio", "O usa las frases que mas se repiten en los " + anuncios.size + " anuncios leidos:")
      );
      const cont = el("div", "was-sugerencias");
      for (const [frase, veces] of frases) {
        const b = el("button", "was-sugerencia");
        b.innerHTML = "<span>" + frase + "</span><b>" + veces + "</b>";
        b.title = "Buscar esta frase en la Biblioteca";
        b.addEventListener("click", () =>
          abrir(
            "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
              "&country=ALL&q=" + encodeURIComponent(frase) +
              "&search_type=keyword_unordered"
          )
        );
        cont.appendChild(b);
      }
      c.appendChild(cont);
    }

    modal("Sugerencias de busqueda", c);
  };

  /*
   * Marca que activa la vista de guardados.
   *
   * Va en el termino de busqueda, no en el ancla: la Biblioteca reescribe la
   * direccion al cargar y se lleva por delante cualquier `#hash`. Ademas es un
   * texto que no encuentra ningun anuncio, asi que el area de resultados queda
   * libre para pintar encima.
   */
  const MARCA_MURAL = "was-guardados";

  const enModoMural = () =>
    new URLSearchParams(location.search).get("q") === MARCA_MURAL;

  const urlMural = () =>
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL" +
    "&q=" + MARCA_MURAL + "&search_type=keyword_unordered&media_type=all";

  /**
   * Muestra los anuncios seguidos dentro de la propia Biblioteca.
   *
   * La Biblioteca no sabe buscar "mis guardados", asi que se abre una busqueda
   * que no devuelve nada y ese hueco se rellena con las tarjetas que guarda la
   * extension. Por eso al seguir un anuncio se archiva tambien su resumen.
   */
  const abrirMural = () => {
    document.querySelector(".was-mural")?.remove();

    /*
     * Que cambio desde la ultima vez que se abrio el mural.
     *
     * El historial de copias y dias ya se guardaba (`puntos`) pero no se
     * usaba para nada mas que el "+X desde que lo sigues" de siempre. Se
     * captura la visita anterior ANTES de pisarla con la de ahora, para
     * poder comparar; si es la primera vez que se abre, no hay nada que
     * resaltar (todo es "nuevo" por definicion).
     */
    const visitaAnterior = ultimaVisitaMural;
    ultimaVisitaMural = Date.now();
    guardarLocal({ muralUltimaVisita: ultimaVisitaMural });

    const novedadesDe = (id) => {
      if (!visitaAnterior) return null;
      const f = guardados[id];
      const puntos = f.puntos || [];
      if (puntos.length < 2) return null;

      // El punto mas reciente que ya existia en la visita anterior.
      const previo = [...puntos].reverse().find((p) => new Date(p.t).getTime() < visitaAnterior);
      const ahora = puntos[puntos.length - 1];
      if (!previo || previo === ahora) return null;

      const dCopias = (ahora.copias || 1) - (previo.copias || 1);
      if (dCopias > 0) return { tipo: "copias", texto: "+" + dCopias + " copias desde tu ultima visita" };

      return null;
    };

    const seApagoDesdeLaUltimaVez = (id) => {
      const f = guardados[id];
      if (!f.estadoReal || f.estadoReal === "activo") return false;
      if (!visitaAnterior || !f.verificadoEl) return false;
      return f.verificadoEl > visitaAnterior;
    };

    const mural = el("div", "was-mural");
    const cab = el("div", "was-mural-cab");
    const ids = Object.keys(guardados);

    cab.appendChild(el("h2", null, "Anuncios que sigues"));
    cab.appendChild(el("span", "was-mural-cuenta", ids.length + " guardados"));

    const todas = el("button", "was-mini", "Abrir todos en pestañas");
    todas.addEventListener("click", () => {
      if (ids.length > 12) return aviso("Son demasiados: abrelos por tandas", true);
      ids.forEach((id) => abrir(bibliotecaUrlTodos(id)));
    });
    // Las acciones van juntas a la derecha, en vez de repartidas a lo ancho.
    const acciones = el("div", "was-mural-acciones");
    cab.appendChild(acciones);
    acciones.appendChild(todas);

    /*
     * Comprobar si lo que sigues sigue existiendo.
     *
     * En tandas de 3 a la vez, no de una en una: cada comprobacion abre y
     * cierra una pestaña de fondo, y con 25+ guardados hacerlo en serie
     * tarda varios minutos. Tres a la vez es un punto medio razonable —
     * bastante mas rapido y sin llegar a abrir diez pestañas de golpe.
     */
    const TANDA_COMPROBAR = 3;
    const comprobar = el("button", "was-mini", "Comprobar estado");
    let detenerComprobacion = false;

    const verificarUno = async (id) => {
      const f = guardados[id];
      if (!f) return;
      try {
        const r = await chrome.runtime.sendMessage({
          tipo: "verificarSeguido",
          id,
          paginaId: f.resumen?.paginaId,
          perfilUrl: f.resumen?.perfilUrl,
        });
        f.estadoReal = r?.estado || "no_verificable";
        f.verificadoEl = Date.now();
        guardarGuardados();
        const tarjeta = rejilla.querySelector('[data-was-mural-id="' + id + '"]');
        if (tarjeta) pintarEstado(tarjeta.querySelector(".was-mural-estado"), f);
      } catch {}
    };

    comprobar.addEventListener("click", async () => {
      // Ya esta corriendo: este clic la detiene, no la reinicia.
      if (comprobar.dataset.corriendo === "1") {
        detenerComprobacion = true;
        comprobar.textContent = "Deteniendo...";
        return;
      }

      detenerComprobacion = false;
      comprobar.dataset.corriendo = "1";
      comprobar.classList.add("was-mini-detener");

      let hechos = 0;
      for (let i = 0; i < ids.length; i += TANDA_COMPROBAR) {
        if (detenerComprobacion) break;
        const tanda = ids.slice(i, i + TANDA_COMPROBAR);
        await Promise.all(tanda.map((id) => verificarUno(id)));
        hechos += tanda.length;
        comprobar.textContent = "Detener (" + Math.min(hechos, ids.length) + "/" + ids.length + ")";
      }
      comprobar.dataset.corriendo = "0";
      comprobar.classList.remove("was-mini-detener");
      comprobar.textContent = "Comprobar estado";
      aviso(detenerComprobacion ? "Comprobacion detenida" : "Comprobacion terminada");
    });
    acciones.appendChild(comprobar);

    const salir = el("button", "was-mini was-mini-cerrar", "Cerrar");
    salir.addEventListener("click", () => mural.remove());
    acciones.appendChild(salir);
    mural.appendChild(cab);

    if (!ids.length) {
      mural.appendChild(
        el("p", "was-mural-vacio", "Todavia no sigues ningun anuncio. Marca la estrella de una tarjeta.")
      );
      document.body.appendChild(mural);
      return;
    }

    /*
     * Barra de busqueda y filtros de lo guardado.
     *
     * Todo se calcula sobre los datos ya guardados (nombre, copy, dias,
     * copias, estado), sin volver a tocar la red. Los rangos de los sliders
     * se ajustan al maximo real de lo que tienes guardado, no a un tope fijo
     * que podria quedarse corto o dejar la mitad del slider sin usar.
     */
    const datoDe = (id) => {
      const f = guardados[id];
      const r = f.resumen || {};
      const ultimo = (f.puntos || [])[f.puntos.length - 1] || {};
      const etiquetas = f.etiquetas || [];
      return {
        dias: ultimo.dias ?? 0,
        copias: ultimo.copias ?? 1,
        activo: f.estadoReal
          ? f.estadoReal === "activo"
          : r.activo !== false,
        etiquetas,
        texto: [f.nombre, r.titulo, r.cuerpo, ...etiquetas].filter(Boolean).join(" ").toLowerCase(),
      };
    };

    /*
     * Carpetas/etiquetas: totalmente opcional. Quien nunca ponga una
     * etiqueta no ve nada distinto — ni el filtro por etiqueta aparece (no
     * hay nada que filtrar), ni la fila de chips ocupa espacio si esta
     * vacia. Se guardan como texto libre, sin un catalogo fijo de carpetas
     * que mantener.
     */
    const todasLasEtiquetas = () => {
      const s = new Set();
      for (const id of ids) for (const e of datoDe(id).etiquetas) s.add(e);
      return [...s].sort();
    };

    const maxDias = Math.max(1, ...ids.map((id) => datoDe(id).dias));
    const maxCopias = Math.max(1, ...ids.map((id) => datoDe(id).copias));

    const filtros = el("div", "was-mural-filtros");

    const buscar = el("input", "was-mural-buscar");
    buscar.type = "search";
    buscar.placeholder = "Buscar por texto, titulo o anunciante...";
    filtros.appendChild(buscar);

    const estadoSel = el("select", "was-mural-select");
    for (const [valor, texto] of [["todos", "Todos los estados"], ["activos", "Solo activos"], ["inactivos", "Solo inactivos o retirados"]]) {
      const o = el("option");
      o.value = valor;
      o.textContent = texto;
      estadoSel.appendChild(o);
    }
    filtros.appendChild(estadoSel);

    const ordenSel = el("select", "was-mural-select");
    for (const [valor, texto] of [
      ["grupo", "Agrupado por anunciante (recomendado)"],
      ["reciente", "Guardado mas reciente"],
      ["dias", "Mas dias activos primero"],
      ["copias", "Mas copias primero"],
    ]) {
      const o = el("option");
      o.value = valor;
      o.textContent = texto;
      ordenSel.appendChild(o);
    }
    filtros.appendChild(ordenSel);

    // Solo se añade al DOM si de verdad hay alguna etiqueta puesta: para
    // quien no usa la funcion, la barra de filtros queda exactamente igual
    // que antes.
    const etiquetaSel = el("select", "was-mural-select");
    const refrescarOpcionesEtiqueta = () => {
      const actual = etiquetaSel.value;
      etiquetaSel.innerHTML = "";
      const todas = el("option");
      todas.value = "";
      todas.textContent = "Todas las etiquetas";
      etiquetaSel.appendChild(todas);
      for (const e of todasLasEtiquetas()) {
        const o = el("option");
        o.value = e;
        o.textContent = e;
        etiquetaSel.appendChild(o);
      }
      etiquetaSel.value = [...etiquetaSel.options].some((o) => o.value === actual) ? actual : "";
      const hayEtiquetas = etiquetaSel.options.length > 1;
      etiquetaSel.classList.toggle("was-oculto", !hayEtiquetas);
    };
    refrescarOpcionesEtiqueta();
    filtros.appendChild(etiquetaSel);

    const conSlider = (etiqueta, max) => {
      const cont = el("div", "was-mural-slider");
      const cab2 = el("div", "was-mural-slider-cab");
      cab2.appendChild(el("span", null, etiqueta));
      const valor = el("span", "was-mural-slider-valor", "0");
      cab2.appendChild(valor);
      cont.appendChild(cab2);

      const fila = el("div", "was-mural-slider-fila");
      const rango = el("input", "was-mural-rango");
      rango.type = "range";
      rango.min = 0;
      rango.max = String(max);
      rango.value = 0;
      fila.appendChild(rango);

      // Numero al lado: con rangos grandes (dias u copias pueden pasar de
      // cien) arrastrar el slider avanza varias unidades por pixel y cuesta
      // caer justo en el valor que se quiere. Escribiendolo aqui se entra al
      // numero exacto sin pelear con el arrastre.
      const numero = el("input", "was-mural-slider-num");
      numero.type = "number";
      numero.min = 0;
      numero.max = String(max);
      numero.value = 0;
      fila.appendChild(numero);
      cont.appendChild(fila);

      rango.addEventListener("input", () => {
        numero.value = rango.value;
      });
      numero.addEventListener("input", () => {
        let v = Math.round(Number(numero.value) || 0);
        v = Math.max(0, Math.min(max, v));
        rango.value = String(v);
        rango.dispatchEvent(new Event("input"));
      });

      return { cont, rango, valor, numero };
    };

    const sliderDias = conSlider("Minimo de dias activos", maxDias);
    const sliderCopias = conSlider("Minimo de copias", maxCopias);
    // Los dos deslizadores lado a lado, y debajo el pie con el recuento y
    // "Limpiar filtros": tres filas claras en vez de todo apilado.
    const sliders = el("div", "was-mural-sliders");
    sliders.append(sliderDias.cont, sliderCopias.cont);
    filtros.appendChild(sliders);

    const pieFiltros = el("div", "was-mural-filtros-pie");
    const contador = el("span", "was-mural-filtro-cuenta");
    const limpiar = el("button", "was-mini was-mini-suave", "Limpiar filtros");
    pieFiltros.append(contador, limpiar);
    filtros.appendChild(pieFiltros);

    mural.appendChild(filtros);

    const crecimiento = (id) => {
      const p = guardados[id].puntos || [];
      return p.length < 2 ? 0 : (p[p.length - 1].copias || 1) - (p[0].copias || 1);
    };

    /*
     * Orden: agrupados por anunciante, y el grupo entero se ubica segun su
     * guardado mas reciente — no por orden alfabetico. Asi, si ayer guardaste
     * un anuncio de un anunciante y hoy guardas otro de ese mismo anunciante,
     * el grupo entero sube al principio (por el guardado de hoy) y dentro del
     * grupo el de hoy queda primero, el de ayer despues.
     *
     * Los favoritos guardados antes de este cambio no tienen `guardadoEl`
     * (no existia el campo): se tratan como los mas antiguos, sin que eso
     * rompa el orden de los que si lo llevan.
     */
    const clavAnunciante = (id) => guardados[id].resumen?.paginaId || guardados[id].nombre || id;
    const guardadoEl = (id) => guardados[id].guardadoEl || 0;

    const masRecientePorAnunciante = new Map();
    for (const id of ids) {
      const clave = clavAnunciante(id);
      masRecientePorAnunciante.set(clave, Math.max(masRecientePorAnunciante.get(clave) || 0, guardadoEl(id)));
    }

    ids.sort((x, y) => {
      const grupoX = masRecientePorAnunciante.get(clavAnunciante(x));
      const grupoY = masRecientePorAnunciante.get(clavAnunciante(y));
      if (grupoX !== grupoY) return grupoY - grupoX;
      return guardadoEl(y) - guardadoEl(x);
    });

    /*
     * Pinta el estado de una tarjeta guardada.
     *
     * Si ya se comprobo (estadoReal), manda ese dato sobre la instantanea de
     * cuando se guardo: distingue tres cosas que para el usuario no son lo
     * mismo — sigue activo, la campaña termino normal, o el anunciante ya no
     * existe (Pagina eliminada o baneada). Sin comprobar todavia, se muestra
     * la instantanea de siempre para no dejar la tarjeta en blanco.
     */
    const pintarEstado = (nodo, f) => {
      if (!nodo) return;
      const r = f.resumen || {};
      nodo.className = "was-mural-estado";
      if (f.estadoReal === "anunciante_baneado") {
        nodo.classList.add("was-mural-baneado");
        nodo.textContent = "Anunciante eliminado o baneado";
        nodo.title = "Ni el anuncio ni la Pagina del anunciante existen ya";
      } else if (f.estadoReal === "retirado") {
        nodo.classList.add("was-mural-retirado");
        nodo.textContent = "Ya no aparece";
        nodo.title = "El anuncio ya no esta en la Biblioteca, pero el anunciante sigue existiendo";
      } else if (f.estadoReal === "activo") {
        nodo.textContent = "Activo";
      } else {
        // Nunca se comprobo en vivo: se cae a la instantanea del momento de guardar.
        nodo.classList.toggle("was-inactivo", r.activo === false);
        nodo.textContent = r.activo === false ? "Inactivo" : "Activo";
      }
      if (f.verificadoEl) {
        nodo.title = (nodo.title ? nodo.title + " — " : "") +
          "Comprobado el " + new Date(f.verificadoEl).toLocaleDateString();
      }
    };

    const rejilla = el("div", "was-mural-rejilla");
    const tarjetaPorId = new Map();

    for (const id of ids) {
      const f = guardados[id];
      const r = f.resumen || {};
      const ultimo = (f.puntos || [])[f.puntos.length - 1] || {};

      const tarjeta = el("div", "was-mural-tarjeta");
      tarjeta.dataset.wasMuralId = id;

      const cabT = el("div", "was-mural-tarjeta-cab");
      const estado = el("span", "was-mural-estado");
      pintarEstado(estado, f);
      cabT.appendChild(estado);

      const datos = el("span", "was-mural-datos");
      const trozos = [];
      if (ultimo.dias != null) trozos.push(ultimo.dias + " dias");
      if (ultimo.copias) trozos.push(ultimo.copias + " copias");
      const crece = crecimiento(id);
      if (crece > 0) trozos.push("+" + crece);
      datos.textContent = trozos.join(" · ");
      cabT.appendChild(datos);
      tarjeta.appendChild(cabT);

      const nombre = el("div", "was-mural-nombre", f.nombre || "Anunciante");
      nombre.title = f.nombre || "";
      tarjeta.appendChild(nombre);

      /*
       * Etiquetas de este anuncio: opcionales del todo. Sin ninguna puesta,
       * la fila no aparece — no ocupa espacio ni distrae a quien nunca las
       * usa. El boton "+" siempre esta, chico, al lado de las que ya haya.
       */
      const filaEtiquetas = el("div", "was-mural-etiquetas");
      const pintarEtiquetas = () => {
        filaEtiquetas.innerHTML = "";
        const propias = f.etiquetas || [];
        for (const e of propias) {
          const chip = el("span", "was-etiqueta-chip");
          chip.textContent = e;
          const quitarChip = el("button", "was-etiqueta-quitar", "&times;");
          quitarChip.title = "Quitar etiqueta";
          quitarChip.addEventListener("click", () => {
            f.etiquetas = propias.filter((x) => x !== e);
            guardarGuardados();
            pintarEtiquetas();
            refrescarOpcionesEtiqueta();
          });
          chip.appendChild(quitarChip);
          filaEtiquetas.appendChild(chip);
        }
        const mas = el("button", "was-etiqueta-mas", propias.length ? "Editar etiquetas" : "+ etiqueta");
        mas.addEventListener("click", () =>
          elegirEtiquetas(f.etiquetas, (nuevas) => {
            f.etiquetas = nuevas;
            guardarGuardados();
            pintarEtiquetas();
            refrescarOpcionesEtiqueta();
          }, "Etiquetas de este anuncio")
        );
        filaEtiquetas.appendChild(mas);
      };
      pintarEtiquetas();
      tarjeta.appendChild(filaEtiquetas);

      // Lo que cambio desde la ultima vez que se abrio esta pantalla: es lo
      // que convierte la lista de guardados en algo que de verdad avisa, no
      // solo en un catalogo estatico.
      const novedad = novedadesDe(id);
      const apagado = seApagoDesdeLaUltimaVez(id);
      if (novedad || apagado) {
        const aviso2 = el("div", "was-mural-novedad" + (apagado ? " was-mural-novedad-mala" : ""));
        aviso2.textContent = apagado
          ? "Se detuvo desde tu ultima visita"
          : novedad.texto;
        tarjeta.appendChild(aviso2);
      }

      /*
       * Se prefiere la miniatura propia (base64, guardada por la extension):
       * a diferencia de la URL de Facebook, no tiene fecha de vencimiento.
       * Los anuncios guardados antes de que existiera esto solo tienen
       * `imagen` — si esa URL todavia carga, se aprovecha para generarle la
       * miniatura ahi mismo y que la proxima vez ya no dependa de ella.
       */
      // Miniatura vieja (chica y pixelada): se prueba primero la URL original,
      // que si aun carga sirve para rehacerla a la calidad actual.
      const miniaturaVieja = r.miniatura && r.miniaturaV !== VERSION_MINIATURA;
      const previa = miniaturaVieja ? r.imagen || r.miniatura : r.miniatura || r.imagen;
      if (previa) {
        const img = el("img", "was-mural-img");
        img.src = previa;
        img.loading = "lazy";
        img.alt = "";

        if ((!r.miniatura || miniaturaVieja) && r.imagen) {
          img.addEventListener("load", () => generarMiniatura(id, r.imagen), { once: true });
        }

        /*
         * Las imagenes de Facebook llevan una firma con vencimiento en la
         * propia URL (el parametro "oe="): pasado ese plazo (dias o semanas
         * segun el anuncio) la imagen guardada deja de cargar aunque el
         * anuncio siga activo — no es que se haya perdido el guardado, es
         * el enlace el que caduco. Sin este aviso quedaba un recuadro gris
         * vacio sin explicacion, como si algo se hubiera roto.
         */
        img.addEventListener("error", () => {
          // La URL original ya caduco, pero queda la miniatura vieja: mejor
          // pixelada que nada.
          if (miniaturaVieja && img.src !== r.miniatura) {
            img.src = r.miniatura;
            return;
          }
          const reemplazo = el("div", "was-mural-img was-mural-img-rota");
          reemplazo.textContent = 'Vista previa vencida — usa "Ver anuncio" para verla de nuevo';
          img.replaceWith(reemplazo);
        });
        tarjeta.appendChild(img);
      }

      if (r.cuerpo) tarjeta.appendChild(el("p", "was-mural-texto", r.cuerpo));

      const pie = el("div", "was-mural-pie");
      const ver = el("button", "was-mini", "Ver anuncio");
      ver.addEventListener("click", () => abrir(bibliotecaUrlTodos(id)));
      pie.appendChild(ver);

      if (r.paginaId) {
        const anunciante = el("button", "was-mini", "Anunciante");
        anunciante.addEventListener("click", () => abrir(buscarAnunciante(r.paginaId)));
        pie.appendChild(anunciante);
      }

      if (r.esWhatsapp) {
        const wa = el("button", "was-mini was-mini-wa", "WhatsApp");
        wa.addEventListener("click", () => {
          const anuncio = anuncios.get(id) || {
            id,
            paginaId: r.paginaId,
            perfilUrl: r.perfilUrl,
            telefonoDirecto: r.telefono,
            cuerpo: r.cuerpo,
          };
          clicWhatsapp(anuncio, wa, false);
        });
        conectarBotonWa(anuncios.get(id) || { id }, wa);
        pie.appendChild(wa);
      }

      const quitar = el("button", "was-mini was-mini-quitar", "Quitar");
      quitar.addEventListener("click", () => {
        delete guardados[id];
        guardarGuardados();
        tarjeta.remove();
        tarjetaPorId.delete(id);
        // Se saca tambien de `ids`: si no, al volver a tocar un filtro
        // despues de quitarla, aplicarFiltroMural intentaria reinsertarla.
        const i = ids.indexOf(id);
        if (i >= 0) ids.splice(i, 1);
        cab.querySelector(".was-mural-cuenta").textContent = ids.length + " guardados";
        aplicarFiltroMural();
      });
      pie.appendChild(quitar);

      tarjeta.appendChild(pie);
      rejilla.appendChild(tarjeta);
      tarjetaPorId.set(id, tarjeta);
    }

    /*
     * Aplica busqueda + filtros + orden sobre las tarjetas ya construidas:
     * no se rehace nada, solo se muestran/ocultan y se reordenan en el DOM.
     */
    const ordenadoresExtra = {
      reciente: (x, y) => guardadoEl(y) - guardadoEl(x),
      dias: (x, y) => datoDe(y).dias - datoDe(x).dias,
      copias: (x, y) => datoDe(y).copias - datoDe(x).copias,
    };

    // Recuerda el ultimo criterio de orden aplicado: mover los sliders de
    // "minimo de..." solo cambia que se ve, nunca el orden, asi que no hay
    // por que remover las tarjetas del DOM en cada arrastre. Hacerlo con
    // `appendChild` en cada evento (incluidos los del slider) sacaba a todas
    // las tarjetas de su sitio y las devolvia al final una a una: con la
    // rejilla ya reflowed por las que se ocultan, eso se veia como un salto
    // en la ventana del mural cada vez que se movia el slider.
    let ultimoOrdenMural = null;

    const aplicarFiltroMural = () => {
      const texto = buscar.value.trim().toLowerCase();
      const estadoQuiere = estadoSel.value;
      const etiquetaQuiere = etiquetaSel.value;
      const minDias = Number(sliderDias.rango.value) || 0;
      const minCopias = Number(sliderCopias.rango.value) || 0;
      sliderDias.valor.textContent = minDias + "+";
      sliderCopias.valor.textContent = minCopias + "+";

      let visibles = 0;
      for (const id of ids) {
        const d = datoDe(id);
        const pasa =
          (!texto || d.texto.includes(texto)) &&
          (estadoQuiere === "todos" || (estadoQuiere === "activos") === d.activo) &&
          (!etiquetaQuiere || d.etiquetas.includes(etiquetaQuiere)) &&
          d.dias >= minDias &&
          d.copias >= minCopias;
        const tarjeta = tarjetaPorId.get(id);
        if (!tarjeta) continue;
        tarjeta.classList.toggle("was-mural-oculto", !pasa);
        if (pasa) visibles++;
      }

      if (ordenSel.value !== ultimoOrdenMural) {
        ultimoOrdenMural = ordenSel.value;
        const comparador = ordenadoresExtra[ordenSel.value];
        const orden = comparador ? [...ids].sort(comparador) : ids;
        orden.forEach((id) => {
          const t = tarjetaPorId.get(id);
          if (t) rejilla.appendChild(t);
        });
      }

      contador.textContent = visibles + " de " + ids.length;
    };

    buscar.addEventListener("input", aplicarFiltroMural);
    estadoSel.addEventListener("change", aplicarFiltroMural);
    etiquetaSel.addEventListener("change", aplicarFiltroMural);
    ordenSel.addEventListener("change", aplicarFiltroMural);
    sliderDias.rango.addEventListener("input", aplicarFiltroMural);
    sliderCopias.rango.addEventListener("input", aplicarFiltroMural);
    limpiar.addEventListener("click", () => {
      buscar.value = "";
      estadoSel.value = "todos";
      etiquetaSel.value = "";
      ordenSel.value = "grupo";
      sliderDias.rango.value = 0;
      sliderDias.numero.value = 0;
      sliderCopias.rango.value = 0;
      sliderCopias.numero.value = 0;
      aplicarFiltroMural();
    });

    aplicarFiltroMural();

    mural.appendChild(rejilla);
    document.body.appendChild(mural);
  };

  /**
   * Copia de seguridad de lo seguido y lo visto.
   *
   * Todo vive en el almacen local del navegador, que desaparece al desinstalar
   * la extension, al cambiar de perfil o al moverla de carpeta (sin empaquetar,
   * Chrome la identifica por su ruta). Con un archivo aparte se recupera.
   */
  /*
   * Exportar a CSV.
   *
   * Descargar la informacion de un anuncio de uno en uno sirve para
   * revisarlo, pero para analizar un nicho entero hace falta una tabla: cuya
   * fila sea un anuncio y cuyas columnas se puedan ordenar y filtrar en
   * Excel o Google Sheets.
   */
  const CSV_COLUMNAS = [
    ["Anunciante", (a) => a.paginaNombre || ""],
    ["Dias activo", (a) => diasActivo(a) ?? ""],
    ["Copias", (a) => a.copias || 1],
    ["Activo", (a) => (a.activo ? "si" : "no")],
    ["Formato", (a) => a.formato || ""],
    ["Plataformas", (a) => (a.plataformas || []).join(" ")],
    ["Llamado a la accion", (a) => a.ctaTexto || ""],
    ["Dominio", (a) => dominioDe(a.linkUrl) || ""],
    ["WhatsApp", (a) => (a.destinoWhatsapp || a.ctaEsWhatsapp ? "si" : a.mensajeriaAWhatsapp ? "posible" : "no")],
    ["Nota", (a) => puntuacion(a)],
    ["Seguidores pagina", (a) => a.seguidoresPagina ?? ""],
    ["Categoria", (a) => a.categoriaPagina || ""],
    ["Identificador", (a) => a.id],
    ["URL biblioteca", (a) => bibliotecaUrl(a.id)],
  ];

  // Una celda con coma, comilla o salto de linea necesita ir entre comillas,
  // duplicando las comillas que ya tuviera dentro.
  const celdaCsv = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const exportarCsv = (lista, nombreArchivo) => {
    if (!lista.length) return aviso("No hay anuncios que exportar", true);
    const filas = [CSV_COLUMNAS.map(([titulo]) => titulo).join(",")];
    for (const a of lista) {
      filas.push(CSV_COLUMNAS.map(([, fn]) => celdaCsv(fn(a))).join(","));
    }
    // BOM al principio: sin el, Excel abre los acentos como simbolos sueltos.
    const blob = new Blob(["﻿" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = el("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    aviso(lista.length + " anuncios exportados");
  };

  const configExportar = () => {
    const c = el("div");
    const total = anuncios.size;
    const visibles = contadores.visibles || total;

    c.appendChild(
      el(
        "p",
        "was-vacio",
        "Se exporta lo que la extension ya cargo en esta pestaña: <b>" + total +
          "</b> anuncios en total, de los cuales <b>" + visibles + "</b> pasan el filtro actual."
      )
    );

    const todos = el("button", "was-primario", "EXPORTAR TODOS (" + total + ")");
    todos.addEventListener("click", () => {
      exportarCsv([...anuncios.values()], "wa-ads-spy-todos-" + new Date().toISOString().slice(0, 10) + ".csv");
    });
    c.appendChild(todos);

    const filtrados = el("button", "was-enlace", "Exportar solo los que pasan el filtro (" + visibles + ")");
    filtrados.addEventListener("click", () => {
      exportarCsv(
        [...anuncios.values()].filter(pasaFiltro),
        "wa-ads-spy-filtrados-" + new Date().toISOString().slice(0, 10) + ".csv"
      );
    });
    c.appendChild(filtrados);

    modal("Exportar a CSV", c);
  };

  const configCopia = () => {
    const c = el("div");

    const cuantos = Object.keys(guardados).length;
    c.appendChild(
      el(
        "p",
        "was-vacio",
        "Ahora mismo sigues <b>" + cuantos + "</b> anuncios y llevas <b>" +
          vistos.size + "</b> marcados como vistos."
      )
    );

    // Que se lleva la copia: cada parte por separado, porque no siempre se
    // quiere mover la configuracion junto con los anuncios.
    const marcaSeguidos = el("input");
    marcaSeguidos.type = "checkbox";
    marcaSeguidos.checked = true;
    const filaSeguidos = el("label", "was-elegible");
    filaSeguidos.append(marcaSeguidos, el("span", null, "Anuncios seguidos y vistos"));

    const marcaAjustes = el("input");
    marcaAjustes.type = "checkbox";
    marcaAjustes.checked = true;
    const filaAjustes = el("label", "was-elegible");
    filaAjustes.append(marcaAjustes, el("span", null, "Configuracion (filtros, colores, posiciones)"));

    c.append(filaSeguidos, filaAjustes);

    const exportar = el("button", "was-primario", "EXPORTAR COPIA");
    exportar.addEventListener("click", async () => {
      if (!marcaSeguidos.checked && !marcaAjustes.checked) {
        return aviso("Marca al menos una de las dos cosas", true);
      }

      const copia = {
        formato: "wa-ads-spy",
        version: 1,
        fecha: new Date().toISOString(),
      };

      if (marcaSeguidos.checked) {
        copia.guardados = guardados;
        copia.vistos = [...vistos];
      }

      if (marcaAjustes.checked) {
        copia.prefs = prefs;
        // Las posiciones de los flotantes viven fuera de `prefs`.
        copia.posiciones = await new Promise((listo) =>
          chrome.storage.local.get(["was-pos-panel", "was-pos-rapida"], listo)
        );
      }
      const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const enlace = el("a");
      enlace.href = url;
      enlace.download = "wa-ads-spy-" + new Date().toISOString().slice(0, 10) + ".json";
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      aviso("Copia guardada en tus descargas");
    });
    c.appendChild(exportar);

    const archivo = el("input");
    archivo.type = "file";
    archivo.accept = "application/json,.json";
    archivo.style.display = "none";

    archivo.addEventListener("change", () => {
      const f = archivo.files?.[0];
      if (!f) return;

      const lector = new FileReader();
      lector.onload = () => {
        let datos;
        try {
          datos = JSON.parse(String(lector.result));
        } catch {
          return aviso("El archivo no es una copia valida", true);
        }
        if (datos.formato !== "wa-ads-spy") {
          return aviso("El archivo no es una copia de Vyxen", true);
        }

        // Se importa lo que traiga el archivo: si solo lleva anuncios, se
        // dejan los ajustes como estan, y al reves.
        const hecho = [];

        if (datos.guardados || datos.vistos) {
          // Fusion, no reemplazo: de cada anuncio repetido nos quedamos con el
          // historial mas largo, que es el que mas informacion tiene.
          let nuevos = 0;
          for (const [id, ficha] of Object.entries(datos.guardados || {})) {
            const actual = guardados[id];
            if (!actual) nuevos++;
            if (!actual || (ficha.puntos?.length || 0) > (actual.puntos?.length || 0)) {
              guardados[id] = ficha;
            }
          }
          for (const id of datos.vistos || []) vistos.add(id);

          guardarGuardados();
          guardarVistos();
          refrescarTodo();
          hecho.push(nuevos + " anuncios nuevos");
        }

        if (datos.prefs) {
          prefs = { ...PREFS_DEF, ...datos.prefs, version: VERSION_PREFS };
          guardarPrefs();
          if (datos.posiciones) guardarLocal(datos.posiciones);
          hecho.push("configuracion");
        }

        if (!hecho.length) return aviso("La copia no traia nada que importar", true);

        aviso("Importado: " + hecho.join(" y "));

        // Los ajustes tocan todos los mandos a la vez; se recarga para que la
        // pagina quede coherente en vez de repintar pieza por pieza.
        if (datos.prefs) setTimeout(() => location.reload(), 1400);
      };
      lector.readAsText(f);
      archivo.value = "";
    });

    const importar = el("button", "was-secundario", "IMPORTAR COPIA");
    importar.addEventListener("click", () => archivo.click());
    c.append(importar, archivo);

    c.appendChild(
      el(
        "p",
        "was-vacio",
        "Al importar se detecta lo que trae el archivo y se suma a lo que ya " +
          "tienes, sin reemplazarlo.<br><br>" +
          "Exporta de vez en cuando: si desinstalas la extension, borras los datos " +
          "del navegador o cambias de equipo, el archivo es la unica forma de " +
          "recuperar lo que sigues."
      )
    );

    modal("Copia de seguridad", c);
  };

  const configApariencia = () => {
    const c = el("div");

    /*
     * Muestra y campo de texto en hexadecimal.
     *
     * El cuadro de color de Chrome enseña R, G y B por separado y no se puede
     * cambiar, asi que al lado va el codigo completo: se copia y se pega de una
     * pieza, que es como se comparten los colores.
     */
    const fila = el("div", "was-fila");
    const color = el("input", "was-color");
    color.type = "color";
    color.value = prefs.colorBorde;

    const hex = el("input", "was-hex");
    hex.type = "text";
    hex.value = prefs.colorBorde.toUpperCase();
    hex.spellcheck = false;
    hex.setAttribute("aria-label", "Color en hexadecimal");

    const fijarColor = (valor, desdeTexto) => {
      const limpio = valor.trim().replace(/^#?/, "#").toLowerCase();
      if (!/^#[\da-f]{6}$/.test(limpio)) return;

      prefs.colorBorde = limpio;
      color.value = limpio;
      if (!desdeTexto) hex.value = limpio.toUpperCase();
      guardarPrefs();
      aplicarApariencia();
    };

    color.addEventListener("input", (e) => fijarColor(e.target.value, false));
    hex.addEventListener("input", (e) => fijarColor(e.target.value, true));

    // Al salir del campo se recompone lo escrito, aunque fuera incompleto.
    hex.addEventListener("blur", () => {
      hex.value = prefs.colorBorde.toUpperCase();
    });
    hex.addEventListener("focus", () => hex.select());

    fila.append(color, hex);
    c.appendChild(control("Color del borde de la tarjeta", fila));

    const cont = el("div", "was-fila");
    const rango = el("input");
    rango.type = "range";
    rango.min = 11;
    rango.max = 28;
    rango.value = prefs.tamCopias;
    const num = el("input", "was-num");
    num.type = "number";
    num.min = 11;
    num.max = 28;
    num.value = prefs.tamCopias;

    const fijar = (v) => {
      prefs.tamCopias = Math.min(28, Math.max(11, Number(v) || 16));
      rango.value = prefs.tamCopias;
      num.value = prefs.tamCopias;
      guardarPrefs();
      aplicarApariencia();
    };
    rango.addEventListener("input", (e) => fijar(e.target.value));
    num.addEventListener("input", (e) => fijar(e.target.value));

    cont.append(rango, num, el("span", "was-unidad", "px"));
    c.appendChild(control('Tamaño del texto "N anuncios"', cont));

    const restaurar = el("button", "was-enlace", "Restaurar valores por defecto");
    restaurar.addEventListener("click", () => {
      fijarColor(PREFS_DEF.colorBorde, false);
      fijar(PREFS_DEF.tamCopias);
    });
    c.appendChild(restaurar);

    modal("Apariencia", c);
  };

  const configBusqueda = () => {
    const c = el("div");

    const min = el("input", "was-num");
    min.type = "number";
    min.min = 1;
    min.value = prefs.detenerMin;
    min.addEventListener("input", (e) => {
      prefs.detenerMin = Number(e.target.value) || 5;
      guardarPrefs();
    });
    c.appendChild(control("Detener automaticamente (minutos)", min));

    const seg = el("input", "was-num");
    seg.type = "number";
    seg.min = 1;
    seg.value = prefs.intervaloSeg;
    seg.addEventListener("input", (e) => {
      prefs.intervaloSeg = Number(e.target.value) || 15;
      guardarPrefs();
      if (auto.timer) {
        detenerBusqueda();
        iniciarBusqueda();
      }
    });
    c.appendChild(control("Intervalo de desplazamiento (segundos)", seg));

    const tope = el("input", "was-num");
    tope.type = "number";
    tope.min = 50;
    tope.step = 50;
    tope.value = prefs.maxAnuncios;
    tope.addEventListener("input", (e) => {
      prefs.maxAnuncios = Math.max(50, Number(e.target.value) || 600);
      avisadoTope = false;
      guardarPrefs();
    });
    c.appendChild(control("Maximo de anuncios en memoria", tope));

    const nota = el(
      "div",
      "was-ayuda",
      "Pasados unos cientos de anuncios la Biblioteca se vuelve muy pesada: el " +
        "tope corta la carga para que el navegador no se atasque. Al llegar, filtra " +
        "o recarga la pagina."
    );
    c.appendChild(nota);

    c.appendChild(interruptor("Carga acelerada", "cargaAcelerada"));
    c.appendChild(interruptor("Notificacion", "notificar"));

    c.appendChild(interruptor('Mantener siempre "Todos los anuncios"', "forzarTodosAnuncios"));
    c.appendChild(
      el(
        "div",
        "was-ayuda",
        'Si el desplegable "Tipo de anuncio" cambia a Temas sociales, elecciones ' +
          "o politica (a proposito o sin querer), se vuelve a poner solo en Todos " +
          "los anuncios."
      )
    );

    const porPestana = interruptor("Ajustes propios de esta pestaña", "configPorPestana");
    c.appendChild(porPestana);
    c.appendChild(
      el(
        "div",
        "was-ayuda",
        "Activado, los filtros y ajustes de esta pestaña no afectan a las demas. " +
          "Desactivado, la configuracion es la misma en todas."
      )
    );

    modal("Configuracion de busqueda", c);
  };

  const crearPanel = () => {
    panel = el("div", "was-panel-flotante");

    const cab = el("div", "was-cab");
    cab.innerHTML =
      '<span class="was-marca"><img class="was-marca-logo" alt="" draggable="false" src="' +
      chrome.runtime.getURL("icons/vyxen-128.png") +
      '"><span class="was-marca-texto"><b>VYXEN</b>' +
      '<i><s></s>&#10022; V Y X E N &#10022;<s></s></i></span></span>';

    // Recogido es un circulo con la lupa; desplegado, la cabecera del panel.
    const plegar = el("button", "was-plegar");
    const pintarPlegar = () => {
      const cerrado = panel.classList.contains("was-plegado");
      // Recogido apunta a la izquierda ("sale de aqui"); desplegado, a la
      // derecha ("vuelve a su sitio"). Con la lupa se confundia con el
      // buscador de Meta, que esta justo al lado.
      plegar.innerHTML = cerrado
        ? '<img class="was-plegar-logo" alt="Vyxen" draggable="false" src="' + chrome.runtime.getURL("icons/vyxen-128.png") + '">'
        : ICONOS.flechaDer;
      plegar.title = cerrado ? "Abrir Vyxen" : "Recoger el panel";
      panel.title = cerrado ? "Vyxen — clic para abrir" : "";
    };
    plegar.addEventListener("click", () => {
      crecerHaciaLaIzquierda(panel, "was-pos-panel", () => {
        prefs.plegado = panel.classList.toggle("was-plegado");
        pintarPlegar();
        guardarPrefs();
      });
      mantenerEnPantalla(panel, "was-pos-panel");
    });
    cab.appendChild(plegar);
    panel.appendChild(cab);

    if (prefs.plegado) panel.classList.add("was-plegado");
    pintarPlegar();

    const cuerpo = el("div", "was-cuerpo");
    cuerpo.appendChild(deslizador("Cantidad de anuncios", "anuncios", "minAnuncios", 100));
    cuerpo.appendChild(deslizador("Tiempo de actividad", "dias", "minDias", 100));

    const bFiltro = el(
      "button",
      "was-enlace",
      ICONOS.ajustes + "<span>Configuracion de filtro</span>"
    );
    bFiltro.addEventListener("click", configFiltro);
    cuerpo.appendChild(bFiltro);

    cuerpo.appendChild(
      interruptor("Busqueda automatica", "autoBusqueda", () => {
        prefs.autoBusqueda ? iniciarBusqueda() : detenerBusqueda();
      })
    );

    const bBusq = el(
      "button",
      "was-enlace",
      ICONOS.ajustes + "<span>Configuracion de busqueda</span>"
    );
    bBusq.addEventListener("click", configBusqueda);
    cuerpo.appendChild(bBusq);

    const bSug = el(
      "button",
      "was-enlace",
      ICONOS.chispa + "<span>Sugerencias de busqueda</span>"
    );
    bSug.addEventListener("click", configSugerencias);
    cuerpo.appendChild(bSug);

    const bApar = el("button", "was-enlace", ICONOS.paleta + "<span>Apariencia</span>");
    bApar.addEventListener("click", configApariencia);
    cuerpo.appendChild(bApar);

    const bGuardados = el(
      "button",
      "was-enlace",
      ICONOS.estrella + "<span>Anuncios guardados</span>"
    );
    // Va directo a la vista dentro de la Biblioteca: un cuadro intermedio con
    // la misma lista, pero mas pequeña, no aportaba nada. Se abre en una
    // pestaña nueva para no perder donde estabas buscando.
    bGuardados.addEventListener("click", () => {
      if (enModoMural()) abrirMural();
      else abrir(urlMural());
    });
    cuerpo.appendChild(bGuardados);

    const bCopia = el("button", "was-enlace", ICONOS.copia + "<span>Copia de seguridad</span>");
    bCopia.addEventListener("click", configCopia);
    cuerpo.appendChild(bCopia);

    const bExportar = el("button", "was-enlace", ICONOS.ficha + "<span>Exportar a CSV</span>");
    bExportar.addEventListener("click", configExportar);
    cuerpo.appendChild(bExportar);

    const resumenFiltro = el("div", "was-resumen");
    resumenFiltro.id = "was-resumen";
    cuerpo.appendChild(resumenFiltro);

    const buscar = el("button", "was-primario was-buscar", "BUSCAR");
    buscar.addEventListener("click", () => {
      prefs.autoBusqueda = !auto.timer;
      alternarBusqueda();
    });
    cuerpo.appendChild(buscar);

    panel.appendChild(cuerpo);
    document.body.appendChild(panel);

    arrastrable(panel, cab, "was-pos-panel");
    actualizarPanel();
  };

  const actualizarPanel = () => {
    if (!panel) return;
    const b = panel.querySelector(".was-buscar");
    if (b) b.textContent = auto.timer ? "DETENER" : "BUSCAR";
    const r = panel.querySelector("#was-resumen");
    if (r) {
      r.textContent = contadores.total
        ? contadores.visibles + " de " + contadores.total + " anuncios analizados"
        : "No hay anuncios analizados";
    }
  };

  /** Deja arrastrar un elemento por su cabecera y recuerda donde quedo. */
  const arrastrable = (nodo, asa, claveGuardado) => {
    let ox = 0;
    let oy = 0;
    let pulsado = false;
    let movido = false;

    /*
     * Se puede empezar a arrastrar tambien desde los botones: recogidos, el
     * unico sitio agarrable ES un boton, y antes quedaban clavados en el sitio.
     * Distinguimos por distancia: hasta 4px es un clic; a partir de ahi, se
     * arrastra y el clic se anula.
     */
    asa.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      pulsado = true;
      movido = false;
      const caja = nodo.getBoundingClientRect();
      ox = e.clientX - caja.left;
      oy = e.clientY - caja.top;
    });

    document.addEventListener("mousemove", (e) => {
      if (!pulsado) return;
      const caja = nodo.getBoundingClientRect();
      if (!movido) {
        if (Math.abs(e.clientX - caja.left - ox) < 4 && Math.abs(e.clientY - caja.top - oy) < 4) {
          return;
        }
        movido = true;
      }
      const x = Math.max(0, Math.min(window.innerWidth - caja.width, e.clientX - ox));
      const y = Math.max(0, Math.min(window.innerHeight - caja.height, e.clientY - oy));
      nodo.style.left = x + "px";
      nodo.style.top = y + "px";
      nodo.style.right = "auto";
      nodo.style.bottom = "auto";
      e.preventDefault();
    });

    document.addEventListener("mouseup", () => {
      if (!pulsado) return;
      pulsado = false;
      if (!movido) return;
      guardarLocal({
        [claveGuardado]: { left: nodo.style.left, top: nodo.style.top },
      });
    });

    // Tras arrastrar, el "click" del final no debe activar el boton.
    asa.addEventListener(
      "click",
      (e) => {
        if (movido) {
          e.stopPropagation();
          e.preventDefault();
          movido = false;
        }
      },
      true
    );

    // Solo restauramos la posicion si sigue cayendo dentro de la ventana: con
    // una pantalla mas pequeña que la de la ultima sesion, el panel aparecia
    // fuera de vista y parecia que la extension no cargaba.
    chrome.storage.local.get(claveGuardado, (d) => {
      const p = d[claveGuardado];
      if (!p || !p.left) return;

      const x = parseInt(p.left, 10);
      const y = parseInt(p.top, 10);
      const cabe =
        Number.isFinite(x) && Number.isFinite(y) &&
        x >= 0 && y >= 0 &&
        x < window.innerWidth - 60 && y < window.innerHeight - 40;

      if (!cabe) return chrome.storage.local.remove(claveGuardado);

      nodo.style.left = p.left;
      nodo.style.top = p.top;
      nodo.style.right = "auto";
      nodo.style.bottom = "auto";
    });
  };

  // =========================================================================
  // bandeja rapida
  // =========================================================================

  const crearBandejaRapida = () => {
    bandejaRapida = el("div", "was-rapida");

    // Recogida es un solo circulo; al abrirla aparecen los tres controles.
    const alternar = el("button", "was-redondo was-alternar-rapida");
    const pintarAlternar = () => {
      const cerrada = bandejaRapida.classList.contains("was-plegada");
      // Recogida enseña el recuento: de un vistazo sabes cuantos anuncios
      // pasan el filtro, y de paso no se confunde con el circulo del panel.
      alternar.innerHTML = cerrada
        ? '<span id="was-badge-mini">' + contadores.visibles + "/" + contadores.total + "</span>"
        : ICONOS.flechaDer;
      alternar.classList.toggle("was-mini-contador", cerrada);
      alternar.title = cerrada
        ? contadores.visibles + " de " + contadores.total + " anuncios — clic para abrir"
        : "Recoger";
    };
    bandejaRapida._wasPintar = pintarAlternar;
    alternar.addEventListener("click", (e) => {
      e.stopPropagation();
      crecerHaciaLaIzquierda(bandejaRapida, "was-pos-rapida", () => {
        prefs.rapidaPlegada = bandejaRapida.classList.toggle("was-plegada");
        pintarAlternar();
        guardarPrefs();
      });
    });

    /*
     * Boton de descarga multiple: a la izquierda de todo lo demas (primero
     * en el orden de insercion; la bandeja esta anclada por la derecha, asi
     * que el primer hijo cae mas a la izquierda). Solo se ve mientras el
     * modo esta activo y hay al menos un anuncio marcado — el resto del
     * tiempo esta ahi pero oculto, para no reservar espacio de mas.
     */
    const descargaMultiBtn = el("button", "was-redondo was-descarga-multi", ICONOS.guardar);
    descargaMultiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      descargarMultiple();
    });

    const ojo = el("button", "was-redondo");
    const pintarOjo = () => {
      ojo.innerHTML = prefs.ocultarFiltrados ? ICONOS.ojoNo : ICONOS.ojo;
      ojo.title = prefs.ocultarFiltrados
        ? "Mostrar anuncios filtrados"
        : "Ocultar anuncios filtrados";
      ojo.classList.toggle("was-apagado", prefs.ocultarFiltrados);
    };
    pintarOjo();
    ojo.addEventListener("click", () => {
      prefs.ocultarFiltrados = !prefs.ocultarFiltrados;
      pintarOjo();
      guardarPrefs();
      aplicarFiltros();
    });

    const contador = el("button", "was-redondo was-contador");
    contador.title = "Anuncios que pasan el filtro";
    contador.innerHTML = '<span id="was-badge">0/0</span>';

    const arriba = el("button", "was-redondo", ICONOS.arriba);
    arriba.title = "Volver arriba";
    arriba.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    // El boton de plegar va a la derecha: la bandeja esta anclada a ese lado y
    // asi se despliega hacia la izquierda, sin saltar de sitio.
    bandejaRapida.append(descargaMultiBtn, ojo, contador, arriba, alternar);
    if (prefs.rapidaPlegada) bandejaRapida.classList.add("was-plegada");
    pintarAlternar();

    document.body.appendChild(bandejaRapida);
    arrastrable(bandejaRapida, bandejaRapida, "was-pos-rapida");
  };

  const actualizarBandejaRapida = () => {
    const b = document.getElementById("was-badge");
    if (b) b.textContent = contadores.visibles + "/" + contadores.total;

    const mini = document.getElementById("was-badge-mini");
    if (mini) mini.textContent = contadores.visibles + "/" + contadores.total;

    /*
     * El aviso de "tope alcanzado" salia una sola vez (una notificacion que
     * desaparece sola) y la Biblioteca seguia cargando anuncios por su
     * cuenta que la extension ya no decoraba, sin ninguna pista visible de
     * por que. Mientras el tope siga activo, la bandeja lo recuerda todo el
     * tiempo.
     */
    if (bandejaRapida) {
      bandejaRapida.classList.toggle("was-en-tope", avisadoTope);
      bandejaRapida.title = avisadoTope
        ? "Tope de " + prefs.maxAnuncios + " anuncios alcanzado — filtra o sube el tope en Configuracion de busqueda"
        : "";

      const btnMulti = bandejaRapida.querySelector(".was-descarga-multi");
      if (btnMulti) {
        const cuantos = multiDescarga.orden.length;
        const hay = multiDescarga.activo && cuantos > 0;
        btnMulti.classList.toggle("was-oculto", !hay);
        btnMulti.innerHTML = hay ? ICONOS.guardar + '<span class="was-descarga-multi-num">' + cuantos + "</span>" : "";
        btnMulti.title = "Descargar " + cuantos + " anuncio" + (cuantos === 1 ? "" : "s") + " seleccionado" + (cuantos === 1 ? "" : "s");
      }
    }

    actualizarPanel();
  };

  // =========================================================================
  // arranque
  // =========================================================================

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.canal !== CANAL) return;
    if (e.data.tipo !== "anuncios") return;

    for (const a of e.data.anuncios) {
      /*
       * Tope de anuncios.
       *
       * La Biblioteca no deja de pedir lotes mientras haya scroll, y ni ella
       * ni nosotros soltamos lo ya cargado. Pasados unos cientos, cada
       * repintado recorre una pagina enorme y el navegador acaba
       * recargandose solo. Al llegar al tope dejamos de admitir anuncios
       * nuevos y paramos la busqueda automatica; los ya cargados se pueden
       * seguir usando con normalidad.
       */
      if (!anuncios.has(a.id) && anuncios.size >= prefs.maxAnuncios) {
        if (!avisadoTope) {
          avisadoTope = true;
          detenerBusqueda();
          aviso("Tope de " + prefs.maxAnuncios + " anuncios: filtra o recarga la pagina", true);
        }
        continue;
      }

      if (guardados[a.id]) anotarMedida(a);
      const previo = anuncios.get(a.id);
      if (previo) {
        /*
         * El cuadro "Datos resumidos" vuelve a enviar el mismo anuncio, pero
         * desglosado: ahi cada version dice tener una sola copia. Si dejamos
         * que ese dato pise al de la grilla, un anuncio con "3 anuncios" pasa
         * a contar como 1 y el filtro lo esconde, aunque la tarjeta siga
         * diciendo 3. Nos quedamos siempre con el recuento mas alto.
         */
        a.copias = Math.max(previo.copias || 1, a.copias || 1);
      }
      anuncios.set(a.id, a);
    }
    recalcularCopiones();
    pintarCompletoPronto();
  });

  /**
   * Vuelve a decorar la grilla desde cero.
   *
   * Hace falta al cerrar el cuadro "Datos resumidos": Meta reaprovecha los
   * nodos de las tarjetas para pintar el cuadro, asi que al volver quedan
   * emparejadas con el anuncio equivocado y el filtro las escondia todas.
   * Soltamos las marcas y se rehace el emparejado con los datos buenos.
   */
  const refrescarTodo = () => {
    document.querySelectorAll("[data-was-id]").forEach((t) => {
      delete t.dataset.wasId;
      t.classList.remove("was-filtrado", "was-oculto", "was-escalando", "was-tarjeta");
    });
    // was-inactivo y was-resalte no siempre viven en la propia tarjeta (van
    // en el elemento que envuelve el texto que las disparo), asi que se
    // limpian aparte para no dejar marcas sueltas de un anuncio que ya no
    // esta emparejado con ese nodo.
    document.querySelectorAll(".was-inactivo, .was-resalte").forEach((n) => {
      n.classList.remove("was-inactivo", "was-resalte");
    });
    document.querySelectorAll(".was-barra").forEach((b) => b.remove());
    anclas.clear();
    pintar();
  };

  let habiaDetalle = false;
  let avisadoTope = false;

  /*
   * Vacia lo acumulado cuando el usuario hace una busqueda de verdad
   * distinta, sin recargar la pagina.
   *
   * `anuncios` solo crecia: al cambiar de busqueda desde el propio buscador
   * de la Biblioteca, los anuncios de la busqueda anterior se quedaban
   * dentro, contando para el tope de 600 y arrastrando su recuento de copias
   * (que siempre se queda con el mas alto visto, a proposito, para no dejar
   * que el cuadro de resumen lo rebaje — pero eso solo tiene sentido DENTRO
   * de una misma busqueda). Se detecta comparando los parametros que de
   * verdad cambian la busqueda (palabra clave, anunciante, pais, tipo);
   * `sort_data` se ignora porque Meta reescribe la URL solo con eso cada vez
   * que se reordena, sin que el usuario haya buscado nada distinto.
   */
  const claveDeBusqueda = () => {
    const p = new URLSearchParams(location.search);
    return ["q", "view_all_page_id", "country", "search_type", "media_type", "active_status"]
      .map((k) => k + "=" + (p.get(k) || ""))
      .join("&");
  };

  let ultimaClaveBusqueda = claveDeBusqueda();

  /*
   * Al entrar por un enlace directo (el "Ver anuncio" de Anuncios guardados
   * abre justo asi, "?id=...&country=ALL"), Meta reescribe la URL sola unos
   * instantes despues del primer render — añade "search_type=page" y demas,
   * sin que el usuario haya buscado nada distinto. Comparar la clave desde
   * el instante cero confundia esa reescritura propia de Meta con una
   * busqueda nueva, y vaciaba `anuncios` justo cuando las tarjetas que ya
   * estaban en pantalla dependian de esos datos — el HTML inicial solo se
   * lee UNA vez, asi que una tarjeta que perdia su dato ahi no lo recuperaba
   * solo, y se quedaba sin decorar hasta recargar la pagina de verdad.
   *
   * La base de comparacion se toma varios segundos despues de arrancar, ya
   * con la URL asentada, para no confundir la reescritura de Meta con un
   * cambio real. Un cambio de busqueda genuino (escribir algo nuevo, entrar
   * a otro anunciante) tarda muchisimo mas que eso en pasar.
   */
  const vigilarCambioDeBusqueda = () => {
    setTimeout(() => {
      ultimaClaveBusqueda = claveDeBusqueda();
      setInterval(() => {
        const clave = claveDeBusqueda();
        if (clave === ultimaClaveBusqueda) return;
        ultimaClaveBusqueda = clave;

        anuncios.clear();
        copiones.clear();
        avisadoTope = false;
        refrescarTodo();
      }, 1200);
    }, 4000);
  };

  /*
   * Repaso completo del documento, como mucho una vez cada segundo y medio.
   *
   * Los datos de un anuncio y su tarjeta no llegan a la vez: a veces el JSON
   * se adelanta al HTML. Por eso hace falta un repaso completo de vez en
   * cuando, ademas del incremental del observador. Lo que no puede es correr
   * con cada lote que baja, que es lo que arrastraba la pagina.
   */
  let repasoPedido = false;

  const pintarCompletoPronto = () => {
    if (repasoPedido) return;
    repasoPedido = true;
    setTimeout(() => {
      repasoPedido = false;
      pintar();
    }, 1500);
  };

  // Trozos de pagina que Meta acaba de insertar y que aun no hemos mirado.
  let pendientes = new Set();

  const observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      for (const n of c.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.closest && n.closest(".was-panel-flotante, .was-rapida, .was-modal-fondo")) continue;
        pendientes.add(n);
      }

      // React puede rehacer el contenido de una tarjeta sin tocar la tarjeta
      // en si: nuestra barra desaparece con el, pero el dataset.wasId sigue
      // ahi diciendo (con razon equivocada) que ya esta decorada. Si lo que
      // se quita es una barra nuestra, se manda su tarjeta a re-decorar.
      for (const n of c.removedNodes) {
        if (n.nodeType !== 1) continue;
        const barra = n.classList?.contains("was-barra") ? n : n.querySelector?.(".was-barra");
        if (barra) {
          const tarjeta = anclas.get(barra);
          anclas.delete(barra);
          if (tarjeta && tarjeta.isConnected) pendientes.add(tarjeta);
        }

        // El ResizeObserver que reajusta el halo (ver mas abajo) no suelta
        // solo una tarjeta que ya no esta: sin esto se queda observando
        // nodos muertos para siempre en una sesion larga. Se deja de vigilar
        // tanto el propio nodo quitado como cualquier tarjeta dentro de el.
        const tarjetasIdas = n.dataset?.wasId ? [n] : [...(n.querySelectorAll?.("[data-was-id]") || [])];
        for (const t of tarjetasIdas) observadorTamano.unobserve(t);
      }
    }

    clearTimeout(observador._t);
    observador._t = setTimeout(() => {
      // Al cerrar el cuadro de detalle rehacemos la grilla entera: Meta deja
      // sus nodos en el documento y conviene reemparejar sin arrastrar restos.
      const hayDetalle = !!document.querySelector('[role="dialog"] [data-was-id]:not(.was-oculto)');
      const seCerro = habiaDetalle && !hayDetalle;
      habiaDetalle = hayDetalle;

      const trozos = [...pendientes];
      pendientes = new Set();

      if (seCerro) refrescarTodo();
      else if (trozos.length) pintar(trozos);
      else colocarBarras(); // nada nuevo que decorar: basta recolocar
    }, 350);
  });

  const arrancar = async () => {
    await cargarMemoria();
    chrome.storage.local.get(["prefs", "configPorPestana"], (d) => {
      let guardadas = d.prefs || {};

      // Si esta pestaña lleva ajustes propios, mandan los suyos sobre los
      // comunes. Se guardan en sessionStorage, que muere con la pestaña.
      if (d.configPorPestana) {
        try {
          const propias = JSON.parse(sessionStorage.getItem("was-prefs") || "null");
          if (propias) guardadas = propias;
        } catch (e) {}
      }

      prefs = { ...PREFS_DEF, ...guardadas };
      prefs.configPorPestana = !!d.configPorPestana;

      // La version hay que mirarla en lo guardado, no en el objeto ya
      // fusionado: ahi PREFS_DEF habria puesto la version nueva y la
      // actualizacion no llegaria a ejecutarse nunca.
      if (guardadas.version !== VERSION_PREFS) {
        for (const clave of RENOVAR) prefs[clave] = PREFS_DEF[clave];
        prefs.version = VERSION_PREFS;
        guardarPrefs();
      }

      prefs.autoBusqueda = false; // nunca arranca sola al abrir la pagina
      aplicarApariencia();
      crearPanel();
      crearBandejaRapida();
      if (enModoMural()) setTimeout(abrirMural, 800);
      observador.observe(document.body, { childList: true, subtree: true });
      vigilarCambioDeBusqueda();
      configurarBuscadorInicial().finally(vigilarCategoriaSinElegir);
      pintar();
    });
  };

  if (document.body) arrancar();
  else document.addEventListener("DOMContentLoaded", arrancar, { once: true });

  chrome.runtime.onMessage.addListener((msg, _o, responder) => {
    if (msg.tipo === "estado") {
      responder({
        anuncios: anuncios.size,
        whatsapp: [...anuncios.values()].filter((a) => a.destinoWhatsapp).length,
        visibles: contadores.visibles,
        corriendo: !!auto.timer,
      });
    }
    if (msg.tipo === "autoScroll") {
      alternarBusqueda();
      responder({ corriendo: !!auto.timer });
    }
    return true;
  });
})();
