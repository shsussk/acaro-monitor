"""
Módulo de cálculos de severidad y clasificación
"""

import pandas as pd
from typing import Dict, Tuple

def calcular_severidad_planta(unidades_presencia: int, unidades_totales: int = 12) -> float:
    """
    Calcula el porcentaje de severidad por planta

    Args:
        unidades_presencia: Número de unidades con presencia de ácaros
        unidades_totales: Total de unidades evaluadas (default: 12)

    Returns:
        Porcentaje de severidad (0-100)
    """
    if unidades_totales == 0:
        return 0.0
    return (unidades_presencia / unidades_totales) * 100

def calcular_severidad_bloque(df: pd.DataFrame, columna: str) -> float:
    """
    Calcula la severidad promedio de un bloque

    Args:
        df: DataFrame con datos de monitoreo del bloque
        columna: Nombre de la columna con datos de presencia

    Returns:
        Porcentaje promedio de severidad del bloque
    """
    if df.empty or columna not in df.columns:
        return 0.0

    severidades = df[columna].apply(lambda x: calcular_severidad_planta(x) if pd.notna(x) else 0)
    return severidades.mean()

def clasificar_severidad(severidad: float, umbrales: Dict = None) -> Tuple[str, str]:
    """
    Clasifica el nivel de severidad según umbrales

    Args:
        severidad: Porcentaje de severidad (0-100)
        umbrales: Diccionario con umbrales personalizados (opcional)

    Returns:
        Tupla (nivel, color) donde nivel es el texto y color el código
    """
    if umbrales is None:
        # Umbrales por defecto
        umbrales = {
            "leve": 40,
            "moderado": 60,
            "alto": 80
        }

    if severidad < umbrales["leve"]:
        return ("Leve", "green")
    elif severidad < umbrales["moderado"]:
        return ("Moderado", "yellow")
    elif severidad < umbrales["alto"]:
        return ("Alto", "orange")
    else:
        return ("Crítico", "red")

def calcular_prioridad(
    severidad: float,
    area_afectada: float,
    tendencia: str = "estable"
) -> int:
    """
    Calcula la prioridad de intervención (1 = más alta)

    Args:
        severidad: Porcentaje de severidad
        area_afectada: Porcentaje de área afectada
        tendencia: "aumentando", "estable", "disminuyendo"

    Returns:
        Valor de prioridad (1-5)
    """
    score = 0

    # Peso por severidad
    if severidad >= 80:
        score += 50
    elif severidad >= 60:
        score += 30
    elif severidad >= 40:
        score += 15

    # Peso por área
    if area_afectada >= 70:
        score += 30
    elif area_afectada >= 40:
        score += 15

    # Peso por tendencia
    if tendencia == "aumentando":
        score += 20
    elif tendencia == "estable":
        score += 5

    # Convertir a prioridad 1-5
    if score >= 80:
        return 1
    elif score >= 60:
        return 2
    elif score >= 40:
        return 3
    elif score >= 20:
        return 4
    else:
        return 5

def analizar_tendencia(df: pd.DataFrame, columna: str, ventana: int = 4) -> str:
    """
    Analiza la tendencia de severidad en las últimas semanas

    Args:
        df: DataFrame con datos históricos ordenados por fecha
        columna: Columna con valores de severidad
        ventana: Número de periodos a analizar

    Returns:
        "aumentando", "estable", o "disminuyendo"
    """
    if df.empty or len(df) < 2:
        return "estable"

    valores = df[columna].tail(ventana).values

    # Calcular pendiente simple
    if len(valores) >= 2:
        diferencia = valores[-1] - valores[0]
        if diferencia > 10:
            return "aumentando"
        elif diferencia < -10:
            return "disminuyendo"

    return "estable"
