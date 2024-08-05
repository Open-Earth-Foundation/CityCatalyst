from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from db.database import SessionLocal
from models.datasource import Datasource
from typing import Optional
from sqlalchemy import text
import csv
import io

api_router = APIRouter(prefix="/api/v0")

## to be deprecated ##
@api_router.get("/catalogue")
def get_datasources(format: Optional[str] = None):

    records = None

    with SessionLocal() as session:
        query = text("""
            SELECT datasource_id, 
                publisher_id, 
                source_type, 
                dataset_url, 
                access_type, 
                geographical_location, 
                start_year, 
                end_year, 
                latest_accounting_year, 
                frequency_of_update, 
                spatial_resolution, 
                "language", 
                accessibility, 
                data_quality, 
                notes, 
                units, 
                methodology_url, 
                retrieval_method, 
                api_endpoint, 
                gpc_reference_number, 
                created_date, 
                modified_date, 
                datasource_name, 
                "scope", 
                dataset_name->>'en'::varchar as dataset_name, 
                dataset_description->>'en'::varchar as dataset_description, 
                methodology_description->>'en'::varchar as methodology_description, 
                transformation_description->>'en'::varchar as transformation_description
            FROM public.datasource
            ORDER BY gpc_reference_number DESC;
        """)
        result = session.execute(query)
        records = result.mappings().all()

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    if format == "csv":
        output = io.StringIO()
        csvwriter = csv.writer(output)
        names = [column.name for column in Datasource.__table__.columns]
        csvwriter.writerow(names)
        for datasource in records:
            csvwriter.writerow([getattr(datasource, name) for name in names])
        response = PlainTextResponse(content=output.getvalue(), media_type="text/csv")
    else:
        response = {"datasources": records}

    return response


@api_router.get("/catalogue/i18n")
def get_datasources(format: Optional[str] = None):

    records = None

    with SessionLocal() as session:
        query = session.query(Datasource).order_by(Datasource.gpc_reference_number.desc())
        records = query.all()

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    if format == "csv":
        output = io.StringIO()
        csvwriter = csv.writer(output)
        names = [column.name for column in Datasource.__table__.columns]
        csvwriter.writerow(names)
        for datasource in records:
            csvwriter.writerow([getattr(datasource, name) for name in names])
        response = PlainTextResponse(content=output.getvalue(), media_type="text/csv")
    else:
        response = {"datasources": records}

    return response
