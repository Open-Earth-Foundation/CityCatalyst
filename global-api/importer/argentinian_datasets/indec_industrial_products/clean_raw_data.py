import pandas as pd

# import data
df = pd.read_csv("./industrial_products_statistics.csv")

# Select rows where 'Unnamed: 4' is 'l'
condition = df["Unnamed: 4"] == "l"

# Update 'activity_name' and 'activity_units' columns
df.loc[condition, "activity_name"] = (
    df.loc[condition, "activity_name"] + " - " + df.loc[condition, "activity_value"]
)
df.loc[condition, "activity_value"] = df.loc[condition, "activity_units"]
df.loc[condition, "activity_units"] = "l"

# Select rows where 'Unnamed: 4' is 'l'
condition = df["Unnamed: 4"] == "square meters"

# Update 'activity_name' and 'activity_units' columns
df.loc[condition, "activity_name"] = (
    df.loc[condition, "activity_name"] + " - " + df.loc[condition, "activity_value"]
)
df.loc[condition, "activity_value"] = df.loc[condition, "activity_units"]
df.loc[condition, "activity_units"] = "square meters"

# Delete 'Unnamed: 4' column
df = df.drop(columns=["Unnamed: 4"])

# Rename units to standardized nomenclature
df["activity_units"] = df["activity_units"].replace(
    {"tonnes": "t", "cubic meters": "m3", "square meters": "m2"}
)

# Assign "GPC_refno" for the sub-sector without scope
# note: the scope is not assign because it depends of the city treatment process, e.g if the wastewater is treat in/outside the city
df["GPC_refno"] = "III.4"

# assign actor information
df["actor_id"] = "AR"
df["actor_name"] = "Argentina"

# delete 'Unnamed: 0' column
df = df.drop(columns=["Unnamed: 0"])

# Export the df as csv file
df.to_csv("./cleaned_industrial_products_statistics.csv")
