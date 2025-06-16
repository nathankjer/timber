from __future__ import annotations

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

from src.timber import Joint, Member, Load, Support, Model, solve

# -------------------------------------------------------------------
# Module-level extensions
# -------------------------------------------------------------------
db = SQLAlchemy()
migrate = Migrate()


def create_app() -> Flask:
    """Application factory: configure Flask, DB, migrations, and routes."""
    app = Flask(__name__)

    # --- Configuration ------------------------------------------------
    # e.g. set your DATABASE_URL, SECRET_KEY, etc. in config.py
    app.config.from_object("config.DevelopmentConfig")

    # --- Initialize extensions ----------------------------------------
    db.init_app(app)
    migrate.init_app(app, db)

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
        return jsonify({
            "displacements": {str(k): list(v) for k, v in res.displacements.items()},
            "reactions":     {str(k): list(v) for k, v in res.reactions.items()},
        })

    return app


app = create_app()
