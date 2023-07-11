CREATE TABLE "SubSector"(
    "subsector_id" varchar(36),
    "subsector_name" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("subsector_id"),
    CONSTRAINT "FK_SubSector.sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id")    
);