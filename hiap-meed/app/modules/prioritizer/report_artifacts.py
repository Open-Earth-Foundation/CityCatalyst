"""Artifact helpers for City Action Report / output-plan requests."""

from __future__ import annotations

from app.modules.prioritizer.models import CityActionReportApiResponse
from app.utils.artifacts import ArtifactWriter


def write_output_plan_llm_artifacts(
    *, artifact_writer: ArtifactWriter, llm_io: dict[str, object]
) -> None:
    """
    Write output-plan LLM diagnostics to request artifacts.

    This helper owns report-specific artifact layout. `ArtifactWriter` remains
    generic and only handles JSON/text file persistence.
    """
    chapters = llm_io.get("chapters")
    if isinstance(chapters, list):
        for chapter in chapters:
            if not isinstance(chapter, dict):
                continue
            chapter_key = str(chapter.get("chapter") or "unknown")
            prompt_text = chapter.get("prompt_text")
            if isinstance(prompt_text, str):
                artifact_writer.write_run_text_file(
                    f"llm/{chapter_key}_prompt.txt",
                    prompt_text,
                )
    artifact_writer.write_run_file("llm/output_plan_io.json", llm_io)


def build_output_plan_markdown(response: CityActionReportApiResponse) -> str:
    """Build a reader-friendly Markdown document from generated report chapters."""
    parts = [
        f"# Output Plan: {response.action_id}",
        "",
        f"- City: {response.locode}",
        f"- Action ID: {response.action_id}",
        f"- Language: {response.language}",
        "",
    ]
    for chapter in response.chapters:
        chapter_markdown = chapter.markdown.strip()
        if not chapter_markdown:
            continue
        expected_heading = f"## {chapter.title}"
        first_line = chapter_markdown.splitlines()[0].strip()
        if first_line.casefold() == expected_heading.casefold():
            parts.extend([chapter_markdown, ""])
            continue
        parts.extend([expected_heading, "", chapter_markdown, ""])
    return "\n".join(parts).rstrip() + "\n"


def write_output_plan_markdown_artifact(
    *, artifact_writer: ArtifactWriter, response: CityActionReportApiResponse
) -> None:
    """Write the concatenated Markdown report artifact for local files and MLflow."""
    artifact_writer.write_run_text_file(
        "output_plan.md",
        build_output_plan_markdown(response),
    )


def write_city_action_report_error_artifacts(
    *,
    artifact_writer: ArtifactWriter,
    request_trace_id: str,
    error_type: str,
    error_message: str,
    status_code: int | None = None,
) -> None:
    """Write failure diagnostics for one output-plan report request."""
    error_payload: dict[str, object] = {
        "frontend_request_id": request_trace_id,
        "error_type": error_type,
        "error": error_message,
    }
    if status_code is not None:
        error_payload["status_code"] = status_code

    artifact_writer.write_event("city_action_report.failed", error_payload)
    artifact_writer.write_run_file("error.json", error_payload)
    artifact_writer.write_manifest(
        {
            "status": "failed",
            "artifact_pointers": {
                "summary_events": "summary.jsonl",
                "error": "error.json",
            },
        }
    )
