/**
 * Relative Global API links the MEED finance proxy is allowed to follow.
 *
 * Feasibility rows link to their own detail under `/api/v1/cities/`, but to
 * opportunities and projects under `/api/v1/climate-finance/`.
 */
const ALLOWED_PREFIXES = ["/api/v1/cities/", "/api/v1/climate-finance/"];

/**
 * Normalise a relative link and check it against the allow-list. Returns the
 * encoded `pathname + search` to request, or `null` when the link is absolute,
 * escapes the allowed prefixes (`..`), or points anywhere else.
 */
export function resolveFinanceLink(link: string): string | null {
  if (!link.startsWith("/") || link.startsWith("//") || link.includes("\\")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(link, "http://global-api.invalid");
  } catch {
    return null;
  }
  if (url.host !== "global-api.invalid") return null;
  if (!ALLOWED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return null;
  }
  return `${url.pathname}${url.search}`;
}
