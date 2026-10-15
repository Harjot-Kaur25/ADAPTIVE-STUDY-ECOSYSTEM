"""Train and evaluate a pipeline using synthetic records only."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from generate_data import DATA_PATH, FEATURE_NAMES, PRIORITIES, SEED, validate_rows

MODEL_PATH = Path(__file__).resolve().parent / "models" / "priority_model.joblib"
TEST_SIZE = 0.25
DATA_SOURCE = "synthetic_rule_simulation"


def load_dataset(path: Path = DATA_PATH) -> tuple[list[list[float]], list[str]]:
    with path.open("r", newline="", encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        expected = set(FEATURE_NAMES) | {
            "priority",
            "data_source",
            "synthetic_record_id",
        }
        if reader.fieldnames is None or set(reader.fieldnames) != expected:
            raise ValueError(f"CSV columns must be exactly: {sorted(expected)}")
        rows = list(reader)
    validate_rows(rows)

    features: list[list[float]] = []
    labels: list[str] = []
    for row_number, row in enumerate(rows, start=2):
        if row["data_source"] != DATA_SOURCE:
            raise ValueError(
                f"CSV row {row_number} is not labelled {DATA_SOURCE}; "
                "real and synthetic records must not be mixed."
            )
        try:
            features.append([float(row[name]) for name in FEATURE_NAMES])
        except (TypeError, ValueError) as error:
            raise ValueError(f"Invalid feature on CSV row {row_number}.") from error
        labels.append(row["priority"])
    if set(labels) != set(PRIORITIES):
        raise ValueError(f"Training data must contain all classes: {PRIORITIES}.")
    return features, labels


def train_and_evaluate(
    data_path: Path = DATA_PATH,
    model_path: Path = MODEL_PATH,
    seed: int = SEED,
) -> dict[str, Any]:
    features, labels = load_dataset(data_path)
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        labels,
        test_size=TEST_SIZE,
        random_state=seed,
        stratify=labels,
    )
    if set(y_test) != set(PRIORITIES):
        raise ValueError("The stratified test split does not contain all priority classes.")

    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "classifier",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=12,
                    min_samples_leaf=2,
                    class_weight="balanced",
                    random_state=seed,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test,
        predictions,
        labels=list(PRIORITIES),
        average="macro",
        zero_division=0,
    )
    metrics = {
        "accuracy": float(accuracy_score(y_test, predictions)),
        "macro_precision": float(precision),
        "macro_recall": float(recall),
        "macro_f1": float(f1),
        "confusion_matrix_labels": list(PRIORITIES),
        "confusion_matrix": confusion_matrix(
            y_test, predictions, labels=list(PRIORITIES)
        ).tolist(),
        "train_rows": len(y_train),
        "test_rows": len(y_test),
    }
    artifact = {
        "model": pipeline,
        "feature_names": list(FEATURE_NAMES),
        "class_labels": list(PRIORITIES),
        "random_seed": seed,
        "training_data_source": DATA_SOURCE,
        "label_rule": (
            "HIGH if average_marks < 50 or missed_sessions >= 5; "
            "otherwise MEDIUM if average_marks < 70 or missed_sessions >= 3; "
            "otherwise LOW."
        ),
        "metrics": metrics,
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)

    print(f"Training data: {data_path} ({len(features)} synthetic rows)")
    print(f"Split: {len(x_train)} train / {len(x_test)} test (seed={seed}, stratified)")
    print(f"Held-out metrics: {json.dumps(metrics, indent=2)}")
    print("Classification report (held-out test set):")
    print(
        classification_report(
            y_test, predictions, labels=list(PRIORITIES), zero_division=0, digits=4
        )
    )
    print("Confusion matrix (true rows, predicted columns; HIGH, MEDIUM, LOW):")
    print(metrics["confusion_matrix"])
    print("These results measure agreement with synthetic rule-generated labels only.")
    print(f"Saved preprocessing pipeline, model, and metadata to {model_path}")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    train_and_evaluate(args.data, args.model, args.seed)


if __name__ == "__main__":
    main()
