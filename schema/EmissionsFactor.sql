CREATE TABLE "EmissionsFactor"(
    "emissions_factor_id" uuid,
    "emissions_factor" numeric,
    "emissions_factor_url" varchar(255),
    "units" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("emissions_factor_id")
);