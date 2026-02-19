import { fetchFincas, fetchBloquesByFinca, upsertMonitoreos } from "./data.js";
import { normalizeText, parseDateFlexible, isValidISODate, toFloat, toInt, chunk } from "./utils.js";

let fincas = [];
let fincaByNormName = new Map();
let bloquesByFinca = new Map(); // finca_id -> Map(normBloqueName -> bloque_id)

let selectedFile = null;

init();

async function init(){
  setupDropzone();
  await loadCatalogs();
}

function setupDropzone(){
  const dz = document.getElementById("dropzone");
  const fi = document.getElementById("fileInput");
  const btn = document.getElementById("btnProcess");

  dz.addEventListener("dragover", (e)=>{ e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", ()=> dz.classList.remove("drag"));
  dz.addEventListener("drop", (e)=>{
    e.preventDefault();
    dz.classList.remove("drag");
    if(e.dataTransfer.files?.length) setFile(e.dataTransfer.files[0]);
  });

  fi.addEventListener("change", ()=>{
    if(fi.files?.length) setFile(fi.files[0]);
  });

  btn.addEventListener("click", async ()=>{
    if(!selectedFile) return;
    await processAndUpload(selectedFile);
  });
}

function setFile(file){
  selectedFile = file;
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("btnProcess").disabled = false;
  clearErrors();
  setSummary("");
}

async function loadCatalogs(){
  fincas = await fetchFincas();
  fincaByNormName.clear();
  for(const f of fincas){
    fincaByNormName.set(normalizeText(f.nombre), f);
  }

  // precargar bloques por finca (para mapear nombres)
  for(const f of fincas){
    const bloques = await fetchBloquesByFinca(f.id);
    const map = new Map();
    for(const b of bloques){
      map.set(normalizeText(b.nombre), b.id);
      // alias: "1" -> "BLOQUE 1"
      const m = b.nombre.match(/(\d+)/);
      if(m) map.set(normalizeText(m[1]), b.id);
    }
    bloquesByFinca.set(f.id, map);
  }
}

async function processAndUpload(file){
  clearErrors();
  setProgress(0);

  let rows = [];
  const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
  if(!ext){
    setSummary("Archivo no soportado. Usa .csv o .xlsx");
    return;
  }

  try{
    rows = ext === "csv" ? await parseCSV(file) : await parseXLSX(file);
  } catch(err){
    setSummary(`Error leyendo archivo: ${err.message || err}`);
    return;
  }

  const { valid, errors } = normalizeAndValidate(rows);
  renderErrors(errors);

  if(valid.length === 0){
    setSummary("No hay filas válidas para subir.");
    setProgress(0);
    return;
  }

  // subir por lotes
  const batches = chunk(valid, 500);
  let done = 0;

  for(let i=0;i<batches.length;i++){
    await upsertMonitoreos(batches[i]);
    done += batches[i].length;
    const pct = Math.round((done / valid.length) * 100);
    setProgress(pct);
  }

  setSummary(
    `Listo.\n` +
    `Filas totales leídas: ${rows.length}\n` +
    `Subidas (válidas): ${valid.length}\n` +
    `Omitidas (errores): ${errors.length}\n` +
    `Nota: si subes el mismo archivo, no se duplicará por fingerprint.`
  );
}

function parseCSV(file){
  return new Promise((resolve, reject)=>{
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res)=> resolve(res.data || []),
      error: (err)=> reject(err)
    });
  });
}

function parseXLSX(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error("No se pudo leer el archivo."));
    reader.onload = ()=>{
      try{
        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type:"array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(ws, { defval:"" });
        resolve(json);
      } catch(e){
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function pick(obj, keys){
  for(const k of keys){
    if(Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  // fallback: buscar por normalización del header
  const entries = Object.entries(obj);
  for(const [kk, vv] of entries){
    const nk = normalizeText(kk);
    for(const k of keys){
      if(nk === normalizeText(k)) return vv;
    }
  }
  return undefined;
}

function normalizeAndValidate(rawRows){
  const valid = [];
  const errors = [];

  for(let idx=0; idx<rawRows.length; idx++){
    const r = rawRows[idx];
    const rowNum = idx + 2; // asumiendo header en fila 1

    const fechaRaw = pick(r, ["Fecha","FECHA","date","DATE"]);
    const fincaRaw = pick(r, ["Finca","FINCA","Farm","FARM"]);
    const bloqueRaw = pick(r, ["Bloque","BLOQUE","Block","BLOCK"]);
    const latRaw = pick(r, ["Lat","LAT","Latitud","LATITUD","Latitude","LATITUDE"]);
    const lonRaw = pick(r, ["Lon","LON","Longitud","LONGITUD","Lng","LNG","Longitude","LONGITUDE"]);

    const tecnicoRaw = pick(r, ["Técnico","Tecnico","TECNICO","Tecnico/a","TECNICO/A","Tecnician","Technician"]);
    const brotesRaw = pick(r, ["Brotes","BROTES","brotes_pos","BROTES_POS"]);
    const hojasRaw = pick(r, ["Hojas","HOJAS","Hojas_adultas","HOJAS_ADULTAS","hojas_adultas_pos","HOJAS_ADULTAS_POS"]);
    const limonesRaw = pick(r, ["Limones","LIMONES","limones_pos","LIMONES_POS"]);
    const botonesRaw = pick(r, ["Botones","BOTONES","botones_pos","BOTONES_POS"]);
    const yemasRaw = pick(r, ["Yemas","YEMAS","yemas_pos","YEMAS_POS"]);

    const fecha = parseDateFlexible(fechaRaw);
    if(!fecha || !isValidISODate(fecha)){
      errors.push({ rowNum, reason:"Fecha inválida", data: String(fechaRaw ?? "") });
      continue;
    }

    const fincaNameNorm = normalizeText(fincaRaw);
    const finca = fincaByNormName.get(fincaNameNorm);
    if(!finca){
      errors.push({ rowNum, reason:"Finca no encontrada en catálogo", data: String(fincaRaw ?? "") });
      continue;
    }

    const lat = toFloat(latRaw);
    const lon = toFloat(lonRaw);
    if(!Number.isFinite(lat) || !Number.isFinite(lon) || lat<-90 || lat>90 || lon<-180 || lon>180){
      errors.push({ rowNum, reason:"Lat/Lon inválidas", data: `lat=${latRaw} lon=${lonRaw}` });
      continue;
    }

    let bloque_id = null;
    if(String(bloqueRaw ?? "").trim()){
      const bMap = bloquesByFinca.get(finca.id);
      const bid = bMap?.get(normalizeText(bloqueRaw));
      if(!bid){
        errors.push({ rowNum, reason:"Bloque no encontrado para esa finca", data: String(bloqueRaw ?? "") });
        continue;
      }
      bloque_id = bid;
    }

    const tecnico = String(tecnicoRaw ?? "").trim() || null;

    const row = {
      fecha,
      finca_id: finca.id,
      bloque_id,
      lat,
      lon,
      tecnico,
      brotes_pos: Math.max(0, toInt(brotesRaw, 0)),
      hojas_adultas_pos: Math.max(0, toInt(hojasRaw, 0)),
      limones_pos: Math.max(0, toInt(limonesRaw, 0)),
      botones_pos: Math.max(0, toInt(botonesRaw, 0)),
      yemas_pos: Math.max(0, toInt(yemasRaw, 0)),
    };

    // fingerprint estable (redondeo ayuda a dedupe si viene con variaciones mínimas)
    const fp = [
      row.fecha,
      row.finca_id,
      row.bloque_id ?? "",
      Number(row.lat).toFixed(6),
      Number(row.lon).toFixed(6),
      normalizeText(row.tecnico ?? "")
    ].join("|");

    row.fingerprint = fp;
    valid.push(row);
  }

  return { valid, errors };
}

function renderErrors(list){
  const tbody = document.querySelector("#errTbl tbody");
  tbody.innerHTML = "";
  for(const e of list.slice(0, 500)){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${e.rowNum}</td><td>${e.reason}</td><td>${escapeHtml(e.data)}</td>`;
    tbody.appendChild(tr);
  }
  if(list.length > 500){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">Mostrando 500 de ${list.length} errores.</td>`;
    tbody.appendChild(tr);
  }
}

function clearErrors(){
  document.querySelector("#errTbl tbody").innerHTML = "";
}

function setProgress(pct){
  document.getElementById("progressBar").style.width = `${pct}%`;
  document.getElementById("progressText").textContent = `${pct}%`;
}

function setSummary(msg){
  document.getElementById("uploadSummary").textContent = msg || "";
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
