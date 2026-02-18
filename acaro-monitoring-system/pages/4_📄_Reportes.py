import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
import plotly.graph_objects as go

st.set_page_config(page_title="Reportes", page_icon="📄", layout="wide")

st.title("📄 Generación de Reportes")
st.markdown("Crea y descarga informes semanales personalizados")

# Configuración del reporte
st.sidebar.header("⚙️ Configuración del Reporte")

tipo_reporte = st.sidebar.radio(
    "Tipo de reporte",
    ["Informe Semanal", "Informe Mensual", "Reporte Ejecutivo", "Reporte por Finca"]
)

fincas_reporte = st.sidebar.multiselect(
    "Fincas a incluir",
    ["Fernández", "Baez 2", "Cementerio", "Baez", "Florida", "Bogaert"],
    default=["Cementerio", "Baez 2"]
)

fecha_inicio = st.sidebar.date_input(
    "Fecha inicio",
    value=datetime.now() - timedelta(days=7)
)

fecha_fin = st.sidebar.date_input(
    "Fecha fin",
    value=datetime.now()
)

incluir_fotos = st.sidebar.checkbox("Incluir fotografías", value=True)
incluir_graficos = st.sidebar.checkbox("Incluir gráficos", value=True)
incluir_recomendaciones = st.sidebar.checkbox("Incluir plan de acción", value=True)

# Vista previa del reporte
st.markdown("---")
st.header("📋 Vista Previa del Reporte")

# Encabezado
col1, col2 = st.columns([3, 1])

with col1:
    st.markdown(f"""
    ### {tipo_reporte}
    **Periodo:** {fecha_inicio.strftime('%d/%m/%Y')} - {fecha_fin.strftime('%d/%m/%Y')}

    **Fincas analizadas:** {', '.join(fincas_reporte)}

    **Fecha de generación:** {datetime.now().strftime('%d/%m/%Y %H:%M')}
    """)

with col2:
    st.image("https://via.placeholder.com/150x150.png?text=Logo", width=120)

st.markdown("---")

# Resumen ejecutivo
st.subheader("📊 Resumen Ejecutivo")

col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("Severidad Promedio", "68%", delta="+12%", delta_color="inverse")

with col2:
    st.metric("Focos Críticos", "3", delta="+1", delta_color="inverse")

with col3:
    st.metric("Bloques Monitoreados", "15", delta="0")

with col4:
    st.metric("Plantas Evaluadas", "147", delta="+20")

# Tabla de resumen por finca
st.markdown("---")
st.subheader("🌱 Estado por Finca")

data_resumen_fincas = {
    'Finca': ['Cementerio', 'Baez 2', 'Florida', 'Baez', 'Fernández', 'Bogaert'],
    'Bloques Activos': [2, 6, 4, 4, 2, 3],
    'Severidad (%)': [92, 65, 44, 45, 60, 38],
    'Cambio vs Sem. Anterior': ['+15%', '+8%', '+4%', '-2%', '+5%', '-3%'],
    'Estado': ['🔴 Crítico', '🟠 Alto', '🟡 Moderado', '🟡 Moderado', '🟠 Alto', '🟢 Leve'],
    'Prioridad': [1, 2, 4, 5, 3, 6]
}

df_resumen = pd.DataFrame(data_resumen_fincas)
st.dataframe(df_resumen, hide_index=True, use_container_width=True)

# Gráficos
if incluir_graficos:
    st.markdown("---")
    st.subheader("📈 Análisis Gráfico")

    col1, col2 = st.columns(2)

    with col1:
        # Gráfico de severidad por finca
        fig1 = go.Figure(data=[
            go.Bar(
                x=data_resumen_fincas['Finca'],
                y=data_resumen_fincas['Severidad (%)'],
                marker_color=['red', 'orange', 'yellow', 'yellow', 'orange', 'green']
            )
        ])
        fig1.update_layout(
            title='Severidad por Finca',
            xaxis_title='Finca',
            yaxis_title='Severidad (%)',
            showlegend=False
        )
        fig1.add_hline(y=80, line_dash="dash", line_color="red", annotation_text="Crítico")
        st.plotly_chart(fig1, use_container_width=True)

    with col2:
        # Gráfico de tendencia
        semanas = ['Sem -3', 'Sem -2', 'Sem -1', 'Actual']
        fig2 = go.Figure()

        for finca in ['Cementerio', 'Baez 2', 'Florida']:
            fig2.add_trace(go.Scatter(
                x=semanas,
                y=[52, 65, 78, 92] if finca == 'Cementerio' else 
                  ([42, 52, 58, 65] if finca == 'Baez 2' else [32, 38, 41, 44]),
                name=finca,
                mode='lines+markers'
            ))

        fig2.update_layout(
            title='Evolución de Severidad (4 semanas)',
            xaxis_title='Periodo',
            yaxis_title='Severidad (%)',
            hovermode='x unified'
        )
        st.plotly_chart(fig2, use_container_width=True)

# Plan de acción
if incluir_recomendaciones:
    st.markdown("---")
    st.subheader("🎯 Plan de Acción Priorizado")

    st.error("""
    **🔴 PRIORIDAD ALTA - ACCIÓN INMEDIATA**

    **Cementerio - Bloque 1**
    - Severidad: 92% (Crítico)
    - Acción: Aplicación de acaricida en 48 horas
    - Monitoreo post-aplicación: 7 días
    - Estructura más afectada: Hojas adultas (100%)
    """)

    st.warning("""
    **🟠 PRIORIDAD MEDIA - ACCIÓN EN 1 SEMANA**

    **Baez 2 - Bloque 3**
    - Severidad: 72% (Alto)
    - Acción: Evaluar tratamiento alternativo
    - Monitoreo intensivo: cada 3 días
    - Estructura más afectada: Hojas adultas (85%)
    """)

    st.info("""
    **🟡 MONITOREO CONTINUO**

    **Florida - Bloque 2** y **Baez - Bloque 1**
    - Severidad: 40-45% (Moderado)
    - Acción: Mantener monitoreo semanal
    - Considerar biocontrol preventivo
    """)

# Observaciones adicionales
st.markdown("---")
st.subheader("📝 Observaciones y Notas del Técnico")

st.text_area(
    "Comentarios adicionales",
    placeholder="Agregar observaciones relevantes, condiciones climáticas, eventos especiales...",
    height=100
)

# Botones de descarga
st.markdown("---")
st.subheader("💾 Descargar Reporte")

col1, col2, col3 = st.columns(3)

with col1:
    st.download_button(
        label="📄 Descargar PDF",
        data=b"",  # Placeholder
        file_name=f"reporte_acaros_{datetime.now().strftime('%Y%m%d')}.pdf",
        mime="application/pdf",
        type="primary",
        use_container_width=True
    )

with col2:
    # Crear CSV de ejemplo
    csv_data = df_resumen.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📊 Descargar Excel",
        data=csv_data,
        file_name=f"resumen_acaros_{datetime.now().strftime('%Y%m%d')}.csv",
        mime="text/csv",
        use_container_width=True
    )

with col3:
    st.download_button(
        label="📧 Enviar por Email",
        data=b"",
        file_name="email.txt",
        use_container_width=True,
        disabled=True,
        help="Próximamente: envío automático por correo"
    )

# Histórico de reportes
st.markdown("---")
st.subheader("📚 Historial de Reportes Generados")

historial_data = {
    'Fecha': ['11/02/2026', '04/02/2026', '28/01/2026', '21/01/2026'],
    'Tipo': ['Informe Semanal', 'Informe Semanal', 'Reporte Ejecutivo', 'Informe Semanal'],
    'Fincas': ['Todas', 'Cementerio, Baez 2', 'Todas', 'Todas'],
    'Tamaño': ['2.4 MB', '1.8 MB', '5.1 MB', '2.1 MB'],
    'Acción': ['📥', '📥', '📥', '📥']
}

df_historial = pd.DataFrame(historial_data)
st.dataframe(df_historial, hide_index=True, use_container_width=True)
