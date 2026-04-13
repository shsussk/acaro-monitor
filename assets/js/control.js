// assets/js/control.js
import { requireAuth } from "./authGuard.js";
await requireAuth();

import { supabase } from "./supabaseClient.js";
import {
  fetchFincas,
  fetchBloquesByFinca,
  fetchTecnicos,       // ← NUEVO: técnicos desde el catálogo de admin
  fetchAplicaciones,
  insertAplicacion,
  deleteAplicacion,
} from "./data.js";

let fincas      = [];
let tecnicos    = [];       // ← NUEVO
let bloquesCache = new Map();

init();

async function init() {
  document.getElementById("fechaApl").value = new Date().toISOString().split("T")[0];

  await loadCatalogs();
  setupForm();
  await loadTable();

  document.getElementById("btnLogout")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = "login.html";
  });
}

// ── Catálogos ─────────────────────────────────────────────────────────────────

async function loadCatalogs() {
  [fincas, tecnicos] = await Promise.all([
    fetchFincas(),
    fetchTecnicos(),    // ← NUEVO: carga técnicos activos del catálogo
  ]);

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

  // ← NUEVO: poblar select de técnico con catálogo centralizado.
  // value = nombre del técnico (texto) para mantener compatibilidad con
  // el campo de texto libre que existía antes. Si el esquema tiene tecnico_id
  // como FK, cambiar a opt.value = t.id y pasar tecnico_id en insertAplicacion.
  const tecnicoSel = document.getElementById("tecnico");
  for (const t of tecnicos) {
    const opt = document.createElement("option");
    opt.value       = t.nombre;
    opt.textContent = t.nombre;
    tecnicoSel.appendChild(opt);
  }

  // Cascade finca → bloque en el formulario
  fincaSel.addEventListener("change", () =>
    populateBloques(
      fincaSel.value ? parseInt(fincaSel.value) : null,
      "bloqueSel",
      `<option value="">Todos / N/A</option>`
    )
  );

  // ← NUEVO: cascade finca → bloque en el filtro del historial
  filtroFinca.addEventListener("change", () =>
    populateBloques(
      filtroFinca.value ? parseInt(filtroFinca.value) : null,
      "filtroBloque",
      `<option value="">Todos</option>`
    )
  );
}

async function populateBloques(finca_id, selectId, emptyOption) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = emptyOption;
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

// ── Formulario ────────────────────────────────────────────────────────────────

function setupForm() {
  document.getElementById("formControl").addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("Guardando…");

    const finca_id         = parseInt(document.getElementById("fincaSel").value);
    const bloque_raw       = document.getElementById("bloqueSel").value;
    const fecha_aplicacion = document.getElementById("fechaApl").value;
    const plaga_objetivo   = document.getElementById("plagaObj").value  || null; // ← NUEVO
    const producto         = document.getElementById("producto").value.trim() || null;
    const dosis            = document.getElementById("dosis").value.trim()    || null;
    const tecnico          = document.getElementById("tecnico").value         || null;
    const notas            = document.getElementById("notas").value.trim()    || null;

    if (!finca_id || !fecha_aplicacion) {
      setStatus("⚠️ Finca y fecha son obligatorios.");
      return;
    }

    // plaga_objetivo requerido para que los informes puedan filtrar
    // aplicaciones de ácaro vs. otras plagas
    if (!plaga_objetivo) {
      setStatus("⚠️ Selecciona la plaga objetivo.");
      return;
    }

    try {
      await insertAplicacion({
        finca_id,
        bloque_id:       bloque_raw ? parseInt(bloque_raw) : null,
        fecha_aplicacion,
        plaga_objetivo,  // ← NUEVO
        producto,
        dosis,
        tecnico,
        notas,
      });

      setStatus("✅ Aplicación registrada correctamente.");
      document.getElementById("formControl").reset();
      document.getElementById("fechaApl").value = new Date().toISOString().split("T")[0];
      document.getElementById("bloqueSel").innerHTML = `<option value="">Todos / N/A</option>`;
      document.getElementById("bloqueSel").disabled  = true;
      await loadTable();
    } catch (err) {
      setStatus(`❌ Error: ${err.message}`);
    }
  });

  document.getElementById("btnFiltrar").addEventListener("click", loadTable);
}

// ── Tabla historial ───────────────────────────────────────────────────────────

async function loadTable() {
  const finca_id     = document.getElementById("filtroFinca").value  || null;
  const bloque_id    = document.getElementById("filtroBloque").value || null;  // ← NUEVO
  const plaga        = document.getElementById("filtroPlaga").value  || null;  // ← NUEVO
  const dateFrom     = document.getElementById("filtroDesde").value  || null;
  const dateTo       = document.getElementById("filtroHasta").value  || null;

  const rows = await fetchAplicaciones({
    finca_id:  finca_id  ? parseInt(finca_id)  : null,
    bloque_id: bloque_id ? parseInt(bloque_id) : null, // ← NUEVO: filtro de bloque
    plaga,                                              // ← NUEVO: filtro de plaga
    dateFrom,
    dateTo,
  });

  const tbody = document.querySelector("#tblControl tbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    // ← colspan actualizado de 8 a 9 (columna Plaga añadida)
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#888">Sin registros</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.fecha_aplicacion}</td>
      <td>${r.fincas?.nombre  ?? "—"}</td>
      <td>${r.bloques?.nombre ?? "—"}</td>
      <td>${formatPlaga(r.plaga_objetivo)}</td>
      <td>${r.producto ?? "—"}</td>
      <td>${r.dosis    ?? "—"}</td>
      <td>${r.tecnico  ?? "—"}</td>
      <td>${r.notas    ?? "—"}</td>
      <td>
        <button class="btn btnLight" style="padding:2px 8px;font-size:12px;"
                data-id="${r.id}">🗑</button>
      </td>
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

// ── Utils ─────────────────────────────────────────────────────────────────────

// Convierte el valor interno de plaga_objetivo en etiqueta legible
function formatPlaga(val) {
  const labels = {
    acaro:      "Ácaro",
    diaphorina: "Diaphorina",
    minador:    "Minador",
    multiple:   "Múltiples",
    otro:       "Otro",
  };
  return labels[val] ?? (val || "—");
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg || "";
}
