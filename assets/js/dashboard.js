import { fetchFincas, fetchBloquesByFinca, fetchMonitoreos } from "./data.js";
import { clamp01, severityPct, normalizeText } from "./utils.js";

let map, pointsLayer, heatLayer, fincaPolysLayer;
let fincas = [];
let bloquesCache = new Map();

let page = 0;
const pageSize = 200;
let lastCount = 0;

init();

async function init(){
  setupMap();
  setupUI();
  await loadCatalogs();
  await refresh();
}

function setupMap(){
  map = L.map("map", { preferCanvas: true }).setView([19.648, -71.295], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  pointsLayer = L.layerGroup().addTo(map);
  fincaPolysLayer = L.layerGroup().addTo(map);

  // Leaflet.heat usa puntos [lat,lng,intensity] con intensity 0..1. [web:7]
  heatLayer = L.heatLayer([], { radius: 22, blur: 18, max: 1.0, minOpacity: 0.25 }).addTo(map);
}

function setupUI(){
  const datePreset = document.getElementById("datePreset");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");

  datePreset.addEventListener("change", ()=>{
    if(datePreset.value === "custom"){
      dateFrom.disabled = false;
      dateTo.disabled = false;
    } else {
      dateFrom.disabled = true;
      dateTo.disabled = true;
    }
  });

  document.getElementById("btnRefresh").addEventListener("click", async ()=>{
    page = 0;
    await refresh();
  });

  document.getElementById("prevPage").addEventListener("click", async ()=>{
    if(page > 0){ page--; await refresh(); }
  });
  document.getElementById("nextPage").addEventListener("click", async ()=>{
    const maxPage = Math.max(0, Math.ceil(lastCount / pageSize) - 1);
    if(page < maxPage){ page++; await refresh(); }
  });

  document.getElementById("fincaSelect").addEventListener("change", async (e)=>{
    const finca_id = e.target.value ? parseInt(e.target.value,10) : null;
    await populateBloques(finca_id);
  });
}

async function loadCatalogs(){
  fincas = await fetchFincas();
  const fincaSelect = document.getElementById("fincaSelect");
  for(const f of fincas){
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.nombre;
    fincaSelect.appendChild(opt);
  }
}

async function populateBloques(finca_id){
  const sel = document.getElementById("bloqueSelect");
  sel.innerHTML = `<option value="">Todos</option>`;
  sel.disabled = !finca_id;
  if(!finca_id) return;

  let bloques = bloquesCache.get(finca_id);
  if(!bloques){
    bloques = await fetchBloquesByFinca(finca_id);
    bloquesCache.set(finca_id, bloques);
  }

  for(const b of bloques){
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.nombre;
    sel.appendChild(opt);
  }
}

function getFilters(){
  const datePreset = document.getElementById("datePreset").value;
  const finca_id = document.getElementById("fincaSelect").value;
  const bloque_id = document.getElementById("bloqueSelect").value;
  const tecnico = document.getElementById("tecnicoInput").value;

  let dateFrom = null, dateTo = null;
  const today = new Date();
  const ymd = (d)=> `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  if(datePreset === "custom"){
    dateFrom = document.getElementById("dateFrom").value || null;
    dateTo = document.getElementById("dateTo").value || null;
  } else {
    const days = parseInt(datePreset,10);
    const from = new Date(today);
    from.setDate(from.getDate() - days + 1);
    dateFrom = ymd(from);
    dateTo = ymd(today);
  }

  return {
    dateFrom,
    dateTo,
    finca_id: finca_id ? parseInt(finca_id,10) : null,
    bloque_id: bloque_id ? parseInt(bloque_id,10) : null,
    tecnico: tecnico || null
  };
}

async function refresh(){
  setStatus("Cargando...");
  const filters = getFilters();

  const { data, count } = await fetchMonitoreos(filters, { page, pageSize });
  lastCount = count;

  renderTable(data);
  renderMap(data, filters.finca_id);

  const maxPage = Math.max(1, Math.ceil(count / pageSize));
  document.getElementById("pageInfo").textContent = `Página ${page+1} / ${maxPage} (Total: ${count})`;

  setStatus("");
}

function renderTable(rows){
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";
  for(const r of rows){
    const sev = severityPct(r);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.fincas?.nombre ?? r.finca_id ?? ""}</td>
      <td>${r.bloques?.nombre ?? (r.bloque_id ?? "")}</td>
      <td>${r.tecnico ?? ""}</td>
      <td>${sev.toFixed(1)}</td>
      <td>${Number(r.lat).toFixed(5)}</td>
      <td>${Number(r.lon).toFixed(5)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderMap(rows, finca_id){
  pointsLayer.clearLayers();
  heatLayer.setLatLngs([]);

  fincaPolysLayer.clearLayers();
  if(finca_id){
    const f = fincas.find(x=>x.id===finca_id);
    if(f?.geojson){
      const gj = L.geoJSON(f.geojson, { style: { color:"#66ffd1", weight:2, fillOpacity:0.06 } });
      gj.addTo(fincaPolysLayer);
    }
  }

  const heatPts = [];
  const bounds = [];

  for(const r of rows){
    const sev = severityPct(r);
    const intensity = clamp01(sev/100);
    const lat = Number(r.lat), lon = Number(r.lon);
    if(!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const color = sev >= 66 ? "#ff4d6d" : sev >= 33 ? "#ffd166" : "#06d6a0";

    const circle = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 1,
      color: "rgba(255,255,255,.25)",
      fillColor: color,
      fillOpacity: 0.9
    });

    const fincaName = r.fincas?.nombre ?? "";
    const bloqueName = r.bloques?.nombre ?? "";
    const tecnico = r.tecnico ?? "";
    circle.bindPopup(`
      <div style="font-size:12px">
        <b>${fincaName}</b> ${bloqueName ? " / " + bloqueName : ""}<br/>
        Fecha: ${r.fecha}<br/>
        Técnico: ${tecnico}<br/>
        Severidad: ${sev.toFixed(1)}%
      </div>
    `);

    circle.addTo(pointsLayer);
    heatPts.push([lat, lon, intensity]);
    bounds.push([lat, lon]);
  }

  heatLayer.setLatLngs(heatPts);

  if(bounds.length >= 2) map.fitBounds(bounds, { padding:[20,20] });
}

function setStatus(msg){
  document.getElementById("status").textContent = msg;
}
