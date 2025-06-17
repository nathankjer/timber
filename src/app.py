from __future__ import annotations

import os
import sys

from flask import Flask, jsonify, render_template, request
from flask_login import current_user, login_required

from timber import Joint, Load, Member, Model, Support, solve
from timber.extensions import bcrypt, db, login_manager, migrate

# -------------------------------------------------------------------
# Module-level extensions are defined in timber.extensions
# -------------------------------------------------------------------


def create_app(config_object: str | None = None) -> Flask:
    """Application factory with optional config object."""
    template_root = os.path.join(os.path.dirname(__file__), "timber", "templates")
    app = Flask(__name__, template_folder=template_root)

    # --- Configuration ------------------------------------------------
    config_object = config_object or os.environ.get("FLASK_CONFIG", "config.DevelopmentConfig")

    if isinstance(config_object, str):
        sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
        from werkzeug.utils import import_string

        config_object = import_string(config_object)

    app.config.from_object(config_object)

    # --- Initialize extensions ----------------------------------------
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    login_manager.login_view = "auth.login"

    from timber.auth import auth_bp
    from timber.sheet import sheet_bp
    from timber.models import User, Sheet

    @login_manager.user_loader
    def load_user(user_id: str) -> User | None:
        return User.query.get(int(user_id))

    app.register_blueprint(auth_bp)
    app.register_blueprint(sheet_bp)

    @app.get("/")
    def index():
        """Landing page showing a user's sheets."""
        sheet_id = None
        sheets = []
        if current_user.is_authenticated:
            sheets = Sheet.query.filter_by(user_id=current_user.id).all()
            if not sheets:
                sheet = Sheet(name="Untitled", user_id=current_user.id)
                db.session.add(sheet)
                db.session.commit()
                sheets = [sheet]
            sheet_id = sheets[0].id
            sheets = [{"id": s.id, "name": s.name} for s in sheets]
        return render_template("index.html", sheet_id=sheet_id, sheets=sheets)

    # --- Routes -------------------------------------------------------
    @app.post("/solve")
    def solve_endpoint():
        """
        Solve a structural model sent as JSON.
        Expects keys: joints, members, loads, supports (each a list of dicts).
        Returns JSON with 'displacements' and 'reactions'.
        """
        if not request.is_json:
            return jsonify({"error": "JSON body required"}), 400

        data = request.get_json()
        try:
            model = Model(
                joints=[Joint(**j) for j in data.get("joints", [])],
                members=[Member(**m) for m in data.get("members", [])],
                loads=[Load(**l) for l in data.get("loads", [])],
                supports=[Support(**s) for s in data.get("supports", [])],
            )
        except (TypeError, KeyError) as exc:
            return jsonify({"error": f"Invalid payload: {exc}"}), 400

        res = solve(model)
        return jsonify(
            {
                "displacements": {str(k): list(v) for k, v in res.displacements.items()},
                "reactions": {str(k): list(v) for k, v in res.reactions.items()},
            }
        )

    return app


app = create_app()
