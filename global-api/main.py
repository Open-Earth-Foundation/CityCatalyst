import logging
import uvicorn
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from settings import settings
from utils.helpers import get_or_create_log_file
from routes.health import api_router as health_check_route
from routes.city_locode_endpoint import api_router as city_locode_route
from routes.city_boundaries_endpoint import api_router as city_boundaries_route

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
app = FastAPI(title=settings.PROJECT_NAME, debug=settings.DEBUG,)

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


@app.get("/")
def read_root():
    return {"message": "Welcome"}


app.include_router(
    health_check_route,
    tags=["Database Health Check"],
)
app.include_router(
    city_locode_route,
    tags=["Climate Trace"],
)

app.include_router(
    city_boundaries_route,
    tags=["Climate Trace"],
)

""" 
Entry point of the fastapi application (Drive Code)
    - change the port number if port is already occupied
    - modify the logging level according to the need
"""

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="debug", reload=True)
