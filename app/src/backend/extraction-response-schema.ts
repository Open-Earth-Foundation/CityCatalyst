import { ACTIVITY_CLASSES } from "@/util/GHGI/activity-class-rules";

const nullable = (type: "string" | "number" | "integer") => ({
  type: [type, "null"],
});

/**
 * Row fields of the PDF extraction call. They mirror the `<output>` block of
 * the extraction prompt. Strict mode needs every property in `required` and
 * `additionalProperties: false`, so an optional field is typed as nullable.
 */
const ROW_PROPERTIES = {
  year: nullable("integer"),
  sector: nullable("string"),
  subsector: nullable("string"),
  category: nullable("string"),
  totalCO2e: nullable("number"),
  unit: nullable("string"),
  rowType: { type: "string", enum: ["line_item", "subtotal", "total"] },
  notationKey: nullable("string"),
  scope: nullable("string"),
  gpcRefNo: nullable("string"),
  refSource: { type: ["string", "null"], enum: ["document", "inferred", null] },
  activityClass: {
    type: ["string", "null"],
    enum: [...ACTIVITY_CLASSES, null],
  },
  directionEvidence: nullable("string"),
  co2: nullable("number"),
  ch4: nullable("number"),
  n2o: nullable("number"),
  source: nullable("string"),
  methodology: nullable("string"),
  activityAmount: nullable("number"),
  activityUnit: nullable("string"),
  activityType: nullable("string"),
  activityDataSource: nullable("string"),
  activityDataQuality: nullable("string"),
};

export const EXTRACTION_RESPONSE_SCHEMA: {
  name: "inventory_rows";
  schema: Record<string, unknown>;
} = {
  name: "inventory_rows",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["rows"],
    properties: {
      rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(ROW_PROPERTIES),
          properties: ROW_PROPERTIES,
        },
      },
    },
  },
};
