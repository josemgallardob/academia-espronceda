import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from academia_espronceda_solver.config import SolverSettings, get_settings, load_settings
from academia_espronceda_solver.engine import get_engine
from academia_espronceda_solver.main import app

TEST_SERVICE_TOKEN = "test-internal-service-token-value"
SOLVER_FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "v1" / "solver"


@pytest.fixture
def settings() -> SolverSettings:
    return load_settings(
        {
            "NODE_ENV": "test",
            "INTERNAL_SERVICE_TOKEN": TEST_SERVICE_TOKEN,
            "SOLVER_MAX_TIME_LIMIT_SECONDS": "30",
        }
    )


@pytest.fixture
def client(settings: SolverSettings) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_engine, None)
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_SERVICE_TOKEN}"}


def load_solver_fixture(name: str) -> dict:
    return json.loads((SOLVER_FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def load_fixture():
    return load_solver_fixture
