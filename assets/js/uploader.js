// assets/js/uploader.js
import { requireAuth } from "./authGuard.js";
import { supabase } from "./supabaseClient.js";
import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchTecnicos,
  upsertMonitoreos
} from "./data.js";
import {
  normalizeText,
  parseDateFlexible,
  isValidISODate,
  toFloat,
  toInt,
  chunk
} from "./utils.js";

const STORAGE_ENABLED = false;
const STORAGE_BUCKET  = "uploads";

let fincas            = [];
let fincaByNormName   = new Map();
let bloquesByFinca    = new Map();
let tecnicoByNormName = new Map();

let selectedFile = null;

init();

async function init() {
  await requireAuth();
  setupDropzone();
  await loadCatalogs();
  await loadUploadHistory();
  document.getElementById("btnReloadUploads")
    ?.addEventListener("click", loadUploadHistory);
}

function setupDropzone() {
  const dz  = document.getElementById("dropzone");
  const fi  = document.getElementById("fileInput");
  const btn = document.getElementById("btnProcess");

  dz.addEventListener("dragover",  (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", ()  => dz.classList.remove("drag"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("drag");
    if (e.dataTransfer.files?.length) setFile(e.dataTransfer.files[0]);
  });

  fi.addEventListener("change", () => {
    if (fi.files?.length) setFile(fi.files[0]);
  });

  btn.addEventListener("click", async () => {
    if (!selectedFile) return;
    await processAndUpload(selectedFile);
  });
}

function setFile(file) {
  selectedFile = file;
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("btnProcess").disabled  = false;
  clearErrors();
  setSummary("");
}

async function loadCatalogs() {
  // Fincas
  fincas = await fetchFincas();
  fincaByNormName.clear();
  for (const f of fincas) {
    fincaByNormName.set(normalizeText(f.nombre), f);
  }

  // Bloques por finca
  bloquesByFinca.clear();
  for (const f of fincas) {
    const bloques = await fetchBloquesByFinca(f.id);
    const map = new Map();
    for (const b of bloques) {
      map.set(normalizeText(b.nombre), b.id);
      const m = String(b.nombre).match(/(\d+)/);
      if (m) map.set(normalizeText(m[1]), b.id);
    }
    bloquesByFinca.set(f.id, map);
  }

  // Técnicos activos (solo para normalizar nombres si coinciden)
  tecnicoByNormName.clear();
  const tecnicos = await fetchTecnicos();
  for (const t of tecnicos) {
    tecnicoByNormName.set(normalizeText(t.nombre), t.nombre);
  }
}

async function getOrCreateFinca(nombreRaw) {
  const norm = normalizeText(nombreRaw);
  if (fincaByNormName.has(norm)) return fincaByNormName.get(norm);

  const nombre = String(nombreRaw).trim();
  const { data, error } = await supabase
    .from("fincas")
    .insert({ nombre })
    .select("id, nombre")
    .single();

  if (error) throw new Error(`No se pudo crear la finca "${nombre}": ${error.message}`);

  fincaByNormName.set(norm, data);
  bloquesByFinca.set(data.id, new Map());
  fincas.push(data);
  return data;
}

async function getOrCreateBloque(finca, nombreRaw) {
  const norm = normalizeText(nombreRaw);
  const bMap = bloquesByFinca.get(finca.id) ?? new Map();

  if (bMap.has(norm)) return bMap.get(norm);

  const numMatch = String(nombreRaw).match(/(\d+)/);
  if (numMatch && bMap.has(normalizeText(numMatch[1]))) {
    return bMap.get(normalizeText(numMatch[1]));
  }

  const nombre = String(nombreRaw).trim();
  const { data, error } = await supabase
    .from("bloques")
    .insert({ finca_id: finca.id, nombre })
    .select("id, nombre")
    .single();

  if (error) throw new Error(`No se pudo crear el bloque "${nombre}": ${error.message}`);

  bMap.set(norm, data.id);
  if (numMatch) bMap.set(normalizeText(numMatch[1]), data.id);
  bloquesByFinca.set(finca.id, bMap);
  return data.id;
}

async function processAndUpload(file) {
  clearErrors();
  setProgress(0);
  setSummary("");

  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr) { setSummary("Error de sesión: " + (uerr.message || uerr)); return; }
  if (!user) { setSummary("Necesitas iniciar sesión para subir archivos."); return; }

  let uploadId = null;
  let filePath = null;

  try {
    const { data: up, error: e1 } = await supabase
      .from("uploads")
      .insert({ uploaded_by: user.id, filename: file.name, status: "processing" })
      .select("id")
      .single();
    if (e1) throw e1;
    uploadId = up.id;
  } catch (e) {
    setSummary("No se pudo crear el registro de carga: " + (e.message || e));
    return;
  }

  if (STORAGE_ENABLED) {
    try {
      const safeName = sanitizeFileName(file.name);
      const path     = `${user.id}/${uploadId}/${Date.now()}_${safeName}`;
      const { error: se } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (se) throw se;
      filePath = path;
      const { error: e2 } = await supabase.from("uploads").update({ file_path: filePath }).eq("id", uploadId);
      if (e2) throw e2;
    } catch (e) {
      await supabase.from("uploads")
        .update({ notes: "Storage upload falló: " + (e.message || e) })
        .eq("id", uploadId);
    }
  }

  let rows = [];
  const ext = file.name.toLowerCase().endsWith(".csv")  ? "csv"
            : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx"
            : null;

  if (!ext) {
    await markUploadFailed(uploadId, "Archivo no soportado. Usa .csv o .xlsx");
    setSummary("Archivo no soportado. Usa .csv o .xlsx");
    return;
  }

  try {
    rows = ext === "csv" ? await parseCSV(file) : await parseXLSX(file);
  } catch (e) {
    await markUploadFailed(uploadId, "Error leyendo archivo: " + (e.message || e));
    setSummary("Error leyendo archivo: " + (e.message || e));
    return;
  }

  const { valid, errors } = await normalizeAndValidate(rows);

  for (const r of valid) {
    r.upload_id   = uploadId;
    r.uploaded_by = user.id;
  }

  renderErrors(errors);

  try {
    await supabase.from("uploads")
      .update({ rows_total: rows.length, rows_valid: valid.length, rows_invalid: errors.length })
      .eq("id", uploadId);

    if (valid.length === 0) {
      await supabase.from("uploads")
        .update({ status: "failed", notes: "Cero filas válidas" })
        .eq("id", uploadId);
      setSummary("No hay filas válidas para subir.");
      setProgress(0);
      await loadUploadHistory();
      return;
    }

    const batches = chunk(valid, 500);
    let done = 0;

    for (const b of batches) {
      await upsertMonitoreos(b);
      done += b.length;
      setProgress(Math.round((done / valid.length) * 100));
    }

    await supabase.from("uploads").update({ status: "done" }).eq("id", uploadId);

    setSummary(
      `Listo.\n` +
      `Upload ID: ${uploadId}\n` +
      `Filas totales leídas: ${rows.length}\n` +
      `Subidas (válidas): ${valid.length}\n` +
      `Omitidas (errores): ${errors.length}\n` +
      (filePath ? `Archivo guardado en Storage: ${filePath}\n` : "")
    );

    await loadUploadHistory();
  } catch (e) {
    await markUploadFailed(uploadId, "Error subiendo lotes: " + (e.message || e));
    setSummary("Error subiendo lotes: " + (e.message || e));
    await loadUploadHistory();
  }
}

async function markUploadFailed(uploadId, notes) {
  await supabase.from("uploads")
    .update({ status: "failed", notes: String(notes || "") })
    .eq("id", uploadId);
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error:    (err) => reject(err),
    });
  });
}

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload  = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (e) { reject(e); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function pick(obj, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  for (const [kk, vv] of Object.entries(obj)) {
    const nk = normalizeText(kk);
    for (const k of keys) {
      if (nk === normalizeText(k)) return vv;
    }
  }
  return undefined;
}

async function normalizeAndValidate(rawRows) {
  const valid  = [];
  const errors = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r      = rawRows[idx];
    const rowNum = idx + 2;

    const fechaRaw  = pick(r, ["Fecha", "FECHA", "date", "DATE"]);
    const fincaRaw  = pick(r, ["Finca", "FINCA", "Farm", "FARM"]);
    const bloqueRaw = pick(r, ["Bloque", "BLOQUE", "Block", "BLOCK"]);
    const tecnicoRaw = pick(r, ["Técnico", "Tecnico", "TECNICO", "Tecnico/a", "Technician"]);

    const brotesHojasRaw   = pick(r, ["BrotesHojas",    "Brotes hojas",    "brotes_hojas",    "Brotes"]);
    const hojasRaw         = pick(r, ["HojasAdultas",   "Hojas adultas",   "hojas_adultas",   "Hojas"]);
    const brotesLimonesRaw = pick(r, ["BrotesLimones",  "Brotes limones",  "brotes_limones",  "Limones"]);
    const botonesRaw       = pick(r, ["BotonesFlorales","Botones florales","botones_florales","Botones"]);

    // Fecha — único campo realmente obligatorio junto a finca
    const fecha = parseDateFlexible(fechaRaw);
    if (!fecha || !isValidISODate(fecha)) {
      errors.push({ rowNum, reason: "Fecha inválida", data: String(fechaRaw ?? "") });
      continue;
    }

    // Finca
    if (!String(fincaRaw ?? "").trim()) {
      errors.push({ rowNum, reason: "Finca vacía", data: "" });
      continue;
    }
    let finca;
    try {
      finca = await getOrCreateFinca(fincaRaw);
    } catch (e) {
      errors.push({ rowNum, reason: e.message, data: String(fincaRaw ?? "") });
      continue;
    }

    // Bloque (opcional)
    let bloque_id = null;
    if (String(bloqueRaw ?? "").trim()) {
      try {
        bloque_id = await getOrCreateBloque(finca, bloqueRaw);
      } catch (e) {
        errors.push({ rowNum, reason: e.message, data: String(bloqueRaw ?? "") });
        continue;
      }
    }

    // Técnico — si coincide con el catálogo usa el nombre canónico,
    // si no coincide lo guarda tal como viene sin advertencia ni rechazo
    let tecnico = null;
    const tecnicoStr = String(tecnicoRaw ?? "").trim();
    if (tecnicoStr) {
      const norm = normalizeText(tecnicoStr);
      tecnico = tecnicoByNormName.has(norm)
        ? tecnicoByNormName.get(norm)
        : tecnicoStr;
    }

    // lat/lon siempre null — eliminados del sistema
    const lat = null;
    const lon = null;

    // Fingerprint: usa ec5_uuid si existe, si no construye clave estable
    const ec5uuid = pick(r, ["ec5_uuid", "EC5_UUID", "uuid", "UUID"]) ?? "";
    const fingerprint = String(ec5uuid).trim()
      ? String(ec5uuid).trim()
      : [fecha, finca.id, bloque_id ?? "", normalizeText(tecnico ?? ""), rowNum].join("|");

    valid.push({
      fecha,
      finca_id:         finca.id,
      bloque_id,
      lat,
      lon,
      tecnico,
      brotes_hojas:     Math.max(0, toInt(brotesHojasRaw,   0)),
      hojas_adultas:    Math.max(0, toInt(hojasRaw,         0)),
      brotes_limones:   Math.max(0, toInt(brotesLimonesRaw, 0)),
      botones_florales: Math.max(0, toInt(botonesRaw,       0)),
      fingerprint,
    });
  }

  return { valid, errors };
}

// ========= Historial de cargas =========

async function loadUploadHistory() {
  const tbody = document.querySelector("#uploadTbl tbody");
  if (!tbody) return;

  const { data, error } = await supabase
    .from("uploads")
    .select("id,created_at,filename,status,rows_total,rows_valid,rows_invalid")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8">Error cargando uploads: ${escapeHtml(error.message || String(error))}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  for (const u of (data || [])) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${formatTs(u.created_at)}</td>
      <td>${escapeHtml(u.filename || "")}</td>
      <td>${escapeHtml(u.status   || "")}</td>
      <td>${u.rows_total   ?? 0}</td>
      <td>${u.rows_valid   ?? 0}</td>
      <td>${u.rows_invalid ?? 0}</td>
      <td>
        <button class="btn btnLight" data-del-upload="${u.id}"
          ${u.status === "deleted" ? "disabled" : ""}>
          Eliminar
        </button>
      </td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button[data-del-upload]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = parseInt(btn.getAttribute("data-del-upload"), 10);
      await deleteUpload(id);
    });
  });
}

async function deleteUpload(uploadId) {
  if (!confirm(`¿Eliminar la carga ${uploadId}? Esto borrará sus monitoreos asociados.`)) return;
  setSummary("Eliminando carga...");
  const { data, error } = await supabase.rpc("delete_upload", { p_upload_id: uploadId });
  if (error) {
    setSummary("Error eliminando: " + (error.message || error));
    return;
  }
  setSummary(`Carga eliminada. Monitoreos borrados: ${JSON.stringify(data)}`);
  await loadUploadHistory();
}

// ========= UI helpers =========

function renderErrors(list) {
  const tbody = document.querySelector("#errTbl tbody");
  tbody.innerHTML = "";
  for (const e of list.slice(0, 500)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.rowNum}</td><td>${e.reason}</td><td>${escapeHtml(e.data)}</td>`;
    tbody.appendChild(tr);
  }
  if (list.length > 500) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">Mostrando 500 de ${list.length} errores.</td>`;
    tbody.appendChild(tr);
  }
}

function clearErrors() {
  document.querySelector("#errTbl tbody").innerHTML = "";
}

function setProgress(pct) {
  document.getElementById("progressBar").style.width  = `${pct}%`;
  document.getElementById("progressText").textContent = `${pct}%`;
}

function setSummary(msg) {
  document.getElementById("uploadSummary").textContent = msg || "";
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

function sanitizeFileName(name) {
  return String(name || "archivo")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 140);
}
