import streamlit as st
import pandas as pd
import folium
from streamlit_folium import folium_static
import plotly.express as px
import plotly.graph_objects as go

st.set_page_config(page_title="Dashboard", page_icon="📊", layout="wide")

st.title("📊 Dashboard de Monitoreo")
st.markdown("Visualización en tiempo real de focos de ácaros por finca")

# Sidebar con filtros
st.sidebar.header("🔍 Filtros")
finca_seleccionada = st.sidebar.multiselect(
    "Seleccionar Finca(s)",
    ["Fernández", "Baez 2", "Cementerio", "Baez", "Florida", "Bogaert"],
    default=["Cementerio"]
)

fecha_inicio = st.sidebar.date_input("Fecha inicio")
fecha_fin = st.sidebar.date_input("Fecha fin")

estructura_filtro = st.sidebar.multiselect(
    "Estructura vegetal",
    ["Hojas adultas", "Brotes/hojas jóvenes", "Limones", "Botones florales", "Yemas"],
    default=["Hojas adultas"]
)

nivel_severidad = st.sidebar.multiselect(
    "Nivel de severidad",
    ["Leve", "Moderado", "Alto", "Crítico"],
    default=["Alto", "Crítico"]
)

# Área principal
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("Focos Críticos", "3", delta="+1", delta_color="inverse")

with col2:
    st.metric("Severidad Promedio", "67%", delta="+12%", delta_color="inverse")

with col3:
    st.metric("Bloques Afectados", "8/20", delta="-2", delta_color="normal")

with col4:
    st.metric("Plantas Muestreadas", "147", delta="+20")

st.markdown("---")

# Mapa y tabla
col_mapa, col_tabla = st.columns([2, 1])

with col_mapa:
    st.subheader("🗺️ Mapa de Calor - Severidad de Ácaros")

    # Crear mapa base (ejemplo con B. Cementerio)
    m = folium.Map(
        location=[19.649, -71.294],
        zoom_start=15,
        tiles="OpenStreetMap"
    )

    # Agregar marcadores de ejemplo
    folium.Marker(
        [19.649244, -71.294723],
        popup="Severidad: 92% (Crítico)",
        icon=folium.Icon(color="red", icon="exclamation-triangle", prefix="fa")
    ).add_to(m)

    folium.Marker(
        [19.649561, -71.293731],
        popup="Severidad: 92% (Crítico)",
        icon=folium.Icon(color="red", icon="exclamation-triangle", prefix="fa")
    ).add_to(m)

    folium.Marker(
        [19.649832, -71.293937],
        popup="Severidad: 33% (Moderado)",
        icon=folium.Icon(color="orange", icon="info-sign")
    ).add_to(m)

    # Agregar capa de calor (placeholder)
    folium_static(m, width=700, height=500)

    st.caption("🔴 Crítico (>80%) | 🟠 Alto (60-80%) | 🟡 Moderado (40-60%) | 🟢 Leve (<40%)")

with col_tabla:
    st.subheader("📋 Resumen por Bloque")

    # Datos de ejemplo
    data_resumen = {
        "Bloque": ["Cementerio-1", "Cementerio-2", "Baez 2-3", "Baez 2-4"],
        "Severidad (%)": [92, 58, 45, 88],
        "Plantas Afectadas": [7, 4, 5, 14],
        "Prioridad": ["🔴 ALTA", "🟡 MEDIA", "🟡 MEDIA", "🔴 ALTA"]
    }

    df_resumen = pd.DataFrame(data_resumen)

    # Aplicar estilo
    def color_severidad(val):
        if val >= 80:
            color = '#ffcccc'
        elif val >= 60:
            color = '#ffe6cc'
        elif val >= 40:
            color = '#ffffcc'
        else:
            color = '#ccffcc'
        return f'background-color: {color}'

    st.dataframe(
        df_resumen.style.applymap(color_severidad, subset=['Severidad (%)']),
        hide_index=True,
        use_container_width=True
    )

    st.markdown("---")
    st.subheader("⚠️ Plan de Acción")
    st.warning("**INTERVENCIÓN INMEDIATA**: Cementerio-1 (92%)")
    st.info("**MONITOREO CERCANO**: Baez 2-4 (88%)")

# Gráficos de tendencia
st.markdown("---")
st.subheader("📈 Evolución Semanal de Severidad")

col_graf1, col_graf2 = st.columns(2)

with col_graf1:
    # Gráfico de líneas - Tendencia por finca
    data_tendencia = {
        'Semana': ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
        'Cementerio': [45, 58, 72, 92],
        'Baez 2': [35, 42, 48, 58],
        'Florida': [22, 28, 35, 41]
    }
    df_tend = pd.DataFrame(data_tendencia)

    fig = px.line(
        df_tend,
        x='Semana',
        y=['Cementerio', 'Baez 2', 'Florida'],
        title='Tendencia de Severidad por Finca',
        labels={'value': 'Severidad (%)', 'variable': 'Finca'}
    )
    st.plotly_chart(fig, use_container_width=True)

with col_graf2:
    # Gráfico de barras - Severidad por estructura
    data_estructura = {
        'Estructura': ['Hojas adultas', 'Brotes', 'Limones', 'Botones', 'Yemas'],
        'Severidad (%)': [92, 25, 0, 0, 33]
    }
    df_est = pd.DataFrame(data_estructura)

    fig2 = px.bar(
        df_est,
        x='Estructura',
        y='Severidad (%)',
        title='Severidad por Estructura Vegetal (Cementerio)',
        color='Severidad (%)',
        color_continuous_scale=['green', 'yellow', 'orange', 'red']
    )
    st.plotly_chart(fig2, use_container_width=True)
