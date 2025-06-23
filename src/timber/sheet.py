from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import Blueprint, abort, jsonify, request
from flask_login import current_user, login_required

from .extensions import db
from .models import Action, Element, Sheet

sheet_bp = Blueprint("sheet", __name__, url_prefix="/sheet")


@sheet_bp.get("")
@login_required
def list_sheets():
    """Return all sheets for the current user."""
    sheets = Sheet.query.filter_by(user_id=current_user.id).all()
    return jsonify([{"id": s.id, "name": s.name} for s in sheets])


@sheet_bp.post("")
@login_required
def create_sheet():
    json_data = request.json or {}
    name = json_data.get("name", "New Sheet")
    unit_system = json_data.get("unit_system", "metric")
    sheet = Sheet(name=name, user_id=current_user.id, unit_system=unit_system)  # type: ignore
    db.session.add(sheet)
    db.session.commit()
    return jsonify(
        {"id": sheet.id, "name": sheet.name, "unit_system": sheet.unit_system}
    )


@sheet_bp.get("/<int:sheet_id>")
@login_required
def get_sheet(sheet_id: int):
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)
    elements = [json.loads(e.json_blob) for e in sheet.elements]
    return jsonify(
        {
            "id": sheet.id,
            "name": sheet.name,
            "elements": elements,
            "unit_system": sheet.unit_system,
        }
    )


@sheet_bp.put("/<int:sheet_id>")
@login_required
def update_sheet(sheet_id: int):
    """Rename a sheet."""
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)
    if not request.is_json:
        return jsonify({"error": "JSON body required"}), 400
    name = request.get_json().get("name")
    if not name:
        return jsonify({"error": "name-required"}), 400
    sheet.name = name
    db.session.commit()
    return jsonify({"id": sheet.id, "name": sheet.name})


@sheet_bp.post("/action")
@login_required
def record_action():
    if not request.is_json:
        return jsonify({"error": "JSON body required"}), 400
    payload = request.get_json()
    if not payload:
        return jsonify({"error": "Invalid payload"}), 400
    sheet_id = payload.get("sheet_id")
    state = payload.get("elements", [])
    unit_system = payload.get("unit_system")
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)

    if unit_system in ("metric", "imperial"):
        sheet.unit_system = unit_system

    action = Action(sheet_id=sheet_id, user_id=current_user.id, json_blob=json.dumps(payload), ts=datetime.now(timezone.utc))  # type: ignore
    db.session.add(action)

    # Replace elements with current state
    Element.query.filter_by(sheet_id=sheet_id).delete()
    for el in state:
        db.session.add(Element(sheet_id=sheet_id, json_blob=json.dumps(el)))  # type: ignore

    db.session.commit()
    return jsonify({"status": "ok", "unit_system": sheet.unit_system})


@sheet_bp.delete("/<int:sheet_id>")
@login_required
def delete_sheet(sheet_id: int):
    """Delete a sheet. If it's the last one, create a new one."""
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)

    is_last_sheet = Sheet.query.filter_by(user_id=current_user.id).count() <= 1

    Element.query.filter_by(sheet_id=sheet_id).delete()
    Action.query.filter_by(sheet_id=sheet_id).delete()
    db.session.delete(sheet)

    if is_last_sheet:
        new_sheet = Sheet(name="New Sheet", user_id=current_user.id, unit_system="metric")  # type: ignore
        db.session.add(new_sheet)
        db.session.commit()
        return jsonify(
            {
                "status": "deleted_and_created",
                "new_sheet": {
                    "id": new_sheet.id,
                    "name": new_sheet.name,
                    "unit_system": new_sheet.unit_system,
                },
            }
        )

    db.session.commit()
    return jsonify({"status": "deleted"})
