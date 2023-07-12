CREATE TABLE "DataSourceGHGs"(
    "datasource_id" varchar(36),
    "ghg_id" varchar(36),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id", "ghg_id"),
    CONSTRAINT "FK_DataSourceGHGs.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id")
    CONSTRAINT "FK_DataSourceGHGs.ghg_id"
        FOREIGN KEY("ghg_id")
        REFERENCES "GHGs" ("ghg_id")
);