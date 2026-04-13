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

export async function fetchTecnicos() {
  const { data, error } = await supabase
    .from("tecnicos")
    .select("id,nombre")          // ← corregido: sin columna rol (no existe)
    .eq("activo", true)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── MONITOREOS ────────────────────────────────────────────────────────────────

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

function applyMonitoreoFilters(q, f) {
  if (f?.dateFrom)  q = q.gte("fecha",     f.dateFrom);
  if (f?.dateTo)    q = q.lte("fecha",     f.dateTo);
  if (f?.finca_id)  q = q.eq("finca_id",  f.finca_id);
  if (f?.bloque_id) q = q.eq("bloque_id", f.bloque_id);
  if (f?.tecnico)   q = q.eq("tecnico",   f.tecnico);
  return q;
}

// ── APLICACIONES DE CONTROL ───────────────────────────────────────────────────

export async function fetchAplicaciones(filters = {}) {
  let q = supabase
    .from("aplicaciones_control")
    .select(
      "id,finca_id,bloque_id,fecha_aplicacion,plaga_objetivo," +
      "producto,dosis,tecnico,notas,fincas(nombre),bloques(nombre)"
    )
    .order("fecha_aplicacion", { ascending: false });

  if (filters.finca_id)  q = q.eq("finca_id",          filters.finca_id);
  if (filters.bloque_id) q = q.eq("bloque_id",         filters.bloque_id);
  if (filters.plaga)     q = q.eq("plaga_objetivo",    filters.plaga);
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
      const [yr, mo, dy] = row.fecha_aplicacion.split("-").map(Number);
      const dt   = new Date(yr, mo - 1, dy);
      const dias = Math.floor((today - dt) / (1000 * 60 * 60 * 24));
      map[key] = { fecha: row.fecha_aplicacion, dias };
    }
  }
  return map;
}
