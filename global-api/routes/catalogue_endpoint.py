from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse, PlainTextResponse
from db.database import SessionLocal
from models.datasource import Datasource
from typing import Optional
import csv
import io

api_router = APIRouter(prefix="/api/v0")


@api_router.get("/catalogue")
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
