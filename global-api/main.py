import logging
import uvicorn
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.middleware.cors import CORSMiddleware

from settings import settings
from utils.helpers import get_or_create_log_file
from routes.health import api_router as health_check_route
from routes.city_locode_endpoint_climatetrace import api_router as climatetrace_city_locode_route
from routes.city_boundaries_endpoint import api_router as city_boundaries_route
from routes.city_locode_endpoint_crosswalk import api_router as crosswalk_city_locode_route
from routes.city_locode_endpoint_edgar import api_router as edgar_city_locode_route
from routes.catalogue_endpoint import api_router as catalouge_route
from routes.catalogue_last_update_endpoint import api_router as catalogue_last_update_endpoint
from routes.city_locode_endpoint_ghgrp import api_router as ghgrp_city_locode_route
from routes.region_code_endpoint import api_router as region_code_endpoint_route
from routes.country_code_endpoint import api_router as country_code_endpoint_route
from routes.citywide_emission_endpoint import api_router as citywide_route
from routes.ghgi_emissions import api_router as actor_emissions_route
from routes.ccra_assessment import api_router as ccra_assessment
from routes.ghgi_emission_forecast import api_router as emission_forecast

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


"""
FastApi application instance intialized with `title` and `debug mode`
"""
app = FastAPI(title=settings.PROJECT_NAME, debug=True)

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
        description="",
        routes=app.routes,
    )
    # you can also add the url of your logo image.
    openapi_schema["info"]["x-logo"] = {"url": ""}
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

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
    crosswalk_city_locode_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    edgar_city_locode_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    climatetrace_city_locode_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    ghgrp_city_locode_route,
    tags=["GHGI Emissions"],
)

app.include_router(
    country_code_endpoint_route,
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

## Endpoints for CCRA

app.include_router(
    ccra_assessment,
    tags=["CCRA Assessment"],
)



"""
Entry point of the fastapi application (Drive Code)
    - change the port number if port is already occupied
    - modify the logging level according to the need
"""

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="debug", reload=True)
