CREATE TABLE "InventoryVersion" (
    "version_id" uuid,
    "version" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("version_id")
)