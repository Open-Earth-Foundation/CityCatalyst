"use client";

import { usePathname } from "next/navigation";

const DASHBOARD_ROUTES = [
  "/public/dashboard",
  "/public/cities/[cityId]/dashboard",
] as const;

interface IframeAwareWrapperProps {
  children: React.ReactNode;
}

export default function IframeAwareWrapper({ children }: IframeAwareWrapperProps) {
  const pathname = usePathname();

  const isDashboardRoute = DASHBOARD_ROUTES.some(route => {
    const routePattern = route.replace(/\[.*?\]/g, "[^/]+");
    const regex = new RegExp(`^/[^/]+${routePattern}(/.*)?$`);
    return regex.test(pathname);
  });

  if (isDashboardRoute) {
    return null;
  }

  return <>{children}</>;
}