import pandas as pd
import argparse
import os
from sqlalchemy import create_engine
from sqlalchemy.sql import text

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database_uri",
        help="database URI (e.g. postgresql://ccglobal:@localhost/ccglobal)",
        default=os.environ.get("DB_URI"),
    )
    args = parser.parse_args()

    df = pd.read_csv('./pilot_city_extract.csv')

    # Create a SQLAlchemy engine
    engine = create_engine(args.database_uri)

    # Write the DataFrame to the database table
    df.to_sql('edgar_emissions_extract', engine, if_exists='replace', index=False)

    sql_query = f"""
                INSERT INTO public."GridCellEdgar"
                SELECT 		gen_random_uuid() as ID, a.*   
                FROM 		(
                SELECT 		DISTINCT ee.cell_lat, ee.cell_lon, ee.geometry, ee.area, current_timestamp as created_date, current_timestamp as modified_date
                FROM 		edgar_emissions_extract ee
                LEFT JOIN 	public."GridCellEdgar" gce ON ee.cell_lat = gce.lat_center AND ee.cell_lon = gce.lon_center
                WHERE 		gce.lat_center IS NULL AND gce.lon_center IS NULL
                            ) a;

                INSERT INTO public."CityCellOverlapEdgar"
                SELECT 		gen_random_uuid() as ID, a.*
                FROM 		(
                SELECT 		DISTINCT 
                            e.locode,
                            e.fraction_in_city,
                            id.id as cell_id,
                            current_timestamp as created_date,
                            current_timestamp as modified_date,
                            e.cell_lat,
                            e.cell_lon
                FROM 		edgar_emissions_extract e
                LEFT JOIN   public."GridCellEdgar" id
                ON 			id.lat_center = e.cell_lat AND id.lon_center = e.cell_lon
                LEFT JOIN 	public."CityCellOverlapEdgar" ccoe 
                ON 			e.locode = cast(ccoe.locode as text)
                AND 		e.fraction_in_city = cast(ccoe.fraction_in_city as double precision)
                AND 		cast(e.cell_lat as int) = ccoe.cell_lat
                AND 		cast(e.cell_lon as int) = ccoe.cell_lon
                WHERE 		ccoe.locode IS NULL 
                AND 		ccoe.fraction_in_city IS NULL 
                AND 		ccoe.cell_lat IS NULL 
                AND 		ccoe.cell_lon IS NULL) a;

                INSERT INTO public."GridCellEmissionsEdgar"
                SELECT 		gen_random_uuid() as ID, a.*
                FROM 		(
                SELECT 		DISTINCT 
                            e.year,
                            e.reference_number,
                            e.gas,
                            e.emissions_quantity,
                            e.emissions_quantity_units,
                            id.id as cell_id,
                            current_timestamp as created_date,
                            current_timestamp as modified_date,
                            e.cell_lat,
                            e.cell_lon			
                FROM 		edgar_emissions_extract e
                LEFT JOIN   public."GridCellEdgar" id
                ON 			id.lat_center = e.cell_lat AND id.lon_center = e.cell_lon
                LEFT JOIN	public."GridCellEmissionsEdgar" eem
                ON  		eem.year = e.year
                AND  		eem.reference_number = e.reference_number
                AND			eem.gas = e.gas 
                AND 		eem.cell_lat = cast(e.cell_lat as int)
                AND 		eem.cell_lon = cast(e.cell_lon as int)
                WHERE		eem.id IS NULL
                ) a;

                DROP TABLE edgar_emissions_extract;
                """

    with engine.connect() as connection:
        try:
            result = connection.execute(text(sql_query))
            connection.commit() 
            print("Query completed successfully.")
        except Exception as e:
            print("Error updating osm table:", e)
