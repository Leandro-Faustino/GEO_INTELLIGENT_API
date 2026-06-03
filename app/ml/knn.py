"""Brute-force kNN search using cosine similarity."""

from __future__ import annotations

from typing import Any

import numpy as np

from app.ml.vectorizer import Vetorizador, normalizar


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norma_a = np.linalg.norm(a)
    norma_b = np.linalg.norm(b)
    if norma_a == 0 or norma_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norma_a * norma_b))


def buscar_similares(
    criterios: list[dict[str, Any]],
    entidades: list[dict[str, Any]],
    limiar: float = 0.3,
    k: int | None = None,
    usar_embeddings: bool = False,
) -> list[dict[str, Any]]:
    if not criterios or not entidades:
        return []

    if usar_embeddings:
        from app.ml import embeddings

        if embeddings.disponivel():
            return _buscar_com_embeddings(criterios, entidades, limiar, k)

    vetorizador = Vetorizador(criterios)
    perfil = normalizar(vetorizador.vetor_perfil())

    resultados: list[dict[str, Any]] = []
    for entidade in entidades:
        vetor_entidade = normalizar(vetorizador.vetor_entidade(entidade.get("atributos", {})))
        similaridade = cosine_similarity(perfil, vetor_entidade)
        if similaridade >= limiar:
            resultados.append(
                {
                    "identificador": entidade["identificador"],
                    "similaridade": round(similaridade, 4),
                }
            )

    resultados.sort(key=lambda item: item["similaridade"], reverse=True)
    return resultados[:k] if k is not None else resultados


def _buscar_com_embeddings(
    criterios: list[dict[str, Any]],
    entidades: list[dict[str, Any]],
    limiar: float,
    k: int | None,
) -> list[dict[str, Any]]:
    from app.ml import embeddings

    texto_perfil = ". ".join(
        f"{criterio.get('nome')}: {criterio.get('valor_min', criterio.get('valorMin'))}"
        for criterio in criterios
    )
    textos_entidades = [
        embeddings.texto_de_atributos(entidade.get("atributos", {}))
        for entidade in entidades
    ]

    vetores = embeddings.gerar_embeddings([texto_perfil, *textos_entidades])
    perfil = np.array(vetores[0], dtype=float)

    resultados: list[dict[str, Any]] = []
    for entidade, vetor in zip(entidades, vetores[1:]):
        similaridade = cosine_similarity(perfil, np.array(vetor, dtype=float))
        if similaridade >= limiar:
            resultados.append(
                {
                    "identificador": entidade["identificador"],
                    "similaridade": round(float(similaridade), 4),
                }
            )

    resultados.sort(key=lambda item: item["similaridade"], reverse=True)
    return resultados[:k] if k is not None else resultados
