"""Statistical profile derivation for phase 2.

This module is intentionally framework-free: it receives plain dictionaries and
returns plain dictionaries. FastAPI services only orchestrate input validation
and contract mapping.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy import stats


def derivar_criterios(compradores: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Derive weighted profile criteria from known good buyers."""
    registros = [comprador.get("atributos_originais", {}) for comprador in compradores]
    df = pd.DataFrame(registros)

    tickets = [comprador.get("ticket_medio", 0) for comprador in compradores]
    if any(ticket > 0 for ticket in tickets):
        df["ticket_medio"] = tickets

    if df.empty or len(df.columns) == 0:
        return []

    criterios_brutos: list[dict[str, Any]] = []
    for coluna in df.columns:
        serie = df[coluna].dropna()
        if len(serie) == 0:
            continue

        criterio = _derivar_um_criterio(coluna, serie)
        if criterio is not None:
            criterios_brutos.append(criterio)

    soma_pesos = sum(float(criterio["_peso_bruto"]) for criterio in criterios_brutos)
    if soma_pesos <= 0:
        return []

    criterios: list[dict[str, Any]] = []
    for criterio in criterios_brutos:
        criterios.append(
            {
                "nome": criterio["nome"],
                "valor_min": criterio["valor_min"],
                "valor_max": criterio["valor_max"],
                "peso": round(float(criterio["_peso_bruto"]) / soma_pesos, 3),
                "tipo_comparacao": criterio["tipo_comparacao"],
            }
        )

    return _ajustar_soma_pesos(criterios)


def resumo_estatistico(compradores: list[dict[str, Any]]) -> dict[str, Any]:
    """Return descriptive statistics for buyer tickets."""
    tickets = [
        comprador.get("ticket_medio", 0)
        for comprador in compradores
        if comprador.get("ticket_medio", 0) > 0
    ]
    if len(tickets) < 2:
        return {"amostras": len(tickets)}

    desc = stats.describe(np.array(tickets, dtype=float))
    return {
        "amostras": int(desc.nobs),
        "ticket_medio": round(float(desc.mean), 2),
        "ticket_variancia": round(float(desc.variance), 2),
        "ticket_min": round(float(desc.minmax[0]), 2),
        "ticket_max": round(float(desc.minmax[1]), 2),
        "assimetria": round(float(desc.skewness), 3),
    }


def _derivar_um_criterio(coluna: str, serie: pd.Series) -> dict[str, Any] | None:
    numerica = pd.to_numeric(serie, errors="coerce")
    proporcao_numerica = float(numerica.notna().sum() / len(serie))

    if proporcao_numerica >= 0.8 and not _parece_codigo(coluna, serie, numerica):
        return _criterio_numerico(coluna, numerica.dropna())

    return _criterio_categorico(coluna, serie)


def _criterio_numerico(coluna: str, valores: pd.Series) -> dict[str, Any] | None:
    if len(valores) == 0:
        return None

    arr = valores.to_numpy(dtype=float)
    media = float(np.mean(arr))
    desvio = float(np.std(arr))

    if desvio > 0:
        valor_min = media - desvio
        valor_max = media + desvio
    else:
        margem = abs(media) * 0.1 if media != 0 else 1.0
        valor_min = media - margem
        valor_max = media + margem

    cv = (desvio / abs(media)) if media != 0 else (desvio if desvio > 0 else 0)
    peso_bruto = 1.0 / (1.0 + cv)

    return {
        "nome": coluna,
        "valor_min": round(valor_min, 4),
        "valor_max": round(valor_max, 4),
        "tipo_comparacao": "range",
        "_peso_bruto": peso_bruto,
    }


def _criterio_categorico(coluna: str, valores: pd.Series) -> dict[str, Any] | None:
    contagem = valores.value_counts()
    if len(contagem) == 0:
        return None

    total = int(contagem.sum())
    top = contagem.head(5)
    aceitos = [str(valor) for valor in top.index.tolist()]

    concentracao = float(top.sum() / total) if total > 0 else 0.0
    fracao_dominante = float(top.iloc[0] / total) if total > 0 else 0.0
    peso_bruto = (concentracao + fracao_dominante) / 2

    return {
        "nome": coluna,
        "valor_min": aceitos,
        "valor_max": aceitos,
        "tipo_comparacao": "enum",
        "_peso_bruto": peso_bruto,
    }


def _parece_codigo(coluna: str, serie: pd.Series, numerica: pd.Series) -> bool:
    if _eh_continuo_conhecido(coluna):
        return False

    nome = coluna.lower()
    if any(token in nome for token in ("cnae", "cep", "codigo", "código", "id")):
        return True

    valores_num = numerica.dropna()
    if len(valores_num) == 0:
        return False

    todos_inteiros = bool((valores_num == valores_num.round()).all())
    magnitude_codigo = bool((valores_num.abs() >= 10000).all())
    tem_repeticao = serie.nunique() < len(serie)

    return todos_inteiros and magnitude_codigo and tem_repeticao


def _eh_continuo_conhecido(coluna: str) -> bool:
    nome = coluna.lower()
    continuos = (
        "ticket",
        "valor",
        "preco",
        "preço",
        "renda",
        "faturamento",
        "receita",
        "area",
        "área",
        "idade",
        "distancia",
        "distância",
        "quantidade",
        "qtd",
        "volume",
    )
    return any(token in nome for token in continuos)


def _ajustar_soma_pesos(criterios: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compensate rounding so returned weights sum exactly to 1.0 when possible."""
    if not criterios:
        return criterios

    diferenca = round(1.0 - sum(float(criterio["peso"]) for criterio in criterios), 3)
    if diferenca == 0:
        return criterios

    indice_maior = max(range(len(criterios)), key=lambda i: criterios[i]["peso"])
    criterios[indice_maior]["peso"] = round(criterios[indice_maior]["peso"] + diferenca, 3)
    return criterios
