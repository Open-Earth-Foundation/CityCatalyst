import pandas as pd
import argparse
import uuid
import os
import duckdb


#--------------------------------------------------------------------------
    # Pre Process
#--------------------------------------------------------------------------

con = duckdb.connect()
con.install_extension("spatial")
con.load_extension("spatial")

df = con.execute("""SELECT  Field1 AS Year,
                        Field2 AS Month,
                        Field3 AS Machine,
                        Field4 AS Center,
                        Field5 AS Agent,
                        Field6 AS Agent_Desc,
                        Field7 AS Region,
                        Field8 AS Provence,
                        Field9 AS Country,
                        Field10 AS Machine_Type,
                        Field11 AS Source_Generation,
                        Field12 AS Technology,
                        Field13 AS Hydraulic_Category,
                        Field14 AS Category_Region,
                        Field15 AS Net_Generation_MWh
                FROM ST_read("raw_cammesa_monthly_electricity_generation.xlsx") WHERE Field1 IS NOT NULL OFFSET 13""").df()

# Close the connection
con.close()