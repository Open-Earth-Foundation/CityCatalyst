CREATE TABLE "SubCategory"(
    "subcategory_id" uuid,
    "subcategory_name" varchar(255),
    "activity_name" varchar(255),
    "subsector_id" uuid,
    "scope_id" uuid,
    "reportinglevel_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("subcategory_id"),
    CONSTRAINT "FK_SubCategory.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
    CONSTRAINT "FK_SubCategory.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id"),
    CONSTRAINT "FK_SubCategory.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
);