import { redirect } from "next/navigation";
import { previousHref } from "../../../_lib/hrefs";

/**
 * The adaptation wizard step "results" belongs to the previous version (the
 * ranking now opens at once, with preferences in a side panel). Old links
 * land on the archived step.
 */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(previousHref(lng, city, "results"));
}
