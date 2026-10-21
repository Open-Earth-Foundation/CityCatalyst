import { notFound } from "next/navigation";
import { CITIES } from "../_lib/cities";

/** Only the five demo cities exist; any other slug is a 404, not Sobral. */
export default async function CityLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; city: string }>;
}) {
  const { city } = await props.params;
  if (!CITIES.some((c) => c.slug === city)) notFound();
  return props.children;
}
