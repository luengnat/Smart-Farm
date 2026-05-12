"""Tests for API key authentication middleware."""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def no_key_client():
    """Client without API key header."""
    from app.main import app

    return TestClient(app)


@pytest.fixture
def wrong_key_client():
    """Client with wrong API key."""
    from app.main import app

    return TestClient(app, headers={"X-API-Key": "wrong-key"})


def test_health_endpoint_no_auth_required(no_key_client):
    """Health endpoint must be accessible without API key."""
    resp = no_key_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_farms_endpoint_rejects_missing_key(no_key_client):
    """Protected endpoints reject requests without API key."""
    resp = no_key_client.post(
        "/farms",
        json={"name": "Test", "location": "Bangkok", "rows": 2, "columns": 2},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHENTICATED"


def test_farms_endpoint_rejects_wrong_key(wrong_key_client):
    """Protected endpoints reject requests with wrong API key."""
    resp = wrong_key_client.get("/farms/999")
    assert resp.status_code == 401


def test_crops_endpoint_rejects_no_key(no_key_client):
    """GET /crops also requires API key."""
    resp = no_key_client.get("/crops")
    assert resp.status_code == 401


def test_valid_key_allows_access(client):
    """Valid API key allows access to protected endpoints."""
    resp = client.get("/crops")
    assert resp.status_code == 200
