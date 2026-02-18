"""
Módulo para generación de mapas interactivos
"""

import folium
from folium import plugins
import pandas as pd
from typing import List, Dict, Tuple

def crear_mapa_base(
    centro: Tuple[float, float],
    zoom: int = 13,
    tiles: str = "OpenStreetMap"
) -> folium.Map:
    """
    Crea un mapa base de Folium

    Args:
        centro: Tupla (latitud, longitud) del centro del mapa
        zoom: Nivel de zoom inicial
        tiles: Tipo de tiles base

    Returns:
        Objeto folium.Map
    """
    m = folium.Map(
        location=centro,
        zoom_start=zoom,
        tiles=tiles
    )

    # Agregar control de capas
    folium.TileLayer('Stamen Terrain').add_to(m)
    folium.TileLayer('Stamen Toner').add_to(m)
    folium.TileLayer('CartoDB positron').add_to(m)
    folium.LayerControl().add_to(m)

    return m

def agregar_marcadores_monitoreo(
    mapa: folium.Map,
    df: pd.DataFrame,
    col_lat: str = 'lat',
    col_lon: str = 'lon',
    col_severidad: str = 'severidad'
) -> folium.Map:
    """
    Agrega marcadores de puntos de monitoreo al mapa

    Args:
        mapa: Objeto folium.Map
        df: DataFrame con datos de monitoreo
        col_lat: Nombre de columna con latitudes
        col_lon: Nombre de columna con longitudes
        col_severidad: Nombre de columna con severidad

    Returns:
        Mapa con marcadores agregados
    """
    for idx, row in df.iterrows():
        severidad = row[col_severidad]

        # Determinar color según severidad
        if severidad >= 80:
            color = 'red'
            icon = 'exclamation-triangle'
        elif severidad >= 60:
            color = 'orange'
            icon = 'warning-sign'
        elif severidad >= 40:
            color = 'yellow'
            icon = 'info-sign'
        else:
            color = 'green'
            icon = 'ok-sign'

        # Crear popup
        popup_text = f"""
        <b>Severidad:</b> {severidad:.1f}%<br>
        <b>Finca:</b> {row.get('finca', 'N/A')}<br>
        <b>Bloque:</b> {row.get('bloque', 'N/A')}<br>
        <b>Fecha:</b> {row.get('fecha', 'N/A')}
        """

        folium.Marker(
            location=[row[col_lat], row[col_lon]],
            popup=folium.Popup(popup_text, max_width=250),
            icon=folium.Icon(color=color, icon=icon, prefix='glyphicon')
        ).add_to(mapa)

    return mapa

def agregar_poligonos_fincas(
    mapa: folium.Map,
    geojson_data: Dict,
    col_severidad: str = 'severidad'
) -> folium.Map:
    """
    Agrega polígonos de fincas/bloques al mapa

    Args:
        mapa: Objeto folium.Map
        geojson_data: Datos GeoJSON con geometrías
        col_severidad: Nombre de la propiedad con severidad

    Returns:
        Mapa con polígonos agregados
    """
    def style_function(feature):
        severidad = feature['properties'].get(col_severidad, 0)

        if severidad >= 80:
            color = '#ff0000'
            fill_opacity = 0.6
        elif severidad >= 60:
            color = '#ffa500'
            fill_opacity = 0.5
        elif severidad >= 40:
            color = '#ffff00'
            fill_opacity = 0.4
        else:
            color = '#00ff00'
            fill_opacity = 0.3

        return {
            'fillColor': color,
            'color': 'black',
            'weight': 2,
            'fillOpacity': fill_opacity
        }

    folium.GeoJson(
        geojson_data,
        style_function=style_function,
        tooltip=folium.GeoJsonTooltip(
            fields=['nombre', col_severidad],
            aliases=['Finca/Bloque:', 'Severidad:'],
            localize=True
        )
    ).add_to(mapa)

    return mapa

def crear_mapa_calor(
    mapa: folium.Map,
    df: pd.DataFrame,
    col_lat: str = 'lat',
    col_lon: str = 'lon',
    col_severidad: str = 'severidad'
) -> folium.Map:
    """
    Crea una capa de mapa de calor

    Args:
        mapa: Objeto folium.Map
        df: DataFrame con datos de monitoreo
        col_lat: Nombre de columna con latitudes
        col_lon: Nombre de columna con longitudes
        col_severidad: Nombre de columna con peso (severidad)

    Returns:
        Mapa con capa de calor
    """
    heat_data = [
        [row[col_lat], row[col_lon], row[col_severidad]/100]
        for idx, row in df.iterrows()
        if pd.notna(row[col_lat]) and pd.notna(row[col_lon])
    ]

    plugins.HeatMap(
        heat_data,
        min_opacity=0.3,
        max_opacity=0.8,
        radius=15,
        blur=20,
        gradient={0.4: 'green', 0.6: 'yellow', 0.8: 'orange', 1.0: 'red'}
    ).add_to(mapa)

    return mapa
