"""The production image serves the React build from the API server."""
import importlib
import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def site_client(tmp_path, monkeypatch, db):
    (tmp_path / "static" / "js").mkdir(parents=True)
    (tmp_path / "static" / "js" / "main.js").write_text("console.log('app')")
    (tmp_path / "index.html").write_text("<div id=root></div>")
    (tmp_path / "favicon.ico").write_text("icon")
    monkeypatch.setenv("FRONTEND_BUILD_DIR", str(tmp_path))
    import server
    reloaded = importlib.reload(server)  # registers the frontend routes
    with TestClient(reloaded.app) as c:
        yield c
    monkeypatch.delenv("FRONTEND_BUILD_DIR")
    importlib.reload(server)  # back to the API-only app for other tests


def test_serves_index_for_site_routes(site_client):
    for path in ["/", "/boutique", "/produit/p1", "/commande"]:
        resp = site_client.get(path)
        assert resp.status_code == 200
        assert "<div id=root>" in resp.text


def test_serves_static_files(site_client):
    assert site_client.get("/static/js/main.js").text == "console.log('app')"
    assert site_client.get("/favicon.ico").text == "icon"


def test_api_still_wins_and_unknown_api_is_404(site_client):
    assert site_client.get("/api/products").status_code == 200
    assert site_client.get("/api/nope").status_code == 404


def test_no_path_traversal(site_client):
    resp = site_client.get("/..%2F..%2Fetc%2Fpasswd")
    assert "root:" not in resp.text
