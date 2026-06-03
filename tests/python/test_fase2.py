"""Phase 2 tests for real statistical derivation."""

from app.ml.derivacao import derivar_criterios, resumo_estatistico


def _comprador(cnae, porte, ticket):
    return {
        "atributos_originais": {"cnae": cnae, "porte": porte},
        "ticket_medio": ticket,
    }


def test_deriva_criterios_basico():
    compradores = [
        _comprador("5510801", 3, 10000),
        _comprador("5510801", 3, 12000),
        _comprador("5510801", 4, 11000),
    ]

    criterios = derivar_criterios(compradores)
    nomes = {criterio["nome"] for criterio in criterios}

    assert {"cnae", "porte", "ticket_medio"}.issubset(nomes)


def test_pesos_somam_um():
    compradores = [
        _comprador("5510801", 3, 10000),
        _comprador("5510801", 2, 8000),
        _comprador("8711501", 4, 15000),
    ]

    criterios = derivar_criterios(compradores)
    soma = sum(criterio["peso"] for criterio in criterios)

    assert soma == 1.0


def test_atributo_consistente_pesa_mais():
    compradores = [
        _comprador("5510801", 1, 10000),
        _comprador("5510801", 5, 10000),
        _comprador("5510801", 9, 10000),
    ]

    criterios = derivar_criterios(compradores)
    por_nome = {criterio["nome"]: criterio for criterio in criterios}

    assert por_nome["cnae"]["peso"] > por_nome["porte"]["peso"]


def test_numerico_vira_range_robusto():
    compradores = [
        _comprador("5510801", 3, 10000),
        _comprador("5510801", 3, 10000),
        _comprador("5510801", 3, 10000),
    ]

    criterios = derivar_criterios(compradores)
    porte = next(criterio for criterio in criterios if criterio["nome"] == "porte")

    assert porte["tipo_comparacao"] == "range"
    assert porte["valor_min"] < 3 < porte["valor_max"]


def test_cnae_numerico_eh_categoria_nao_range():
    compradores = [
        _comprador("5510801", 3, 10000),
        _comprador("5510801", 3, 10000),
        _comprador("8711501", 3, 10000),
    ]

    criterios = derivar_criterios(compradores)
    cnae = next(criterio for criterio in criterios if criterio["nome"] == "cnae")

    assert cnae["tipo_comparacao"] == "enum"
    assert "5510801" in cnae["valor_min"]
    assert "8711501" in cnae["valor_min"]


def test_resumo_estatistico():
    compradores = [
        {"ticket_medio": 10000},
        {"ticket_medio": 12000},
        {"ticket_medio": 8000},
        {"ticket_medio": 15000},
    ]

    resumo = resumo_estatistico(compradores)

    assert resumo["amostras"] == 4
    assert resumo["ticket_medio"] == 11250.0
    assert resumo["ticket_min"] == 8000.0
    assert resumo["ticket_max"] == 15000.0
    assert "assimetria" in resumo


def test_lista_vazia():
    assert derivar_criterios([]) == []
