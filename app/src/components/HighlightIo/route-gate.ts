// Highlight (session replay/error tracking) is only useful for the
// authenticated app — auth and public (unauthenticated) routes shouldn't
// initialize or identify against it.
export function isUnauthenticatedHighlightRoute(pathname: string) {
  return /^\/[^/]+\/(auth|public)(\/|$)/.test(pathname);
}
