import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def isolate_models_dir(tmp_path):
    settings = get_settings()
    original_models_dir = settings.models_dir
    settings.models_dir = str(tmp_path / "models")
    try:
        yield
    finally:
        settings.models_dir = original_models_dir
