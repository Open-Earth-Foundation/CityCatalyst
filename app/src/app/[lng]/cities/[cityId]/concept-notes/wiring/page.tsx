import { ConceptNoteWiringHarness } from "@/components/ConceptNoteWiringHarness";
import { requireConceptNoteBuilderPageEnabled } from "@/backend/concept-note-page-guard";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ConceptNoteWiringPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string; cityId: string }>;
  searchParams: Promise<{ runId?: string | string[] }>;
}) {
  await requireConceptNoteBuilderPageEnabled();

  const [{ cityId, lng }, query] = await Promise.all([params, searchParams]);
  const initialRunId =
    typeof query.runId === "string" ? query.runId : undefined;

  return (
    <ConceptNoteWiringHarness
      cityId={cityId}
      initialRunId={initialRunId}
      lng={lng}
    />
  );
}
