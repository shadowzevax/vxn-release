/*⁠​‌​‌​‌‌​​‌‌‌‌​​‌​‌‌‌‌​​​​‌‌​​‌​‌​‌‌​‌‌‌​​​‌​​​​​​​‌​‌​​​​‌‌​​​‌‌​​‌​‌​​‌​​‌​​​​​​​‌‌​​‌​​​‌‌​​​​​​‌‌​​‌​​​‌‌​‌‌​​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​‌​​​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​‌‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​​‌‌​‌‌​‌​​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​‌​‌​‌‌‌​​‌​​‌‌‌​‌‌​​‌‌​​​​‌​‌‌​​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌‌​​‌​‌‌‌​​​‌​​​​​​‌​‌​​​​​‌‌‌​​‌​​‌‌​‌‌‌‌​‌‌​‌​​​​‌‌​‌​​‌​‌‌​​​‌​​‌‌​‌​​‌​‌‌​​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌​‌​‌‌​‌‌‌‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌​​‌‌​​‌‌​‌​​‌​‌‌​​​‌‌​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​‌‌​​​​‌​​​​​​‌‌​​​‌‌​‌‌​‌‌‌‌​‌‌‌​​​​​‌‌​‌​​‌​‌‌​​​​‌​​‌​​​​​​‌‌​‌‌‌‌​​‌​​​​​​‌‌‌​​‌​​‌‌​​‌​‌​‌‌​​‌​​​‌‌​‌​​‌​‌‌‌​​‌‌​‌‌‌​‌​​​‌‌‌​​‌​​‌‌​‌​​‌​‌‌​​​‌​​‌‌‌​‌​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌‌​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​​​‌​‌‌‌​‌​‌​‌‌‌​‌​​​‌‌​‌‌‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌‌​‌​​‌‌​​​​‌​‌‌​​​‌‌​‌‌​‌​​‌​‌‌​‌‌‌‌​‌‌​‌‌‌​​​‌​​​​​​‌‌​​‌​‌​‌‌‌​​‌‌​‌‌​​​‌‌​‌‌‌​​‌​​‌‌​‌​​‌​‌‌‌​‌​​​‌‌​​​​‌​​‌​​​​​​‌‌​​‌​​​‌‌​​‌​‌​​‌​​​​​​‌​‌​​‌​​‌‌​‌​​‌​‌‌‌‌​​​​‌‌​‌​​‌​‌‌‌​‌​‌​‌‌‌​​‌‌​​‌​‌‌‌​⁠*/
const $ = (id) => document.getElementById(id);

const pestanaActiva = async () => {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
};

const enBiblioteca = (t) => t && /facebook\.com\/ads\/library/.test(t.url || "");

const refrescar = async () => {
  const t = await pestanaActiva();
  if (!enBiblioteca(t)) {
    $("nota").textContent = "Abre la Biblioteca de Anuncios para empezar.";
    return;
  }
  try {
    const e = await chrome.tabs.sendMessage(t.id, { tipo: "estado" });
    $("total").textContent = e.anuncios;
    $("wa").textContent = e.whatsapp;
    $("nota").textContent = e.corriendo
      ? "Bajando por los resultados..."
      : "Los anuncios se leen solos mientras haces scroll.";
  } catch {
    $("nota").textContent = "Recarga la Biblioteca de Anuncios para activar la extension.";
  }
};

// Salida de emergencia: si el panel quedo fuera de la pantalla no hay forma de
// arrastrarlo de vuelta, asi que se borran las posiciones guardadas.
$("recolocar").addEventListener("click", async () => {
  await chrome.storage.local.remove(["was-pos-panel", "was-pos-rapida"]);
  const t = await pestanaActiva();
  if (t) chrome.tabs.reload(t.id);
  window.close();
});

// Version de la extension (la misma del manifest: V1, V2...).
$("version").textContent = "V" + chrome.runtime.getManifest().version;

// Aviso de version nueva (lo deja el service worker al consultar GitHub).
chrome.storage.local.get("actualizacion", ({ actualizacion }) => {
  if (!actualizacion) return;
  $("actualizacion").hidden = false;
  $("versionNueva").textContent = "V" + actualizacion.version;
  $("notasNueva").textContent = actualizacion.notas || "";
});

refrescar();
setInterval(refrescar, 1500);

/*
 * Permiso opcional para leer la pagina de destino del anuncio.
 *
 * chrome.permissions.request solo funciona de verdad como respuesta directa
 * a un gesto del usuario, y un content script ni siquiera tiene acceso a
 * esta API. El popup es el unico sitio donde un clic real dispara el
 * permiso de forma fiable, asi que la decision vive aqui: se guarda en
 * chrome.storage solo para recordar la preferencia elegida, pero lo que de
 * verdad manda es el permiso real (`chrome.permissions.contains`), que
 * `background.js` comprueba antes de tocar ningun sitio fuera de Facebook.
 * Si Chrome revoca el permiso mas tarde (el usuario lo quita a mano en
 * chrome://extensions), la casilla se destilda sola la proxima vez que se
 * abra este popup.
 */
const ORIGEN_LANDING = { origins: ["<all_urls>"] };

const sincronizarPermisoLanding = async () => {
  const concedido = await chrome.permissions.contains(ORIGEN_LANDING);
  $("permisoLanding").checked = concedido;
  $("estadoPermisoLanding").textContent = concedido ? "Activado" : "";
  $("estadoPermisoLanding").classList.toggle("concedido", concedido);
};

$("permisoLanding").addEventListener("change", async (e) => {
  if (e.target.checked) {
    let concedido = false;
    try {
      concedido = await chrome.permissions.request(ORIGEN_LANDING);
    } catch {
      concedido = false;
    }
    if (!concedido) e.target.checked = false; // el usuario dijo que no
  } else {
    await chrome.permissions.remove(ORIGEN_LANDING);
  }
  sincronizarPermisoLanding();
});

sincronizarPermisoLanding();
