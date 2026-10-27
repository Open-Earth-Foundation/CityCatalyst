// Public dashboards are embedded in iframes on third-party sites — neither
// the cookie banner nor the chat launcher should render inside them.
const DASHBOARD_ROUTES = [
  "/public/dashboard",
  "/public/cities/[cityId]/dashboard",
] as const;

function matchesRoute(pathname: string, route: string) {
  const routePattern = route.replace(/\[.*?\]/g, "[^/]+");
  const regex = new RegExp(`^/[^/]+${routePattern}(/.*)?$`);
  return regex.test(pathname);
}

export function isDashboardRoute(pathname: string) {
  return DASHBOARD_ROUTES.some((route) => matchesRoute(pathname, route));
}

// Routes a visitor can land on without an authenticated session — same
// category as /auth/*, so widgets scoped to the logged-in app shouldn't
// mount there either.
export function isPreAuthRoute(pathname: string) {
  return (
    /^\/[^/]+\/auth(\/|$)/.test(pathname) ||
    /^\/[^/]+\/(organization|user)\/invites(\/|$)/.test(pathname) ||
    /^\/[^/]+\/authorize(\/|$)/.test(pathname)
  );
}

// Unauthenticated public pages (project/city dashboards, landing pages) —
// nothing under here has a concept of a logged-in user.
export function isPublicRoute(pathname: string) {
  return /^\/[^/]+\/public(\/|$)/.test(pathname);
}
