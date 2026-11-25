import { ConceptNoteDashboard } from "@/components/ConceptNoteDashboard";
import { requireConceptNoteBuilderPageEnabled } from "@/backend/concept-note-page-guard";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function ConceptNotesPage({
  params,
}: {
  params: Promise<{ cityId: string; lng: string }>;
}) {
  await requireConceptNoteBuilderPageEnabled();

  const { cityId, lng } = await params;

  return <ConceptNoteDashboard cityId={cityId} lng={lng} />;
}
