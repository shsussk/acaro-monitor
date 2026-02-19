# Monitoreo agrícola de ácaros (Supabase + GitHub Pages)

## 1) Config
Edita `assets/js/config.js` y pega tu `SUPABASE_ANON_KEY`.

## 2) Tablas
Ejecuta el SQL del archivo de instalación (en Supabase > SQL Editor).

## 3) Publicar en GitHub Pages
- Settings > Pages
- Source: Deploy from a branch
- Branch: main / root (o /docs)

## 4) Formato de Excel/CSV
Columnas mínimas (nombres flexibles):
- Fecha
- Finca
- Lat / Latitud
- Lon / Longitud

Opcionales:
- Técnico
- Brotes, Hojas, Limones, Botones, Yemas
- Bloque (ej. "Bloque 1" o "1")

## 5) Deduplicación
Se crea `fingerprint = fecha|finca_id|bloque_id|lat|lon|tecnico` en frontend.
La tabla tiene UNIQUE(fingerprint) y se sube con upsert.
