/* linking users to cities
*
* users and cities can be a many-to-many relationship
*/

CREATE TABLE "CityUser" (
  "city_user_id" uuid,
  "user_id" uuid,
  "city_id" uuid,
  "created" timestamp,
  "last_updated" timestamp,
  PRIMARY KEY ("city_user_id")
  CONSTRAINT "FK_CityUser.user_id"
    FOREIGN KEY ("user_id")
      REFERENCES "User.user_id",
  CONSTRAINT "FK_CityUser.city_id"
    FOREIGN KEY ("city_id")
      REFERENCES "City.city_id"
);