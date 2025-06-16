from __future__ import annotations

import os
import sys
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

from timber import Joint, Member, Load, Support, Model, solve

# -------------------------------------------------------------------
# Module-level extensions
# -------------------------------------------------------------------
db = SQLAlchemy()
migrate = Migrate()


def create_app(config_object: str | None = None) -> Flask:
    """Application factory with optional config object."""
    app = Flask(__name__)

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
