from __future__ import annotations

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user

from .extensions import db

from .models import User

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.get("/register")
def register():
    return render_template("register.html")


@auth_bp.post("/register")
def register_post():
    name = request.form.get("name", "").strip()
    email = request.form.get("email", "").lower()
    password = request.form.get("password", "")
    confirm = request.form.get("confirm_password", "")
    if not name or not email or not password:
        flash("All fields required", "danger")
        return redirect(url_for("auth.register"))
    if password != confirm:
        flash("Passwords do not match", "danger")
        return redirect(url_for("auth.register"))
    if User.query.filter_by(email=email).first():
        flash("Email already registered", "danger")
        return redirect(url_for("auth.register"))
    try:
        user = User.create(email, name, password)
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


@auth_bp.get("/account")
@login_required
def account():
    return render_template("account.html")


@auth_bp.post("/account")
@login_required
def account_post():
    name = request.form.get("name", "").strip()
    if not name:
        flash("Name required", "danger")
        return redirect(url_for("auth.account"))
    current_user.name = name
    db.session.commit()
    flash("Account updated", "success")
    return redirect(url_for("auth.account"))


@auth_bp.get("/password")
@login_required
def password():
    return render_template("password.html")


@auth_bp.post("/password")
@login_required
def password_post():
    old = request.form.get("old_password", "")
    new = request.form.get("new_password", "")
    confirm = request.form.get("confirm_password", "")
    if new != confirm:
        flash("Passwords do not match", "danger")
        return redirect(url_for("auth.password"))
    if not current_user.check_password(old):
        flash("Current password incorrect", "danger")
        return redirect(url_for("auth.password"))
    current_user.set_password(new)
    db.session.commit()
    flash("Password updated", "success")
    return redirect(url_for("auth.account"))
