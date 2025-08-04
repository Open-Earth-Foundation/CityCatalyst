import HomePage from "@/components/GHGIHomePage/HomePage";

export default async function PublicHome(props: {
  params: Promise<{ lng: string }>;
}) {
  const { lng } = await props.params;

  return <HomePage lng={lng} isPublic={true} />;
}
