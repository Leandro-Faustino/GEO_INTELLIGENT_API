"""Phase 3 tests for vectorization and kNN lookalike search."""

import numpy as np

from app.ml.knn import buscar_similares, cosine_similarity
from app.ml.vectorizer import Vetorizador, normalizar


CRITERIOS = [
    {
        "nome": "cnae",
        "valor_min": ["5510801"],
        "valor_max": ["5510801"],
        "peso": 0.4,
        "tipo_comparacao": "enum",
    },
    {
        "nome": "porte",
        "valor_min": 2.0,
        "valor_max": 4.0,
        "peso": 0.35,
        "tipo_comparacao": "range",
    },
    {
        "nome": "idade_anos",
        "valor_min": 5.0,
        "valor_max": 12.0,
        "peso": 0.25,
        "tipo_comparacao": "range",
    },
]


def test_cosine_identicos():
    vetor = np.array([1.0, 2.0, 3.0])

    assert abs(cosine_similarity(vetor, vetor) - 1.0) < 1e-9


def test_cosine_ortogonais():
    a = np.array([1.0, 0.0])
    b = np.array([0.0, 1.0])

    assert abs(cosine_similarity(a, b)) < 1e-9


def test_normalizar():
    vetor = np.array([3.0, 4.0])
    normalizado = normalizar(vetor)

    assert abs(np.linalg.norm(normalizado) - 1.0) < 1e-9


def test_vetorizador_dimensoes():
    vetorizador = Vetorizador(CRITERIOS)

    assert len(vetorizador.vetor_perfil()) == 3


def test_entidade_match_perfeito():
    vetorizador = Vetorizador(CRITERIOS)
    perfil = normalizar(vetorizador.vetor_perfil())
    entidade = normalizar(
        vetorizador.vetor_entidade({"cnae": "5510801", "porte": 3, "idade_anos": 8})
    )

    assert cosine_similarity(perfil, entidade) > 0.99


def test_lookalike_piloto_colchao():
    entidades = [
        {
            "identificador": "e1",
            "nome": "Hotel Panorama",
            "atributos": {"cnae": "5510801", "porte": 3, "idade_anos": 7},
        },
        {
            "identificador": "e2",
            "nome": "Hotel Top Class",
            "atributos": {"cnae": "5510801", "porte": 2, "idade_anos": 4},
        },
        {
            "identificador": "e3",
            "nome": "Padaria Central",
            "atributos": {"cnae": "4721102", "porte": 1, "idade_anos": 20},
        },
    ]

    resultados = buscar_similares(CRITERIOS, entidades, limiar=0.1)
    por_id = {resultado["identificador"]: resultado["similaridade"] for resultado in resultados}

    assert por_id["e1"] > 0.7
    assert por_id["e3"] < por_id["e1"]
    assert por_id["e3"] < por_id["e2"]


def test_ordenacao_decrescente():
    entidades = [
        {
            "identificador": "baixo",
            "atributos": {"cnae": "9999999", "porte": 1, "idade_anos": 30},
        },
        {
            "identificador": "alto",
            "atributos": {"cnae": "5510801", "porte": 3, "idade_anos": 8},
        },
    ]

    resultados = buscar_similares(CRITERIOS, entidades, limiar=0.0)

    assert resultados[0]["identificador"] == "alto"


def test_limiar_filtra():
    entidades = [
        {
            "identificador": "fraco",
            "atributos": {"cnae": "0000000", "porte": 99, "idade_anos": 99},
        },
    ]

    assert buscar_similares(CRITERIOS, entidades, limiar=0.9) == []


def test_k_limita_resultados():
    entidades = [
        {
            "identificador": f"e{i}",
            "atributos": {"cnae": "5510801", "porte": 3, "idade_anos": 8},
        }
        for i in range(10)
    ]

    assert len(buscar_similares(CRITERIOS, entidades, limiar=0.0, k=3)) == 3


def test_vazio():
    assert buscar_similares([], [], limiar=0.3) == []
    assert buscar_similares(CRITERIOS, [], limiar=0.3) == []
