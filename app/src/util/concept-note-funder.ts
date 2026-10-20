import Decimal from "decimal.js";
import { z } from "zod";

const funderText = (max: number) =>
  z.string().max(max, `funder-error-length-${max}`).nullable();
const name = (message: string) =>
  z.string().trim().min(1, message).max(255, "funder-error-length-255");
const funderAward = z
  .number({ invalid_type_error: "funder-error-award" })
  .finite("funder-error-award")
  .nonnegative("funder-error-award")
  .lt(1e16, "funder-error-award-limit")
  .refine(
    (amount) => new Decimal(amount).decimalPlaces() <= 2,
    "funder-error-award",
  )
  .nullable();

export const conceptNoteTemplateFields = z
  .object({
    template_name: name("funder-error-template-name"),
    output_format: funderText(64),
    chapter_schema: z
      .array(
        z
          .object({
            // Empty for new chapters; the server derives one from the title.
            chapter_ref: z.string().max(255),
            title: name("funder-error-chapter-title").regex(
              /^[^\r\n]*$/,
              "funder-error-chapter-title-line",
            ),
            description: funderText(4000),
            required: z.boolean(),
            required_fields: z.array(z.string()),
          })
          .strict(),
      )
      .min(1, "funder-error-chapters")
      .max(100, "funder-error-chapter-limit"),
  })
  .strict();

export const conceptNoteCustomTemplateRequest = z
  .object({
    template: conceptNoteTemplateFields,
    import_id: z.string().uuid().nullable(),
  })
  .strict();

/** Reviewed funder, programme and template to add to the CNB catalogue. */
export const conceptNoteFunderCreateRequest = z
  .object({
    funder: z
      .object({
        name: name("funder-error-funder-name"),
        funder_type: funderText(100),
        country: funderText(100),
        region: funderText(255),
        profile: z
          .object({
            stated: z.record(z.string(), z.string()),
            derived: z.record(z.string(), z.string()),
          })
          .strict(),
      })
      .strict(),
    opportunity: z
      .object({
        name: name("funder-error-programme-name"),
        applicant_type: funderText(255),
        category: funderText(255),
        sector: funderText(255),
        hazards: z.array(z.string()),
        interventions: z.array(z.string()),
        finance_route: funderText(255),
        instrument_type: funderText(255),
        region_scope: funderText(255),
        min_award: funderAward,
        max_award: funderAward,
        currency: funderText(16),
        status: funderText(64),
        summary: z.string().nullable(),
        known_gaps: z.array(z.string()),
      })
      .strict()
      .refine(
        (value) =>
          value.min_award === null ||
          value.max_award === null ||
          value.min_award <= value.max_award,
        { message: "funder-error-award-range", path: ["max_award"] },
      ),
    template: conceptNoteTemplateFields,
    import_id: z.string().uuid().nullable(),
  })
  .strict();
