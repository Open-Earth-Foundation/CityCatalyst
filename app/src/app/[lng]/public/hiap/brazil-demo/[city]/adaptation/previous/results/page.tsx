import { redirect } from "next/navigation";
import { previousHref } from "../../../../_lib/hrefs";

/** The ranking lives on the module home now; old links still land there. */
export default async function Page(props: {
  params: Promise<{ lng: string; city: string }>;
}) {
  const { lng, city } = await props.params;
  redirect(previousHref(lng, city));
}
