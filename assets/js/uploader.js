import { requireAuth } from "./authGuard.js";
import { supabase } from "./supabaseClient.js";
import { fetchFincas, fetchBloquesByFinca, upsertMonitoreos } from "./data.js";
import { normalizeText, parseDateFlexible, isValidISODate, toFloat, toInt, chunk } from "./utils.js";

// ====== OPCIONAL: guardar archivo original en Storage ======
const STORAGE_ENABLED = false;         // <-- pon true si quieres guardar el XLSX/CSV en Supabase Storage
const STORAGE_BUCKET = "uploads";      // <-- crea este bucket en Supabase si STORAGE_ENABLED=true

let fincas = [];
let fincaByNormName = new Map();
let bloquesByFinca = new Map(); // finca_id -> Map(normBloqueName -> bloque_id)

let selectedFile = null;

init();

async function init() {
  await requireAuth(); // si no hay sesión, redirige al login [web:81]
  setupDropzone();
  await loadCatalogs();
  await loadUploadHistory();

  document.getElementById("btnReloadUploads")?.addEventListener("click", loadUploadHistory);
}

function setupDropzone() {
  const dz = document.getElementById("dropzone");
  const fi = document.getElementById("fileInput");
  const btn = document.getElementById("btnProcess");

  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
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
  document.getElementById("btnProcess").disabled = false;
  clearErrors();
  setSummary("");
}

async function loadCatalogs() {
  fincas = await fetchFincas();
  fincaByNormName.clear();

  for (const f of fincas) {
    fincaByNormName.set(normalizeText(f.nombre), f);
  }

  // precargar bloques por finca (para mapear nombres)
  bloquesByFinca.clear();
  for (const f of fincas) {
    const bloques = await fetchBloquesByFinca(f.id);
    const map = new Map();

    for (const b of bloques) {
      map.set(normalizeText(b.nombre), b.id);

      // alias: "1" -> "BLOQUE 1"
      const m = String(b.nombre).match(/(\d+)/);
      if (m) map.set(normalizeText(m[1]), b.id);
    }
    bloquesByFinca.set(f.id, map);
  }
}

// Crea una finca si no existe y la agrega al catálogo en memoria
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

// Crea un bloque si no existe y lo agrega al catálogo en memoria
async function getOrCreateBloque(finca, nombreRaw) {
  const norm = normalizeText(nombreRaw);
  const bMap = bloquesByFinca.get(finca.id) ?? new Map();

  if (bMap.has(norm)) return bMap.get(norm);

  // alias numérico: "1" -> "Bloque 1"
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

  // 1) Confirmar usuario logueado
  const { data: { user }, error: uerr } = await supabase.auth.getUser(); // [web:81]
  if (uerr) {
    setSummary("Error de sesión: " + (uerr.message || uerr));
    return;
  }
  if (!user) {
    setSummary("Necesitas iniciar sesión para subir archivos.");
    return;
  }

  // 2) Crear registro en uploads
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
    setSummary("No se pudo crear el registro de carga (uploads): " + (e.message || e));
    return;
  }

  // 3) (Opcional) subir archivo original a Storage y guardar file_path
  if (STORAGE_ENABLED) {
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `${user.id}/${uploadId}/${Date.now()}_${safeName}`;

      const { error: se } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" }); // [web:132]

      if (se) throw se;
      filePath = path;

      const { error: e2 } = await supabase.from("uploads").update({ file_path: filePath }).eq("id", uploadId);
      if (e2) throw e2;
    } catch (e) {
      // Si falla Storage, seguimos (pero dejamos nota)
      await supabase.from("uploads").update({ notes: "Storage upload falló: " + (e.message || e) }).eq("id", uploadId);
    }
  }

  // 4) Parsear archivo
  let rows = [];
  const ext = file.name.toLowerCase().endsWith(".csv")
    ? "csv"
    : file.name.toLowerCase().endsWith(".xlsx")
      ? "xlsx"
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

  // 5) Normalizar/validar
  const { valid, errors } = await normalizeAndValidate(rows);

  // Adjuntar upload_id y uploaded_by a cada fila válida (para trazabilidad y borrado por carga)
  for (const r of valid) {
    r.upload_id = uploadId;
    r.uploaded_by = user.id;
  }

  renderErrors(errors);

  // 6) Subida por lotes (no bloquea por errores de filas)
  try {
    await supabase
      .from("uploads")
      .update({ rows_total: rows.length, rows_valid: valid.length, rows_invalid: errors.length })
      .eq("id", uploadId);

    if (valid.length === 0) {
      await supabase.from("uploads").update({ status: "failed", notes: "Cero filas válidas" }).eq("id", uploadId);
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
      const pct = Math.round((done / valid.length) * 100);
      setProgress(pct);
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
  await supabase
    .from("uploads")
    .update({ status: "failed", notes: String(notes || "") })
    .eq("id", uploadId);
}

function parseCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data || []),
      error: (err) => reject(err),
    });
  });
}

function parseXLSX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        resolve(json);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function pick(obj, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  // fallback: buscar por normalización del header
  const entries = Object.entries(obj);
  for (const [kk, vv] of entries) {
    const nk = normalizeText(kk);
    for (const k of keys) {
      if (nk === normalizeText(k)) return vv;
    }
  }
  return undefined;
}

async function normalizeAndValidate(rawRows) {
  const valid = [];
  const errors = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const r = rawRows[idx];
    const rowNum = idx + 2; // header fila 1

    const fechaRaw  = pick(r, ["Fecha", "FECHA", "date", "DATE"]);
    const fincaRaw  = pick(r, ["Finca", "FINCA", "Farm", "FARM"]);
    const bloqueRaw = pick(r, ["Bloque", "BLOQUE", "Block", "BLOCK"]);
    const latRaw    = pick(r, ["Lat", "LAT", "Latitud", "LATITUD", "Latitude", "LATITUDE"]);
    const lonRaw    = pick(r, ["Lon", "LON", "Longitud", "LONGITUD", "Lng", "LNG", "Longitude", "LONGITUDE"]);

    const tecnicoRaw       = pick(r, ["Técnico", "Tecnico", "TECNICO", "Tecnico/a", "TECNICO/A", "Technician"]);
    const brotesHojasRaw   = pick(r, ["BrotesHojas", "Brotes hojas", "BROTES_HOJAS", "brotes_hojas", "Brotes", "BROTES"]);
    const hojasRaw         = pick(r, ["HojasAdultas", "Hojas adultas", "HOJAS_ADULTAS", "hojas_adultas", "Hojas", "HOJAS"]);
    const brotesLimonesRaw = pick(r, ["BrotesLimones", "Brotes limones", "BROTES_LIMONES", "brotes_limones", "Limones", "LIMONES"]);
    const botonesRaw       = pick(r, ["BotonesFlorales", "Botones florales", "BOTONES_FLORALES", "botones_florales", "Botones", "BOTONES"]);

    // Validar fecha
    const fecha = parseDateFlexible(fechaRaw);
    if (!fecha || !isValidISODate(fecha)) {
      errors.push({ rowNum, reason: "Fecha inválida", data: String(fechaRaw ?? "") });
      continue;
    }

    // Validar finca (o crearla automáticamente)
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

    // Lat/Lon opcionales: si están vacías se guardan como null
    const latParsed = toFloat(latRaw);
    const lonParsed = toFloat(lonRaw);
    const lat = (Number.isFinite(latParsed) && latParsed >= -90  && latParsed <= 90)  ? latParsed : null;
    const lon = (Number.isFinite(lonParsed) && lonParsed >= -180 && lonParsed <= 180) ? lonParsed : null;

    // Bloque (o crearlo automáticamente)
    let bloque_id = null;
    if (String(bloqueRaw ?? "").trim()) {
      try {
        bloque_id = await getOrCreateBloque(finca, bloqueRaw);
      } catch (e) {
        errors.push({ rowNum, reason: e.message, data: String(bloqueRaw ?? "") });
        continue;
      }
    }

    const tecnico = String(tecnicoRaw ?? "").trim() || null;

    const row = {
      fecha,
      finca_id: finca.id,
      bloque_id,
      lat,
      lon,
      tecnico,
      brotes_hojas:     Math.max(0, toInt(brotesHojasRaw, 0)),
      hojas_adultas:    Math.max(0, toInt(hojasRaw, 0)),
      brotes_limones:   Math.max(0, toInt(brotesLimonesRaw, 0)),
      botones_florales: Math.max(0, toInt(botonesRaw, 0)),
    };

    // fingerprint estable: usa número de fila original del archivo para garantizar unicidad
    row.fingerprint = [
      row.fecha,
      row.finca_id,
      row.bloque_id ?? "",
      Number.isFinite(row.lat) ? Number(row.lat).toFixed(6) : "",
      Number.isFinite(row.lon) ? Number(row.lon).toFixed(6) : "",
      normalizeText(row.tecnico ?? ""),
      rowNum,
    ].join("|");

    valid.push(row);
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
      <td>${escapeHtml(u.status || "")}</td>
      <td>${u.rows_total ?? 0}</td>
      <td>${u.rows_valid ?? 0}</td>
      <td>${u.rows_invalid ?? 0}</td>
      <td>
        <button class="btn btnLight" data-del-upload="${u.id}" ${u.status === "deleted" ? "disabled" : ""}>
          Eliminar
        </button>
      </td>
    `;
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
  const { data, error } = await supabase.rpc("delete_upload", { p_upload_id: uploadId }); // [web:144]
  if (error) {
    setSummary("Error eliminando: " + (error.message || error));
    return;
  }

  // data típicamente trae el número de monitoreos borrados (según tu función)
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
  document.getElementById("progressBar").style.width = `${pct}%`;
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
  try {
    return new Date(ts).toLocaleString("es-DO");
  } catch {
    return String(ts ?? "");
  }
}

function sanitizeFileName(name) {
  return String(name || "archivo")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 140);
}
