import { createHash } from "node:crypto";
import {
  IngestItemError,
  type IngestReviewDraftEnvelope,
  type IngestReviewTargetBinding,
} from "./types";

/** Idle lock window. Heartbeat on GET/PATCH; steal after this. */
export const REVIEW_LOCK_MS = 5 * 60 * 1000;

/** Confirm after this returns stale_review_draft; the user re-opens the draft. */
export const REVIEW_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type {
  IngestReviewDecision,
  IngestReviewDecisionStatus,
  IngestReviewDraftEnvelope,
  IngestReviewTargetBinding,
} from "./types";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => stableStringify(entry)).join(",");
    return "[" + items + "]";
  }
  const record = value as Record<string, unknown>;
  const properties = Object.keys(record)
    .sort()
    .map((key) => JSON.stringify(key) + ":" + stableStringify(record[key]))
    .join(",");
  return "{" + properties + "}";
}

export function bundleDigestOf(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isReviewLockActive(
  lockedAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!lockedAt) return false;
  return now - lockedAt.getTime() < REVIEW_LOCK_MS;
}

export function parseReviewDraft(
  value: unknown,
): IngestReviewDraftEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const draft = value as Partial<IngestReviewDraftEnvelope>;
  if (
    typeof draft.version !== "number" ||
    typeof draft.bundleDigest !== "string" ||
    typeof draft.sourceContentHash !== "string" ||
    typeof draft.expiresAt !== "string" ||
    !draft.targetBinding ||
    typeof draft.targetBinding !== "object" ||
    !draft.decision ||
    typeof draft.decision !== "object"
  ) {
    return null;
  }
  return draft as IngestReviewDraftEnvelope;
}

export function requireReviewDraft(
  value: unknown,
): IngestReviewDraftEnvelope {
  const draft = parseReviewDraft(value);
  if (!draft) {
    throw new IngestItemError(
      "stale_review_draft",
      "No stored review draft on this item",
    );
  }
  return draft;
}

export function sameTargetBinding(
  left: IngestReviewTargetBinding,
  right: IngestReviewTargetBinding,
): boolean {
  return (
    (left.cityId ?? null) === (right.cityId ?? null) &&
    (left.inventoryId ?? null) === (right.inventoryId ?? null)
  );
}

export function buildReviewDraftEnvelope(input: {
  payload: unknown;
  sourceContentHash: string;
  targetBinding: IngestReviewTargetBinding;
  version?: number;
  now?: Date;
}): IngestReviewDraftEnvelope {
  const payload = cloneJson(input.payload);
  const now = input.now ?? new Date();
  return {
    version: input.version ?? 1,
    bundleDigest: bundleDigestOf(payload),
    sourceContentHash: input.sourceContentHash,
    targetBinding: {
      cityId: input.targetBinding.cityId ?? null,
      inventoryId: input.targetBinding.inventoryId ?? null,
    },
    expiresAt: new Date(now.getTime() + REVIEW_DRAFT_TTL_MS).toISOString(),
    decision: { status: "pending", userId: null, at: null },
    payload,
  };
}
