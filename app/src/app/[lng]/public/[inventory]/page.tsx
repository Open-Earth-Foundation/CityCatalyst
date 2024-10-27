import HomePage from "@/components/HomePage/HomePage";

export default function PublicHome({
  params: { lng },
}: {
  params: { lng: string };
}) {
  return <HomePage lng={lng} isPublic={true} />;
}
