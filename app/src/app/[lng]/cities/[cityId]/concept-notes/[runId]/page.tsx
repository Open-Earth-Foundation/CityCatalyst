import { requireConceptNoteBuilderPageEnabled } from "@/backend/concept-note-page-guard";
import { ConceptNoteWorkspace } from "@/components/ConceptNoteWorkspace";

export default async function ConceptNoteWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ cityId: string; lng: string; runId: string }>;
  searchParams: Promise<{
    chapterId?: string | string[];
    findingKey?: string | string[];
    uploadId?: string | string[];
  }>;
}) {
  requireConceptNoteBuilderPageEnabled();

  const [{ cityId, lng, runId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const initialUploadId =
    typeof query.uploadId === "string" ? query.uploadId : undefined;
  const initialReviewChapterId =
    typeof query.chapterId === "string" ? query.chapterId : undefined;
  const initialReviewFindingKey =
    initialReviewChapterId && typeof query.findingKey === "string"
      ? query.findingKey
      : undefined;

  return (
    <ConceptNoteWorkspace
      cityId={cityId}
      initialReviewChapterId={initialReviewChapterId}
      initialReviewFindingKey={initialReviewFindingKey}
      initialUploadId={initialUploadId}
      lng={lng}
      runId={runId}
    />
  );
}
