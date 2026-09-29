/*⁠​‌​‌​‌‌​​‌‌‌‌​​‌​‌‌‌‌​​​​‌‌​​‌​‌​‌‌​‌‌‌​​​‌​​​​​​​‌​‌​​​​‌‌​​​‌‌​​‌​‌​​‌​​‌​​​​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​‌​​​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​‌‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​​‌‌​‌‌​‌​​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌​‌‌​​‌‌​​​​‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​​​​​‌‌‌​​‌​​‌‌​‌‌‌‌​‌‌​‌​​​​‌‌​‌​​‌​‌‌​​​‌​​‌‌​‌​​‌​‌‌​​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​‌​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌​​‌‌​​‌‌​‌​​‌​‌‌​​​‌‌​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​‌‌​​​​‌​​​​​​‌‌​​​‌‌​‌‌​‌‌‌‌​‌‌‌​​​​​‌‌​‌​​‌​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌‌​​‌‌​‌‌‌​‌​​​‌‌‌​​‌​​‌‌​‌​​‌​‌‌​​​‌​​‌‌‌​‌​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌‌​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌‌​‌​​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​​‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​⁠*/
/**
 * Service worker: resuelve el numero de WhatsApp de un anunciante.
 *
 * El numero no esta en el anuncio. Se comprobo leyendo el JSON crudo de una
 * busqueda entera: no hay un solo campo de telefono en ninguna parte, ni
 * siquiera en los anuncios cuyo boton lleva a WhatsApp — Meta lo resuelve en
 * el momento del clic. Asi que hay que buscarlo fuera, en cascada:
 *
 *   1. La propia Pagina del anunciante, renderizada de verdad. Un fetch
 *      plano no vale: devuelve medio megabyte de cascaron de React sin
 *      rellenar (probado con cuatro anunciantes y tres rutas distintas, cero
 *      telefonos en los doce casos). Por eso se abre en una pestaña de fondo
 *      que nunca roba el foco, se lee y se cierra.
 *   2. Una publicacion organica del mismo anunciante, encontrada buscando el
 *      texto del anuncio en un buscador publico (Bing primero, DuckDuckGo
 *      Lite de respaldo si el primero no encuentra nada). Muchos prueban el
 *      copy sin pagar antes de convertirlo en anuncio, y ahi suelen escribir
 *      el WhatsApp a mano.
 *   3. El Instagram del anunciante, si el anuncio lo declara: la biografia de
 *      un negocio suele llevar el mismo enlace de WhatsApp que la Pagina.
 *   4. La pagina de destino del anuncio (su landing). Es la que mas
 *      encontraria de todas — es donde el anunciante *quiere* que le
 *      escriban — pero pide leer cualquier sitio web, asi que solo se
 *      intenta si el usuario dio ese permiso a proposito desde el popup de
 *      la extension. Sin el permiso, este paso simplemente se salta y el
 *      resto de la cascada sigue igual.
 *
 * Antes habia un paso intermedio que pedia /<pagina>/about por fetch
 * buscando "whatsapp_number". Se quito: ese HTML es el mismo cascaron vacio,
 * asi que no encontro nunca nada y solo sumaba espera.
 */

/*
 * Las formas en que puede estar escrito un numero de WhatsApp.
 *
 * Antes solo se buscaba "send?phone=", y eso costaba numeros de verdad: en
 * la pagina de un anunciante real el numero estaba a la vista escrito como
 * "wa.me/573171437575" y se ignoraba por no encajar en ese unico patron.
 * Los dos formatos son igual de comunes.
 *
 * Se admiten tambien las variantes con %2F / %3D y con barra escapada,
 * porque el enlace suele viajar codificado dentro de otro enlace (los
 * redirectores de Facebook) o dentro de una cadena JSON.
 */
const PATRONES_WA = [
  // El "+" del numero puede venir tal cual o codificado una o dos veces
  // (%2B, %252B): el boton "WhatsApp" de la pagina del anunciante va envuelto
  // en el redirector l.facebook.com y ahi llega doblemente codificado.
  /wa\.me(?:%2F|\\?\/)(?:\+|%2B|%252B)?(\d{8,20})/i,
  /(?:api|web)\.whatsapp\.com[^"'\s\\]{0,200}?phone(?:%3D|%253D|=)(?:\+|%2B|%252B)?(\d{8,20})/i,
  /whatsapp:(?:\/\/|%2F%2F)send[^"'\s\\]{0,120}?phone(?:%3D|=)(?:\+|%2B|%252B)?(\d{8,20})/i,
  /send(?:%3F|%253F|\?)phone(?:%3D|%253D|=)(?:\+|%2B|%252B)?(\d{8,20})/i,
];

// Para poder inyectarlos en la pestaña: una funcion que viaja a otro
// contexto no puede llevarse consigo las variables de fuera, pero si
// recibir cadenas por argumento.
const FUENTES_WA = PATRONES_WA.map((r) => r.source);

const numeroWhatsappEn = (texto) => {
  for (const re of PATRONES_WA) {
    const m = (texto || "").match(re);
    if (m) return m[1];
  }
  return null;
};

const ESPERA_MAX_MS = 15000;

/**
 * Se ejecuta dentro de la pestaña del anunciante.
 *
 * Mira el HTML nada mas cargar, antes de tocar nada: en las dos paginas
 * reales donde se midio, el numero ya estaba desde el primer vistazo, y
 * bajar seis veces por la pagina no añadio ni un caracter al HTML (1.368.342
 * antes y despues). La espera larga y el scroll se quedan como segundo
 * intento, para las paginas que de verdad tarden en montar el boton.
 */
function buscarTelefono(esperaMaxMs, fuentes, prefijo) {
  return new Promise((resolve) => {
    const patrones = fuentes.map((s) => new RegExp(s, "i"));
    const limite = Date.now() + esperaMaxMs;
    const inicio = Date.now();

    /*
     * La seccion "Detalles"/"Informacion" de la pagina lista sus contactos,
     * cada uno con un icono SVG embebido: uno para WhatsApp (burbuja de chat,
     * siempre con el numero en formato internacional) y otro para telefono
     * (auricular). Comprobado en vivo: en 6 de 6 anunciantes con el enlace de
     * WhatsApp recortado en la Biblioteca, el numero estaba ahi.
     */
    const GLIFO_WA = "9.454 9.454 0 0 1 2.5 12Z";
    const RE_NUMERO = /^\+?\d[\d\s().-]{6,}\d$/;
    const aDigitos = (t) => {
      let d = t.replace(/\D/g, "");
      if (!t.trim().startsWith("+") && prefijo && !d.startsWith(prefijo) && d.length <= 10) d = prefijo + d;
      return d.length >= 9 ? d : null;
    };
    const leerInformacion = () => {
      const wa = [];
      const tel = [];
      for (const n of document.querySelectorAll("span, div")) {
        if (n.children.length > 1) continue;
        const t = (n.innerText || "").trim();
        if (!RE_NUMERO.test(t)) continue;
        let fila = n;
        for (let i = 0; i < 7 && fila; i++) {
          if (fila.querySelector("img") && fila.innerText.trim().length < 80) break;
          fila = fila.parentElement;
        }
        const src = (fila && fila.querySelector("img")?.getAttribute("src")) || "";
        if (!src.startsWith("data:image/svg")) continue;
        const d = aDigitos(t);
        if (!d) continue;
        const lista = decodeURIComponent(src).includes(GLIFO_WA) ? wa : tel;
        if (!lista.includes(d)) lista.push(d);
      }
      return { wa, tel };
    };

    const leerMensaje = (html) => {
      // El icebreaker viaja dentro del JWT del enlace, en base64url.
      const t = html.match(/[?&]token(?:%3D|=)[\w-]+\.([\w-]+)\./);
      if (!t) return null;
      try {
        const b = t[1].replace(/-/g, "+").replace(/_/g, "/");
        const carga = JSON.parse(
          decodeURIComponent(escape(atob(b + "===".slice((b.length + 3) % 4))))
        );
        return carga.icebreaker || carga.text || null;
      } catch {
        return null;
      }
    };

    // Todos los numeros de enlaces de WhatsApp de la pagina, no solo el
    // primero: cada uno se verifica despues y puede que el primero no valga.
    const buscarTodos = (html) => {
      const vistos = [];
      for (const re of patrones) {
        for (const m of html.matchAll(new RegExp(re.source, "gi"))) {
          if (!vistos.includes(m[1])) vistos.push(m[1]);
        }
      }
      return vistos;
    };

    /*
     * Devuelve la lista de candidatos, del mas fiable al menos: enlaces de
     * WhatsApp, numero marcado con el icono de WhatsApp y telefonos. Quien
     * llama los verifica uno a uno contra wa.me y se queda con el primero
     * que de verdad es una cuenta de WhatsApp.
     */
    const intentar = (primero) => {
      const html = document.documentElement.innerHTML;
      const enlaces = buscarTodos(html);
      const info = leerInformacion();
      const mensaje = leerMensaje(html);
      const candidatos = [
        ...enlaces.map((telefono) => ({ telefono, mensaje, origen: "pagina" })),
        ...info.wa.map((telefono) => ({ telefono, mensaje: null, origen: "pagina_info" })),
        ...info.tel.map((telefono) => ({ telefono, mensaje: null, origen: "pagina_telefono" })),
      ].filter((c, i, arr) => arr.findIndex((x) => x.telefono === c.telefono) === i);

      // Con un enlace o un numero de WhatsApp ya hay algo firme; si solo hay
      // telefonos, se espera un poco por si aparece algo mejor.
      const firme = enlaces.length || info.wa.length;
      if (candidatos.length && (firme || Date.now() - inicio > 3500 || Date.now() > limite)) {
        return resolve(candidatos);
      }

      if (Date.now() > limite) return resolve([]);

      // El primer reintento es casi inmediato, por si el boton se monta un
      // instante despues de cargar; a partir de ahi ya se baja por la pagina.
      if (!primero) window.scrollBy(0, 1200);
      setTimeout(() => intentar(false), primero ? 400 : 900);
    };

    intentar(true);
  });
}

const esperarCarga = (tabId) =>
  new Promise((resolve) => {
    const alCambiar = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(alCambiar);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(alCambiar);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(alCambiar);
      resolve();
    }, 12000);
  });

/*
 * El anuncio real, con su boton de accion (el metodo de story.php).
 *
 * Los anuncios de clic a WhatsApp son, por dentro, una publicacion (casi
 * siempre un video) de la pagina. En la Biblioteca el enlace llega sin
 * numero, pero si se abre esa publicacion como
 *   facebook.com/story.php?story_fbid=<ID DEL VIDEO>&id=<ID DE PERFIL>
 * Facebook la pinta como anuncio, con su boton "WhatsApp" y el enlace
 * completo (api.whatsapp.com/send?phone=...). Comprobado en vivo.
 *
 * Las dos piezas que faltan:
 *  - El ID de perfil: en paginas nuevas es el numero de 14+ cifras de su
 *    URL (61578960672862); si la URL es un alias, se lee de la propia pagina.
 *  - El ID del video: la Biblioteca no lo da, ni la pagina lo lista, pero
 *    Google si tiene indexados los videos de la pagina y se encuentran
 *    buscando "<ID de perfil> videos". Google esconde la URL real detras de
 *    /goto?url=..., asi que se abre cada resultado y se lee a donde llega.
 *
 * Todo en una sola pestaña de fondo que se reutiliza y se cierra al final.
 */
/*
 * Busquedas en curso, por numero de solicitud: si el usuario la detiene
 * desde el boton, se marcan como canceladas y se cierran sus pestañas de
 * fondo en el acto (lo que estuvieran esperando termina solo al cerrarse).
 */
const solicitudes = new Map(); // solicitud -> { cancelada, pestanas: Set }

const abrirPestanaFondo = async (sol, url) => {
  if (sol && sol.cancelada) throw new Error("cancelada");
  const pestana = await chrome.tabs.create({ url, active: false });
  if (sol) sol.pestanas.add(pestana.id);
  return pestana;
};

const cancelarSolicitud = (id) => {
  const sol = solicitudes.get(id);
  if (!sol) return;
  sol.cancelada = true;
  for (const t of sol.pestanas) chrome.tabs.remove(t).catch(() => {});
  sol.pestanas.clear();
};

const esperarUrl = (tabId, cumple, maxMs) =>
  new Promise((resolve) => {
    const fin = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(alCambiar);
      resolve(null);
    }, maxMs);
    const alCambiar = (id, info, tab) => {
      if (id !== tabId || !tab.url || !cumple(tab.url)) return;
      clearTimeout(fin);
      chrome.tabs.onUpdated.removeListener(alCambiar);
      resolve(tab.url);
    };
    chrome.tabs.onUpdated.addListener(alCambiar);
  });

const ejecutar = async (tabId, func, args = []) => {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
    return r ? r.result : null;
  } catch {
    return null;
  }
};

// En la pestaña: ID de perfil de la pagina abierta.
function leerIdPerfil() {
  const h = document.documentElement.innerHTML;
  const m =
    h.match(/"owning_profile_id":"(\d{10,})"/) ||
    h.match(/"profile_owner":\{"id":"(\d{10,})"/) ||
    h.match(/"delegate_page_id":"(\d{10,})"/);
  return m ? m[1] : null;
}

// En la pestaña de Google: enlaces de los resultados que son de Facebook.
function leerResultadosGoogle() {
  const vistos = [];
  for (const h3 of document.querySelectorAll("h3")) {
    const a = h3.closest("a");
    if (!a) continue;
    const bloque = a.closest("[data-hveid]") || a.parentElement;
    if (!/facebook\.com/i.test((bloque && bloque.innerText) || a.href)) continue;
    vistos.push({ href: a.href, titulo: h3.innerText || "" });
  }
  return vistos;
}

// En la pestaña de story.php: espera el boton de accion y lee su numero.
function leerBotonWhatsapp(maxMs) {
  return new Promise((resolve) => {
    const fin = Date.now() + maxMs;
    const mirar = () => {
      for (const a of document.querySelectorAll('a[href*="whatsapp"]')) {
        let h = a.href;
        try {
          h = decodeURIComponent(decodeURIComponent(h));
        } catch {}
        const m = h.match(/phone=\+?(\d{8,20})/);
        if (m) {
          const texto = (h.match(/[?&]text=([^&]*)/) || [])[1] || null;
          return resolve({ telefono: m[1], mensaje: texto });
        }
      }
      if (Date.now() > fin) return resolve(null);
      setTimeout(mirar, 400);
    };
    mirar();
  });
}

const idDePublicacion = (url) => {
  const m = (url || "").match(
    /\/videos\/(?:[^/?]+\/)?(\d{12,})|\/reel\/(\d{12,})|story_fbid=(\d{12,})|\/posts\/(\d{12,})|fbid=(\d{12,})|\/watch\/?\?v=(\d{12,})/
  );
  return m ? m.slice(1).find(Boolean) : null;
};

async function intentarAnuncioReal(paginaId, perfilUrl, copy, sol) {
  const { googleBloqueadoHasta } = await chrome.storage.local.get("googleBloqueadoHasta");
  if (googleBloqueadoHasta && Date.now() < googleBloqueadoHasta) return [];
  let pestana;
  try {
    // 1. ID de perfil.
    let perfil = ((perfilUrl || "").match(/(?:\/|id=)(\d{14,})/) || [])[1] || null;
    pestana = await abrirPestanaFondo(sol, perfilUrl || "https://www.facebook.com/" + paginaId);
    if (!perfil) {
      await esperarCarga(pestana.id);
      perfil = await ejecutar(pestana.id, leerIdPerfil);
    }
    if (!perfil) perfil = paginaId;

    // 2. Videos de la pagina que conoce Google.
    const principio = (copy || "").replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
    await chrome.tabs.update(pestana.id, {
      url: "https://www.google.com/search?hl=es&num=20&q=" + encodeURIComponent(perfil + " videos"),
    });
    await esperarCarga(pestana.id);
    // Si Google pide el "no soy un robot", se deja de intentar un rato.
    const enGoogle = await chrome.tabs.get(pestana.id).catch(() => null);
    if (enGoogle && /\/sorry\//.test(enGoogle.url || "")) {
      await chrome.storage.local.set({ googleBloqueadoHasta: Date.now() + 30 * 60 * 1000 });
      return [];
    }
    let resultados = (await ejecutar(pestana.id, leerResultadosGoogle)) || [];
    // Primero el que se parece al texto del anuncio.
    const pareceElAnuncio = (r) => principio && r.titulo.toLowerCase().includes(principio.slice(0, 20));
    resultados = [...resultados.filter(pareceElAnuncio), ...resultados.filter((r) => !pareceElAnuncio(r))].slice(0, 4);

    // 3. Cada resultado: a que publicacion lleva, y si como story.php tiene boton.
    const probados = new Set();
    const candidatos = [];
    for (const r of resultados) {
      await chrome.tabs.update(pestana.id, { url: r.href });
      const destino = await esperarUrl(pestana.id, (u) => /facebook\.com/.test(u), 6000);
      const id = idDePublicacion(destino);
      if (!id || probados.has(id)) continue;
      probados.add(id);

      await chrome.tabs.update(pestana.id, {
        url: "https://www.facebook.com/story.php?story_fbid=" + id + "&id=" + perfil,
      });
      await esperarUrl(pestana.id, (u) => /story\.php/.test(u), 6000);
      const boton = await ejecutar(pestana.id, leerBotonWhatsapp, [5000]);
      if (boton) candidatos.push({ ...boton, origen: "anuncio_real" });
      if (candidatos.length) break;
    }
    return candidatos;
  } catch (e) {
    console.warn("[WA Ads Spy] anuncio real:", e);
    return [];
  } finally {
    if (pestana) chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

/**
 * Segundo intento: buscar en la web una publicacion ORGANICA (no el anuncio
 * pagado) con un texto parecido al del anuncio, y leer el WhatsApp de ahi.
 *
 * Muchos anunciantes publican el mismo copy sin pagar antes de convertirlo en
 * anuncio, y esa publicacion suele llevar el enlace de WhatsApp escrito a
 * mano en el texto. Un dark post no aparece en la Pagina ni en buscadores,
 * pero la publicacion organica gemela si — por eso este camino encuentra
 * numeros que los dos anteriores no.
 */
// Se probo tambien con html.duckduckgo.com, pero su endpoint devuelve la
// portada en vez de resultados con una peticion GET simple (necesitaria
// simular mas una sesion de navegador real). Se dejo solo Bing, que si
// funciona verificado en vivo.
const BUSCADOR = "https://www.bing.com/search?q=";

const fraseBuscable = (texto) => {
  const base = (texto || "").replace(/\s+/g, " ").trim();
  if (!base) return "";
  const corte = base.split(/[.!?\n]/)[0].trim();
  return (corte.length >= 15 ? corte : base).slice(0, 90);
};

/**
 * Bing no enlaza directo al resultado: envuelve cada href en un redirector
 * propio (bing.com/ck/a?...&u=<destino en base64>&...), incluso para sus
 * propias pestañas de navegacion. Hay que decodificar ese parametro para
 * saber a donde apunta de verdad cada enlace, y solo desde ahi se puede ver
 * si es un facebook.com.
 *
 * Ojo: el HTML trae las comillas de los atributos con entidades (&amp;), asi
 * que hay que deshacer eso antes de construir la URL o el parametro "u" no
 * se separa bien del resto de la query.
 */
const decodificarEnlaceBing = (hrefCrudo) => {
  const href = hrefCrudo.replace(/&amp;/g, "&");
  try {
    const q = new URL(href).searchParams.get("u");
    if (!q) return href;
    const b64 = (q.startsWith("a1") ? q.slice(2) : q).replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64 + "===".slice((b64.length + 3) % 4));
  } catch {
    return href;
  }
};

/**
 * Solo el primer enlace de cada resultado ORGANICO (bloque <li class="b_algo">).
 * El resto de la pagina trae enlaces de navegacion (imagenes, videos, mapas)
 * que no sirven y que ademas apuntan siempre a bing.com, nunca al destino.
 */
const urlsFacebookDe = (html) => {
  const urls = [];
  for (const bloque of html.split('<li class="b_algo"').slice(1)) {
    const m = bloque.match(/<a [^>]*href="([^"]+)"/);
    if (!m) continue;
    const real = decodificarEnlaceBing(m[1]);
    if (/(^|\.)facebook\.com$/i.test((() => { try { return new URL(real).hostname; } catch { return ""; } })())) {
      urls.push(real);
    }
  }
  return urls;
};

/*
 * Un numero escrito a mano dentro del texto de una publicacion.
 *
 * Aqui hay que ser mucho mas estricto que con un enlace: un wa.me es
 * inequivoco, pero una cifra suelta puede ser un precio, una fecha o un NIT.
 * Se comprobo en vivo lo facil que es equivocarse — buscando un anunciante
 * cuyo numero real se conocia, en la pagina de resultados aparecia otro
 * telefono, de un resultado distinto, listo para colarse como si fuera suyo.
 *
 * Por eso el numero solo se acepta si tiene cerca una palabra que hable de
 * escribir o de WhatsApp, y se descarta si va pegado a un simbolo de dinero.
 */
const RE_PISTA_WA = /whatsapp|wasap|wsp|escr[ií]b|cont[aá]ct|mens[aá]j|pedido/i;

const numeroSueltoEn = (texto) => {
  const limpio = (texto || "").replace(/\s+/g, " ");
  if (!RE_PISTA_WA.test(limpio)) return null;

  for (const m of limpio.matchAll(/\+?\d[\d ().-]{7,17}\d/g)) {
    const digitos = m[0].replace(/\D/g, "");
    if (digitos.length < 8 || digitos.length > 15) continue;

    const desde = Math.max(0, m.index - 120);
    const hasta = m.index + m[0].length + 120;
    if (/[$€]|\b(pesos|cop|usd|precio|descuento)\b/i.test(limpio.slice(Math.max(0, m.index - 15), m.index + m[0].length + 15))) {
      continue;
    }
    if (!RE_PISTA_WA.test(limpio.slice(desde, hasta))) continue;
    return digitos;
  }
  return null;
};

/*
 * Lo que Facebook sirve de una publicacion a un fetch normal.
 *
 * Se comprobo: pedir la publicacion devuelve 200 y 355 KB de HTML, pero es
 * el cascaron de React — ni comentarios ni contenido montado. Lo unico que
 * viaja de verdad es lo que Facebook pone para las vistas previas de enlace,
 * las etiquetas Open Graph. Ahi si esta el texto del anuncio, y si el
 * anunciante escribio su numero en esas primeras lineas, ahi aparece.
 */
const descripcionOg = (html) => {
  const m = html.match(/property="og:description" content="([^"]*)"/i);
  if (!m) return "";
  // Sin DOM en el service worker: las entidades se deshacen a mano.
  return m[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
};

/*
 * DuckDuckGo Lite: el respaldo de Bing.
 *
 * Si Bing cambia su maquetacion (el aviso de arriba deja de encontrar el
 * bloque "b_algo") o simplemente no trae nada para esa frase, se prueba
 * aqui antes de rendirse. Lite sirve HTML plano, sin JS, pensado para
 * lectores de pantalla y navegadores viejos — facil de leer con una
 * expresion regular, igual que Bing.
 *
 * Sus enlaces tambien van envueltos, en "/l/?uddg=<destino codificado>",
 * pero sin el cifrado en base64 que usa Bing: solo hace falta
 * decodeURIComponent.
 */
const BUSCADOR_RESPALDO = "https://lite.duckduckgo.com/lite/?q=";

const urlsFacebookDeDuckDuckGo = (html) => {
  const urls = [];
  const re = /href="(?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)[^"]*"/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const real = decodeURIComponent(m[1]);
      if (/(^|\.)facebook\.com$/i.test(new URL(real).hostname)) urls.push(real);
    } catch {}
  }
  return urls;
};

async function buscarCandidatas(frase) {
  try {
    const r = await fetch(BUSCADOR + encodeURIComponent(frase + " facebook"), { credentials: "omit" });
    if (r.ok) {
      const html = await r.text();
      if (!html.includes('<li class="b_algo"')) {
        // Si el buscador principal cambia su maquetacion, esto deja de
        // encontrar nada y sin este aviso no habria forma de enterarse.
        console.warn("[WA Ads Spy] Bing no devolvio resultados reconocibles, se prueba el respaldo");
      } else {
        const candidatas = urlsFacebookDe(html);
        if (candidatas.length) return candidatas;
      }
    }
  } catch {}

  try {
    const r = await fetch(BUSCADOR_RESPALDO + encodeURIComponent(frase + " facebook"), { credentials: "omit" });
    if (r.ok) return urlsFacebookDeDuckDuckGo(await r.text());
  } catch {}

  return [];
}

async function intentarPublicacionOrganica(copy, titulo) {
  const frase = fraseBuscable(copy || titulo);
  if (!frase) return null;

  const candidatas = await buscarCandidatas(frase);

  for (const url of candidatas.slice(0, 8)) {
    let u;
    try {
      u = new URL(url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:") continue;

    try {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) continue;
      const html = await r.text();

      const porEnlace = numeroWhatsappEn(html);
      if (porEnlace) return { telefono: porEnlace, mensaje: null, origen: "publicacion" };

      const enTexto = numeroSueltoEn(descripcionOg(html));
      if (enTexto) return { telefono: enTexto, mensaje: null, origen: "publicacion_texto" };
    } catch {}
  }
  return null;
}


/*
 * Tercer intento: la biografia de Instagram del anunciante.
 *
 * El anuncio ya trae `instagram_actor_name` cuando el anunciante vinculo su
 * cuenta. Un fetch normal a instagram.com/<usuario>/ no hidrata la app (es
 * el mismo tipo de cascaron que Facebook), pero igual que con una
 * publicacion de Facebook, la etiqueta Open Graph con la biografia si llega
 * servida desde el primer HTML.
 */
async function intentarInstagram(usuario) {
  if (!usuario) return null;
  try {
    const r = await fetch("https://www.instagram.com/" + usuario + "/", { credentials: "omit" });
    if (!r.ok) return null;
    const html = await r.text();

    const porEnlace = numeroWhatsappEn(html);
    if (porEnlace) return { telefono: porEnlace, mensaje: null, origen: "instagram" };

    const enTexto = numeroSueltoEn(descripcionOg(html));
    if (enTexto) return { telefono: enTexto, mensaje: null, origen: "instagram_texto" };
  } catch {}
  return null;
}

/*
 * Cuarto intento, opcional: la pagina de destino del propio anuncio.
 *
 * Es la via con mas probabilidad de dar un numero — es donde el anunciante
 * *quiere* que le escriban, casi siempre con un boton de WhatsApp flotante
 * a la vista — pero el dominio de destino puede ser cualquiera, y leerlo
 * pide el permiso amplio `<all_urls>`. Por eso esto SOLO se intenta si
 * `chrome.permissions.contains` confirma que el permiso ya esta concedido
 * (el usuario lo activo a proposito desde el popup); si no esta, se salta
 * sin mas, sin pedir nada ni interrumpir el resto de la cascada.
 */
async function intentarLandingAnuncio(linkUrl) {
  if (!linkUrl) return null;

  let base;
  try {
    base = new URL(linkUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(base.protocol)) return null;

  const tieneElPermiso = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  if (!tieneElPermiso) return null;

  // La portada primero; "/contacto" y "/contact" son donde muchos sitios
  // dejan el boton de WhatsApp cuando no lo ponen flotante en toda la web.
  const candidatas = [base.href, new URL("/contacto", base).href, new URL("/contact", base).href];

  for (const url of candidatas) {
    try {
      const r = await fetch(url, { credentials: "omit" });
      if (!r.ok) continue;
      const html = await r.text();

      const porEnlace = numeroWhatsappEn(html);
      if (porEnlace) return { telefono: porEnlace, mensaje: null, origen: "landing" };
    } catch {}
  }
  return null;
}

/**
 * Comprueba si un anuncio seguido sigue existiendo, y si no, si al menos
 * sigue existiendo el anunciante.
 *
 * Distingue tres casos, porque para el usuario no es lo mismo uno que otro:
 *  - "activo": el anuncio sigue apareciendo en la Biblioteca.
 *  - "retirado": el anuncio ya no aparece, pero la Pagina del anunciante
 *    sigue existiendo — lo normal es que la campaña haya terminado.
 *  - "anunciante_baneado": ni el anuncio ni la Pagina existen ya. Facebook
 *    muestra el mismo aviso de "contenido no disponible" tanto si la Pagina
 *    se elimino como si a su dueño lo banearon, asi que no se puede separar
 *    un caso del otro — se agrupan bajo el mismo estado.
 */
function anuncioPresente(id, esperaMaxMs) {
  return new Promise((resolve) => {
    const limite = Date.now() + esperaMaxMs;
    const marca = '"ad_archive_id":"' + id + '"';
    const intentar = () => {
      if (document.documentElement.innerHTML.includes(marca)) return resolve(true);
      if (Date.now() > limite) return resolve(false);
      setTimeout(intentar, 700);
    };
    intentar();
  });
}

// Aviso que pone Facebook cuando la Pagina se elimino o esta oculta. Sirve
// igual para una Pagina borrada por su dueño que para una baneada por Meta:
// el HTML que se ve es identico en los dos casos.
function paginaAusente() {
  return /contenido no est[aá] disponible|content isn.t available/i.test(document.body.innerText || "");
}

async function abrirYRevisar(url, func, args, esperaCargaMs) {
  let pestana;
  try {
    pestana = await chrome.tabs.create({ url, active: false });
    await esperarCarga(pestana.id);
    const [salida] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func,
      args,
    });
    return salida && salida.result;
  } catch {
    return undefined;
  } finally {
    if (pestana) chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

async function verificarSeguido(id, paginaId, perfilUrl) {
  const existe = await abrirYRevisar(
    "https://www.facebook.com/ads/library/?id=" + id,
    anuncioPresente,
    [id, 9000]
  );
  if (existe) return { estado: "activo" };

  const urlPerfil = perfilUrl || (paginaId ? "https://www.facebook.com/" + paginaId + "/" : null);
  if (!urlPerfil) return { estado: "no_verificable" };

  const ausente = await abrirYRevisar(urlPerfil, paginaAusente, []);
  return { estado: ausente ? "anunciante_baneado" : "retirado" };
}

/*
 * La cache vive en el almacen, no en memoria.
 *
 * En Manifest V3 Chrome apaga el service worker a los pocos segundos sin
 * trabajo, y con el se iba la cache entera: resolver un anunciante, volver a
 * pedirlo cinco minutos despues y tener que abrir otra vez una pestaña y
 * esperar. Guardado en disco, un numero encontrado sirve un mes.
 *
 * Los "no encontrado" caducan mucho antes: que hoy no se encuentre no
 * significa que el anunciante no vaya a publicar su numero la semana que
 * viene, pero tampoco conviene repetir toda la busqueda en cada clic.
 */
// "wa4:" (por anuncio, solo numeros verificados): lo guardado antes (por
// anunciante, sin verificar, o "sin numero") no debe usarse ni bloquear nada.
const CACHE_PREFIJO = "wa4:";
const CACHE_VIDA_OK = 30 * 24 * 60 * 60 * 1000; // 30 dias
const CACHE_VIDA_VACIO = 3 * 24 * 60 * 60 * 1000; // 3 dias

const leerCache = async (paginaId) => {
  const clave = CACHE_PREFIJO + paginaId;
  const guardado = (await chrome.storage.local.get(clave))[clave];
  if (!guardado) return undefined; // nunca se busco
  const vida = guardado.dato ? CACHE_VIDA_OK : CACHE_VIDA_VACIO;
  if (Date.now() - guardado.t > vida) return undefined;
  return guardado.dato; // puede ser null: se busco y no habia
};

const escribirCache = (paginaId, dato) =>
  chrome.storage.local.set({ [CACHE_PREFIJO + paginaId]: { t: Date.now(), dato } });

/*
 * Ningun paso puede alargarse para siempre: sin techo, el boton podia
 * quedarse girando cerca de un minuto (quince segundos de espera en la
 * pestaña mas ocho peticiones de resultados de busqueda) sin decir nada.
 */
const conTecho = (promesa, ms) =>
  Promise.race([promesa, new Promise((r) => setTimeout(() => r(null), ms))]);

async function intentarPaginaAnunciante(paginaId, perfilUrl, prefijo, sol) {
  const url = perfilUrl || "https://www.facebook.com/" + paginaId + "/";
  let pestana;
  try {
    pestana = await abrirPestanaFondo(sol, url);
    await esperarCarga(pestana.id);

    const [salida] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: buscarTelefono,
      args: [ESPERA_MAX_MS, FUENTES_WA, prefijo || ""],
    });

    return (salida && salida.result) || [];
  } catch (e) {
    console.warn("[WA Ads Spy] fallo al resolver:", e);
    return [];
  } finally {
    if (pestana) chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

/*
 * ¿Ese numero es de verdad una cuenta de WhatsApp?
 *
 * wa.me responde distinto segun el numero: para una cuenta de WhatsApp
 * Business devuelve su nombre, su foto y "Business Account" en las etiquetas
 * Open Graph; para un numero que no esta en WhatsApp (o un telefono fijo)
 * devuelve una pagina generica, "Share on WhatsApp", sin nombre ni foto.
 * Comprobado en vivo con numeros validos y con el telefono de una pagina que
 * no tenia WhatsApp. Asi el boton nunca abre un chat con un numero muerto.
 *
 * Las cuentas personales (no Business) tambien salen como genericas, pero
 * los anuncios de clic a WhatsApp se conectan a cuentas Business, asi que
 * en la practica un numero generico no es el del anunciante.
 */
const VERIFICADOS = "waver:";
const VIDA_VERIFICACION = 7 * 24 * 60 * 60 * 1000;
const desentidades = (t) =>
  (t || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

async function verificarWhatsapp(numero) {
  const clave = VERIFICADOS + numero;
  const guardado = (await chrome.storage.local.get(clave))[clave];
  if (guardado && Date.now() - guardado.t < VIDA_VERIFICACION) return guardado.r;

  try {
    const r = await fetch("https://wa.me/" + numero, { credentials: "omit" });
    if (!r.ok) return null; // sin respuesta clara: ni si ni no
    const html = await r.text();
    const og = (p) => desentidades((html.match(new RegExp('property="og:' + p + '" content="([^"]*)"')) || [])[1]);
    const res = {
      valido: /business account/i.test(og("description")) || /pps\.whatsapp\.net/.test(og("image")),
      // "Share on WhatsApp" / "Compartir en WhatsApp": el titulo generico.
      nombre: og("title") && !/^(share on|compartir en) whatsapp$/i.test(og("title")) ? og("title") : null,
      foto: /pps\.whatsapp\.net/.test(og("image")) ? og("image") : null,
    };
    chrome.storage.local.set({ [clave]: { t: Date.now(), r: res } });
    return res;
  } catch {
    return null;
  }
}

/*
 * Recorre los metodos de busqueda en orden y verifica cada numero que
 * aparece. Devuelve el primero que es una cuenta de WhatsApp de verdad; los
 * que no lo son se anotan en `descartados` para poder explicarlo.
 */
async function resolver(m) {
  const { paginaId, perfilUrl, copy, titulo, instagram, linkUrl, prefijo, forzar } = m;
  const candidatosTexto = m.candidatos;
  // Guardado por anuncio, no por anunciante: dos anuncios del mismo
  // anunciante pueden llevar numeros distintos.
  const clave = m.adId || paginaId;
  if (!forzar) {
    const enCache = await leerCache(clave);
    if (enCache) return enCache;
  }
  const sol = { cancelada: false, pestanas: new Set() };
  if (m.solicitud) solicitudes.set(m.solicitud, sol);
  try {
    return await resolverCon(sol, clave, paginaId, perfilUrl, copy, titulo, instagram, linkUrl, prefijo, candidatosTexto);
  } finally {
    for (const t of sol.pestanas) chrome.tabs.remove(t).catch(() => {});
    if (m.solicitud) solicitudes.delete(m.solicitud);
  }
}

async function resolverCon(sol, clave, paginaId, perfilUrl, copy, titulo, instagram, linkUrl, prefijo, candidatosTexto) {

  const probados = new Set();
  const descartados = [];

  const probar = async (candidatos) => {
    for (const c of candidatos || []) {
      if (sol.cancelada) return null;
      if (!c || !c.telefono || probados.has(c.telefono)) continue;
      probados.add(c.telefono);
      const v = await conTecho(verificarWhatsapp(c.telefono), 6000);
      if (v && v.valido) return { ...c, nombreWa: v.nombre, fotoWa: v.foto };
      // Sin respuesta de wa.me (red caida): mejor darlo por bueno que perderlo.
      if (!v) return { ...c, sinVerificar: true };
      descartados.push(c.telefono);
    }
    return null;
  };

  // 1. Numeros escritos en los anuncios de este anunciante (los del texto
  //    de este anuncio y de sus otros anuncios cargados en la busqueda).
  let dato = await probar(candidatosTexto);

  /*
   * 2 y 3, a la vez, cada uno en su pestaña: el anuncio real (story.php del
   * video, el boton exacto del anuncio) y la pagina del anunciante. En serie
   * sumaban hasta 40 segundos cuando ninguno encontraba nada.
   *
   * Un enlace o un numero con el icono de WhatsApp en la pagina, ya
   * verificado, se usa sin esperar; un telefono suelto solo si el anuncio
   * real no dio nada, porque es el dato menos seguro de los dos.
   */
  if (!dato) {
    const real = conTecho(intentarAnuncioReal(paginaId, perfilUrl, copy, sol), 25000);
    const pagina = (await conTecho(intentarPaginaAnunciante(paginaId, perfilUrl, prefijo, sol), 15000)) || [];
    dato = await probar(pagina.filter((c) => c.origen !== "pagina_telefono"));
    if (!dato) dato = await probar(await real);
    if (!dato) dato = await probar(pagina);
  }

  // 4. La publicacion organica del mismo texto.
  if (!dato && !sol.cancelada) dato = await probar([await conTecho(intentarPublicacionOrganica(copy, titulo), 7000)]);

  // 5. Su Instagram, si lo declaro.
  if (!dato && !sol.cancelada) dato = await probar([await conTecho(intentarInstagram(instagram), 5000)]);

  // 6. Solo con el permiso del usuario, la landing del anuncio.
  if (!dato && !sol.cancelada) dato = await probar([await conTecho(intentarLandingAnuncio(linkUrl), 6000)]);

  if (sol.cancelada) return { telefono: null, cancelada: true };
  if (dato) {
    await escribirCache(clave, dato);
    return dato;
  }
  // "Sin numero" no se guarda: el boton ya pone su propia espera de 15 s
  // por anuncio, y guardarlo dias hacia que el aviso rojo saliera siempre.
  return { telefono: null, descartados };
}

/*
 * Miniatura propia de un anuncio guardado, para no depender del enlace de
 * Facebook (que caduca solo, por la firma con vencimiento que trae la
 * propia URL de la imagen).
 *
 * Se reduce a un ancho pequeño y se recomprime a JPEG antes de guardarla:
 * asi cada miniatura pesa unos pocos KB en vez de los cientos que pesa la
 * imagen original, y con "unlimitedStorage" concedido en el manifest se
 * pueden guardar cientos de anuncios sin acercarse a ningun tope.
 *
 * `OffscreenCanvas` existe dentro del service worker (no hace falta una
 * pestaña ni el DOM): se decodifica la imagen con `createImageBitmap`, se
 * dibuja ya reducida y se exporta a un blob que se pasa a una URL de datos.
 */
// 640px: la tarjeta del mural mide ~300px, y en pantallas de alta densidad
// (portatiles, 4K) eso son 600 pixeles reales. Con 280 se veia pixelada e
// ilegible en imagenes con texto. En WebP pesa ~30-60 KB.
const ANCHO_MINIATURA = 640; // px, tope: si ya es mas chica no se agranda

async function miniaturaDe(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const original = await createImageBitmap(await r.blob());

    const factor = Math.min(1, ANCHO_MINIATURA / original.width);
    const ancho = Math.max(1, Math.round(original.width * factor));
    const alto = Math.max(1, Math.round(original.height * factor));

    const lienzo = new OffscreenCanvas(ancho, alto);
    const ctx = lienzo.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(original, 0, 0, ancho, alto);
    original.close();

    const blob = await lienzo.convertToBlob({ type: "image/webp", quality: 0.85 });
    const buffer = await blob.arrayBuffer();
    let binario = "";
    const bytes = new Uint8Array(buffer);
    const paso = 0x8000;
    for (let i = 0; i < bytes.length; i += paso) {
      binario += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
    }
    return "data:" + blob.type + ";base64," + btoa(binario);
  } catch (e) {
    return null;
  }
}

/**
 * Descarga un creativo y lo devuelve en base64.
 *
 * Vive aqui y no en el content script porque en MV3 solo el service worker
 * puede saltarse el CORS de la pagina usando los host_permissions, y fbcdn no
 * permite leer sus respuestas desde facebook.com.
 */
async function traerComoBase64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());

  // En trozos, porque con un archivo grande String.fromCharCode(...bytes)
  // revienta la pila de llamadas.
  let binario = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
  }
  return btoa(binario);
}

/**
 * Cuenta los anuncios reales de un anunciante.
 *
 * La ficha solo puede contar lo que la Biblioteca ha cargado en la busqueda
 * actual, que casi nunca son todos. Aqui abrimos su biblioteca completa
 * (activos e inactivos) en una pestaña de fondo, bajamos unas cuantas veces
 * para que cargue mas y contamos los identificadores distintos.
 */
function contarEnLaPagina(vueltas) {
  return new Promise((resolve) => {
    const ids = new Map(); // id -> activo

    const recoger = () => {
      const html = document.documentElement.innerHTML;
      const re = /"ad_archive_id":"(\d+)"[\s\S]{0,2200}?"is_active":(true|false)/g;
      let m;
      while ((m = re.exec(html))) {
        if (!ids.has(m[1])) ids.set(m[1], m[2] === "true");
      }
    };

    let vuelta = 0;
    const paso = () => {
      recoger();
      if (++vuelta > vueltas) {
        const valores = [...ids.values()];
        return resolve({
          total: valores.length,
          activos: valores.filter(Boolean).length,
          inactivos: valores.filter((v) => !v).length,
        });
      }
      window.scrollTo(0, document.body.scrollHeight);
      setTimeout(paso, 1800);
    };
    setTimeout(paso, 1500);
  });
}

async function contarAnuncios(paginaId) {
  const url =
    "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL" +
    "&view_all_page_id=" + paginaId + "&search_type=page&media_type=all";

  let pestana;
  try {
    pestana = await chrome.tabs.create({ url, active: false });
    await esperarCarga(pestana.id);

    const [salida] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: contarEnLaPagina,
      args: [6],
    });
    return salida?.result || { error: "sin datos" };
  } catch (e) {
    return { error: String(e) };
  } finally {
    if (pestana) chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  // chrome.permissions no existe dentro de un content script (solo en
  // paginas propias de la extension: el popup, este service worker). El
  // panel flotante de content.js necesita saber si el permiso de la landing
  // esta concedido, asi que pregunta aqui en vez de leerlo el mismo.
  if (msg.tipo === "tienePermisoLanding") {
    chrome.permissions.contains({ origins: ["<all_urls>"] }).then(responder);
    return true;
  }

  if (msg.tipo === "contarAnuncios") {
    contarAnuncios(msg.paginaId).then(responder);
    return true;
  }

  if (msg.tipo === "miniatura") {
    miniaturaDe(msg.url).then((dataUrl) => responder({ dataUrl }));
    return true;
  }

  if (msg.tipo === "traer") {
    traerComoBase64(msg.url)
      .then((base64) => responder({ base64 }))
      .catch((e) => responder({ error: String(e) }));
    return true;
  }

  if (msg.tipo === "descargar") {
    chrome.downloads.download(
      { url: msg.url, filename: msg.nombre, conflictAction: "uniquify" },
      () => responder({ ok: !chrome.runtime.lastError })
    );
    return true;
  }

  // Boton "Ajustes" del panel: abre la pagina de ajustes de la extension.
  if (msg.tipo === "abrirAjustes") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/popup.html") });
    return false;
  }

  if (msg.tipo === "cancelarWhatsapp") {
    cancelarSolicitud(msg.solicitud);
    responder({ ok: true });
    return false;
  }

  if (msg.tipo === "resolverWhatsapp") {
    resolver(msg).then((dato) =>
      responder({
        telefono: dato?.telefono || null,
        mensaje: dato?.mensaje || null,
        // De donde salio: no es lo mismo un numero sacado del enlace del
        // propio anuncio que uno encontrado en una publicacion suelta.
        origen: dato?.origen || null,
        nombreWa: dato?.nombreWa || null,
        sinVerificar: !!dato?.sinVerificar,
        descartados: dato?.descartados || [],
      })
    );
    return true; // respuesta asincrona
  }

  if (msg.tipo === "verificarSeguido") {
    verificarSeguido(msg.id, msg.paginaId, msg.perfilUrl)
      .then((r) => responder(r))
      .catch(() => responder({ estado: "no_verificable" }));
    return true;
  }
});

// ===========================================================================
// actualizaciones (distribucion privada por GitHub, extension descomprimida)
// ===========================================================================

/*
 * Chrome no actualiza solas las extensiones cargadas como descomprimidas.
 * Dos piezas lo resuelven sin tocar los datos del usuario (que viven en el
 * perfil del navegador, ligados al ID fijo de la extension, no en la carpeta):
 *
 * 1. Aviso: cada 6 horas se consulta version.json en el repositorio. Si hay
 *    una version mayor, el icono muestra una flecha y el popup lo explica.
 * 2. Recarga sola: el script actualizar.bat reemplaza los archivos de la
 *    carpeta; cada minuto se compara la version del manifest del disco con
 *    la que esta corriendo y, si cambio, la extension se recarga sola.
 */
const REPO_ACTUALIZACIONES = "USUARIO/REPOSITORIO"; // p. ej. "rixius/vyxen"
const URL_VERSION = "https://raw.githubusercontent.com/" + REPO_ACTUALIZACIONES + "/main/version.json";

const compararVersiones = (a, b) => {
  const x = String(a).split(".").map(Number);
  const y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
};

async function buscarActualizacion() {
  if (REPO_ACTUALIZACIONES.startsWith("USUARIO/")) return;
  try {
    const r = await fetch(URL_VERSION + "?t=" + Date.now(), { cache: "no-store", credentials: "omit" });
    if (!r.ok) return;
    const remota = await r.json();
    const actual = chrome.runtime.getManifest().version;
    if (remota.version && compararVersiones(remota.version, actual) > 0) {
      await chrome.storage.local.set({ actualizacion: { version: remota.version, notas: remota.notas || "" } });
      chrome.action.setBadgeText({ text: "↑" });
      chrome.action.setBadgeBackgroundColor({ color: "#12d95e" });
    } else {
      await chrome.storage.local.remove("actualizacion");
      chrome.action.setBadgeText({ text: "" });
    }
  } catch {}
}

async function recargarSiCambiaronLosArchivos() {
  try {
    const r = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const enDisco = (await r.json()).version;
    if (enDisco && enDisco !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch {}
}

chrome.alarms.create("buscarActualizacion", { periodInMinutes: 360, delayInMinutes: 1 });
chrome.alarms.create("archivosNuevos", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "buscarActualizacion") buscarActualizacion();
  if (a.name === "archivosNuevos") recargarSiCambiaronLosArchivos();
});
chrome.runtime.onStartup.addListener(buscarActualizacion);
chrome.runtime.onInstalled.addListener(buscarActualizacion);
