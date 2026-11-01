"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isUnauthenticatedHighlightRoute } from "./route-gate";

// Pulls in the Highlight (session replay/error tracking) SDK — load it
// lazily so auth/public routes, where it's never active, don't pay for
// that JS as part of the shared root layout bundle.
const HighlightInitGate = dynamic(() => import("./HighlightInitGate"), {
  ssr: false,
});
const HighlightIdentifier = dynamic(() => import("./HighlightIdentifier"), {
  ssr: false,
});

interface HighlightWidgetsProps {
  enabled: boolean;
  projectId: string;
  serviceName: string;
}

export default function HighlightWidgets({
  enabled,
  projectId,
  serviceName,
}: HighlightWidgetsProps) {
  const pathname = usePathname();

  if (!enabled || isUnauthenticatedHighlightRoute(pathname)) {
    return null;
  }

  return (
    <>
      <HighlightInitGate projectId={projectId} serviceName={serviceName} />
      <HighlightIdentifier />
    </>
  );
}
