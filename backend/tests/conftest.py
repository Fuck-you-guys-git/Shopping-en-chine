"""Shared fixtures: the real app, backed by an in-memory MongoDB (mongomock-motor)."""
import os

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

# database.py reads these at import time
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "shopping_en_chine_test")

import database  # noqa: E402
import server  # noqa: E402


@pytest.fixture(autouse=True)
def paxity_configured(monkeypatch):
    monkeypatch.setenv("PAXITY_ORG_ID", "org-test")


@pytest.fixture()
def db(monkeypatch):
    mock_db = AsyncMongoMockClient()["shopping_en_chine_test"]
    monkeypatch.setattr(database, "db", mock_db)
    return mock_db


@pytest.fixture()
def client(db):
    # Entering the context runs the app lifespan, which seeds the catalog.
    with TestClient(server.app) as c:
        yield c
