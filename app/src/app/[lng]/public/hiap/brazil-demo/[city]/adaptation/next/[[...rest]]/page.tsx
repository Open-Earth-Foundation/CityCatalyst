import { redirect } from "next/navigation";
import { trackHref } from "../../../../_lib/hrefs";

/**
 * The proposal screens lived under `/adaptation/next/…` until they became
 * the adaptation track; links shared during the review still land on them.
 */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string; rest?: string[] }>;
}) {
  const { lng, city, rest } = await props.params;
  redirect(trackHref(lng, city, "adaptation", rest?.join("/")));
}
