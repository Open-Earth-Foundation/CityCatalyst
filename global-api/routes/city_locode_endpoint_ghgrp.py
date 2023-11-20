#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException
import math
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gpc_quality_data = "TBD"
gpc_quality_EF = "TBD"


def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


# Extract the data by locode, year and sector/subsector
def db_query(locode, year, reference_number):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM "GHGRP_EPA"
            WHERE reference_number = :"GPC_ref_no"
            AND locode = :locode
            AND year = :year;
            """
        )

        params = {"locode": locode, "year": year, "reference_number": reference_number}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/ghgrp_epa/city/{locode}/{year}/{gpcReferenceNumber}")
def get_emissions_by_city_and_year(locode: str, year: int, gpcReferenceNumber: str):

    records = db_query(locode, year, gpcReferenceNumber)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    df = pd.DataFrame(records)

    totals = {
        "emissions": {
            "co2_e": df.sum("emissions_quantity"),
            "gpc_quality": str(gpc_quality_data),
        }
    }

    list_of_points = []

    for _, row_data in df.iterrows():
        row = row_data.to_frame().T

        gas = row["gas"].item()

        conditions = [
            not_nan_or_none(row["emissions_quantity"].item()),
        ]

        if all(conditions):

            ownership = {
                "facility_name": row["Facility Name"].item(),
                "facility_id": row["Facility Id"].item(),
                "lat": row["Latitude"].to_string(index=False, header=False).strip(),
                "lon": row["Longitude"].to_string(index=False, header=False).strip(),
            }

            industry_type = {
                "sectors": row["Industry Type (sectors)"].item(),
                "subparts": row["Industry Type (subparts)"].item(),
                "final_sector": row["final_sector"].item(),
                "final_subpart": row["final_subpart_ghgrp"].item(),
            }

            emissions = {
                "gas": gas,
                "value": row["emissions_quantity"]
                .to_string(index=False, header=False)
                .strip(),
                "units": row["emissions_quantity_units"].item(),
                "gpc_quality": str(gpc_quality_data),
            }

            point_data = {
                "ownership": ownership,
                "industry_type": industry_type,
                "emissions": emissions,
            }

            list_of_points.append(point_data)

    points = {"points": list_of_points}

    return {**totals, **points}