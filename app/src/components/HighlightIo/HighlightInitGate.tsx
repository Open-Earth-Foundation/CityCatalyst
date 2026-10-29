"use client";

import { HighlightInit } from "@highlight-run/next/client";

interface HighlightInitGateProps {
  projectId: string;
  serviceName: string;
}

// Only ever rendered by HighlightWidgets once it has already decided
// Highlight should be active — no enabled/route gating here.
export default function HighlightInitGate({
  projectId,
  serviceName,
}: HighlightInitGateProps) {
  return (
    <HighlightInit
      projectId={projectId}
      serviceName={serviceName}
      tracingOrigins
      networkRecording={{
        enabled: true,
        recordHeadersAndBody: true,
        urlBlocklist: [],
      }}
    />
  );
}
