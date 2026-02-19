import { fetchFincas, fetchBloquesByFinca, fetchMonitoreosAll } from "./data.js";
import { severityPct, downloadText } from "./utils.js";

let fincas = [];
let bloquesCache = new Map();
let trendChart = null;
let fincaChart = null;

let lastRows = [];
let lastFilters = {};

init();

async function init() {
  setupUI();
  await loadCatalogs();
  await refresh();
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

  let dateFrom = null, dateTo = null;
  const today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  };
}

async function refresh() {
  setStatus("Cargando...");
  const filters = getFilters();
  lastFilters = filters;

  const rows = await fetchMonitoreosAll(filters, { limit: 10000 });
  lastRows = rows;

  // KPIs
  const sevs = rows.map((r) => severityPct(r));
  const avg = sevs.length ? sevs.reduce((a, b) => a + b, 0) / sevs.length : 0;

  document.getElementById("kpiReg").textContent = rows.length;
  document.getElementById("kpiSev").textContent = `${avg.toFixed(1)}%`;

  // Top 5
  const top = rows
    .map((r) => ({ r, sev: severityPct(r) }))
    .sort((a, b) => b.sev - a.sev)
    .slice(0, 5);

  const topBody = document.querySelector("#topTbl tbody");
  topBody.innerHTML = "";
  for (const x of top) {
    const r = x.r;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha}</td>
      <td>${r.fincas?.nombre ?? ""}</td>
      <td>${r.bloques?.nombre ?? ""}</td>
      <td>${x.sev.toFixed(1)}</td>
      <td>${Number(r.lat).toFixed(5)}</td>
      <td>${Number(r.lon).toFixed(5)}</td>
    `;
    topBody.appendChild(tr);
  }

  // Resumen por finca/bloque
  const agg = new Map();
  for (const r of rows) {
    const finca = r.fincas?.nombre ?? String(r.finca_id ?? "");
    const bloque = r.bloques?.nombre ?? (r.bloque_id ? String(r.bloque_id) : "");
    const key = `${finca}||${bloque}`;
    const sev = severityPct(r);

    if (!agg.has(key)) agg.set(key, { finca, bloque, n: 0, sum: 0 });
    const a = agg.get(key);
    a.n += 1;
    a.sum += sev;
  }

  const summary = Array.from(agg.values())
    .map((a) => ({ ...a, avg: a.n ? a.sum / a.n : 0 }))
    .sort((a, b) => b.avg - a.avg);

  const sumBody = document.querySelector("#sumTbl tbody");
  sumBody.innerHTML = "";
  for (const a of summary) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.finca}</td>
      <td>${a.bloque || "-"}</td>
      <td>${a.n}</td>
      <td>${a.avg.toFixed(1)}</td>
    `;
    sumBody.appendChild(tr);
  }

  // Tabla de priorización
  renderPriorizacion(summary);

  // Tendencia diaria
  const byDay = new Map();
  for (const r of rows) {
    const d = r.fecha;
    const sev = severityPct(r);
    if (!byDay.has(d)) byDay.set(d, { n: 0, sum: 0 });
    const a = byDay.get(d);
    a.n += 1;
    a.sum += sev;
  }
  const days = Array.from(byDay.entries())
    .map(([d, a]) => ({ d, avg: a.sum / a.n, n: a.n }))
    .sort((x, y) => x.d.localeCompare(y.d));

  renderTrend(days);

  // Severidad por finca (desglose órganos)
  renderFincaSeverity(rows);

  setStatus("");
}

function renderPriorizacion(summary) {
  const tbody = document.querySelector("#prioTbl tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < summary.length; i++) {
    const s = summary[i];
    const prioridad = i + 1;

    let accion = "Monitoreo preventivo";
    if (s.avg >= 66) accion = "Aplicación urgente";
    else if (s.avg >= 33) accion = "Aplicación recomendada";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${prioridad}</td>
      <td>${s.finca}</td>
      <td>${s.bloque || "-"}</td>
      <td style="font-weight:600">${s.avg.toFixed(1)}%</td>
      <td>${s.n}</td>
      <td>${accion}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTrend(days) {
  const ctx = document.getElementById("trendChart");
  const labels = days.map((x) => x.d);
  const data = days.map((x) => Number(x.avg.toFixed(2)));

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Severidad promedio (%)",
          data,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 3,
          borderColor: "#2b66ff",
          backgroundColor: "rgba(43,102,255,0.1)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true, suggestedMax: 100 },
      },
    },
  });
}

function renderFincaSeverity(rows) {
  // Agrupar por finca y calcular severidad por órgano + general
  const byFinca = new Map();

  for (const r of rows) {
    const finca = r.fincas?.nombre ?? String(r.finca_id ?? "");
    if (!byFinca.has(finca)) {
      byFinca.set(finca, {
        brotes: [], hojas: [], limones: [], botones: [], yemas: [], general: [],
      });
    }
    const f = byFinca.get(finca);

    const total = (r.brotes_pos || 0) + (r.hojas_adultas_pos || 0) + (r.limones_pos || 0) + (r.botones_pos || 0) + (r.yemas_pos || 0);

    f.brotes.push((r.brotes_pos / 12) * 100);
    f.hojas.push((r.hojas_adultas_pos / 12) * 100);
    f.limones.push((r.limones_pos / 12) * 100);
    f.botones.push((r.botones_pos / 12) * 100);
    f.yemas.push((r.yemas_pos / 12) * 100);
    f.general.push((total / 60) * 100);
  }

  const fincaNames = Array.from(byFinca.keys()).sort();

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const datasets = [
    {
      label: "Brotes",
      data: fincaNames.map((f) => avg(byFinca.get(f).brotes).toFixed(1)),
      backgroundColor: "#ff6384",
    },
    {
      label: "Hojas",
      data: fincaNames.map((f) => avg(byFinca.get(f).hojas).toFixed(1)),
      backgroundColor: "#36a2eb",
    },
    {
      label: "Limones",
      data: fincaNames.map((f) => avg(byFinca.get(f).limones).toFixed(1)),
      backgroundColor: "#ffce56",
    },
    {
      label: "Botones",
      data: fincaNames.map((f) => avg(byFinca.get(f).botones).toFixed(1)),
      backgroundColor: "#4bc0c0",
    },
    {
      label: "Yemas",
      data: fincaNames.map((f) => avg(byFinca.get(f).yemas).toFixed(1)),
      backgroundColor: "#9966ff",
    },
    {
      label: "Severidad General",
      data: fincaNames.map((f) => avg(byFinca.get(f).general).toFixed(1)),
      backgroundColor: "#ff9f40",
    },
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

async function exportPDF() {
  setStatus("Generando PDF...");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  // Título
  doc.setFontSize(18);
  doc.setFont(undefined, "bold");
  doc.text("Informe de Monitoreo de Ácaros", 105, 20, { align: "center" });

  // Período
  doc.setFontSize(12);
  doc.setFont(undefined, "normal");
  const period = `Período: ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}`;
  doc.text(period, 105, 28, { align: "center" });

  let yPos = 35;

  // 1) Severidad promedio por fecha (gráfica)
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("1. Severidad promedio por fecha", 14, yPos);
  yPos += 8;

  if (trendChart) {
    const trendImg = document.getElementById("trendChart").toDataURL("image/png");
    doc.addImage(trendImg, "PNG", 14, yPos, 180, 60);
    yPos += 65;
  }

  // 2) Severidad promedio por finca (desglose órganos)
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("2. Severidad promedio por finca (desglose por órgano)", 14, yPos);
  yPos += 8;

  if (fincaChart) {
    const fincaImg = document.getElementById("fincaChart").toDataURL("image/png");
    doc.addImage(fincaImg, "PNG", 14, yPos, 180, 60);
    yPos += 65;
  }

  // 3) Tabla de priorización
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("3. Priorización de campos a aplicar", 14, yPos);
  yPos += 5;

  const prioRows = Array.from(document.querySelectorAll("#prioTbl tbody tr")).map((tr) => {
    const cells = tr.querySelectorAll("td");
    return Array.from(cells).map((c) => c.textContent.trim());
  });

  doc.autoTable({
    startY: yPos,
    head: [["Prioridad", "Finca", "Bloque", "Sev% Prom", "Registros", "Acción"]],
    body: prioRows,
    theme: "grid",
    headStyles: { fillColor: [43, 102, 255] },
    styles: { fontSize: 10 },
  });

  yPos = doc.lastAutoTable.finalY + 10;

  // 4) Recomendación general
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("4. Recomendación general", 14, yPos);
  yPos += 8;

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");

  const recomendacion = `
Basado en los datos de monitoreo del período ${lastFilters.dateFrom || "N/A"} al ${lastFilters.dateTo || "N/A"}:

• Campos con severidad ≥66%: Aplicación URGENTE de control biológico o químico.
• Campos con severidad entre 33-66%: Aplicación RECOMENDADA en los próximos 7 días.
• Campos con severidad <33%: Monitoreo preventivo continuo cada 14 días.

Se recomienda priorizar las aplicaciones según la tabla de priorización presentada,
comenzando por los campos de mayor severidad promedio.

Considerar rotación de productos y uso de biocontroladores (Isaria javanica) para
reducir la presión de ácaros en el mediano plazo.
`.trim();

  const lines = doc.splitTextToSize(recomendacion, 180);
  doc.text(lines, 14, yPos);

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
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


