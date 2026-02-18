# 🌱 Sistema de Monitoreo de Ácaros en Cítricos

Sistema web interactivo para monitoreo, análisis y gestión de infestación de ácaros en plantaciones de cítricos.

## 📋 Características

- **Dashboard Interactivo**: Visualización en tiempo real con mapas de calor
- **Análisis Temporal**: Seguimiento de tendencias semanales y mensuales
- **Carga de Datos**: Importación desde EpiCollect (CSV)
- **Reportes Automatizados**: Generación de informes en PDF/Excel
- **Gestión Completa**: Configuración de umbrales, usuarios y fincas

## 🚀 Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/acaro-monitoring-system.git
cd acaro-monitoring-system
```

### 2. Crear entorno virtual
```bash
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
```

### 3. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 4. Configurar variables de entorno
Crea un archivo `.env` en la raíz del proyecto:
```env
SUPABASE_URL=tu_url_de_supabase
SUPABASE_KEY=tu_api_key
```

### 5. Ejecutar la aplicación
```bash
streamlit run app.py
```

La aplicación se abrirá automáticamente en `http://localhost:8501`

## 📁 Estructura del Proyecto

```
acaro-monitoring-system/
├── .streamlit/           # Configuración de Streamlit
├── pages/                # Páginas de la aplicación
│   ├── 1_📊_Dashboard.py
│   ├── 2_📈_Análisis_Temporal.py
│   ├── 3_⬆️_Cargar_Datos.py
│   ├── 4_📄_Reportes.py
│   └── 5_⚙️_Configuración.py
├── utils/                # Módulos utilitarios
│   ├── database.py
│   ├── calculations.py
│   ├── maps.py
│   └── reports.py
├── data/                 # Datos de configuración
│   ├── poligonos/        # Archivos GeoJSON/SHP
│   └── umbrales.json
├── assets/               # Recursos estáticos
├── app.py                # Aplicación principal
├── requirements.txt      # Dependencias
└── README.md
```

## 🗺️ Configuración de Mapas

### Cargar Polígonos de Fincas

1. Exporta los polígonos de tus fincas en formato GeoJSON, KML o Shapefile
2. Coloca los archivos en `data/poligonos/`
3. En la aplicación, ve a **⚙️ Configuración** > **Gestión de Fincas**
4. Carga los archivos usando el botón de upload

## 📊 Carga de Datos desde EpiCollect

### Formato esperado del CSV:

| Columna | Descripción | Tipo | Ejemplo |
|---------|-------------|------|---------|
| 1_Fecha | Fecha de monitoreo | Fecha | 10/09/2025 |
| 3_Técnico | Nombre del técnico | Texto | Samuel Jiménez |
| 4_Finca | Nombre de la finca | Texto | B. Cementerio |
| 5_BloqueSector | Número de bloque | Entero | 1 |
| lat_6_Geolocalizacin | Latitud | Decimal | 19.649244 |
| long_6_Geolocalizacin | Longitud | Decimal | -71.294723 |
| 10_Brotes_hojas | Presencia en brotes (0-12) | Entero | 1 |
| 11_Hojas_adultas | Presencia en hojas (0-12) | Entero | 11 |
| 12_Brotes_limones | Presencia en limones (0-12) | Entero | 0 |
| 13_Botone_florales | Presencia en botones (0-12) | Entero | 0 |
| 14_Yemas | Presencia en yemas (0-12) | Entero | 0 |

## 🔧 Configuración de Umbrales

Los umbrales por defecto son:

| Nivel | Hojas Adultas | Brotes | Limones | Botones | Yemas |
|-------|---------------|--------|---------|---------|-------|
| 🟢 Leve | 0-40% | 0-30% | 0-20% | 0-35% | 0-30% |
| 🟡 Moderado | 40-60% | 30-50% | 20-40% | 35-55% | 30-50% |
| 🟠 Alto | 60-80% | 50-70% | 40-60% | 55-75% | 50-70% |
| 🔴 Crítico | >80% | >70% | >60% | >75% | >70% |

Puedes modificarlos en **⚙️ Configuración** > **Umbrales de Severidad**

## 👥 Gestión de Usuarios

El sistema maneja 3 roles:

1. **Técnico de Campo**: Visualización y carga de datos
2. **Supervisor**: Acceso a reportes y configuración de umbrales
3. **Administrador**: Acceso completo al sistema

## 📄 Generación de Reportes

### Tipos de reportes disponibles:

- **Informe Semanal**: Resumen de la última semana
- **Informe Mensual**: Análisis del último mes
- **Reporte Ejecutivo**: Resumen para dirección
- **Reporte por Finca**: Análisis detallado de una finca específica

### Formatos de exportación:
- PDF (con gráficos y mapas)
- Excel (datos tabulares)
- CSV (datos crudos)

## 🔗 Integración con Supabase

### Crear la base de datos:

```sql
-- Tabla de monitoreos
CREATE TABLE monitoreos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha DATE NOT NULL,
    tecnico VARCHAR(100),
    finca VARCHAR(100),
    bloque INTEGER,
    lat DECIMAL(10, 7),
    lon DECIMAL(10, 7),
    brotes_hojas INTEGER,
    hojas_adultas INTEGER,
    limones INTEGER,
    botones_florales INTEGER,
    yemas INTEGER,
    temperatura DECIMAL(5, 2),
    humedad DECIMAL(5, 2),
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de umbrales
CREATE TABLE umbrales (
    id SERIAL PRIMARY KEY,
    estructura VARCHAR(50),
    leve INTEGER,
    moderado INTEGER,
    alto INTEGER,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de fincas
CREATE TABLE fincas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE,
    total_bloques INTEGER,
    total_plantas INTEGER,
    plantas_muestreo INTEGER,
    geom GEOMETRY(POLYGON, 4326),
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 📈 Roadmap

- [ ] Implementación completa de Supabase
- [ ] Sistema de notificaciones por email/WhatsApp
- [ ] Modelo predictivo de riesgo
- [ ] App móvil para técnicos en campo
- [ ] Integración con datos climáticos API
- [ ] Dashboard de comparación inter-fincas
- [ ] Sistema de gestión de tratamientos

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Crea un fork del repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo Licencia MIT.

## 📧 Contacto

**Plantaciones del Norte**
- Email: contacto@plantaciones.com
- Web: https://www.plantaciones.com

## 🙏 Agradecimientos

- Equipo técnico de campo por la recolección de datos
- EpiCollect5 por la plataforma de captura de datos
- Comunidad de Streamlit por el framework

---

**Desarrollado con ❤️ para Plantaciones del Norte**
