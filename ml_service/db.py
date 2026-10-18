"""Supabase PostgREST persistence using per-user JWTs and existing tables."""

from __future__ import annotations

import base64
import binascii
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


TABLE_COLUMNS = {
    "students": {
        "student_id", "student_name", "number_of_subjects", "auth_user_id",
        "registration_number",
    },
    "subjects": {"subject_id", "subject_name", "created_by"},
    "student_subjects": {
        "student_id", "subject_id", "previous_marks", "exam_count",
        "completed_sessions_count", "missed_sessions_count", "improvement_topics",
        "active"
    },
    "student_availability": {
        "availability_id", "student_id", "day_of_week", "start_time", "end_time",
        "active",
    },
    "study_preferences": {
        "student_id", "preferred_session", "break_minutes", "updated_at"
    },
    "resource_recommendations": {
        "recommendation_id", "student_id", "subject_id", "topic", "provider",
        "resource_type", "search_query", "priority_context", "recommended_at",
    },
    "academic_deadlines": {
        "deadline_id", "student_id", "subject_id", "deadline_type", "title",
        "due_date", "notes",
    },
    "subject_priorities": {
        "prediction_id", "student_id", "subject_id", "predicted_priority",
        "previous_marks", "missed_sessions_count", "reason", "predicted_at",
    },
    "study_sessions": {
        "session_id", "student_id", "subject_id", "session_date", "start_time",
        "end_time", "duration_minutes", "status", "completed_at", "reason",
    },
    "study_goals": {
        "goal_id", "student_id", "goal_description", "target_date", "status"
    },
    "notifications": {
        "notification_id", "student_id", "message", "alert_at", "status"
    },
}

REQUIRED_SCHEMA = {
    table: columns for table, columns in TABLE_COLUMNS.items()
}

logger = logging.getLogger(__name__)


class DatabaseUnavailable(RuntimeError):
    """Supabase is not configured, reachable, authorized, or schema-ready."""

    def __init__(
        self, message: str, status_code: int = 503, *, kind: str = "database"
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.kind = kind


def load_environment_file(path: Path | None = None) -> None:
    """Load local KEY=value settings without logging or replacing shell values."""
    env_path = path or Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if name:
            os.environ.setdefault(name, value)


def _project_api_url(raw_url: str) -> str:
    parsed = urllib.parse.urlparse(raw_url.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise DatabaseUnavailable("SUPABASE_URL must be a valid HTTP(S) URL.", 503)
    if parsed.hostname in {"supabase.com", "www.supabase.com"}:
        parts = [part for part in parsed.path.split("/") if part]
        if "project" not in parts:
            raise DatabaseUnavailable(
                "SUPABASE_URL points to the Supabase dashboard, not a project.",
                503,
            )
        index = parts.index("project")
        if index + 1 >= len(parts) or not re.fullmatch(r"[a-z0-9]{20}", parts[index + 1]):
            raise DatabaseUnavailable(
                "The dashboard URL does not contain a recognizable project reference.",
                503,
            )
        parsed = urllib.parse.urlparse(f"https://{parts[index + 1]}.supabase.co")
    if parsed.hostname and parsed.hostname.endswith(".supabase.co"):
        if parsed.scheme != "https":
            raise DatabaseUnavailable("Supabase project URLs must use HTTPS.", 503)
        if parsed.path not in {"", "/", "/rest/v1"}:
            raise DatabaseUnavailable(
                "SUPABASE_URL must be a project URL or a Supabase dashboard project URL.",
                503,
            )
        return f"https://{parsed.hostname}"
    return raw_url.strip().rstrip("/")


def access_token_subject(access_token: str) -> str:
    """Read the JWT subject for an RLS-bound row; PostgREST validates the JWT."""
    parts = access_token.split(".")
    if len(parts) != 3:
        raise DatabaseUnavailable("A valid Supabase user access token is required.", 401)
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
        subject = claims.get("sub")
    except (
        ValueError,
        TypeError,
        AttributeError,
        UnicodeDecodeError,
        binascii.Error,
        json.JSONDecodeError,
    ) as error:
        raise DatabaseUnavailable("The Supabase access token is malformed.", 401) from error
    if not isinstance(subject, str) or not subject:
        raise DatabaseUnavailable("The Supabase access token has no user subject.", 401)
    return subject


class SupabaseStore:
    """Small PostgREST client; all student data calls use the caller's JWT."""

    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        load_environment_file()
        raw_url = base_url if base_url is not None else os.getenv("SUPABASE_URL", "")
        key = api_key if api_key is not None else os.getenv("SUPABASE_KEY", "")
        if not raw_url or not key:
            raise DatabaseUnavailable(
                "Set SUPABASE_URL and SUPABASE_KEY in ml_service/.env.", 503
            )
        self.base_url = _project_api_url(raw_url)
        self.api_key = key
        self.schema_api_key = os.getenv("SUPABASE_SECRET_KEY", "").strip()
        self._schema_cache: dict[str, set[str]] | None = None

    @property
    def ready(self) -> bool:
        return bool(self.base_url and self.api_key)

    def _request(
        self,
        method: str,
        path: str,
        *,
        access_token: str | None = None,
        query: dict[str, Any] | None = None,
        payload: dict[str, Any] | list[dict[str, Any]] | None = None,
        prefer: str | None = None,
        allow_empty: bool = False,
        api_key_override: str | None = None,
    ) -> Any:
        if path not in {"/"}:
            table = path.strip("/")
            if table not in TABLE_COLUMNS:
                raise DatabaseUnavailable("Unknown Supabase resource.", 400)
        if access_token is None:
            if not allow_empty:
                raise DatabaseUnavailable(
                    "A Supabase user access token is required; use Authorization: Bearer <token>.",
                    401,
                )
            bearer = None
        else:
            bearer = access_token

        url = f"{self.base_url}/rest/v1{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        headers = {
            "apikey": api_key_override or self.api_key,
            "Accept": "application/json",
        }
        if bearer is not None:
            headers["Authorization"] = f"Bearer {bearer}"
        body = None
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer

        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            status = error.code
            try:
                error_payload = json.loads(error.read().decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                error_payload = {}
            if not isinstance(error_payload, dict):
                error_payload = {}
            code = error_payload.get("code")
            detail = str(error_payload.get("message", "")).lower()
            if status == 401:
                kind = "authentication"
                if api_key_override:
                    message = (
                        "Supabase rejected the backend schema-check key. Verify "
                        "SUPABASE_SECRET_KEY is a valid secret API key for this project."
                    )
                else:
                    message = (
                        "Supabase rejected the request credentials. Verify the signed-in "
                        "user token and project API key belong to the configured project."
                    )
            elif status == 403:
                if "permission denied for table" in detail or "permission denied for sequence" in detail:
                    kind = "permission"
                    message = (
                        "Supabase authenticated role lacks database privileges for "
                        "this operation. Apply the authenticated-data privileges migration."
                    )
                elif "row-level security" in detail:
                    kind = "authorization"
                    message = (
                        "Supabase Row Level Security denied this operation. Verify the "
                        "student ownership mapping and owner-scoped policies."
                    )
                else:
                    kind = "authorization"
                    message = (
                        "Supabase denied this operation. Verify authenticated-role "
                        "privileges and the owner-scoped Row Level Security policy."
                    )
            elif status == 404:
                kind = "schema"
                message = (
                    "A required Supabase table, column, or API endpoint was not found. "
                    "Check the backend schema migration."
                )
            elif code in {"PGRST204", "PGRST205", "PGRST202", "42703", "42P01"}:
                kind = "schema"
                message = (
                    "A required Supabase table or column is missing. Apply the "
                    "backend schema migration and reload the PostgREST schema cache."
                )
            elif code == "42P10":
                kind = "schema"
                message = (
                    "The Supabase upsert conflict target has no matching unique "
                    "index. Run the workflow integrity migration after checking "
                    "for duplicate records."
                )
            elif status == 409:
                kind = "conflict"
                message = "A Supabase uniqueness constraint rejected a duplicate record."
            else:
                kind = "database"
                message = f"Supabase request failed with HTTP {status}."
            logger.warning(
                "Supabase request failed method=%s resource=%s status=%s code=%s kind=%s",
                method,
                path.strip("/") or "openapi",
                status,
                code if isinstance(code, str) else "unknown",
                kind,
            )
            raise DatabaseUnavailable(
                message,
                503 if status >= 500 or kind == "schema" else status,
                kind=kind,
            ) from error
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            logger.warning(
                "Supabase request failed method=%s resource=%s kind=connection error=%s",
                method,
                path.strip("/") or "openapi",
                type(error).__name__,
            )
            raise DatabaseUnavailable(
                "Supabase could not be reached. Check the project URL and network.",
                503,
                kind="connection",
            ) from error

        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise DatabaseUnavailable(
                "Supabase returned an invalid JSON response.", 502, kind="response"
            ) from error

    def schema(self, refresh: bool = False) -> dict[str, set[str]]:
        if self._schema_cache is not None and not refresh:
            return self._schema_cache
        if not self.schema_api_key:
            raise DatabaseUnavailable(
                "Set SUPABASE_SECRET_KEY on the backend to check PostgREST "
                "connectivity and schema readiness. Keep it server-side.",
                503,
                kind="configuration",
            )
        spec = self._request(
            "GET",
            "/",
            allow_empty=True,
            api_key_override=self.schema_api_key,
        )
        schemas = spec.get("definitions", spec.get("components", {}).get("schemas", {}))
        available: dict[str, set[str]] = {}
        for name, definition in schemas.items():
            properties = definition.get("properties", {})
            if name in TABLE_COLUMNS:
                available[name] = set(properties)
        self._schema_cache = available
        return available

    def schema_health(self) -> dict[str, Any]:
        try:
            schema = self.schema(refresh=True)
        except DatabaseUnavailable as error:
            return {
                "configured": True,
                "connected": False,
                "schema_ready": False,
                "message": str(error),
                "failure": error.kind,
            }
        missing = {
            table: sorted(columns - schema.get(table, set()))
            for table, columns in REQUIRED_SCHEMA.items()
            if columns - schema.get(table, set())
        }
        return {
            "configured": True,
            "connected": True,
            "schema_ready": not missing,
            "tables_visible": sorted(schema),
            "missing_schema": missing,
            "failure": "schema" if missing else None,
        }

    def rows(
        self,
        table: str,
        *,
        access_token: str,
        filters: dict[str, str] | None = None,
        columns: str = "*",
        order: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        if table not in TABLE_COLUMNS:
            raise DatabaseUnavailable("Unknown Supabase resource.", 400)
        query: dict[str, Any] = {"select": columns, "limit": str(limit)}
        query.update(filters or {})
        if order:
            query["order"] = order
        result = self._request(
            "GET", f"/{table}", access_token=access_token, query=query
        )
        if not isinstance(result, list):
            raise DatabaseUnavailable("Supabase returned an unexpected row format.", 502)
        return result

    def insert(
        self, table: str, values: dict[str, Any], *, access_token: str
    ) -> dict[str, Any] | None:
        result = self._request(
            "POST",
            f"/{table}",
            access_token=access_token,
            payload=values,
            prefer="return=representation",
        )
        return result[0] if isinstance(result, list) and result else None

    def upsert(
        self,
        table: str,
        values: dict[str, Any] | list[dict[str, Any]],
        *,
        access_token: str,
        conflict: str,
        ignore_duplicates: bool = False,
    ) -> list[dict[str, Any]]:
        resolution = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
        result = self._request(
            "POST",
            f"/{table}",
            access_token=access_token,
            query={"on_conflict": conflict},
            payload=values,
            prefer=f"resolution={resolution},return=representation",
        )
        return result if isinstance(result, list) else []

    def patch(
        self,
        table: str,
        values: dict[str, Any],
        *,
        access_token: str,
        filters: dict[str, str],
    ) -> list[dict[str, Any]]:
        result = self._request(
            "PATCH",
            f"/{table}",
            access_token=access_token,
            query=filters,
            payload=values,
            prefer="return=representation",
        )
        return result if isinstance(result, list) else []

    def delete(
        self,
        table: str,
        *,
        access_token: str,
        filters: dict[str, str],
    ) -> list[dict[str, Any]]:
        result = self._request(
            "DELETE",
            f"/{table}",
            access_token=access_token,
            query=filters,
            prefer="return=representation",
        )
        return result if isinstance(result, list) else []
