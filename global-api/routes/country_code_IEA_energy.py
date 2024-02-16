#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from fastapi import APIRouter, HTTPException
import math
from sqlalchemy import text
from db.database import SessionLocal

api_router = APIRouter(prefix="/api/v0")

gpc_quality_data = "low"

gas_to_gwp100 = {"co2": 1, "ch4": 29.8, "n2o": 273}
gas_to_gwp20 = {"co2": 1, "ch4": 82.5, "n2o": 273}

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

    totals = {
        "emissions": {
            "co2_mass": "0",
            "co2_co2eq": "0",
            "ch4_mass": "0",
            "ch4_co2eq_100yr": "0",
            "ch4_co2eq_20yr": "0",
            "n2o_mass": "0",
            "n2o_co2eq_100yr": "0",
            "n2o_co2eq_20yr": "0",
            "gpc_quality": str(gpc_quality_data),
        }
    }

    co2e = list(filter(lambda x: x["gas_name"] == "co2e", records))

    if (len(co2e) > 0):
        totals["emissions"]["co2eq_100yr"] = str(co2e[0]["emissions_value"])
        totals["emissions"]["co2eq_20yr"] = str(co2e[0]["emissions_value"])

    co2 = list(filter(lambda x: x["gas_name"] == "co2", records))

    if (len(co2) > 0):
        totals["emissions"]["co2_mass"] = str(co2[0]["emissions_value"])
        totals["emissions"]["co2_co2eq"] = str(co2[0]["emissions_value"])

    ch4 = list(filter(lambda x: x["gas_name"] == "ch4", records))

    if (len(ch4) > 0):
        totals["emissions"]["ch4_mass"] = str(ch4[0]["emissions_value"])
        totals["emissions"]["ch4_co2eq_100yr"] = str(ch4[0]["emissions_value"] * gas_to_gwp100["ch4"])
        totals["emissions"]["ch4_co2eq_20yr"] = str(ch4[0]["emissions_value"] * gas_to_gwp20["ch4"])

    n2o = list(filter(lambda x: x["gas_name"] == "n2o", records))

    if (len(n2o) > 0):
        totals["emissions"]["n2o_mass"] = str(n2o[0]["emissions_value"])
        totals["emissions"]["n2o_co2eq_100yr"] = str(n2o[0]["emissions_value"] * gas_to_gwp100["n2o"])
        totals["emissions"]["n2o_co2eq_20yr"] = str(n2o[0]["emissions_value"] * gas_to_gwp20["n2o"])

    return {**totals}