CREATE TABLE "EmissionsFactor"(
    "emissions_factor_id" uuid,
    "emissions_factor" varchar(255),
    "emissions_factor_link" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("emissions_factor_id")
);