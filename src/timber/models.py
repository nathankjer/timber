from __future__ import annotations

from datetime import datetime, timezone

from flask_login import UserMixin
from sqlalchemy.exc import IntegrityError

from .extensions import bcrypt, db


class User(db.Model, UserMixin):  # type: ignore
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    @classmethod
    def create(cls, email: str, name: str, password: str) -> "User":
        user = cls(email=email, name=name)  # type: ignore
        user.set_password(password)
        db.session.add(user)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            raise ValueError("email-already-exists")
        return user

    def set_password(self, password: str) -> None:
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf8")

    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)


class Sheet(db.Model):  # type: ignore
    """A modelling workspace owned by a user."""

    __tablename__ = "sheets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    unit_system = db.Column(
        db.String(10), nullable=False, default="metric"
    )  # "metric" or "imperial"
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = db.relationship("User", backref="sheets")


class Element(db.Model):  # type: ignore
    """JSON blob representing a single element on a sheet."""

    __tablename__ = "elements"

    id = db.Column(db.Integer, primary_key=True)
    sheet_id = db.Column(db.Integer, db.ForeignKey("sheets.id"), nullable=False)
    json_blob = db.Column(db.Text, nullable=False)

    sheet = db.relationship("Sheet", backref="elements")


class Action(db.Model):  # type: ignore
    """A logged user action for replay."""

    __tablename__ = "actions"

    id = db.Column(db.Integer, primary_key=True)
    sheet_id = db.Column(db.Integer, db.ForeignKey("sheets.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    json_blob = db.Column(db.Text, nullable=False)
    ts = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    sheet = db.relationship("Sheet", backref="actions")
    user = db.relationship("User", backref="actions")
