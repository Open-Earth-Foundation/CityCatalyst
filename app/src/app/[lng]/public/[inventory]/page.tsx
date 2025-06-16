import HomePage from "@/components/HomePage/HomePage";

export default async function PublicHome(
  props: {
    params: Promise<{ lng: string }>;
  }
) {
  const params = await props.params;

  const {
    lng
  } = params;

  return <HomePage lng={lng} isPublic={true} />;
}
