"""Phase 7/8 tests for optional embeddings and hook generation."""

from app.ml import embeddings
from app.ml.hooks import GeradorLLM, GeradorTemplate, criar_gerador
from app.ml.knn import buscar_similares
from app.schemas.contracts import AnalisarRequest
from app.services.analise_service import AnaliseService


def test_embeddings_disponivel_nao_quebra():
    assert isinstance(embeddings.disponivel(), bool)


def test_texto_de_atributos():
    texto = embeddings.texto_de_atributos({"cnae": "5510801", "porte": 3})

    assert "cnae: 5510801" in texto
    assert "porte: 3" in texto


def test_busca_cai_para_numerico_se_embeddings_indisponivel():
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
            "valor_min": 2.0,
            "valor_max": 4.0,
            "peso": 0.5,
            "tipo_comparacao": "range",
        },
    ]
    entidades = [
        {"identificador": "e1", "atributos": {"cnae": "5510801", "porte": 3}},
    ]

    resultados = buscar_similares(criterios, entidades, limiar=0.0, usar_embeddings=True)

    assert len(resultados) == 1
    assert resultados[0]["identificador"] == "e1"


def test_gerador_template_funciona_sempre():
    gancho = GeradorTemplate().gerar("Hotel Panorama", {"cnae": "5510801"}, 0.85)

    assert "Hotel Panorama" in gancho
    assert "85%" in gancho


def test_gerador_template_com_gatilhos():
    gancho = GeradorTemplate().gerar(
        "Hotel X",
        {"porte": 3},
        0.9,
        gatilhos=["reforma recente"],
    )

    assert "reforma recente" in gancho


def test_factory_padrao_e_template():
    assert isinstance(criar_gerador(llm_habilitado=False), GeradorTemplate)


def test_factory_com_llm():
    def fake_llm(_prompt):
        return "Gancho gerado pelo LLM."

    assert isinstance(criar_gerador(llm_habilitado=True, chamar_llm=fake_llm), GeradorLLM)


def test_gerador_llm_usa_a_funcao():
    def fake_llm(prompt):
        assert "Hotel Y" in prompt
        assert "70%" in prompt
        return "Abordagem personalizada para o Hotel Y."

    gancho = GeradorLLM(fake_llm).gerar("Hotel Y", {"cnae": "5510801"}, 0.7)

    assert gancho == "Abordagem personalizada para o Hotel Y."


def test_gerador_llm_fallback_se_falha():
    def llm_quebrado(_prompt):
        raise RuntimeError("LLM fora do ar")

    gancho = GeradorLLM(llm_quebrado).gerar("Hotel Z", {"porte": 2}, 0.6)

    assert "Hotel Z" in gancho
    assert "60%" in gancho


def test_analise_service_aceita_gerador_plugado():
    def fake_llm(_prompt):
        return "Visite na próxima semana para apresentar a linha de colchões."

    service = AnaliseService(gerador_gancho=GeradorLLM(fake_llm))
    resposta = service.analisar(
        AnalisarRequest(
            cliente_id="c1",
            criterios=[
                {
                    "nome": "cnae",
                    "valor_min": ["5510801"],
                    "valor_max": ["5510801"],
                    "peso": 1.0,
                    "tipo_comparacao": "enum",
                }
            ],
            entidades=[
                {
                    "identificador": "e1",
                    "nome": "Hotel Panorama",
                    "tipo": "pj",
                    "atributos": {"cnae": "5510801"},
                }
            ],
            limiar_similaridade=0.1,
        )
    )

    assert resposta.oportunidades[0].gancho_abordagem.startswith("Visite")
