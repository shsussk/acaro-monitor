// assets/js/dashboard.js
import { supabase } from "./supabaseClient.js";
import { requireAuth } from "./authGuard.js";
await requireAuth();

import { fetchFincas, fetchBloquesByFinca, fetchMonitoreos } from "./data.js";
import { clamp01, severityPct, normalizeText } from "./utils.js";
import { FINCAS_GEOJSON } from "./fincasGeojson.js";

let map, pointsLayer, heatLayer;
let fincasGeoLayer;

let fincas = [];
let bloquesCache = new Map();

let page = 0;
const pageSize = 200;
let lastCount = 0;

init();

async function init() {
  setupMap();
  setupUI();
  await loadCatalogs();
  await refresh();
}

function setupMap() {
  map = L.map("map", { preferCanvas: true }).setView([19.648, -71.295], 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // Polígonos de fincas (siempre visibles)
  fincasGeoLayer = L.geoJSON(FINCAS_GEOJSON, {
    style: baseFincaStyle(false),
    onEachFeature: (feature, layer) => {
      const name = feature?.properties?.name ?? "Finca";
      layer.bindTooltip(name, { sticky: true });

      // Opcional: click en polígono = seleccionar finca y refrescar
      layer.on("click", async () => {
        const fincaName = String(feature?.properties?.name ?? "").trim();
        if (!fincaName) return;

        const f = fincas.find((x) => normalizeText(x.nombre) === normalizeText(fincaName));
        if (!f) return;

        const fincaSelect = document.getElementById("fincaSelect");
        fincaSelect.value = String(f.id);

        await populateBloques(f.id);

        // reset bloque a "Todos" al seleccionar por mapa
        const bloqueSelect = document.getElementById("bloqueSelect");
        if (bloqueSelect) bloqueSelect.value = "";

        page = 0;
        await refresh(true); // true = preferir zoom a finca
      });
    },
  }).addTo(map);

  pointsLayer = L.layerGroup().addTo(map);

  // Heatmap: puntos [lat,lng,intensity] con intensity 0..1
  heatLayer = L.heatLayer([], {
    radius: 22,
    blur: 18,
    max: 1.0,
    minOpacity: 0.25,
  }).addTo(map);
}

function setupUI() {
  const datePreset = document.getElementById("datePreset");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");

  datePreset.addEventListener("change", () => {
    const custom = datePreset.value === "custom";
    dateFrom.disabled = !custom;
    dateTo.disabled = !custom;
  });

  document.getElementById("btnRefresh").addEventListener("click", async () => {
    page = 0;
    await refresh(true);
  });

  document.getElementById("prevPage").addEventListener("click", async () => {
    if (page > 0) {
      page--;
      await refresh(false);
    }
  });

  document.getElementById("nextPage").addEventListener("click", async () => {
    const maxPage = Math.max(0, Math.ceil(lastCount / pageSize) - 1);
    if (page < maxPage) {
      page++;
      await refresh(false);
    }
  });

  document.getElementById("fincaSelect").addEventListener("change", async (e) => {
    const finca_id = e.target.value ? parseInt(e.target.value, 10) : null;
    await populateBloques(finca_id);
  });
}

async function loadCatalogs() {
  fincas = await fetchFincas();
  const fincaSelect = document.getElementById("fincaSelect");

  for (const f of fincas) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.nombre;
    fincaSelect.appendChild(opt);
  }
}

async function populateBloques(finca_id) {
  const sel = document.getElementById("bloqueSelect");
  sel.innerHTML = `<option value="">Todos</option>`;
  sel.disabled = !finca_id;
  if (!finca_id) return;

  let bloques = bloquesCache.get(finca_id);
  if (!bloques) {
    bloques = await fetchBloquesByFinca(finca_id);
    bloquesCache.set(finca_id, bloques);
  }

  for (const b of bloques) {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.nombre;
    sel.appendChild(opt);
  }
}

function getFilters() {
  const datePreset = document.getElementById("datePreset").value;
  const finca_id = document.getElementById("fincaSelect").value;
  const bloque_id = document.getElementById("bloqueSelect").value;
  const tecnico = document.getElementById("tecnicoInput").value;

  let dateFrom = null,
    dateTo = null;

  const today = new Date();
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  if (datePreset === "custom") {
    dateFrom = document.getElementById("dateFrom").value || null;
    dateTo = document.getElementById("dateTo").value || null;
  } else {
    const days = parseInt(datePreset, 10);
    const from = new Date(today);
    from.setDate(from.getDate() - days + 1);
    dateFrom = ymd(from);
    dateTo = ymd(today);
  }

  return {
    dateFrom,
    dateTo,
    finca_id: finca_id ? parseInt(finca_id, 10) : null,
    bloque_id: bloque_id ? parseInt(bloque_id, 10) : null,
    tecnico: tecnico || null,
  };
}

async function refresh(preferZoomToFinca = false) {
  setStatus("Cargando...");
  const filters = getFilters();

  // Resaltar finca seleccionada (si aplica)
  updateFincaHighlight(filters.finca_id);

  const { data, count } = await fetchMonitoreos(filters, { page, pageSize });
  lastCount = count;

  renderTable(data);
  renderMapData(data);

  const maxPage = Math.max(1, Math.ceil(count / pageSize));
  document.getElementById("pageInfo").textContent = `Página ${page + 1} / ${maxPage} (Total: ${count})`;

  // Zoom inteligente:
  // - si hay puntos: zoom a puntos
  // - si no hay puntos y hay finca seleccionada y preferZoomToFinca: zoom al polígono de esa finca
  if (data.length >= 2) {
    const bounds = data
      .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
      .map((r) => [Number(r.lat), Number(r.lon)]);

    if (bounds.length >= 2) map.fitBounds(bounds, { padding: [20, 20] });
  } else if (preferZoomToFinca && filters.finca_id) {
    const b = getSelectedFincaBounds(filters.finca_id);
    if (b) map.fitBounds(b, { padding: [20, 20], maxZoom: 17 });
  }

  setStatus("");
}

function renderTable(rows) {
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
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

function renderMapData(rows) {
  pointsLayer.clearLayers();
  heatLayer.setLatLngs([]);

  const heatPts = [];

  for (const r of rows) {
    const sev = severityPct(r);
    const intensity = clamp01(sev / 100);

    const lat = Number(r.lat),
      lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const color = sev >= 66 ? "#ff4d6d" : sev >= 33 ? "#ffd166" : "#06d6a0";

    const circle = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 1,
      color: "rgba(255,255,255,.25)",
      fillColor: color,
      fillOpacity: 0.9,
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
  }

  heatLayer.setLatLngs(heatPts);
}

function baseFincaStyle(selected) {
  return selected
    ? { color: "#66ffd1", weight: 3, fillColor: "#66ffd1", fillOpacity: 0.12 }
    : { color: "#7aa2ff", weight: 2, fillColor: "#7aa2ff", fillOpacity: 0.06 };
}

function updateFincaHighlight(finca_id) {
  const selectedName = finca_id ? fincas.find((f) => f.id === finca_id)?.nombre ?? "" : "";
  const selectedNorm = normalizeText(selectedName);

  fincasGeoLayer.eachLayer((layer) => {
    const fname = normalizeText(layer.feature?.properties?.name ?? "");
    const isSel = selectedNorm && fname === selectedNorm;

    layer.setStyle(baseFincaStyle(!!isSel));
    if (isSel && layer.bringToFront) layer.bringToFront();
  });
}

function getSelectedFincaBounds(finca_id) {
  const selectedName = fincas.find((f) => f.id === finca_id)?.nombre ?? "";
  const selectedNorm = normalizeText(selectedName);
  if (!selectedNorm) return null;

  let bounds = null;

  fincasGeoLayer.eachLayer((layer) => {
    const fname = normalizeText(layer.feature?.properties?.name ?? "");
    if (fname === selectedNorm && layer.getBounds) {
      bounds = layer.getBounds();
    }
  });

  return bounds;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

