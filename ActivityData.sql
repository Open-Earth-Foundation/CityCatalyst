CREATE TABLE "ActivityData"(
    "activitydata_id" varchar(36),
    "activitydata" varchar(255),
    "unit" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("activitydata_id"),
    CONSTRAINT "FK_ActivityData.subcategory_id"
        FOREIGN KEY("subcategory_id")
        REFERENCES "SubCategory" ("subcategory_id"),
    CONSTRAINT "FK_ActivityData.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id"),
     CONSTRAINT "FK_ActivityData.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
);