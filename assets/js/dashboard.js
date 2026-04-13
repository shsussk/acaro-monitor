// assets/js/dashboard.js
import { requireAuth }    from "./authGuard.js";
import { supabase }       from "./supabaseClient.js";
import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchTecnicos,
  fetchMonitoreos,
  fetchUltimaAplicacionPorBloque,
} from "./data.js";
import { normalizeText } from "./utils.js";
// CAMBIO: FINCAS_GEOJSON eliminado — el GeoJSON se carga desde supabase.fincas.geojson
// CAMBIO: clamp01 y severityPct eliminados — usamos sevHA() definido aquí con la
//         fórmula correcta (hojas_adultas / 12 × 100)

await requireAuth();

let map;
let fincasGeoLayer = null;
// CAMBIO: pointsLayer y heatLayer eliminados — sin coordenadas por registro
let fincas   = [];
let tecnicos = [];
let bloquesCache = new Map();
let page = 0;
const pageSize = 200;
let lastCount  = 0;

// Umbrales corregidos (era 33/66)
const U_ALERT = 25;
const U_INT   = 42;
const U_CRIT  = 67;
const DIAS_ALERTA = 21;

init();

async function init() {
  setupMap();
  setupUI();
  await loadCatalogs();
  await refresh();
}

// ── Mapa ──────────────────────────────────────────────────────────────────────

function setupMap() {
  map = L.map("map", { preferCanvas: true }).setView([19.648, -71.295], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  // CAMBIO: heatLayer y pointsLayer ya no se inicializan
}

// Construye el coroplético desde los datos de fincas ya cargados.
// Cada finca se colorea con su severidad actual; si no tiene GeoJSON en BD
// simplemente no aparece en el mapa — sin errores.
function buildChoropleth(sevPorFinca) {
  if (fincasGeoLayer) {
    fincasGeoLayer.remove();
    fincasGeoLayer = null;
  }

  const features = fincas
    .filter(f => f.geojson)
    .map(f => ({
      type: "Feature",
      properties: { id: f.id, name: f.nombre, sev: sevPorFinca.get(f.id) ?? null },
      geometry: f.geojson.type ? f.geojson : f.geojson.geometry ?? f.geojson,
    }));

  if (!features.length) return;

  fincasGeoLayer = L.geoJSON({ type: "FeatureCollection", features }, {
    style: feature => choroplethStyle(feature.properties.sev, false),
    onEachFeature: (feature, layer) => {
      const { name, sev } = feature.properties;
      const sevLabel = sev !== null ? `${sev.toFixed(1)}%` : "Sin datos";
      const nivel    = nivelLabel(sev);

      layer.bindTooltip(
        `<strong>${name}</strong><br>Sev. hojas adultas: ${sevLabel}<br>${nivel}`,
        { sticky: true }
      );

      layer.on("click", async () => {
        const f = fincas.find(x => x.id === feature.properties.id);
        if (!f) return;
        document.getElementById("fincaSelect").value = String(f.id);
        await populateBloques(f.id);
        document.getElementById("bloqueSelect").value = "";
        page = 0;
        await refresh();
      });
    },
  }).addTo(map);
}

// Estilo coroplético — color por umbral de severidad
function choroplethStyle(sev, selected) {
  if (selected) {
    return { color: "#93c5fd", weight: 3, fillColor: "#93c5fd", fillOpacity: 0.15 };
  }
  if (sev === null || sev === undefined) {
    return { color: "#4b6894", weight: 1.5, fillColor: "#4b6894", fillOpacity: 0.08 };
  }
  if (sev >= U_CRIT) return { color: "#ef4444", weight: 2.5, fillColor: "#ef4444", fillOpacity: 0.35 };
  if (sev >= U_INT)  return { color: "#f97316", weight: 2,   fillColor: "#f97316", fillOpacity: 0.28 };
  if (sev >= U_ALERT)return { color: "#eab308", weight: 2,   fillColor: "#eab308", fillOpacity: 0.22 };
  return               { color: "#22c55e", weight: 1.5, fillColor: "#22c55e", fillOpacity: 0.18 };
}

function nivelLabel(sev) {
  if (sev === null || sev === undefined) return "Sin datos";
  if (sev >= U_CRIT)  return "🔴 Crítico";
  if (sev >= U_INT)   return "🟠 Intervención";
  if (sev >= U_ALERT) return "🟡 Alerta";
  return "🟢 Monitoreo";
}

// Resalta la finca seleccionada en el filtro
function updateFincaHighlight(finca_id) {
  if (!fincasGeoLayer) return;
  const selName = finca_id ? normalizeText(fincas.find(f => f.id === finca_id)?.nombre ?? "") : "";
  fincasGeoLayer.eachLayer(layer => {
    const fname   = normalizeText(layer.feature?.properties?.name ?? "");
    const isSel   = selName && fname === selName;
    const sev     = layer.feature?.properties?.sev;
    layer.setStyle(choroplethStyle(sev, isSel));
    if (isSel && layer.bringToFront) layer.bringToFront();
  });
}

// ── UI ────────────────────────────────────────────────────────────────────────

function setupUI() {
  const datePreset = document.getElementById("datePreset");

  datePreset.addEventListener("change", () => {
    const custom = datePreset.value === "custom";
    document.getElementById("dateFrom").disabled = !custom;
    document.getElementById("dateTo").disabled   = !custom;
  });

  document.getElementById("btnRefresh").addEventListener("click", async () => {
    page = 0; await refresh();
  });

  document.getElementById("prevPage").addEventListener("click", async () => {
    if (page > 0) { page--; await refresh(); }
  });

  document.getElementById("nextPage").addEventListener("click", async () => {
    const maxPage = Math.max(0, Math.ceil(lastCount / pageSize) - 1);
    if (page < maxPage) { page++; await refresh(); }
  });

  document.getElementById("fincaSelect").addEventListener("change", async e => {
    const finca_id = e.target.value ? parseInt(e.target.value, 10) : null;
    await populateBloques(finca_id);
  });

  document.getElementById("btnLogout")?.addEventListener("click", async e => {
    e.preventDefault();
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

async function loadCatalogs() {
  // CAMBIO: cargamos fincas con geojson para el mapa coroplético,
  // y técnicos para poblar el select (reemplaza el tecnicoInput de texto libre)
  [fincas, tecnicos] = await Promise.all([
    fetchFincas(),      // debe incluir columna geojson: select("id, nombre, geojson")
    fetchTecnicos(),
  ]);

  // Fincas select
  const fincaSelect = document.getElementById("fincaSelect");
  fincaSelect.innerHTML = `<option value="">Todas</option>`;
  for (const f of fincas) {
    const opt = document.createElement("option");
    opt.value = f.id; opt.textContent = f.nombre;
    fincaSelect.appendChild(opt);
  }

  // CAMBIO: técnico como select, no input de texto
  const tecnicoSelect = document.getElementById("tecnicoSelect");
  if (tecnicoSelect) {
    for (const t of tecnicos) {
      const opt = document.createElement("option");
      opt.value = t.nombre; opt.textContent = t.nombre;
      tecnicoSelect.appendChild(opt);
    }
  }
}

async function populateBloques(finca_id) {
  const sel = document.getElementById("bloqueSelect");
  sel.innerHTML = `<option value="">Todos</option>`;
  sel.disabled  = !finca_id;
  if (!finca_id) return;

  let bloques = bloquesCache.get(finca_id);
  if (!bloques) {
    bloques = await fetchBloquesByFinca(finca_id);
    bloquesCache.set(finca_id, bloques);
  }
  for (const b of bloques) {
    const opt = document.createElement("option");
    opt.value = b.id; opt.textContent = b.nombre;
    sel.appendChild(opt);
  }
}

// ── Filtros ───────────────────────────────────────────────────────────────────

function getFilters() {
  const datePreset = document.getElementById("datePreset").value;
  const finca_id   = document.getElementById("fincaSelect").value;
  const bloque_id  = document.getElementById("bloqueSelect").value;
  // CAMBIO: tecnicoInput → tecnicoSelect
  const tecnico    = document.getElementById("tecnicoSelect")?.value || null;

  let dateFrom = null, dateTo = null;
  const today = new Date();
  const ymd = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  if (datePreset === "custom") {
    dateFrom = document.getElementById("dateFrom").value || null;
    dateTo   = document.getElementById("dateTo").value   || null;
  } else {
    const days = parseInt(datePreset, 10);
    const from = new Date(today);
    from.setDate(from.getDate() - days + 1);
    dateFrom = ymd(from);
    dateTo   = ymd(today);
  }

  return {
    dateFrom, dateTo,
    finca_id:  finca_id  ? parseInt(finca_id,  10) : null,
    bloque_id: bloque_id ? parseInt(bloque_id, 10) : null,
    tecnico,
  };
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refresh() {
  setStatus("Cargando…");
  const filters = getFilters();

  const [{ data, count }, ultimasAplicaciones] = await Promise.all([
    fetchMonitoreos(filters, { page, pageSize }),
    fetchUltimaAplicacionPorBloque(filters.finca_id),
  ]);

  lastCount = count;

  // Calcular severidad poblacional por finca para el coroplético
  // Proporción agrupada: Σ(hojas_adultas) / (n_con_dato × 12) × 100
  const sumByFinca   = new Map();
  const countByFinca = new Map();
  for (const r of data) {
    if (r.hojas_adultas === null || r.hojas_adultas === undefined) continue;
    const fid = r.finca_id;
    sumByFinca.set(fid,   (sumByFinca.get(fid)   ?? 0) + r.hojas_adultas);
    countByFinca.set(fid, (countByFinca.get(fid) ?? 0) + 1);
  }
  const sevPorFinca = new Map();
  for (const [fid, suma] of sumByFinca) {
    const n = countByFinca.get(fid);
    sevPorFinca.set(fid, (suma / (n * 12)) * 100);
  }

  // CAMBIO: renderMapData() reemplazado por coroplético
  buildChoropleth(sevPorFinca);
  updateFincaHighlight(filters.finca_id);

  renderTable(data, ultimasAplicaciones);

  const maxPage = Math.max(1, Math.ceil(count / pageSize));
  document.getElementById("pageInfo").textContent =
    `Página ${page + 1} / ${maxPage} (Total: ${count})`;

  // CAMBIO: zoom por lat/lon eliminado — sin coordenadas por registro.
  // Si hay finca seleccionada, hacer zoom al polígono.
  if (filters.finca_id && fincasGeoLayer) {
    let bounds = null;
    fincasGeoLayer.eachLayer(layer => {
      const fname = normalizeText(layer.feature?.properties?.name ?? "");
      const selName = normalizeText(fincas.find(f => f.id === filters.finca_id)?.nombre ?? "");
      if (fname === selName && layer.getBounds) bounds = layer.getBounds();
    });
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }

  setStatus("");
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

// CAMBIO: columnas Lat/Lon eliminadas, columna Nivel agregada.
// Sev% usa hojas_adultas como estructura principal (fórmula correcta).
function renderTable(rows, ultimasAplicaciones = {}) {
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const sev = sevHA(r);
    const key = r.bloque_id ?? `finca_${r.finca_id}`;
    const ult = ultimasAplicaciones[key];
    const diasStr = ult ? (ult.dias === 0 ? "hoy" : `${ult.dias}d`) : "—";

    // Clase CSS del semáforo (definida en styles.css)
    const nivelClass = sev === null ? ""
      : sev >= U_CRIT  ? "nivel nivel-critico"
      : sev >= U_INT   ? "nivel nivel-interv"
      : sev >= U_ALERT ? "nivel nivel-alerta"
      : "nivel nivel-ok";
    const nivelText = sev === null ? "—"
      : sev >= U_CRIT  ? "Crítico"
      : sev >= U_INT   ? "Intervención"
      : sev >= U_ALERT ? "Alerta"
      : "Monitoreo";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.fincas?.nombre  ?? ""}</td>
      <td>${r.bloques?.nombre ?? ""}</td>
      <td>${r.tecnico ?? "—"}</td>
      <td style="font-weight:700">${sev !== null ? sev.toFixed(1) + "%" : "—"}</td>
      <td><span class="${nivelClass}">${nivelText}</span></td>
      <td>${diasStr}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Severidad individual de un registro — estructura principal hojas_adultas.
// Fórmula: hojas_adultas / 12 × 100. Retorna null si no hay dato.
function sevHA(r) {
  if (r.hojas_adultas === null || r.hojas_adultas === undefined) return null;
  return (r.hojas_adultas / 12) * 100;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}
