import { redirect } from "next/navigation";
import { trackHref } from "../../../_lib/hrefs";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The adaptation wizard step "results" is gone: the ranking opens at once.
 * Old links land on the home (the ranking is already there); the previous step stays under
 * /adaptation/previous/.
 */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(`${trackHref(lng, city, "adaptation")}/`);
}
