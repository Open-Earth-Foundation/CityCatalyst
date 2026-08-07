import ConceptNoteWiringHarness from "@/components/ConceptNoteWiringHarness";

export default async function ConceptNoteWiringPage({
  params,
}: {
  params: Promise<{ lng: string; cityId: string }>;
}) {
  const { cityId } = await params;

  return <ConceptNoteWiringHarness cityId={cityId} />;
}
