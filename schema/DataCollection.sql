CREATE TABLE "DataCollection"(
    "data_collection_description_id" uuid,
    "data_collection_description" varchar(255),
    "created" timestamp,
    "last_updated" timestamp,
    PRIMARY KEY("data_collection_description_id"),
);