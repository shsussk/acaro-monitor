import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta

st.set_page_config(page_title="Análisis Temporal", page_icon="📈", layout="wide")

st.title("📈 Análisis Temporal y Tendencias")
st.markdown("Evolución histórica de la infestación de ácaros")

# Filtros
col1, col2, col3 = st.columns(3)

with col1:
    finca = st.selectbox("Seleccionar Finca", 
                         ["Todas", "Fernández", "Baez 2", "Cementerio", "Baez", "Florida", "Bogaert"])

with col2:
    periodo = st.selectbox("Periodo de análisis",
                          ["Últimas 4 semanas", "Últimas 8 semanas", "Último trimestre", "Personalizado"])

with col3:
    tipo_grafico = st.selectbox("Tipo de visualización",
                                ["Líneas", "Área", "Barras apiladas"])

st.markdown("---")

# Métricas comparativas
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("Cambio Semanal", "+15%", delta="+15%", delta_color="inverse")

with col2:
    st.metric("Focos Nuevos", "2", delta="+2", delta_color="inverse")

with col3:
    st.metric("Focos Resueltos", "1", delta="+1", delta_color="normal")

with col4:
    st.metric("Tasa de Recurrencia", "33%", delta="-5%", delta_color="normal")

# Gráfico principal de tendencia
st.subheader("📊 Evolución de Severidad - Últimas 8 Semanas")

# Datos de ejemplo
semanas = pd.date_range(end=datetime.now(), periods=8, freq='W').strftime('%d/%m').tolist()
data_evolucion = pd.DataFrame({
    'Semana': semanas,
    'Fernández': [35, 42, 38, 45, 52, 48, 55, 60],
    'Baez 2': [28, 32, 38, 42, 48, 52, 58, 65],
    'Cementerio': [45, 52, 58, 65, 72, 78, 85, 92],
    'Baez': [22, 25, 28, 32, 35, 38, 42, 45],
    'Florida': [18, 22, 26, 30, 35, 38, 41, 44],
    'Bogaert': [15, 18, 22, 25, 28, 32, 35, 38]
})

fig = px.line(
    data_evolucion,
    x='Semana',
    y=['Fernández', 'Baez 2', 'Cementerio', 'Baez', 'Florida', 'Bogaert'],
    title='Severidad Promedio por Finca (%)',
    labels={'value': 'Severidad (%)', 'variable': 'Finca'},
    markers=True
)

fig.add_hline(y=80, line_dash="dash", line_color="red", 
              annotation_text="Umbral Crítico (80%)")
fig.add_hline(y=60, line_dash="dash", line_color="orange",
              annotation_text="Umbral Alto (60%)")

st.plotly_chart(fig, use_container_width=True)

# Análisis por estructura vegetal
st.markdown("---")
st.subheader("🌿 Análisis por Estructura Vegetal")

col1, col2 = st.columns(2)

with col1:
    # Heatmap de severidad por estructura
    data_heatmap = {
        'Semana': semanas,
        'Hojas adultas': [70, 75, 80, 82, 85, 88, 90, 92],
        'Brotes': [15, 18, 20, 22, 25, 28, 30, 33],
        'Limones': [5, 8, 10, 12, 15, 18, 20, 25],
        'Botones': [8, 10, 12, 15, 18, 22, 25, 28],
        'Yemas': [20, 25, 28, 30, 35, 38, 40, 42]
    }
    df_heat = pd.DataFrame(data_heatmap)
    df_heat_t = df_heat.set_index('Semana').T

    fig2 = px.imshow(
        df_heat_t,
        labels=dict(x="Semana", y="Estructura", color="Severidad (%)"),
        x=semanas,
        y=['Hojas adultas', 'Brotes', 'Limones', 'Botones', 'Yemas'],
        color_continuous_scale='RdYlGn_r',
        title='Mapa de Calor - Severidad por Estructura'
    )
    st.plotly_chart(fig2, use_container_width=True)

with col2:
    # Gráfico de áreas apiladas
    fig3 = go.Figure()

    for col in ['Hojas adultas', 'Brotes', 'Limones', 'Botones', 'Yemas']:
        fig3.add_trace(go.Scatter(
            x=semanas,
            y=data_heatmap[col],
            name=col,
            mode='lines',
            stackgroup='one',
            fillcolor='rgba(0,100,80,0.2)'
        ))

    fig3.update_layout(
        title='Contribución de Estructuras a la Severidad Total',
        xaxis_title='Semana',
        yaxis_title='Severidad (%)',
        hovermode='x unified'
    )
    st.plotly_chart(fig3, use_container_width=True)

# Tabla de focos recurrentes
st.markdown("---")
st.subheader("🔄 Focos Recurrentes (>3 semanas consecutivas)")

data_recurrentes = {
    'Finca': ['Cementerio', 'Cementerio', 'Baez 2', 'Florida'],
    'Bloque': ['Bloque 1', 'Bloque 2', 'Bloque 3', 'Bloque 2'],
    'Semanas Consecutivas': [6, 4, 5, 3],
    'Severidad Actual': [92, 68, 72, 58],
    'Tendencia': ['↑ Empeorando', '↔ Estable', '↑ Empeorando', '↓ Mejorando'],
    'Acción': ['Tratamiento urgente', 'Monitoreo intensivo', 'Tratamiento urgente', 'Continuar monitoreo']
}

df_recurrentes = pd.DataFrame(data_recurrentes)
st.dataframe(df_recurrentes, hide_index=True, use_container_width=True)

# Exportar análisis
st.markdown("---")
col1, col2, col3 = st.columns([1, 1, 2])

with col1:
    st.download_button(
        label="📥 Descargar datos (CSV)",
        data=data_evolucion.to_csv(index=False).encode('utf-8'),
        file_name=f'analisis_temporal_{datetime.now().strftime("%Y%m%d")}.csv',
        mime='text/csv'
    )

with col2:
    st.download_button(
        label="📊 Exportar gráficos (Excel)",
        data=b'',  # Placeholder
        file_name=f'graficos_{datetime.now().strftime("%Y%m%d")}.xlsx',
        mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
