import { ConceptNoteDashboard } from "@/components/ConceptNoteDashboard";
import { requireConceptNoteBuilderPageEnabled } from "@/backend/concept-note-page-guard";

export default async function ConceptNotesPage({
  params,
}: {
  params: Promise<{ cityId: string; lng: string }>;
}) {
  requireConceptNoteBuilderPageEnabled();

  const { cityId, lng } = await params;

  return <ConceptNoteDashboard cityId={cityId} lng={lng} />;
}
