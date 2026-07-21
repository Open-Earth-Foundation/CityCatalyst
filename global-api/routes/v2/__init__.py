"""The v2 API surface, assembled in one place.

This is where the version prefix is set - ONCE - instead of being hardcoded into every route
file the way v0/v1 do it. Each resource module under routes/v2/ defines a prefix-less router;
this package mounts them all under /api/v2. "What is in v2" is answerable by reading this file.

To add a resource to v2: write routes/v2/<resource>.py with a prefix-less `api_router`,
import it here, and include it. That's the whole checklist.
"""
from fastapi import APIRouter

from routes.v2 import finance

# No prefix here: the v2 surface is mounted as a sub-app at /api/v2 in main.py, so the
# mount point supplies the version segment (and gives v2 its own /api/v2/docs). Wiring
# code that includes this router supplies the /api/v2 prefix once, externally.
v2_router = APIRouter()
v2_router.include_router(finance.api_router, tags=["Climate Finance"])

# Future v2 resources land here as they're migrated to the conformance standard:
# v2_router.include_router(emissions.api_router, tags=["GHGI Emissions"])
# v2_router.include_router(cities.api_router,    tags=["City Definitions"])
# v2_router.include_router(catalog.api_router,   tags=["Datasource Catalogue"])
