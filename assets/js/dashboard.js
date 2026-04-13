// assets/js/dashboard.js
import { requireAuth } from "./authGuard.js";
import { supabase }    from "./supabaseClient.js";
import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchTecnicos,
  fetchMonitoreos,
  fetchUltimaAplicacionPorBloque,
} from "./data.js";

await requireAuth();

let fincas       = [];
let tecnicos     = [];
let bloquesCache = new Map();
let page         = 0;
const pageSize   = 200;
let lastCount    = 0;

const U_ALERT     = 25;
const U_INT       = 42;
const U_CRIT      = 67;

init();

async function init() {
  setupUI();
  await loadCatalogs();
  await refresh();
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
  [fincas, tecnicos] = await Promise.all([
    fetchFincas(),
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

  // Técnicos select
  const tecnicoSelect = document.getElementById("tecnicoSelect");
  if (tecnicoSelect) {
    tecnicoSelect.innerHTML = `<option value="">Todos</option>`;
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
  const tecnico    = document.getElementById("tecnicoSelect")?.value || null;

  let dateFrom = null, dateTo = null;
  const today = new Date();
  const ymd = d =>
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

  renderTable(data, ultimasAplicaciones);

  const maxPage = Math.max(1, Math.ceil(count / pageSize));
  document.getElementById("pageInfo").textContent =
    `Página ${page + 1} / ${maxPage} (Total: ${count})`;

  setStatus("");
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

function renderTable(rows, ultimasAplicaciones = {}) {
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const sev = sevHA(r);
    const key = r.bloque_id ?? `finca_${r.finca_id}`;
    const ult = ultimasAplicaciones[key];
    const diasStr = ult ? (ult.dias === 0 ? "hoy" : `${ult.dias}d`) : "—";

    const nivelClass = sev === null      ? ""
      : sev >= U_CRIT  ? "nivel nivel-critico"
      : sev >= U_INT   ? "nivel nivel-interv"
      : sev >= U_ALERT ? "nivel nivel-alerta"
      : "nivel nivel-ok";

    const nivelText = sev === null      ? "—"
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

function sevHA(r) {
  if (r.hojas_adultas === null || r.hojas_adultas === undefined) return null;
  return (r.hojas_adultas / 12) * 100;
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}
 
