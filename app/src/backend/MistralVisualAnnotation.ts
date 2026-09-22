import { z } from "zod";

/** Production visual-annotation contract sent to and validated from Mistral. */
export const VISUAL_ANNOTATION_SCHEMA_VERSION =
  "citycatalyst.visual-annotation.1" as const;

const annotationKindSchema = z.enum([
  "chart",
  "diagram",
  "map",
  "photo",
  "logo",
  "illustration",
  "other",
]);

const valueKindSchema = z.enum([
  "printed",
  "approximate_visual",
  "unreadable",
]);

const chartPointSchema = z
  .object({
    x: z.union([z.string(), z.number(), z.null()]),
    y: z.union([z.number(), z.null()]),
    value_kind: valueKindSchema,
  })
  .strict();

const labeledValueSchema = z
  .object({
    label: z.union([z.string(), z.null()]),
    value: z.union([z.string(), z.number(), z.null()]),
    value_kind: valueKindSchema,
  })
  .strict();

const chartSchema = z
  .object({
    chart_type: z.union([z.string(), z.null()]),
    x_axis: z
      .object({
        label: z.union([z.string(), z.null()]),
        values: z.array(z.union([z.string(), z.number(), z.null()])),
      })
      .strict(),
    y_axis: z
      .object({
        label: z.union([z.string(), z.null()]),
        unit: z.union([z.string(), z.null()]),
        scale: z.union([z.string(), z.null()]),
      })
      .strict(),
    legend: z.array(z.string()),
    series: z.array(
      z
        .object({
          name: z.string(),
          points: z.array(chartPointSchema),
        })
        .strict(),
    ),
    trends: z.array(z.string()),
    targets: z.array(labeledValueSchema),
    callouts: z.array(z.string()),
    readable_values: z.array(
      z
        .object({
          label: z.string(),
          value: z.union([z.string(), z.number(), z.null()]),
          value_kind: valueKindSchema,
        })
        .strict(),
    ),
  })
  .strict();

export const visualAnnotationSchema = z
  .object({
    schema_version: z.literal(VISUAL_ANNOTATION_SCHEMA_VERSION),
    kind: annotationKindSchema,
    title: z.union([z.string(), z.null()]),
    short_description: z.string().min(1),
    text_visible: z.array(z.string()),
    chart: z.union([chartSchema, z.null()]),
    uncertainties: z.array(z.string()),
  })
  .strict();

export type VisualAnnotation = z.infer<typeof visualAnnotationSchema>;

export const VISUAL_ANNOTATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "kind",
    "title",
    "short_description",
    "text_visible",
    "chart",
    "uncertainties",
  ],
  properties: {
    schema_version: {
      type: "string",
      const: VISUAL_ANNOTATION_SCHEMA_VERSION,
    },
    kind: {
      type: "string",
      enum: [
        "chart",
        "diagram",
        "map",
        "photo",
        "logo",
        "illustration",
        "other",
      ],
    },
    title: { type: ["string", "null"] },
    short_description: { type: "string", minLength: 1 },
    text_visible: { type: "array", items: { type: "string" } },
    chart: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "chart_type",
            "x_axis",
            "y_axis",
            "legend",
            "series",
            "trends",
            "targets",
            "callouts",
            "readable_values",
          ],
          properties: {
            chart_type: { type: ["string", "null"] },
            x_axis: {
              type: "object",
              additionalProperties: false,
              required: ["label", "values"],
              properties: {
                label: { type: ["string", "null"] },
                values: {
                  type: "array",
                  items: { type: ["string", "number", "null"] },
                },
              },
            },
            y_axis: {
              type: "object",
              additionalProperties: false,
              required: ["label", "unit", "scale"],
              properties: {
                label: { type: ["string", "null"] },
                unit: { type: ["string", "null"] },
                scale: { type: ["string", "null"] },
              },
            },
            legend: { type: "array", items: { type: "string" } },
            series: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "points"],
                properties: {
                  name: { type: "string" },
                  points: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["x", "y", "value_kind"],
                      properties: {
                        x: { type: ["string", "number", "null"] },
                        y: { type: ["number", "null"] },
                        value_kind: {
                          type: "string",
                          enum: [
                            "printed",
                            "approximate_visual",
                            "unreadable",
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
            trends: { type: "array", items: { type: "string" } },
            targets: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "value", "value_kind"],
                properties: {
                  label: { type: ["string", "null"] },
                  value: { type: ["number", "string", "null"] },
                  value_kind: {
                    type: "string",
                    enum: ["printed", "approximate_visual", "unreadable"],
                  },
                },
              },
            },
            callouts: { type: "array", items: { type: "string" } },
            readable_values: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "value", "value_kind"],
                properties: {
                  label: { type: "string" },
                  value: { type: ["string", "number", "null"] },
                  value_kind: {
                    type: "string",
                    enum: ["printed", "approximate_visual", "unreadable"],
                  },
                },
              },
            },
          },
        },
      ],
    },
    uncertainties: { type: "array", items: { type: "string" } },
  },
} as const;

/** Mistral bbox annotation request. Omitted unless annotation was requested. */
export function bboxAnnotationFormat(): {
  type: "json_schema";
  json_schema: {
    name: "citycatalyst_visual_annotation";
    schema: typeof VISUAL_ANNOTATION_JSON_SCHEMA;
    strict: true;
  };
} {
  return {
    type: "json_schema",
    json_schema: {
      name: "citycatalyst_visual_annotation",
      schema: VISUAL_ANNOTATION_JSON_SCHEMA,
      strict: true,
    },
  };
}

export function parseVisualAnnotation(raw: unknown): VisualAnnotation | null {
  const candidate = unwrapAnnotation(raw);
  if (!candidate) return null;
  const parsed = visualAnnotationSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function unwrapAnnotation(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return raw ?? null;
}
