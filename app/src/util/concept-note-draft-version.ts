import type { ConceptNoteDraftState } from "@/util/types";

/** Track server-owned draft changes that can advance workspace readiness/revision. */
export function conceptNoteDraftVersion(draft?: ConceptNoteDraftState): string {
  return JSON.stringify([
    draft?.status,
    draft?.chapters?.map((chapter) => [
      chapter.chapter_id,
      chapter.position,
      chapter.required,
      chapter.revision_number,
      chapter.status,
      chapter.confirmed_revision_number,
      chapter.open_gap_count,
      chapter.caveat_count,
      chapter.validation?.status,
      chapter.validation?.is_stale,
      chapter.validation?.validated_revision_number,
      chapter.validation?.validated_at,
    ]),
  ]);
}
