"""Generate a reproducible synthetic dataset labelled by the initial study rules."""

from __future__ import annotations

import argparse
import csv
import random
from collections import Counter
from pathlib import Path
from typing import Any

SEED = 20261015
DEFAULT_ROWS = 3000
DATA_PATH = Path(__file__).resolve().parent / "data" / "synthetic_student_data.csv"
FEATURE_NAMES = (
    "average_marks",
    "exam_count",
    "total_study_hours",
    "completed_sessions",
    "missed_sessions",
)
FIELDNAMES = ("synthetic_record_id", *FEATURE_NAMES, "priority", "data_source")
PRIORITIES = ("HIGH", "MEDIUM", "LOW")


def simulated_priority(row: dict[str, Any]) -> str:
    """Apply the requested rule-generated target; it is not expert-labelled data."""
    marks = float(row["average_marks"])
    missed = int(row["missed_sessions"])
    if marks < 50 or missed >= 5:
        return "HIGH"
    if marks < 70 or missed >= 3:
        return "MEDIUM"
    return "LOW"


def _make_row(rng: random.Random, index: int) -> dict[str, Any]:
    row: dict[str, Any] = {
        "synthetic_record_id": f"SYN-{index:05d}",
        "average_marks": round(rng.uniform(0, 100), 1),
        "exam_count": rng.randint(1, 10),
        "total_study_hours": round(rng.uniform(0, 120), 1),
        "completed_sessions": rng.randint(0, 120),
        "missed_sessions": rng.randint(0, 12),
    }
    row["priority"] = simulated_priority(row)
    row["data_source"] = "synthetic_rule_simulation"
    return row


def validate_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    if not rows:
        raise ValueError("The generated dataset is empty.")
    counts: Counter[str] = Counter()
    for row_number, row in enumerate(rows, start=1):
        if set(row) != set(FIELDNAMES):
            raise ValueError(f"Unexpected columns in generated row {row_number}.")
        if any(value is None or value == "" for value in row.values()):
            raise ValueError(f"Missing value in generated row {row_number}.")
        if row["data_source"] != "synthetic_rule_simulation":
            raise ValueError(f"Unexpected data source in generated row {row_number}.")
        if not 0 <= float(row["average_marks"]) <= 100:
            raise ValueError(f"Invalid average_marks in row {row_number}.")
        if not 1 <= int(row["exam_count"]) <= 10:
            raise ValueError(f"Invalid exam_count in row {row_number}.")
        if not 0 <= float(row["total_study_hours"]) <= 120:
            raise ValueError(f"Invalid total_study_hours in row {row_number}.")
        for name in ("completed_sessions", "missed_sessions"):
            if not 0 <= int(row[name]) <= 120:
                raise ValueError(f"Invalid {name} in row {row_number}.")
        if row["priority"] != simulated_priority(row):
            raise ValueError(f"Priority does not follow the simulation rule in row {row_number}.")
        counts[str(row["priority"])] += 1
    if any(counts[label] == 0 for label in PRIORITIES):
        raise ValueError(f"Generated dataset must contain all classes: {PRIORITIES}.")
    return dict(counts)


def generate_dataset(
    rows_count: int = DEFAULT_ROWS,
    seed: int = SEED,
    output_path: Path = DATA_PATH,
) -> dict[str, int]:
    if rows_count < 30:
        raise ValueError("rows_count must be at least 30 for a stratified test split.")
    rng = random.Random(seed)
    rows = [_make_row(rng, index) for index in range(1, rows_count + 1)]
    counts = validate_rows(rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--output", type=Path, default=DATA_PATH)
    args = parser.parse_args()
    counts = generate_dataset(args.rows, args.seed, args.output)
    print(f"Saved {args.rows} synthetic rows to {args.output}")
    print(f"Class counts: {counts}")
    print("Every target follows the documented rules and is labelled synthetic.")


if __name__ == "__main__":
    main()
