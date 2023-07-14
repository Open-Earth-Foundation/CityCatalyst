CREATE TABLE "Publisher" (
  "publisher_id" uuid,
  "name" varchar(255),
  "URL" varchar(255),
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("publisher_id")
);