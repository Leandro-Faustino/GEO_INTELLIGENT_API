from functools import partial

import anyio
import httpx

from app.main import app
from app.services.raiox_service import RaioXService
from app.schemas.contracts import RaioXRequest


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.request(method, path, **kwargs)


def request(method: str, path: str, **kwargs) -> httpx.Response:
    return anyio.run(partial(_request, method, path, **kwargs))


def test_raiox_rejeita_base_insuficiente():
    response = request(
        "POST",
        "/raio-x",
        json={
            "compradores": [
                {
                    "identificador": "c1",
                    "nome": "Hotel A",
                    "tipo": "pj",
                    "frequencia": 2,
                    "ativo": True,
                },
                {
                    "identificador": "c2",
                    "nome": "Hotel B",
                    "tipo": "pj",
                    "frequencia": 2,
                    "ativo": False,
                },
            ],
        },
    )

    assert response.status_code == 422


def test_raiox_retorna_relatorio_em_camelcase():
    response = request(
        "POST",
        "/raio-x",
        json={
            "compradores": [
                comprador("c1", "Hotel A", "São Paulo", 1200, 3, True),
                comprador("c2", "Hotel B", "São Paulo", 1400, 2, True),
                comprador("c3", "Hotel C", "Campinas", 900, 1, True),
                comprador("c4", "Hotel D", "Curitiba", 0, 0, False),
            ],
        },
    )

    body = response.json()

    assert response.status_code == 200
    assert "retrato" in body
    assert "fatores" in body
    assert body["estatisticas"]["totalClientes"] == 4
    assert body["estatisticas"]["ativos"] == 3
    assert body["estatisticas"]["comRecompra"] == 2
    assert body["segmentos"][0]["segmento"].startswith("Segmento:")
    assert "pesoPercentual" in body["fatores"][0]


def test_raiox_service_usa_fallback_quando_nao_ha_atributos():
    service = RaioXService()
    relatorio = service.gerar(
        RaioXRequest(
            compradores=[
                {
                    "identificador": "c1",
                    "nome": "Lead 1",
                    "tipo": "pj",
                    "ticket_medio": 100,
                    "frequencia": 2,
                    "ativo": True,
                },
                {
                    "identificador": "c2",
                    "nome": "Lead 2",
                    "tipo": "pj",
                    "ticket_medio": 120,
                    "frequencia": 2,
                    "ativo": True,
                },
                {
                    "identificador": "c3",
                    "nome": "Lead 3",
                    "tipo": "pj",
                    "ticket_medio": 140,
                    "frequencia": 1,
                    "ativo": True,
                },
            ]
        )
    )

    assert relatorio.fatores[0].atributo == "Ticket medio"
    assert relatorio.estatisticas.ticket_medio == 120


def comprador(
    identificador: str,
    nome: str,
    cidade: str,
    ticket_medio: float,
    frequencia: int,
    ativo: bool,
):
    return {
        "identificador": identificador,
        "nome": nome,
        "tipo": "pj",
        "atributosOriginais": {
            "cidade": cidade,
            "segmento": "hotelaria",
            "porte": "medio",
        },
        "ticketMedio": ticket_medio,
        "frequencia": frequencia,
        "ativo": ativo,
    }
