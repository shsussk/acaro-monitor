// assets/js/data.js
import { supabase } from "./supabaseClient.js";

// ── FINCAS ────────────────────────────────────────────────────────────────────

export async function fetchFincas() {
  const { data, error } = await supabase
    .from("fincas")
    .select("id,nombre,geojson")
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── BLOQUES ───────────────────────────────────────────────────────────────────

export async function fetchBloquesByFinca(finca_id) {
  let q = supabase
    .from("bloques")
    .select("id,finca_id,nombre,plantas_total,porcentaje,plantas_muestreo")
    .order("nombre");
  if (finca_id) q = q.eq("finca_id", finca_id);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── TÉCNICOS ──────────────────────────────────────────────────────────────────
// NUEVO: fuente de verdad para los <select id="tecnico"> en monitoreo,
// control y dashboard. Admin gestiona el catálogo; aquí solo se leen activos.

export async function fetchTecnicos() {
  const { data, error } = await supabase
    .from("tecnicos")
    .select("id,nombre,rol")
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── MONITOREOS ────────────────────────────────────────────────────────────────
// CAMBIO: lat,lon eliminados del select — coordenadas removidas del sistema.
// CAMBIO: tecnico se filtra con eq (valor exacto del select) en vez de ilike.

export async function upsertMonitoreos(rows) {
  const { error } = await supabase
    .from("monitoreos")
    .upsert(rows, { onConflict: "fingerprint" });
  if (error) throw error;
}

export async function fetchMonitoreos(filters, { page = 0, pageSize = 200 } = {}) {
  const from = page * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from("monitoreos")
    .select(
      "id,fecha,tecnico,brotes_hojas,hojas_adultas,brotes_limones,botones_florales," +
      "finca_id,bloque_id,fincas(nombre),bloques(nombre)",
      { count: "exact" }
    )
    .order("fecha", { ascending: false })
    .range(from, to);

  q = applyMonitoreoFilters(q, filters);

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: data || [], count: count ?? 0 };
}

export async function fetchMonitoreosAll(filters, { limit = 10000 } = {}) {
  let q = supabase
    .from("monitoreos")
    .select(
      "id,fecha,tecnico,brotes_hojas,hojas_adultas,brotes_limones,botones_florales," +
      "finca_id,bloque_id,fincas(nombre),bloques(nombre)"
    )
    .order("fecha", { ascending: true })
    .limit(limit);

  q = applyMonitoreoFilters(q, filters);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// CAMBIO: tecnico usa eq (match exacto) porque viene de un <select>,
// no de texto libre que requería búsqueda parcial con ilike.
function applyMonitoreoFilters(q, f) {
  if (f?.dateFrom)  q = q.gte("fecha",     f.dateFrom);
  if (f?.dateTo)    q = q.lte("fecha",     f.dateTo);
  if (f?.finca_id)  q = q.eq("finca_id",  f.finca_id);
  if (f?.bloque_id) q = q.eq("bloque_id", f.bloque_id);
  if (f?.tecnico)   q = q.eq("tecnico",   f.tecnico);
  return q;
}

// ── APLICACIONES DE CONTROL ───────────────────────────────────────────────────
// CAMBIO: plaga_objetivo añadido al select y a los filtros.
// Necesario para filtrar solo aplicaciones de ácaro en reports.js
// (gráfico Severidad vs. Control y cálculo de días sin control).

export async function fetchAplicaciones(filters = {}) {
  let q = supabase
    .from("aplicaciones_control")
    .select(
      "id,finca_id,bloque_id,fecha_aplicacion,plaga_objetivo," +
      "producto,dosis,tecnico,notas,fincas(nombre),bloques(nombre)"
    )
    .order("fecha_aplicacion", { ascending: false });

  if (filters.finca_id)  q = q.eq("finca_id",        filters.finca_id);
  if (filters.bloque_id) q = q.eq("bloque_id",       filters.bloque_id);
  if (filters.plaga)     q = q.eq("plaga_objetivo",  filters.plaga);
  if (filters.dateFrom)  q = q.gte("fecha_aplicacion", filters.dateFrom);
  if (filters.dateTo)    q = q.lte("fecha_aplicacion", filters.dateTo);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function insertAplicacion(row) {
  const { error } = await supabase.from("aplicaciones_control").insert(row);
  if (error) throw error;
}

export async function deleteAplicacion(id) {
  const { error } = await supabase
    .from("aplicaciones_control")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// CAMBIO: parámetro `plaga` añadido, por defecto "acaro".
// Una aplicación contra Diaphorina NO debe reiniciar el contador de días
// sin control de ácaro. Sin este filtro, un bloque puede aparecer como
// "controlado" cuando en realidad el ácaro no fue tratado.
// Incluye "multiple" porque esas aplicaciones también cubren ácaro.
// Llamadores que necesiten todas las plagas pasan plaga = null.
export async function fetchUltimaAplicacionPorBloque(finca_id = null, plaga = "acaro") {
  let q = supabase
    .from("aplicaciones_control")
    .select("bloque_id,finca_id,fecha_aplicacion,plaga_objetivo")
    .order("fecha_aplicacion", { ascending: false });

  if (finca_id) q = q.eq("finca_id", finca_id);
  if (plaga)    q = q.in("plaga_objetivo", [plaga, "multiple"]);

  const { data, error } = await q;
  if (error) throw error;

  const map   = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of (data || [])) {
    const key = row.bloque_id ?? `finca_${row.finca_id}`;
    if (!map[key]) {
      // Parseo explícito sin zona horaria para evitar desfases de ±1 día
      // (new Date("2026-03-15") se interpreta como UTC medianoche,
      //  lo que en UTC-4 da el día anterior)
      const [yr, mo, dy] = row.fecha_aplicacion.split("-").map(Number);
      const dt   = new Date(yr, mo - 1, dy);
      const dias = Math.floor((today - dt) / (1000 * 60 * 60 * 24));
      map[key] = { fecha: row.fecha_aplicacion, dias };
    }
  }
  return map;
}
