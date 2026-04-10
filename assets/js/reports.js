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
import { severityPct, downloadText } from "./utils.js";

const DIAS_ALERTA = 21; // días sin control para considerar bloque crítico

let fincas      = [];
let bloquesCache = new Map();
let trendChart   = null;
let fincaChart   = null;
let controlChart = null;  // ← nuevo: gráfico dual severidad vs. aplicaciones
let lastRows     = [];
let lastFilters  = {};

init();

async function init() {
  setupUI();
  await loadCatalogs();
  await refresh();
}

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

async function refresh() {
  setStatus("Cargando…");
  const filters = getFilters();
  lastFilters = filters;

  // Cargar datos en paralelo
  const [rows, aplicaciones, ultimasAplicaciones] = await Promise.all([
    fetchMonitoreosAll(filters, { limit: 10000 }),
    fetchAplicaciones({ finca_id: filters.finca_id, dateFrom: filters.dateFrom, dateTo: filters.dateTo }),
    fetchUltimaAplicacionPorBloque(filters.finca_id),
  ]);
  lastRows = rows;

  // ── KPIs ──────────────────────────────────────────────
  const sevs   = rows.map(severityPct);
  const avg    = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;
  document.getElementById("kpiReg").textContent = rows.length;
  document.getElementById("kpiSev").textContent = `${avg.toFixed(1)}%`;

  // ── Top 5 ─────────────────────────────────────────────
  const top = rows
    .map((r) => ({ r, sev: severityPct(r) }))
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 5);

  const topBody = document.querySelector("#topTbl tbody");
  topBody.innerHTML = "";
  for (const { r, sev } of top) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.fincas?.nombre  ?? ""}</td>
      <td>${r.bloques?.nombre ?? ""}</td>
      <td>${sev.toFixed(1)}</td>
      <td>${Number(r.lat).toFixed(5)}</td>
      <td>${Number(r.lon).toFixed(5)}</td>
    `;
    topBody.appendChild(tr);
  }

  // ── Resumen por finca/bloque ───────────────────────────
  // Proporción agrupada: Σ unidades afectadas / (n × 48) × 100
  // Evita distorsión por número desigual de muestras por fecha.
  const agg = new Map();
  for (const r of rows) {
    const finca  = r.fincas?.nombre  ?? String(r.finca_id  ?? "");
    const bloque = r.bloques?.nombre ?? (r.bloque_id ? String(r.bloque_id) : "");
    const key    = `${finca}||${bloque}`;
    const unid   = (r.brotes_hojas||0) + (r.hojas_adultas||0) + (r.brotes_limones||0) + (r.botones_florales||0);
    if (!agg.has(key)) agg.set(key, { finca, bloque, finca_id: r.finca_id, bloque_id: r.bloque_id, n: 0, sum_unid: 0 });
    const a = agg.get(key);
    a.n        += 1;
    a.sum_unid += unid;
  }
  const summary = Array.from(agg.values())
    .map((a) => ({ ...a, avg: a.n ? (a.sum_unid / (a.n * 48)) * 100 : 0 }))
    .sort((a, b) => b.avg - a.avg);

  const sumBody = document.querySelector("#sumTbl tbody");
  sumBody.innerHTML = "";
  for (const a of summary) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.finca}</td>
      <td>${a.bloque || "—"}</td>
      <td>${a.n}</td>
      <td>${a.avg.toFixed(1)}</td>
    `;
    sumBody.appendChild(tr);
  }

  // ── Priorización ──────────────────────────────────────
  renderPriorizacion(summary);

  // ── Tendencia diaria ──────────────────────────────────
  // Proporción agrupada por día: Σ unidades afectadas / (n × 48) × 100
  const byDay = new Map();
  for (const r of rows) {
    const d    = r.fecha;
    const unid = (r.brotes_hojas||0) + (r.hojas_adultas||0) + (r.brotes_limones||0) + (r.botones_florales||0);
    if (!byDay.has(d)) byDay.set(d, { n: 0, sum_unid: 0 });
    const a = byDay.get(d);
    a.n        += 1;
    a.sum_unid += unid;
  }
  const days = Array.from(byDay.entries())
    .map(([d, a]) => ({ d, avg: a.n ? (a.sum_unid / (a.n * 48)) * 100 : 0, n: a.n }))
    .sort((x, y) => x.d.localeCompare(y.d));

  renderTrend(days);

  // ── Severidad por finca (desglose órganos) ────────────
  renderFincaSeverity(rows);

  // ── NUEVO: Gráfico dual severidad vs. aplicaciones ────
  renderControlComparison(days, aplicaciones);

  // ── NUEVO: Bloques críticos ───────────────────────────
  renderCriticalBlocks(summary, ultimasAplicaciones);

  setStatus("");
}

// ── Priorización ──────────────────────────────────────
function renderPriorizacion(summary) {
  const tbody = document.querySelector("#prioTbl tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < summary.length; i++) {
    const s  = summary[i];
    let accion = "Monitoreo preventivo";
    if      (s.avg >= 66) accion = "Aplicación urgente";
    else if (s.avg >= 33) accion = "Aplicación recomendada";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${s.finca}</td>
      <td>${s.bloque || "—"}</td>
      <td style="font-weight:600">${s.avg.toFixed(1)}%</td>
      <td>${s.n}</td>
      <td>${accion}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Tendencia diaria ──────────────────────────────────
function renderTrend(days) {
  const ctx    = document.getElementById("trendChart");
  const labels = days.map((x) => x.d);
  const data   = days.map((x) => Number(x.avg.toFixed(2)));

  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:           "Severidad promedio (%)",
        data,
        tension:         0.25,
        borderWidth:     2,
        pointRadius:     3,
        borderColor:     "#2b66ff",
        backgroundColor: "rgba(43,102,255,0.1)",
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales:  { y: { beginAtZero: true, suggestedMax: 100 } },
    },
  });
}

// ── Severidad por finca (desglose órganos) ────────────
function renderFincaSeverity(rows) {
  const byFinca = new Map();
  for (const r of rows) {
    const finca = r.fincas?.nombre ?? String(r.finca_id ?? "");
    if (!byFinca.has(finca))
      byFinca.set(finca, { brotes_hojas: [], hojas_adultas: [], brotes_limones: [], botones_florales: [], general: [] });

    const f     = byFinca.get(finca);
    const total = (r.brotes_hojas || 0) + (r.hojas_adultas || 0) + (r.brotes_limones || 0)
                + (r.botones_florales || 0);
    f.brotes_hojas.push(   (r.brotes_hojas    / 12) * 100);
    f.hojas_adultas.push(  (r.hojas_adultas   / 12) * 100);
    f.brotes_limones.push( (r.brotes_limones  / 12) * 100);
    f.botones_florales.push((r.botones_florales/ 12) * 100);
    f.general.push(        (total             / 48) * 100);
  }

  const fincaNames = Array.from(byFinca.keys()).sort();
  const avg        = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const datasets = [
    { label: "Brotes hojas",      data: fincaNames.map((f) => avg(byFinca.get(f).brotes_hojas).toFixed(1)),    backgroundColor: "#ff6384" },
    { label: "Hojas adultas",     data: fincaNames.map((f) => avg(byFinca.get(f).hojas_adultas).toFixed(1)),   backgroundColor: "#36a2eb" },
    { label: "Brotes limones",    data: fincaNames.map((f) => avg(byFinca.get(f).brotes_limones).toFixed(1)),  backgroundColor: "#ffce56" },
    { label: "Botones florales",  data: fincaNames.map((f) => avg(byFinca.get(f).botones_florales).toFixed(1)),backgroundColor: "#4bc0c0" },
    { label: "Severidad General", data: fincaNames.map((f) => avg(byFinca.get(f).general).toFixed(1)), backgroundColor: "#ff9f40" },
  ];

  const ctx = document.getElementById("fincaChart");
  if (fincaChart) fincaChart.destroy();
  fincaChart = new Chart(ctx, {
    type: "bar",
    data: { labels: fincaNames, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true, suggestedMax: 100, title: { display: true, text: "Severidad (%)" } },
        x: { title: { display: true, text: "Finca" } },
      },
    },
  });
}

// ── NUEVO: Gráfico dual – Severidad diaria vs. Aplicaciones ──
function renderControlComparison(days, aplicaciones) {
  const ctx = document.getElementById("controlChart");
  if (controlChart) controlChart.destroy();

  if (!days.length) {
    ctx.parentElement.querySelector("p.hint").textContent = "Sin datos para el período seleccionado.";
    return;
  }

  const labels   = days.map((x) => x.d);
  const sevData  = days.map((x) => Number(x.avg.toFixed(2)));

  // Barras de aplicaciones: valor = número de aplicaciones ese día
  const aplByDay = {};
  for (const a of aplicaciones) {
    aplByDay[a.fecha_aplicacion] = (aplByDay[a.fecha_aplicacion] || 0) + 1;
  }
  const aplData = labels.map((d) => aplByDay[d] ?? 0);
  const maxApl  = Math.max(...aplData, 1);

  controlChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type:            "line",
          label:           "Severidad promedio (%)",
          data:            sevData,
          yAxisID:         "ySev",
          tension:         0.25,
          borderWidth:     2.5,
          pointRadius:     3,
          borderColor:     "#ff4d6d",
          backgroundColor: "rgba(255,77,109,0.08)",
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
              return ` Severidad: ${ctx.parsed.y.toFixed(1)}%`;
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
          title:    { display: true, text: "Severidad (%)", color: "#ff4d6d" },
          grid:     { color: "rgba(255,77,109,0.1)" },
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

// ── NUEVO: Panel de bloques críticos ──────────────────
function renderCriticalBlocks(summary, ultimasAplicaciones) {
  const tbody = document.querySelector("#criticalTbl tbody");
  tbody.innerHTML = "";

  // Filtrar: severidad ≥ 33% Y sin aplicación reciente (>21d o nunca)
  const criticos = summary.filter((s) => {
    if (s.avg < 33) return false;
    const key = s.bloque_id ?? `finca_${s.finca_id}`;
    const ult  = ultimasAplicaciones[key];
    return !ult || ult.dias > DIAS_ALERTA;
  });

  // Actualizar KPI
  document.getElementById("kpiAlert").textContent = criticos.length;

  if (!criticos.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#06d6a0;font-weight:600">✅ Sin bloques críticos en el período</td></tr>`;
    return;
  }

  for (const s of criticos) {
    const key = s.bloque_id ?? `finca_${s.finca_id}`;
    const ult  = ultimasAplicaciones[key];

    const ultimaFecha = ult ? ult.fecha  : "Sin registro";
    const diasStr     = ult ? `${ult.dias}d` : "—";

    let accion     = "Aplicación recomendada";
    let accionStyle = "color:#ffd166";
    if (s.avg >= 66) { accion = "⚠ Aplicación URGENTE"; accionStyle = "color:#ff4d6d;font-weight:700"; }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.finca}</td>
      <td>${s.bloque || "—"}</td>
      <td style="font-weight:600;color:${s.avg >= 66 ? "#ff4d6d" : "#ffd166"}">${s.avg.toFixed(1)}%</td>
      <td>${s.n}</td>
      <td>${ultimaFecha}</td>
      <td style="font-weight:600">${diasStr}</td>
      <td style="${accionStyle}">${accion}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ── Exportar PDF ──────────────────────────────────────
async function exportPDF() {
  setStatus("Generando PDF…");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  doc.setFontSize(18); doc.setFont(undefined, "bold");
  doc.text("Informe de Monitoreo de Ácaros", 105, 20, { align: "center" });

  doc.setFontSize(12); doc.setFont(undefined, "normal");
  doc.text(`Período: ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}`, 105, 28, { align: "center" });

  let yPos = 35;

  // 1) Tendencia
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("1. Severidad promedio por fecha", 14, yPos); yPos += 8;
  if (trendChart) {
    doc.addImage(document.getElementById("trendChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 65;
  }

  // 2) Severidad por finca
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("2. Severidad promedio por finca (desglose por órgano)", 14, yPos); yPos += 8;
  if (fincaChart) {
    doc.addImage(document.getElementById("fincaChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 65;
  }

  // 3) Severidad vs. Aplicaciones
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("3. Severidad vs. Aplicaciones de control", 14, yPos); yPos += 8;
  if (controlChart) {
    doc.addImage(document.getElementById("controlChart").toDataURL("image/png"), "PNG", 14, yPos, 180, 60);
    yPos += 65;
  }

  // 4) Bloques críticos
  if (yPos > 220) { doc.addPage(); yPos = 20; }
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("4. Bloques críticos (alta severidad + sin control reciente)", 14, yPos); yPos += 5;
  const critRows = Array.from(document.querySelectorAll("#criticalTbl tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((c) => c.textContent.trim())
  );
  doc.autoTable({
    startY:     yPos,
    head:       [["Finca", "Bloque", "Sev% prom.", "Registros", "Última aplic.", "Días sin ctrl.", "Acción"]],
    body:       critRows,
    theme:      "grid",
    headStyles: { fillColor: [220, 53, 69] },
    styles:     { fontSize: 9 },
  });
  yPos = doc.lastAutoTable.finalY + 10;

  // 5) Priorización
  if (yPos > 220) { doc.addPage(); yPos = 20; }
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("5. Priorización de campos a aplicar", 14, yPos); yPos += 5;
  const prioRows = Array.from(document.querySelectorAll("#prioTbl tbody tr")).map((tr) =>
    Array.from(tr.querySelectorAll("td")).map((c) => c.textContent.trim())
  );
  doc.autoTable({
    startY:     yPos,
    head:       [["Prioridad", "Finca", "Bloque", "Sev% Prom", "Registros", "Acción"]],
    body:       prioRows,
    theme:      "grid",
    headStyles: { fillColor: [43, 102, 255] },
    styles:     { fontSize: 9 },
  });
  yPos = doc.lastAutoTable.finalY + 10;

  // 6) Recomendación general
  if (yPos > 240) { doc.addPage(); yPos = 20; }
  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("6. Recomendación general", 14, yPos); yPos += 8;
  doc.setFontSize(11); doc.setFont(undefined, "normal");
  const recom = `Basado en los datos del período ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}:
• Campos con severidad ≥66%: Aplicación URGENTE de control biológico o químico.
• Campos con severidad 33–66%: Aplicación RECOMENDADA en los próximos 7 días.
• Campos con severidad <33%: Monitoreo preventivo continuo cada 14 días.
• Bloques sin aplicación >21 días y severidad ≥33%: priorizar de inmediato.
Se recomienda rotar productos y evaluar el uso de biocontroladores (Isaria javanica).`.trim();
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
