"""Conversion classifier for supervised learning from feedback."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier

MIN_AMOSTRAS = 6


class ClassificadorConversao:
    """Predicts conversion probability for a candidate entity."""

    def __init__(self, modelo_path: str | None = None):
        self._modelo: RandomForestClassifier | None = None
        self._features_nomes: list[str] = []
        self._modelo_path = modelo_path

        if modelo_path and os.path.exists(modelo_path):
            self.carregar(modelo_path)

    @property
    def treinado(self) -> bool:
        return self._modelo is not None

    def treinar(self, exemplos: list[dict[str, Any]], rotulos: list[int]) -> dict[str, Any]:
        """Train the classifier with labeled conversion feedback."""
        if len(exemplos) != len(rotulos):
            raise ValueError("A quantidade de exemplos deve bater com a de rótulos.")

        if len(exemplos) < MIN_AMOSTRAS:
            return {
                "treinado": False,
                "motivo": f"Mínimo de {MIN_AMOSTRAS} exemplos. Recebidos: {len(exemplos)}.",
            }

        if len(set(rotulos)) < 2:
            return {
                "treinado": False,
                "motivo": "Precisa de exemplos de ambas as classes (converteu e não converteu).",
            }

        self._features_nomes = self._extrair_nomes_features(exemplos)
        if not self._features_nomes:
            return {
                "treinado": False,
                "motivo": "Nenhuma feature numérica disponível para treino.",
            }

        x = self._montar_matriz(exemplos)
        y = np.array(rotulos)

        modelo = RandomForestClassifier(
            n_estimators=100,
            max_depth=8,
            random_state=42,
            class_weight="balanced",
        )
        modelo.fit(x, y)
        self._modelo = modelo

        acuracia = float(modelo.score(x, y))
        return {
            "treinado": True,
            "amostras": len(exemplos),
            "convertidos": int(sum(rotulos)),
            "acuracia_treino": round(acuracia, 3),
            "features": self._features_nomes,
        }

    def prever_conversao(
        self,
        atributos: dict[str, Any],
        similaridade_fallback: float = 0.0,
    ) -> float:
        """Predict conversion probability, using similarity as cold-start fallback."""
        if not self.treinado:
            return round(similaridade_fallback * 0.8, 4)

        x = self._montar_matriz([{"atributos": atributos}])
        probas = self._modelo.predict_proba(x)[0]
        classes = list(self._modelo.classes_)

        if 1 not in classes:
            return 0.0

        return round(float(probas[classes.index(1)]), 4)

    def importancia_features(self) -> dict[str, float]:
        """Return RandomForest feature importances for interpretability."""
        if not self.treinado:
            return {}

        return {
            nome: round(float(importancia), 4)
            for nome, importancia in zip(
                self._features_nomes,
                self._modelo.feature_importances_,
            )
        }

    def salvar(self, path: str) -> None:
        """Persist a trained model using joblib."""
        if not self.treinado:
            return

        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {"modelo": self._modelo, "features": self._features_nomes},
            path,
        )

    def carregar(self, path: str) -> None:
        dados = joblib.load(path)
        self._modelo = dados["modelo"]
        self._features_nomes = dados["features"]

    @staticmethod
    def _extrair_nomes_features(exemplos: list[dict[str, Any]]) -> list[str]:
        nomes: set[str] = set()
        for exemplo in exemplos:
            for nome, valor in exemplo.get("atributos", {}).items():
                try:
                    float(valor)
                except (TypeError, ValueError):
                    continue
                nomes.add(nome)

        return sorted(nomes)

    def _montar_matriz(self, exemplos: list[dict[str, Any]]) -> np.ndarray:
        linhas: list[list[float]] = []
        for exemplo in exemplos:
            atributos = exemplo.get("atributos", {})
            linha: list[float] = []
            for nome in self._features_nomes:
                try:
                    linha.append(float(atributos.get(nome, 0)))
                except (TypeError, ValueError):
                    linha.append(0.0)
            linhas.append(linha)

        return np.array(linhas, dtype=float)
