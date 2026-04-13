// seed_geojson.js — ejecutar una sola vez en la consola del navegador
// o como script Node con la clave de servicio de Supabase

import { createClient } from "@supabase/supabase-js";
import { FINCAS_GEOJSON } from "./fincasGeojson.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

for (const feature of FINCAS_GEOJSON.features) {
  const nombre = feature.properties.name;
  const { error } = await supabase
    .from("fincas")
    .update({ geojson: feature.geometry })
    .eq("nombre", nombre);

  if (error) console.error(`Error en ${nombre}:`, error.message);
  else console.log(`✓ ${nombre}`);
}
