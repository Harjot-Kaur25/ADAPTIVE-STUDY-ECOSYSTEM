"""Availability-constrained timetable generation, independent of the ML model."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

PRIORITY_WEIGHT = {"HIGH": 9, "MEDIUM": 6, "LOW": 3}


def local_wall_datetime(value: datetime | None = None) -> datetime:
    """Normalize instants to backend-local wall time used by stored availability.

    Naive values are already local wall time. Aware values are converted to the
    host's local timezone before tzinfo is removed, preserving their local date
    and clock time for the scheduler's date/time-only database fields.
    """
    if value is None:
        value = datetime.now().astimezone()
    if not isinstance(value, datetime):
        raise ValueError("now must be a datetime.")
    if value.tzinfo is None or value.utcoffset() is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _clock(value: str) -> time:
    try:
        parsed = time.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Availability times must use HH:MM or HH:MM:SS format.") from error
    if parsed.tzinfo is not None and parsed.utcoffset() is not None:
        raise ValueError("Availability times must be local times without a timezone offset.")
    return parsed


def _deadline_weight(subject: dict[str, Any], on_date: date) -> int:
    nearest_days: int | None = None
    for deadline in subject.get("deadlines", []):
        try:
            due = date.fromisoformat(str(deadline["due_date"])[:10])
        except (KeyError, TypeError, ValueError):
            continue
        days = (due - on_date).days
        if days >= 0 and (nearest_days is None or days < nearest_days):
            nearest_days = days
    if nearest_days is None:
        return 0
    if nearest_days <= 3:
        return 4
    if nearest_days <= 7:
        return 3
    if nearest_days <= 21:
        return 1
    return 0


def _deadline_dates(subject: dict[str, Any]) -> list[date]:
    dates: list[date] = []
    for deadline in subject.get("deadlines", []):
        try:
            dates.append(date.fromisoformat(str(deadline["due_date"])[:10]))
        except (KeyError, TypeError, ValueError):
            continue
    return dates


def _preferred_minutes(preference: str, available_minutes: int) -> int | None:
    options = {
        "1h": (60,),
        "2h": (120,),
        "2-3h": (180, 120),
    }
    for minutes in options[preference]:
        if available_minutes >= minutes:
            return minutes
    return None


def generate_schedule(
    subjects: list[dict[str, Any]],
    availability: list[dict[str, Any]],
    *,
    preferred_session: str,
    break_minutes: int,
    existing_sessions: list[dict[str, Any]] | None = None,
    start_date: date | None = None,
    horizon_days: int = 14,
    now: datetime | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return sessions using local wall time and declared availability.

    Availability and persisted session fields are date/time-only, so this
    scheduler consistently interprets them in the backend host's local timezone.
    """
    if preferred_session not in {"1h", "2h", "2-3h"}:
        raise ValueError("preferred_session must be 1h, 2h, or 2-3h.")
    if isinstance(break_minutes, bool) or not 0 <= break_minutes <= 60:
        raise ValueError("break_minutes must be a whole number from 0 to 60.")
    if not isinstance(break_minutes, int):
        raise ValueError("break_minutes must be a whole number from 0 to 60.")
    if not 1 <= horizon_days <= 60:
        raise ValueError("horizon_days must be between 1 and 60.")
    if not subjects:
        raise ValueError("At least one subject is needed to make a schedule.")
    if not availability:
        raise ValueError("At least one availability period is needed.")

    current = local_wall_datetime(now)
    first_day = start_date or current.date()
    last_day = first_day + timedelta(days=horizon_days - 1)
    if first_day < current.date():
        raise ValueError("start_date cannot be in the past.")

    by_weekday: dict[int, list[tuple[time, time]]] = defaultdict(list)
    for period in availability:
        weekday = period.get("day_of_week")
        if isinstance(weekday, bool) or not isinstance(weekday, int) or not 0 <= weekday <= 6:
            raise ValueError("day_of_week must be an integer from 0 (Monday) to 6 (Sunday).")
        start = _clock(str(period.get("start_time", "")))
        end = _clock(str(period.get("end_time", "")))
        if start >= end:
            raise ValueError("Availability periods must end after they start on the same day.")
        by_weekday[weekday].append((start, end))

    subjects_by_id = {str(subject["subject_id"]): subject for subject in subjects}
    remaining_minutes = {
        key: max(0, int(subject.get("workload_minutes", 8 * 60)))
        for key, subject in subjects_by_id.items()
    }
    next_deadlines = {
        key: min((due for due in _deadline_dates(subject) if due >= first_day), default=None)
        for key, subject in subjects_by_id.items()
    }
    expired_deadlines = {
        key: max((due for due in _deadline_dates(subject) if due < first_day), default=None)
        for key, subject in subjects_by_id.items()
    }
    scheduled_counts: Counter[str] = Counter()
    occupied: dict[date, list[tuple[time, time]]] = defaultdict(list)
    for session in existing_sessions or []:
        try:
            session_day = date.fromisoformat(str(session["session_date"])[:10])
            start = _clock(str(session["start_time"]))
            end = _clock(str(session["end_time"]))
        except (KeyError, TypeError, ValueError):
            continue
        if str(session.get("status", "")).lower() in {
            "scheduled", "planned", "pending", "accepted", "completed", "missed"
        }:
            occupied[session_day].append((start, end))
        subject_key = str(session.get("subject_id", ""))
        if subject_key in subjects_by_id and session_day >= first_day:
            scheduled_counts[subject_key] += 1

    for blocks in by_weekday.values():
        blocks.sort()
        for previous, following in zip(blocks, blocks[1:]):
            if previous[1] > following[0]:
                raise ValueError("Availability periods for the same weekday must not overlap.")

    new_sessions: list[dict[str, Any]] = []
    day = first_day
    while day <= last_day and any(minutes > 0 for minutes in remaining_minutes.values()):
        for availability_start, availability_end in by_weekday.get(day.weekday(), []):
            cursor = datetime.combine(day, availability_start)
            block_end = datetime.combine(day, availability_end)
            if day == current.date():
                cursor = max(cursor, current.replace(second=0, microsecond=0))
            while cursor < block_end:
                free_end = block_end
                conflict_end: datetime | None = None
                for occupied_start, occupied_end in sorted(occupied[day]):
                    occupied_start_dt = datetime.combine(day, occupied_start)
                    occupied_end_dt = datetime.combine(day, occupied_end)
                    if occupied_end_dt <= cursor:
                        continue
                    if occupied_start_dt < free_end:
                        free_end = occupied_start_dt
                        conflict_end = occupied_end_dt
                        break
                available_minutes = int((free_end - cursor).total_seconds() // 60)
                session_length = _preferred_minutes(preferred_session, available_minutes)
                if session_length is None:
                    if conflict_end is None:
                        break
                    next_cursor = conflict_end + timedelta(
                        minutes=break_minutes
                    )
                    if next_cursor <= cursor:
                        break
                    cursor = next_cursor
                    continue

                candidates = [
                    key for key, remaining in remaining_minutes.items()
                    if remaining >= session_length
                    and (next_deadlines[key] is None or day <= next_deadlines[key])
                    and not (
                        next_deadlines[key] is None
                        and expired_deadlines[key] is not None
                    )
                ]
                if not candidates:
                    break

                def subject_score(key: str) -> tuple[int, int, str]:
                    subject = subjects_by_id[key]
                    priority = str(subject.get("priority", "MEDIUM")).upper()
                    base = PRIORITY_WEIGHT.get(priority, PRIORITY_WEIGHT["MEDIUM"])
                    urgency = _deadline_weight(subject, day)
                    return (
                        base + urgency - scheduled_counts[key],
                        -scheduled_counts[key],
                        key,
                    )

                selected_id = max(candidates, key=subject_score)
                subject = subjects_by_id[selected_id]
                session_start = cursor
                session_end = cursor + timedelta(minutes=session_length)
                if session_end > free_end or session_end > block_end:
                    raise RuntimeError("Scheduler attempted to place a session outside availability.")
                session = {
                    "subject_id": subject["subject_id"],
                    "subject_name": subject["subject_name"],
                    "session_date": day.isoformat(),
                    "start_time": session_start.strftime("%H:%M:%S"),
                    "end_time": session_end.strftime("%H:%M:%S"),
                    "duration_minutes": session_length,
                    "status": "scheduled",
                    "reason": (
                        f"{subject.get('priority', 'MEDIUM')} priority"
                        + (
                            "; deadline is approaching"
                            if _deadline_weight(subject, day) > 0
                            else ""
                        )
                        + "; fitted within your available time."
                    ),
                }
                new_sessions.append(session)
                occupied[day].append((session_start.time(), session_end.time()))
                occupied[day].sort()
                remaining_minutes[selected_id] -= session_length
                scheduled_counts[selected_id] += 1
                cursor = session_end + timedelta(minutes=break_minutes)
        day += timedelta(days=1)

    unscheduled = []
    for key, subject in subjects_by_id.items():
        remaining = remaining_minutes[key]
        if remaining <= 0:
            continue
        deadline = next_deadlines[key]
        if deadline is not None:
            reason = (
                f"The available periods through the deadline on {deadline.isoformat()} "
                "could not fit all remaining work; no sessions were scheduled after the deadline."
            )
        elif expired_deadlines[key] is not None:
            reason = (
                "All recorded deadlines occurred before the planning start date; "
                "remaining work was left unscheduled rather than placed after a deadline."
            )
        else:
            reason = (
                "The available periods in this planning window do not fit another "
                "preferred-length session."
            )
        unscheduled.append(
            {
                "subject_id": subject["subject_id"],
                "subject_name": subject["subject_name"],
                "remaining_minutes": remaining,
                "reason": reason,
            }
        )
    return new_sessions, unscheduled
