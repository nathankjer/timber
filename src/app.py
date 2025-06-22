from __future__ import annotations

import os
import sys

from flask import Flask, jsonify, render_template, request
from flask_login import current_user

from timber import Point, Load, Member, Model, Support, solve_with_diagnostics
from timber.extensions import bcrypt, db, login_manager, migrate
from timber.units import set_unit_system, get_unit_system, UnitSystem

# -------------------------------------------------------------------
# Module-level extensions are defined in timber.extensions
# -------------------------------------------------------------------


def create_app(config_object: str | None = None) -> Flask:
    """Application factory with optional config object."""
    template_root = os.path.join(os.path.dirname(__file__), "timber", "templates")
    app = Flask(__name__, template_folder=template_root)

    # --- Configuration ------------------------------------------------
    config_object = config_object or os.environ.get(
        "FLASK_CONFIG", "config.DevelopmentConfig"
    )

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
        return db.session.get(User, int(user_id))

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
        Expects keys: points, members, loads, supports (each a list of dicts).
        Optional: unit_system ("metric" or "imperial")
        Returns JSON with 'displacements', 'reactions', 'issues', and 'unit_system'.
        """
        if not request.is_json:
            return jsonify({"error": "JSON body required"}), 400

        data = request.get_json()
        
        # Set unit system if provided
        unit_system = data.get("unit_system", "metric")
        if unit_system not in ["metric", "imperial"]:
            return jsonify({"error": "Invalid unit_system. Must be 'metric' or 'imperial'"}), 400
        
        set_unit_system(unit_system)
        
        try:
            model = Model(
                points=[Point(**p) for p in data.get("points", [])],
                members=[Member(**m) for m in data.get("members", [])],
                loads=[Load(**l) for l in data.get("loads", [])],
                supports=[Support(**s) for s in data.get("supports", [])],
            )
        except (TypeError, KeyError) as exc:
            return jsonify({"error": f"Invalid payload: {exc}"}), 400

        res, issues = solve_with_diagnostics(model)
        
        # Format results with units
        formatted_displacements = {}
        for point_id, disp in res.displacements.items():
            formatted_displacements[str(point_id)] = {
                "ux": res.format_displacement(point_id, "ux"),
                "uy": res.format_displacement(point_id, "uy"),
                "rz": res.format_displacement(point_id, "rz"),
                "raw": list(disp)  # Keep raw values for compatibility
            }
        
        formatted_reactions = {}
        for point_id, react in res.reactions.items():
            formatted_reactions[str(point_id)] = {
                "fx": res.format_reaction(point_id, "fx"),
                "fy": res.format_reaction(point_id, "fy"),
                "mz": res.format_reaction(point_id, "mz"),
                "raw": list(react)  # Keep raw values for compatibility
            }
        
        return jsonify(
            {
                "displacements": formatted_displacements,
                "reactions": formatted_reactions,
                "issues": issues,
                "unit_system": res.unit_system,
            }
        )

    return app


app = create_app()
