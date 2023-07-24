CREATE TABLE "Methodology"(
    "methodology_id" uuid, /* Unique identifier for the methodology */
    "methodology" varchar(255), /* Description or name of methodology being used */
    "methodology_url" varchar(255), /* Link for human-readable methodology documentation */
    "datasource_id" uuid,
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("methodology_id"),
    CONSTRAINT "FK_Methodology.datasource_id"
      FOREIGN KEY ("datasource_id")
        REFERENCES "DataSource"("datasource_id")
);