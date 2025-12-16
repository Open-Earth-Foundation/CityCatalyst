"""
Payload trimming utilities for slimming tool responses before serialization.

These functions reshape API responses to remove context waste (timestamps, 
redundant IDs, long descriptions, etc.) while keeping only the essential 
fields needed by the LLM for decision-making and follow-up operations.

Error Handling Strategy:
- Graceful degradation: Functions return empty dict/list on validation failure
- Logging: All errors and data anomalies are logged for debugging
- No exceptions: Invalid data is skipped with warnings, not raised
- Type safety: All inputs validated before processing
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
    
    Args:
        inventory: Dictionary representing an inventory object
    
    Returns:
        Trimmed inventory dictionary with only essential fields. 
        Returns empty dict if input is invalid.
    """
    try:
        # Validate input type
        if inventory is None:
            logger.warning("trim_inventory_for_listing: received None inventory")
            return {}
        
        if not isinstance(inventory, dict):
            logger.error(f"trim_inventory_for_listing: expected dict, got {type(inventory).__name__}")
            return {}
        
        if not inventory:
            logger.debug("trim_inventory_for_listing: received empty inventory dict")
            return {}
        
        # Extract city info with type checking
        city_obj = inventory.get("city")
        city_info: Dict[str, Any] = {}
        
        if city_obj is not None:
            if not isinstance(city_obj, dict):
                logger.warning(f"trim_inventory_for_listing: city is {type(city_obj).__name__}, expected dict")
            else:
                if city_obj.get("name"):
                    city_info["name"] = city_obj["name"]
                if city_obj.get("locode"):
                    city_info["locode"] = city_obj["locode"]
        
        trimmed: Dict[str, Any] = {}
        
        # Always include essential fields
        if inventory.get("inventoryId"):
            trimmed["inventoryId"] = inventory["inventoryId"]
        else:
            logger.warning("trim_inventory_for_listing: missing inventoryId (required)")
        
        if inventory.get("inventoryName"):
            trimmed["inventoryName"] = inventory["inventoryName"]
        else:
            logger.warning("trim_inventory_for_listing: missing inventoryName (required)")
        
        if inventory.get("year") is not None:
            trimmed["year"] = inventory["year"]
        else:
            logger.debug("trim_inventory_for_listing: missing year")
        
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
    
    except Exception as e:
        logger.error(f"trim_inventory_for_listing: unexpected error: {e}", exc_info=True)
        return {}


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
    
    Args:
        inventory: Dictionary representing a detailed inventory object
    
    Returns:
        Trimmed inventory dictionary with city context. 
        Returns empty dict if input is invalid.
    """
    try:
        # Validate input type
        if inventory is None:
            logger.warning("trim_inventory_detailed: received None inventory")
            return {}
        
        if not isinstance(inventory, dict):
            logger.error(f"trim_inventory_detailed: expected dict, got {type(inventory).__name__}")
            return {}
        
        if not inventory:
            logger.debug("trim_inventory_detailed: received empty inventory dict")
            return {}
        
        # Extract and trim city info (no GeoJSON shape)
        city_obj = inventory.get("city")
        city_info: Dict[str, Any] = {}
        
        if city_obj is not None:
            if not isinstance(city_obj, dict):
                logger.warning(f"trim_inventory_detailed: city is {type(city_obj).__name__}, expected dict")
            else:
                for field in ["name", "locode", "country", "region", "countryLocode", "regionLocode", "area"]:
                    value = city_obj.get(field)
                    if value is not None:
                        city_info[field] = value
        
        trimmed: Dict[str, Any] = {}
        
        # Essential fields
        if inventory.get("inventoryId"):
            trimmed["inventoryId"] = inventory["inventoryId"]
        else:
            logger.warning("trim_inventory_detailed: missing inventoryId (required)")
        
        if inventory.get("inventoryName"):
            trimmed["inventoryName"] = inventory["inventoryName"]
        else:
            logger.warning("trim_inventory_detailed: missing inventoryName (required)")
        
        if inventory.get("year") is not None:
            trimmed["year"] = inventory["year"]
        else:
            logger.debug("trim_inventory_detailed: missing year")
        
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
    
    except Exception as e:
        logger.error(f"trim_inventory_detailed: unexpected error: {e}", exc_info=True)
        return {}


def trim_datasource_entry(source: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim a single datasource entry to essential fields.
    
    Keeps: datasourceName, sourceType, retrievalMethod, geographicalLocation,
           startYear, endYear, subSector/subCategory names + refNumber, scope name,
           issue, scaleFactor, and compact data summary (recordsCount, co2eq values)
    Drops: datasourceId, records arrays, inventoryValues, publisher metadata, 
           long descriptions, methodologies, URLs, timestamps, etc.
    
    Returns compact summary suitable for LLM consumption.
    
    Args:
        source: Dictionary representing a datasource object
    
    Returns:
        Trimmed datasource dictionary. Returns empty dict if input is invalid.
    """
    try:
        # Validate input type
        if source is None:
            logger.warning("trim_datasource_entry: received None source")
            return {}
        
        if not isinstance(source, dict):
            logger.error(f"trim_datasource_entry: expected dict, got {type(source).__name__}")
            return {}
        
        if not source:
            logger.debug("trim_datasource_entry: received empty source dict")
            return {}
        
        trimmed: Dict[str, Any] = {}
        
        # Primary identifiers (datasourceId not used by agent, so omit it)
        datasource_name = source.get("datasourceName") or source.get("datasetName")
        if datasource_name:
            trimmed["datasourceName"] = datasource_name
        else:
            logger.warning("trim_datasource_entry: missing datasourceName and datasetName")
        
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
        subsector = source.get("subSector")
        if subsector is not None:
            try:
                if isinstance(subsector, dict):
                    if subsector.get("name"):
                        trimmed["subSector"] = subsector["name"]
                else:
                    trimmed["subSector"] = subsector
            except Exception as e:
                logger.warning(f"trim_datasource_entry: error processing subSector: {e}")
        
        subcategory = source.get("subCategory")
        if subcategory is not None:
            try:
                if isinstance(subcategory, dict):
                    if subcategory.get("name"):
                        trimmed["subCategory"] = subcategory["name"]
                else:
                    trimmed["subCategory"] = subcategory
            except Exception as e:
                logger.warning(f"trim_datasource_entry: error processing subCategory: {e}")
        
        # Reference number if available
        if source.get("referenceNumber"):
            trimmed["referenceNumber"] = source["referenceNumber"]
        
        # Scope (keep name only) - can be dict or string
        scope_obj = source.get("scope")
        if scope_obj is not None:
            try:
                if isinstance(scope_obj, dict):
                    if scope_obj.get("name"):
                        trimmed["scope"] = scope_obj["name"]
                else:
                    trimmed["scope"] = scope_obj
            except Exception as e:
                logger.warning(f"trim_datasource_entry: error processing scope: {e}")
        
        # Applicability/issues
        if source.get("issue"):
            trimmed["issue"] = source["issue"]
        if source.get("scaleFactor") is not None:
            trimmed["scaleFactor"] = source["scaleFactor"]
        
        # Compact data summary from 'data' field
        data_obj = source.get("data")
        if data_obj is not None:
            try:
                if not isinstance(data_obj, dict):
                    logger.warning(f"trim_datasource_entry: data is {type(data_obj).__name__}, expected dict")
                else:
                    data_summary: Dict[str, Any] = {}
                    
                    # Extract key totals if available
                    totals = data_obj.get("totals")
                    if totals is not None:
                        if not isinstance(totals, dict):
                            logger.warning(f"trim_datasource_entry: totals is {type(totals).__name__}, expected dict")
                        else:
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
            except Exception as e:
                logger.warning(f"trim_datasource_entry: error processing data field: {e}")
        
        return trimmed
    
    except Exception as e:
        logger.error(f"trim_datasource_entry: unexpected error: {e}", exc_info=True)
        return {}


def trim_datasources_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Trim a datasources API response to only successful sources with trimmed payloads.
    
    Input shape: { data: { successfulSources[], removedSources[], failedSources[] }, ... }
    Output shape: { data: [trimmed datasource], ... }
    
    Only returns successful sources (drops removed and failed).
    Each source is trimmed via trim_datasource_entry().
    
    Args:
        response: Dictionary with datasources response including successfulSources array
    
    Returns:
        Dictionary with trimmed sources. Returns empty data array if invalid.
    """
    try:
        # Validate input type
        if response is None:
            logger.warning("trim_datasources_response: received None response")
            return {"data": []}
        
        if not isinstance(response, dict):
            logger.error(f"trim_datasources_response: expected dict, got {type(response).__name__}")
            return {"data": []}
        
        if not response:
            logger.debug("trim_datasources_response: received empty response dict")
            return {"data": []}
        
        data_obj = response.get("data")
        if data_obj is None:
            logger.warning("trim_datasources_response: missing 'data' field in response")
            return {"data": []}
        
        if not isinstance(data_obj, dict):
            logger.error(f"trim_datasources_response: data is {type(data_obj).__name__}, expected dict")
            return {"data": []}
        
        successful_sources = data_obj.get("successfulSources")
        if successful_sources is None:
            logger.warning("trim_datasources_response: missing 'successfulSources' in data")
            successful_sources = []
        
        if not isinstance(successful_sources, list):
            logger.error(f"trim_datasources_response: successfulSources is {type(successful_sources).__name__}, expected list")
            successful_sources = []
        
        # Trim each successful source
        trimmed_sources: List[Dict[str, Any]] = []
        for i, source in enumerate(successful_sources):
            try:
                if source is None:
                    logger.warning(f"trim_datasources_response: skipping null source at index {i}")
                    continue
                if not isinstance(source, dict):
                    logger.warning(f"trim_datasources_response: skipping non-dict source at index {i} ({type(source).__name__})")
                    continue
                trimmed = trim_datasource_entry(source)
                trimmed_sources.append(trimmed)
            except Exception as e:
                logger.error(f"trim_datasources_response: error trimming source at index {i}: {e}")
                continue
        
        result: Dict[str, Any] = {"data": trimmed_sources}
        
        # Preserve top-level error info if present
        if response.get("error"):
            result["error"] = response["error"]
        if response.get("error_code"):
            result["error_code"] = response["error_code"]
        
        if trimmed_sources:
            logger.debug(f"trim_datasources_response: trimmed {len(trimmed_sources)} sources from response")
        else:
            logger.warning("trim_datasources_response: no sources in successful_sources array")
        
        return result
    
    except Exception as e:
        logger.error(f"trim_datasources_response: unexpected error: {e}", exc_info=True)
        return {"data": []}


def trim_vector_search_matches(matches: List[Dict[str, Any]], top_k: int = 3) -> List[Dict[str, Any]]:
    """
    Trim vector search match results to top-k results.
    
    Keeps: filename, chunk_index, score, content (full, not truncated)
    Drops: file_path, distance, model_name (metadata noise)
    
    Args:
        matches: List of match dictionaries from vector search
        top_k: Maximum number of results to return (default: 3, configurable from llm_config.yaml)
    
    Returns:
        List of trimmed matches (max top_k).
    """
    try:
        if not matches:
            return []
        
        trimmed_matches: List[Dict[str, Any]] = []
        for match in matches[:top_k]:  # Limit to top_k (configurable)
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
        
        logger.debug(f"trim_vector_search_matches: trimmed to {len(trimmed_matches)} of {len(matches)} matches (top_k={top_k})")
        return trimmed_matches
    
    except Exception as e:
        logger.error(f"trim_vector_search_matches: error trimming vector search results: {e}", exc_info=True)
        return []

