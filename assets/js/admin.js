import { requireAuth } from "./authGuard.js";
import { supabase } from "./supabaseClient.js";
import { fetchFincas, fetchBloquesByFinca } from "./data.js";

const user = await requireAuth();

let myRole   = null;
let fincas   = [];
let bloques  = [];
let uploads  = [];
let tecnicos = [];   // ← NUEVO: catálogo de técnicos de campo

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
    document.getElementById("secCargas").style.display    = v === "cargas"    ? "" : "none";
  });

  document.getElementById("btnCreateFinca").addEventListener("click", createFinca);
  document.getElementById("btnCreateBloque").addEventListener("click", createBloque);
  document.getElementById("btnSaveGeojson").addEventListener("click", saveGeojson);
  document.getElementById("geoFincaSelect").addEventListener("change", loadGeojsonTextarea);

  document.getElementById("fincaFilter").addEventListener("change", async () => {
    await reloadBloques();
    renderBloques();
  });

  // ← NUEVO: técnicos
  document.getElementById("btnCreateTecnico").addEventListener("click", createTecnico);

  document.getElementById("btnLogoutLink").addEventListener("click", async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signOut();
    if (error) return setStatus("Error cerrando sesión: " + (error.message || error));
    window.location.href = "login.html";
  });
}

async function loadMyRole() {
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
  const canEdit = myRole === "owner" || myRole === "editor";

  document.getElementById("btnCreateFinca").disabled   = !canEdit;
  document.getElementById("btnCreateBloque").disabled  = !canEdit;
  document.getElementById("btnSaveGeojson").disabled   = !canEdit;
  // ← NUEVO: aplicar rol al botón de técnicos
  document.getElementById("btnCreateTecnico").disabled = !canEdit;
}

async function reloadAll() {
  try {
    setStatus("Cargando catálogos...");
    await reloadFincas();
    await reloadBloques();
    await reloadTecnicos();   // ← NUEVO
    fillSelects();
    renderFincas();
    renderBloques();
    renderTecnicos();          // ← NUEVO

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
  const fincaFilterVal = document.getElementById("fincaFilter").value;
  bloques = [];

  if (fincaFilterVal) {
    const finca_id = parseInt(fincaFilterVal, 10);
    const f  = fincas.find(x => x.id === finca_id);
    const bs = await fetchBloquesByFinca(finca_id);
    for (const b of bs) bloques.push({ finca: f?.nombre || "", ...b });
  } else {
    for (const f of fincas) {
      const bs = await fetchBloquesByFinca(f.id);
      for (const b of bs) bloques.push({ finca: f.nombre, ...b });
    }
  }
}

// ── NUEVO: Técnicos ──────────────────────────────────────────────────────────
// Carga todos los técnicos — activos e inactivos — para gestión en admin.
// Los demás módulos (monitoreo, control, dashboard) usan fetchTecnicos()
// de data.js que filtra activo = true.
async function reloadTecnicos() {
  const { data, error } = await supabase
    .from("tecnicos")
    .select("id, nombre, rol, activo")
    .order("nombre", { ascending: true });

  if (error) throw error;
  tecnicos = data || [];
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

// ── Render ───────────────────────────────────────────────────────────────────

function fillSelects() {
  const ff = document.getElementById("fincaFilter");
  const nb = document.getElementById("newBloqueFinca");
  const gf = document.getElementById("geoFincaSelect");

  ff.innerHTML = `<option value="">Todas</option>`;
  nb.innerHTML = ``;
  gf.innerHTML = ``;

  for (const f of fincas) {
    const makeOpt = () => {
      const o = document.createElement("option");
      o.value = f.id; o.textContent = f.nombre; return o;
    };
    ff.appendChild(makeOpt());
    nb.appendChild(makeOpt());
    gf.appendChild(makeOpt());
  }

  if (fincas.length) {
    if (!gf.value) gf.value = String(fincas[0].id);
    loadGeojsonTextarea();
  }
}

function loadGeojsonTextarea() {
  const fincaId = parseInt(document.getElementById("geoFincaSelect").value, 10);
  const f = fincas.find(x => x.id === fincaId);
  document.getElementById("geojsonText").value =
    f?.geojson ? JSON.stringify(f.geojson, null, 2) : "";
}

function renderFincas() {
  const tbody  = document.querySelector("#fTbl tbody");
  tbody.innerHTML = "";
  const isOwner = myRole === "owner";
  const canEdit = myRole === "owner" || myRole === "editor";

  for (const f of fincas) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.id}</td>
      <td>
        <input data-finca-nombre="${f.id}" value="${escapeHtml(f.nombre)}"
               ${canEdit ? "" : "disabled"} style="width:220px" />
      </td>
      <td>${f.geojson ? "Sí" : "No"}</td>
      <td>
        <button class="btn btnLight" data-save-finca="${f.id}"  ${canEdit  ? "" : "disabled"}>Guardar</button>
        <button class="btn btnLight" data-del-finca="${f.id}"   ${isOwner  ? "" : "disabled"}>Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-save-finca]").forEach(btn =>
    btn.addEventListener("click", () => saveFincaName(parseInt(btn.dataset.saveFinca, 10))));
  tbody.querySelectorAll("[data-del-finca]").forEach(btn =>
    btn.addEventListener("click", () => deleteFinca(parseInt(btn.dataset.delFinca, 10))));
}

function renderBloques() {
  const tbody  = document.querySelector("#bTbl tbody");
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
               ${canEdit ? "" : "disabled"} style="width:180px" />
      </td>
      <td><input data-bloque-plantas="${b.id}"   type="number" value="${val(b.plantas_total)}"    ${canEdit ? "" : "disabled"} style="width:90px"/></td>
      <td><input data-bloque-pct="${b.id}"        type="number" step="0.1" value="${val(b.porcentaje)}" ${canEdit ? "" : "disabled"} style="width:80px"/></td>
      <td><input data-bloque-muestreo="${b.id}"   type="number" value="${val(b.plantas_muestreo)}"${canEdit ? "" : "disabled"} style="width:90px"/></td>
      <td>
        <button class="btn btnLight" data-save-bloque="${b.id}" ${canEdit  ? "" : "disabled"}>Guardar</button>
        <button class="btn btnLight" data-del-bloque="${b.id}"  ${isOwner  ? "" : "disabled"}>Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-save-bloque]").forEach(btn =>
    btn.addEventListener("click", () => saveBloque(parseInt(btn.dataset.saveBloque, 10))));
  tbody.querySelectorAll("[data-del-bloque]").forEach(btn =>
    btn.addEventListener("click", () => deleteBloque(parseInt(btn.dataset.delBloque, 10))));
}

// ── NUEVO: renderTecnicos ────────────────────────────────────────────────────
// Columna "Activo" usa toggle en vez de borrar directamente:
// desactivar oculta al técnico de los selects sin perder el historial.
// Borrar permanente solo para owner (y solo si no tiene registros asociados).
function renderTecnicos() {
  const tbody  = document.querySelector("#tTbl tbody");
  tbody.innerHTML = "";
  const isOwner = myRole === "owner";
  const canEdit = myRole === "owner" || myRole === "editor";

  if (!tecnicos.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">
      Sin técnicos registrados</td></tr>`;
    return;
  }

  for (const t of tecnicos) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t.id}</td>
      <td>
        <input data-tec-nombre="${t.id}" value="${escapeHtml(t.nombre)}"
               ${canEdit ? "" : "disabled"} style="width:200px" />
      </td>
      <td>
        <input data-tec-rol="${t.id}" value="${escapeHtml(t.rol || "")}"
               placeholder="Técnico de campo"
               ${canEdit ? "" : "disabled"} style="width:160px" />
      </td>
      <td>
        <button class="btn btnLight" data-toggle-tec="${t.id}"
                style="min-width:90px;${t.activo ? "" : "opacity:.55"}">
          ${t.activo ? "Activo" : "Inactivo"}
        </button>
      </td>
      <td>
        <button class="btn btnLight" data-save-tec="${t.id}"  ${canEdit  ? "" : "disabled"}>Guardar</button>
        <button class="btn btnLight" data-del-tec="${t.id}"   ${isOwner  ? "" : "disabled"}>Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-save-tec]").forEach(btn =>
    btn.addEventListener("click", () => saveTecnico(parseInt(btn.dataset.saveTec, 10))));

  tbody.querySelectorAll("[data-toggle-tec]").forEach(btn =>
    btn.addEventListener("click", () => toggleActivoTecnico(parseInt(btn.dataset.toggleTec, 10))));

  tbody.querySelectorAll("[data-del-tec]").forEach(btn =>
    btn.addEventListener("click", () => deleteTecnico(parseInt(btn.dataset.delTec, 10))));
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
      <td>${u.rows_total    ?? 0}</td>
      <td>${u.rows_valid    ?? 0}</td>
      <td>${u.rows_invalid  ?? 0}</td>
      <td class="muted">${escapeHtml(String(u.uploaded_by || ""))}</td>
      <td>
        <button class="btn btnLight" data-del-upload="${u.id}"
                ${u.status === "deleted" ? "disabled" : ""}>Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-del-upload]").forEach(btn =>
    btn.addEventListener("click", () => deleteUpload(parseInt(btn.dataset.delUpload, 10))));
}

// ── Acciones: Fincas ─────────────────────────────────────────────────────────

async function createFinca() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const nombre = document.getElementById("newFincaNombre").value.trim();
  if (!nombre) return setStatus("Nombre de finca requerido.");
  setStatus("Creando finca...");
  const { error } = await supabase.from("fincas").insert({ nombre });
  if (error) return setStatus("Error: " + error.message);
  document.getElementById("newFincaNombre").value = "";
  await reloadAll();
  setStatus("Finca creada.");
}

async function saveFincaName(fincaId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const nombre = document.querySelector(`input[data-finca-nombre="${fincaId}"]`).value.trim();
  if (!nombre) return setStatus("Nombre no puede estar vacío.");
  setStatus("Guardando finca...");
  const { error } = await supabase.from("fincas").update({ nombre }).eq("id", fincaId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Finca actualizada.");
}

async function deleteFinca(fincaId) {
  if (myRole !== "owner") return setStatus("Solo owner puede borrar fincas.");
  if (!confirm("¿Borrar finca? Esto borrará sus bloques (cascade).")) return;
  setStatus("Borrando finca...");
  const { error } = await supabase.from("fincas").delete().eq("id", fincaId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Finca borrada.");
}

// ── Acciones: Bloques ────────────────────────────────────────────────────────

async function createBloque() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const finca_id        = parseInt(document.getElementById("newBloqueFinca").value, 10);
  const nombre          = document.getElementById("newBloqueNombre").value.trim();
  const plantas_total   = numOrNull(document.getElementById("newBloquePlantas").value);
  const porcentaje      = numOrNull(document.getElementById("newBloquePct").value);
  const plantas_muestreo = numOrNull(document.getElementById("newBloqueMuestreo").value);

  if (!finca_id || !nombre) return setStatus("Finca y nombre de bloque son requeridos.");
  setStatus("Creando bloque...");
  const { error } = await supabase.from("bloques")
    .insert({ finca_id, nombre, plantas_total, porcentaje, plantas_muestreo });
  if (error) return setStatus("Error: " + error.message);

  ["newBloqueNombre","newBloquePlantas","newBloquePct","newBloqueMuestreo"]
    .forEach(id => { document.getElementById(id).value = ""; });

  await reloadAll();
  setStatus("Bloque creado.");
}

async function saveBloque(bloqueId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const nombre          = document.querySelector(`input[data-bloque-nombre="${bloqueId}"]`).value.trim();
  const plantas_total   = numOrNull(document.querySelector(`input[data-bloque-plantas="${bloqueId}"]`).value);
  const porcentaje      = numOrNull(document.querySelector(`input[data-bloque-pct="${bloqueId}"]`).value);
  const plantas_muestreo = numOrNull(document.querySelector(`input[data-bloque-muestreo="${bloqueId}"]`).value);

  if (!nombre) return setStatus("Nombre de bloque no puede estar vacío.");
  setStatus("Guardando bloque...");
  const { error } = await supabase.from("bloques")
    .update({ nombre, plantas_total, porcentaje, plantas_muestreo }).eq("id", bloqueId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Bloque actualizado.");
}

async function deleteBloque(bloqueId) {
  if (myRole !== "owner") return setStatus("Solo owner puede borrar bloques.");
  if (!confirm("¿Borrar bloque?")) return;
  setStatus("Borrando bloque...");
  const { error } = await supabase.from("bloques").delete().eq("id", bloqueId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Bloque borrado.");
}

// ── Acciones: Técnicos ───────────────────────────────────────────────────────

async function createTecnico() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const nombre = document.getElementById("newTecnicoNombre").value.trim();
  const rol    = document.getElementById("newTecnicoRol").value.trim() || null;
  if (!nombre) return setStatus("Nombre del técnico requerido.");

  setStatus("Creando técnico...");
  const { error } = await supabase.from("tecnicos").insert({ nombre, rol, activo: true });
  if (error) return setStatus("Error: " + error.message);

  document.getElementById("newTecnicoNombre").value = "";
  document.getElementById("newTecnicoRol").value    = "";
  await reloadAll();
  setStatus("Técnico creado.");
}

async function saveTecnico(tecnicoId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const nombre = document.querySelector(`input[data-tec-nombre="${tecnicoId}"]`).value.trim();
  const rol    = document.querySelector(`input[data-tec-rol="${tecnicoId}"]`).value.trim() || null;
  if (!nombre) return setStatus("Nombre del técnico no puede estar vacío.");

  setStatus("Guardando técnico...");
  const { error } = await supabase.from("tecnicos")
    .update({ nombre, rol }).eq("id", tecnicoId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Técnico actualizado.");
}

// Desactivar oculta al técnico de los <select> sin borrar su historial.
// Los registros de monitoreo y control mantienen su referencia intacta.
async function toggleActivoTecnico(tecnicoId) {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const t = tecnicos.find(x => x.id === tecnicoId);
  if (!t) return;

  setStatus("Actualizando estado...");
  const { error } = await supabase.from("tecnicos")
    .update({ activo: !t.activo }).eq("id", tecnicoId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus(`Técnico ${!t.activo ? "activado" : "desactivado"}.`);
}

// Borrar permanente — solo owner. Fallará en BD si el técnico tiene
// registros asociados con FK NOT NULL (Supabase devolverá error 23503).
async function deleteTecnico(tecnicoId) {
  if (myRole !== "owner") return setStatus("Solo owner puede borrar técnicos.");
  if (!confirm("¿Borrar técnico permanentemente? Los registros asociados quedarán sin técnico asignado.")) return;

  setStatus("Borrando técnico...");
  const { error } = await supabase.from("tecnicos").delete().eq("id", tecnicoId);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("Técnico borrado.");
}

// ── Acciones: GeoJSON y Uploads ──────────────────────────────────────────────

async function saveGeojson() {
  if (!(myRole === "owner" || myRole === "editor")) return setStatus("No autorizado.");
  const finca_id = parseInt(document.getElementById("geoFincaSelect").value, 10);
  const txt = document.getElementById("geojsonText").value.trim();

  let geojson = null;
  try { geojson = txt ? JSON.parse(txt) : null; }
  catch { return setStatus("GeoJSON inválido: el texto no es JSON válido."); }

  setStatus("Guardando GeoJSON...");
  const { error } = await supabase.from("fincas").update({ geojson }).eq("id", finca_id);
  if (error) return setStatus("Error: " + error.message);
  await reloadAll();
  setStatus("GeoJSON guardado.");
}

async function deleteUpload(uploadId) {
  if (!confirm(`¿Eliminar la carga ${uploadId}? Esto borrará los monitoreos asociados.`)) return;
  setStatus("Eliminando carga...");
  const { data, error } = await supabase.rpc("delete_upload", { p_upload_id: uploadId });
  if (error) return setStatus("Error: " + error.message);
  await reloadUploads();
  renderUploads();
  setStatus("Carga eliminada. Resultado: " + JSON.stringify(data));
}

// ── Utils ────────────────────────────────────────────────────────────────────

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
