"""Tests for retraining queue fallback behavior."""

from __future__ import annotations

import importlib
from functools import partial
import uuid

import anyio
import httpx

from app.core.config import get_settings
from app.main import app


async def _post(path: str, payload: dict) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        return await client.post(path, json=payload)


def post(path: str, payload: dict) -> httpx.Response:
    return anyio.run(partial(_post, path, payload))


def _reload_tasks():
    import app.ml.tasks as tasks

    return importlib.reload(tasks)


def test_modo_inline_por_padrao(monkeypatch):
    monkeypatch.delenv("RETRAIN_MODE", raising=False)
    get_settings.cache_clear()
    tasks = _reload_tasks()

    assert tasks._modo() == "inline"
    assert tasks._celery_disponivel() is False


def test_celery_indisponivel_sem_broker(monkeypatch):
    monkeypatch.setenv("RETRAIN_MODE", "celery")
    monkeypatch.delenv("CELERY_BROKER_URL", raising=False)
    get_settings.cache_clear()
    tasks = _reload_tasks()

    assert tasks._celery_disponivel() is False


def test_enfileirar_inline_retreina(monkeypatch, tmp_path):
    monkeypatch.setenv("RETRAIN_MODE", "inline")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    get_settings.cache_clear()
    tasks = _reload_tasks()

    resultados = [
        {"atributos": {"renda_bairro": 5000 + i * 100}, "converteu": True}
        for i in range(4)
    ] + [
        {"atributos": {"renda_bairro": 1500 + i * 100}, "converteu": False}
        for i in range(4)
    ]

    resultado = tasks.enfileirar_retreino("c1", resultados)

    assert resultado["modo"] == "inline"
    assert resultado["enfileirado"] is False
    assert resultado["retreino"]["treinado"] is True


def test_feedback_inline_responde_200(monkeypatch, tmp_path):
    monkeypatch.setenv("RETRAIN_MODE", "inline")
    monkeypatch.setenv("MODELS_DIR", str(tmp_path / "models"))
    get_settings.cache_clear()
    _reload_tasks()

    response = post(
        "/feedback",
        {
            "cliente_id": f"async-test-{uuid.uuid4()}",
            "resultados": [
                {
                    "entidade_alvo_id": "e1",
                    "converteu": True,
                    "atributos": {"x": 1},
                },
                {
                    "entidade_alvo_id": "e2",
                    "converteu": False,
                    "atributos": {"x": 2},
                },
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["modo"] == "inline"
    assert body["recebido"] is True
    assert body["convertidos"] == 1


def test_enfileirar_celery_retorna_task_id(monkeypatch):
    import app.ml.tasks as tasks

    class AsyncResultFake:
        id = "task-123"

    class CeleryFake:
        def send_task(self, name, args):
            assert name == "geolead.retrain.retreinar"
            assert args[0] == "c1"
            return AsyncResultFake()

    monkeypatch.setattr(tasks, "_get_celery_app", lambda: CeleryFake())

    resultado = tasks.enfileirar_retreino("c1", [{"atributos": {}, "converteu": True}])

    assert resultado == {
        "modo": "celery",
        "enfileirado": True,
        "task_id": "task-123",
    }


def test_feedback_enfileirado_responde_202(monkeypatch):
    import app.api.routes as routes

    def fake_enfileirar(cliente_id, resultados):
        assert cliente_id.startswith("async-test-")
        assert len(resultados) == 1
        return {"modo": "celery", "enfileirado": True, "task_id": "task-456"}

    monkeypatch.setattr(routes, "enfileirar_retreino", fake_enfileirar)

    response = post(
        "/feedback",
        {
            "cliente_id": f"async-test-{uuid.uuid4()}",
            "resultados": [
                {
                    "entidade_alvo_id": "e1",
                    "converteu": True,
                    "atributos": {"x": 1},
                },
            ],
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["modo"] == "celery"
    assert body["enfileirado"] is True
    assert body["task_id"] == "task-456"
