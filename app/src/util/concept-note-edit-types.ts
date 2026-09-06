import { z } from "zod";

export const editScopeSchema = z
  .object({
    kind: z.literal("auto").default("auto"),
    focused_chapter_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const editProposalRequestSchema = z
  .object({
    instruction: z
      .string()
      .min(1)
      .max(8_000)
      .refine((value) => value.trim().length > 0),
    scope: editScopeSchema,
    idempotency_key: z.string().uuid(),
    refines_proposal_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const editApplyRequestSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    expected_revisions: z
      .record(z.string().uuid(), z.number().int().positive())
      .refine(
        (value) =>
          Object.keys(value).length > 0 && Object.keys(value).length <= 100,
      ),
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
export type EditProposalRequest = z.infer<typeof editProposalRequestSchema>;
export type EditApplyRequest = z.infer<typeof editApplyRequestSchema>;
export const editHistoryRequestSchema = z
  .object({
    idempotency_key: z.string().uuid(),
    expected_revisions: z
      .record(z.string().uuid(), z.number().int().positive())
      .refine(
        (value) =>
          Object.keys(value).length > 0 && Object.keys(value).length <= 100,
      ),
  })
  .strict();
export type EditHistoryRequest = z.infer<typeof editHistoryRequestSchema>;
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
  source_snapshots?: Array<{
    upload_id: string;
    source_label: string;
    sha256: string;
  }>;
}

export interface EditApplicationResult {
  application_id: string;
  accepted_change_ids: string[];
  revisions: Record<string, number>;
}

export interface EditProposal {
  proposal_id: string;
  run_id: string;
  instruction: string;
  scope: EditScope;
  status: EditStatus;
  base_revisions: Record<string, number>;
  changes: EditChange[];
  clarification: string | null;
  error_code: string | null;
  result: EditApplicationResult | null;
  created_at: string;
  updated_at: string;
}

export interface EditHistoryEntry {
  application_id: string;
  run_id: string;
  proposal_id: string | null;
  restores_application_id: string | null;
  sequence: number;
  operation: "apply" | "undo" | "restore";
  before_revisions: Record<string, number>;
  after_revisions: Record<string, number>;
  accepted_change_ids: string[];
  created_at: string;
  chapters: Array<{
    chapter_id: string;
    chapter_title: string;
    before: string;
    after: string;
  }>;
}
