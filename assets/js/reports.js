// assets/js/reports.js
import { requireAuth } from "./authGuard.js";
await requireAuth();

import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchMonitoreosAll,
  fetchAplicaciones,
  fetchUltimaAplicacionPorBloque,
} from "./data.js";
import { downloadText } from "./utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// METODOLOGÍA
// Monitoreo binomial de ácaro en limones.
// Cada árbol se evalúa en 4 puntos cardinales × 3 unidades = 12 unidades
// por estructura. El técnico registra cuántas de las 12 tienen ácaro (0–12).
//
// Fórmula de severidad individual:
//   Sev (%) = (unidades_afectadas / 12) × 100   por estructura
//
// Fórmula de severidad poblacional (proporción agrupada por bloque/semana):
//   Sev_pob (%) = Σ(afectadas) / (n × 12) × 100
//   Equivale al AVERAGEIFS de severidades individuales cuando el denominador
//   es siempre 12 — matemáticamente idénticos.
//
// Estructura principal: hojas_adultas (99 % de completitud en campo).
// Las demás estructuras dependen de la fenología y se reportan cuando hay dato.
//
// Umbrales definidos:
//   < 25 %  → Monitoreo  (rutina)
//   25–42 % → Alerta     (aumentar frecuencia)
//   42–67 % → Intervención (aplicar control)
//   ≥ 67 %  → Crítico    (control urgente)
//
// Umbral poblacional de acción por semana/bloque:
//   • Sev_pob hojas_adultas ≥ 42 %  →  intervención
//   • ≥ 30 % de plantas con sev ≥ 42 % en la semana  →  intervención
//   • ≥ 15 % de plantas con sev ≥ 67 %               →  urgente
// ─────────────────────────────────────────────────────────────────────────────

const U_ALERT = 25;   // umbral alerta
const U_INT   = 42;   // umbral intervención
const U_CRIT  = 67;   // umbral crítico
const DIAS_ALERTA = 21;  // días sin control para marcar bloque crítico

let fincas       = [];
let bloquesCache = new Map();
let trendChart   = null;
let fincaChart   = null;
let controlChart = null;
let lastRows     = [];
let lastFilters  = {};

init();

async function init() {
  setupUI();
  await loadCatalogs();
  await refresh();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE SEVERIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Severidad individual de un registro por estructura.
 * Retorna null si la estructura no fue evaluada en esa visita.
 */
function sevEstructura(valor) {
  if (valor === null || valor === undefined) return null;
  return (valor / 12) * 100;
}

/**
 * Severidad individual del registro basada en hojas_adultas (estructura principal).
 * Usada para ranking, Top 5 y KPIs individuales.
 */
function sevIndividual(r) {
  const ha = sevEstructura(r.hojas_adultas);
  return ha !== null ? ha : null;
}

/**
 * Severidad general del registro considerando solo estructuras con dato real.
 * Denominador = n_estructuras_con_dato × 12.
 * NO usa 48 fijo porque no siempre se evalúan las 4 estructuras.
 */
function sevGeneral(r) {
  const vals = [r.brotes_hojas, r.hojas_adultas, r.brotes_limones, r.botones_florales]
    .filter(v => v !== null && v !== undefined);
  if (!vals.length) return null;
  const suma  = vals.reduce((s, v) => s + v, 0);
  const denom = vals.length * 12;
  return (suma / denom) * 100;
}

/**
 * Nivel de severidad según umbrales definidos.
 * Se basa en hojas_adultas como estructura principal.
 * Si no hay dato de hojas_adultas, usa severidad general.
 */
function nivelSeveridad(sev) {
  if (sev === null || sev === undefined) return "Sin dato";
  if (sev >= U_CRIT) return "Crítico";
  if (sev >= U_INT)  return "Intervención";
  if (sev >= U_ALERT) return "Alerta";
  return "Monitoreo";
}

/**
 * Proporción agrupada poblacional para un array de registros y una estructura.
 * Sev_pob = Σ(afectadas) / (n_con_dato × 12) × 100
 * Retorna null si no hay ningún dato de esa estructura.
 */
function sevPoblacional(rows, campo) {
  const conDato = rows.filter(r => r[campo] !== null && r[campo] !== undefined);
  if (!conDato.length) return null;
  const suma = conDato.reduce((s, r) => s + r[campo], 0);
  return (suma / (conDato.length * 12)) * 100;
}

/**
 * % de registros cuya severidad de hojas_adultas supera un umbral.
 * Usado para el criterio poblacional de intervención.
 */
function pctSobreUmbral(rows, umbral) {
  const conDato = rows.filter(r => r.hojas_adultas !== null && r.hojas_adultas !== undefined);
  if (!conDato.length) return 0;
  const sobre = conDato.filter(r => (r.hojas_adultas / 12) * 100 >= umbral).length;
  return (sobre / conDato.length) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

function setupUI() {
  const datePreset = document.getElementById("datePreset");
  const dateFrom   = document.getElementById("dateFrom");
  const dateTo     = document.getElementById("dateTo");

  datePreset.addEventListener("change", () => {
    const custom = datePreset.value === "custom";
    dateFrom.disabled = !custom;
    dateTo.disabled   = !custom;
  });

  document.getElementById("btnRefresh").addEventListener("click", refresh);
  document.getElementById("btnExportPDF").addEventListener("click", exportPDF);

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
    opt.value       = f.id;
    opt.textContent = f.nombre;
    fincaSelect.appendChild(opt);
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
    opt.value       = b.id;
    opt.textContent = b.nombre;
    sel.appendChild(opt);
  }
}

function getFilters() {
  const datePreset = document.getElementById("datePreset").value;
  const finca_id   = document.getElementById("fincaSelect").value;
  const bloque_id  = document.getElementById("bloqueSelect").value;

  let dateFrom = null, dateTo = null;
  const today = new Date();
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
    dateFrom,
    dateTo,
    finca_id:  finca_id  ? parseInt(finca_id,  10) : null,
    bloque_id: bloque_id ? parseInt(bloque_id, 10) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function refresh() {
  setStatus("Cargando…");
  const filters = getFilters();
  lastFilters = filters;

  const [rows, aplicaciones, ultimasAplicaciones] = await Promise.all([
    fetchMonitoreosAll(filters, { limit: 10000 }),
    fetchAplicaciones({ finca_id: filters.finca_id, dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    fetchUltimaAplicacionPorBloque(filters.finca_id),
  ]);
  lastRows = rows;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Severidad poblacional de hojas_adultas (estructura principal, más completa)
  const sevPobHA = sevPoblacional(rows, "hojas_adultas");
  // % plantas en nivel crítico (para el KPI de alerta)
  const pctCrit  = pctSobreUmbral(rows, U_CRIT);
  const nHA      = rows.filter(r => r.hojas_adultas !== null && r.hojas_adultas !== undefined).length;

  document.getElementById("kpiReg").textContent = rows.length;
  document.getElementById("kpiSev").textContent =
    sevPobHA !== null ? `${sevPobHA.toFixed(1)}%` : "Sin datos";
  // Nota: kpiSev muestra severidad poblacional de hojas adultas, no promedio aritmético

  // ── Resumen por finca/bloque ───────────────────────────────────────────────
  // Proporción agrupada por bloque para hojas_adultas (estructura principal).
  // También calculamos para las otras estructuras cuando haya dato suficiente.
  const agg = new Map();
  for (const r of rows) {
    const finca  = r.fincas?.nombre  ?? String(r.finca_id  ?? "");
    const bloque = r.bloques?.nombre ?? (r.bloque_id ? String(r.bloque_id) : "");
    const key    = `${finca}||${bloque}`;

    if (!agg.has(key))
      agg.set(key, {
        finca, bloque,
        finca_id:  r.finca_id,
        bloque_id: r.bloque_id,
        rows: [],
      });
    agg.get(key).rows.push(r);
  }

  const summary = Array.from(agg.values()).map((a) => {
    const sevHA  = sevPoblacional(a.rows, "hojas_adultas");    // principal
    const sevBH  = sevPoblacional(a.rows, "brotes_hojas");     // cuando hay dato
    const sevFR  = sevPoblacional(a.rows, "brotes_limones");
    const sevBF  = sevPoblacional(a.rows, "botones_florales");

    // Nivel poblacional basado en hojas_adultas
    const nivel  = nivelSeveridad(sevHA);

    // % plantas sobre cada umbral (para el criterio de intervención semanal)
    const pctInterv = pctSobreUmbral(a.rows, U_INT);
    const pctCritico = pctSobreUmbral(a.rows, U_CRIT);

    // Incidencia: % de árboles con al menos 1 hoja adulta afectada
    // (nota: históricamente ~99% — la severidad es el discriminador útil)
    const conHA    = a.rows.filter(r => r.hojas_adultas !== null && r.hojas_adultas !== undefined);
    const incHA    = conHA.length
      ? (conHA.filter(r => r.hojas_adultas > 0).length / conHA.length) * 100
      : null;

    return {
      finca: a.finca, bloque: a.bloque,
      finca_id: a.finca_id, bloque_id: a.bloque_id,
      n: a.rows.length,
      nHA: conHA.length,
      sevHA, sevBH, sevFR, sevBF,
      nivel, pctInterv, pctCritico, incHA,
      // avg expuesto para compatibilidad con funciones de renderizado
      avg: sevHA ?? 0,
    };
  }).sort((a, b) => (b.sevHA ?? 0) - (a.sevHA ?? 0));

  // ── Top 5 ─────────────────────────────────────────────────────────────────
  // Ranking por severidad de hojas_adultas (estructura principal y más completa).
  // No usamos severidad general porque mezclaría estructuras con muy distinta
  // completitud (hojas adultas 99% vs frutos 2%).
  const top = rows
    .map((r) => ({ r, sev: sevIndividual(r) }))
    .filter((x) => x.sev !== null)
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 5);

  const topBody = document.querySelector("#topTbl tbody");
  topBody.innerHTML = "";
  for (const { r, sev } of top) {
    const nivel = nivelSeveridad(sev);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.fincas?.nombre  ?? ""}</td>
      <td>${r.bloques?.nombre ?? ""}</td>
      <td><strong>${sev.toFixed(1)}%</strong></td>
      <td>${nivel}</td>
      <td>${r.hojas_adultas ?? "—"}/12 hojas afectadas</td>
    `;
    topBody.appendChild(tr);
  }

  // ── Resumen por finca/bloque ───────────────────────────────────────────────
  const sumBody = document.querySelector("#sumTbl tbody");
  sumBody.innerHTML = "";
  for (const a of summary) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.finca}</td>
      <td>${a.bloque || "—"}</td>
      <td>${a.nHA}</td>
      <td><strong>${a.sevHA !== null ? a.sevHA.toFixed(1) + "%" : "Sin datos"}</strong></td>
      <td>${a.sevBH  !== null ? a.sevBH.toFixed(1)  + "%" : "—"}</td>
      <td>${a.sevFR  !== null ? a.sevFR.toFixed(1)  + "%" : "—"}</td>
      <td>${a.sevBF  !== null ? a.sevBF.toFixed(1)  + "%" : "—"}</td>
      <td>${a.pctInterv.toFixed(0)}%</td>
      <td>${a.nivel}</td>
    `;
    sumBody.appendChild(tr);
  }

  // ── Priorización ──────────────────────────────────────────────────────────
  renderPriorizacion(summary);

  // ── Tendencia semanal ─────────────────────────────────────────────────────
  // Agrupamos por semana (lunes) para reflejar el diseño muestral rotativo.
  // Mantenemos la misma estructura {d, avg, n} que espera renderTrend.
  const byWeek = new Map();
  for (const r of rows) {
    // Parseo sin zona horaria para evitar desfases
    const [yr, mo, dy] = r.fecha.split("-").map(Number);
    const fecha  = new Date(yr, mo - 1, dy);
    const lunes  = new Date(yr, mo - 1, dy - ((fecha.getDay() + 6) % 7));
    const key    = `${lunes.getFullYear()}-${String(lunes.getMonth()+1).padStart(2,"0")}-${String(lunes.getDate()).padStart(2,"0")}`;

    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key).push(r);
  }

  // avg = severidad poblacional de hojas_adultas (estructura principal)
  const weeks = Array.from(byWeek.entries())
    .map(([semana, rws]) => {
      const sev = sevPoblacional(rws, "hojas_adultas");
      return {
        d:    semana,
        avg:  sev ?? 0,
        n:    rws.filter(r => r.hojas_adultas !== null && r.hojas_adultas !== undefined).length,
        pctInt:  pctSobreUmbral(rws, U_INT),
        pctCrit: pctSobreUmbral(rws, U_CRIT),
      };
    })
    .filter(w => w.n > 0)
    .sort((x, y) => x.d.localeCompare(y.d));

  renderTrend(weeks);

  // ── Severidad por finca (desglose órganos) ────────────────────────────────
  renderFincaSeverity(rows);

  // ── Gráfico dual severidad vs. aplicaciones ───────────────────────────────
  // Pasa weeks con la misma estructura {d, avg} que espera renderControlComparison
  renderControlComparison(weeks, aplicaciones);

  // ── Bloques críticos ──────────────────────────────────────────────────────
  renderCriticalBlocks(summary, ultimasAplicaciones);

  setStatus("");
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIORIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

function renderPriorizacion(summary) {
  const tbody = document.querySelector("#prioTbl tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < summary.length; i++) {
    const s = summary[i];
    if (s.sevHA === null) continue;

    // Acción basada en umbrales definidos para este monitoreo
    let accion = "Monitoreo preventivo";
    if      (s.sevHA >= U_CRIT) accion = "⚠ Aplicación URGENTE";
    else if (s.sevHA >= U_INT)  accion = "Aplicar esta semana";
    else if (s.sevHA >= U_ALERT) accion = "Vigilar — reevaluar en 7 días";

    // Criterio poblacional: % plantas sobre umbral de intervención
    const criterioPobl = s.pctInterv >= 30
      ? `(${s.pctInterv.toFixed(0)}% plantas ≥${U_INT}%)`
      : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${s.finca}</td>
      <td>${s.bloque || "—"}</td>
      <td style="font-weight:600">${s.sevHA.toFixed(1)}%</td>
      <td>${s.nHA}</td>
      <td>${s.pctInterv.toFixed(0)}%</td>
      <td>${accion} ${criterioPobl}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TENDENCIA SEMANAL
// ─────────────────────────────────────────────────────────────────────────────

function renderTrend(weeks) {
  const ctx    = document.getElementById("trendChart");
  const labels = weeks.map((w) => w.d);
  const data   = weeks.map((w) => Number(w.avg.toFixed(2)));

  // Líneas de referencia para los umbrales
  const lineAlerta = Array(labels.length).fill(U_ALERT);
  const lineInterv = Array(labels.length).fill(U_INT);
  const lineCrit   = Array(labels.length).fill(U_CRIT);

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label:           "Severidad pob. hojas adultas (%)",
          data,
          tension:         0.25,
          borderWidth:     2.5,
          pointRadius:     4,
          borderColor:     "#E24B4A",
          backgroundColor: "rgba(226,75,74,0.1)",
          fill:            true,
          order:           1,
        },
        {
          label:       `Umbral alerta (${U_ALERT}%)`,
          data:        lineAlerta,
          borderColor: "#EF9F27",
          borderDash:  [5, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill:        false,
          order:       2,
        },
        {
          label:       `Umbral intervención (${U_INT}%)`,
          data:        lineInterv,
          borderColor: "#E24B4A",
          borderDash:  [5, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill:        false,
          order:       3,
        },
        {
          label:       `Umbral crítico (${U_CRIT}%)`,
          data:        lineCrit,
          borderColor: "#7B0000",
          borderDash:  [4, 2],
          borderWidth: 1.5,
          pointRadius: 0,
          fill:        false,
          order:       4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0)
                return ` Severidad: ${ctx.parsed.y.toFixed(1)}%  (${weeks[ctx.dataIndex]?.n ?? ""} registros)`;
              return ` ${ctx.dataset.label}`;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          title: { display: true, text: "Severidad hojas adultas (%)" },
        },
        x: { title: { display: true, text: "Semana" } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEVERIDAD POR FINCA — DESGLOSE POR ESTRUCTURA
// ─────────────────────────────────────────────────────────────────────────────

function renderFincaSeverity(rows) {
  const byFinca = new Map();
  for (const r of rows) {
    const finca = r.fincas?.nombre ?? String(r.finca_id ?? "");
    if (!byFinca.has(finca)) byFinca.set(finca, []);
    byFinca.get(finca).push(r);
  }

  const fincaNames = Array.from(byFinca.keys()).sort();

  // Proporción agrupada por estructura y finca.
  // Retorna null si la estructura no tiene datos suficientes (< 3 registros).
  // Retorna número, no string — Chart.js necesita números.
  const MIN_N = 3;
  const sevPobFinca = (nombre, campo) => {
    const filaRows = byFinca.get(nombre) ?? [];
    const conDato  = filaRows.filter(r => r[campo] !== null && r[campo] !== undefined);
    if (conDato.length < MIN_N) return null;
    const sev = sevPoblacional(conDato, campo);
    return sev !== null ? parseFloat(sev.toFixed(1)) : null;
  };

  const datasets = [
    {
      label:           "Hojas adultas (principal)",
      data:            fincaNames.map(f => sevPobFinca(f, "hojas_adultas")),
      backgroundColor: "#E24B4A",
    },
    {
      label:           "Brotes hojas",
      data:            fincaNames.map(f => sevPobFinca(f, "brotes_hojas")),
      backgroundColor: "#EF9F27",
    },
    {
      label:           "Frutos",
      data:            fincaNames.map(f => sevPobFinca(f, "brotes_limones")),
      backgroundColor: "#378ADD",
    },
    {
      label:           "Botones florales",
      data:            fincaNames.map(f => sevPobFinca(f, "botones_florales")),
      backgroundColor: "#1D9E75",
    },
  ];

  const ctx = document.getElementById("fincaChart");
  if (fincaChart) fincaChart.destroy();
  fincaChart = new Chart(ctx, {
    type: "bar",
    data: { labels: fincaNames, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.parsed.y !== null
                ? ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%`
                : ` ${ctx.dataset.label}: Sin datos suficientes`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          title: { display: true, text: "Severidad poblacional (%)" },
        },
        x: { title: { display: true, text: "Finca" } },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO DUAL: SEVERIDAD SEMANAL vs. APLICACIONES
// ─────────────────────────────────────────────────────────────────────────────

function renderControlComparison(weeks, aplicaciones) {
  const ctx = document.getElementById("controlChart");
  if (controlChart) controlChart.destroy();

  if (!weeks.length) {
    ctx.parentElement.querySelector("p.hint").textContent = "Sin datos para el período seleccionado.";
    return;
  }

  // weeks tiene estructura {d, avg, n} — mismo contrato que el original usaba con days
  const labels  = weeks.map((w) => w.d);
  const sevData = weeks.map((w) => Number(w.avg.toFixed(2)));

  // Aplicaciones por semana: agrupamos cada aplicación en el lunes de su semana
  const aplByWeek = {};
  for (const a of aplicaciones) {
    const [yr, mo, dy] = a.fecha_aplicacion.split("-").map(Number);
    const fecha = new Date(yr, mo - 1, dy);
    const offset = (fecha.getDay() + 6) % 7;
    const lunes  = new Date(yr, mo - 1, dy - offset);
    const key    = `${lunes.getFullYear()}-${String(lunes.getMonth()+1).padStart(2,"0")}-${String(lunes.getDate()).padStart(2,"0")}`;
    aplByWeek[key] = (aplByWeek[key] || 0) + 1;
  }
  const aplData = labels.map((d) => aplByWeek[d] ?? 0);
  const maxApl  = Math.max(...aplData, 1);

  controlChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type:            "line",
          label:           "Severidad pob. hojas adultas (%)",
          data:            sevData,
          yAxisID:         "ySev",
          tension:         0.25,
          borderWidth:     2.5,
          pointRadius:     3,
          borderColor:     "#E24B4A",
          backgroundColor: "rgba(226,75,74,0.08)",
          order:           1,
        },
        {
          type:            "bar",
          label:           "Aplicaciones de control",
          data:            aplData,
          yAxisID:         "yApl",
          backgroundColor: "rgba(43,102,255,0.55)",
          borderColor:     "#2b66ff",
          borderWidth:     1,
          order:           2,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === "yApl")
                return ` ${ctx.parsed.y} aplicación(es) de control`;
              return ` Severidad hojas adultas: ${ctx.parsed.y.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        ySev: {
          type:     "linear",
          position: "left",
          min:      0,
          max:      100,
          title:    { display: true, text: "Severidad hojas adultas (%)", color: "#E24B4A" },
          grid:     { color: "rgba(226,75,74,0.1)" },
        },
        yApl: {
          type:     "linear",
          position: "right",
          min:      0,
          max:      maxApl + 1,
          ticks:    { stepSize: 1 },
          title:    { display: true, text: "N° aplicaciones", color: "#2b66ff" },
          grid:     { drawOnChartArea: false },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUES CRÍTICOS
// Criterio combinado — un bloque es crítico si cumple al menos UNO:
//   1. Severidad poblacional ≥ 42% Y sin control en >21 días
//   2. ≥ 30% de plantas con severidad ≥ 42% en el período
//   3. ≥ 15% de plantas en nivel crítico (≥ 67%)
// ─────────────────────────────────────────────────────────────────────────────

function renderCriticalBlocks(summary, ultimasAplicaciones) {
  const tbody = document.querySelector("#criticalTbl tbody");
  tbody.innerHTML = "";

  const criticos = summary.filter((s) => {
    if (s.sevHA === null) return false;
    const key = s.bloque_id ?? `finca_${s.finca_id}`;
    const ult  = ultimasAplicaciones[key];
    const sinControlReciente = !ult || ult.dias > DIAS_ALERTA;

    return (
      (s.sevHA >= U_INT  && sinControlReciente) ||  // criterio 1
      (s.pctInterv >= 30)                       ||  // criterio 2
      (s.pctCritico >= 15)                          // criterio 3
    );
  });

  document.getElementById("kpiAlert").textContent = criticos.length;

  if (!criticos.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#06d6a0;font-weight:600">
      ✅ Sin bloques críticos en el período</td></tr>`;
    return;
  }

  for (const s of criticos) {
    const key = s.bloque_id ?? `finca_${s.finca_id}`;
    const ult  = ultimasAplicaciones[key];

    const ultimaFecha = ult ? ult.fecha  : "Sin registro";
    const diasStr     = ult ? `${ult.dias}d` : "—";

    // Motivo del flag
    const motivos = [];
    if (s.sevHA >= U_INT && (!ult || ult.dias > DIAS_ALERTA))
      motivos.push(`Sev≥${U_INT}% + sin ctrl >${DIAS_ALERTA}d`);
    if (s.pctInterv >= 30)
      motivos.push(`${s.pctInterv.toFixed(0)}% plantas ≥${U_INT}%`);
    if (s.pctCritico >= 15)
      motivos.push(`${s.pctCritico.toFixed(0)}% plantas ≥${U_CRIT}%`);

    let accion      = "Aplicación recomendada";
    let accionStyle = "color:#EF9F27";
    if (s.sevHA >= U_CRIT || s.pctCritico >= 30) {
      accion      = "⚠ Aplicación URGENTE";
      accionStyle = "color:#E24B4A;font-weight:700";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.finca}</td>
      <td>${s.bloque || "—"}</td>
      <td style="font-weight:600;color:${s.sevHA >= U_CRIT ? "#E24B4A" : s.sevHA >= U_INT ? "#EF9F27" : "inherit"}">
        ${s.sevHA.toFixed(1)}%</td>
      <td>${s.nHA}</td>
      <td>${ultimaFecha}</td>
      <td style="font-weight:600">${diasStr}</td>
      <td style="font-size:0.85em;color:#aaa">${motivos.join(" · ")}</td>
      <td style="${accionStyle}">${accion}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTAR PDF
// ─────────────────────────────────────────────────────────────────────────────

async function exportPDF() {
  setStatus("Generando PDF…");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  doc.setFontSize(18); doc.setFont(undefined, "bold");
  doc.text("Informe de Monitoreo de Ácaros — Limones", 105, 20, { align: "center" });

  doc.setFontSize(11); doc.setFont(undefined, "normal");
  doc.text(`Período: ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}`, 105, 28, { align: "center" });
  doc.text(`Metodología: Binomial presencia/ausencia · 4 puntos cardinales × 3 hojas = 12 unidades/estructura`, 105, 34, { align: "center" });

  let yPos = 42;

  // 1) Tendencia
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("1. Tendencia semanal de severidad — Hojas adultas", 14, yPos); yPos += 7;
  if (trendChart) {
    doc.addImage(document.getElementById("trendChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 64;
  }

  // 2) Severidad por finca
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("2. Severidad por finca — desglose por estructura evaluada", 14, yPos); yPos += 7;
  if (fincaChart) {
    doc.addImage(document.getElementById("fincaChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 64;
  }

  // 3) Severidad vs. Aplicaciones
  if (yPos > 200) { doc.addPage(); yPos = 20; }
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("3. Severidad semanal vs. Aplicaciones de control", 14, yPos); yPos += 7;
  if (controlChart) {
    doc.addImage(document.getElementById("controlChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 64;
  }

  // 4) Bloques críticos
  if (yPos > 210) { doc.addPage(); yPos = 20; }
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("4. Bloques críticos (sev ≥42% + sin control reciente, o ≥30% plantas sobre umbral)", 14, yPos); yPos += 5;
  const critRows = Array.from(document.querySelectorAll("#criticalTbl tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((c) => c.textContent.trim())
  );
  doc.autoTable({
    startY:     yPos,
    head:       [["Finca", "Bloque", "Sev%", "N", "Última apl.", "Días s/ctrl", "Motivo", "Acción"]],
    body:       critRows,
    theme:      "grid",
    headStyles: { fillColor: [226, 75, 74] },
    styles:     { fontSize: 8 },
  });
  yPos = doc.lastAutoTable.finalY + 10;

  // 5) Priorización
  if (yPos > 220) { doc.addPage(); yPos = 20; }
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("5. Priorización de campos a intervenir", 14, yPos); yPos += 5;
  const prioRows = Array.from(document.querySelectorAll("#prioTbl tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((c) => c.textContent.trim())
  );
  doc.autoTable({
    startY:     yPos,
    head:       [["#", "Finca", "Bloque", "Sev% HA", "N muestras", "% plantas ≥42%", "Acción"]],
    body:       prioRows,
    theme:      "grid",
    headStyles: { fillColor: [43, 102, 255] },
    styles:     { fontSize: 8 },
  });
  yPos = doc.lastAutoTable.finalY + 10;

  // 6) Recomendación general
  if (yPos > 240) { doc.addPage(); yPos = 20; }
  doc.setFontSize(13); doc.setFont(undefined, "bold");
  doc.text("6. Recomendación general", 14, yPos); yPos += 8;
  doc.setFontSize(10); doc.setFont(undefined, "normal");
  const recom = `Basado en los datos del período ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}:

• Bloques con severidad ≥67% (crítico): Aplicación de acaricida URGENTE e inmediata.
• Bloques con severidad 42–67% (intervención): Programar aplicación dentro de los próximos 7 días.
• Bloques con ≥30% de plantas sobre umbral de intervención: Aplicar aunque el promedio sea menor.
• Bloques con severidad 25–42% (alerta): Aumentar frecuencia de muestreo a cada 7 días.
• Bloques con severidad <25% (monitoreo): Continuar muestreo rutinario semanal.
• Bloques sin aplicación >21 días y severidad ≥42%: Priorizar de inmediato.

Nota metodológica: La incidencia (% árboles afectados) es históricamente ~99% en todas las fincas
y no discrimina entre niveles de presión. El indicador de gestión es la severidad de hojas adultas.`.trim();
  doc.text(doc.splitTextToSize(recom, 180), 14, yPos);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text(`Página ${i} de ${pageCount}`, 105, 290, { align: "center" });
    doc.text(`Generado: ${new Date().toLocaleString("es-DO")}`, 14, 290);
  }

  const filename = `Informe_Acaros_${lastFilters.dateFrom || "sem"}_${lastFilters.dateTo || "ana"}.pdf`;
  doc.save(filename);
  setStatus("PDF generado exitosamente.");
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}
