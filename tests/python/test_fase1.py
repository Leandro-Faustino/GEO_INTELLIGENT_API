from functools import partial

import anyio
import httpx

from app.main import app


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


def request(method: str, path: str, **kwargs) -> httpx.Response:
    return anyio.run(partial(_request, method, path, **kwargs))


def test_health():
    response = request("GET", "/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_docs_expostas():
    response = request("GET", "/docs")

    assert response.status_code == 200


def test_metrics_expostas():
    response = request("GET", "/metrics")

    assert response.status_code == 200
    assert "engine_http_requests_total" in response.text


def test_correlation_id_propaga():
    response = request("GET", "/health", headers={"x-request-id": "trace-do-gateway-123"})

    assert response.headers["x-request-id"] == "trace-do-gateway-123"


def test_correlation_id_gerado_quando_ausente():
    response = request("GET", "/health")

    assert response.headers.get("x-request-id")


def test_derivar_precondicao_co2():
    response = request(
        "POST",
        "/derivar",
        json={
            "cliente_id": "c1",
            "tipo_alvo": "pj",
            "compradores": [
                {
                    "identificador": "h1",
                    "nome": "Hotel A",
                    "tipo": "pj",
                    "frequencia": 1,
                    "ativo": True,
                },
            ],
        },
    )

    assert response.status_code == 422


def test_derivar_aceita_validos():
    compradores = [
        {
            "identificador": f"h{i}",
            "nome": f"Hotel {i}",
            "tipo": "pj",
            "atributos_originais": {"cnae": "5510801"},
            "ticket_medio": 10000,
            "frequencia": 3,
            "ativo": True,
        }
        for i in range(3)
    ]

    response = request(
        "POST",
        "/derivar",
        json={"cliente_id": "c1", "tipo_alvo": "pj", "compradores": compradores},
    )

    assert response.status_code == 200
    assert response.json()["clienteId"] == "c1"
    assert isinstance(response.json()["criterios"], list)


def test_derivar_aceita_alias_camelcase_do_gateway():
    compradores = [
        {
            "identificador": f"h{i}",
            "nome": f"Hotel {i}",
            "tipo": "pj",
            "atributosOriginais": {"cnae": "5510801"},
            "ticketMedio": 10000,
            "frequencia": 3,
            "ativo": True,
        }
        for i in range(3)
    ]

    response = request(
        "POST",
        "/derivar",
        json={"clienteId": "c1", "tipoAlvo": "pj", "compradores": compradores},
    )

    assert response.status_code == 200
    assert response.json()["clienteId"] == "c1"


def test_analisar_exclui_ja_clientes():
    response = request(
        "POST",
        "/analisar",
        json={
            "cliente_id": "c1",
            "criterios": [],
            "entidades": [
                {"identificador": "e1", "nome": "Hotel X", "tipo": "pj"},
            ],
            "ja_clientes": ["e1"],
        },
    )

    assert response.status_code == 200
    assert response.json()["totalOportunidades"] == 0


def test_feedback_recebe():
    response = request(
        "POST",
        "/feedback",
        json={
            "cliente_id": "c1",
            "resultados": [
                {"entidade_alvo_id": "e1", "converteu": True},
                {"entidade_alvo_id": "e2", "converteu": False},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["convertidos"] == 1
    assert "retreino" in response.json()


def test_mass_assignment_ignorado():
    response = request(
        "POST",
        "/derivar",
        json={
            "cliente_id": "c1",
            "tipo_alvo": "pj",
            "compradores": [
                {
                    "identificador": f"h{i}",
                    "nome": f"H{i}",
                    "tipo": "pj",
                    "frequencia": 3,
                    "ativo": True,
                    "campo_malicioso": "hack",
                }
                for i in range(3)
            ],
        },
    )

    assert response.status_code == 200
