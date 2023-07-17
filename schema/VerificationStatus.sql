CREATE TABLE "VerificationStatus" (
    "verification_status_id" uuid,
    "verification_status" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("verification_status_id"),
)