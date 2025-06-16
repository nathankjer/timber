from __future__ import annotations

from flask import Flask, jsonify, request

from timber import Joint, Member, Load, Support, Model, solve


def create_app() -> Flask:
    app = Flask(__name__)

    @app.post("/solve")
    def solve_endpoint():
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
            return jsonify({"error": str(exc)}), 400

        res = solve(model)
        return jsonify(
            {
                "displacements": {
                    str(k): list(v) for k, v in res.displacements.items()
                },
                "reactions": {str(k): list(v) for k, v in res.reactions.items()},
            }
        )

    return app


app = create_app()

