"""Input validation, model loading, and subject-priority recommendations."""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path
from typing import Any

import joblib

from generate_data import FEATURE_NAMES, PRIORITIES
from train_model import DATA_SOURCE, MODEL_PATH

FEATURE_LIMITS = {
    "average_marks": (0.0, 100.0),
    "exam_count": (1.0, 10.0),
    "total_study_hours": (0.0, 120.0),
    "completed_sessions": (0.0, 120.0),
    "missed_sessions": (0.0, 120.0),
}
INTEGER_FEATURES = {"exam_count", "completed_sessions", "missed_sessions"}
PRIORITY_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}


def validate_features(features: dict[str, Any]) -> list[float]:
    if not isinstance(features, dict):
        raise ValueError("Subject features must be a JSON object.")
    missing = [name for name in FEATURE_NAMES if name not in features]
    if missing:
        raise ValueError(f"Missing required features: {', '.join(missing)}.")

    values: list[float] = []
    for name in FEATURE_NAMES:
        value = features[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{name} must be a number.")
        try:
            number = float(value)
        except (OverflowError, ValueError) as error:
            raise ValueError(f"{name} must be a finite number.") from error
        lower, upper = FEATURE_LIMITS[name]
        if not math.isfinite(number) or not lower <= number <= upper:
            raise ValueError(f"{name} must be between {lower:g} and {upper:g}.")
        if name in INTEGER_FEATURES and not number.is_integer():
            raise ValueError(f"{name} must be a whole number.")
        values.append(number)
    return values


def validate_identifier(value: Any, field_name: str) -> str | int:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError(f"{field_name} must be a non-empty string or integer.")
    if isinstance(value, str) and (not value.strip() or len(value) > 128):
        raise ValueError(f"{field_name} must contain 1 to 128 non-space characters.")
    return value.strip() if isinstance(value, str) else value


def validate_exam_date(value: Any) -> tuple[str | None, int | None]:
    if value in (None, ""):
        return None, None
    if not isinstance(value, str):
        raise ValueError("upcoming_exam_date must be an ISO date (YYYY-MM-DD).")
    try:
        exam_date = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("upcoming_exam_date must be a valid ISO date (YYYY-MM-DD).") from error
    if exam_date.isoformat() != value:
        raise ValueError("upcoming_exam_date must use the YYYY-MM-DD format.")
    days_remaining = (exam_date - date.today()).days
    if not 0 <= days_remaining <= 365:
        raise ValueError("upcoming_exam_date must be today through one year from today.")
    return exam_date.isoformat(), days_remaining


def load_model(model_path: Path = MODEL_PATH) -> dict[str, Any]:
    if not model_path.is_file():
        raise FileNotFoundError(f"Trained model not found at {model_path}; run train_model.py.")
    artifact = joblib.load(model_path)
    required = {"model", "feature_names", "class_labels", "training_data_source"}
    if not isinstance(artifact, dict) or not required.issubset(artifact):
        raise ValueError(f"Model artifact at {model_path} has an invalid format.")
    if artifact["feature_names"] != list(FEATURE_NAMES):
        raise ValueError("Model feature order does not match the prediction API.")
    if artifact["class_labels"] != list(PRIORITIES):
        raise ValueError("Model classes do not match the prediction API.")
    if artifact["training_data_source"] != DATA_SOURCE:
        raise ValueError("Model is not labelled as trained on synthetic rule data.")
    return artifact


def _explain_factors(features: dict[str, Any], days_remaining: int | None) -> list[str]:
    marks = float(features["average_marks"])
    missed = int(features["missed_sessions"])
    factors: list[str] = []
    if marks < 50:
        factors.append("Previous marks are below 50.")
    if missed >= 5:
        factors.append("At least 5 sessions were missed.")
    if 50 <= marks < 70:
        factors.append("Previous marks are below 70.")
    if 3 <= missed < 5:
        factors.append("3 or 4 sessions were missed.")
    if not factors:
        factors.append("Marks are at least 70 and fewer than 3 sessions were missed.")
    if days_remaining is not None:
        factors.append(f"Upcoming exam is in {days_remaining} day(s).")
    return factors


def _recommendations(features: dict[str, Any], priority: str) -> list[str]:
    actions: list[str] = []
    if float(features["average_marks"]) < 70:
        actions.append("Review recent mistakes and practise the weakest topics.")
    if int(features["missed_sessions"]) >= 3:
        actions.append("Schedule short catch-up sessions and protect those study times.")
    if float(features["total_study_hours"]) < 8:
        actions.append("Plan a few focused study blocks before the next assessment.")
    if not actions and priority == "LOW":
        actions.append("Maintain the current routine and use spaced revision.")
    if not actions:
        actions.append("Review the next topic and keep a regular study schedule.")
    return actions


def predict_subject(
    subject: dict[str, Any], artifact: dict[str, Any]
) -> dict[str, Any]:
    values = validate_features(subject)
    model = artifact["model"]
    priority = str(model.predict([values])[0])
    if priority not in PRIORITIES:
        raise ValueError(f"Model returned unsupported priority {priority!r}.")
    model_scores = model.predict_proba([values])[0]
    scores = {
        str(label): float(score) for label, score in zip(model.classes_, model_scores)
    }
    exam_date, days_remaining = validate_exam_date(subject.get("upcoming_exam_date"))
    return {
        "priority": priority,
        "class_scores": scores,
        "key_factors": _explain_factors(subject, days_remaining),
        "recommendations": _recommendations(subject, priority),
        "upcoming_exam_date": exam_date,
        "days_remaining": days_remaining,
    }


def predict_priority(
    features: dict[str, Any], artifact: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Backwards-compatible prediction helper for callers of the original API."""
    return predict_subject(features, artifact or load_model())
