from __future__ import annotations

import json
from datetime import datetime

from flask import Blueprint, jsonify, request, abort
from flask_login import current_user, login_required

from .extensions import db
from .models import Sheet, Element, Action

sheet_bp = Blueprint("sheet", __name__, url_prefix="/sheet")


@sheet_bp.post("")
@login_required
def create_sheet():
    name = request.json.get("name", "Untitled")
    sheet = Sheet(name=name, user_id=current_user.id)
    db.session.add(sheet)
    db.session.commit()
    return jsonify({"id": sheet.id, "name": sheet.name})


@sheet_bp.get("/<int:sheet_id>")
@login_required
def get_sheet(sheet_id: int):
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)
    elements = [json.loads(e.json_blob) for e in sheet.elements]
    return jsonify({"id": sheet.id, "name": sheet.name, "elements": elements})


@sheet_bp.post("/action")
@login_required
def record_action():
    if not request.is_json:
        return jsonify({"error": "JSON body required"}), 400
    payload = request.get_json()
    sheet_id = payload.get("sheet_id")
    state = payload.get("elements", [])
    sheet = Sheet.query.filter_by(id=sheet_id, user_id=current_user.id).first()
    if not sheet:
        abort(404)

    action = Action(sheet_id=sheet_id, user_id=current_user.id, json_blob=json.dumps(payload), ts=datetime.utcnow())
    db.session.add(action)

    # Replace elements with current state
    Element.query.filter_by(sheet_id=sheet_id).delete()
    for el in state:
        db.session.add(Element(sheet_id=sheet_id, json_blob=json.dumps(el)))

    db.session.commit()
    return jsonify({"status": "ok"})
