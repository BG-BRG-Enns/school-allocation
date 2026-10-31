"""The HTTP face: health, the contract's one operation, and the refusals."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app import main
from app.main import BodyLimit, api

from .conftest import item, option, request, student

client = TestClient(main.app)


def test_health_names_the_solver_and_the_contract() -> None:
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["contract"] == "allocation/v2"
    assert body["ortools"]


def test_solve_answers_the_contract(two_students: dict) -> None:
    response = client.post("/v1/solve", json=two_students)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "OPTIMAL"
    assert body["assign"] == [[0, 0], [1, 1]]
    assert body["versions"]["ortools"]
    assert "detail" not in body
    assert set(body) == {"status", "levels", "assign", "cancelled", "versions"}


def test_a_malformed_request_is_refused_as_such() -> None:
    assert client.post("/v1/solve", json={"contract": "allocation/v2"}).status_code == 422
    payload = request([student(0, [option(0, 1000)])], [item(0, 1)])
    assert client.post("/v1/solve", json={**payload, "extra": 1}).status_code == 422
    assert client.post("/v1/solve", json={**payload, "contract": "allocation/v1"}).status_code == 422, "the contract before the rules"
    over = request([student(0, [option(0, 1000, tie=1000)])], [item(0, 1)])
    assert client.post("/v1/solve", json=over).status_code == 422, "a tie weight is drawn below 1000"



def test_an_unsound_model_is_answered_not_guessed() -> None:
    body = client.post("/v1/solve", json=request([student(0, [option(3, 1000)])], [item(0, 1)])).json()
    assert body["status"] == "MODEL_INVALID"
    assert "not listed" in body["detail"]
    assert body["assign"] == []


def test_a_body_over_the_limit_is_refused_while_it_arrives() -> None:
    small = TestClient(BodyLimit(api, 200))
    payload = request([student(0, [option(0, 1000)])], [item(0, 1)])
    response = small.post("/v1/solve", json=payload)
    assert response.status_code == 413
    assert response.json() == {"error": "body_too_large"}
    assert small.get("/health").status_code == 200
