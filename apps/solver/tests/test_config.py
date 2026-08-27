import pytest

from academia_espronceda_solver.config import load_settings


def test_loads_development_defaults() -> None:
    settings = load_settings({})

    assert settings.node_env == "development"
    assert settings.host == "127.0.0.1"
    assert settings.port == 8001
    assert settings.max_time_limit_seconds == 60.0


def test_rejects_invalid_port() -> None:
    with pytest.raises(ValueError, match="SOLVER_PORT"):
        load_settings({"SOLVER_PORT": "70000"})


def test_accepts_production_configuration() -> None:
    settings = load_settings(
        {
            "NODE_ENV": "production",
            "SOLVER_HOST": "0.0.0.0",
            "SOLVER_PORT": "8001",
            "INTERNAL_SERVICE_TOKEN": "s" * 32,
        }
    )

    assert settings.node_env == "production"
    assert settings.host == "0.0.0.0"


def test_loads_custom_max_time_limit() -> None:
    settings = load_settings({"SOLVER_MAX_TIME_LIMIT_SECONDS": "12.5"})

    assert settings.max_time_limit_seconds == 12.5


def test_rejects_invalid_max_time_limit() -> None:
    with pytest.raises(ValueError, match="SOLVER_MAX_TIME_LIMIT_SECONDS"):
        load_settings({"SOLVER_MAX_TIME_LIMIT_SECONDS": "0"})


def test_rejects_short_production_service_token() -> None:
    with pytest.raises(ValueError, match="INTERNAL_SERVICE_TOKEN"):
        load_settings(
            {
                "NODE_ENV": "production",
                "SOLVER_HOST": "0.0.0.0",
                "INTERNAL_SERVICE_TOKEN": "too-short",
            }
        )
