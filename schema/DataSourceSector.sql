CREATE TABLE "DataSourceSector"(
    "datasource_id" uuid,
    "sector_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id", "sector_id"),
    CONSTRAINT "FK_DataSourceSector_datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
    CONSTRAINT "FK_DataSourceSector_sector_id"
        FOREIGN KEY("sector_id")
        REFERENCES "Sector" ("sector_id"),
);