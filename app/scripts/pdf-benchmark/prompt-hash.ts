import { createHash } from "node:crypto";
import { SYSTEM_PROMPT } from "@/backend/InventoryExtractionService";

/** First 12 hex characters of the SHA-256 of the static extraction prompt. */
export function promptHash(): string {
  return createHash("sha256").update(SYSTEM_PROMPT).digest("hex").slice(0, 12);
}
