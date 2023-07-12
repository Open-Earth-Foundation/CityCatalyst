CREATE TABLE "DataSourceActivityData"(
    "datasource_id" varchar(36),
    "activitydata_id" varchar(36),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("datasource_id","activitydata_id")
    CONSTRAINT "FK_DataSourceActivityData.datasource_id"
        FOREIGN KEY("datasource_id")
        REFERENCES "DataSource" ("datasource_id"),
    CONSTRAINT "FK_DataSourceActivityData.activitydata_id"
        FOREIGN KEY("activitydata_id")
        REFERENCES "ActivityData" ("activitydata_id"),
);