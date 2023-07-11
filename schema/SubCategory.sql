CREATE TABLE "SubCategory"(
    "subcategory_id" varchar(36),
    "subcategory_name" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("subcategory_id"),
    CONSTRAINT "FK_SubCategory.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id")
);