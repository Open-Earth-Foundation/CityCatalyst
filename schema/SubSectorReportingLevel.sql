CREATE TABLE "SubSectorReportingLevel"(
    "subsector_id" uuid,
    "reportinglevel_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY ("subsector_id", "reportinglevel_id"),
    CONSTRAINT "FK_SubSectorReportingLevel.subsector_id"
        FOREIGN KEY("subsector_id")
        REFERENCES "SubSector" ("subsector_id"),
    CONSTRAINT "FK_SubSectorReportingLevel.reportinglevel_id"
        FOREIGN KEY("reportinglevel_id")
        REFERENCES "ReportingLevel" ("reportinglevel_id")
);