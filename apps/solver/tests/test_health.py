from fastapi.testclient import TestClient

from academia_espronceda_solver.main import app

client = TestClient(app)


def test_health_endpoint_reports_solver_is_ready() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "solver",
        "status": "ok",
    }
