import { z } from "zod";
import type { StructureProposal } from "@/util/concept-note-structure";

const automaticEditScopeSchema = z
  .object({
    kind: z.literal("auto").default("auto"),
    focused_chapter_id: z.string().uuid().nullable().optional(),
    chapter_id: z.null().optional(),
    base_revision: z.null().optional(),
    start: z.null().optional(),
    end: z.null().optional(),
    selected_markdown: z.null().optional(),
  })
  .strict();

export const selectionEditScopeSchema = z
  .object({
    kind: z.literal("selection"),
    focused_chapter_id: z.string().uuid().nullable().optional(),
    chapter_id: z.string().uuid(),
    base_revision: z.number().int().positive(),
    start: z.number().int().min(0).max(50_000),
    end: z.number().int().min(1).max(50_000),
    selected_markdown: z.string().min(1).max(24_000),
  })
  .strict()
  .refine(
    (scope) =>
      scope.end > scope.start &&
      scope.end - scope.start === Array.from(scope.selected_markdown).length &&
      Array.from(scope.selected_markdown).length <= 12_000 &&
      scope.selected_markdown.trim().length > 0,
    "Selection offsets must match the exact Unicode codepoint interval",
  );

export const editScopeSchema = z.union([
  automaticEditScopeSchema,
  selectionEditScopeSchema,
]);
export const selectionFormattingSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    font: z.enum(["default", "serif", "mono"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.bold !== undefined ||
      value.italic !== undefined ||
      value.font !== undefined,
  );

/** Climate Advisor rejects longer edit instructions; chat messages are instructions. */
export const EDIT_INSTRUCTION_MAX_CHARS = 8_000;

export const editProposalRequestSchema = z
  .object({
    instruction: z
      .string()
      .min(1)
      .max(EDIT_INSTRUCTION_MAX_CHARS)
      .refine((value) => value.trim().length > 0),
    scope: editScopeSchema,
    idempotency_key: z.string().uuid(),
    refines_proposal_id: z.string().uuid().nullable().optional(),
    formatting: selectionFormattingSchema.optional(),
  })
  .strict()
  .refine(
    (request) => !request.formatting || request.scope.kind === "selection",
    "Formatting requires selection scope",
  );

export const editApplyRequestSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    expected_revisions: z
      .record(z.string().uuid(), z.number().int().positive())
      .refine((value) => Object.keys(value).length <= 100),
    selected_change_ids: z
      .array(z.string().uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length)
      .nullable()
      .optional(),
  })
  .strict();

export type EditScope = z.infer<typeof editScopeSchema>;
export type SelectionFormatting = z.infer<typeof selectionFormattingSchema>;
export type EditProposalRequest = z.infer<typeof editProposalRequestSchema>;
export type EditApplyRequest = z.infer<typeof editApplyRequestSchema>;
export type EditStatus =
  | "processing"
  | "clarification_required"
  | "proposed"
  | "applied"
  | "partially_applied"
  | "rejected"
  | "failed"
  | "stale";

export interface EditChange {
  change_id: string;
  chapter_id: string;
  chapter_title: string;
  base_revision: number;
  start: number;
  before: string;
  after: string;
  kind: "wording" | "factual";
  group_id: string;
  source_refs: string[];
  user_input_quote: string | null;
  context_refs?: EditContextSection[];
  source_snapshots?: Array<{
    upload_id: string;
    source_label: string;
    sha256: string;
  }>;
  context_snapshots?: Array<{
    section: EditContextSection;
    label: string;
    sha256: string;
  }>;
}

export type EditContextSection =
  "city" | "project" | "ghgi" | "ccra" | "hiap" | "manual_population";

export interface EditApplicationResult {
  application_id: string;
  accepted_change_ids: string[];
  revisions: Record<string, number>;
}

export interface EditProposal {
  structure?: StructureProposal | null;
  proposal_id: string;
  run_id: string;
  instruction: string;
  scope: EditScope;
  selection_window?: { start: number; end: number } | null;
  status: EditStatus;
  base_revisions: Record<string, number>;
  changes: EditChange[];
  notices?: Array<{
    code: "protected_markers" | "locked_chapters" | "template_headings";
    count: number;
  }>;
  clarification: string | null;
  error_code: string | null;
  result: EditApplicationResult | null;
  created_at: string;
  updated_at: string;
}
