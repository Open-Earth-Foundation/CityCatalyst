import { z } from "zod";

export const structureChapterSchema = z
  .object({
    chapter_id: z.string().uuid(),
    template_section_id: z.string().nullable(),
    required: z.boolean(),
    title: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\r\n]/.test(value)),
    description: z.string().max(4000),
  })
  .strict();
export const structureSaveSchema = z
  .object({
    expected_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    chapters: z
      .array(structureChapterSchema)
      .min(1)
      .max(100)
      .refine(
        (items) =>
          new Set(items.map((item) => item.chapter_id)).size === items.length,
      ),
  })
  .strict();
export type StructureChapter = z.infer<typeof structureChapterSchema>;
export interface StructureState {
  fingerprint: string;
  chapters: StructureChapter[];
}
export interface StructureProposal {
  before: StructureState;
  after: StructureChapter[];
}
