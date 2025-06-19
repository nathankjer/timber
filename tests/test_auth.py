import sys

sys.path.append("src")

from app import create_app
from config import DevelopmentConfig
from timber.extensions import db
from timber.models import User


class TestConfig(DevelopmentConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def create_test_app():
    """Spin up a fresh application + in-memory database per test."""
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    return app


def register(client, *, name="User", email="user@example.com", password="secret"):
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


def login(client, *, email="user@example.com", password="secret"):
    return client.post(
        "/auth/login",
        data={"email": email, "password": password},
        follow_redirects=True,
    )


# --------------------------------------------------------------------------- #
# Original tests (unchanged)
# --------------------------------------------------------------------------- #
def test_user_registration_and_login():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        register(client)  # creates 1 user
        assert User.query.count() == 1
        resp = login(client)
        assert b"Logged in" in resp.data


def test_duplicate_registration():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        register(client, name="Dup", email="dup@example.com")
        resp = register(client, name="Dup", email="dup@example.com")
        assert b"Email already registered" in resp.data
        assert User.query.count() == 1


# --------------------------------------------------------------------------- #
# Extra tests for **full** branch coverage
# --------------------------------------------------------------------------- #
def test_register_missing_fields_and_mismatch():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()

        # Missing name
        resp = client.post(
            "/auth/register",
            data={
                "name": "",
                "email": "x@example.com",
                "password": "a",
                "confirm_password": "a",
            },
            follow_redirects=True,
        )
        assert b"All fields required" in resp.data
        assert User.query.count() == 0

        # Password mismatch
        resp = client.post(
            "/auth/register",
            data={
                "name": "Mismatch",
                "email": "mm@example.com",
                "password": "a",
                "confirm_password": "b",
            },
            follow_redirects=True,
        )
        assert b"Passwords do not match" in resp.data
        assert User.query.count() == 0


def test_login_invalid_credentials():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        # No such user
        resp = login(client, email="ghost@example.com")
        assert b"Invalid credentials" in resp.data

        # Wrong password
        register(client, email="pw@example.com", password="right")
        resp = login(client, email="pw@example.com", password="wrong")
        assert b"Invalid credentials" in resp.data


def test_protected_routes_require_login():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        # Un-authenticated users should get redirected to login page
        for url in ("/auth/account", "/auth/password", "/auth/logout"):
            resp = client.get(url, follow_redirects=True)
            assert b"login" in resp.data.lower()  # we hit the login template


def test_account_update_validation_and_success():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        register(client)

        # Empty name should fail
        resp = client.post("/auth/account", data={"name": ""}, follow_redirects=True)
        assert b"Name required" in resp.data
        user = User.query.first()
        assert user.name == "User"

        # Valid rename
        resp = client.post(
            "/auth/account",
            data={"name": "Renamed"},
            follow_redirects=True,
        )
        assert b"Account updated" in resp.data
        assert User.query.first().name == "Renamed"


def test_password_change_validation_and_success():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        register(client, password="old")

        # New / confirm mismatch
        resp = client.post(
            "/auth/password",
            data={
                "old_password": "old",
                "new_password": "x",
                "confirm_password": "y",
            },
            follow_redirects=True,
        )
        assert b"Passwords do not match" in resp.data

        # Wrong current password
        resp = client.post(
            "/auth/password",
            data={
                "old_password": "bad",
                "new_password": "new",
                "confirm_password": "new",
            },
            follow_redirects=True,
        )
        assert b"Current password incorrect" in resp.data

        # Successful change
        resp = client.post(
            "/auth/password",
            data={
                "old_password": "old",
                "new_password": "new",
                "confirm_password": "new",
            },
            follow_redirects=True,
        )
        assert b"Password updated" in resp.data

        # Verify we can log in with new password
        client.get("/auth/logout", follow_redirects=True)
        resp = login(client, password="new")
        assert b"Logged in" in resp.data


def test_logout():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        register(client)
        resp = client.get("/auth/logout", follow_redirects=True)
        assert b"Logged out" in resp.data
