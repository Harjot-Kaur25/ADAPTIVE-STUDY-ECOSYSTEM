"""JSON-only Flask backend for the Adaptive Study Ecosystem."""

from __future__ import annotations

import os
from typing import Any

from flask import Flask, jsonify, request
from werkzeug.exceptions import BadRequest, HTTPException, UnsupportedMediaType

from db import DatabaseUnavailable, SupabaseStore, load_environment_file
from predict import load_model
from workflow import StudentService

load_environment_file()
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 1_000_000

model_artifact = load_model()
try:
    database: SupabaseStore | None = SupabaseStore()
    database_init_error: str | None = None
except DatabaseUnavailable as error:
    database = None
    database_init_error = str(error)


def _error(message: str, status: int):
    return jsonify({"error": {"message": message, "status": status}}), status


def _json_object() -> dict[str, Any]:
    if not request.is_json:
        raise UnsupportedMediaType("Content-Type must be application/json.")
    try:
        body = request.get_json()
    except BadRequest as error:
        raise BadRequest("Malformed JSON request body.") from error
    if not isinstance(body, dict):
        raise BadRequest("Request body must be a JSON object.")
    return body


def _access_token() -> str:
    header = request.headers.get("Authorization", "")
    scheme, separator, token = header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        raise DatabaseUnavailable(
            "Sign in through Supabase Auth and send Authorization: Bearer <access_token>.",
            401,
        )
    return token.strip()


def _service() -> StudentService:
    if database is None:
        raise DatabaseUnavailable(
            database_init_error or "Supabase is not configured.", 503
        )
    return StudentService(database, model_artifact)


def _handle_call(callback):
    try:
        return callback()
    except DatabaseUnavailable as error:
        return _error(str(error), error.status_code)
    except LookupError as error:
        return _error(str(error), 404)
    except ValueError as error:
        return _error(str(error), 400)


@app.errorhandler(HTTPException)
def handle_http_exception(error: HTTPException):
    return _error(error.description, error.code or 500)


@app.get("/health")
@app.get("/api/v1/health")
def health():
    if database is None:
        return jsonify(
            {
                "status": "degraded",
                "model_loaded": True,
                "database": {
                    "configured": False,
                    "connected": False,
                    "schema_ready": False,
                    "message": database_init_error,
                },
            }
        ), 503
    db_status = database.schema_health()
    healthy = bool(db_status.get("connected") and db_status.get("schema_ready"))
    return jsonify(
        {
            "status": "ok" if healthy else "degraded",
            "model_loaded": True,
            "training_data_source": model_artifact["training_data_source"],
            "database": db_status,
        }
    ), (200 if db_status.get("connected") else 503)


@app.route("/api/v1/students", methods=["POST"])
def create_student():
    def action():
        body = _json_object()
        token = _access_token()
        profile = _service().save_profile(body, token)
        return jsonify(profile), (200 if profile["updated"] else 201)

    return _handle_call(action)


@app.route("/api/v1/students/<string:student_id>", methods=["PUT"])
def update_student(student_id: str):
    def action():
        token = _access_token()
        body = _json_object()
        profile = _service().save_profile(body, token, student_id)
        return jsonify(profile), 200

    return _handle_call(action)


@app.get("/api/v1/students/<string:student_id>")
def get_student(student_id: str):
    def action():
        profile = _service().get_profile(student_id, _access_token())
        if profile is None:
            return _error("Student profile was not found.", 404)
        return jsonify(profile), 200

    return _handle_call(action)


@app.put("/api/v1/students/<string:student_id>/availability")
def save_availability(student_id: str):
    def action():
        body = _json_object()
        result = _service().set_availability(student_id, body, _access_token())
        return jsonify(result), 200

    return _handle_call(action)


@app.get("/api/v1/students/<string:student_id>/deadlines")
def get_deadlines(student_id: str):
    return _handle_call(
        lambda: (
            jsonify(_service().get_deadlines(student_id, _access_token())),
            200,
        )
    )


@app.post("/api/v1/students/<string:student_id>/deadlines")
def create_deadline(student_id: str):
    def action():
        body = _json_object()
        result = _service().add_deadlines(student_id, body, _access_token())
        return jsonify({"deadlines": result}), 201

    return _handle_call(action)


@app.post("/api/v1/students/<string:student_id>/priorities")
def predict_priorities(student_id: str):
    return _handle_call(
        lambda: (
            jsonify(
                {
                    "student_id": student_id,
                    "training_data_source": model_artifact["training_data_source"],
                    "predictions": _service().predict_priorities(
                        student_id, _access_token()
                    ),
                    "score_note": (
                        "Random Forest scores reflect synthetic rule-generated labels; "
                        "they are not calibrated real-world probabilities."
                    ),
                }
            ),
            200,
        )
    )


@app.post("/api/v1/students/<string:student_id>/schedule")
def generate_study_schedule(student_id: str):
    def action():
        body = _json_object()
        result = _service().generate_timetable(
            student_id, body, _access_token()
        )
        return jsonify(result), 200

    return _handle_call(action)


@app.get("/api/v1/students/<string:student_id>/schedule")
def get_study_schedule(student_id: str):
    return _handle_call(
        lambda: (jsonify(_service().schedule(student_id, _access_token())), 200)
    )


@app.patch("/api/v1/sessions/<int:session_id>/status")
def update_session_status(session_id: int):
    def action():
        body = _json_object()
        updated = _service().update_session_status(
            session_id, body, _access_token()
        )
        return jsonify(updated), 200

    return _handle_call(action)


@app.post("/api/v1/sessions/<int:session_id>/accept")
def accept_session(session_id: int):
    return _handle_call(
        lambda: (
            jsonify(_service().accept_session(session_id, _access_token())),
            200,
        )
    )


@app.post("/api/v1/sessions/<int:session_id>/skip")
def skip_session(session_id: int):
    return _handle_call(
        lambda: (
            jsonify(_service().skip_session(session_id, _access_token())),
            200,
        )
    )


@app.patch("/api/v1/sessions/<int:session_id>")
def edit_session(session_id: int):
    def action():
        body = _json_object()
        result = _service().edit_session(
            session_id, body, _access_token()
        )
        return jsonify(result), 200

    return _handle_call(action)


@app.get("/api/v1/students/<string:student_id>/progress")
def get_progress(student_id: str):
    return _handle_call(
        lambda: (jsonify(_service().progress(student_id, _access_token())), 200)
    )


@app.post("/api/v1/students/<string:student_id>/subjects/<string:subject_id>/resources")
def get_resources(student_id: str, subject_id: str):
    def action():
        body = _json_object()
        topic = body.get("topic")
        if topic is not None and (
            not isinstance(topic, str) or len(topic.strip()) > 200
        ):
            raise ValueError("topic must be text of at most 200 characters.")
        result = _service().resources(
            student_id, subject_id, _access_token(), topic
        )
        return jsonify(result), 200

    return _handle_call(action)


@app.get("/api/v1/students/<string:student_id>/subjects/<string:subject_id>/resources")
def get_resource_history(student_id: str, subject_id: str):
    return _handle_call(
        lambda: (
            jsonify(
                _service().resource_history(
                    student_id, subject_id, _access_token()
                )
            ),
            200,
        )
    )


@app.post("/recommend")
def compatibility_recommend():
    """Preserve the original priority route while requiring user-scoped RLS."""
    def action():
        body = _json_object()
        token = _access_token()
        student_id = body.get("student_id")
        if not isinstance(student_id, (str, int)) or isinstance(student_id, bool):
            raise ValueError("student_id must be a non-empty string or integer.")
        profile_payload = {
            "student_id": str(student_id),
            "student_name": body.get("student_name"),
            "subjects": [
                {
                    **item,
                    "previous_marks": item.get(
                        "previous_marks", item.get("average_marks")
                    ),
                    "completed_sessions_count": item.get(
                        "completed_sessions_count", item.get("completed_sessions", 0)
                    ),
                    "missed_sessions_count": item.get(
                        "missed_sessions_count", item.get("missed_sessions", 0)
                    ),
                }
                for item in body.get("subjects", [])
            ],
        }
        service = _service()
        service.save_profile(profile_payload, token)
        predictions = service.predict_priorities(str(student_id), token)
        return jsonify({"student_id": str(student_id), "recommendations": predictions}), 200

    return _handle_call(action)


if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5000")),
        debug=False,
    )
