import logging
import uvicorn
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware

from settings import settings
from utils.helpers import get_or_create_log_file
from routes.legacy.health import api_router as health_check_route
from routes.legacy.city_boundaries_endpoint import api_router as city_boundaries_route
from routes.legacy.catalogue_endpoint import api_router as catalouge_route
from routes.legacy.catalogue_last_update_endpoint import (
    api_router as catalogue_last_update_endpoint,
)
from routes.legacy.region_code_endpoint import api_router as region_code_endpoint_route
from routes.legacy.citywide_emission_endpoint import api_router as citywide_route
from routes.legacy.ghgi_emissions import api_router as actor_emissions_route
from routes.legacy.ccra_assessment import api_router as ccra_assessment
from routes.legacy.city_adapta_risk import api_router as city_adapta_risk_route
from routes.legacy.ghgi_emission_forecast import api_router as emission_forecast
from routes.legacy.ghgi_notation_key import api_router as ghgi_notation_key_route
from routes.legacy.city_context import api_router as city_context_route
from routes.legacy.city_attribute import api_router as city_attributes_route
from routes.legacy.cities_search import api_router as cities_search_route
from routes.legacy.get_climate_actions import api_router as climate_actions_route
from routes.legacy.population_endpoint import api_router as population_route
from routes.legacy.projects import api_router as projects_route
from routes.legacy.finance_opportunities import api_router as finance_opportunities_route
from routes.legacy.city_action_financial_feasibility import api_router as city_action_financial_feasibility_route
from routes.legacy.city_action_finance_detail import api_router as city_action_finance_detail_route
from routes.legacy.city_finance_projects import api_router as city_finance_projects_route
from routes.legacy.city_action_policy_scores import api_router as city_action_policy_scores_route
from routes.legacy.city_action_mitigation_feasibility_scores import api_router as city_action_mitigation_feasibility_scores_route
from routes.legacy.actions_pathway import api_router as actions_pathway_route
from routes.legacy.action_legal_assessments import api_router as action_legal_assessments_route
from routes.legacy.emissionfactor_publisher_endpoint import api_router as emissionfactor_publisher_route
from routes.legacy.emissionfactor_methodology_endpoint import api_router as emissionfactor_methodology_route
from routes.legacy.emissionfactor_datasource_endpoint import api_router as emissionfactor_datasource_route
from routes.legacy.emissionfactor_emissionfactor_datasource_endpoint import api_router as emissionfactor_emissionfactor_datasource_route
from routes.legacy.emissionfactor_emissionsfactor_endpoint import api_router as emissionfactor_emissionsfactor_route
# Formula Input endpoints
from routes.legacy.formulainput_publisher_endpoint import api_router as formulainput_publisher_route
from routes.legacy.formulainput_methodology_endpoint import api_router as formulainput_methodology_route
from routes.legacy.formulainput_datasource_endpoint import api_router as formulainput_datasource_route
from routes.legacy.formulainput_formulainput_datasource_endpoint import api_router as formulainput_formulainput_datasource_route
from routes.legacy.formulainput_formulainput_endpoint import api_router as formulainput_formulainput_route

"""
Logger instance initialized and configured
    - filename  Name of the file where all the logs will be stored.
    - encoding  If specified together with a filename, this encoding is passed to
                the created FileHandler, causing it to be used when the file is opened.
    - level     Set the root logger level to the specified level.
    - format    Use the specified format string for the handler.
    - datefmt   Use the specified date/time format.
"""

logging.basicConfig(
    filename=get_or_create_log_file("logs/api.log"),
    encoding="utf-8",
    level=logging.DEBUG,
    format="%(asctime)s:%(levelname)s:%(pathname)s:%(message)s",
    datefmt=("%Y-%m-%d %H:%M:%S"),
)
logger = logging.getLogger(__name__)


APP_DESCRIPTION = """
The CityCatalyst Global API serves city-scale climate data (emissions, risk, finance, actions).

### API versions

This server exposes two API versions. Use the **version selector** in the top-right to switch between them.

- **v0 / v1** — the established endpoints. Stable and supported; current integrations rely on them.
- **v2** — the next iteration of the API, with self-describing responses.
"""

# Tag descriptions render as section intros in the docs. Order here = order in the page.
TAGS_METADATA = [
    {"name": "Database Health Check", "description": "Service and database liveness."},
    {"name": "City Definitions", "description": "City identity: boundaries, area, population, context, search."},
    {"name": "Datasource Catalogue", "description": "Available datasources and their last-update times."},
    {"name": "GHGI Emissions", "description": "Greenhouse-gas inventory emissions by GPC scope."},
    {"name": "GHGI Emission Factors", "description": "Emission-factor reference data."},
    {"name": "GHGI Formula Inputs", "description": "Formula-input reference data."},
    {"name": "CCRA Assessment", "description": "Climate Change Risk Assessment data."},
    {"name": "Climate Actions", "description": "Mitigation and adaptation actions."},
    {"name": "Projects", "description": "Project records."},
    {"name": "Climate Finance", "description": "Funding opportunities and financial feasibility."},
    {"name": "Policy Signals", "description": "Action policy scoring."},
    {"name": "Action Mitigation Feasibility", "description": "Mitigation feasibility scoring."},
    {"name": "Action Pathways", "description": "Mitigation action pathways."},
    {"name": "Action Legal Assessments", "description": "Legal viability assessments per action."},
]

"""
FastApi application instance: legacy (v0/v1) surface, with a version selector pointing at
both the legacy spec and the mounted v2 spec.
"""
app = FastAPI(
    title=settings.PROJECT_NAME,
    description=APP_DESCRIPTION,
    version="1.0",
    openapi_tags=TAGS_METADATA,
    debug=True,
    docs_url=None,  # default /docs disabled; replaced by a custom page with the version selector below
)

"""
Middleware to allow CORS for all routes, methods and origins
"""
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

"""
Function to generate custom OpenAPI documentation
"""


def custom_openapi():
    # check if the OpenApI schema has already been generated
    if app.openapi_schema:
        return app.openapi_schema
    """
    generate the OpenAPI schema using the get_openapi function
        - title  Title of Fastapi application.
        - version  Current Version of the application.
        - description  Add some description about the application.
    """
    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version="1.0",
        description=APP_DESCRIPTION,
        routes=app.routes,
        tags=TAGS_METADATA,
    )
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


# Custom Swagger UI with a version selector (top-right dropdown). Uses ONLY `urls` so
# Swagger UI loads the selected spec; the standalone preset provides the dropdown topbar.
from fastapi.responses import HTMLResponse  # noqa: E402

_DOCS_HTML = """<!DOCTYPE html>
<html>
<head>
  <title>CityCatalyst Global API - Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      urls: [
        {name: "v0 / v1", url: "/openapi.json"},
        {name: "v2", url: "/api/v2/openapi.json"}
      ],
      "urls.primaryName": "v0 / v1",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
      layout: "StandaloneLayout"
    });
  </script>
</body>
</html>"""


@app.get("/docs", include_in_schema=False)
def custom_docs() -> HTMLResponse:
    return HTMLResponse(_DOCS_HTML)


# Endpoints for Health
@app.get("/")
def read_root():
    return {"message": "Welcome"}


app.include_router(
    health_check_route,
    tags=["Database Health Check"],
)

## Endpoints for City Definitions

app.include_router(
    city_boundaries_route,
    tags=["City Definitions"],
)

app.include_router(
    city_context_route,
    tags=["City Definitions"],
)

app.include_router(
    city_attributes_route,
    tags=["City Definitions"],
)

app.include_router(
    population_route,
    tags=["City Definitions"],
)

app.include_router(
    cities_search_route,
    tags=["City Definitions"],
)

## Endpoints for Catalogue Definitions

app.include_router(
    catalouge_route,
    tags=["Datasource Catalogue"],
)

app.include_router(
    catalogue_last_update_endpoint,
    tags=["Datasource Catalogue"],
)

## Endpoints for GHGI Emissions
app.include_router(
    actor_emissions_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    emission_forecast,
    tags=["GHGI Emissions"],
)

app.include_router(
    ghgi_notation_key_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    citywide_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    region_code_endpoint_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    emissionfactor_publisher_route,
    tags=["GHGI Emission Factors"],
)

app.include_router(
    emissionfactor_methodology_route,
    tags=["GHGI Emission Factors"],
)

app.include_router(
    emissionfactor_datasource_route,
    tags=["GHGI Emission Factors"],
)

app.include_router(
    emissionfactor_emissionfactor_datasource_route,
    tags=["GHGI Emission Factors"],
)

app.include_router(
    emissionfactor_emissionsfactor_route,
    tags=["GHGI Emission Factors"],
)

# Formula Input endpoints
app.include_router(
    formulainput_publisher_route,
    tags=["GHGI Formula Inputs"],
)

app.include_router(
    formulainput_methodology_route,
    tags=["GHGI Formula Inputs"],
)

app.include_router(
    formulainput_datasource_route,
    tags=["GHGI Formula Inputs"],
)

app.include_router(
    formulainput_formulainput_datasource_route,
    tags=["GHGI Formula Inputs"],
)

app.include_router(
    formulainput_formulainput_route,
    tags=["GHGI Formula Inputs"],
)

## Endpoints for CCRA

app.include_router(
    ccra_assessment,
    tags=["CCRA Assessment"],
)

app.include_router(
    city_adapta_risk_route,
    tags=["CCRA Assessment"],
)

## Endpoints for CAP

app.include_router(
    climate_actions_route,
    tags=["Climate Actions"],
)

## Endpoints for Projects

app.include_router(
    projects_route,
    tags=["Projects"],
)

## Endpoints for Climate Finance

app.include_router(
    finance_opportunities_route,
    tags=["Climate Finance"],
)

app.include_router(
    city_action_financial_feasibility_route,
    tags=["Climate Finance"],
)

app.include_router(
    city_action_finance_detail_route,
    tags=["Climate Finance"],
)

app.include_router(
    city_finance_projects_route,
    tags=["Climate Finance"],
)

app.include_router(
    city_action_policy_scores_route,
    tags=["Policy Signals"],
)

app.include_router(
    city_action_mitigation_feasibility_scores_route,
    tags=["Action Mitigation Feasibility"],
)

app.include_router(
    actions_pathway_route,
    tags=["Action Pathways"],
)

app.include_router(
    action_legal_assessments_route,
    tags=["Action Legal Assessments"],
)

"""
v2 surface, mounted as its own sub-application.

Mounting (rather than including the router on the main app) gives v2 a self-contained,
clean docs page at /api/v2/docs that shows ONLY v2 - the canonical view of the new surface.
The mount point supplies the /api/v2 path segment, which is why v2_router is prefix-less.
The legacy /docs version selector points at this sub-app's spec (/api/v2/openapi.json).
"""
from routes.v2 import v2_router  # noqa: E402

V2_DESCRIPTION = (
    "Version 2 of the API, with self-describing responses"
)

v2_app = FastAPI(
    title=f"{settings.PROJECT_NAME} — v2",
    description=V2_DESCRIPTION,
    version="2.0",
    openapi_tags=[{"name": "Climate Finance", "description": "Funding opportunities (v2)."}],
)
v2_app.include_router(v2_router)
app.mount("/api/v2", v2_app)


"""
Entry point of the fastapi application (Drive Code)
    - change the port number if port is already occupied
    - modify the logging level according to the need
"""

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="debug", reload=True)
