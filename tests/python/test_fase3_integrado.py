"""Integrated phase 2 + phase 3 lookalike flow."""

import anyio
import httpx

from app.main import app


async def _post(path: str, payload: dict) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(path, json=payload, headers={"x-request-id": "trace-fase3"})


def test_derivar_perfil_e_usar_no_lookalike():
    compradores = [
        {
            "identificador": "h1",
            "nome": "Hotel Bela Vista",
            "tipo": "pj",
            "atributosOriginais": {"cnae": "5510801", "porte": 3, "idade_anos": 7},
            "ticketMedio": 10000,
            "frequencia": 3,
            "ativo": True,
        },
        {
            "identificador": "h2",
            "nome": "Hotel Serra",
            "tipo": "pj",
            "atributosOriginais": {"cnae": "5510801", "porte": 3, "idade_anos": 8},
            "ticketMedio": 12000,
            "frequencia": 4,
            "ativo": True,
        },
        {
            "identificador": "h3",
            "nome": "Hotel Centro",
            "tipo": "pj",
            "atributosOriginais": {"cnae": "5510801", "porte": 4, "idade_anos": 9},
            "ticketMedio": 11000,
            "frequencia": 2,
            "ativo": True,
        },
    ]

    perfil_response = anyio.run(
        _post,
        "/derivar",
        {"clienteId": "cliente-piloto", "tipoAlvo": "pj", "compradores": compradores},
    )
    assert perfil_response.status_code == 200
    perfil = perfil_response.json()
    assert len(perfil["criterios"]) >= 3

    analise_payload = {
        "clienteId": "cliente-piloto",
        "criterios": perfil["criterios"],
        "limiarSimilaridade": 0.3,
        "jaClientes": ["h4"],
        "entidades": [
            {
                "identificador": "e1",
                "nome": "Hotel Panorama",
                "tipo": "pj",
                "atributos": {
                    "cnae": "5510801",
                    "porte": 3,
                    "idade_anos": 8,
                    "ticket_medio": 11000,
                },
            },
            {
                "identificador": "e2",
                "nome": "Hotel Top Class",
                "tipo": "pj",
                "atributos": {
                    "cnae": "5510801",
                    "porte": 2,
                    "idade_anos": 5,
                    "ticket_medio": 10000,
                },
            },
            {
                "identificador": "e3",
                "nome": "Padaria Central",
                "tipo": "pj",
                "atributos": {
                    "cnae": "4721102",
                    "porte": 1,
                    "idade_anos": 20,
                    "ticket_medio": 10000,
                },
            },
            {
                "identificador": "h4",
                "nome": "Hotel Ja Cliente",
                "tipo": "pj",
                "atributos": {
                    "cnae": "5510801",
                    "porte": 3,
                    "idade_anos": 8,
                    "ticket_medio": 11000,
                },
            },
        ],
    }

    analise_response = anyio.run(_post, "/analisar", analise_payload)
    assert analise_response.status_code == 200

    analise = analise_response.json()
    oportunidades = analise["oportunidades"]
    por_id = {item["entidadeAlvoId"]: item for item in oportunidades}

    assert "h4" not in por_id
    assert por_id["e1"]["score"]["similaridade"] >= por_id["e2"]["score"]["similaridade"]
    assert por_id["e1"]["score"]["similaridade"] > por_id["e3"]["score"]["similaridade"]
    assert por_id["e1"]["prioridade"] == "alta"
