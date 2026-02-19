import { requireAuth } from "./authGuard.js";
import { supabase } from "./supabaseClient.js";
import { fetchFincas, fetchBloquesByFinca } from "./data.js";

// Solo personal (authenticated)
const user = await requireAuth(); // usa getUser internamente [web:81]

let myRole = null; // 'owner' | 'editor' | null
let fincas = [];
let bloques = [];
let uploads = [];

init();

async function init() {
  bindUI();
  await loadMyRole();
  await reloadAll();
  applyRoleToUI();
}

function bindUI() {
  document.getElementById("btnReload").addEventListener("click", reloadAll);

  document.getElementById("sectionSelect").addEventListener("change", () => {
    const v = document.getElementById("sectionSelect").value;
    document.getElementById("secCatalogos").style.display = v === "catalogos" ? "" : "none";
    document.getElementById("secCargas").style.display = v === "cargas" ? "" : "none";
  });

  document.getElementById("btnCreateFinca").addEventListener("click", createFinca);
  document.getElementById("btnCreateBloque").addEventListener("click", createBloque);
  document.getElementById("btnSaveGeojson").addEventListener("click", saveGeojson);

  document.getElementById("geoFincaSelect").addEventListener("change", loadGeojsonTextarea);

  document.getElementById("fincaFilter").addEventListener("change", async () => {
    await reloadBloques();
    renderBloques();
  });

  // Link "Salir" hace signOut y manda a login
  document.getElementById("btnLogoutLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut(); // [web:118]
    if (error) return setStatus("Error cerrando sesión: " + (error.message || error));
    window.location.href = "login.html";
  });
}

async function loadMyRole() {
  // Si no hay fila en user_roles, lo tratamos como "solo lectura"
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    myRole = null;
    document.getElementById("roleHint").textContent = "Rol: (no se pudo leer)";
    return;
  }

  myRole = data?.role ?? null;
  document.getElementById("roleHint").textContent =
    `Conectado: ${user.email || user.id} | Rol: ${myRole || "sin rol (solo lectura)"}`;
}

function applyRoleToUI() {
  const canEditCatalogs = myRole === "owner" || myRole === "editor";
  const isOwner = myRole === "owner";

  // Botones de escritura en catálogos
  document.getElementById("btnCreateFinca").disabled = !canEditCatalogs;
  document.getElementById("btnCreateBloque").disabled = !canEditCatalogs;
  document.getElementById("btnSaveGeojson").disabled = !canEditCatalogs;

  // Nota: los botones de borrar se habilitan al render según rol owner
  // (los de editor quedan deshabilitados)
  // Subidas: eliminar carga lo permitimos si eres owner o si la policy/RPC lo permite por "dueño de carga"
}

async function reloadAll() {
  try {
    setStatus("Cargando catálogos...");
    await reloadFincas();
    await reloadBloques();
    fillSelects();
    renderFincas();
    renderBloques();

    setStatus("Cargando cargas...");
    await reloadUploads();
    renderUploads();

    setStatus("");
  } catch (e) {
    setStatus("Error: " + (e.message || e));
  }
}

async function reloadFincas() {
  fincas = await fetchFincas();
}

async function reloadBloques() {
  // Si hay filtro de finca, solo esa
  const fincaFilterVal = document.getElementById("fincaFilter").value;
  bloques = [];

  if (fincaFilterVal) {
    const finca_id = parseInt(fincaFilterVal, 10);
    const f = fincas.find(x => x.id === finca_id);
    const bs = await fetchBloquesByFinca(finca_id);
    for (const b of bs) bloques.push({ finca: f?.nombre || "", ...b });
  } else {
    for (const f of fincas) {
      const bs = await fetchBloquesByFinca(f.id);
      for (const b of bs) bloques.push({ finca: f.nombre, ...b });
    }
  }
}

async function reloadUploads() {
  const { data, error } = await supabase
    .from("uploads")
    .select("id,created_at,filename,status,rows_total,rows_valid,rows_invalid,uploaded_by")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  uploads = data || [];
}

function fillSelects() {
  // Finca filter
  const ff = document.getElementById("fincaFilter");
  const nb = document.getElementById("newBloqueFinca");
  const gf = document.getElementById("geoFincaSelect");

  ff.innerHTML = `<option value="">Todas</option>`;
  nb.innerHTML = ``;
  gf.innerHTML = ``;

  for (const f of fincas) {
    const o1 = document.createElement("option");
    o1.value = f.id;
    o1.textContent = f.nombre;
    ff.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = f.id;
    o2.textContent = f.nombre;
    nb.appendChild(o2);

    const o3 = document.createElement("option");
    o3.value = f.id;
    o3.textContent = f.nombre;
    gf.appendChild(o3);
  }

  // Precargar GeoJSON textarea
  if (fincas.length) {
    if (!gf.value) gf.value = String(fincas[0].id);
    loadGeojsonTextarea();
  }
}

function loadGeojsonTextarea() {
  const fincaId = parseInt(document.getElementById("geoFincaSelect").value, 10);
  const f = fincas.find(x => x.id === fincaId);
  document.getElementById("geojsonText").value = f?.geojson ? JSON.stringify(f.geojson, null, 2) : "";
}

function renderFincas() {
  const tbody = document.querySelector("#fTbl tbody");
  tbody.innerHTML = "";

  const isOwner = myRole === "owner";
  const canEdit = myRole === "owner" || myRole === "editor";

  for (const f of fincas) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.id}</td>
      <td>
        <input data-finca-nombre="${f.id}" value="${escapeHtml(f.nombre)}"
               ${canEdit ? "" : "disabled"}
               style="width:220px" />
      </td>
      <td>${f.geojson ? "Sí" : "No"}</td>
      <td>
        <button class="btn btnLight" data-save-finca="${f.id}" ${canEdit ? "" : "disabled"}>Guardar</button>
        <button class="btn btnLight" data-del-finca="${f.id}" ${isOwner ? "" : "disabled"}>Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-save-finca]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-save-finca"), 10);
      await saveFincaName(id);
    });
  });

  tbody.querySelectorAll("button[data-del-finca]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-del-finca"), 10);
      await deleteFinca(id);
    });
  });
}

function renderBloques() {
  const tbody = document.querySelector("#bTbl tbody");
  tbody.innerHTML = "";

  const isOwner = myRole === "owner";
  const canEdit = myRole === "owner" || myRole === "editor";

  for (const b of bloques) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.id}</td>
      <td>${escapeHtml(b.finca)}</td>
      <td>
        <input data-bloque-nombre="${b.id}" value="${escapeHtml(b.nombre)}"
               ${canEdit ? "" : "disabled"}
               style="width:180px" />
      </td>
      <td><input data-bloque-plantas="${b.id}" type="number" value="${val(b.plantas_total)}" ${canEdit ? "" : "disabled"} style="width:90px"/></td>
      <td><input data-bloque-pct="${b.id}" type="number" step="0.1" value="${val(b.porcentaje)}" ${canEdit ? "" : "disabled"} style="width:80px"/></td>
      <td><input data-bloque-muestreo="${b.id}" type="number" value="${val(b.plantas_muestreo)}" ${canEdit ? "" : "disabled"} style="width:90px"/></td>
      <td>
        <button class="btn btnLight" data-save-bloque="${b.id}" ${canEdit ? "" : "disabled"}>Guardar</button>
        <button class="btn btnLight" data-del-bloque="${b.id}" ${isOwner ? "" : "disabled"}>Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-save-bloque]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-save-bloque"), 10);
      await saveBloque(id);
    });
  });

  tbody.querySelectorAll("button[data-del-bloque]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-del-bloque"), 10);
      await deleteBloque(id);
    });
  });
}

function renderUploads() {
  const tbody = document.querySelector("#uTbl tbody");
  tbody.innerHTML = "";

  for (const u of uploads) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${formatTs(u.created_at)}</td>
      <td>${escapeHtml(u.filename || "")}</td>
      <td>${escapeHtml(u.status || "")}</td>
      <td>${u.rows_total ?? 0}</td>
      <td>${u.rows_valid ?? 0}</td>
      <td>${u.rows_invalid ?? 0}</td>
      <td class="muted">${escapeHtml(String(u.uploaded_by || ""))}</td>
      <td>
        <button class="btn btnLight" data-del-upload="${u.id}" ${u.status === "deleted" ? "disabled" : ""}>
          Eliminar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-del-upload]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-del-upload"), 10);
      await deleteUpload(id);
    });
  });
}

// ====== Acciones ======

async function createFinca() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado para crear fincas.");

  const nombre = document.getElementById("newFincaNombre").value.trim();
  if (!nombre) return setStatus("Nombre de finca requerido.");

  setStatus("Creando finca...");
  const { error } = await supabase.from("fincas").insert({ nombre });
  if (error) return setStatus("Error creando finca: " + error.message);

  document.getElementById("newFincaNombre").value = "";
  await reloadAll();
  setStatus("Finca creada.");
}

async function saveFincaName(fincaId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado para editar fincas.");

  const input = document.querySelector(`input[data-finca-nombre="${fincaId}"]`);
  const nombre = input.value.trim();
  if (!nombre) return setStatus("Nombre no puede estar vacío.");

  setStatus("Guardando finca...");
  const { error } = await supabase.from("fincas").update({ nombre }).eq("id", fincaId);
  if (error) return setStatus("Error guardando finca: " + error.message);

  await reloadAll();
  setStatus("Finca actualizada.");
}

async function deleteFinca(fincaId) {
  if (myRole !== "owner") return setStatus("Solo owner puede borrar fincas.");

  if (!confirm("¿Borrar finca? Esto borrará sus bloques (cascade).")) return;

  setStatus("Borrando finca...");
  const { error } = await supabase.from("fincas").delete().eq("id", fincaId);
  if (error) return setStatus("Error borrando finca: " + error.message);

  await reloadAll();
  setStatus("Finca borrada.");
}

async function createBloque() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado para crear bloques.");

  const finca_id = parseInt(document.getElementById("newBloqueFinca").value, 10);
  const nombre = document.getElementById("newBloqueNombre").value.trim();
  const plantas_total = numOrNull(document.getElementById("newBloquePlantas").value);
  const porcentaje = numOrNull(document.getElementById("newBloquePct").value);
  const plantas_muestreo = numOrNull(document.getElementById("newBloqueMuestreo").value);

  if (!finca_id || !nombre) return setStatus("Finca y nombre de bloque son requeridos.");

  setStatus("Creando bloque...");
  const payload = { finca_id, nombre, plantas_total, porcentaje, plantas_muestreo };

  const { error } = await supabase.from("bloques").insert(payload);
  if (error) return setStatus("Error creando bloque: " + error.message);

  document.getElementById("newBloqueNombre").value = "";
  document.getElementById("newBloquePlantas").value = "";
  document.getElementById("newBloquePct").value = "";
  document.getElementById("newBloqueMuestreo").value = "";

  await reloadAll();
  setStatus("Bloque creado.");
}

async function saveBloque(bloqueId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado para editar bloques.");

  const nombre = document.querySelector(`input[data-bloque-nombre="${bloqueId}"]`).value.trim();
  const plantas_total = numOrNull(document.querySelector(`input[data-bloque-plantas="${bloqueId}"]`).value);
  const porcentaje = numOrNull(document.querySelector(`input[data-bloque-pct="${bloqueId}"]`).value);
  const plantas_muestreo = numOrNull(document.querySelector(`input[data-bloque-muestreo="${bloqueId}"]`).value);

  if (!nombre) return setStatus("Nombre de bloque no puede estar vacío.");

  setStatus("Guardando bloque...");
  const { error } = await supabase
    .from("bloques")
    .update({ nombre, plantas_total, porcentaje, plantas_muestreo })
    .eq("id", bloqueId);

  if (error) return setStatus("Error guardando bloque: " + error.message);

  await reloadAll();
  setStatus("Bloque actualizado.");
}

async function deleteBloque(bloqueId) {
  if (myRole !== "owner") return setStatus("Solo owner puede borrar bloques.");

  if (!confirm("¿Borrar bloque?")) return;

  setStatus("Borrando bloque...");
  const { error } = await supabase.from("bloques").delete().eq("id", bloqueId);
  if (error) return setStatus("Error borrando bloque: " + error.message);

  await reloadAll();
  setStatus("Bloque borrado.");
}

async function saveGeojson() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado para editar GeoJSON.");

  const finca_id = parseInt(document.getElementById("geoFincaSelect").value, 10);
  const txt = document.getElementById("geojsonText").value.trim();

  let geojson = null;
  try {
    geojson = txt ? JSON.parse(txt) : null;
  } catch {
    return setStatus("GeoJSON inválido: el texto no es JSON válido.");
  }

  setStatus("Guardando GeoJSON...");
  const { error } = await supabase.from("fincas").update({ geojson }).eq("id", finca_id);
  if (error) return setStatus("Error guardando GeoJSON: " + error.message);

  await reloadAll();
  setStatus("GeoJSON guardado.");
}

async function deleteUpload(uploadId) {
  if (!confirm(`¿Eliminar la carga ${uploadId}? Esto borrará los monitoreos asociados.`)) return;

  setStatus("Eliminando carga...");
  const { data, error } = await supabase.rpc("delete_upload", { p_upload_id: uploadId }); // [web:144]
  if (error) return setStatus("Error eliminando carga: " + error.message);

  await reloadUploads();
  renderUploads();

  setStatus("Carga eliminada. Resultado: " + JSON.stringify(data));
}

// ====== Utils ======

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatTs(ts) {
  try { return new Date(ts).toLocaleString("es-DO"); }
  catch { return String(ts ?? ""); }
}

function numOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function val(v) {
  return (v === null || v === undefined) ? "" : String(v);
}
