"""Optional semantic embeddings for phase 7."""

from __future__ import annotations

import os
from functools import lru_cache

import httpx

MODELO_PADRAO_SBERT = "sentence-transformers/all-MiniLM-L6-v2"


def disponivel() -> bool:
    """Return whether the configured embeddings provider is available."""
    provider = _provider()
    if provider == "api":
        return bool(
            os.environ.get("EMBEDDINGS_API_URL")
            and os.environ.get("EMBEDDINGS_API_KEY")
        )

    if provider == "sbert":
        try:
            import sentence_transformers  # noqa: F401
        except ImportError:
            return False
        return True

    return False


def gerar_embeddings(textos: list[str], modelo: str | None = None) -> list[list[float]]:
    """Generate dense semantic vectors with the configured provider."""
    if not textos:
        return []

    provider = _provider()
    if provider == "api":
        return _embeddings_api(textos, modelo)

    if provider == "sbert":
        return _embeddings_sbert(textos, _modelo_configurado(modelo, provider))

    raise RuntimeError(f"Provedor de embeddings desconhecido: {provider}")


def texto_de_atributos(atributos: dict) -> str:
    return ". ".join(f"{chave}: {valor}" for chave, valor in atributos.items())


def _provider() -> str:
    try:
        from app.core.config import get_settings

        return get_settings().embeddings_provider.lower()
    except Exception:
        return os.environ.get("EMBEDDINGS_PROVIDER", "api").lower()


def _embeddings_api(textos: list[str], modelo: str | None) -> list[list[float]]:
    url = os.environ["EMBEDDINGS_API_URL"]
    key = os.environ["EMBEDDINGS_API_KEY"]
    model = _modelo_configurado(modelo, "api")

    response = httpx.post(
        url,
        headers={"Authorization": f"Bearer {key}"},
        json={"input": textos, "model": model},
        timeout=30.0,
    )
    response.raise_for_status()
    dados = response.json()
    return [item["embedding"] for item in dados["data"]]


@lru_cache(maxsize=1)
def _carregar_sbert(nome: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(nome)


def _embeddings_sbert(textos: list[str], modelo: str) -> list[list[float]]:
    model = _carregar_sbert(modelo)
    vetores = model.encode(textos, show_progress_bar=False)
    return [vetor.tolist() for vetor in vetores]


def _modelo_configurado(modelo: str | None, provider: str) -> str:
    if modelo is not None:
        return modelo

    default = (
        MODELO_PADRAO_SBERT
        if provider == "sbert"
        else "text-embedding-3-small"
    )

    try:
        from app.core.config import get_settings

        configurado = get_settings().embeddings_model
    except Exception:
        configurado = os.environ.get("EMBEDDINGS_MODEL")

    if provider == "sbert" and configurado == "text-embedding-3-small":
        return default

    return configurado or default
