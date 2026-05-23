"""Phase 6 tests for the learning flywheel."""

import tempfile

import anyio
import httpx

from app.main import app
from app.ml.trainer import Trainer


def _resultados(n_converteu, n_nao, renda_base_alta=5000, renda_base_baixa=1500):
    resultados = []
    for i in range(n_converteu):
        resultados.append(
            {
                "entidade_alvo_id": f"c{i}",
                "converteu": True,
                "atributos": {"renda_bairro": renda_base_alta + i * 50, "porte": 3},
            }
        )
    for i in range(n_nao):
        resultados.append(
            {
                "entidade_alvo_id": f"n{i}",
                "converteu": False,
                "atributos": {"renda_bairro": renda_base_baixa + i * 50, "porte": 3},
            }
        )
    return resultados


async def _post(path: str, payload: dict) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(path, json=payload, headers={"x-request-id": "trace-fase6"})


def test_feedback_aciona_retreino():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)
        resultado = trainer.registrar_e_treinar("c1", _resultados(4, 4))

        assert resultado["treinado"] is True
        assert resultado["historico_total"] == 8
        assert resultado["novos_neste_lote"] == 8


def test_modelo_persiste_e_recarrega():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)
        trainer.registrar_e_treinar("c1", _resultados(4, 4))

        classificador = trainer.carregar_classificador("c1")

        assert classificador.treinado
        assert classificador.prever_conversao({"renda_bairro": 5200, "porte": 3}) > 0.5
        assert classificador.prever_conversao({"renda_bairro": 1400, "porte": 3}) < 0.5


def test_cold_start_sem_feedback():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)

        assert not trainer.carregar_classificador("cliente_novo").treinado


def test_historico_acumula_entre_lotes():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)

        primeiro = trainer.registrar_e_treinar("c1", _resultados(2, 2))
        segundo = trainer.registrar_e_treinar("c1", _resultados(2, 2))

        assert primeiro["historico_total"] == 4
        assert segundo["historico_total"] == 8
        assert segundo["novos_neste_lote"] == 4


def test_isolamento_entre_clientes():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)
        trainer.registrar_e_treinar("cliente_A", _resultados(4, 4))

        assert trainer.carregar_classificador("cliente_A").treinado
        assert not trainer.carregar_classificador("cliente_B").treinado


def test_interpretabilidade_no_retreino():
    with tempfile.TemporaryDirectory() as tmpdir:
        trainer = Trainer(models_dir=tmpdir)
        resultado = trainer.registrar_e_treinar("c1", _resultados(4, 4))

        assert "importancia_features" in resultado
        assert resultado["importancia_features"]["renda_bairro"] > resultado[
            "importancia_features"
        ].get("porte", 0)


def test_endpoint_feedback_fecha_flywheel():
    criterios = [
        {
            "nome": "cnae",
            "valorMin": ["5510801"],
            "valorMax": ["5510801"],
            "peso": 0.5,
            "tipoComparacao": "enum",
        },
        {
            "nome": "porte",
            "valorMin": 2,
            "valorMax": 4,
            "peso": 0.5,
            "tipoComparacao": "range",
        },
    ]
    entidades = [
        {
            "identificador": "rico",
            "nome": "Hotel Bairro Rico",
            "tipo": "pj",
            "atributos": {"cnae": "5510801", "porte": 3, "renda_bairro": 5200},
        },
        {
            "identificador": "pobre",
            "nome": "Hotel Bairro Pobre",
            "tipo": "pj",
            "atributos": {"cnae": "5510801", "porte": 3, "renda_bairro": 1400},
        },
    ]
    analisar_payload = {
        "clienteId": "cliente-flywheel",
        "criterios": criterios,
        "entidades": entidades,
        "limiarSimilaridade": 0.1,
    }

    primeira = anyio.run(_post, "/analisar", analisar_payload).json()
    primeira_por_id = {item["entidadeAlvoId"]: item for item in primeira["oportunidades"]}
    assert primeira_por_id["rico"]["score"]["valor"] == 1.0
    assert primeira_por_id["pobre"]["score"]["valor"] == 1.0

    feedback_payload = {
        "clienteId": "cliente-flywheel",
        "resultados": _resultados(4, 4),
    }
    feedback = anyio.run(_post, "/feedback", feedback_payload).json()

    assert feedback["retreino"]["treinado"] is True
    assert feedback["retreino"]["importancia_features"]["renda_bairro"] > 0

    segunda = anyio.run(_post, "/analisar", analisar_payload).json()
    segunda_por_id = {item["entidadeAlvoId"]: item for item in segunda["oportunidades"]}

    assert segunda_por_id["rico"]["score"]["valor"] == 1.0
    assert segunda_por_id["pobre"]["score"]["valor"] < 0.5
    assert segunda_por_id["pobre"]["prioridade"] == "baixa"
