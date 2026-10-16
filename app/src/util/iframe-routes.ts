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
