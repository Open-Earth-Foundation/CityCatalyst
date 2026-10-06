import { redirect } from "next/navigation";
import { trackHref } from "../_lib/hrefs";

/** A city on its own opens on the adaptation track. */
export default async function CityPage(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(trackHref(lng, city, "adaptation"));
}
