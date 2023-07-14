CREATE TABLE "SubSector"(
    "subsector_id" uuid,
    "subsector_name" varchar(255),
    "sector_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("subsector_id"),
    CONSTRAINT "FK_SubSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")
);