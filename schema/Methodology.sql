CREATE TABLE "Methodology"(
    "methodology_id" uuid, /* Unique identifier for the methodology */
    "methodology" varchar(255), /* Description or name of methodology being used */
    "methodology_link" varchar(255), /* Link for human-readable methodology documentation */
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("methodology_id")
);