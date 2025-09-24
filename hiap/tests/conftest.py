"""
Pytest configuration and shared fixtures.
"""

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Add project root (hiap/) and app directory (hiap/app) to sys.path so
# unqualified imports in main.py (e.g., `prioritizer`, `utils`) resolve
project_root = Path(__file__).resolve().parents[1]
app_dir = project_root / "app"
if str(app_dir) not in sys.path:
    sys.path.insert(0, str(app_dir))
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Provide dummy OPENAI_API_KEY for tests when not set
os.environ.setdefault("OPENAI_API_KEY", "sk-test")

# Import the FastAPI app from main (unqualified), matching production layout
import main  # type: ignore

app = main.app


@pytest.fixture
def client():
    """FastAPI test client fixture."""
    return TestClient(app)


@pytest.fixture
def sample_city_context():
    """Sample city context data for testing."""
    return {
        "locode": "BR RIO",
        "name": "Rio de Janeiro",
        "region": "BR-RJ",
        "regionName": "Rio de Janeiro State",
        "populationDensity": 5265.82,
        "area": 1200.77,
        "elevation": 31.0,
        "biome": "Atlantic Forest",
        "socioEconomicFactors": {"gdpPerCapita": 25000, "unemploymentRate": 8.5},
        "accessToPublicServices": {"education": 85.0, "healthcare": 78.0},
    }


@pytest.fixture
def sample_request_data():
    """Sample request data for testing."""
    return {
        "locode": "BR RIO",
        "populationSize": 6748000,
        "stationaryEnergyEmissions": 1500.0,
        "transportationEmissions": 2200.0,
        "wasteEmissions": 800.0,
        "ippuEmissions": 300.0,
        "afoluEmissions": 150.0,
    }


@pytest.fixture
def sample_climate_actions():
    """Sample list of climate actions for testing - includes both mitigation and adaptation."""
    return [
        {
            "ActionID": "c40_0010",
            "ActionName": {
                "en": "New Building Standards",
                "es": "Nuevos Estándares de Construcción",
                "pt": "Novos Padrões de Construção",
            },
            "ActionType": ["mitigation"],
            "Sector": ["stationary_energy"],
            "Subsector": ["residential_buildings"],
            "PrimaryPurpose": ["ghg_reduction"],
            "Description": {
                "en": "New Building Standards for environmentally responsible construction",
                "es": "Estándares de construcción ambientalmente responsables",
                "pt": "Padrões de construção ambientalmente responsáveis",
            },
            "CoBenefits": {
                "air_quality": 1,
                "water_quality": 0,
                "habitat": 0,
                "cost_of_living": 0,
                "housing": -1,
                "mobility": 0,
                "stakeholder_engagement": 0,
            },
            "GHGReductionPotential": {
                "stationary_energy": "20-39",
                "transportation": None,
                "waste": None,
                "ippu": None,
                "afolu": None,
            },
            "AdaptationEffectiveness": None,
            "CostInvestmentNeeded": "low",
            "TimelineForImplementation": "<5 years",
            "biome": None,
        },
        {
            "ActionID": "c40_0020",
            "ActionName": {
                "en": "Flood Protection Infrastructure",
                "es": "Infraestructura de Protección contra Inundaciones",
                "pt": "Infraestrutura de Proteção contra Inundações",
            },
            "ActionType": ["adaptation"],
            "Sector": ["infrastructure"],
            "Subsector": ["water_management"],
            "PrimaryPurpose": ["climate_resilience"],
            "Description": {
                "en": "Flood protection infrastructure to enhance community resilience",
                "es": "Infraestructura de protección contra inundaciones para mejorar la resiliencia",
                "pt": "Infraestrutura de proteção contra inundações para melhorar a resiliência",
            },
            "CoBenefits": {
                "air_quality": 0,
                "water_quality": 1,
                "habitat": 1,
                "cost_of_living": 0,
                "housing": 1,
                "mobility": 0,
                "stakeholder_engagement": 1,
            },
            "GHGReductionPotential": {
                "stationary_energy": None,
                "transportation": None,
                "waste": None,
                "ippu": None,
                "afolu": None,
            },
            "AdaptationEffectiveness": "high",
            "CostInvestmentNeeded": "medium",
            "TimelineForImplementation": "5-10 years",
            "AdaptationEffectivenessPerHazard": {
                "droughts": None,
                "heatwaves": None,
                "floods": "high",
                "sea-level-rise": "medium",
                "landslides": None,
                "storms": "medium",
                "wildfires": None,
                "diseases": None,
            },
            "biome": None,
        },
    ]


@pytest.fixture
def sample_climate_action():
    """Single climate action for testing - returns first action from sample_climate_actions."""
    return sample_climate_actions()[0]


@pytest.fixture
def sample_city_data_request():
    """Sample CityData request for API testing - matches PrioritizerRequest model."""
    return {
        "cityData": {
            "cityContextData": {"locode": "BR RIO", "populationSize": 6748000},
            "cityEmissionsData": {
                "stationaryEnergyEmissions": 1500.0,
                "transportationEmissions": 2200.0,
                "wasteEmissions": 800.0,
                "ippuEmissions": 300.0,
                "afoluEmissions": 150.0,
            },
        },
        "language": ["en", "es", "pt"],
    }


@pytest.fixture
def sample_prioritizer_response():
    """Sample PrioritizerResponse for testing - matches the response model."""
    from datetime import datetime
    from prioritizer.models import (
        MetaData,
        RankedAction,
        Explanation,
        PrioritizerResponse,
    )

    metadata = MetaData(locode="BR RIO", rankedDate=datetime.now())

    explanation = Explanation(
        explanations={
            "en": "This action is highly effective for this city",
            "es": "Esta acción es muy efectiva para esta ciudad",
            "pt": "Esta ação é muito eficaz para esta cidade",
        }
    )

    ranked_action = RankedAction(actionId="TEST_001", rank=1, explanation=explanation)

    return PrioritizerResponse(
        metadata=metadata,
        rankedActionsMitigation=[ranked_action],
        rankedActionsAdaptation=[ranked_action],
    )


# Silence background logging from app threads after pytest finalizes capture
# to prevent "I/O operation on closed file" errors without changing app code.
@pytest.fixture(autouse=True, scope="session")
def silence_background_logging():
    import logging

    root_logger = logging.getLogger()
    # Detach and close any existing handlers that may write to closed streams later
    for handler in list(root_logger.handlers):
        try:
            handler.flush()
            handler.close()
        except Exception:
            pass
        root_logger.removeHandler(handler)

    # Add a NullHandler so logging calls are safely dropped
    root_logger.addHandler(logging.NullHandler())

    # Optionally quiet noisy namespaces
    logging.getLogger("app").setLevel(logging.ERROR)
    logging.getLogger("plan_creator_bundle").setLevel(logging.ERROR)
