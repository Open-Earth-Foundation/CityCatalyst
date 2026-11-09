import { notFound } from "next/navigation";
import { CITIES } from "../_lib/cities";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** Only the five demo cities exist; any other slug is a 404, not Sobral. */
export default async function CityLayout(props: {
  children: React.ReactNode;
  params: Promise<{ lng: string; city: string }>;
}) {
  const { city } = await props.params;
  if (!CITIES.some((c) => c.slug === city)) notFound();
  return props.children;
}
