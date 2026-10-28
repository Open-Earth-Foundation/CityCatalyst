import { redirect } from "next/navigation";
import { trackHref } from "../../../_lib/hrefs";

/**
 * The adaptation wizard step "preflight" is gone: the ranking opens at once.
 * Old links land on the home with the preferences panel open; the previous step stays under
 * /adaptation/previous/.
 */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(`${trackHref(lng, city, "adaptation")}/?panel=open`);
}
