"""Backend, model, scheduler, RLS-client, and API contract tests."""

from __future__ import annotations

import base64
import csv
import io
import json
import tempfile
import unittest
import urllib.error
import urllib.parse
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import app as app_module
from db import (
    DatabaseUnavailable,
    REQUIRED_SCHEMA,
    SupabaseStore,
    _project_api_url,
    access_token_subject,
)
from generate_data import FEATURE_NAMES, PRIORITIES, generate_dataset, simulated_priority
from predict import load_model, predict_subject, validate_features
from scheduler import generate_schedule
from workflow import StudentService
from train_model import train_and_evaluate

SAMPLE_SUBJECT = {
    "subject_id": "math-1",
    "subject_name": "Mathematics",
    "previous_marks": 55.0,
    "exam_count": 2,
    "completed_sessions_count": 0,
    "missed_sessions_count": 0,
    "deadlines": [
        {
            "deadline_type": "exam",
            "title": "Midterm",
            "due_date": (date.today() + timedelta(days=14)).isoformat(),
        }
    ],
}


def user_token() -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": str(uuid4()), "role": "authenticated"}).encode()
    ).decode().rstrip("=")
    return f"e30.{payload}.signature"


class FakeStore:
    """Small stateful PostgREST substitute; never accesses a real database."""

    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.next_id = 1

    @staticmethod
    def _matches(row: dict, filters: dict[str, str]) -> bool:
        for key, expression in filters.items():
            operator, _, value = expression.partition(".")
            actual = row.get(key)
            if operator == "eq" and str(actual).lower() != value.lower():
                return False
            if operator == "gte" and str(actual) < value:
                return False
            if operator == "lte" and str(actual) > value:
                return False
        return True

    def rows(
        self,
        table,
        *,
        access_token,
        filters=None,
        columns="*",
        order=None,
        limit=500,
    ):
        rows = [
            dict(row)
            for row in self.tables.get(table, [])
            if self._matches(row, filters or {})
        ]
        if order:
            for ordering in reversed(order.split(",")):
                key, _, direction = ordering.partition(".")
                rows.sort(key=lambda row: row.get(key) or "", reverse=direction == "desc")
        return rows[:limit]

    def upsert(
        self,
        table,
        values,
        *,
        access_token,
        conflict,
        ignore_duplicates=False,
    ):
        inputs = values if isinstance(values, list) else [values]
        keys = conflict.split(",")
        result = []
        current = self.tables.setdefault(table, [])
        for item in inputs:
            match = next(
                (
                    row for row in current
                    if all(str(row.get(key)) == str(item.get(key)) for key in keys)
                ),
                None,
            )
            if match is not None:
                if ignore_duplicates:
                    result.append(dict(match))
                else:
                    match.update(item)
                    result.append(dict(match))
                continue
            row = dict(item)
            if table == "study_sessions":
                row["session_id"] = self.next_id
                self.next_id += 1
            if table == "academic_deadlines":
                row["deadline_id"] = self.next_id
                self.next_id += 1
            if table == "resource_recommendations":
                row["recommendation_id"] = self.next_id
                self.next_id += 1
            current.append(row)
            result.append(dict(row))
        return result

    def insert(self, table, values, *, access_token):
        row = dict(values)
        if table == "academic_deadlines":
            row["deadline_id"] = self.next_id
            self.next_id += 1
        self.tables.setdefault(table, []).append(row)
        return dict(row)

    def patch(self, table, values, *, access_token, filters):
        updated = []
        for row in self.tables.setdefault(table, []):
            if self._matches(row, filters):
                row.update(values)
                updated.append(dict(row))
        return updated

    def delete(self, table, *, access_token, filters):
        rows = self.tables.setdefault(table, [])
        deleted = [row for row in rows if self._matches(row, filters)]
        self.tables[table] = [row for row in rows if row not in deleted]
        return deleted


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app_module.app.config.update(TESTING=True)
        cls.client = app_module.app.test_client()
        cls.model = load_model()

    def setUp(self):
        self.store = FakeStore()
        app_module.database = self.store
        self.token = user_token()
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.service = StudentService(self.store, self.model)

    def _save_profile(self, subject=None):
        return self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "registration_number": "REG-1042",
                "subjects": [subject or SAMPLE_SUBJECT],
            },
            self.token,
        )

    def test_training_pipeline_uses_rule_labels_and_saves_pipeline(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / "synthetic.csv"
            model = Path(directory) / "model.joblib"
            counts = generate_dataset(900, 71, data)
            self.assertEqual(set(counts), set(PRIORITIES))
            with data.open(newline="", encoding="utf-8") as file:
                rows = list(csv.DictReader(file))
            self.assertTrue(all(row["priority"] == simulated_priority(row) for row in rows))
            metrics = train_and_evaluate(data, model, 71)
            self.assertEqual((metrics["train_rows"], metrics["test_rows"]), (675, 225))
            artifact = load_model(model)
            self.assertEqual(artifact["feature_names"], list(FEATURE_NAMES))
            self.assertEqual(
                set(artifact["model"].named_steps), {"imputer", "classifier"}
            )

    def test_feature_validation_and_model_scores(self):
        with self.assertRaisesRegex(ValueError, "Missing required features"):
            validate_features({"average_marks": 50})
        with self.assertRaisesRegex(ValueError, "average_marks must be between"):
            validate_features(
                {
                    "average_marks": 110,
                    "exam_count": 1,
                    "total_study_hours": 2,
                    "completed_sessions": 0,
                    "missed_sessions": 0,
                }
            )
        result = predict_subject(
            {
                "average_marks": 35,
                "exam_count": 2,
                "total_study_hours": 1,
                "completed_sessions": 0,
                "missed_sessions": 5,
            },
            self.model,
        )
        self.assertIn(result["priority"], PRIORITIES)
        self.assertEqual(set(result["class_scores"]), set(PRIORITIES))

    def test_dynamic_schedule_respects_availability_breaks_and_existing_sessions(self):
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        now = datetime.combine(date.today(), time(9))
        subjects = [
            {
                "subject_id": "weak",
                "subject_name": "Weak subject",
                "priority": "HIGH",
                "workload_minutes": 300,
            },
            {
                "subject_id": "strong",
                "subject_name": "Strong subject",
                "priority": "LOW",
                "workload_minutes": 120,
            },
        ]
        availability = [
            {
                "day_of_week": monday.weekday(),
                "start_time": "14:00:00",
                "end_time": "17:00:00",
            }
        ]
        sessions, unscheduled = generate_schedule(
            subjects,
            availability,
            preferred_session="2h",
            break_minutes=15,
            start_date=monday,
            horizon_days=1,
            now=now,
        )
        self.assertEqual(len(sessions), 1)
        session = sessions[0]
        self.assertEqual(session["start_time"], "14:00:00")
        self.assertEqual(session["duration_minutes"], 120)
        self.assertLessEqual(session["end_time"], "17:00:00")
        self.assertEqual(session["subject_id"], "weak")
        self.assertTrue(unscheduled)

        again, _ = generate_schedule(
            subjects,
            availability,
            preferred_session="2h",
            break_minutes=15,
            existing_sessions=sessions,
            start_date=monday,
            horizon_days=1,
            now=now,
        )
        self.assertEqual(again, [])

    def test_scheduler_normalizes_aware_now_to_local_wall_time(self):
        today = date.today()
        local_timezone = datetime.now().astimezone().tzinfo
        naive_now = datetime.combine(today, time(9, 30))
        aware_now = naive_now.replace(tzinfo=local_timezone).astimezone(timezone.utc)
        subjects = [
            {
                "subject_id": "math-1",
                "subject_name": "Mathematics",
                "priority": "HIGH",
                "workload_minutes": 60,
            }
        ]
        availability = [
            {
                "day_of_week": today.weekday(),
                "start_time": "08:00",
                "end_time": "12:00",
            }
        ]
        kwargs = {
            "preferred_session": "1h",
            "break_minutes": 0,
            "start_date": today,
            "horizon_days": 1,
        }

        aware_sessions, _ = generate_schedule(
            subjects, availability, now=aware_now, **kwargs
        )
        naive_sessions, _ = generate_schedule(
            subjects, availability, now=naive_now, **kwargs
        )

        self.assertEqual(aware_sessions, naive_sessions)
        self.assertEqual(aware_sessions[0]["start_time"], "09:30:00")

    def test_schedule_distributes_by_priority_and_respects_multiple_windows(self):
        start = date.today() + timedelta(days=1)
        subjects = [
            {
                "subject_id": subject_id,
                "subject_name": subject_id.title(),
                "priority": priority,
                "workload_minutes": 360,
                "deadlines": [{"due_date": (start + timedelta(days=6)).isoformat()}],
            }
            for subject_id, priority in (
                ("math", "HIGH"),
                ("physics", "MEDIUM"),
                ("history", "LOW"),
            )
        ]
        availability = [
            {
                "day_of_week": (start + timedelta(days=offset)).weekday(),
                "start_time": start_time,
                "end_time": end_time,
            }
            for offset in range(5)
            for start_time, end_time in (("09:00", "11:00"), ("14:00", "17:00"))
        ]
        sessions, _ = generate_schedule(
            subjects,
            availability,
            preferred_session="1h",
            break_minutes=15,
            start_date=start,
            horizon_days=2,
            now=datetime.combine(date.today(), time(8)),
        )
        self.assertTrue(sessions)
        counts = Counter(session["subject_id"] for session in sessions)
        self.assertGreater(counts["math"], counts["history"])
        by_date: dict[str, list[tuple[str, str]]] = {}
        for session in sessions:
            session_day = date.fromisoformat(session["session_date"])
            self.assertLessEqual(
                session_day,
                date.fromisoformat(start.isoformat()) + timedelta(days=6),
            )
            matching_windows = [
                period for period in availability
                if period["day_of_week"] == session_day.weekday()
            ]
            self.assertTrue(
                any(
                    period["start_time"] <= session["start_time"][:5]
                    and session["end_time"][:5] <= period["end_time"]
                    for period in matching_windows
                )
            )
            by_date.setdefault(session["session_date"], []).append(
                (session["start_time"], session["end_time"])
            )
        for day_sessions in by_date.values():
            ordered = sorted(day_sessions)
            self.assertTrue(
                all(left[1] <= right[0] for left, right in zip(ordered, ordered[1:]))
            )

    def test_schedule_does_not_place_work_after_infeasible_or_expired_deadline(self):
        start = date.today() + timedelta(days=2)
        due = start - timedelta(days=1)
        sessions, unscheduled = generate_schedule(
            [
                {
                    "subject_id": "essay",
                    "subject_name": "Essay",
                    "priority": "HIGH",
                    "workload_minutes": 120,
                    "deadlines": [{"due_date": due.isoformat()}],
                }
            ],
            [
                {
                    "day_of_week": start.weekday(),
                    "start_time": "10:00",
                    "end_time": "14:00",
                }
            ],
            preferred_session="1h",
            break_minutes=0,
            start_date=start,
            horizon_days=1,
            now=datetime.combine(date.today(), time(8)),
        )
        self.assertEqual(sessions, [])
        self.assertEqual(unscheduled[0]["remaining_minutes"], 120)
        self.assertIn("occurred before", unscheduled[0]["reason"])

        due_today = start + timedelta(days=1)
        sessions, unscheduled = generate_schedule(
            [
                {
                    "subject_id": "lab",
                    "subject_name": "Lab",
                    "priority": "HIGH",
                    "workload_minutes": 180,
                    "deadlines": [{"due_date": due_today.isoformat()}],
                }
            ],
            [
                {
                    "day_of_week": start.weekday(),
                    "start_time": "10:00",
                    "end_time": "11:00",
                }
            ],
            preferred_session="1h",
            break_minutes=0,
            start_date=start,
            horizon_days=3,
            now=datetime.combine(date.today(), time(8)),
        )
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["session_date"], start.isoformat())
        self.assertEqual(unscheduled[0]["remaining_minutes"], 120)
        self.assertIn("no sessions were scheduled after the deadline", unscheduled[0]["reason"])

    def test_invalid_and_insufficient_availability_is_reported(self):
        with self.assertRaisesRegex(ValueError, "must not overlap"):
            generate_schedule(
                [{"subject_id": "math", "subject_name": "Math"}],
                [
                    {"day_of_week": 0, "start_time": "09:00", "end_time": "12:00"},
                    {"day_of_week": 0, "start_time": "11:00", "end_time": "13:00"},
                ],
                preferred_session="1h",
                break_minutes=0,
                start_date=date.today() + timedelta(days=1),
            )
        start = date.today() + timedelta(days=1)
        sessions, unscheduled = generate_schedule(
            [{"subject_id": "math", "subject_name": "Math", "workload_minutes": 120}],
            [
                {
                    "day_of_week": start.weekday(),
                    "start_time": "09:00",
                    "end_time": "09:45",
                }
            ],
            preferred_session="1h",
            break_minutes=0,
            start_date=start,
            horizon_days=1,
            now=datetime.combine(date.today(), time(8)),
        )
        self.assertEqual(sessions, [])
        self.assertEqual(unscheduled[0]["remaining_minutes"], 120)
        self.assertIn("planning window", unscheduled[0]["reason"])

    def test_student_profile_repeated_upserts_do_not_duplicate_and_keep_old_subject(self):
        first = self._save_profile()
        second = self._save_profile()
        self.assertFalse(first["updated"])
        self.assertTrue(second["updated"])
        self.assertEqual(len(self.store.tables["students"]), 1)
        self.assertEqual(len(self.store.tables["student_subjects"]), 1)
        self.assertEqual(len(self.store.tables["academic_deadlines"]), 1)
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "subjects": [
                    {**SAMPLE_SUBJECT, "subject_id": "physics", "subject_name": "Physics"}
                ],
            },
            self.token,
        )
        relations = self.store.tables["student_subjects"]
        self.assertEqual(len(relations), 2)
        self.assertFalse(next(row for row in relations if row["subject_id"] == "math-1")["active"])
        self.assertEqual(
            self.store.tables["subjects"][0]["created_by"],
            access_token_subject(self.token),
        )

    def test_student_registration_topics_deadlines_and_history_are_synchronized(self):
        subject = {
            **SAMPLE_SUBJECT,
            "exam_date": (date.today() + timedelta(days=12)).isoformat(),
            "improvement_topics": "linear equations",
            "deadlines": [
                {
                    "deadline_type": "assignment",
                    "title": "Problem set",
                    "due_date": (date.today() + timedelta(days=8)).isoformat(),
                }
            ],
        }
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "registration_number": "REG-1042",
                "subjects": [subject],
            },
            self.token,
        )
        self.assertEqual(
            {
                row["deadline_type"]
                for row in self.store.tables["academic_deadlines"]
            },
            {"EXAM", "ASSIGNMENT"},
        )
        relation = self.store.tables["student_subjects"][0]
        relation["completed_sessions_count"] = 6
        relation["missed_sessions_count"] = 2

        updated_subject = {
            **{
                key: value for key, value in subject.items()
                if key not in {"completed_sessions_count", "missed_sessions_count"}
            },
            "previous_marks": 61,
            "deadlines": [],
            "exam_date": (date.today() + timedelta(days=15)).isoformat(),
        }
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "registration_number": "REG-1042",
                "subjects": [updated_subject],
            },
            self.token,
        )

        profile = self.service.get_profile("student-1", self.token)
        self.assertEqual(profile["registration_number"], "REG-1042")
        self.assertEqual(profile["subjects"][0]["improvement_topics"], "linear equations")
        self.assertEqual(profile["subjects"][0]["completed_sessions_count"], 6)
        self.assertEqual(profile["subjects"][0]["missed_sessions_count"], 2)
        deadlines = profile["subjects"][0]["deadlines"]
        self.assertEqual(len(deadlines), 1)
        self.assertEqual(deadlines[0]["deadline_type"], "EXAM")
        self.assertEqual(deadlines[0]["due_date"], updated_subject["exam_date"])

    def test_deadline_types_are_normalized_and_unknown_values_rejected_before_writes(self):
        subject = {
            **SAMPLE_SUBJECT,
            "exam_date": (date.today() + timedelta(days=12)).isoformat(),
            "deadlines": [
                {
                    "deadline_type": " assignment ",
                    "title": "Problem set",
                    "due_date": (date.today() + timedelta(days=8)).isoformat(),
                }
            ],
        }
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "registration_number": "REG-1042",
                "subjects": [subject],
            },
            self.token,
        )
        saved_types = {
            row["deadline_type"] for row in self.store.tables["academic_deadlines"]
        }
        self.assertEqual(saved_types, {"EXAM", "ASSIGNMENT"})

        invalid = {
            **subject,
            "deadlines": [
                {
                    "deadline_type": "project",
                    "title": "Project",
                    "due_date": (date.today() + timedelta(days=9)).isoformat(),
                }
            ],
        }
        with self.assertRaisesRegex(
            ValueError, "deadline_type must be EXAM or ASSIGNMENT"
        ):
            self.service.save_profile(
                {
                    "student_id": "student-2",
                    "student_name": "Another Student",
                    "registration_number": "REG-2048",
                    "subjects": [invalid],
                },
                user_token(),
            )
        self.assertEqual(len(self.store.tables["students"]), 1)
        self.assertEqual(len(self.store.tables["academic_deadlines"]), 2)

    def test_profile_update_accepts_and_preserves_past_assignment_deadlines(self):
        subject = {
            **SAMPLE_SUBJECT,
            "exam_date": (date.today() + timedelta(days=12)).isoformat(),
            "deadlines": [
                {
                    "deadline_type": "assignment",
                    "title": "Past problem set",
                    "due_date": (date.today() - timedelta(days=2)).isoformat(),
                }
            ],
        }
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "registration_number": "REG-1042",
                "subjects": [subject],
            },
            self.token,
        )

        profile = self.service.get_profile("student-1", self.token)
        assignment = next(
            item
            for item in profile["subjects"][0]["deadlines"]
            if item["deadline_type"] == "ASSIGNMENT"
        )
        self.assertEqual(assignment["title"], "Past problem set")
        self.assertEqual(
            assignment["due_date"],
            (date.today() - timedelta(days=2)).isoformat(),
        )

    def test_profile_validates_all_deadlines_before_writing(self):
        with self.assertRaisesRegex(ValueError, "valid YYYY-MM-DD"):
            self.service.save_profile(
                {
                    "student_id": "student-1",
                    "student_name": "Example Student",
                    "registration_number": "REG-1042",
                    "subjects": [
                        {
                            **SAMPLE_SUBJECT,
                            "deadlines": [
                                {
                                    "deadline_type": "assignment",
                                    "title": "Invalid date",
                                    "due_date": "not-a-date",
                                }
                            ],
                        }
                    ],
                },
                self.token,
            )
        self.assertEqual(self.store.tables.get("students", []), [])
        self.assertEqual(self.store.tables.get("subjects", []), [])

    def test_prediction_rejects_legacy_profile_missing_required_intake(self):
        self.store.upsert(
            "students",
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "number_of_subjects": 1,
                "auth_user_id": access_token_subject(self.token),
                "registration_number": None,
            },
            access_token=self.token,
            conflict="student_id",
        )
        self.store.insert(
            "subjects",
            {
                "subject_id": "math-1",
                "subject_name": "Mathematics",
                "created_by": access_token_subject(self.token),
            },
            access_token=self.token,
        )
        self.store.upsert(
            "student_subjects",
            {
                "student_id": "student-1",
                "subject_id": "math-1",
                "previous_marks": 55,
                "exam_count": 1,
                "active": True,
            },
            access_token=self.token,
            conflict="student_id,subject_id",
        )
        with self.assertRaisesRegex(ValueError, "registration number"):
            self.service.predict_priorities("student-1", self.token)
        self.assertEqual(self.store.tables.get("subject_priorities", []), [])

    def test_new_profile_requires_registration_number_and_exam_date(self):
        payload = {
            "student_id": "student-1",
            "student_name": "Example Student",
            "subjects": [SAMPLE_SUBJECT],
        }
        with self.assertRaisesRegex(ValueError, "registration_number is required"):
            self.service.save_profile(payload, self.token)
        payload["registration_number"] = "REG-1042"
        payload["subjects"] = [{**SAMPLE_SUBJECT, "deadlines": []}]
        with self.assertRaisesRegex(ValueError, "exam_date is required"):
            self.service.save_profile(payload, self.token)
        self.assertEqual(self.store.tables.get("students", []), [])

    def test_schedule_regeneration_replaces_future_plans_and_keeps_completed_history(self):
        self._save_profile()
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {"day_of_week": monday.weekday(), "start_time": "14:00", "end_time": "18:00"}
                ],
                "preferred_session": "1h",
                "break_minutes": 0,
            },
            self.token,
        )
        plan = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1, "regenerate_future": True},
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        self.assertGreaterEqual(len(plan["sessions"]), 2)
        completed = plan["sessions"][0]
        self.store.patch(
            "study_sessions",
            {"status": "completed"},
            access_token=self.token,
            filters={"session_id": f"eq.{completed['session_id']}"},
        )
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {"day_of_week": monday.weekday(), "start_time": "14:00", "end_time": "16:00"}
                ],
                "preferred_session": "1h",
                "break_minutes": 0,
            },
            self.token,
        )
        regenerated = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1, "regenerate_future": True},
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        all_sessions = self.store.tables["study_sessions"]
        self.assertTrue(any(row["session_id"] == completed["session_id"] and row["status"] == "completed" for row in all_sessions))
        self.assertLessEqual(len(regenerated["sessions"]), 2)

    def test_subject_catalog_name_conflict_is_rejected_before_new_student_write(self):
        self._save_profile()
        another_owner = user_token()
        service = StudentService(self.store, self.model)
        with self.assertRaisesRegex(DatabaseUnavailable, "owned by another account") as error:
            service.save_profile(
                {
                    "student_id": "student-2",
                    "student_name": "Another Student",
                    "registration_number": "REG-2048",
                    "subjects": [
                        {
                            **SAMPLE_SUBJECT,
                            "subject_name": "Renamed Mathematics",
                        }
                    ],
                },
                another_owner,
            )
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(len(self.store.tables["students"]), 1)

    def test_owner_can_rename_their_subject_catalog_entry(self):
        self._save_profile()
        self.service.save_profile(
            {
                "student_id": "student-1",
                "student_name": "Example Student",
                "subjects": [
                    {**SAMPLE_SUBJECT, "subject_name": "Mathematics II"}
                ],
            },
            self.token,
        )
        self.assertEqual(
            self.store.tables["subjects"][0]["subject_name"], "Mathematics II"
        )

    def test_availability_validation_and_storage(self):
        self._save_profile()
        saved = self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {"day_of_week": 0, "start_time": "14:00", "end_time": "17:00"},
                    {"day_of_week": 2, "start_time": "09:00", "end_time": "11:00"},
                ],
                "preferred_session": "2-3h",
                "break_minutes": 15,
            },
            self.token,
        )
        self.assertEqual(len(saved["periods"]), 2)
        self.assertEqual(saved["preferred_session"], "2-3h")
        with self.assertRaisesRegex(ValueError, "cannot overlap"):
            self.service.set_availability(
                "student-1",
                {
                    "periods": [
                        {"day_of_week": 0, "start_time": "14:00", "end_time": "16:00"},
                        {"day_of_week": 0, "start_time": "15:00", "end_time": "17:00"},
                    ],
                    "preferred_session": "1h",
                },
                self.token,
            )

    def test_full_schedule_tracking_and_progress(self):
        self._save_profile()
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {
                        "day_of_week": monday.weekday(),
                        "start_time": "14:00",
                        "end_time": "18:00",
                    }
                ],
                "preferred_session": "2h",
                "break_minutes": 10,
            },
            self.token,
        )
        now = datetime.combine(date.today(), time(9))
        planned = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1},
            self.token,
            now=now,
        )
        self.assertGreaterEqual(planned["new_sessions"], 1)
        first = planned["sessions"][0]
        self.assertEqual(first["session_date"], monday.isoformat())
        self.assertEqual(first["start_time"], "14:00:00")
        self.assertLessEqual(first["end_time"], "18:00:00")

        regenerated = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1},
            self.token,
            now=now,
        )
        self.assertEqual(regenerated["new_sessions"], 0)
        self.assertEqual(len(self.store.tables["study_sessions"]), planned["new_sessions"])

        session_id = first["session_id"]
        end = datetime.combine(
            monday, datetime.strptime(first["end_time"], "%H:%M:%S").time()
        )
        updated = self.service.update_session_status(
            session_id, {"status": "completed"}, self.token, now=end + timedelta(minutes=1)
        )
        self.assertEqual(updated["status"], "completed")
        progress = self.service.progress("student-1", self.token)
        self.assertEqual(progress["completed_sessions"], 1)
        self.assertEqual(progress["study_hours"], 2.0)
        saved_schedule = self.service.schedule("student-1", self.token, now=end + timedelta(minutes=1))
        self.assertTrue(
            any(
                row["session_id"] == session_id and row["status"] == "completed"
                for row in saved_schedule["past_sessions"]
            )
        )

    def test_accept_edit_skip_session_states_persist_and_respect_constraints(self):
        self._save_profile()
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        next_monday = monday + timedelta(days=7)
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {
                        "day_of_week": monday.weekday(),
                        "start_time": "14:00",
                        "end_time": "18:00",
                    }
                ],
                "preferred_session": "1h",
                "break_minutes": 0,
            },
            self.token,
        )
        plan = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1},
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        self.assertGreaterEqual(len(plan["sessions"]), 4)
        first, second, third, fourth = plan["sessions"][:4]

        accepted = self.service.accept_session(first["session_id"], self.token)
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(
            self.service.accept_session(first["session_id"], self.token)["status"],
            "accepted",
        )
        completed = self.service.update_session_status(
            first["session_id"],
            {"status": "completed"},
            self.token,
            now=datetime.combine(monday, time(18)),
        )
        self.assertEqual(completed["status"], "completed")

        skipped = self.service.skip_session(
            second["session_id"],
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        self.assertEqual(skipped["status"], "skipped")

        edited = self.service.edit_session(
            third["session_id"],
            {
                "session_date": next_monday.isoformat(),
                "start_time": "14:00",
                "end_time": "15:00",
            },
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        self.assertEqual(edited["session_date"], next_monday.isoformat())
        self.assertEqual(edited["duration_minutes"], 60)
        with self.assertRaisesRegex(ValueError, "overlap"):
            self.service.edit_session(
                fourth["session_id"],
                {
                    "session_date": next_monday.isoformat(),
                    "start_time": "14:30",
                    "end_time": "15:30",
                },
                self.token,
                now=datetime.combine(date.today(), time(9)),
            )

    def test_accepted_sessions_block_new_overlapping_slots(self):
        start = date.today() + timedelta(days=1)
        sessions, _ = generate_schedule(
            [
                {
                    "subject_id": "math",
                    "subject_name": "Math",
                    "priority": "HIGH",
                    "workload_minutes": 120,
                }
            ],
            [
                {
                    "day_of_week": start.weekday(),
                    "start_time": "14:00",
                    "end_time": "16:00",
                }
            ],
            preferred_session="1h",
            break_minutes=0,
            existing_sessions=[
                {
                    "subject_id": "math",
                    "session_date": start.isoformat(),
                    "start_time": "14:00:00",
                    "end_time": "15:00:00",
                    "status": "accepted",
                }
            ],
            start_date=start,
            horizon_days=1,
            now=datetime.combine(date.today(), time(8)),
        )
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["start_time"], "15:00:00")

    def test_session_status_cannot_be_recorded_before_end(self):
        self._save_profile()
        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {"day_of_week": monday.weekday(), "start_time": "14:00", "end_time": "16:00"}
                ],
                "preferred_session": "2h",
            },
            self.token,
        )
        plan = self.service.generate_timetable(
            "student-1",
            {"start_date": monday.isoformat(), "horizon_days": 1},
            self.token,
            now=datetime.combine(date.today(), time(9)),
        )
        with self.assertRaisesRegex(ValueError, "after its scheduled end"):
            self.service.update_session_status(
                plan["sessions"][0]["session_id"],
                {"status": "missed"},
                self.token,
                now=datetime.combine(monday, time(14, 30)),
            )

    def test_resource_queries_do_not_invent_unverified_urls(self):
        self._save_profile()
        result = self.service.resources("student-1", "math-1", self.token, "quadratic equations")
        self.assertEqual(result["scope"], "topic")
        self.assertTrue(result["saved_to_database"])
        self.assertTrue(result["resources"])
        self.assertTrue(all(resource["search_url"].startswith("https://www.google.com/search?") for resource in result["resources"]))
        self.assertTrue(all("quadratic" in resource["title"] for resource in result["resources"]))
        saved = self.store.tables["resource_recommendations"]
        self.assertEqual(len(saved), len(result["resources"]))
        self.assertEqual(saved[0]["topic"], "quadratic equations")
        self.assertEqual(saved[0]["student_id"], "student-1")
        self.assertIn("has been checked", result["message"])
        history = self.service.resource_history("student-1", "math-1", self.token)
        self.assertEqual(len(history["recommendations"]), len(result["resources"]))
        self.assertEqual(history["subject_id"], "math-1")
        self.assertTrue(all("search_url" in item for item in history["recommendations"]))

    def test_schedule_marks_only_expired_pending_sessions_missed(self):
        now = datetime.combine(date.today(), time(15))
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        today = date.today().isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        self.store.tables["study_sessions"] = [
            {
                "session_id": 1,
                "student_id": "student-1",
                "subject_id": "math-1",
                "session_date": yesterday,
                "start_time": "13:00:00",
                "end_time": "14:00:00",
                "duration_minutes": 60,
                "status": "scheduled",
            },
            {
                "session_id": 2,
                "student_id": "student-1",
                "subject_id": "math-1",
                "session_date": today,
                "start_time": "15:00:00",
                "end_time": "16:00:00",
                "duration_minutes": 60,
                "status": "scheduled",
            },
            {
                "session_id": 3,
                "student_id": "student-1",
                "subject_id": "math-1",
                "session_date": tomorrow,
                "start_time": "13:00:00",
                "end_time": "14:00:00",
                "duration_minutes": 60,
                "status": "scheduled",
            },
            {
                "session_id": 4,
                "student_id": "student-1",
                "subject_id": "math-1",
                "session_date": yesterday,
                "start_time": "15:00:00",
                "end_time": "16:00:00",
                "duration_minutes": 60,
                "status": "completed",
            },
        ]

        result = self.service.schedule("student-1", self.token, now=now)
        saved_statuses = {
            row["session_id"]: row["status"]
            for row in self.store.tables["study_sessions"]
        }
        self.assertEqual(saved_statuses, {1: "missed", 2: "scheduled", 3: "scheduled", 4: "completed"})
        self.assertEqual(
            {row["session_id"] for row in result["upcoming_sessions"]},
            {2, 3},
        )
        self.assertIn(1, {row["session_id"] for row in result["past_sessions"]})

    def test_cors_headers_are_limited_to_configured_frontend_origins(self):
        with patch.dict("os.environ", {
            "FRONTEND_ORIGINS": "https://study.example, https://preview.example"
        }):
            allowed = self.client.options(
                "/api/v1/health",
                headers={
                    "Origin": "https://study.example",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            )
            denied = self.client.get(
                "/api/v1/students/student-1",
                headers={"Origin": "https://other.example"},
            )
        self.assertEqual(
            allowed.headers.get("Access-Control-Allow-Origin"),
            "https://study.example",
        )
        self.assertIn(
            "Authorization",
            allowed.headers.get("Access-Control-Allow-Headers", ""),
        )
        self.assertIsNone(denied.headers.get("Access-Control-Allow-Origin"))

    def test_http_endpoints_require_auth_and_validate_json(self):
        response = self.client.get("/api/v1/students/student-1")
        self.assertEqual(response.status_code, 401)
        self.assertIn("error", response.get_json())
        malformed_auth = self.client.get(
            "/api/v1/students/student-1",
            headers={"Authorization": "Basic invalid"},
        )
        self.assertEqual(malformed_auth.status_code, 401)
        response = self.client.post("/api/v1/students", data="{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Malformed JSON", response.get_json()["error"]["message"])

    def test_schedule_endpoint_handles_aware_current_time_with_local_availability(self):
        self._save_profile()
        self.service.set_availability(
            "student-1",
            {
                "periods": [
                    {
                        "day_of_week": date.today().weekday(),
                        "start_time": "00:00",
                        "end_time": "23:59",
                    }
                ],
                "preferred_session": "1h",
                "break_minutes": 0,
            },
            self.token,
        )

        response = self.client.post(
            "/api/v1/students/student-1/schedule",
            json={"start_date": date.today().isoformat(), "horizon_days": 1},
            headers=self.headers,
        )

        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertEqual(response.get_json()["start_date"], date.today().isoformat())

    def test_http_end_to_end_profile_availability_prediction_schedule_progress_resources(self):
        payload = {
            "student_id": "student-1",
            "student_name": "Example Student",
            "registration_number": "REG-1042",
            "subjects": [{**SAMPLE_SUBJECT, "improvement_topics": "linear equations"}],
        }
        headers = {**self.headers, "Content-Type": "application/json"}
        created = self.client.post(
            "/api/v1/students", json=payload, headers=headers
        )
        self.assertEqual(created.status_code, 201)
        updated = self.client.put(
            "/api/v1/students/student-1", json=payload, headers=headers
        )
        self.assertEqual(updated.status_code, 200)
        profile = self.client.get(
            "/api/v1/students/student-1", headers=self.headers
        )
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.get_json()["registration_number"], "REG-1042")
        self.assertEqual(profile.get_json()["subjects"][0]["subject_name"], "Mathematics")
        self.assertEqual(profile.get_json()["subjects"][0]["improvement_topics"], "linear equations")

        monday = date.today() + timedelta(days=(7 - date.today().weekday()) % 7)
        if monday == date.today():
            monday += timedelta(days=7)
        availability = self.client.put(
            "/api/v1/students/student-1/availability",
            json={
                "periods": [
                    {
                        "day_of_week": monday.weekday(),
                        "start_time": "14:00",
                        "end_time": "18:00",
                    }
                ],
                "preferred_session": "2h",
                "break_minutes": 10,
            },
            headers=headers,
        )
        self.assertEqual(availability.status_code, 200)
        priorities = self.client.post(
            "/api/v1/students/student-1/priorities", headers=self.headers
        )
        self.assertEqual(priorities.status_code, 200)
        self.assertIn("score_note", priorities.get_json())
        self.assertEqual(priorities.get_json()["predictions"][0]["priority"], "MEDIUM")

        schedule = self.client.post(
            "/api/v1/students/student-1/schedule",
            json={"start_date": monday.isoformat(), "horizon_days": 1, "regenerate_future": True},
            headers=headers,
        )
        self.assertEqual(schedule.status_code, 200)
        self.assertGreaterEqual(schedule.get_json()["new_sessions"], 1)
        self.assertEqual(
            schedule.get_json()["sessions"][0]["session_date"], monday.isoformat()
        )
        first_session_id = schedule.get_json()["sessions"][0]["session_id"]
        accepted = self.client.post(
            f"/api/v1/sessions/{first_session_id}/accept",
            headers=self.headers,
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.get_json()["status"], "accepted")
        saved_session = next(
            row for row in self.store.tables["study_sessions"]
            if row["session_id"] == first_session_id
        )
        saved_session.update(
            {
                "session_date": (date.today() - timedelta(days=1)).isoformat(),
                "start_time": "13:00:00",
                "end_time": "14:00:00",
            }
        )
        completed = self.client.patch(
            f"/api/v1/sessions/{first_session_id}/status",
            json={"status": "completed"},
            headers=headers,
        )
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.get_json()["status"], "completed")
        saved_schedule = self.client.get(
            "/api/v1/students/student-1/schedule", headers=self.headers
        )
        self.assertTrue(
            any(
                row["session_id"] == first_session_id and row["status"] == "completed"
                for row in saved_schedule.get_json()["past_sessions"]
            )
        )
        saved_progress = self.client.get(
            "/api/v1/students/student-1/progress", headers=self.headers
        )
        self.assertEqual(saved_progress.get_json()["completed_sessions"], 1)
        self.assertGreaterEqual(saved_progress.get_json()["total_sessions"], 1)
        self.assertEqual(
            self.client.get(
                "/api/v1/students/student-1/schedule", headers=self.headers
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/students/student-1/progress", headers=self.headers
            ).status_code,
            200,
        )
        resources = self.client.post(
            "/api/v1/students/student-1/subjects/math-1/resources",
            json={"topic": "fractions"},
            headers=headers,
        )
        self.assertEqual(resources.status_code, 200)
        self.assertEqual(resources.get_json()["scope"], "topic")
        self.assertTrue(resources.get_json()["resources"][0]["title"])
        self.assertTrue(resources.get_json()["resources"][0]["search_url"].startswith("https://www.google.com/search?"))
        resource_history = self.client.get(
            "/api/v1/students/student-1/subjects/math-1/resources",
            headers=self.headers,
        )
        self.assertEqual(resource_history.status_code, 200)
        self.assertTrue(resource_history.get_json()["recommendations"])
        self.assertTrue(resource_history.get_json()["recommendations"][0]["search_url"])

    def test_supabase_api_client_uses_user_bearer_not_server_key(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        token = user_token()
        captured = {}

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b"[]"

        def fake_open(request, timeout):
            captured["headers"] = dict(request.header_items())
            captured["url"] = request.full_url
            return Response()

        with patch("urllib.request.urlopen", side_effect=fake_open):
            store.rows("students", access_token=token, filters={"student_id": "eq.a"})
        headers = {key.lower(): value for key, value in captured["headers"].items()}
        self.assertEqual(headers["apikey"], "sb_publishable_project_key")
        self.assertEqual(headers["authorization"], f"Bearer {token}")
        self.assertNotIn("sb_publishable_project_key", headers["authorization"])
        self.assertEqual(
            urllib.parse.urlparse(captured["url"]).path, "/rest/v1/students"
        )

    def test_schema_probe_requires_backend_secret_key_and_does_not_claim_connection(self):
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": ""}):
            store = SupabaseStore(
                base_url="https://abc12345678901234567.supabase.co",
                api_key="sb_publishable_project_key",
            )
        result = store.schema_health()
        self.assertTrue(result["configured"])
        self.assertFalse(result["connected"])
        self.assertFalse(result["schema_ready"])
        self.assertEqual(result["failure"], "configuration")
        self.assertIn("SUPABASE_SECRET_KEY", result["message"])

    def test_health_endpoint_returns_unhealthy_status_when_schema_probe_unconfigured(self):
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": ""}):
            app_module.database = SupabaseStore(
                base_url="https://abc12345678901234567.supabase.co",
                api_key="sb_publishable_project_key",
            )
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["status"], "degraded")
        self.assertFalse(response.get_json()["database"]["connected"])
        self.assertEqual(response.get_json()["database"]["failure"], "configuration")

    def test_schema_probe_uses_secret_key_only_as_apikey(self):
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": "sb_secret_health_only"}):
            store = SupabaseStore(
                base_url="https://abc12345678901234567.supabase.co",
                api_key="sb_publishable_project_key",
            )
        captured = {}

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b'{"definitions":{}}'

        def fake_open(request, timeout):
            captured["headers"] = {
                key.lower(): value for key, value in request.header_items()
            }
            return Response()

        with patch("urllib.request.urlopen", side_effect=fake_open):
            result = store.schema_health()
        self.assertTrue(result["connected"])
        self.assertFalse(result["schema_ready"])
        self.assertEqual(result["failure"], "schema")
        self.assertEqual(captured["headers"]["apikey"], "sb_secret_health_only")
        self.assertNotIn("authorization", captured["headers"])
        self.assertEqual(set(REQUIRED_SCHEMA), set(result["missing_schema"]))

    def test_schema_probe_marks_all_required_columns_ready(self):
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": "sb_secret_health_only"}):
            store = SupabaseStore(
                base_url="https://abc12345678901234567.supabase.co",
                api_key="sb_publishable_project_key",
            )

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                definitions = {
                    table: {"properties": {column: {} for column in columns}}
                    for table, columns in REQUIRED_SCHEMA.items()
                }
                return json.dumps({"definitions": definitions}).encode("utf-8")

        with patch("urllib.request.urlopen", return_value=Response()):
            result = store.schema_health()
        self.assertTrue(result["configured"])
        self.assertTrue(result["connected"])
        self.assertTrue(result["schema_ready"])
        self.assertIsNone(result["failure"])
        self.assertEqual(result["missing_schema"], {})

    def test_supabase_permission_rls_and_invalid_token_errors_are_distinguished(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        cases = (
            (
                403,
                {"code": "42501", "message": "permission denied for table academic_deadlines"},
                "permission",
                "authenticated role lacks database privileges",
            ),
            (
                403,
                {"code": "42501", "message": "new row violates row-level security policy"},
                "authorization",
                "Row Level Security denied",
            ),
            (
                401,
                {"code": "PGRST301", "message": "JWT expired"},
                "authentication",
                "rejected the request credentials",
            ),
            (
                400,
                {
                    "code": "42P10",
                    "message": "there is no unique or exclusion constraint matching the ON CONFLICT specification",
                },
                "schema",
                "upsert conflict target has no matching unique index",
            ),
        )
        for status, payload, expected_kind, expected_message in cases:
            with self.subTest(kind=expected_kind):
                error = urllib.error.HTTPError(
                    "https://supabase.invalid/rest/v1/academic_deadlines",
                    status,
                    "denied",
                    {},
                    io.BytesIO(json.dumps(payload).encode("utf-8")),
                )
                with patch("urllib.request.urlopen", side_effect=error):
                    with self.assertRaises(DatabaseUnavailable) as raised:
                        store.rows(
                            "academic_deadlines",
                            access_token=self.token,
                            filters={"student_id": "eq.private-student-id"},
                        )
                self.assertEqual(raised.exception.kind, expected_kind)
                self.assertIn(expected_message, str(raised.exception))
                self.assertNotIn("private-student-id", str(raised.exception))
                self.assertNotIn("JWT expired", str(raised.exception))

    def test_supabase_connection_failure_is_classified(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        with patch(
            "urllib.request.urlopen",
            side_effect=urllib.error.URLError("temporary network failure"),
        ):
            with self.assertRaises(DatabaseUnavailable) as raised:
                store.rows("students", access_token=self.token)
        self.assertEqual(raised.exception.kind, "connection")
        self.assertEqual(raised.exception.status_code, 503)

    def test_missing_postgrest_column_is_a_schema_failure(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        error = urllib.error.HTTPError(
            "https://supabase.invalid/rest/v1/academic_deadlines",
            400,
            "schema cache miss",
            {},
            io.BytesIO(
                json.dumps(
                    {
                        "code": "PGRST204",
                        "message": "Column not found in schema cache",
                    }
                ).encode("utf-8")
            ),
        )
        with patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaises(DatabaseUnavailable) as raised:
                store.rows("academic_deadlines", access_token=self.token)
        self.assertEqual(raised.exception.kind, "schema")
        self.assertEqual(raised.exception.status_code, 503)

    def test_http_route_returns_safe_errors_for_invalid_token_and_rls_denial(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        app_module.database = store
        cases = (
            (
                401,
                {"code": "PGRST301", "message": "JWT expired"},
                "rejected the request credentials",
            ),
            (
                403,
                {"code": "42501", "message": "new row violates row-level security policy"},
                "Row Level Security denied",
            ),
        )
        for status, payload, expected_message in cases:
            with self.subTest(status=status):
                error = urllib.error.HTTPError(
                    "https://supabase.invalid/rest/v1/students",
                    status,
                    "denied",
                    {},
                    io.BytesIO(json.dumps(payload).encode("utf-8")),
                )
                with patch("urllib.request.urlopen", side_effect=error):
                    response = self.client.get(
                        "/api/v1/students/student-1",
                        headers=self.headers,
                    )
                self.assertEqual(response.status_code, status)
                self.assertIn(
                    expected_message,
                    response.get_json()["error"]["message"],
                )

    def test_rls_hidden_student_is_returned_as_not_found(self):
        store = SupabaseStore(
            base_url="https://abc12345678901234567.supabase.co",
            api_key="sb_publishable_project_key",
        )
        app_module.database = store

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self):
                return b"[]"

        with patch("urllib.request.urlopen", return_value=Response()) as request:
            response = self.client.get(
                "/api/v1/students/another-student",
                headers=self.headers,
            )
            foreign_resources = self.client.get(
                "/api/v1/students/another-student/subjects/math-1/resources",
                headers=self.headers,
            )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(foreign_resources.status_code, 404)
        self.assertEqual(
            response.get_json()["error"]["message"],
            "Student profile was not found.",
        )
        sent_headers = {
            key.lower(): value for key, value in request.call_args.args[0].header_items()
        }
        self.assertTrue(sent_headers["authorization"].startswith("Bearer "))
        self.assertEqual(
            sent_headers["authorization"].partition(" ")[2],
            self.headers["Authorization"].partition(" ")[2],
        )
        self.assertEqual(sent_headers["authorization"], self.headers["Authorization"])

    def test_workflow_rls_migration_fences_each_student_table_to_its_auth_owner(self):
        migration_path = (
            Path(__file__).resolve().parents[1]
            / "sql"
            / "07_workflow_integrity_repair.sql"
        )
        migration = migration_path.read_text(encoding="utf-8")
        workflow_tables = {
            "student_subjects",
            "student_availability",
            "study_preferences",
            "resource_recommendations",
            "academic_deadlines",
            "subject_priorities",
            "study_sessions",
            "study_goals",
            "notifications",
        }
        for table in workflow_tables:
            with self.subTest(table=table):
                self.assertIn(f"'{table}'", migration)
                self.assertIn(f"ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY", migration)
        self.assertIn("s.auth_user_id = (SELECT auth.uid())", migration)
        self.assertIn("USING (auth_user_id = (SELECT auth.uid()))", migration)
        self.assertIn("AS RESTRICTIVE FOR ALL TO authenticated", migration)
        self.assertIn("WITH CHECK (%s)", migration)
        self.assertNotIn("DISABLE ROW LEVEL SECURITY", migration)
        self.assertNotIn("TO anon", migration)

    def test_workflow_integrity_migration_checks_duplicates_and_upsert_keys(self):
        migration_path = (
            Path(__file__).resolve().parents[1]
            / "sql"
            / "07_workflow_integrity_repair.sql"
        )
        migration = migration_path.read_text(encoding="utf-8")
        targets = (
            (
                "student_availability",
                "student_id', 'day_of_week', 'start_time', 'end_time",
            ),
            ("student_subjects", "student_id', 'subject_id"),
            ("subject_priorities", "student_id', 'subject_id"),
            (
                "study_sessions",
                "student_id', 'subject_id', 'session_date', 'start_time', 'end_time",
            ),
        )
        for table, columns in targets:
            with self.subTest(table=table):
                self.assertIn(f"'{table}'", migration)
                self.assertIn(columns, migration)
        self.assertIn("HAVING count(*) > 1", migration)
        self.assertIn("RAISE EXCEPTION", migration)
        self.assertIn("CREATE UNIQUE INDEX %I", migration)
        self.assertIn("ON public.%I (%s)", migration)
        self.assertNotIn("DELETE FROM", migration.upper())
        self.assertNotIn("DROP TABLE", migration.upper())

    def test_dashboard_url_is_normalized_without_exposing_project_reference(self):
        result = _project_api_url(
            "https://supabase.com/dashboard/project/abcdefghijklmnopqrst/editor"
        )
        self.assertEqual(result, "https://abcdefghijklmnopqrst.supabase.co")


if __name__ == "__main__":
    unittest.main()
