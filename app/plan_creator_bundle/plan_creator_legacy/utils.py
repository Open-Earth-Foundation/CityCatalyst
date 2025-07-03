from pathlib import Path
import json
import logging

logger = logging.getLogger(__name__)

# Define output directory
output_dir = Path(__file__).parent / "data" / "output"
logger.info(f"Output directory set to: {output_dir}")

# Define city data path
city_data_path = Path(__file__).parent / "data" / "city_data.json"
logger.info(f"City data path set to: {city_data_path}")


def load_city_data(city_data_path: Path):
    """Load city data from JSON file."""
    try:
        logger.info(f"Loading city data from {city_data_path}")
        with open(city_data_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading city data: {str(e)}", exc_info=True)
        raise


def get_city_by_name(city_name: str):
    """Get city data by name."""
    city_data = load_city_data(city_data_path)
    city_name_lower = city_name.lower()
    for city in city_data:
        if city["name"].lower() == city_name_lower:
            logger.info(f"Found city data for: {city['name']}")
            return city
    logger.error(f"City not found: {city_name}")
    raise ValueError(f"City not found: {city_name}")
