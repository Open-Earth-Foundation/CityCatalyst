#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from fastapi import APIRouter, HTTPException
import math
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gpc_quality_data = "low"

def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


# Extract the data by locode, year and sector/subsector
def db_query(source_name, country_code, year, GPC_refno):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM country_code
            WHERE source_name = :source_name
            AND "GPC_refno" = :GPC_refno
            AND country_code = :country_code
            AND year = :year;
            """
        )
        params = {"source_name": source_name, "country_code": country_code, "year": year, "GPC_refno": GPC_refno}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/source/{source_name}/country/{country_code}/{year}/{GPC_refno}")
def get_emissions_by_country_and_year(source_name: str, country_code: str, year: str, GPC_refno: str):

    records = db_query(source_name, country_code, year, GPC_refno)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    df = pd.DataFrame(records)

    totals = {
        "emissions": {
            "gas_name": df["gas_name"],
            "emissions_value": df["emissions_value"],
            "emissions_units": df["emissions_units"],
            "gpc_quality": str(gpc_quality_data),
        }
    }

    return {**totals}