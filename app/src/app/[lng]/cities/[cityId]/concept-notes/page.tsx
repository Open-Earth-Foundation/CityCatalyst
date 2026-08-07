import { ConceptNoteDashboard } from "@/components/ConceptNoteDashboard";

export default async function ConceptNotesPage({
  params,
}: {
  params: Promise<{ cityId: string; lng: string }>;
}) {
  const { cityId, lng } = await params;

  return <ConceptNoteDashboard cityId={cityId} lng={lng} />;
}
