#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException
import math
from sqlalchemy import text
import pandas as pd
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gpc_quality_data = "high"
gpc_quality_EF = "medium"


def not_nan_or_none(value):
    """return true if value is not nan, none, or empty"""
    if isinstance(value, float | int):
        return not math.isnan(value)
    return value is not None and value != ""


# Extract the data by locode, year and sector/subsector
def db_query(locode, year, GPC_ref_no):
    with SessionLocal() as session:
        query = text(
            """
            SELECT * FROM ghgrp_epa
            WHERE "GPC_ref_no" = :GPC_ref_no
            AND locode = :locode
            AND year = :year;
            """
        )
        params = {"locode": locode, "year": year, "GPC_ref_no": GPC_ref_no}
        result = session.execute(query, params).fetchall()

    return result


@api_router.get("/ghgrp_epa/city/{locode}/{year}/{gpcReferenceNumber}",
            summary="Get emissions from GHGRP EPA",
            description="DEPRECATED WARNING: This endpoint will be migrated to a new endpoint /api/v1/source/ghgrp_epa/city/{locode}/{year}/{gpcReferenceNumber} in the near future.")
def get_emissions_by_city_and_year(locode: str, year: str, gpcReferenceNumber: str):
    """
        Retrieves data from EPA on greenhouse gas emissions for a specific city identified by locode, for a given year and GPC reference number.
    """

    records = db_query(locode, year, gpcReferenceNumber)

    if not records:
        raise HTTPException(status_code=404, detail="No data available")

    df = pd.DataFrame(records)

    totals = {
        "totals": {
            "emissions": {
                "co2_mass": "0",
                "co2_co2eq": "0",
                "ch4_mass": "0",
                "ch4_co2eq_100yr": "0",
                "ch4_co2eq_20yr": "0",
                "n2o_mass": "0",
                "n2o_co2eq_100yr": "0",
                "n2o_co2eq_20yr": "0",
                "co2eq_100yr": str(int(round(df["emissions_quantity"].sum()))),
                "co2eq_20yr": "0",
                "gpc_quality": str(gpc_quality_data),
            }
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
                "facility_name": row["facility_name"].item(),
                "facility_id": row["facility_id"].item(),
                "lat": row["latitude"].to_string(index=False, header=False).strip(),
                "lon": row["longitude"].to_string(index=False, header=False).strip(),
            }

            industry_type = {
                "sectors": row["sectors"].item(),
                "subparts": row["subparts"].item(),
                "final_sector": row["final_sector"].item(),
                "final_subpart": row["subpart_name"].item(),
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
