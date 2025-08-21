"""
Export prioritized actions into frontend JSON files per language and per city.

Input:
- app/cap_off_app/data/prioritizations/prioritization_results_local.json
- app/cap_off_app/data/city_data/city_data.json

Output structure (per language):
- app/cap_off_app/data/frontend/<language>/mitigation/<LOCODE>.json
- app/cap_off_app/data/frontend/<language>/adaptation/<LOCODE>.json

Each JSON file contains an array of entries matching the structure shown by the
existing example files (fields: locode, cityName, region, regionName, actionId,
actionName, actionPriority, explanation, action{...}).

Notes:
- The prioritization results include multi-language explanations under
  item["explanation"]["explanations"][<lang>]. This script outputs a separate
  set of files per language, using that language's explanation when available,
  falling back to English or any available language.
- Action metadata (names, hazards, etc.) is retrieved via the existing
  app.services.get_actions service for each language.

Usage:
    python -m cap_off_app.scripts.export_prioritization_to_frontend
"""

from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from services.get_actions import get_actions


# ----------------------------- Data Structures ----------------------------- #


@dataclass(frozen=True)
class CityMeta:
    locode: str
    city_name: str
    region: str
    region_name: str


# ------------------------------- IO Utilities ------------------------------ #


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ------------------------------- Core Logic -------------------------------- #


def index_city_meta(city_data: List[Dict[str, Any]]) -> Dict[str, CityMeta]:
    locode_to_city: Dict[str, CityMeta] = {}
    for entry in city_data:
        locode = entry.get("locode")
        if not locode:
            continue
        city_meta = CityMeta(
            locode=locode,
            city_name=entry.get("name") or entry.get("cityName") or "",
            region=entry.get("region") or "",
            region_name=entry.get("regionName") or "",
        )
        locode_to_city[locode] = city_meta
    return locode_to_city


def build_action_index(actions: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {str(a.get("ActionID")): a for a in (actions or [])}


def select_explanation_text(
    ranked_item: Dict[str, Any], target_language: str
) -> Optional[str]:
    explanations_container = ranked_item.get("explanation") or {}
    explanations = explanations_container.get("explanations") or {}
    # Try target language
    if target_language in explanations and explanations[target_language]:
        return explanations[target_language]
    # Fallback to English
    if "en" in explanations and explanations["en"]:
        return explanations["en"]
    # Fallback to any available language
    for _, text in explanations.items():
        if text:
            return text
    return None


def make_output_entry(
    ranked_item: Dict[str, Any],
    city_meta: CityMeta,
    action_index: Dict[str, Dict[str, Any]],
    target_language: str,
) -> Optional[Dict[str, Any]]:
    action_id = str(ranked_item.get("actionId"))
    if not action_id:
        return None

    action_obj = action_index.get(action_id)
    # If not found in target language, leave None; caller may choose to fallback.

    explanation_text = select_explanation_text(ranked_item, target_language) or ""

    return {
        "locode": city_meta.locode,
        "cityName": city_meta.city_name,
        "region": city_meta.region,
        "regionName": city_meta.region_name,
        "actionId": action_id,
        "actionName": (action_obj or {}).get("ActionName"),
        "actionPriority": ranked_item.get("rank"),
        "explanation": explanation_text,
        "action": action_obj,
    }


def build_city_output(
    city_item: Dict[str, Any],
    city_meta: CityMeta,
    action_index: Dict[str, Dict[str, Any]],
    target_language: str,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    # Mitigation
    mitigation_key = (
        "rankedActionsMitigation"
        if "rankedActionsMitigation" in city_item
        else "rankedActionsMitigations"
    )
    ranked_mitigation = city_item.get(mitigation_key, []) or []
    out_mitigation: List[Dict[str, Any]] = []
    for ranked in sorted(ranked_mitigation, key=lambda x: x.get("rank", 0)):
        entry = make_output_entry(ranked, city_meta, action_index, target_language)
        if entry is not None:
            out_mitigation.append(entry)

    # Adaptation
    ranked_adaptation = city_item.get("rankedActionsAdaptation", []) or []
    out_adaptation: List[Dict[str, Any]] = []
    for ranked in sorted(ranked_adaptation, key=lambda x: x.get("rank", 0)):
        entry = make_output_entry(ranked, city_meta, action_index, target_language)
        if entry is not None:
            out_adaptation.append(entry)

    return out_mitigation, out_adaptation


def export_for_language(
    *,
    prioritizer_response_list: List[Dict[str, Any]],
    locode_to_city: Dict[str, CityMeta],
    output_base: Path,
    language: str,
    fallback_action_index_en: Optional[Dict[str, Dict[str, Any]]] = None,
) -> None:
    # Fetch actions for this language
    actions_lang = get_actions(language=language) or []
    action_index_lang = build_action_index(actions_lang)

    # Fallback to English if an action is missing in the selected language
    if fallback_action_index_en is None and language != "en":
        actions_en = get_actions(language="en") or []
        fallback_action_index_en = build_action_index(actions_en)

    for city_item in prioritizer_response_list:
        locode = (city_item.get("metadata") or {}).get("locode")
        if not locode:
            continue
        city_meta = locode_to_city.get(locode)
        if not city_meta:
            # Skip if city metadata is unknown
            continue

        out_mitigation, out_adaptation = build_city_output(
            city_item=city_item,
            city_meta=city_meta,
            action_index=action_index_lang,
            target_language=language,
        )

        # Fill missing action objects from English index if available
        if fallback_action_index_en:
            for entry in out_mitigation:
                if (
                    not entry.get("action")
                    and entry.get("actionId") in fallback_action_index_en
                ):
                    entry["action"] = fallback_action_index_en[entry["actionId"]]
                    if not entry.get("actionName"):
                        entry["actionName"] = fallback_action_index_en[
                            entry["actionId"]
                        ].get("ActionName")
            for entry in out_adaptation:
                if (
                    not entry.get("action")
                    and entry.get("actionId") in fallback_action_index_en
                ):
                    entry["action"] = fallback_action_index_en[entry["actionId"]]
                    if not entry.get("actionName"):
                        entry["actionName"] = fallback_action_index_en[
                            entry["actionId"]
                        ].get("ActionName")

        # Write files
        mitigation_path = output_base / language / "mitigation" / f"{locode}.json"
        adaptation_path = output_base / language / "adaptation" / f"{locode}.json"
        save_json(mitigation_path, out_mitigation)
        save_json(adaptation_path, out_adaptation)


def main() -> None:
    # Base paths relative to this script location
    scripts_dir = Path(__file__).resolve().parent
    cap_off_app_dir = scripts_dir.parent
    data_dir = cap_off_app_dir / "data"

    prioritization_path = (
        data_dir / "prioritizations" / "prioritization_results_local.json"
    )
    city_data_path = data_dir / "city_data" / "city_data.json"
    output_base = data_dir / "frontend"

    prioritization_payload = load_json(prioritization_path)
    prioritizer_response_list: List[Dict[str, Any]] = prioritization_payload.get(
        "prioritizerResponseList", []
    )

    city_data = load_json(city_data_path)
    locode_to_city = index_city_meta(city_data)

    # Fixed language set
    languages: List[str] = ["en", "es", "pt"]

    # Pre-fetch English actions for fallback
    actions_en = get_actions(language="en") or []
    fallback_en_index: Optional[Dict[str, Dict[str, Any]]] = build_action_index(
        actions_en
    )

    for lang in languages:
        export_for_language(
            prioritizer_response_list=prioritizer_response_list,
            locode_to_city=locode_to_city,
            output_base=output_base,
            language=lang,
            fallback_action_index_en=fallback_en_index if lang != "en" else None,
        )


if __name__ == "__main__":
    main()
