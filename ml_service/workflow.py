"""Profile, priority, timetable, progress, and persistence workflows."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from db import DatabaseUnavailable, SupabaseStore, access_token_subject
from predict import PRIORITY_RANK, predict_subject, validate_exam_date
from resources import recommend_resources
from scheduler import generate_schedule


def _name(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > 200:
        raise ValueError(f"{field} must contain 1 to 200 characters.")
    return value.strip()


def _date(value: Any, field: str, *, allow_past: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must use YYYY-MM-DD.")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{field} must be a valid YYYY-MM-DD date.") from error
    if parsed.isoformat() != value:
        raise ValueError(f"{field} must use YYYY-MM-DD.")
    if not allow_past and parsed < date.today():
        raise ValueError(f"{field} cannot be in the past.")
    return parsed.isoformat()


def _subject_id(value: Any, field: str = "subject_id") -> str:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        raise ValueError(f"{field} must be a non-empty string or integer.")
    result = str(value).strip()
    if not result or len(result) > 128:
        raise ValueError(f"{field} must contain 1 to 128 characters.")
    return result


def _eq(value: Any) -> str:
    return f"eq.{value}"


class StudentService:
    def __init__(self, store: SupabaseStore, model_artifact: dict[str, Any]):
        self.store = store
        self.model_artifact = model_artifact

    def _rows(self, table: str, student_id: str, token: str, **kwargs: Any):
        filters = kwargs.pop("filters", {})
        return self.store.rows(
            table,
            access_token=token,
            filters={"student_id": _eq(student_id), **filters},
            **kwargs,
        )

    @staticmethod
    def _require_owner(token: str) -> str:
        try:
            owner_id = str(UUID(access_token_subject(token)))
        except ValueError as error:
            raise ValueError("Supabase user token subject must be a UUID.") from error
        return owner_id

    @staticmethod
    def _validate_subjects(subjects: Any) -> list[dict[str, Any]]:
        if not isinstance(subjects, list) or not subjects:
            raise ValueError("subjects must be a non-empty array.")
        if len(subjects) > 50:
            raise ValueError("A profile may include at most 50 subjects.")
        clean: list[dict[str, Any]] = []
        seen: set[str] = set()
        for index, subject in enumerate(subjects):
            if not isinstance(subject, dict):
                raise ValueError(f"subjects[{index}] must be an object.")
            subject_id = _subject_id(subject.get("subject_id"), f"subjects[{index}].subject_id")
            if subject_id in seen:
                raise ValueError("Subject IDs must be unique for a student.")
            seen.add(subject_id)
            name = _name(subject.get("subject_name"), f"subjects[{index}].subject_name")
            marks = subject.get("previous_marks")
            if isinstance(marks, bool) or not isinstance(marks, (int, float)) or not 0 <= marks <= 100:
                raise ValueError(f"subjects[{index}].previous_marks must be between 0 and 100.")
            exam_count = subject.get("exam_count")
            if isinstance(exam_count, bool) or not isinstance(exam_count, int) or not 1 <= exam_count <= 10:
                raise ValueError(f"subjects[{index}].exam_count must be a whole number from 1 to 10.")
            completed = subject.get("completed_sessions_count", 0)
            missed = subject.get("missed_sessions_count", 0)
            for key, value in (("completed_sessions_count", completed), ("missed_sessions_count", missed)):
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 120:
                    raise ValueError(f"subjects[{index}].{key} must be a whole number from 0 to 120.")
            clean.append(
                {
                    "subject_id": subject_id,
                    "subject_name": name,
                    "previous_marks": float(marks),
                    "exam_count": exam_count,
                    "completed_sessions_count": completed,
                    "missed_sessions_count": missed,
                    "deadlines": subject.get("deadlines", []),
                    "exam_date": subject.get("exam_date"),
                }
            )
            if clean[-1]["exam_date"]:
                clean[-1]["exam_date"], _ = validate_exam_date(clean[-1]["exam_date"])
        return clean

    @staticmethod
    def _validate_deadlines(
        student_id: str, subject_id: str, deadlines: Any
    ) -> list[dict[str, Any]]:
        if deadlines is None:
            return []
        if not isinstance(deadlines, list) or len(deadlines) > 30:
            raise ValueError("deadlines must be an array with no more than 30 entries.")
        validated: list[dict[str, Any]] = []
        for index, item in enumerate(deadlines):
            if not isinstance(item, dict):
                raise ValueError(f"deadlines[{index}] must be an object.")
            kind = item.get("deadline_type")
            if kind not in {"exam", "assignment"}:
                raise ValueError(f"deadlines[{index}].deadline_type must be exam or assignment.")
            title = _name(item.get("title"), f"deadlines[{index}].title")
            due = _date(item.get("due_date"), f"deadlines[{index}].due_date")
            notes = item.get("notes")
            if notes is not None and not isinstance(notes, str):
                raise ValueError(f"deadlines[{index}].notes must be text.")
            validated.append(
                {
                    "student_id": student_id,
                    "subject_id": subject_id,
                    "deadline_type": kind,
                    "title": title,
                    "due_date": due,
                    "notes": notes,
                }
            )
        return validated

    def save_profile(
        self, payload: dict[str, Any], token: str, path_student_id: str | None = None
    ) -> dict[str, Any]:
        student_id = _subject_id(
            path_student_id if path_student_id is not None else payload.get("student_id"),
            "student_id",
        )
        if path_student_id is not None and payload.get("student_id", student_id) != student_id:
            raise ValueError("The request student_id does not match the URL.")
        student_name = _name(payload.get("student_name"), "student_name")
        subjects = self._validate_subjects(payload.get("subjects"))
        owner_id = self._require_owner(token)

        for subject in subjects:
            self._validate_subject_catalog_entry(subject, owner_id, token)

        existing_student = self.store.rows(
            "students",
            access_token=token,
            filters={"student_id": _eq(student_id)},
            limit=1,
        )
        self.store.upsert(
            "students",
            {
                "student_id": student_id,
                "student_name": student_name,
                "number_of_subjects": len(subjects),
                "auth_user_id": owner_id,
            },
            access_token=token,
            conflict="student_id",
        )
        existing_subjects = self._rows(
            "student_subjects", student_id, token, filters={"active": "eq.true"}
        )
        incoming_subject_ids = {
            subject["subject_id"] for subject in subjects
        }
        saved_subjects: list[dict[str, Any]] = []
        for subject in subjects:
            sid = subject["subject_id"]
            self._ensure_subject_catalog_entry(subject, owner_id, token)
            relation = {
                "student_id": student_id,
                "subject_id": sid,
                "previous_marks": subject["previous_marks"],
                "exam_count": subject["exam_count"],
                "completed_sessions_count": subject["completed_sessions_count"],
                "missed_sessions_count": subject["missed_sessions_count"],
                "active": True,
            }
            self.store.upsert(
                "student_subjects",
                relation,
                access_token=token,
                conflict="student_id,subject_id",
            )
            saved_subjects.append(
                {key: value for key, value in subject.items() if key != "deadlines"}
            )
            deadlines = self._validate_deadlines(
                student_id, sid, subject.get("deadlines")
            )
            if "exam_date" in subject and subject["exam_date"]:
                exam_date, _ = validate_exam_date(subject["exam_date"])
                deadlines.append(
                    {
                        "student_id": student_id,
                        "subject_id": sid,
                        "deadline_type": "exam",
                        "title": "Exam",
                        "due_date": exam_date,
                        "notes": None,
                    }
                )
            self._save_deadlines(student_id, deadlines, token)
        for relation in existing_subjects:
            if str(relation.get("subject_id")) not in incoming_subject_ids:
                self.store.patch(
                    "student_subjects",
                    {"active": False},
                    access_token=token,
                    filters={
                        "student_id": _eq(student_id),
                        "subject_id": _eq(relation["subject_id"]),
                        "active": "eq.true",
                    },
                )
        return {
            "student_id": student_id,
            "student_name": student_name,
            "number_of_subjects": len(saved_subjects),
            "subjects": saved_subjects,
            "updated": bool(existing_student),
        }

    def _validate_subject_catalog_entry(
        self, subject: dict[str, Any], owner_id: str, token: str
    ) -> None:
        rows = self.store.rows(
            "subjects",
            access_token=token,
            filters={"subject_id": _eq(subject["subject_id"])},
            limit=1,
        )
        if (
            rows
            and rows[0].get("subject_name") != subject["subject_name"]
            and str(rows[0].get("created_by")) != owner_id
        ):
            raise DatabaseUnavailable(
                "This subject_id is owned by another account and has a different name.",
                409,
            )

    def _ensure_subject_catalog_entry(
        self, subject: dict[str, Any], owner_id: str, token: str
    ) -> None:
        rows = self.store.rows(
            "subjects",
            access_token=token,
            filters={"subject_id": _eq(subject["subject_id"])},
            limit=1,
        )
        if rows:
            existing = rows[0]
            if existing.get("subject_name") == subject["subject_name"]:
                return
            if str(existing.get("created_by")) != owner_id:
                raise DatabaseUnavailable(
                    "This subject_id is owned by another account and cannot be renamed.",
                    409,
                )
            updated = self.store.patch(
                "subjects",
                {"subject_name": subject["subject_name"]},
                access_token=token,
                filters={
                    "subject_id": _eq(subject["subject_id"]),
                    "created_by": _eq(owner_id),
                },
            )
            if not updated:
                raise LookupError("The owned subject catalog entry could not be updated.")
            return
        try:
            self.store.insert(
                "subjects",
                {
                    "subject_id": subject["subject_id"],
                    "subject_name": subject["subject_name"],
                    "created_by": owner_id,
                },
                access_token=token,
            )
        except DatabaseUnavailable as error:
            if error.status_code != 409:
                raise
            rows = self.store.rows(
                "subjects",
                access_token=token,
                filters={"subject_id": _eq(subject["subject_id"])},
                limit=1,
            )
            if rows and rows[0].get("subject_name") == subject["subject_name"]:
                return
            if not rows:
                raise DatabaseUnavailable(
                    "This subject_id is already in use and is not visible to this user.",
                    409,
                ) from error
            if str(rows[0].get("created_by")) == owner_id:
                updated = self.store.patch(
                    "subjects",
                    {"subject_name": subject["subject_name"]},
                    access_token=token,
                    filters={
                        "subject_id": _eq(subject["subject_id"]),
                        "created_by": _eq(owner_id),
                    },
                )
                if updated:
                    return
            raise DatabaseUnavailable(
                "This subject_id is owned by another account and has a different name.",
                409,
            ) from error

    def _save_deadlines(
        self, student_id: str, deadlines: list[dict[str, Any]], token: str
    ) -> list[dict[str, Any]]:
        if not deadlines:
            return []
        existing = self._rows("academic_deadlines", student_id, token, limit=1000)
        saved = []
        for deadline in deadlines:
            match = next(
                (
                    row for row in existing
                    if str(row.get("subject_id")) == deadline["subject_id"]
                    and row.get("deadline_type") == deadline["deadline_type"]
                    and row.get("title") == deadline["title"]
                ),
                None,
            )
            if match:
                result = self.store.patch(
                    "academic_deadlines",
                    {key: value for key, value in deadline.items() if key != "student_id"},
                    access_token=token,
                    filters={
                        "student_id": _eq(student_id),
                        "deadline_id": _eq(match["deadline_id"]),
                    },
                )
                saved.extend(result)
            else:
                result = self.store.insert(
                    "academic_deadlines", deadline, access_token=token
                )
                if result:
                    saved.append(result)
        return saved

    def get_profile(self, student_id: str, token: str) -> dict[str, Any] | None:
        student_id = _subject_id(student_id, "student_id")
        rows = self.store.rows(
            "students",
            access_token=token,
            filters={"student_id": _eq(student_id)},
            limit=1,
        )
        if not rows:
            return None
        student = rows[0]
        relations = self._rows(
            "student_subjects",
            student_id,
            token,
            filters={"active": "eq.true"},
            limit=500,
        )
        subjects = []
        for relation in relations:
            sid = str(relation["subject_id"])
            catalog = self.store.rows(
                "subjects",
                access_token=token,
                filters={"subject_id": _eq(sid)},
                limit=1,
            )
            subject = {
                **relation,
                "subject_name": catalog[0]["subject_name"] if catalog else sid,
            }
            subject["deadlines"] = [
                deadline
                for deadline in self._rows(
                    "academic_deadlines", student_id, token, limit=1000
                )
                if str(deadline.get("subject_id")) == sid
            ]
            subjects.append(subject)
        availability = self._rows(
            "student_availability",
            student_id,
            token,
            filters={"active": "eq.true"},
            limit=200,
        )
        preferences = self.store.rows(
            "study_preferences",
            access_token=token,
            filters={"student_id": _eq(student_id)},
            limit=1,
        )
        return {
            "student_id": student["student_id"],
            "student_name": student["student_name"],
            "number_of_subjects": student["number_of_subjects"],
            "subjects": subjects,
            "availability": availability,
            "preferences": preferences[0] if preferences else None,
        }

    def set_availability(
        self, student_id: str, payload: dict[str, Any], token: str
    ) -> dict[str, Any]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        periods = payload.get("periods")
        if not isinstance(periods, list) or not periods or len(periods) > 100:
            raise ValueError("periods must contain between 1 and 100 availability periods.")
        normalized = []
        for index, period in enumerate(periods):
            if not isinstance(period, dict):
                raise ValueError(f"periods[{index}] must be an object.")
            day = period.get("day_of_week")
            if isinstance(day, bool) or not isinstance(day, int) or not 0 <= day <= 6:
                raise ValueError(f"periods[{index}].day_of_week must be 0 (Monday) through 6 (Sunday).")
            start = period.get("start_time")
            end = period.get("end_time")
            try:
                start_time = datetime.strptime(str(start), "%H:%M").time()
                end_time = datetime.strptime(str(end), "%H:%M").time()
            except ValueError as error:
                raise ValueError(f"periods[{index}] times must use 24-hour HH:MM.") from error
            if start_time >= end_time:
                raise ValueError(f"periods[{index}] end_time must be after start_time.")
            normalized.append(
                {
                    "student_id": student_id,
                    "day_of_week": day,
                    "start_time": start_time.strftime("%H:%M:%S"),
                    "end_time": end_time.strftime("%H:%M:%S"),
                    "active": True,
                }
            )
        by_day: dict[int, list[tuple[datetime, datetime]]] = {}
        for period in normalized:
            day = period["day_of_week"]
            start_time = datetime.strptime(period["start_time"], "%H:%M:%S")
            end_time = datetime.strptime(period["end_time"], "%H:%M:%S")
            by_day.setdefault(day, []).append((start_time, end_time))
        for blocks in by_day.values():
            blocks.sort()
            if any(current[1] > following[0] for current, following in zip(blocks, blocks[1:])):
                raise ValueError("Availability periods on the same day cannot overlap.")

        preference = payload.get("preferred_session")
        if preference not in {"1h", "2h", "2-3h"}:
            raise ValueError("preferred_session must be 1h, 2h, or 2-3h.")
        break_minutes = payload.get("break_minutes", 10)
        if isinstance(break_minutes, bool) or not isinstance(break_minutes, int) or not 0 <= break_minutes <= 60:
            raise ValueError("break_minutes must be a whole number from 0 to 60.")

        self.store.patch(
            "student_availability",
            {"active": False},
            access_token=token,
            filters={"student_id": _eq(student_id), "active": "eq.true"},
        )
        self.store.upsert(
            "student_availability",
            normalized,
            access_token=token,
            conflict="student_id,day_of_week,start_time,end_time",
        )
        self.store.upsert(
            "study_preferences",
            {
                "student_id": student_id,
                "preferred_session": preference,
                "break_minutes": break_minutes,
            },
            access_token=token,
            conflict="student_id",
        )
        return {
            "student_id": student_id,
            "periods": normalized,
            "preferred_session": preference,
            "break_minutes": break_minutes,
        }

    def get_deadlines(self, student_id: str, token: str) -> list[dict[str, Any]]:
        return self._rows(
            "academic_deadlines",
            _subject_id(student_id, "student_id"),
            token,
            order="due_date.asc",
            limit=1000,
        )

    def add_deadlines(
        self, student_id: str, payload: dict[str, Any], token: str
    ) -> list[dict[str, Any]]:
        if self.get_profile(student_id, token) is None:
            raise LookupError("Student profile was not found.")
        sid = _subject_id(payload.get("subject_id"))
        profile = self.get_profile(student_id, token)
        if not any(str(item["subject_id"]) == sid for item in profile["subjects"]):
            raise ValueError("subject_id does not belong to this student.")
        deadlines = self._validate_deadlines(
            student_id, sid, [payload]
        )
        return self._save_deadlines(student_id, deadlines, token)

    def predict_priorities(self, student_id: str, token: str) -> list[dict[str, Any]]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        sessions = self._rows("study_sessions", student_id, token, limit=2000)
        result = []
        for subject in profile["subjects"]:
            sid = str(subject["subject_id"])
            history = [
                row for row in sessions if str(row.get("subject_id")) == sid
            ]
            completed_rows = [
                row for row in history if str(row.get("status", "")).lower() == "completed"
            ]
            missed_rows = [
                row for row in history if str(row.get("status", "")).lower() == "missed"
            ]
            completed_count = int(subject.get("completed_sessions_count") or 0) + len(completed_rows)
            missed_count = int(subject.get("missed_sessions_count") or 0) + len(missed_rows)
            hours = sum(int(row.get("duration_minutes") or 0) for row in completed_rows) / 60
            features = {
                "average_marks": float(subject["previous_marks"]),
                "exam_count": int(subject.get("exam_count") or 1),
                "total_study_hours": min(120.0, hours),
                "completed_sessions": min(120, completed_count),
                "missed_sessions": min(120, missed_count),
            }
            prediction = predict_subject(features, self.model_artifact)
            deadlines = subject.get("deadlines", [])
            future_deadlines = sorted(
                (
                    row for row in deadlines
                    if str(row.get("due_date", ""))[:10] >= date.today().isoformat()
                ),
                key=lambda row: str(row.get("due_date", "")),
            )
            factors = list(prediction["key_factors"])
            if future_deadlines:
                due = str(future_deadlines[0]["due_date"])[:10]
                due_days = (date.fromisoformat(due) - date.today()).days
                factors.append(
                    f"{future_deadlines[0]['deadline_type'].title()} deadline in {due_days} day(s); "
                    "deadline affects scheduling urgency, not the trained model score."
                )
            record = {
                "student_id": student_id,
                "subject_id": sid,
                "predicted_priority": prediction["priority"],
                "previous_marks": features["average_marks"],
                "missed_sessions_count": features["missed_sessions"],
                "reason": "; ".join(factors),
                "class_scores": prediction["class_scores"],
                "key_factors": factors,
                "recommendations": prediction["recommendations"],
                "exam_count": features["exam_count"],
                "completed_sessions_count": features["completed_sessions"],
                "total_study_hours": features["total_study_hours"],
                "deadlines": future_deadlines,
                "priority": prediction["priority"],
                "subject_name": subject["subject_name"],
                "workload_minutes": min(
                    720,
                    120
                    + int((100 - features["average_marks"]) * 4)
                    + features["exam_count"] * 20
                    + (60 if future_deadlines else 0),
                ),
            }
            self.store.upsert(
                "subject_priorities",
                {
                    key: record[key]
                    for key in (
                        "student_id",
                        "subject_id",
                        "predicted_priority",
                        "previous_marks",
                        "missed_sessions_count",
                        "reason",
                    )
                },
                access_token=token,
                conflict="student_id,subject_id",
            )
            result.append(record)
        result.sort(key=lambda item: PRIORITY_RANK[item["priority"]])
        return result

    def generate_timetable(
        self,
        student_id: str,
        payload: dict[str, Any],
        token: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        if not profile["availability"] or not profile["preferences"]:
            raise ValueError("Save availability and session preferences before generating a schedule.")
        priorities = self.predict_priorities(student_id, token)
        existing = self._rows("study_sessions", student_id, token, limit=2000)
        start_value = payload.get("start_date")
        start = (
            date.fromisoformat(_date(start_value, "start_date"))
            if start_value
            else (now.date() if now else date.today())
        )
        horizon = payload.get("horizon_days", 14)
        if isinstance(horizon, bool) or not isinstance(horizon, int) or not 1 <= horizon <= 60:
            raise ValueError("horizon_days must be a whole number from 1 to 60.")
        sessions, unscheduled = generate_schedule(
            priorities,
            profile["availability"],
            preferred_session=profile["preferences"]["preferred_session"],
            break_minutes=int(profile["preferences"]["break_minutes"]),
            existing_sessions=existing,
            start_date=start,
            horizon_days=horizon,
            now=now,
        )
        for session in sessions:
            self.store.upsert(
                "study_sessions",
                {
                    "student_id": student_id,
                    "subject_id": str(session["subject_id"]),
                    "session_date": session["session_date"],
                    "start_time": session["start_time"],
                    "end_time": session["end_time"],
                    "duration_minutes": session["duration_minutes"],
                    "status": "scheduled",
                    "reason": session["reason"],
                },
                access_token=token,
                conflict="student_id,subject_id,session_date,start_time,end_time",
                ignore_duplicates=True,
            )
        all_sessions = self._rows("study_sessions", student_id, token, limit=2000)
        horizon_end = start + timedelta(days=horizon - 1)
        in_window = [
            row for row in all_sessions
            if start.isoformat() <= str(row.get("session_date", ""))[:10] <= horizon_end.isoformat()
        ]
        return {
            "student_id": student_id,
            "start_date": start.isoformat(),
            "horizon_days": horizon,
            "sessions": sorted(
                in_window,
                key=lambda row: (row["session_date"], row["start_time"]),
            ),
            "new_sessions": len(sessions),
            "unscheduled_work": unscheduled,
            "history_note": (
                "This initial schedule uses marks, exam counts, and availability. "
                "Logged session history can inform later priority predictions."
            ),
        }

    def schedule(self, student_id: str, token: str) -> dict[str, Any]:
        all_sessions = self._rows(
            "study_sessions", _subject_id(student_id, "student_id"), token,
            order="session_date.asc,start_time.asc", limit=2000,
        )
        today = date.today().isoformat()
        upcoming = [
            session for session in all_sessions
            if str(session.get("session_date", ""))[:10] >= today
            and str(session.get("status", "")).lower() not in {"completed", "missed", "skipped"}
        ]
        past = [
            session for session in all_sessions
            if str(session.get("session_date", ""))[:10] < today
            or str(session.get("status", "")).lower() in {"completed", "missed", "skipped"}
        ]
        return {"student_id": student_id, "upcoming_sessions": upcoming, "past_sessions": past}

    def update_session_status(
        self,
        session_id: int,
        payload: dict[str, Any],
        token: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        status = payload.get("status")
        if status not in {"completed", "missed"}:
            raise ValueError("status must be completed or missed.")
        rows = self.store.rows(
            "study_sessions",
            access_token=token,
            filters={"session_id": _eq(session_id)},
            limit=1,
        )
        if not rows:
            raise LookupError("Study session was not found.")
        session = rows[0]
        if str(session.get("status", "")).lower() not in {
            "scheduled", "planned", "pending", "accepted"
        }:
            raise ValueError("Only a scheduled session can be marked completed or missed.")
        try:
            day = date.fromisoformat(str(session["session_date"])[:10])
            end = datetime.combine(day, datetime.strptime(str(session["end_time"])[:8], "%H:%M:%S").time())
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("The saved session has an invalid date or end time.") from error
        current = now or datetime.now()
        if current.tzinfo is not None:
            current = current.replace(tzinfo=None)
        if current <= end:
            raise ValueError("A session can only be marked after its scheduled end time.")
        updated = self.store.patch(
            "study_sessions",
            {
                "status": status,
                "completed_at": datetime.now(timezone.utc).isoformat() if status == "completed" else None,
            },
            access_token=token,
            filters={
                "session_id": _eq(session_id),
                "student_id": _eq(session["student_id"]),
            },
        )
        if not updated:
            raise LookupError("The session could not be updated under the current RLS policy.")
        return updated[0]

    def accept_session(self, session_id: int, token: str) -> dict[str, Any]:
        rows = self.store.rows(
            "study_sessions",
            access_token=token,
            filters={"session_id": _eq(session_id)},
            limit=1,
        )
        if not rows:
            raise LookupError("Study session was not found.")
        session = rows[0]
        status = str(session.get("status", "")).lower()
        if status == "accepted":
            return session
        if status not in {"scheduled", "planned", "pending"}:
            raise ValueError("Only a pending study session can be accepted.")
        updated = self.store.patch(
            "study_sessions",
            {"status": "accepted"},
            access_token=token,
            filters={
                "session_id": _eq(session_id),
                "student_id": _eq(session["student_id"]),
            },
        )
        if not updated:
            raise LookupError("The session could not be accepted under the current RLS policy.")
        return updated[0]

    def skip_session(
        self,
        session_id: int,
        token: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        rows = self.store.rows(
            "study_sessions",
            access_token=token,
            filters={"session_id": _eq(session_id)},
            limit=1,
        )
        if not rows:
            raise LookupError("Study session was not found.")
        session = rows[0]
        if str(session.get("status", "")).lower() not in {"scheduled", "planned", "pending"}:
            raise ValueError("Only a pending study session can be skipped.")
        session_start = datetime.combine(
            date.fromisoformat(str(session["session_date"])[:10]),
            datetime.strptime(str(session["start_time"])[:8], "%H:%M:%S").time(),
        )
        current = now or datetime.now()
        if current.tzinfo is not None:
            current = current.replace(tzinfo=None)
        if current >= session_start:
            raise ValueError("A session cannot be skipped after its scheduled start time.")
        updated = self.store.patch(
            "study_sessions",
            {"status": "skipped"},
            access_token=token,
            filters={
                "session_id": _eq(session_id),
                "student_id": _eq(session["student_id"]),
            },
        )
        if not updated:
            raise LookupError("The session could not be updated under the current RLS policy.")
        return updated[0]

    def edit_session(
        self,
        session_id: int,
        payload: dict[str, Any],
        token: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        rows = self.store.rows(
            "study_sessions",
            access_token=token,
            filters={"session_id": _eq(session_id)},
            limit=1,
        )
        if not rows:
            raise LookupError("Study session was not found.")
        session = rows[0]
        if str(session.get("status", "")).lower() not in {"scheduled", "planned", "pending"}:
            raise ValueError("Only a pending session can be edited.")
        new_date = _date(payload.get("session_date"), "session_date")
        try:
            start = datetime.strptime(str(payload.get("start_time")), "%H:%M").time()
            end = datetime.strptime(str(payload.get("end_time")), "%H:%M").time()
        except ValueError as error:
            raise ValueError("start_time and end_time must use 24-hour HH:MM.") from error
        if start >= end:
            raise ValueError("end_time must be after start_time.")
        profile = self.get_profile(str(session["student_id"]), token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        weekday = date.fromisoformat(new_date).weekday()
        valid_period = any(
            int(period["day_of_week"]) == weekday
            and datetime.strptime(str(period["start_time"])[:8], "%H:%M:%S").time() <= start
            and end <= datetime.strptime(str(period["end_time"])[:8], "%H:%M:%S").time()
            for period in profile["availability"]
        )
        if not valid_period:
            raise ValueError("The edited session must fit inside one of your available periods.")
        all_sessions = self._rows(
            "study_sessions", str(session["student_id"]), token, limit=2000
        )
        for other in all_sessions:
            if str(other.get("session_id")) == str(session_id):
                continue
            if str(other.get("session_date", ""))[:10] != new_date:
                continue
            if str(other.get("status", "")).lower() in {"completed", "missed", "skipped"}:
                continue
            other_start = datetime.strptime(str(other["start_time"])[:8], "%H:%M:%S").time()
            other_end = datetime.strptime(str(other["end_time"])[:8], "%H:%M:%S").time()
            if start < other_end and other_start < end:
                raise ValueError("The edited session would overlap another planned session.")
        current = now or datetime.now()
        if current.tzinfo is not None:
            current = current.replace(tzinfo=None)
        if datetime.combine(date.fromisoformat(new_date), start) <= current:
            raise ValueError("A session must be moved to a future start time.")
        duration = int(
            (
                datetime.combine(date.fromisoformat(new_date), end)
                - datetime.combine(date.fromisoformat(new_date), start)
            ).total_seconds()
            // 60
        )
        updated = self.store.patch(
            "study_sessions",
            {
                "session_date": new_date,
                "start_time": start.strftime("%H:%M:%S"),
                "end_time": end.strftime("%H:%M:%S"),
                "duration_minutes": duration,
            },
            access_token=token,
            filters={
                "session_id": _eq(session_id),
                "student_id": _eq(session["student_id"]),
            },
        )
        if not updated:
            raise LookupError("The session could not be updated under the current RLS policy.")
        return updated[0]

    def progress(self, student_id: str, token: str) -> dict[str, Any]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        sessions = self._rows("study_sessions", student_id, token, limit=2000)
        by_subject: dict[str, list[dict[str, Any]]] = {}
        for session in sessions:
            by_subject.setdefault(str(session.get("subject_id")), []).append(session)
        summaries = []
        total_completed = 0
        total_missed = 0
        total_minutes = 0
        for subject in profile["subjects"]:
            subject_sessions = by_subject.get(str(subject["subject_id"]), [])
            completed = sum(
                str(row.get("status", "")).lower() == "completed"
                for row in subject_sessions
            )
            missed = sum(
                str(row.get("status", "")).lower() == "missed"
                for row in subject_sessions
            )
            minutes = sum(
                int(row.get("duration_minutes") or 0)
                for row in subject_sessions
                if str(row.get("status", "")).lower() == "completed"
            )
            total_completed += completed
            total_missed += missed
            total_minutes += minutes
            summaries.append(
                {
                    "subject_id": subject["subject_id"],
                    "subject_name": subject["subject_name"],
                    "previous_marks": subject["previous_marks"],
                    "completed_sessions": completed,
                    "missed_sessions": missed,
                    "study_hours": round(minutes / 60, 2),
                }
            )
        return {
            "student_id": student_id,
            "completed_sessions": total_completed,
            "missed_sessions": total_missed,
            "study_hours": round(total_minutes / 60, 2),
            "subjects": summaries,
            "note": "Session totals reflect saved study_sessions; profile baseline aggregates are reported separately.",
            "profile_baselines": {
                subject["subject_id"]: {
                    "completed_sessions": subject.get("completed_sessions_count", 0),
                    "missed_sessions": subject.get("missed_sessions_count", 0),
                }
                for subject in profile["subjects"]
            },
        }

    def resources(
        self,
        student_id: str,
        subject_id: str,
        token: str,
        topic: str | None = None,
    ) -> dict[str, Any]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        subject = next(
            (item for item in profile["subjects"] if str(item["subject_id"]) == str(subject_id)),
            None,
        )
        if subject is None:
            raise LookupError("Subject was not found for this student.")
        priorities = self.predict_priorities(student_id, token)
        prediction = next(
            (item for item in priorities if str(item["subject_id"]) == str(subject_id)),
            None,
        )
        response = recommend_resources(
            subject["subject_name"],
            topic=topic,
            priority=prediction["priority"] if prediction else None,
        )
        response["previous_marks"] = subject["previous_marks"]
        response["reason"] = (
            "Subject-level resources are suggested because only subject-level marks "
            "are available; provide a topic for topic-specific search queries."
            if not topic
            else "Topic-specific search queries are provided; individual resources have not been verified."
        )
        for resource in response["resources"]:
            self.store.insert(
                "resource_recommendations",
                {
                    "student_id": student_id,
                    "subject_id": str(subject_id),
                    "topic": response["topic"],
                    "provider": resource["provider"],
                    "resource_type": resource["resource_type"],
                    "search_query": resource["search_query"],
                    "priority_context": response["priority_context"],
                },
                access_token=token,
            )
        response["saved_to_database"] = True
        return response

    def resource_history(
        self,
        student_id: str,
        subject_id: str,
        token: str,
    ) -> dict[str, Any]:
        profile = self.get_profile(student_id, token)
        if profile is None:
            raise LookupError("Student profile was not found.")
        subject = next(
            (
                item for item in profile["subjects"]
                if str(item["subject_id"]) == str(subject_id)
            ),
            None,
        )
        if subject is None:
            raise LookupError("Subject was not found for this student.")
        recommendations = self._rows(
            "resource_recommendations",
            _subject_id(student_id, "student_id"),
            token,
            filters={"subject_id": _eq(_subject_id(subject_id))},
            order="recommended_at.desc",
            limit=200,
        )
        return {
            "student_id": student_id,
            "subject_id": subject["subject_id"],
            "subject_name": subject["subject_name"],
            "recommendations": recommendations,
        }
