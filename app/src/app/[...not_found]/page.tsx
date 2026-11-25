import { NotFoundPage } from "@/components/not-found-page";
import { fallbackLng, languages } from "@/i18n/settings";

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NotFound({
  params,
}: {
  params: Promise<{ not_found: string[] }>;
}) {
  const { not_found: pathSegments } = await params;
  const requestedLng = Array.isArray(pathSegments)
    ? pathSegments[0]
    : pathSegments;
  const lng = languages.includes(requestedLng) ? requestedLng : fallbackLng;

  return <NotFoundPage lng={lng} />;
}
