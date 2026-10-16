"use client";

import { HighlightInit } from "@highlight-run/next/client";
import { usePathname } from "next/navigation";
import { isUnauthenticatedHighlightRoute } from "./route-gate";

interface HighlightInitGateProps {
  enabled: boolean;
  projectId: string;
  serviceName: string;
}

export default function HighlightInitGate({
  enabled,
  projectId,
  serviceName,
}: HighlightInitGateProps) {
  const pathname = usePathname();
  const isActive = enabled && !isUnauthenticatedHighlightRoute(pathname);

  return (
    <HighlightInit
      projectId={isActive ? projectId : ""}
      serviceName={serviceName}
      tracingOrigins={isActive}
      networkRecording={
        isActive
          ? {
              enabled: true,
              recordHeadersAndBody: true,
              urlBlocklist: [],
            }
          : {
              enabled: false,
              recordHeadersAndBody: false,
              urlBlocklist: [],
            }
      }
    />
  );
}
