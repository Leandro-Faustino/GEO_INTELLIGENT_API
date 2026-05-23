"""Runtime configuration validated at application boot."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        protected_namespaces=("settings_",),
    )

    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000, ge=1, le=65535)
    log_level: str = Field(default="info", pattern="^(debug|info|warning|error|critical)$")
    environment: str = Field(default="development", pattern="^(development|test|production)$")

    internal_api_key: str = Field(default="troque-em-producao-min-32-caracteres!!", min_length=32)

    metrics_enabled: bool = True
    request_id_header: str = "x-request-id"

    models_dir: str = "models"
    model_version: str = "0.1.0"

    embeddings_enabled: bool = False
    embeddings_provider: str = Field(default="api", pattern="^(api|sbert)$")
    embeddings_model: str = "text-embedding-3-small"
    hooks_llm_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
