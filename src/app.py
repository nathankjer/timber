from __future__ import annotations

import os
import sys

from flask import Flask, jsonify, render_template, request
from flask_login import current_user

from timber import Load, Member, Model, Point, Support, solve
from timber.engine import Material, Section
from timber.extensions import bcrypt, db, login_manager, migrate
from timber.units import area, convert_from_display, convert_to_display, force, format_force, format_length, format_moment, format_stress, get_display_unit, get_unit_conversion_info, get_unit_system, length, moment, moment_of_inertia, set_unit_system, stress

# -------------------------------------------------------------------
# Module-level extensions are defined in timber.extensions
# -------------------------------------------------------------------


def create_app(config_object: object | str | None = None) -> Flask:
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

    # --- Model Factory Functions --------------------------------------
    def make_point(p):
        return Point(
            id=p["id"],
            x=length(p.get("x", 0.0)),
            y=length(p.get("y", 0.0)),
            z=length(p.get("z", 0.0)),
        )

    def make_member(m):
        # Material properties
        material = Material(
            E=stress(m.get("E", 200e9)),
            G=stress(m.get("G", 75e9)),
            density=m.get("density", 500.0),
            tensile_strength=stress(m.get("tensile_strength", 40e6)),
            compressive_strength=stress(m.get("compressive_strength", 30e6)),
            shear_strength=stress(m.get("shear_strength", 5e6)),
            bending_strength=stress(m.get("bending_strength", 60e6)),
        )
        # Section properties
        section = Section(
            A=area(m.get("A", 0.01)),
            Iy=moment_of_inertia(m.get("Iy", m.get("I", 1e-6))),
            Iz=moment_of_inertia(m.get("Iz", m.get("I", 1e-6))),
            J=moment_of_inertia(m.get("J", 2e-6)),
            y_max=length(m.get("y_max", 0.05)),
            z_max=length(m.get("z_max", 0.05)),
        )
        return Member(
            start=m["start"],
            end=m["end"],
            material=material,
            section=section,
        )

    def make_load(l):
        return Load(
            point=l["point"],
            fx=force(l.get("fx", 0.0)),
            fy=force(l.get("fy", 0.0)),
            fz=force(l.get("fz", 0.0)),
            mx=moment(l.get("mx", 0.0)),
            my=moment(l.get("my", 0.0)),
            mz=moment(l.get("mz", 0.0)),
            amount=force(l.get("amount", 0.0)),
        )

    # --- Initialize extensions ----------------------------------------
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    bcrypt.init_app(app)
    login_manager.login_view = "auth.login"  # type: ignore

    from timber.auth import auth_bp
    from timber.models import Sheet, User
    from timber.sheet import sheet_bp

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
                sheet = Sheet(name="Untitled", user_id=current_user.id)  # type: ignore
                db.session.add(sheet)
                db.session.commit()
                sheets = [sheet]
            sheet_id = sheets[0].id
            sheets = [{"id": s.id, "name": s.name} for s in sheets]
        return render_template("index.html", sheet_id=sheet_id, sheets=sheets)

    # --- Routes -------------------------------------------------------
    @app.post("/solve")
    def solve_endpoint():
        import numpy as np

        def to_serializable(obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, tuple):
                return list(obj)
            if isinstance(obj, dict):
                return {k: to_serializable(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [to_serializable(v) for v in obj]
            return obj

        try:
            if not request.is_json:
                return jsonify({"error": "JSON body required"}), 400

            data = request.get_json()
            if not data:
                return jsonify(
                    {
                        "frames": [],
                        "unit_system": "metric",
                        "final_time": 0.0,
                        "total_frames": 0,
                    }
                )

            unit_system = data.get("unit_system", "metric")
            if unit_system not in ["metric", "imperial"]:
                return jsonify({"error": "Invalid unit_system. Must be 'metric' or 'imperial'"}), 400

            set_unit_system(unit_system)

            step = data.get("step", 0.001)
            simulation_time = data.get("simulation_time", 10.0)
            damping_ratio = data.get("damping_ratio", 0.02)

            points_in = data.get("points", [])
            members_in = data.get("members", [])
            loads_in = data.get("loads", [])
            supports_in = data.get("supports", [])

            referenced_ids = set()
            for m in members_in:
                referenced_ids.add(m["start"])
                referenced_ids.add(m["end"])
            for s in supports_in:
                referenced_ids.add(s["point"])
            for l in loads_in:
                referenced_ids.add(l["point"])

            filtered_points = [p for p in points_in if (p.get("id") is not None and ("x" in p or "y" in p)) and p["id"] in referenced_ids]
            if not filtered_points:
                return jsonify(
                    {
                        "frames": [],
                        "unit_system": unit_system,
                        "final_time": 0.0,
                        "total_frames": 0,
                    }
                )

            model = Model(
                points=[make_point(p) for p in filtered_points],
                members=[make_member(m) for m in members_in],
                loads=[make_load(l) for l in loads_in],
                supports=[Support(**s) for s in supports_in],
            )

            results = solve(model, step=step, simulation_time=simulation_time, damping_ratio=damping_ratio)

            # Serialize all frames as-is
            frames = []
            for frame in results.frames:
                # Add points and members for each frame
                points_list = [{"id": p.id, "x": frame.positions[p.id][0], "y": frame.positions[p.id][1], "z": frame.positions[p.id][2]} for p in model.points if p.id in frame.positions]
                members_list = [{"id": i, "start": m.start, "end": m.end} for i, m in enumerate(model.members)]
                frame_dict = {
                    "time": frame.time,
                    "positions": to_serializable(frame.positions),
                    "velocities": to_serializable(frame.velocities),
                    "accelerations": to_serializable(frame.accelerations),
                    "reactions": to_serializable(frame.reactions),
                    "member_forces": to_serializable(frame.member_forces),
                    "member_stresses": to_serializable(frame.member_stresses),
                    "broken_members": to_serializable(frame.broken_members),
                    "issues": to_serializable(frame.issues),
                    "points": points_list,
                    "members": members_list,
                }
                frames.append(frame_dict)

            return jsonify(
                {
                    "frames": frames,
                    "unit_system": results.unit_system,
                    "final_time": results.final_time,
                    "total_frames": results.total_frames,
                }
            )
        except Exception as e:
            return jsonify(
                {
                    "frames": [],
                    "unit_system": "metric",
                    "final_time": 0.0,
                    "total_frames": 0,
                    "error": str(e),
                }
            )

    @app.get("/units/info")
    def get_unit_info():
        """Get unit conversion information for the current unit system."""
        # Get unit system from query parameter, default to metric
        unit_system = request.args.get("unit_system", "metric")
        if unit_system not in ["metric", "imperial"]:
            unit_system = "metric"

        set_unit_system(unit_system)  # type: ignore

        return jsonify(
            {
                "unit_system": get_unit_system(),
                "conversions": get_unit_conversion_info(),
            }
        )

    @app.post("/units/convert")
    def convert_units():
        """Convert values between SI and display units."""
        if not request.is_json:
            return jsonify({"error": "JSON body required"}), 400

        data = request.get_json()
        unit_system = data.get("unit_system", "metric")
        set_unit_system(unit_system)

        conversions = []
        for item in data.get("values", []):
            unit_type = item.get("unit_type")
            value = item.get("value")
            direction = item.get("direction", "to_display")  # "to_display" or "from_display"

            if unit_type and value is not None:
                if direction == "to_display":
                    display_value, symbol = convert_to_display(value, unit_type)
                    conversions.append(
                        {
                            "unit_type": unit_type,
                            "si_value": value,
                            "display_value": display_value,
                            "symbol": symbol,
                        }
                    )
                else:  # from_display
                    si_value = convert_from_display(value, unit_type)
                    conversions.append(
                        {
                            "unit_type": unit_type,
                            "display_value": value,
                            "si_value": si_value,
                            "symbol": get_display_unit(unit_type),
                        }
                    )

        return jsonify({"unit_system": unit_system, "conversions": conversions})

    @app.errorhandler(400)
    def handle_bad_request(e):
        # Only override for /solve endpoint
        if request.path == "/solve":
            return (
                jsonify(
                    {
                        "displacements": {},
                        "reactions": {},
                        "member_forces": {},
                        "member_stresses": {},
                        "broken_members": [],
                        "issues": ["No elements defined."],
                        "unit_system": "metric",
                        "simulation_type": "dynamic",
                        "final_time": 0.0,
                        "total_frames": 0,
                        "simulation_data": [],
                    }
                ),
                200,
            )
        return e

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
