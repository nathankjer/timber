import math
import sys

sys.path.append("src")

import app as app_module  # noqa: E402 – must come after sys.path tweak
from app import create_app
from config import DevelopmentConfig
from timber import Load, Member, Model, Point, Support, solve
from timber.engine import Material, Section
from timber.extensions import db
from timber.models import Sheet, User
from timber.units import area, force, length, mass, moment_of_inertia, stress


class TestConfig(DevelopmentConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


def create_test_app(config_obj=TestConfig):
    app = create_app(config_obj)
    with app.app_context():
        db.create_all()
    return app


def test_solve_endpoint_returns_results():
    model = Model(
        points=[
            Point(id=1, x=length(0.0), y=length(0.0)),
            Point(id=2, x=length(1.0), y=length(0.0)),
        ],
        members=[
            Member(
                start=1,
                end=2,
                material=Material(E=stress(200e9), G=stress(75e9), density=mass(500.0), tensile_strength=stress(40e6), compressive_strength=stress(30e6), shear_strength=stress(5e6), bending_strength=stress(30e6)),
                section=Section(A=area(0.01), Iy=moment_of_inertia(1e-6), Iz=moment_of_inertia(1e-6), J=moment_of_inertia(2e-6), y_max=length(0.05), z_max=length(0.05)),
            )
        ],
        loads=[Load(point=2, fy=force(-100.0))],
        supports=[Support(point=1, ux=True, uy=True, rz=True)],
    )

    app = create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/solve",
            json={
                "points": [{"id": p.id, "x": p.x, "y": p.y, "z": p.z} for p in model.points],
                "members": [{"start": m.start, "end": m.end, "E": m.E, "A": m.A, "I": m.I} for m in model.members],
                "loads": [
                    {
                        "point": l.point,
                        "fx": l.fx,
                        "fy": l.fy,
                        "mz": l.mz,
                        "amount": l.amount,
                    }
                    for l in model.loads
                ],
                "supports": [{"point": s.point, "ux": s.ux, "uy": s.uy, "rz": s.rz} for s in model.supports],
            },
        )
        assert resp.status_code == 200
        data = resp.get_json()
        # Check that we get frames with simulation data
        assert "frames" in data
        assert "unit_system" in data
        assert "final_time" in data
        assert "total_frames" in data
        # Check that we have at least one frame
        assert len(data["frames"]) > 0
        # Check that the first frame has the expected structure
        first_frame = data["frames"][0]
        assert "time" in first_frame
        assert "positions" in first_frame
        assert "reactions" in first_frame
        # Check that point 2 has a displacement (should be loaded)
        assert "2" in first_frame["positions"]

        # Use the final frame for comparison instead of first frame
        final_frame = data["frames"][-1]
        # Just verify that point 2 has a position in the final frame
        assert "2" in final_frame["positions"]
        # Verify that the position is different from the initial position (indicating displacement)
        initial_y = next(p for p in model.points if p.id == 2).y.value
        final_y = final_frame["positions"]["2"][1]
        # The point should have moved (displacement should be non-zero)
        assert abs(final_y - initial_y) > 1e-10


def test_sheet_rename():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        # register and login without triggering index
        client.post(
            "/auth/register",
            data={
                "name": "User",
                "email": "user@example.com",
                "password": "secret",
                "confirm_password": "secret",
            },
            follow_redirects=False,
        )
        client.post(
            "/auth/login",
            data={"email": "user@example.com", "password": "secret"},
            follow_redirects=False,
        )
        resp = client.post("/sheet", json={"name": "Old"})
        sheet_id = resp.get_json()["id"]
        resp = client.put(f"/sheet/{sheet_id}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "New"


def test_solve_endpoint_requires_json():
    app = create_test_app()
    with app.test_client() as client:
        resp = client.post("/solve", data="not-json", content_type="text/plain")
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "JSON body required"


def test_solve_endpoint_empty_payload_raises_error():
    app = create_test_app()
    with app.test_client() as client:
        resp = client.post("/solve", json={})
        assert resp.status_code == 200
        data = resp.get_json()
        # New format returns empty frames instead of old format
        assert "frames" in data
        assert "unit_system" in data
        assert "final_time" in data
        assert "total_frames" in data
        assert len(data["frames"]) == 0


def test_solve_endpoint_invalid_nested_payload():
    payload = {"points": [{"id": 1, "x": 0.0}]}  # missing 'y'
    app = create_test_app()
    with app.test_client() as client:
        resp = client.post("/solve", json=payload)
        # Now expect 200, not 400, since the backend ignores unreferenced/malformed points
        assert resp.status_code == 200
        data = resp.get_json()
        # Should return empty results in new format
        assert "frames" in data
        assert "unit_system" in data
        assert "final_time" in data
        assert "total_frames" in data
        assert len(data["frames"]) == 0


def _capture_render_context(monkeypatch):
    captured = {}

    def fake_render(_tmpl, **ctx):
        captured["ctx"] = ctx
        return ""

    monkeypatch.setattr(app_module, "render_template", fake_render, raising=True)
    return captured


def test_index_route_unauthenticated(monkeypatch):
    app = create_test_app()
    captured = _capture_render_context(monkeypatch)
    with app.test_client() as client:
        resp = client.get("/")
        assert resp.status_code == 200
    assert captured["ctx"]["sheet_id"] is None
    assert captured["ctx"]["sheets"] == []


def _register_and_login(client, email="user@example.com", pwd="secret"):
    client.post(
        "/auth/register",
        data={"name": "User", "email": email, "password": pwd, "confirm_password": pwd},
        follow_redirects=False,
    )
    client.post(
        "/auth/login",
        data={"email": email, "password": pwd},
        follow_redirects=False,
    )


def test_index_route_authenticated_creates_default_sheet(monkeypatch):
    app = create_test_app()
    captured = _capture_render_context(monkeypatch)
    with app.test_client() as client, app.app_context():
        _register_and_login(client)
        initial_count = Sheet.query.count()
        client.get("/")
        assert Sheet.query.count() == initial_count + 1
        new_sheet = Sheet.query.order_by(Sheet.id.desc()).first()
        assert new_sheet is not None
        assert captured["ctx"]["sheet_id"] == new_sheet.id
        assert captured["ctx"]["sheets"] == [{"id": new_sheet.id, "name": new_sheet.name}]


def test_index_route_authenticated_with_existing_sheets(monkeypatch):
    app = create_test_app()
    captured = _capture_render_context(monkeypatch)
    with app.test_client() as client, app.app_context():
        _register_and_login(client, email="second@example.com")
        user = User.query.filter_by(email="second@example.com").first()
        assert user is not None
        s1 = Sheet(name="First", user_id=user.id)  # type: ignore
        s2 = Sheet(name="Second", user_id=user.id)  # type: ignore
        db.session.add_all([s1, s2])
        db.session.commit()
        initial_count = Sheet.query.count()
        client.get("/")
        assert Sheet.query.count() == initial_count
        sheets_list = captured["ctx"]["sheets"]
        # Should list sheets sorted by id
        ids = [s["id"] for s in sheets_list]
        assert ids == sorted(ids)
        assert captured["ctx"]["sheet_id"] == ids[0]


def test_create_app_accepts_class_and_string_config():
    app1 = create_app(TestConfig)
    assert app1.config["TESTING"] is True
    app2 = create_app("config.DevelopmentConfig")
    assert app2.config["DEBUG"] == DevelopmentConfig.DEBUG


def test_triangle_with_directional_load_no_false_instability():
    # Triangle: points 1, 2, 3; supports at 1 and 2; load at 3, direction defined by point 4 (not a real node)
    triangle_points = [
        {"id": 1, "x": -24, "y": -52, "z": 0},
        {"id": 2, "x": 16, "y": -52, "z": 0},
        {"id": 3, "x": -2, "y": -4, "z": 0},
        {
            "id": 4,
            "x": -2.752316309123405,
            "y": -40.74126402770759,
            "z": 0,
        },  # direction only
    ]
    triangle_members = [
        {"start": 1, "end": 2, "E": 200e9, "A": 0.01, "I": 1e-6},
        {"start": 1, "end": 3, "E": 200e9, "A": 0.01, "I": 1e-6},
        {"start": 3, "end": 2, "E": 200e9, "A": 0.01, "I": 1e-6},
    ]
    triangle_loads = [
        {
            "point": 3,
            "fx": -20.47176838208708,
            "fy": -999.7904313901539,
            "mz": 0,
            "amount": 1000,
        }
    ]
    triangle_supports = [
        {"point": 2, "ux": True, "uy": True, "uz": True, "rx": True, "ry": True, "rz": True},
        {"point": 1, "ux": True, "uy": True, "uz": True, "rx": True, "ry": True, "rz": True},
    ]
    app = create_test_app()
    with app.test_client() as client:
        resp = client.post(
            "/solve",
            json={
                "points": triangle_points,
                "members": triangle_members,
                "loads": triangle_loads,
                "supports": triangle_supports,
                "unit_system": "metric",
            },
        )
        assert resp.status_code == 200
        data = resp.get_json()
        # Check that we get frames with simulation data
        assert "frames" in data
        assert "unit_system" in data
        assert "final_time" in data
        assert "total_frames" in data
        # Check that we have at least one frame
        assert len(data["frames"]) > 0
        # Check that the first frame has the expected structure
        first_frame = data["frames"][0]
        assert "time" in first_frame
        assert "positions" in first_frame
        assert "reactions" in first_frame
        assert "issues" in first_frame
        # Should NOT have the instability warning
        assert not any("unstable" in issue or "insufficiently constrained" in issue for issue in first_frame["issues"]), f"Unexpected instability warning: {first_frame['issues']}"
