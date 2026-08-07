import { ConceptNoteWiringHarness } from "@/components/ConceptNoteWiringHarness";

export default async function ConceptNoteWiringPage({
  params,
  searchParams,
}: {
  params: Promise<{ lng: string; cityId: string }>;
  searchParams: Promise<{ runId?: string | string[] }>;
}) {
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
