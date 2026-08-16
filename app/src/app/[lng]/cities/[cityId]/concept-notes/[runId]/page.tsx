import { requireConceptNoteBuilderPageEnabled } from "@/backend/concept-note-page-guard";
import { ConceptNoteWorkspace } from "@/components/ConceptNoteWorkspace";

export default async function ConceptNoteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ cityId: string; lng: string; runId: string }>;
  searchParams: Promise<{ uploadId?: string | string[] }>;
}) {
  requireConceptNoteBuilderPageEnabled();

  const [{ cityId, lng, runId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const initialUploadId =
    typeof query.uploadId === "string" ? query.uploadId : undefined;

  return (
    <ConceptNoteWorkspace
      cityId={cityId}
      initialUploadId={initialUploadId}
      lng={lng}
      runId={runId}
    />
  );
}
