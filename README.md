# 🌿 Sistema de Monitoreo de Ácaros

Sistema web estático para monitoreo agrícola de ácaros, diseñado para publicarse en **GitHub Pages** y conectarse a **Supabase** como backend.

## 📋 Estructura del proyecto

```
acaros-monitor/
├── index.html        → Dashboard (mapa + KPIs + tabla)
├── exceles.html      → Carga de archivos CSV/Excel
├── informes.html     → Informes y gráficos
├── admin.html        → Gestión de fincas y bloques + SQL setup
├── config.js         → Variables de Supabase (URL + anon key)
├── app.js            → Módulo compartido (client Supabase + utils)
├── styles.css        → Estilos globales
└── README.md         → Esta documentación
```

## 🚀 Instalación paso a paso

### 1. Crear proyecto en Supabase
1. Ir a [supabase.com](https://supabase.com) y crear un proyecto
2. Copiar la **URL** y **anon key** del proyecto

### 2. Configurar las keys
Editar `config.js` y reemplazar los valores:
```javascript
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-aqui';
```

### 3. Crear las tablas en Supabase
1. Ir al **SQL Editor** en Supabase
2. Copiar y ejecutar el SQL que aparece en la página **Admin** de la app
3. (O copiar el SQL del archivo `setup.sql` incluido en este repo)

### 4. Agregar fincas y bloques
1. Ir a la página **Admin** de la app
2. Agregar las fincas y sus bloques

### 5. Publicar en GitHub Pages
```bash
git init
git add .
git commit -m "Monitoreo ácaros v1"
git remote add origin https://github.com/TU-USUARIO/acaros-monitor.git
git push -u origin main
```
En GitHub: Settings → Pages → Source: main → / (root)

## 📊 Formato del archivo Excel/CSV

### Columnas requeridas:
| Columna | Tipo | Ejemplo |
|---------|------|---------|
| Fecha | Fecha | 2026-02-15, 15/02/2026 |
| Finca | Texto | La Esperanza |
| Lat / Latitud | Número | 19.6523 |
| Lon / Longitud | Número | -71.0830 |

### Columnas opcionales:
| Columna | Tipo | Default | Ejemplo |
|---------|------|---------|---------|
| Bloque | Texto | null | B-3 |
| Técnico | Texto | '' | Juan Pérez |
| Brotes | Entero | 0 | 5 |
| Hojas | Entero | 0 | 3 |
| Limones | Entero | 0 | 2 |
| Botones | Entero | 0 | 1 |
| Yemas | Entero | 0 | 4 |

### Notas sobre el formato:
- Los nombres de columnas son flexibles (se mapean automáticamente)
- Las fechas aceptan múltiples formatos (YYYY-MM-DD, DD/MM/YYYY, etc.)
- Los nombres de finca deben coincidir con el catálogo (sin importar mayúsculas/tildes)
- El bloque debe existir en el catálogo bajo esa finca

## 📐 Fórmula de Severidad

```
Severidad (%) = ((brotes + hojas + limones + botones + yemas) / 60) × 100
```

- **< 20%**: 🟢 Baja (verde)
- **20–50%**: 🟡 Media (amarillo)
- **> 50%**: 🔴 Alta (rojo)

## 🔒 Seguridad (RLS)

El sistema usa la **anon key** de Supabase con Row Level Security (RLS) habilitado.
Las políticas permiten lectura, inserción y actualización anónima.

> ⚠️ Para producción con múltiples usuarios, implementar Supabase Auth.

## 🔄 Deduplicación

Cada registro tiene un `fingerprint` único generado como:
```
fecha|finca_id|bloque_id|lat|lon|tecnico
```

Si se sube el mismo archivo dos veces, los registros no se duplican gracias al `upsert` con `onConflict: 'fingerprint'`.

## 🛠️ Tecnologías

- **Frontend**: HTML/CSS/JS vanilla (sin frameworks)
- **Backend**: Supabase (PostgreSQL + API REST)
- **Mapa**: Leaflet + Leaflet.heat
- **Gráficos**: Chart.js
- **Parsing**: PapaParse (CSV), SheetJS (Excel)
- **CDN**: Todas las dependencias se cargan por CDN
