"""Asynchronous retraining tasks with inline fallback."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.ml.trainer import Trainer

_celery_app = None
celery_app = None


def _modo() -> str:
    return get_settings().retrain_mode.lower()


def _celery_disponivel() -> bool:
    settings = get_settings()
    if settings.retrain_mode.lower() != "celery":
        return False
    if not settings.celery_broker_url:
        return False

    try:
        import celery  # noqa: F401
    except ImportError:
        return False

    return True


def _get_celery_app():
    global _celery_app
    if _celery_app is not None:
        return _celery_app

    if not _celery_disponivel():
        return None

    from celery import Celery

    settings = get_settings()
    _celery_app = Celery(
        "geolead.retrain",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend or None,
    )

    @_celery_app.task(
        name="geolead.retrain.retreinar",
        autoretry_for=(Exception,),
        max_retries=3,
    )
    def _retreinar_task(cliente_id: str, resultados: list[dict[str, Any]]) -> dict[str, Any]:
        trainer = Trainer(models_dir=get_settings().models_dir)
        return trainer.registrar_e_treinar(cliente_id, resultados)

    return _celery_app


def enfileirar_retreino(
    cliente_id: str,
    resultados: list[dict[str, Any]],
) -> dict[str, Any]:
    celery_app = _get_celery_app()
    if celery_app is not None:
        async_result = celery_app.send_task(
            "geolead.retrain.retreinar",
            args=[cliente_id, resultados],
        )
        return {
            "modo": "celery",
            "enfileirado": True,
            "task_id": async_result.id,
        }

    trainer = Trainer(models_dir=get_settings().models_dir)
    resultado = trainer.registrar_e_treinar(cliente_id, resultados)
    return {
        "modo": "inline",
        "enfileirado": False,
        "retreino": resultado,
    }


celery_app = _get_celery_app()
