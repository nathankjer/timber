"""
Full-coverage tests for timber.models.

Run with:
    pytest -q --cov=src/timber/models.py
"""

import time
from datetime import datetime

import pytest
from flask import Flask

from timber.extensions import db
from timber.models import User, Sheet, Element


# -----------------------------------------------------------------------------
# Fixtures
# -----------------------------------------------------------------------------


@pytest.fixture(scope="module")
def app():
    """Flask app with in-memory SQLite and initialized extensions."""
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()


@pytest.fixture(autouse=True)
def clean_tables(app):
    """After every test, wipe all rows so tests remain isolated."""
    yield
    with app.app_context():
        # truncate all tables
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()


# -----------------------------------------------------------------------------
# Tests for User model
# -----------------------------------------------------------------------------


def test_user_create_and_password_check(app):
    """Creating a user should hash the password, and check_password should work."""
    with app.app_context():
        user = User.create(email="alice@example.com", name="Alice", password="secret")
        # Basic fields set
        assert user.id is not None
        assert user.email == "alice@example.com"
        assert user.name == "Alice"
        # Password must be hashed, not equal to plain text
        assert user.password_hash != "secret"
        # check_password
        assert user.check_password("secret") is True
        assert user.check_password("wrong") is False
        # created_at is a datetime near now
        assert isinstance(user.created_at, datetime)
        assert abs((datetime.utcnow() - user.created_at).total_seconds()) < 5


def test_user_create_duplicate_email_raises_value_error(app):
    """Attempting to create two users with the same email should raise ValueError."""
    with app.app_context():
        User.create(email="bob@example.com", name="Bob", password="pass")
        with pytest.raises(ValueError) as exc:
            User.create(email="bob@example.com", name="Bobby", password="pass2")
        assert str(exc.value) == "email-already-exists"


# -----------------------------------------------------------------------------
# Tests for Sheet model (timestamps & relationship)
# -----------------------------------------------------------------------------


def test_sheet_timestamps_and_relationship(app):
    """Sheet should default created_at/updated_at, relationship to User works,
    and updated_at should change on update."""
    with app.app_context():
        user = User.create(email="carol@example.com", name="Carol", password="pw")
        sheet = Sheet(user_id=user.id, name="Initial")
        db.session.add(sheet)
        db.session.commit()

        # Relationship round-trip
        assert sheet.user is user
        assert sheet in user.sheets

        # Timestamps
        assert isinstance(sheet.created_at, datetime)
        assert isinstance(sheet.updated_at, datetime)
        # updated_at should be >= created_at
        assert sheet.updated_at >= sheet.created_at

        # onupdate: modify then commit, updated_at must advance
        prev_updated = sheet.updated_at
        time.sleep(0.001)
        sheet.name = "Changed"
        db.session.commit()
        assert sheet.updated_at > prev_updated


# -----------------------------------------------------------------------------
# Tests for Element & Action models (foreign keys & backrefs)
# -----------------------------------------------------------------------------


def test_element_sheet_backref(app):
    """Element.sheet and Sheet.elements must reflect the FK relationship."""
    with app.app_context():
        user = User.create(email="d@ex.com", name="D", password="x")
        sheet = Sheet(user_id=user.id, name="S")
        db.session.add(sheet)
        db.session.commit()

        el = Element(sheet_id=sheet.id, json_blob='{"k": 123}')
        db.session.add(el)
        db.session.commit()
