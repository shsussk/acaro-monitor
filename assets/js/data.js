// assets/js/data.js
import { supabase } from "./supabaseClient.js";

// ── FINCAS ────────────────────────────────────────────
export async function fetchFincas(){
  const { data, error } = await supabase
    .from("fincas")
    .select("id,nombre,geojson")
    .order("nombre", { ascending: true });
  if(error) throw error;
  return data || [];
}

// ── BLOQUES ───────────────────────────────────────────
export async function fetchBloquesByFinca(finca_id){
  let q = supabase.from("bloques").select("id,finca_id,nombre,plantas_total,porcentaje,plantas_muestreo").order("nombre");
  if(finca_id) q = q.eq("finca_id", finca_id);
  const { data, error } = await q;
  if(error) throw error;
  return data || [];
}

// ── MONITOREOS ────────────────────────────────────────
export async function upsertMonitoreos(rows){
  const { error } = await supabase
    .from("monitoreos")
    .upsert(rows, { onConflict: "fingerprint" });
  if(error) throw error;
}

export async function fetchMonitoreos(filters, { page=0, pageSize=200 } = {}){
  const from = page * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from("monitoreos")
    .select("id,fecha,lat,lon,tecnico,brotes_hojas,hojas_adultas,brotes_limones,botones_florales,finca_id,bloque_id,fincas(nombre),bloques(nombre)", { count: "exact" })
    .order("fecha", { ascending: false })
    .range(from, to);

  q = applyFilters(q, filters);

  const { data, error, count } = await q;
  if(error) throw error;
  return { data: data || [], count: count ?? 0 };
}

export async function fetchMonitoreosAll(filters, { limit=10000 } = {}){
  // para informes: trae un volumen razonable (por defecto 10k)
  let q = supabase
    .from("monitoreos")
    .select("id,fecha,lat,lon,tecnico,brotes_hojas,hojas_adultas,brotes_limones,botones_florales,finca_id,bloque_id,fincas(nombre),bloques(nombre)")
    .order("fecha", { ascending: true })
    .limit(limit);

  q = applyFilters(q, filters);

  const { data, error } = await q;
  if(error) throw error;
  return data || [];
}

function applyFilters(q, f){
  if(f?.dateFrom)   q = q.gte("fecha", f.dateFrom);
  if(f?.dateTo)     q = q.lte("fecha", f.dateTo);
  if(f?.finca_id)   q = q.eq("finca_id",  f.finca_id);
  if(f?.bloque_id)  q = q.eq("bloque_id", f.bloque_id);
  if(f?.tecnico && f.tecnico.trim()) q = q.ilike("tecnico", `%${f.tecnico.trim()}%`);
  return q;
}

// ── APLICACIONES DE CONTROL ───────────────────────────

/**
 * Trae el historial de aplicaciones con join a fincas y bloques.
 */
export async function fetchAplicaciones(filters = {}) {
  let q = supabase
    .from("aplicaciones_control")
    .select("id,finca_id,bloque_id,fecha_aplicacion,producto,dosis,tecnico,notas,fincas(nombre),bloques(nombre)")
    .order("fecha_aplicacion", { ascending: false });

  if (filters.finca_id)  q = q.eq("finca_id",  filters.finca_id);
  if (filters.bloque_id) q = q.eq("bloque_id", filters.bloque_id);
  if (filters.dateFrom)  q = q.gte("fecha_aplicacion", filters.dateFrom);
  if (filters.dateTo)    q = q.lte("fecha_aplicacion", filters.dateTo);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Inserta una nueva aplicación de control.
 */
export async function insertAplicacion(row) {
  const { error } = await supabase.from("aplicaciones_control").insert(row);
  if (error) throw error;
}

/**
 * Elimina una aplicación de control por id.
 */
export async function deleteAplicacion(id) {
  const { error } = await supabase
    .from("aplicaciones_control")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Devuelve un mapa { bloque_id → { fecha, dias } } con la ÚLTIMA aplicación
 * por bloque. Si finca_id se pasa, filtra por finca.
 * "dias" = días transcurridos desde esa fecha hasta hoy.
 */
export async function fetchUltimaAplicacionPorBloque(finca_id = null) {
  let q = supabase
    .from("aplicaciones_control")
    .select("bloque_id, finca_id, fecha_aplicacion")
    .order("fecha_aplicacion", { ascending: false });

  if (finca_id) q = q.eq("finca_id", finca_id);

  const { data, error } = await q;
  if (error) throw error;

  const map = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const row of (data || [])) {
    const key = row.bloque_id ?? `finca_${row.finca_id}`;
    if (!map[key]) {
      const dt = new Date(row.fecha_aplicacion + "T00:00:00");
      const dias = Math.floor((today - dt) / (1000 * 60 * 60 * 24));
      map[key] = { fecha: row.fecha_aplicacion, dias };
    }
  }
  return map;
}
