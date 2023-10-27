from fastapi import APIRouter
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

def db_query():
    columns = [
        "datasource_id",
        "name",
        "source_type",
        "url",
        "description",
        "access_type",
        "geographical_location",
        "start_year",
        "end_year",
        "latest_accounting_year",
        "frequency_of_update",
        "spatial_resolution",
        "language",
        "accessibility",
        "data_quality",
        "notes",
        "units",
        "methodology_url",
        "publisher_id",
        "retrieval_method",
        "api_endpoint",
        "gpc_reference_number",
        "created_date",
        "modified_date"
    ]

    column_names = ', '.join(columns)

    with SessionLocal() as session:
        query = text(
            """
            SELECT {}
            FROM datasource;
            """.format(column_names)
        )
        result = session.execute(query).fetchall()

    return result


@api_router.get("/catalogue")
def get_datasources():
    records = db_query()

    df = pd.DataFrame(records)

    list_of_points = []
    for _, row in df.iterrows():
        data = row.replace({None: ""}).to_dict()
        list_of_points.append(data)

    response = {"datasources": list_of_points}

    return response
