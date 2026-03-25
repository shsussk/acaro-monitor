// assets/js/control.js
import { requireAuth } from "./authGuard.js";
await requireAuth();

import { supabase } from "./supabaseClient.js";
import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchAplicaciones,
  insertAplicacion,
  deleteAplicacion,
} from "./data.js";

let fincas = [];
let bloquesCache = new Map();

init();

async function init() {
  // Default: fecha de hoy
  document.getElementById("fechaApl").value = new Date().toISOString().split("T")[0];

  await loadCatalogs();
  setupForm();
  await loadTable();

  // Cerrar sesión
  document.getElementById("btnLogout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = "login.html";
  });
}

// ── Catálogos ─────────────────────────────────────────
async function loadCatalogs() {
  fincas = await fetchFincas();

  const fincaSel    = document.getElementById("fincaSel");
  const filtroFinca = document.getElementById("filtroFinca");

  for (const f of fincas) {
    for (const sel of [fincaSel, filtroFinca]) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.nombre;
      sel.appendChild(opt);
    }
  }

  // Cascade finca → bloque en el formulario
  fincaSel.addEventListener("change", () =>
    populateBloques(fincaSel.value ? parseInt(fincaSel.value) : null)
  );
}

async function populateBloques(finca_id) {
  const sel = document.getElementById("bloqueSel");
  sel.innerHTML = `<option value="">Todos / N/A</option>`;
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

// ── Formulario ────────────────────────────────────────
function setupForm() {
  document.getElementById("formControl").addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("Guardando…");

    const finca_id        = parseInt(document.getElementById("fincaSel").value);
    const bloque_raw      = document.getElementById("bloqueSel").value;
    const fecha_aplicacion = document.getElementById("fechaApl").value;
    const producto        = document.getElementById("producto").value.trim() || null;
    const dosis           = document.getElementById("dosis").value.trim()    || null;
    const tecnico         = document.getElementById("tecnico").value.trim()  || null;
    const notas           = document.getElementById("notas").value.trim()    || null;

    if (!finca_id || !fecha_aplicacion) {
      setStatus("⚠️ Finca y fecha son obligatorios.");
      return;
    }

    try {
      await insertAplicacion({
        finca_id,
        bloque_id: bloque_raw ? parseInt(bloque_raw) : null,
        fecha_aplicacion,
        producto,
        dosis,
        tecnico,
        notas,
      });

      setStatus("✅ Aplicación registrada correctamente.");
      document.getElementById("formControl").reset();
      document.getElementById("fechaApl").value = new Date().toISOString().split("T")[0];
      document.getElementById("bloqueSel").innerHTML = `<option value="">Todos / N/A</option>`;
      document.getElementById("bloqueSel").disabled = true;
      await loadTable();
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    }
  });

  document.getElementById("btnFiltrar").addEventListener("click", loadTable);
}

// ── Tabla historial ───────────────────────────────────
async function loadTable() {
  const finca_id = document.getElementById("filtroFinca").value || null;
  const dateFrom  = document.getElementById("filtroDesde").value  || null;
  const dateTo    = document.getElementById("filtroHasta").value  || null;

  const rows = await fetchAplicaciones({
    finca_id: finca_id ? parseInt(finca_id) : null,
    dateFrom,
    dateTo,
  });

  const tbody = document.querySelector("#tblControl tbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#888">Sin registros</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha_aplicacion}</td>
      <td>${r.fincas?.nombre  ?? "—"}</td>
      <td>${r.bloques?.nombre ?? "—"}</td>
      <td>${r.producto ?? "—"}</td>
      <td>${r.dosis    ?? "—"}</td>
      <td>${r.tecnico  ?? "—"}</td>
      <td>${r.notas    ?? "—"}</td>
      <td><button class="btn btnLight" style="padding:2px 8px;font-size:12px;" data-id="${r.id}">🗑</button></td>
    `;
    tr.querySelector("button").addEventListener("click", async () => {
      if (!confirm("¿Eliminar este registro?")) return;
      try {
        await deleteAplicacion(r.id);
        setStatus("Registro eliminado.");
        await loadTable();
      } catch (err) {
        setStatus(`❌ Error: ${err.message}`);
      }
    });
    tbody.appendChild(tr);
  }
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}
