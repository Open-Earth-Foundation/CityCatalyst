"""
Payload trimming utilities for slimming tool responses before serialization.

These functions reshape API responses to remove context waste (timestamps, 
redundant IDs, long descriptions, etc.) while keeping only the essential 
fields needed by the LLM for decision-making and follow-up operations.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def trim_inventory_for_listing(inventory: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim an inventory object for list/summary contexts.
    
    **When to use:** User is browsing/scanning multiple inventories to pick one.
    Used in get_user_inventories when user asks "show me my inventories" or similar.
    City info is minimal (name, locode only) for quick identification.
    
    Keeps: inventoryId, inventoryName, year, totalEmissions (optional), 
           inventoryType, globalWarmingPotentialType, city.name, city.locode
    Drops: timestamps, publish flags, cityId, totalCountryEmissions, null fields, etc.
    
    Tool integration:
    - get_user_inventories: trims each inventory in the list
    - city_inventory_search (future): trims search results by city
    """
    if not inventory:
        return {}
    
    # Extract city info
    city_obj = inventory.get("city") or {}
    city_info: Dict[str, Any] = {}
    if city_obj.get("name"):
        city_info["name"] = city_obj["name"]
    if city_obj.get("locode"):
        city_info["locode"] = city_obj["locode"]
    
    trimmed: Dict[str, Any] = {}
    
    # Always include essential fields
    if inventory.get("inventoryId"):
        trimmed["inventoryId"] = inventory["inventoryId"]
    if inventory.get("inventoryName"):
        trimmed["inventoryName"] = inventory["inventoryName"]
    if inventory.get("year") is not None:
        trimmed["year"] = inventory["year"]
    if inventory.get("inventoryType"):
        trimmed["inventoryType"] = inventory["inventoryType"]
    if inventory.get("globalWarmingPotentialType"):
        trimmed["globalWarmingPotentialType"] = inventory["globalWarmingPotentialType"]
    
    # Include totalEmissions if present (useful context but not critical)
    if inventory.get("totalEmissions") is not None:
        trimmed["totalEmissions"] = inventory["totalEmissions"]
    
    # Include city info if available
    if city_info:
        trimmed["city"] = city_info
    
    return trimmed


def trim_inventory_detailed(inventory: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim an inventory object for detailed/drill-down contexts.
    
    **When to use:** User has selected a specific inventory and wants full details.
    Used in get_inventory when user says "show me inventory abc-123" (after picking one).
    City info is rich (country, region, coordinates) to provide geographical context
    for understanding emission sources and regional factors.
    
    Keeps: inventoryId, inventoryName, year, totalEmissions, inventoryType,
           globalWarmingPotentialType, city (with name, locode, country, region, 
           countryLocode, regionLocode, area)
    Drops: city.shape (GeoJSON), project and org blobs, timestamps, publish flags, etc.
    
    Tool integration:
    - get_inventory: trims single inventory detail response
    """
    if not inventory:
        return {}
    
    # Extract and trim city info (no GeoJSON shape)
    city_obj = inventory.get("city") or {}
    city_info: Dict[str, Any] = {}
    for field in ["name", "locode", "country", "region", "countryLocode", "regionLocode", "area"]:
        if city_obj.get(field) is not None:
            city_info[field] = city_obj[field]
    
    trimmed: Dict[str, Any] = {}
    
    # Essential fields
    if inventory.get("inventoryId"):
        trimmed["inventoryId"] = inventory["inventoryId"]
    if inventory.get("inventoryName"):
        trimmed["inventoryName"] = inventory["inventoryName"]
    if inventory.get("year") is not None:
        trimmed["year"] = inventory["year"]
    if inventory.get("totalEmissions") is not None:
        trimmed["totalEmissions"] = inventory["totalEmissions"]
    if inventory.get("inventoryType"):
        trimmed["inventoryType"] = inventory["inventoryType"]
    if inventory.get("globalWarmingPotentialType"):
        trimmed["globalWarmingPotentialType"] = inventory["globalWarmingPotentialType"]
    
    # City info
    if city_info:
        trimmed["city"] = city_info
    
    return trimmed


def trim_datasource_entry(source: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim a single datasource entry to essential fields.
    
    Keeps: datasourceName, sourceType, retrievalMethod, geographicalLocation,
           startYear, endYear, subSector/subCategory names + refNumber, scope name,
           issue, scaleFactor, and compact data summary (recordsCount, co2eq values)
    Drops: datasourceId, records arrays, inventoryValues, publisher metadata, 
           long descriptions, methodologies, URLs, timestamps, etc.
    
    Returns compact summary suitable for LLM consumption.
    """
    if not source:
        return {}
    
    trimmed: Dict[str, Any] = {}
    
    # Primary identifiers (datasourceId not used by agent, so omit it)
    if source.get("datasourceName"):
        trimmed["datasourceName"] = source["datasourceName"]
    elif source.get("datasetName"):
        trimmed["datasourceName"] = source["datasetName"]
    
    # Retrieval/scope info
    if source.get("sourceType"):
        trimmed["sourceType"] = source["sourceType"]
    if source.get("retrievalMethod"):
        trimmed["retrievalMethod"] = source["retrievalMethod"]
    if source.get("geographicalLocation"):
        trimmed["geographicalLocation"] = source["geographicalLocation"]
    
    # Coverage
    if source.get("startYear") is not None:
        trimmed["startYear"] = source["startYear"]
    if source.get("endYear") is not None:
        trimmed["endYear"] = source["endYear"]
    
    # Classification (keep names, drop objects)
    if source.get("subSector"):
        subsector = source["subSector"]
        if isinstance(subsector, dict):
            if subsector.get("name"):
                trimmed["subSector"] = subsector["name"]
        else:
            trimmed["subSector"] = subsector
    
    if source.get("subCategory"):
        subcategory = source["subCategory"]
        if isinstance(subcategory, dict):
            if subcategory.get("name"):
                trimmed["subCategory"] = subcategory["name"]
        else:
            trimmed["subCategory"] = subcategory
    
    # Reference number if available
    if source.get("referenceNumber"):
        trimmed["referenceNumber"] = source["referenceNumber"]
    
    # Scope (keep name only) as i understand they are sometimes dicts and sometimes strings
    if source.get("scope"):
        scope_obj = source["scope"]
        if isinstance(scope_obj, dict):
            if scope_obj.get("name"):
                trimmed["scope"] = scope_obj["name"]
        else:
            trimmed["scope"] = scope_obj
    
    # Applicability/issues
    if source.get("issue"):
        trimmed["issue"] = source["issue"]
    if source.get("scaleFactor") is not None:
        trimmed["scaleFactor"] = source["scaleFactor"]
    
    # Compact data summary from 'data' field
    data_obj = source.get("data") or {}
    if isinstance(data_obj, dict):
        data_summary: Dict[str, Any] = {}
        
        # Extract key totals if available
        totals = data_obj.get("totals") or {}
        if isinstance(totals, dict):
            if totals.get("co2eq_100yr") is not None:
                data_summary["co2eq_100yr"] = totals["co2eq_100yr"]
            # Include other key gas masses if present
            for gas in ["co2", "ch4", "n2o"]:
                if totals.get(gas) is not None:
                    data_summary[gas] = totals[gas]
        
        # Record count
        if data_obj.get("recordsCount") is not None:
            data_summary["recordsCount"] = data_obj["recordsCount"]
        
        # Notation key / unavailable reason if data is missing
        if data_obj.get("unavailableReason"):
            data_summary["unavailableReason"] = data_obj["unavailableReason"]
        
        if data_summary:
            trimmed["data"] = data_summary
    
    return trimmed


def trim_datasources_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim a datasources API response to only successful sources with trimmed payloads.
    
    Input shape: { data: { successfulSources[], removedSources[], failedSources[] }, ... }
    Output shape: { data: [trimmed datasource], ... }
    
    Only returns successful sources (drops removed and failed).
    Each source is trimmed via trim_datasource_entry().
    """
    if not response:
        return {}
    
    data_obj = response.get("data") or {}
    successful_sources = data_obj.get("successfulSources") or []
    
    # Trim each successful source
    trimmed_sources: List[Dict[str, Any]] = [
        trim_datasource_entry(source) for source in successful_sources
    ]
    
    result: Dict[str, Any] = {"data": trimmed_sources}
    
    # Preserve top-level error info if present
    if response.get("error"):
        result["error"] = response["error"]
    if response.get("error_code"):
        result["error_code"] = response["error_code"]
    
    return result


def trim_vector_search_matches(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Trim vector search match results.
    
    Keeps: filename, chunk_index, score, content (full, not truncated)
    Drops: file_path, distance, model_name (metadata noise)
    
    """
    if not matches:
        return []
    
    trimmed_matches: List[Dict[str, Any]] = []
    for match in matches[:3]:  # Limit to top 3
        trimmed: Dict[str, Any] = {}
        
        if match.get("filename"):
            trimmed["filename"] = match["filename"]
        if match.get("chunk_index") is not None:
            trimmed["chunk_index"] = match["chunk_index"]
        if match.get("score") is not None:
            trimmed["score"] = match["score"]
        if match.get("content"):
            trimmed["content"] = match["content"].strip()
        
        trimmed_matches.append(trimmed)
    
    return trimmed_matches

