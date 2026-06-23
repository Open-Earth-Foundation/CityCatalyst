import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validate as isValidUuid } from "uuid";
import { languages } from "@/i18n/settings";
import { resolveLegacyInventoryRedirectPath } from "@/util/ghgi-routes";

/** Second path segments under `/{lng}/` that are not legacy inventory IDs. */
const RESERVED_LNG_CHILD_SEGMENTS = new Set([
  "cities",
  "admin",
  "auth",
  "organization",
  "public",
  "user",
  "authorize",
  "methodologies",
  "GHGI",
]);

type LegacyInventoryPath = {
  lng: string;
  inventoryId: string;
};

/** Parse `/{lng}/{inventoryId}/...` when the second segment is a UUID inventory id. */
export function parseLegacyInventoryPath(pathname: string): LegacyInventoryPath | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  const [lng, inventoryId] = segments;
  if (!languages.includes(lng)) {
    return null;
  }
  if (RESERVED_LNG_CHILD_SEGMENTS.has(inventoryId)) {
    return null;
  }
  if (!isValidUuid(inventoryId)) {
    return null;
  }

  return { lng, inventoryId };
}

/**
 * Redirect legacy private inventory URLs to city-scoped GHGI routes.
 * Returns null when the path is not legacy or cityId cannot be resolved.
 */
export async function maybeRedirectLegacyInventoryUrl(
  req: NextRequest,
): Promise<NextResponse | null> {
  const legacyPath = parseLegacyInventoryPath(req.nextUrl.pathname);
  if (!legacyPath) {
    return null;
  }

  const { lng, inventoryId } = legacyPath;
  const inventoryApiUrl = new URL(
    `/api/v1/inventory/${inventoryId}`,
    req.nextUrl.origin,
  );

  let response: Response;
  try {
    response = await fetch(inventoryApiUrl, {
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: { data?: { cityId?: string; city?: { cityId?: string } } };
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  const cityId = payload.data?.cityId ?? payload.data?.city?.cityId;
  if (!cityId) {
    return null;
  }

  const targetPath = resolveLegacyInventoryRedirectPath(
    lng,
    cityId,
    inventoryId,
    req.nextUrl.pathname,
  );
  const targetUrl = new URL(targetPath, req.url);
  targetUrl.search = req.nextUrl.search;

  return NextResponse.redirect(targetUrl);
}
