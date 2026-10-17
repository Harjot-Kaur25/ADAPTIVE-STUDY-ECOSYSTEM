"""Subject/topic-level resource search suggestions; no fabricated links."""

from __future__ import annotations

from typing import Any

RESOURCE_PROVIDERS = (
    {
        "provider": "Khan Academy",
        "resource_type": "lessons and practice",
        "search_method": "Search Khan Academy for the query below.",
    },
    {
        "provider": "OpenStax",
        "resource_type": "open textbooks",
        "search_method": "Search OpenStax for the subject or topic below.",
    },
    {
        "provider": "MIT OpenCourseWare",
        "resource_type": "lecture notes and course materials",
        "search_method": "Search MIT OpenCourseWare for the query below.",
    },
    {
        "provider": "YouTube",
        "resource_type": "video lessons",
        "search_method": "Search YouTube for the query below; review the channel and lesson before use.",
    },
)


def recommend_resources(
    subject_name: str,
    *,
    topic: str | None = None,
    priority: str | None = None,
) -> dict[str, Any]:
    subject = subject_name.strip()
    topic_name = topic.strip() if topic and topic.strip() else None
    search_topic = f"{subject}: {topic_name}" if topic_name else subject
    suggestions = []
    for provider in RESOURCE_PROVIDERS:
        suggestions.append(
            {
                **provider,
                "search_query": f"{search_topic} study lessons practice",
            }
        )
    return {
        "subject_name": subject,
        "topic": topic_name,
        "scope": "topic" if topic_name else "subject",
        "priority_context": priority,
        "message": (
            "Suggestions are search queries for established educational providers. "
            "No individual lesson or URL has been checked or verified."
        ),
        "resources": suggestions,
    }
