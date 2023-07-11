CREATE TABLE "User" (
  "user_id" varchar(36),
  "name" varchar(255),
  "email" varchar(255),
  "password" varchar(255),
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("user_id")
);