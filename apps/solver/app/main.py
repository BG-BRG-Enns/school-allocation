"""The allocation solver's HTTP face.

A stateless service on the internal network: the API compiles a model with
small integer ids (docs/domain-and-api.md §6) and sends it here; OR-Tools
CP-SAT solves it; the API validates the answer itself before anything is
published. This service holds no data, no credentials and no names.

This is the foundation release: the health check and the contract's
address. The model and its lexicographic levels come with the allocation
slice; until then /v1/solve says so.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from ortools import __version__ as ORTOOLS_VERSION

CONTRACT = "allocation/v1"

app = FastAPI(title="school-allocation solver", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health() -> dict[str, str]:
    """What the unit's health check and the API ask: alive, and which solver."""
    return {"status": "ok", "ortools": ORTOOLS_VERSION, "contract": CONTRACT}


@app.post("/v1/solve")
def solve() -> JSONResponse:
    """The contract's address, not yet its implementation."""
    return JSONResponse(status_code=501, content={"error": "not_implemented", "contract": CONTRACT})
