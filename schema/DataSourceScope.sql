CREATE TABLE "DataSourceScope"(
    "datasource_id" varchar(36),
    "scope_id" varchar(36),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id","scope_id")
    CONSTRAINT "FK_DataSourceScope.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
    CONSTRAINT "FK_DataSourceScope.activitydata_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id"),
);