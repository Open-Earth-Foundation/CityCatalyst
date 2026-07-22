"""Shared deterministic localization for frontend-visible prioritizer content."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from langdetect import DetectorFactory, LangDetectException, detect_langs
import yaml


TRANSLATIONS_PATH = Path(__file__).with_name("translations.yaml")
DetectorFactory.seed = 0


@lru_cache(maxsize=1)
def load_translations() -> dict[str, Any]:
    """Load the editable shared terminology catalogue and validate its shape."""
    payload = yaml.safe_load(TRANSLATIONS_PATH.read_text(encoding="utf-8")) or {}
    languages = payload.get("languages")
    if not isinstance(languages, list) or not languages:
        raise ValueError("translations.yaml must define supported languages")
    _validate_translation_nodes(payload, "translations", set(languages))
    return payload


def supported_languages() -> tuple[str, ...]:
    """Return language codes supported by the shared terminology catalogue."""
    return tuple(str(value) for value in load_translations()["languages"])


def terminology_for_translation(
    target_languages: list[str], *, source_language: str = "en"
) -> dict[str, object]:
    """Return source/target term pairs for each requested translation language."""
    supported = set(supported_languages())
    unsupported = [
        language for language in target_languages if language not in supported
    ]
    if unsupported:
        raise ValueError(f"Unsupported translation languages: {unsupported}")

    terms = load_translations().get("terms", {})
    return {
        language: {
            category: {
                key: {
                    "source": values[source_language],
                    "target": values[language],
                }
                for key, values in category_terms.items()
            }
            for category, category_terms in terms.items()
        }
        for language in target_languages
    }


def chapter_title(chapter_key: str, language: str) -> str:
    """Return the configured title for one chapter and language."""
    return _localized_value(
        load_translations()["chapter_titles"], chapter_key, language
    )


def chapter_terms(chapter_key: str, language: str) -> dict[str, str]:
    """Return exact recurring labels that a chapter must render."""
    configured = load_translations().get("chapter_terms", {}).get(
        chapter_key, {}
    )
    return {
        key: _localized_mapping_value(value, language, f"{chapter_key}.{key}")
        for key, value in configured.items()
    }


def translate_term(category: str, value: object, language: str) -> str | None:
    """Translate a configured recurring term without translating proper names."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    key = text.lower().replace("-", "_").replace(" ", "_")
    configured = load_translations().get("terms", {}).get(category, {})
    entry = configured.get(key)
    if entry is None:
        return text.replace("_", " ")
    return _localized_mapping_value(entry, language, f"{category}.{key}")


def localized_source_value(
    *,
    language: str,
    localized: dict[str, str],
    fallback: str | None,
) -> str | None:
    """Select a source-provided translation, falling back to canonical source text."""
    translated = localized.get(language)
    if translated and translated.strip():
        return translated.strip()
    return fallback.strip() if fallback and fallback.strip() else None


def validate_generated_language(
    text: str,
    language: str,
    *,
    content_label: str,
    minimum_characters: int = 40,
) -> None:
    """Reject confidently wrong-language generated text while tolerating short text."""
    cleaned = text.strip()
    if len(cleaned) < minimum_characters:
        return
    try:
        dominant = detect_langs(cleaned)[0]
    except LangDetectException:
        return
    if dominant.lang != language and dominant.prob >= 0.9:
        raise ValueError(
            f"{content_label} was generated in `{dominant.lang}` instead of "
            f"`{language}`"
        )


def _localized_value(
    values: dict[str, dict[str, str]], key: str, language: str
) -> str:
    """Read one required localized value from a keyed catalogue section."""
    if key not in values:
        raise ValueError(f"Missing translation key: {key}")
    return _localized_mapping_value(values[key], language, key)


def _localized_mapping_value(
    values: dict[str, str], language: str, key: str
) -> str:
    """Read one required language value without cross-language fallback."""
    value = values.get(language)
    if not value or not value.strip():
        raise ValueError(f"Missing `{language}` translation for `{key}`")
    return value.strip()


def _validate_translation_nodes(
    value: object, path: str, languages: set[str]
) -> None:
    """Require every localized catalogue leaf to contain exactly all languages."""
    if not isinstance(value, dict):
        return
    keys = set(value)
    if keys.intersection(languages):
        if keys != languages:
            raise ValueError(
                f"Translation `{path}` must contain exactly {sorted(languages)}"
            )
        for language, text in value.items():
            if not isinstance(text, str) or not text.strip():
                raise ValueError(f"Translation `{path}.{language}` must not be blank")
        return
    for key, child in value.items():
        _validate_translation_nodes(child, f"{path}.{key}", languages)
