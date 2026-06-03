"""Phase 4/5 tests for the conversion classifier."""

import os
import tempfile

from app.ml.classifier import MIN_AMOSTRAS, ClassificadorConversao
from app.schemas.contracts import AnalisarRequest
from app.services.analise_service import AnaliseService


def _exemplos_treino():
    exemplos, rotulos = [], []
    for i in range(4):
        exemplos.append({"atributos": {"porte": 3, "renda_bairro": 5000 + i * 100}})
        rotulos.append(1)

    for i in range(4):
        exemplos.append({"atributos": {"porte": 3, "renda_bairro": 1500 + i * 100}})
        rotulos.append(0)

    return exemplos, rotulos


def test_cold_start_usa_similaridade():
    classificador = ClassificadorConversao()

    assert not classificador.treinado
    assert abs(classificador.prever_conversao({"porte": 3}, 0.9) - 0.72) < 0.01


def test_treina_com_dados_suficientes():
    classificador = ClassificadorConversao()
    exemplos, rotulos = _exemplos_treino()

    resultado = classificador.treinar(exemplos, rotulos)

    assert resultado["treinado"] is True
    assert classificador.treinado
    assert resultado["amostras"] == 8
    assert resultado["convertidos"] == 4


def test_recusa_poucos_dados():
    classificador = ClassificadorConversao()

    resultado = classificador.treinar([{"atributos": {"porte": 3}}], [1])

    assert resultado["treinado"] is False


def test_recusa_uma_classe_so():
    classificador = ClassificadorConversao()
    exemplos = [{"atributos": {"porte": i}} for i in range(MIN_AMOSTRAS)]

    resultado = classificador.treinar(exemplos, [1] * MIN_AMOSTRAS)

    assert resultado["treinado"] is False


def test_aprende_a_distinguir_conversao():
    classificador = ClassificadorConversao()
    exemplos, rotulos = _exemplos_treino()
    classificador.treinar(exemplos, rotulos)

    prob_alta = classificador.prever_conversao({"porte": 3, "renda_bairro": 5200})
    prob_baixa = classificador.prever_conversao({"porte": 3, "renda_bairro": 1400})

    assert prob_alta > prob_baixa
    assert prob_alta > 0.5
    assert prob_baixa < 0.5


def test_interpretabilidade():
    classificador = ClassificadorConversao()
    exemplos, rotulos = _exemplos_treino()
    classificador.treinar(exemplos, rotulos)

    importancias = classificador.importancia_features()

    assert "renda_bairro" in importancias
    assert importancias["renda_bairro"] > importancias.get("porte", 0)


def test_persistencia():
    classificador = ClassificadorConversao()
    exemplos, rotulos = _exemplos_treino()
    classificador.treinar(exemplos, rotulos)
    prob_antes = classificador.prever_conversao({"porte": 3, "renda_bairro": 5200})

    with tempfile.TemporaryDirectory() as tmpdir:
        path = os.path.join(tmpdir, "modelo.pkl")
        classificador.salvar(path)

        assert os.path.exists(path)

        restaurado = ClassificadorConversao(modelo_path=path)
        prob_depois = restaurado.prever_conversao({"porte": 3, "renda_bairro": 5200})

    assert restaurado.treinado
    assert abs(prob_antes - prob_depois) < 1e-9


def test_analise_service_combina_similaridade_e_conversao():
    criterios = [
        {
            "nome": "cnae",
            "valor_min": ["5510801"],
            "valor_max": ["5510801"],
            "peso": 0.5,
            "tipo_comparacao": "enum",
        },
        {
            "nome": "porte",
            "valor_min": 2,
            "valor_max": 4,
            "peso": 0.5,
            "tipo_comparacao": "range",
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
            "nome": "Hotel Bairro Baixa Renda",
            "tipo": "pj",
            "atributos": {"cnae": "5510801", "porte": 3, "renda_bairro": 1400},
        },
    ]

    cold_start = AnaliseService().analisar(
        AnalisarRequest(
            cliente_id="c1",
            criterios=criterios,
            entidades=entidades,
            limiar_similaridade=0.1,
        )
    )
    assert cold_start.oportunidades[0].score.valor == 1.0
    assert cold_start.oportunidades[1].score.valor == 1.0

    classificador = ClassificadorConversao()
    exemplos, rotulos = _exemplos_treino()
    classificador.treinar(exemplos, rotulos)
    treinado = AnaliseService(classificador=classificador).analisar(
        AnalisarRequest(
            cliente_id="c1",
            criterios=criterios,
            entidades=entidades,
            limiar_similaridade=0.1,
        )
    )

    por_id = {oportunidade.entidade_alvo_id: oportunidade for oportunidade in treinado.oportunidades}

    assert por_id["rico"].score.valor > por_id["pobre"].score.valor
    assert por_id["rico"].prioridade == "alta"
    assert por_id["pobre"].prioridade == "baixa"
    assert classificador.importancia_features()["renda_bairro"] > 0
