"""
Full-branch tests for timber.sheet blueprint.

Run with:
    pytest -q --cov=src/timber/sheet.py
"""

import sys
from datetime import datetime, timezone
from typing import Any

sys.path.append("src")

from app import create_app
from config import DevelopmentConfig
from timber.extensions import db
from timber.models import Action, Element, Sheet


# --------------------------------------------------------------------------- #
# Test configuration
# --------------------------------------------------------------------------- #
class TestConfig(DevelopmentConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


def create_test_app():
    """Fresh application + pristine in-memory DB per test."""
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    return app


# --------------------------------------------------------------------------- #
# Authentication helpers (identical semantics to test_auth.py)
# --------------------------------------------------------------------------- #
def _register(client, *, name="User", email="user@example.com", password="secret"):
    return client.post(
        "/auth/register",
        data={
            "name": name,
            "email": email,
            "password": password,
            "confirm_password": password,
        },
        follow_redirects=True,
    )


def _login(client, *, email="user@example.com", password="secret"):
    return client.post(
        "/auth/login",
        data={"email": email, "password": password},
        follow_redirects=True,
    )


# Convenience to register+login quickly in each test
def _make_client() -> tuple[Any, Any]:
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        _register(client)
        _login(client)
    return app, client


# Helper to create a new sheet and return its JSON payload
def _create_sheet(client, *, name=None):
    payload = {} if name is None else {"name": name}
    resp = client.post("/sheet", json=payload)
    assert resp.status_code == 200
    return resp.get_json()


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_list_and_create_sheet_default_name():
    app, client = _make_client()
    with app.app_context():
        # Create a new sheet (there may already be one from registration)
        new = _create_sheet(client)  # no name → "New Sheet"
        assert new["name"] == "New Sheet"

        # Fetch the full list; we only assert that our sheet is in it
        resp = client.get("/sheet")
        assert resp.status_code == 200
        data = resp.get_json()

        # Our created sheet must be present, with the right name
        assert any(item["id"] == new["id"] and item["name"] == "New Sheet" for item in data)
        # And there is at least one sheet
        assert len(data) >= 1


def test_get_sheet_success_and_404():
    app, client = _make_client()
    with app.app_context():
        sheet = _create_sheet(client, name="Alpha")
        sid = sheet["id"]

        # Happy path
        resp = client.get(f"/sheet/{sid}")
        j = resp.get_json()
        assert j["name"] == "Alpha" and j["elements"] == []

        # Unknown id → 404
        assert client.get("/sheet/9999").status_code == 404


def test_update_sheet_all_error_branches_and_success():
    app, client = _make_client()
    with app.app_context():
        sid = _create_sheet(client)["id"]

        # 1) Non-JSON body
        resp = client.put(f"/sheet/{sid}", data="oops", content_type="text/plain")
        assert resp.status_code == 400 and resp.get_json()["error"] == "JSON body required"

        # 2) JSON but no name field
        resp = client.put(f"/sheet/{sid}", json={})
        assert resp.status_code == 400 and resp.get_json()["error"] == "name-required"

        # 3) 404 for unknown sheet
        assert client.put("/sheet/9999", json={"name": "x"}).status_code == 404

        # 4) Successful rename
        resp = client.put(f"/sheet/{sid}", json={"name": "Renamed"})
        assert resp.status_code == 200 and resp.get_json()["name"] == "Renamed"
        renamed_sheet = Sheet.query.filter_by(id=sid).first()
        assert renamed_sheet is not None
        assert renamed_sheet.name == "Renamed"


def test_record_action_all_branches_and_element_replacement():
    app, client = _make_client()
    with app.app_context():
        sid = _create_sheet(client)["id"]

        # Non-JSON body
        resp = client.post("/sheet/action", data="bad", content_type="text/plain")
        assert resp.status_code == 400 and resp.get_json()["error"] == "JSON body required"

        # Unknown sheet → 404
        assert client.post("/sheet/action", json={"sheet_id": 999, "elements": []}).status_code == 404

        # First action with 1 element
        elem1 = [{"x": 1}]
        resp = client.post("/sheet/action", json={"sheet_id": sid, "elements": elem1})
        assert resp.get_json() == {"status": "ok", "unit_system": "metric"}
        assert Element.query.filter_by(sheet_id=sid).count() == 1
        assert Action.query.filter_by(sheet_id=sid).count() == 1

        # Second action replaces elements (2 elems) and appends new Action row
        elem2 = [{"y": 2}, {"z": 3}]
        client.post("/sheet/action", json={"sheet_id": sid, "elements": elem2})
        assert Element.query.filter_by(sheet_id=sid).count() == 2
        assert Action.query.filter_by(sheet_id=sid).count() == 2


def test_delete_sheet_all_branches():
    app, client = _make_client()
    with app.app_context():
        # Create two extra sheets on top of the initial one
        a_id = _create_sheet(client, name="A")["id"]
        _create_sheet(client, name="B")["id"]

        # 1) deleting a non‐existent sheet → 404
        assert client.delete("/sheet/999").status_code == 404

        # 2) delete A (allowed since >1 sheets remain)
        resp = client.delete(f"/sheet/{a_id}")
        assert resp.status_code == 200 and resp.get_json()["status"] == "deleted"

        # 3) delete all remaining sheets; last one should be replaced
        sheets_left = client.get("/sheet").get_json()
        for sheet in sheets_left:
            resp = client.delete(f"/sheet/{sheet['id']}")
            assert resp.status_code == 200

        # The last deletion should have created a new sheet
        final_json = resp.get_json()
        assert final_json["status"] == "deleted_and_created"
        assert "new_sheet" in final_json

        # 4) Verify the new sheet is the only one left
        final_sheets = client.get("/sheet").get_json()
        assert len(final_sheets) == 1
        assert final_sheets[0]["id"] == final_json["new_sheet"]["id"]
        assert final_sheets[0]["name"] == "New Sheet"

        # 5) test cleanup: create C, add Element+Action, then delete → elements/actions gone
        c_id = _create_sheet(client, name="C")["id"]

        # inject one element & one action properly
        el = Element(sheet_id=c_id, json_blob="{}")  # type: ignore
        act = Action(sheet_id=c_id, user_id=1, json_blob="{}", ts=datetime.now(timezone.utc))  # type: ignore
        db.session.add(el)
        db.session.add(act)
        db.session.commit()

        # now they should appear
        assert Element.query.filter_by(sheet_id=c_id).count() == 1
        assert Action.query.filter_by(sheet_id=c_id).count() == 1

        # delete and verify cleanup
        resp4 = client.delete(f"/sheet/{c_id}")
        assert resp4.status_code == 200 and resp4.get_json()["status"] == "deleted"
        assert Element.query.filter_by(sheet_id=c_id).count() == 0
        assert Action.query.filter_by(sheet_id=c_id).count() == 0
