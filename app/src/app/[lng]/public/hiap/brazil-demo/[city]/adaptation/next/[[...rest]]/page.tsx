import { redirect } from "next/navigation";
import { trackHref } from "../../../../_lib/hrefs";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The proposal screens lived under `/adaptation/next/…` until they became
 * the adaptation track; links shared during the review still land on them,
 * with their filters.
 */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string; rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lng, city, rest } = await props.params;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(await props.searchParams)) {
    for (const value of Array.isArray(v) ? v : v ? [v] : []) {
      search.append(k, value);
    }
  }
  const qs = search.toString();
  const path = trackHref(lng, city, "adaptation", rest?.join("/"));
  redirect(qs ? `${path}/?${qs}` : path);
}
