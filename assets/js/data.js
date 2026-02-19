import { supabase } from "./supabaseClient.js";

export async function fetchFincas(){
  const { data, error } = await supabase
    .from("fincas")
    .select("id,nombre,geojson")
    .order("nombre", { ascending: true });
  if(error) throw error;
  return data || [];
}

export async function fetchBloquesByFinca(finca_id){
  let q = supabase.from("bloques").select("id,finca_id,nombre,plantas_total,porcentaje,plantas_muestreo").order("nombre");
  if(finca_id) q = q.eq("finca_id", finca_id);
  const { data, error } = await q;
  if(error) throw error;
  return data || [];
}

export async function upsertMonitoreos(rows){
  const { error } = await supabase
    .from("monitoreos")
    .upsert(rows, { onConflict: "fingerprint" });
  if(error) throw error;
}

export async function fetchMonitoreos(filters, { page=0, pageSize=200 } = {}){
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("monitoreos")
    .select("id,fecha,lat,lon,tecnico,brotes_pos,hojas_adultas_pos,limones_pos,botones_pos,yemas_pos,finca_id,bloque_id,fincas(nombre),bloques(nombre)", { count: "exact" })
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
    .select("id,fecha,lat,lon,tecnico,brotes_pos,hojas_adultas_pos,limones_pos,botones_pos,yemas_pos,finca_id,bloque_id,fincas(nombre),bloques(nombre)")
    .order("fecha", { ascending: true })
    .limit(limit);

  q = applyFilters(q, filters);

  const { data, error } = await q;
  if(error) throw error;
  return data || [];
}

function applyFilters(q, f){
  if(f?.dateFrom) q = q.gte("fecha", f.dateFrom);
  if(f?.dateTo) q = q.lte("fecha", f.dateTo);
  if(f?.finca_id) q = q.eq("finca_id", f.finca_id);
  if(f?.bloque_id) q = q.eq("bloque_id", f.bloque_id);
  if(f?.tecnico && f.tecnico.trim()) q = q.ilike("tecnico", `%${f.tecnico.trim()}%`);
  return q;
}
