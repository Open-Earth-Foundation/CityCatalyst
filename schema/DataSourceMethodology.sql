CREATE TABLE "DataSourceMethodology"(
    "datasource_id" uuid,
    "methodology_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id", "methodology_id"),
    CONSTRAINT "FK_DataSourceMethodology.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
    CONSTRAINT "FK_DataSourceMethodology.methodology_id"
        FOREIGN KEY("methodology_id")
        REFERENCES "Methodology" ("methodology_id")
);