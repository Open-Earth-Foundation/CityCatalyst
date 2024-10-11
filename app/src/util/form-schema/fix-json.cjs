const hierarchy = require("./manual-input-hierarchy.json");

// call this script using:
// node fix-json.cjs > manual-input-hierarchy-fixed.json

Object.entries(hierarchy).forEach(([key, value]) => {
  value.methodologies = value.methodologies.map((methodology) => {
    methodology.activities = methodology.activities?.map((activity) => {
      activity["extra-fields"] = activity["extra-fields"]?.map((field) => {
        field["title"] = field["id"];
        field["id"] = field["id"].split("-").slice(-2).join("-");
        return field;
      });
      return activity;
    });
    return methodology;
  });
});

console.log(JSON.stringify(hierarchy, null, 2));
