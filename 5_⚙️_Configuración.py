import streamlit as st
import pandas as pd
import json

st.set_page_config(page_title="Configuración", page_icon="⚙️", layout="wide")

st.title("⚙️ Configuración del Sistema")
st.markdown("Administración de umbrales, usuarios y parámetros generales")

# Tabs de configuración
tab1, tab2, tab3, tab4 = st.tabs([
    "🎯 Umbrales de Severidad",
    "👥 Usuarios y Permisos",
    "🗺️ Gestión de Fincas",
    "⚙️ Parámetros Generales"
])

with tab1:
    st.header("🎯 Configuración de Umbrales")
    st.markdown("Define los niveles de severidad para cada estructura vegetal")

    # Seleccionar estructura
    estructura = st.selectbox(
        "Seleccionar estructura vegetal",
        ["Hojas adultas", "Brotes/hojas jóvenes", "Limones", "Botones florales", "Yemas"]
    )

    st.markdown("---")

    # Umbrales actuales
    col1, col2 = st.columns([1, 1])

    with col1:
        st.subheader("Umbrales Actuales")

        # Valores por defecto (ejemplo)
        umbrales_actuales = {
            "Leve": "0-40%",
            "Moderado": "40-60%",
            "Alto": "60-80%",
            "Crítico": ">80%"
        }

        st.info("**Hojas adultas** (valores actuales)")
        for nivel, rango in umbrales_actuales.items():
            color = {"Leve": "🟢", "Moderado": "🟡", "Alto": "🟠", "Crítico": "🔴"}
            st.markdown(f"{color[nivel]} **{nivel}**: {rango}")

    with col2:
        st.subheader("Modificar Umbrales")

        st.number_input("🟢 Leve: desde 0% hasta", min_value=0, max_value=100, value=40, step=5)
        st.number_input("🟡 Moderado: hasta", min_value=0, max_value=100, value=60, step=5)
        st.number_input("🟠 Alto: hasta", min_value=0, max_value=100, value=80, step=5)
        st.markdown("🔴 **Crítico**: >80%")

        if st.button("💾 Guardar Cambios", type="primary"):
            st.success("✅ Umbrales actualizados correctamente")

    # Tabla comparativa
    st.markdown("---")
    st.subheader("📊 Resumen de Umbrales por Estructura")

    data_umbrales = {
        'Estructura': ['Hojas adultas', 'Brotes', 'Limones', 'Botones', 'Yemas'],
        'Leve (%)': ['0-40', '0-30', '0-20', '0-35', '0-30'],
        'Moderado (%)': ['40-60', '30-50', '20-40', '35-55', '30-50'],
        'Alto (%)': ['60-80', '50-70', '40-60', '55-75', '50-70'],
        'Crítico (%)': ['>80', '>70', '>60', '>75', '>70']
    }

    df_umbrales = pd.DataFrame(data_umbrales)
    st.dataframe(df_umbrales, hide_index=True, use_container_width=True)

with tab2:
    st.header("👥 Gestión de Usuarios")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("Usuarios Registrados")

        data_usuarios = {
            'Nombre': ['Samuel Jiménez', 'María González', 'Pedro Rodríguez', 'Admin Sistema'],
            'Email': ['samuel@plantaciones.com', 'maria@plantaciones.com', 'pedro@plantaciones.com', 'admin@plantaciones.com'],
            'Rol': ['Técnico de Campo', 'Supervisora', 'Técnico de Campo', 'Administrador'],
            'Estado': ['✅ Activo', '✅ Activo', '✅ Activo', '✅ Activo'],
            'Último acceso': ['Hoy 10:30', 'Hoy 09:15', 'Ayer 16:45', 'Hoy 08:00']
        }

        df_usuarios = pd.DataFrame(data_usuarios)
        st.dataframe(df_usuarios, hide_index=True, use_container_width=True)

    with col2:
        st.subheader("Agregar Usuario")

        with st.form("nuevo_usuario"):
            nombre = st.text_input("Nombre completo")
            email = st.text_input("Email")
            rol = st.selectbox("Rol", ["Técnico de Campo", "Supervisora", "Administrador"])

            submitted = st.form_submit_button("➕ Crear Usuario", type="primary")
            if submitted:
                st.success(f"✅ Usuario {nombre} creado exitosamente")

    st.markdown("---")
    st.subheader("🔐 Permisos por Rol")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.markdown("**👨‍🌾 Técnico de Campo**")
        st.markdown("""
        - ✅ Ver dashboard
        - ✅ Cargar datos
        - ✅ Ver reportes
        - ❌ Modificar umbrales
        - ❌ Gestionar usuarios
        """)

    with col2:
        st.markdown("**👩‍💼 Supervisor**")
        st.markdown("""
        - ✅ Ver dashboard
        - ✅ Cargar datos
        - ✅ Ver reportes
        - ✅ Generar reportes
        - ✅ Modificar umbrales
        - ❌ Gestionar usuarios
        """)

    with col3:
        st.markdown("**👨‍💻 Administrador**")
        st.markdown("""
        - ✅ Acceso completo
        - ✅ Gestionar usuarios
        - ✅ Modificar umbrales
        - ✅ Configuración avanzada
        - ✅ Exportar datos
        """)

with tab3:
    st.header("🗺️ Gestión de Fincas y Bloques")

    col1, col2 = st.columns([2, 1])

    with col1:
        st.subheader("Fincas Registradas")

        data_fincas = {
            'Finca': ['Fernández', 'Baez 2', 'Cementerio', 'Baez', 'Florida', 'Bogaert'],
            'Bloques': [2, 6, 2, 4, 4, 3],
            'Total Plantas': [3909, 7521, 1295, 6616, 9668, 15198],
            'Plantas Muestreo': [20, 42, 15, 20, 30, 50],
            'Estado': ['✅ Activa'] * 6,
            'Polígono': ['📍 Cargado'] * 6
        }

        df_fincas = pd.DataFrame(data_fincas)
        st.dataframe(df_fincas, hide_index=True, use_container_width=True)

    with col2:
        st.subheader("Cargar Polígonos")

        st.file_uploader(
            "Archivo de polígonos",
            type=['geojson', 'kml', 'shp'],
            help="Formatos: GeoJSON, KML, Shapefile"
        )

        if st.button("📍 Actualizar Mapa"):
            st.info("Mapa actualizado con nuevos polígonos")

    st.markdown("---")
    st.subheader("➕ Agregar Nueva Finca")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.text_input("Nombre de la finca")
        st.number_input("Número de bloques", min_value=1, value=1)

    with col2:
        st.number_input("Total de plantas", min_value=0, value=0)
        st.number_input("Plantas para muestreo", min_value=0, value=0)

    with col3:
        st.text_input("Coordenada central (lat)")
        st.text_input("Coordenada central (lon)")

    if st.button("💾 Guardar Finca", type="primary"):
        st.success("✅ Finca agregada correctamente")

with tab4:
    st.header("⚙️ Parámetros Generales del Sistema")

    col1, col2 = st.columns(2)

    with col1:
        st.subheader("🔔 Notificaciones")

        st.checkbox("Activar alertas por email", value=True)
        st.checkbox("Activar alertas por WhatsApp", value=False)
        st.number_input("Enviar alerta cuando severidad supere (%)", min_value=0, max_value=100, value=80)

        st.markdown("---")

        st.subheader("📊 Reportes Automáticos")
        st.checkbox("Generar reporte semanal automático", value=True)
        st.selectbox("Día de generación", ["Lunes", "Viernes"])
        st.text_input("Emails destinatarios (separados por coma)")

    with col2:
        st.subheader("🗄️ Base de Datos")

        st.text_input("URL de Supabase", type="password")
        st.text_input("API Key", type="password")

        if st.button("🔗 Probar Conexión"):
            st.success("✅ Conexión exitosa")

        st.markdown("---")

        st.subheader("💾 Backup y Exportación")

        if st.button("📥 Descargar Backup Completo"):
            st.info("Generando backup...")

        st.checkbox("Backup automático semanal", value=True)
        st.number_input("Retención de datos (días)", min_value=30, value=365)

    st.markdown("---")

    col1, col2, col3 = st.columns(3)

    with col1:
        if st.button("💾 Guardar Configuración", type="primary", use_container_width=True):
            st.success("✅ Configuración guardada")

    with col2:
        if st.button("🔄 Restaurar Valores por Defecto", use_container_width=True):
            st.warning("⚠️ Valores restaurados")

    with col3:
        if st.button("📤 Exportar Configuración", use_container_width=True):
            config_json = json.dumps({"version": "1.0"}, indent=2)
            st.download_button(
                label="Descargar JSON",
                data=config_json,
                file_name="config.json",
                mime="application/json"
            )
