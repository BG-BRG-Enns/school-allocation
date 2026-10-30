"""The allocation solver's HTTP face.

A stateless service on the internal network: the API compiles a model with
small integer ids (docs/domain-and-api.md §6) and sends it here; OR-Tools
CP-SAT solves it (solve.py); the API validates the answer itself before
anything is published. This service holds no data, no credentials and no
names.
"""

import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from ortools import __version__ as ORTOOLS_VERSION
from starlette.types import ASGIApp, Receive, Scope, Send

from .contract import CONTRACT, SolveRequest, Versions, check_model
from .solve import respond, solve

# A compiled model of a school's project week is kilobytes; this is a ceiling, not a target.
MAX_BODY_BYTES = 16 * 1024 * 1024

VERSIONS = Versions(solver=os.environ.get("APP_VERSION", "") or "dev", ortools=ORTOOLS_VERSION)


class BodyLimit:
    """Refuses a request body over the limit while it arrives, whatever its headers say."""

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        received = 0
        exceeded = False

        async def limited() -> dict:
            nonlocal received, exceeded
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        async def guarded_send(message: dict) -> None:
            if exceeded and message["type"] == "http.response.start":
                await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": b'{"error":"body_too_large"}', "more_body": False})
                return
            if exceeded and message["type"] == "http.response.body":
                return
            await send(message)

        await self.app(scope, limited, guarded_send)


api = FastAPI(title="school-allocation solver", docs_url=None, redoc_url=None, openapi_url=None)


@api.get("/health")
def health() -> dict[str, str]:
    """What the unit's health check and the API ask: alive, and which solver."""
    return {"status": "ok", "ortools": ORTOOLS_VERSION, "contract": CONTRACT}


@api.post("/v1/solve")
def solve_endpoint(request: SolveRequest) -> JSONResponse:
    """The contract's one operation. A well-shaped request that is no sound model answers MODEL_INVALID with the reason."""
    problem = check_model(request)
    if problem is not None:
        body = {"status": "MODEL_INVALID", "levels": [], "assign": [], "cancelled": [], "versions": VERSIONS.model_dump(), "detail": problem}
        return JSONResponse(content=body)
    response = respond(solve(request), VERSIONS)
    return JSONResponse(content=response.model_dump(exclude_none=True))


app = BodyLimit(api, MAX_BODY_BYTES)
