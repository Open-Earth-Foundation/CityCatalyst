import { redirect } from "next/navigation";
import { previousHref } from "../../../../_lib/hrefs";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** The ranking lives on the module home now; old links still land there. */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(previousHref(lng, city));
}
