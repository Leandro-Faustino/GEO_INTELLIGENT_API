"""Training flywheel for conversion learning."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.ml.classifier import ClassificadorConversao


class Trainer:
    """Accumulates feedback, retrains the classifier, and persists it per client."""

    def __init__(self, models_dir: str = "models"):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)

    def registrar_e_treinar(
        self,
        cliente_id: str,
        resultados: list[dict[str, Any]],
    ) -> dict[str, Any]:
        historico = self._carregar_historico(cliente_id)
        for resultado in resultados:
            historico.append(
                {
                    "atributos": resultado.get("atributos", {}),
                    "converteu": 1 if resultado.get("converteu") else 0,
                }
            )

        self._salvar_historico(cliente_id, historico)

        exemplos = [{"atributos": item["atributos"]} for item in historico]
        rotulos = [int(item["converteu"]) for item in historico]

        classificador = ClassificadorConversao()
        resultado_treino = classificador.treinar(exemplos, rotulos)

        if resultado_treino.get("treinado"):
            classificador.salvar(str(self._modelo_path(cliente_id)))
            resultado_treino["importancia_features"] = classificador.importancia_features()

        resultado_treino["historico_total"] = len(historico)
        resultado_treino["novos_neste_lote"] = len(resultados)
        return resultado_treino

    def carregar_classificador(self, cliente_id: str) -> ClassificadorConversao:
        path = self._modelo_path(cliente_id)
        if path.exists():
            return ClassificadorConversao(modelo_path=str(path))
        return ClassificadorConversao()

    def _historico_path(self, cliente_id: str) -> Path:
        return self.models_dir / f"historico_{cliente_id}.json"

    def _modelo_path(self, cliente_id: str) -> Path:
        return self.models_dir / f"modelo_{cliente_id}.pkl"

    def _carregar_historico(self, cliente_id: str) -> list[dict[str, Any]]:
        path = self._historico_path(cliente_id)
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _salvar_historico(
        self,
        cliente_id: str,
        historico: list[dict[str, Any]],
    ) -> None:
        self._historico_path(cliente_id).write_text(
            json.dumps(historico, ensure_ascii=False),
            encoding="utf-8",
        )
