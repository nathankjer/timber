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


def create_test_app():
    app = create_app(TestConfig)
    with app.app_context():
        db.create_all()
    return app


def test_user_registration_and_login():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
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
        assert User.query.count() == 1

        resp = client.post(
            "/auth/login",
            data={"email": "user@example.com", "password": "secret"},
            follow_redirects=True,
        )
        assert b"Logged in" in resp.data


def test_duplicate_registration():
    app = create_test_app()
    with app.app_context():
        client = app.test_client()
        client.post(
            "/auth/register",
            data={
                "name": "Dup",
                "email": "dup@example.com",
                "password": "secret",
                "confirm_password": "secret",
            },
            follow_redirects=True,
        )
        resp = client.post(
            "/auth/register",
            data={
                "name": "Dup",
                "email": "dup@example.com",
                "password": "secret",
                "confirm_password": "secret",
            },
            follow_redirects=True,
        )
        assert b"Email already registered" in resp.data
        assert User.query.count() == 1
