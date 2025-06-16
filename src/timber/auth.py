from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_required, login_user, logout_user

from .models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.get("/register")
def register():
    return render_template("register.html")


@auth_bp.post("/register")
def register_post():
    email = request.form.get("email", "").lower()
    password = request.form.get("password", "")
    if not email or not password:
        flash("Email and password required", "danger")
        return redirect(url_for("auth.register"))
    if User.query.filter_by(email=email).first():
        flash("Email already registered", "danger")
        return redirect(url_for("auth.register"))
    try:
        user = User.create(email, password)
    except ValueError:
        flash("Email already registered", "danger")
        return redirect(url_for("auth.register"))
    login_user(user)
    flash("Account created", "success")
    return redirect(url_for("index"))


@auth_bp.get("/login")
def login():
    return render_template("login.html")


@auth_bp.post("/login")
def login_post():
    email = request.form.get("email", "").lower()
    password = request.form.get("password", "")
    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        flash("Invalid credentials", "danger")
        return redirect(url_for("auth.login"))
    login_user(user)
    flash("Logged in", "success")
    return redirect(url_for("index"))


@auth_bp.get("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out", "success")
    return redirect(url_for("index"))
