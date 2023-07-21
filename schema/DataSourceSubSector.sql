CREATE TABLE "DataSourceSubSector"(
    "datasource_id" uuid,
    "subsector_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id","subsector_id")
    CONSTRAINT "FK_DataSourceSubSector.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
    CONSTRAINT "FK_DataSourceSubSector.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
);