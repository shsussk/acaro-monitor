import streamlit as st
from PIL import Image

# Configuración de la página
st.set_page_config(
    page_title="Sistema de Monitoreo de Ácaros",
    page_icon="🌱",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Título principal
st.title("🌱 Sistema de Monitoreo de Ácaros en Cítricos")
st.markdown("---")

# Introducción
col1, col2 = st.columns([2, 1])

with col1:
    st.header("Bienvenido al Sistema de Monitoreo")
    st.markdown("""
    Este sistema te permite:

    📊 **Dashboard Interactivo**
    - Visualizar focos de ácaros en tiempo real
    - Mapas de calor por finca y bloque
    - Priorización automática de intervenciones

    📈 **Análisis Temporal**
    - Tendencias semanales de infestación
    - Comparación entre fincas y bloques
    - Identificación de patrones recurrentes

    ⬆️ **Carga de Datos**
    - Importar archivos CSV desde EpiCollect
    - Validación automática de datos
    - Sincronización con base de datos

    📄 **Reportes Automatizados**
    - Informes semanales por finca
    - Planes de acción priorizados
    - Exportación en PDF/Excel

    ⚙️ **Configuración**
    - Gestión de umbrales de severidad
    - Administración de usuarios
    - Actualización de polígonos
    """)

with col2:
    st.info("👈 **Usa el menú lateral para navegar entre las diferentes secciones**")

    # Resumen rápido
    st.metric("Fincas Monitoreadas", "6")
    st.metric("Bloques Activos", "20")
    st.metric("Última Actualización", "Hoy")

# Instrucciones rápidas
st.markdown("---")
st.subheader("🚀 Inicio Rápido")

tab1, tab2, tab3 = st.tabs(["📤 Cargar Datos", "📊 Ver Dashboard", "📄 Generar Reporte"])

with tab1:
    st.markdown("""
    1. Ve a **⬆️ Cargar Datos** en el menú lateral
    2. Sube tu archivo CSV exportado desde EpiCollect
    3. Revisa la vista previa y confirma la carga
    """)

with tab2:
    st.markdown("""
    1. Accede al **📊 Dashboard** desde el menú
    2. Selecciona la finca y rango de fechas
    3. Explora el mapa interactivo y tablas de resumen
    """)

with tab3:
    st.markdown("""
    1. Navega a **📄 Reportes**
    2. Selecciona el periodo y fincas
    3. Descarga el informe en PDF o Excel
    """)

# Footer
st.markdown("---")
st.caption("Sistema desarrollado para Plantaciones del Norte • Versión 1.0.0")
