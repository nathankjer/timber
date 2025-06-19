import math
import sys

sys.path.append("src")

from app import create_app
from config import DevelopmentConfig
from timber import Joint, Load, Member, Model, Support, solve
from timber.extensions import db


class TestConfig(DevelopmentConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


def create_test_app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    return app


def test_solve_endpoint_returns_results():
    model = Model(
        joints=[Joint(0.0, 0.0), Joint(1.0, 0.0)],
        members=[Member(start=0, end=1, E=200e9, A=0.01, I=1e-6)],
        loads=[Load(joint=1, fy=-100.0)],
        supports=[Support(joint=0, ux=True, uy=True, rz=True)],
    )
    expected = solve(model)

    app = create_app()
    with app.test_client() as client:
        resp = client.post(
            "/solve",
            json={
                "joints": [j.__dict__ for j in model.joints],
                "members": [m.__dict__ for m in model.members],
                "loads": [l.__dict__ for l in model.loads],
                "supports": [s.__dict__ for s in model.supports],
            },
        )
        assert resp.status_code == 200
        data = resp.get_json()
        dy = float(data["displacements"]["1"][1])
        assert math.isclose(dy, expected.displacements[1][1], rel_tol=1e-9)


def test_sheet_rename():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        # register and login
        client.post(
            "/auth/register",
            data={
                "name": "User",
                "email": "user@example.com",
                "password": "secret",
                "confirm_password": "secret",
            },
            follow_redirects=True,
        )
        client.post(
            "/auth/login",
            data={"email": "user@example.com", "password": "secret"},
            follow_redirects=True,
        )
        resp = client.post("/sheet", json={"name": "Old"})
        sheet_id = resp.get_json()["id"]
        resp = client.put(f"/sheet/{sheet_id}", json={"name": "New"})
        assert resp.status_code == 200
        assert resp.get_json()["name"] == "New"
