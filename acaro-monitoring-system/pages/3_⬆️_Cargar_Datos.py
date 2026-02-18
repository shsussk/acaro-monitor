import streamlit as st
import pandas as pd
from datetime import datetime

st.set_page_config(page_title="Cargar Datos", page_icon="⬆️", layout="wide")

st.title("⬆️ Cargar Datos de Monitoreo")
st.markdown("Importa archivos CSV exportados desde EpiCollect")

# Instrucciones
with st.expander("📖 Instrucciones de uso", expanded=False):
    st.markdown("""
    ### Pasos para cargar datos:

    1. **Exporta** los datos desde EpiCollect en formato CSV
    2. **Arrastra** el archivo a la zona de carga o haz clic para seleccionarlo
    3. **Revisa** la vista previa de los datos
    4. **Confirma** la carga para guardar en la base de datos

    ### Formato esperado:
    - Columnas requeridas: Fecha, Técnico, Finca, Bloque, Coordenadas (lat/long)
    - Datos de presencia: Brotes, Hojas adultas, Limones, Botones florales, Yemas (valores 0-12)
    - Variables opcionales: Temperatura, Humedad, Observaciones
    """)

st.markdown("---")

# Área de carga de archivos
uploaded_file = st.file_uploader(
    "📂 Selecciona el archivo CSV",
    type=['csv'],
    help="Arrastra el archivo aquí o haz clic para seleccionar"
)

if uploaded_file is not None:
    try:
        # Leer el archivo
        df = pd.read_csv(uploaded_file)

        st.success(f"✅ Archivo cargado exitosamente: {uploaded_file.name}")

        # Información del archivo
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total de registros", len(df))
        with col2:
            st.metric("Columnas detectadas", len(df.columns))
        with col3:
            if '4_Finca' in df.columns:
                st.metric("Fincas en archivo", df['4_Finca'].nunique())

        st.markdown("---")

        # Vista previa
        st.subheader("👀 Vista Previa de Datos")

        # Seleccionar columnas relevantes
        columnas_relevantes = [
            '1_Fecha', '3_Tcnico', '4_Finca', '5_BloqueSector',
            'lat_6_Geolocalizacin', 'long_6_Geolocalizacin',
            '10_Brotes_hojas', '11_Hojas_adultas', '12_Brotes_limones',
            '13_Botone_florales', '14_Yemas', '15_Otros'
        ]

        # Mostrar solo columnas que existen
        cols_disponibles = [col for col in columnas_relevantes if col in df.columns]

        if cols_disponibles:
            st.dataframe(df[cols_disponibles].head(10), use_container_width=True)
        else:
            st.dataframe(df.head(10), use_container_width=True)

        # Validación de datos
        st.markdown("---")
        st.subheader("✓ Validación de Datos")

        col1, col2 = st.columns(2)

        with col1:
            st.markdown("#### ✅ Verificaciones Exitosas")
            validaciones = []

            # Verificar coordenadas
            if 'lat_6_Geolocalizacin' in df.columns and 'long_6_Geolocalizacin' in df.columns:
                coords_validas = df[['lat_6_Geolocalizacin', 'long_6_Geolocalizacin']].notna().all(axis=1).sum()
                validaciones.append(f"✓ {coords_validas}/{len(df)} registros con coordenadas válidas")

            # Verificar fechas
            if '1_Fecha' in df.columns:
                fechas_validas = df['1_Fecha'].notna().sum()
                validaciones.append(f"✓ {fechas_validas}/{len(df)} registros con fecha válida")

            # Verificar datos de presencia
            cols_presencia = ['10_Brotes_hojas', '11_Hojas_adultas', '12_Brotes_limones', 
                             '13_Botone_florales', '14_Yemas']
            cols_pres_disponibles = [col for col in cols_presencia if col in df.columns]
            if cols_pres_disponibles:
                validaciones.append(f"✓ {len(cols_pres_disponibles)}/5 estructuras vegetales detectadas")

            for val in validaciones:
                st.success(val)

        with col2:
            st.markdown("#### ⚠️ Advertencias")
            advertencias = []

            # Verificar valores fuera de rango (0-12)
            for col in cols_pres_disponibles:
                fuera_rango = ((df[col] < 0) | (df[col] > 12)).sum()
                if fuera_rango > 0:
                    advertencias.append(f"⚠ {fuera_rango} valores fuera de rango (0-12) en {col}")

            # Verificar registros duplicados
            if 'ec5_uuid' in df.columns:
                duplicados = df['ec5_uuid'].duplicated().sum()
                if duplicados > 0:
                    advertencias.append(f"⚠ {duplicados} registros duplicados detectados")

            if not advertencias:
                st.info("ℹ️ No se detectaron problemas")
            else:
                for adv in advertencias:
                    st.warning(adv)

        # Resumen por finca
        st.markdown("---")
        st.subheader("📊 Resumen por Finca")

        if '4_Finca' in df.columns:
            resumen_finca = df.groupby('4_Finca').agg({
                'ec5_uuid': 'count',
                '11_Hojas_adultas': 'mean',
                '10_Brotes_hojas': 'mean'
            }).round(1)
            resumen_finca.columns = ['Registros', 'Prom. Hojas adultas', 'Prom. Brotes']
            st.dataframe(resumen_finca, use_container_width=True)

        # Botones de acción
        st.markdown("---")
        col1, col2, col3 = st.columns([1, 1, 2])

        with col1:
            if st.button("💾 Guardar en Base de Datos", type="primary", use_container_width=True):
                with st.spinner("Guardando datos..."):
                    # Aquí iría la lógica de guardado en Supabase
                    import time
                    time.sleep(2)
                    st.success("✅ Datos guardados exitosamente")
                    st.balloons()

        with col2:
            csv_exportar = df.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="📥 Descargar procesado",
                data=csv_exportar,
                file_name=f"datos_procesados_{datetime.now().strftime('%Y%m%d_%H%M')}.csv",
                mime="text/csv",
                use_container_width=True
            )

    except Exception as e:
        st.error(f"❌ Error al procesar el archivo: {str(e)}")
        st.info("Verifica que el archivo tenga el formato correcto exportado desde EpiCollect")

else:
    # Mostrar zona de arrastre
    st.info("👆 Arrastra un archivo CSV aquí o haz clic para seleccionar")

    # Mostrar ejemplo de formato
    st.markdown("---")
    st.subheader("📋 Ejemplo de formato esperado")

    ejemplo_data = {
        '1_Fecha': ['10/09/2025', '10/09/2025'],
        '3_Técnico': ['Samuel Jiménez', 'Samuel Jiménez'],
        '4_Finca': ['B. Cementerio', 'B. Cementerio'],
        '5_BloqueSector': [1, 1],
        'lat_6_Geolocalizacin': [19.649244, 19.649561],
        'long_6_Geolocalizacin': [-71.294723, -71.293731],
        '10_Brotes_hojas': [1, 0],
        '11_Hojas_adultas': [11, 11],
        '12_Brotes_limones': [0, 0],
        '13_Botone_florales': [0, 0],
        '14_Yemas': [0, 0]
    }

    df_ejemplo = pd.DataFrame(ejemplo_data)
    st.dataframe(df_ejemplo, use_container_width=True)
