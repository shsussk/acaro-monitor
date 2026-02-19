import { fetchFincas, fetchBloquesByFinca, fetchMonitoreosAll } from "./data.js";
import { severityPct, downloadText } from "./utils.js";

let fincas = [];
let bloquesCache = new Map();
let chart = null;

init();

async function init(){
  setupUI();
  await loadCatalogs();
  await refresh();
}

function setupUI(){
  const datePreset = document.getElementById("datePreset");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");

  datePreset.addEventListener("change", ()=>{
    const custom = datePreset.value === "custom";
    dateFrom.disabled = !custom;
    dateTo.disabled = !custom;
  });

  document.getElementById("btnRefresh").addEventListener("click", refresh);
  document.getElementById("btnExport").addEventListener("click", exportCSV);

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
  };
}

let lastSummary = [];

async function refresh(){
  setStatus("Cargando...");
  const filters = getFilters();
  const rows = await fetchMonitoreosAll(filters, { limit: 10000 });

  // KPIs
  const sevs = rows.map(r=>severityPct(r));
  const avg = sevs.length ? (sevs.reduce((a,b)=>a+b,0)/sevs.length) : 0;

  document.getElementById("kpiReg").textContent = rows.length;
  document.getElementById("kpiSev").textContent = `${avg.toFixed(1)}%`;

  // Top 5
  const top = rows
    .map(r=>({ r, sev: severityPct(r) }))
    .sort((a,b)=> b.sev - a.sev)
    .slice(0, 5);

  const topBody = document.querySelector("#topTbl tbody");
  topBody.innerHTML = "";
  for(const x of top){
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
  const agg = new Map(); // key -> {finca,bloque,n,sum}
  for(const r of rows){
    const finca = r.fincas?.nombre ?? String(r.finca_id ?? "");
    const bloque = r.bloques?.nombre ?? (r.bloque_id ? String(r.bloque_id) : "");
    const key = `${finca}||${bloque}`;
    const sev = severityPct(r);

    if(!agg.has(key)) agg.set(key, { finca, bloque, n:0, sum:0 });
    const a = agg.get(key);
    a.n += 1;
    a.sum += sev;
  }

  const summary = Array.from(agg.values())
    .map(a=>({ ...a, avg: a.n ? a.sum/a.n : 0 }))
    .sort((a,b)=> b.avg - a.avg);

  lastSummary = summary;

  const sumBody = document.querySelector("#sumTbl tbody");
  sumBody.innerHTML = "";
  for(const a of summary){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.finca}</td>
      <td>${a.bloque || "-"}</td>
      <td>${a.n}</td>
      <td>${a.avg.toFixed(1)}</td>
    `;
    sumBody.appendChild(tr);
  }

  // Tendencia diaria
  const byDay = new Map(); // fecha -> {n,sum}
  for(const r of rows){
    const d = r.fecha;
    const sev = severityPct(r);
    if(!byDay.has(d)) byDay.set(d, { n:0, sum:0 });
    const a = byDay.get(d);
    a.n += 1;
    a.sum += sev;
  }
  const days = Array.from(byDay.entries())
    .map(([d,a])=>({ d, avg: a.sum/a.n, n:a.n }))
    .sort((x,y)=> x.d.localeCompare(y.d));

  renderTrend(days);

  setStatus("");
}

function renderTrend(days){
  const ctx = document.getElementById("trendChart");

  const labels = days.map(x=>x.d);
  const data = days.map(x=>Number(x.avg.toFixed(2)));

  if(chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Severidad promedio (%)",
        data,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true, suggestedMax: 100 }
      }
    }
  });
}

function exportCSV(){
  const rows = lastSummary || [];
  const header = ["Finca","Bloque","Registros","Severidad_promedio"];
  const lines = [header.join(",")];

  for(const r of rows){
    const line = [
      csvEsc(r.finca),
      csvEsc(r.bloque || ""),
      r.n,
      r.avg.toFixed(2)
    ].join(",");
    lines.push(line);
  }

  downloadText(`resumen_${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"), "text/csv");
}

function csvEsc(s){
  const v = String(s ?? "");
  if(/[",\n]/.test(v)) return `"${v.replaceAll('"','""')}"`;
  return v;
}

function setStatus(msg){
  document.getElementById("status").textContent = msg || "";
}
