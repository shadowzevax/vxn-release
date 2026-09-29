const $ = (id) => document.getElementById(id);
const version = chrome.runtime.getManifest().version;
$("version").textContent = "V" + version;

// ---------- actualizaciones ----------
const pintarActualizacion = async () => {
  const { actualizacion } = await chrome.storage.local.get("actualizacion");
  $("avisoNuevo").classList.toggle("visible", !!actualizacion);
  if (actualizacion) {
    $("versionNueva").textContent = "V" + actualizacion.version;
    $("notasNueva").textContent = actualizacion.notas || "";
    $("estadoActualizacion").textContent = "V" + version + " — hay una version nueva disponible";
  } else {
    $("estadoActualizacion").textContent = "V" + version + " — estas en la ultima version";
  }
};
$("buscarActualizacion").addEventListener("click", async () => {
  $("buscarActualizacion").disabled = true;
  $("estadoActualizacion").textContent = "Buscando...";
  try {
    await chrome.runtime.sendMessage({ tipo: "buscarActualizacion" });
  } catch {}
  await pintarActualizacion();
  $("buscarActualizacion").disabled = false;
});
pintarActualizacion();

// ---------- preferencias (las mismas que usa el panel de la Biblioteca) ----------
const PREFS_BASE = { waSoloCta: true, autoBusqueda: false, cargaAcelerada: false, notificar: true, maxAnuncios: 600 };
const leerPrefs = async () => ({ ...PREFS_BASE, ...((await chrome.storage.local.get("prefs")).prefs || {}) });
const guardarPref = async (clave, valor) => {
  const prefs = await leerPrefs();
  prefs[clave] = valor;
  // Sin version, el panel tomaria estas preferencias por viejas y
  // restauraria algunos valores por defecto al cargar.
  if (prefs.version == null) prefs.version = 6;
  await chrome.storage.local.set({ prefs });
};

(async () => {
  const prefs = await leerPrefs();
  for (const cb of document.querySelectorAll("[data-pref]")) {
    cb.checked = !!prefs[cb.dataset.pref];
    cb.addEventListener("change", () => guardarPref(cb.dataset.pref, cb.checked));
  }
  for (const n of document.querySelectorAll("[data-pref-num]")) {
    n.value = prefs[n.dataset.prefNum];
    n.addEventListener("change", () => {
      const v = Math.max(Number(n.min) || 0, Math.round(Number(n.value) || 0));
      n.value = v;
      guardarPref(n.dataset.prefNum, v);
    });
  }
})();

// ---------- permiso para leer la web del anuncio ----------
// Solo una pagina de la extension puede pedirlo, y como respuesta a un clic.
const ORIGEN_LANDING = { origins: ["<all_urls>"] };
const sincronizarPermiso = async () => {
  const si = await chrome.permissions.contains(ORIGEN_LANDING);
  $("permisoLanding").checked = si;
  $("estadoPermisoLanding").textContent = si ? "Activado" : "Desactivado";
  $("estadoPermisoLanding").classList.toggle("si", si);
};
$("permisoLanding").addEventListener("change", async (e) => {
  if (e.target.checked) {
    let si = false;
    try {
      si = await chrome.permissions.request(ORIGEN_LANDING);
    } catch {}
    if (!si) e.target.checked = false;
  } else {
    await chrome.permissions.remove(ORIGEN_LANDING);
  }
  sincronizarPermiso();
});
sincronizarPermiso();

// ---------- datos ----------
const pintarDatos = async () => {
  const todo = await chrome.storage.local.get(null);
  const guardados = todo.guardados || {};
  const etiquetas = new Set();
  for (const f of Object.values(guardados)) for (const e of f.etiquetas || []) etiquetas.add(e);
  const numeros = Object.values(todo.waResultados || {}).filter((r) => r.r === "ok").length;
  $("nGuardados").textContent = Object.keys(guardados).length;
  $("nEtiquetas").textContent = etiquetas.size;
  $("nNumeros").textContent = numeros;
};
pintarDatos();

$("borrarNumeros").addEventListener("click", async () => {
  if (!confirm("¿Olvidar todos los numeros de WhatsApp encontrados? Se volveran a buscar al pulsar el boton.")) return;
  const todo = await chrome.storage.local.get(null);
  const claves = Object.keys(todo).filter((k) => /^wa(\d|ver)?:/.test(k));
  await chrome.storage.local.remove([...claves, "waResultados"]);
  pintarDatos();
});

// ---------- panel ----------
const hecho = (id) => {
  $(id).classList.add("ver");
  setTimeout(() => $(id).classList.remove("ver"), 1800);
};
$("recolocar").addEventListener("click", async () => {
  await chrome.storage.local.remove(["was-pos-panel", "was-pos-rapida"]);
  hecho("okRecolocar");
});
$("accesosDef").addEventListener("click", async () => {
  await guardarPref("accesosRapidos", null);
  hecho("okAccesos");
});
