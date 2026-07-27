from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel


class HealthStatus(BaseModel):
    service: Literal["solver"]
    status: Literal["ok"]


app = FastAPI(title="Academia Espronceda Solver")


@app.get("/health")
def get_health() -> HealthStatus:
    return HealthStatus(service="solver", status="ok")
