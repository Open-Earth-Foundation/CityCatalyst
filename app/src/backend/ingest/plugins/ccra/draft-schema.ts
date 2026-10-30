import { z } from "zod";

/**
 * CRVA v0 draft fields. IDs follow the CRVA Guideline Requirements doc.
 * Ratings stay out until C40 confirms the scale.
 */
export const CRVA_FIELD_GROUPS = {
  context: {
    "A1.1": "Boundary description",
    "A1.2a": "Data sources with year",
    "A2.1a": "Location in country",
    "A2.1b": "Geographical features and natural resources",
  },
  systems: {
    "A2.4a": "Key sectors and urban systems",
    "A2.5a": "Vulnerable groups",
  },
  hazards: {
    "B1.2a": "Current significant hazards",
  },
  impacts: {
    "C1.1a": "Current impact per hazard and vulnerable group",
    "C1.2a": "Current impact per hazard and sector",
  },
  capacity: {
    "D1.1a": "Enabling factors per category",
    "D1.2a": "Inhibiting factors per category",
  },
  risks: {
    "E1.1a": "Key risks",
  },
} as const;

export type CrvaFieldGroup = keyof typeof CRVA_FIELD_GROUPS;

export const CRVA_FIELD_LABELS: Record<string, string> = Object.assign(
  {},
  ...Object.values(CRVA_FIELD_GROUPS),
);

export const CRVA_FIELD_IDS = Object.keys(CRVA_FIELD_LABELS);

export const CRVA_CAPACITY_CATEGORIES = [
  "physical_environmental",
  "socio_economic",
  "governmental",
  "service",
] as const;

const text = z.string().trim().min(1);

const NamedItemSchema = z.object({ name: text, description: text });

const CapacityFactorSchema = z.object({
  category: z.enum(CRVA_CAPACITY_CATEGORIES),
  factor: text,
  description: text,
});

export const CrvaSourceSchema = z.object({
  file: text,
  page: z.number().int().positive(),
  quote: text,
});

const base = {
  source: CrvaSourceSchema,
  origin: z.literal("ai_draft"),
  confirmed: z.literal(false),
};

const field = <Id extends string, Value extends z.ZodTypeAny>(
  fieldId: Id,
  value: Value,
) => z.object({ fieldId: z.literal(fieldId), value, ...base });

export const CrvaDraftValueSchema = z.discriminatedUnion("fieldId", [
  field("A1.1", text),
  field("A1.2a", z.object({ name: text, year: z.number().int().nullable() })),
  field("A2.1a", text),
  field("A2.1b", NamedItemSchema),
  field("A2.4a", NamedItemSchema),
  field("A2.5a", NamedItemSchema),
  field("B1.2a", NamedItemSchema),
  field("C1.1a", z.object({ hazard: text, group: text, description: text })),
  field("C1.2a", z.object({ hazard: text, sector: text, description: text })),
  field("D1.1a", CapacityFactorSchema),
  field("D1.2a", CapacityFactorSchema),
  field(
    "E1.1a",
    z.object({
      title: text,
      description: text,
      hazards: z.array(text),
      affected: z.array(text),
    }),
  ),
]);

export type CrvaDraftValue = z.infer<typeof CrvaDraftValueSchema>;
export type CrvaFieldId = CrvaDraftValue["fieldId"];

export const CRVA_DROP_REASONS = [
  "invalid_value",
  "quote_too_short",
  "quote_not_on_page",
] as const;

export const CrvaDroppedValueSchema = z.object({
  fieldId: z.string(),
  page: z.number().nullable(),
  quote: z.string().nullable(),
  reason: z.enum(CRVA_DROP_REASONS),
});

export type CrvaDroppedValue = z.infer<typeof CrvaDroppedValueSchema>;

/** Figures, maps and charts go to human review and are never read as data. */
export const CrvaFigureSchema = z.object({
  page: z.number().int().positive(),
  imageId: z.string(),
  caption: z.string().nullable(),
});

export type CrvaFigure = z.infer<typeof CrvaFigureSchema>;

export const CrvaDraftBundleSchema = z.object({
  file: text,
  pageCount: z.number().int().positive(),
  ocrModel: z.string(),
  extractionModel: z.string(),
  values: z.array(CrvaDraftValueSchema),
  uncoveredFields: z.array(z.string()),
  figures: z.array(CrvaFigureSchema),
  dropped: z.array(CrvaDroppedValueSchema),
});

export type CrvaDraftBundle = z.infer<typeof CrvaDraftBundleSchema>;
