"""Vectorization utilities for lookalike analysis."""

from __future__ import annotations

from typing import Any

import numpy as np


class Vetorizador:
    """Projects profile criteria and target entities into the same vector space."""

    def __init__(self, criterios: list[dict[str, Any]]):
        self.criterios = criterios
        self._dimensoes: list[dict[str, Any]] = []
        self._construir_dimensoes()

    def vetor_perfil(self) -> np.ndarray:
        componentes: list[float] = []
        for dimensao in self._dimensoes:
            peso = float(dimensao["peso"])
            if dimensao["tipo"] == "range":
                componentes.append(peso)
                continue

            for _ in dimensao["aceitos"]:
                componentes.append(peso)

        return np.array(componentes, dtype=float)

    def vetor_entidade(self, atributos: dict[str, Any]) -> np.ndarray:
        componentes: list[float] = []
        for dimensao in self._dimensoes:
            peso = float(dimensao["peso"])
            valor = atributos.get(dimensao["nome"])

            if dimensao["tipo"] == "range":
                componentes.append(self._score_range(dimensao, valor) * peso)
                continue

            valor_str = str(valor)
            for aceito in dimensao["aceitos"]:
                componentes.append((1.0 if valor_str == aceito else 0.0) * peso)

        return np.array(componentes, dtype=float)

    def _construir_dimensoes(self) -> None:
        for criterio in self.criterios:
            tipo = criterio.get("tipo_comparacao") or criterio.get("tipoComparacao")
            nome = criterio["nome"]
            peso = float(criterio.get("peso", 0))

            if tipo == "range":
                self._dimensoes.append(
                    {
                        "tipo": "range",
                        "nome": nome,
                        "min": float(criterio.get("valor_min", criterio.get("valorMin"))),
                        "max": float(criterio.get("valor_max", criterio.get("valorMax"))),
                        "peso": peso,
                    }
                )
                continue

            if tipo == "enum":
                valor_min = criterio.get("valor_min", criterio.get("valorMin"))
                aceitos = valor_min if isinstance(valor_min, list) else [valor_min]
                self._dimensoes.append(
                    {
                        "tipo": "enum",
                        "nome": nome,
                        "aceitos": [str(valor) for valor in aceitos],
                        "peso": peso,
                    }
                )

    @staticmethod
    def _score_range(dimensao: dict[str, Any], valor: Any) -> float:
        try:
            numero = float(valor)
        except (TypeError, ValueError):
            return 0.0

        minimo = float(dimensao["min"])
        maximo = float(dimensao["max"])
        if minimo <= numero <= maximo:
            return 1.0

        amplitude = max(maximo - minimo, 1e-9)
        distancia = min(abs(numero - minimo), abs(numero - maximo))
        return max(0.0, 1.0 - distancia / amplitude)


def normalizar(vetor: np.ndarray) -> np.ndarray:
    """Normalize a vector to L2 norm 1."""
    norma = np.linalg.norm(vetor)
    return vetor / norma if norma > 0 else vetor
