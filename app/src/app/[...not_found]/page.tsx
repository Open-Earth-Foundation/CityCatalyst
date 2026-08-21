import { NotFoundPage } from "@/components/not-found-page";
import { fallbackLng, languages } from "@/i18n/settings";

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
