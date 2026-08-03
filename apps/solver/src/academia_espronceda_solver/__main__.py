import uvicorn

from academia_espronceda_solver.config import load_settings


def run() -> None:
    settings = load_settings()
    uvicorn.run(
        "academia_espronceda_solver.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.node_env == "development",
    )


if __name__ == "__main__":
    run()
