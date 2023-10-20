import csv
from datetime import datetime
from gpc_datamodel import GPC, Sector, SubSector, SubCategory
import os
from pathlib import Path
from utils import uuid_generate_v3, write_dic_to_csv, make_dir

SUBSECTORS_WITH_SCOPES = ['IPPU', 'AFOLU']

def filter_list_of_dicts(lst, key):
    """filter a lister of diciontaries based on key"""
    unique_ids = set()
    filtered_list = []
    for dic in lst:
        dic_id = dic[key]
        if dic_id not in unique_ids:
            unique_ids.add(dic_id)
            filtered_list.append(dic)
    return filtered_list


if __name__ == "__main__":
    # output directory
    output_dir = "../data_processed"
    output_dir = os.path.abspath(output_dir)
    make_dir(path=Path(output_dir).as_posix())

    # raw data file path
    input_fl = "../data_raw/GPC_1.1_schema.csv"
    input_fl = os.path.abspath(input_fl)

    # current time
    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d")

    # ---------------------------
    # create GPC object
    # ---------------------------
    sectors = []
    subsectors = []
    subcategories = []

    with open(input_fl, "r") as csv_file:
        for row in csv.DictReader(csv_file):
            sector_name = row["sector"]
            subsector_name = row["subsector"]
            subcategory_name = row["subcategory"]
            sector = Sector(sector_name, row["sector_refno"])
            sectors.append(sector)

            if any(term in sector_name for term in SUBSECTORS_WITH_SCOPES):
                subsector_scope = row["scope"]
            else:
                subsector_scope = ''

            subsector = SubSector(
                sector,
                subsector_name,
                row["subsector_refno"],
                subsector_scope,
                row["reporting_level"],
            )
            subsectors.append(subsector)
            subcategory = SubCategory(
                subsector,
                subcategory_name,
                row["subcategory_refno"],
                row["scope"],
                row["reporting_level"],
            )
            subcategories.append(subcategory)

    gpc = GPC(
        sectors=list(set(sectors)),
        subsectors=list(set(subsectors)),
        subcategories=list(set(subcategories)),
    )

    # ---------------------------
    # Scope.csv
    # ---------------------------
    scope_data = [
        {
            "scope_id": uuid_generate_v3(name=scope),
            "scope_name": scope,
            "created": now_str,
            "last_updated": now_str,
        }
        for scope in gpc.list_scopes()
    ]
    scope_ids = {data["scope_name"]: data["scope_id"] for data in scope_data}
    write_dic_to_csv(output_dir, "Scope", scope_data)

    # ---------------------------
    # ReportingLevel.csv
    # ---------------------------
    reportinglevel_data = [
        {
            "reportinglevel_id": uuid_generate_v3(name=reportinglevel),
            "reportinglevel_name": reportinglevel,
            "created": now_str,
            "last_updated": now_str,
        }
        for reportinglevel in gpc.list_reporting_levels()
    ]

    reportinglevel_ids = {
        data["reportinglevel_name"]: data["reportinglevel_id"]
        for data in reportinglevel_data
    }
    write_dic_to_csv(output_dir, "ReportingLevel", reportinglevel_data)

    # ---------------------------
    # Sector.csv
    # ---------------------------
    sector_data = [
        {
            "sector_id": uuid_generate_v3(name=sector),
            "sector_name": sector,
            "reference_number": gpc.sector_refno(sector),
            "created": now_str,
            "last_updated": now_str,
        }
        for sector in gpc.list_sectors()
    ]

    sector_ids = {data["sector_name"]: data["sector_id"] for data in sector_data}
    write_dic_to_csv(output_dir, "Sector", sector_data)

    # -----------------------------------
    # SubCategory.csv / SubSector.csv
    # -----------------------------------
    subsector_data = []
    subcategory_data = []

    for sector in gpc.list_sectors():
        sector_id = sector_ids.get(sector)
        for subsector in gpc.list_subsectors(sector):
            sector_and_subsector = " ".join([sector, subsector])
            subsector_id = uuid_generate_v3(name=sector_and_subsector)
            subsector_scope = gpc.subsector_scope(sector=sector, subsector=subsector)
            subsector_scope_id = scope_ids.get(subsector_scope)
            subsector_data.append(
                {
                    "sector_id": sector_id,
                    "subsector_id": subsector_id,
                    "subsector_name": subsector,
                    "reference_number": gpc.subsector_refno(sector, subsector),
                    "scope_id": subsector_scope_id
                }
            )
            for subcategory in gpc.list_subcategories(
                sector=sector, subsector=subsector
            ):
                sector_subsector_subcategory = " ".join(
                    [sector, subsector, subcategory]
                )
                subcategory_id = uuid_generate_v3(name=sector_subsector_subcategory)
                refno = gpc.subcategory_refno(
                    sector=sector, subsector=subsector, subcategory=subcategory
                )
                scope = gpc.subcategory_scope(
                    sector=sector, subsector=subsector, subcategory=subcategory
                )
                reporting_level = gpc.subcategory_reporting_level(
                    sector=sector, subsector=subsector, subcategory=subcategory
                )
                scope_id = scope_ids.get(scope)
                reportinglevel_id = reportinglevel_ids.get(reporting_level)
                subcategory_data.append(
                    {
                        "subcategory_id": subcategory_id,
                        "subsector_id": subsector_id,
                        "subcategory_name": subcategory,
                        "reference_number": gpc.subcategory_refno(sector, subsector, subcategory),
                        "scope_id": scope_id,
                        "reportinglevel_id": reportinglevel_id,
                        "created": now_str,
                        "last_updated": now_str,
                    }
                )

    # filter subcategory to remove ones without names (IPPU and AFOLU)
    subcategory_data = [obj for obj in subcategory_data if obj.get("subcategory_name")]

    # filter to only keep unique ids
    subcategory_data = filter_list_of_dicts(subcategory_data, "subcategory_id")
    subsector_data = filter_list_of_dicts(subsector_data, "subsector_id")

    write_dic_to_csv(output_dir, "SubSector", subsector_data)
    write_dic_to_csv(output_dir, "SubCategory", subcategory_data)
