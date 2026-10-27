import { isPreAuthRoute, isPublicRoute } from "@/util/iframe-routes";

// Highlight (session replay/error tracking) is only useful for the
// authenticated app — pre-auth flows and public (unauthenticated) routes
// shouldn't initialize or identify against it.
export function isUnauthenticatedHighlightRoute(pathname: string) {
  return isPreAuthRoute(pathname) || isPublicRoute(pathname);
}
