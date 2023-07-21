CREATE TABLE "SubSectorScope"(
    "subsector_id" uuid,
    "scope_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY ("subsector_id", "scope_id"),
    CONSTRAINT "FK_SubSectorScope.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
    CONSTRAINT "FK_SubSectorScope.scope_id"
        FOREIGN KEY("scope_id")
        REFERENCES "Scope" ("scope_id")
);